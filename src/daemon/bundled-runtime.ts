import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	createAgentSession,
	ModelRuntime,
	parseSessionEntries,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EngineOfferOptions, EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import type { AgentOffer } from "./agent-offer";
import { BundledAuth } from "./bundled-auth";
import { BundledCatalog } from "./bundled-catalog";
import { BUNDLED_CONNECTIONS, connectionLabel } from "./bundled-connections";
import { BundledFilePolicy, BundledFileTurn } from "./bundled-files";
import type { BundledReply, BundledRequest } from "./bundled-protocol";
import { bundledResources } from "./bundled-resources";
import { BundledCredentialStore, privateDirectory, writePrivate } from "./bundled-store";

interface HeldSession {
	root: string;
	manager: SessionManager;
	session: AgentSession;
	files: BundledFileTurn;
	idle?: ReturnType<typeof setTimeout>;
}

/** Lives only in the host. Tests may supply a deterministic native provider runtime. */
export class BundledRuntime {
	private readonly auth: BundledAuth;
	private readonly sessions = new Map<string, HeldSession>();
	private readonly active = new Map<string, { session: string; stopped: boolean }>();
	private readonly policies = new Map<string, BundledFilePolicy>();
	private readonly reserved = new Set<string>();
	constructor(
		readonly directory: string,
		readonly credentials: BundledCredentialStore,
		readonly models: ModelRuntime,
		private readonly persist = writePrivate,
		private readonly idleMs = 60_000,
		private readonly catalog?: BundledCatalog,
	) {
		privateDirectory(join(directory, "sessions"));
		privateDirectory(join(directory, "offers"));
		this.auth = new BundledAuth(models, credentials);
		const anthropic = models.getProvider("anthropic");
		if (anthropic?.auth.apiKey)
			models.registerNativeProvider({ ...anthropic, auth: { apiKey: anthropic.auth.apiKey } });
	}
	static async create(directory: string): Promise<BundledRuntime> {
		const credentials = new BundledCredentialStore(directory);
		const catalog = new BundledCatalog(directory);
		const models = await ModelRuntime.create({
			credentials,
			modelsStore: catalog,
			modelsPath: null,
			refreshOnCreate: false,
			allowModelNetwork: false,
		});
		catalog.install(models);
		await catalog.restore(models);
		return new BundledRuntime(directory, credentials, models, writePrivate, 60_000, catalog);
	}
	private path(id: string): string {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
			throw new Error("Invalid bundled session reference");
		return join(this.directory, "sessions", `${id}.jsonl`);
	}
	private manager(root: string, id: string): SessionManager {
		const held = this.sessions.get(id);
		if (held !== undefined) {
			if (held.root !== root) throw new Error("Session belongs to another project");
			return held.manager;
		}
		const path = this.path(id);
		if (!existsSync(path)) return SessionManager.inMemory(root, { id });
		const entries = parseSessionEntries(readFileSync(path, "utf8"));
		const header = entries[0];
		if (header?.type !== "session" || header.id !== id || header.cwd !== root)
			throw new Error("Saved bundled session is invalid");
		return SessionManager.inMemory(root, { id }, entries);
	}
	private save(manager: SessionManager): void {
		this.persist(
			this.path(manager.getSessionId()),
			`${[manager.getHeader(), ...manager.getEntries()].map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		);
	}
	private async available() {
		const connections = await this.credentials.list();
		return connections.flatMap((connection) =>
			BUNDLED_CONNECTIONS.some((item) => item.provider === connection.providerId && item.method === connection.type)
				? this.models
						.getModels(connection.providerId)
						.filter((model) => model.input.includes("image"))
						.map((model) => ({
							model,
							value: `spool/${connection.providerId}/${connection.type}/${model.id}`,
							connection: connectionLabel(connection.providerId, connection.type),
						}))
				: [],
		);
	}
	async offer(options: Omit<EngineOfferOptions, "signal">): Promise<AgentOffer> {
		void this.catalog?.refresh(this.models);
		const models = await this.available();
		const saved = this.manager(options.root, options.session.id).buildSessionContext();
		const choicePath = join(this.directory, "offers", `${options.session.id}.json`);
		const previous: { value?: string; effort?: string; name?: string; resolved?: string } = {};
		if (existsSync(choicePath)) {
			const data: unknown = JSON.parse(readFileSync(choicePath, "utf8"));
			if (typeof data === "object" && data !== null) {
				if ("value" in data && typeof data.value === "string") previous.value = data.value;
				if ("effort" in data && typeof data.effort === "string") previous.effort = data.effort;
				if ("name" in data && typeof data.name === "string") previous.name = data.name;
				if ("resolved" in data && typeof data.resolved === "string") previous.resolved = data.resolved;
			}
		}
		if (options.choose?.value !== undefined && !models.some((entry) => entry.value === options.choose?.value))
			throw new Error("That model is not available through this connection");
		const wanted = options.choose?.value ?? options.ask.value ?? previous.value;
		const current =
			wanted === undefined
				? (models.find((entry) => entry.model.id === "gpt-6-astra") ?? models[0])
				: models.find((entry) => entry.value === wanted);
		const levels = current?.model.reasoning
			? getSupportedThinkingLevels(current.model).filter((level) => level !== "off")
			: [];
		const effort = options.choose?.effort ?? options.ask.effort ?? previous.effort ?? saved.thinkingLevel;
		const chosenEffort =
			current === undefined
				? (previous.effort ?? null)
				: (levels.find((level) => level === effort) ??
					levels.find((level) => level === "medium") ??
					levels[0] ??
					null);
		const value = current?.value ?? wanted ?? null;
		if (value !== null) {
			const next = {
				value,
				...((current?.model.name ?? previous.name) ? { name: current?.model.name ?? previous.name } : {}),
				...((current?.model.id ?? previous.resolved) ? { resolved: current?.model.id ?? previous.resolved } : {}),
				...(chosenEffort === null ? {} : { effort: chosenEffort }),
			};
			if (
				next.value !== previous.value ||
				next.name !== previous.name ||
				next.resolved !== previous.resolved ||
				next.effort !== previous.effort
			)
				this.persist(choicePath, JSON.stringify(next));
		}
		return {
			models: models.map(({ model, value, connection }) => ({
				value,
				resolvedModel: model.id,
				displayName: model.name,
				description: `Uses your ${connection} connection.`,
				connection,
				supportsEffort: model.reasoning,
				supportedEffortLevels: model.reasoning
					? getSupportedThinkingLevels(model).filter((level) => level !== "off")
					: [],
			})),
			current: {
				value,
				resolved: current?.model.id ?? previous.resolved ?? null,
				name: current?.model.name ?? previous.name ?? null,
				effort: chosenEffort,
				pin: null,
			},
		};
	}
	async request(request: BundledRequest): Promise<BundledReply> {
		switch (request.kind) {
			case "account": {
				const connections = (await this.credentials.list())
					.filter((connection) =>
						BUNDLED_CONNECTIONS.some(
							(item) => item.provider === connection.providerId && item.method === connection.type,
						),
					)
					.map((connection) => ({
						provider: connection.providerId,
						method: connection.type,
						label: connectionLabel(connection.providerId, connection.type),
					}));
				return {
					signedIn: connections.length > 0,
					account: connections.map((connection) => connection.label).join(", ") || null,
					connections,
				};
			}
			case "login":
				return this.auth.start(request.provider, request.method);
			case "login-poll":
				return this.auth.poll(request.id);
			case "login-input":
				return this.auth.input(request.id, request.value, request.revision);
			case "login-cancel":
				this.auth.cancel(request.id);
				return null;
			case "connect":
				if (
					!BUNDLED_CONNECTIONS.some((item) => item.provider === request.provider && item.method === "api_key") ||
					!request.key.trim() ||
					request.key.length > 16_384
				)
					throw new Error("Enter an API key");
				this.credentials.invalidate(request.provider);
				await this.credentials.modify(request.provider, async () => ({ type: "api_key", key: request.key.trim() }));
				return null;
			case "disconnect":
				await this.auth.logout(request.provider);
				return null;
			case "offer":
				return this.offer(request.options);
			case "answer":
				return (
					this.sessions
						.get(this.active.get(request.turn)?.session ?? "")
						?.files.answer(request.request, request.reply) ?? false
				);
			case "permissions": {
				const held = this.sessions.get(this.active.get(request.turn)?.session ?? "");
				if (!held) throw new Error("Turn is not ready");
				held.files.apply(request.mode);
				return request.mode;
			}
			case "stop": {
				const active = this.active.get(request.turn);
				if (active !== undefined) {
					active.stopped = true;
					this.sessions.get(active.session)?.files.stop();
					await this.sessions.get(active.session)?.session.abort();
				}
				return null;
			}
			case "close":
				await this.close();
				return null;
			case "turn":
				throw new Error("Turns require an event channel");
		}
	}
	async turn(id: string, options: EngineTurnOptions, emit: (event: AgentEvent) => void): Promise<void> {
		const ref = options.session.id;
		if (this.reserved.has(ref)) throw new Error("This thread already has an active turn");
		this.reserved.add(ref);
		const running = { session: ref, stopped: false };
		this.active.set(id, running);
		let held: HeldSession | undefined;
		let unsubscribe: (() => void) | undefined;
		let saveError: unknown;
		let ending: "done" | "failed" | "stopped" = "done";
		let reason: string | null = null;
		try {
			const offer = await this.offer({ ...options, ask: options.ask });
			const model = (await this.available()).find((candidate) => candidate.value === offer.current.value)?.model;
			if (model === undefined) throw new Error("Connect an account and choose an available model");
			held = this.sessions.get(ref);
			if (held?.idle !== undefined) clearTimeout(held.idle);
			if (held === undefined) {
				const manager = this.manager(options.root, ref);
				this.save(manager);
				const policy = this.policies.get(ref) ?? new BundledFilePolicy(options.root, this.directory);
				this.policies.set(ref, policy);
				const files = new BundledFileTurn(policy, options.permissions, emit);
				const { session } = await createAgentSession({
					cwd: options.root,
					agentDir: this.directory,
					modelRuntime: this.models,
					model,
					sessionManager: manager,
					resourceLoader: bundledResources(options.root, policy),
					settingsManager: SettingsManager.inMemory({
						compaction: { enabled: false },
						retry: { enabled: false, provider: { maxRetries: 0 } },
						images: { autoResize: false },
					}),
					noTools: "builtin",
					tools: ["read", "write", "edit"],
					customTools: files.tools(),
					thinkingLevel: (offer.current.effort ?? "off") as ThinkingLevel,
				});
				held = { root: options.root, session, manager, files };
				this.sessions.set(ref, held);
			} else {
				held.files.begin(options.permissions, emit);
				await held.session.setModel(model);
				held.session.setThinkingLevel((offer.current.effort ?? "off") as ThinkingLevel);
			}
			const session = held.session;
			const manager = held.manager;
			this.save(manager);
			unsubscribe = session.subscribe((event) => {
				if (event.type === "message_start" && event.message.role === "assistant")
					emit({ kind: "speaking", message: null, model: model.id, parent: null });
				if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta")
					emit({
						kind: "say",
						block: event.assistantMessageEvent.contentIndex,
						text: event.assistantMessageEvent.delta,
						parent: null,
					});
				if (event.type === "message_end") {
					if (event.message.role === "assistant") {
						for (const block of event.message.content)
							if (block.type === "text") emit({ kind: "said", text: block.text, parent: null });
						if (event.message.stopReason === "aborted") ending = "stopped";
						if (event.message.stopReason === "error") {
							ending = "failed";
							event.message.errorMessage = "The provider request failed. Check your connection and try again.";
							reason = event.message.errorMessage;
						}
					}
					// pi notifies subscribers just before appending this message to its manager.
					queueMicrotask(() => {
						try {
							this.save(manager);
						} catch (error) {
							saveError = error;
							void session.abort();
						}
					});
				}
			});
			emit({
				kind: "ready",
				session: ref,
				model: model.id,
				cwd: options.root,
				version: "0.85.1",
				permissionMode: options.permissions,
				apiKeySource: "spool",
				capabilities: ["read", "write", "edit"],
				parent: null,
			});
			emit({ kind: "waiting", parent: null });
			if (running.stopped) ending = "stopped";
			else
				await session.prompt(
					options.said
						.map(
							(message, index) =>
								`${options.said.length > 1 ? `Message ${index + 1}:\n` : ""}${message.selection ? `${message.selection}\n\n` : ""}${message.prompt}`,
						)
						.join("\n\n"),
					{
						expandPromptTemplates: false,
						images: options.said.flatMap((message) =>
							message.attachment === undefined
								? []
								: [
										{
											type: "image" as const,
											mimeType: message.attachment.media,
											data: message.attachment.data,
										},
									],
						),
					},
				);
			if (running.stopped) ending = "stopped";
			if (saveError !== undefined) throw new Error("Could not save this bundled conversation", { cause: saveError });
			this.save(manager);
		} catch (error) {
			ending = running.stopped ? "stopped" : "failed";
			reason = error instanceof Error ? error.message : "Bundled turn failed";
		} finally {
			held?.files.stop();
			unsubscribe?.();
			this.active.delete(id);
			this.reserved.delete(ref);
			if (held !== undefined) {
				const idle = held;
				idle.idle = setTimeout(() => {
					try {
						this.save(idle.manager);
						idle.session.dispose();
						this.sessions.delete(ref);
					} catch {
						/* Keep the unsaved session alive; the next turn reports a retry failure. */
					}
				}, this.idleMs);
				idle.idle.unref();
			}
			emit({ kind: "ended", ending, reason, stopReason: reason, parent: null });
			emit({
				kind: "closed",
				code: ending === "failed" ? 1 : 0,
				...(reason === null ? {} : { message: reason }),
				parent: null,
			});
		}
	}
	async close(): Promise<void> {
		this.catalog?.close();
		this.auth.close();
		for (const active of this.active.values()) active.stopped = true;
		for (const held of this.sessions.values()) {
			if (held.idle !== undefined) clearTimeout(held.idle);
			held.files.stop();
			await held.session.abort();
			this.save(held.manager);
			held.session.dispose();
		}
		this.sessions.clear();
		this.policies.clear();
	}
}
