import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import type { StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
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
import type { AgentEvent, AgentRecovery } from "./agent-events";
import type { AgentOffer } from "./agent-offer";
import { providerRecovery, retryAfterReset } from "./agent-recovery";
import { BundledAuth } from "./bundled-auth";
import { BundledCatalog } from "./bundled-catalog";
import { BundledCommandPolicy, BundledCommandTurn } from "./bundled-commands";
import { BUNDLED_CONNECTIONS, connectionLabel } from "./bundled-connections";
import { BundledFilePolicy, BundledFileTurn, inside } from "./bundled-files";
import { bundledChatGPTOAuth } from "./bundled-oauth";
import type { BundledReply, BundledRequest } from "./bundled-protocol";
import { BundledQuestionTurn } from "./bundled-questions";
import { prepareRelocation, relocationPath } from "./bundled-relocation";
import { bundledResources } from "./bundled-resources";
import { BundledCredentialStore, privateDirectory, writePrivate } from "./bundled-store";
import type { SourceAgentClient } from "./source-agent";

interface HeldSession {
	root: string;
	manager: SessionManager;
	session: AgentSession;
	files: BundledFileTurn;
	commands: BundledCommandTurn;
	questions: BundledQuestionTurn;
	idle?: ReturnType<typeof setTimeout>;
}

/** Lives only in the host. Tests may supply a deterministic native provider runtime. */
export class BundledRuntime {
	public source: ((turn: string) => SourceAgentClient) | undefined;
	private readonly auth: BundledAuth;
	private readonly sessions = new Map<string, HeldSession>();
	private readonly active = new Map<string, { session: string; stopped: boolean }>();
	private readonly policies = new Map<string, BundledFilePolicy>();
	private readonly commandPolicies = new Map<string, BundledCommandPolicy>();
	private readonly reserved = new Set<string>();
	private readonly renames = new Map<string, { root: string; target: string; sessions: readonly string[] }>();
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
		privateDirectory(join(directory, "recovery"));
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
		const chatGPT = models.getProvider("openai-codex");
		if (!chatGPT) throw new Error("The bundled ChatGPT provider is missing");
		models.registerNativeProvider({ ...chatGPT, auth: { ...chatGPT.auth, oauth: await bundledChatGPTOAuth() } });
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
		if (
			[...this.renames.values()].some(
				(rename) => rename.sessions.includes(id) || rename.root === root || rename.target === root,
			)
		)
			throw new Error("Project rename is in progress");
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
			case "rename-prepare": {
				const ids = request.sessions.map((session) => session.id);
				for (const id of ids) {
					if (this.reserved.has(id)) throw new Error("Let the agent finish before renaming this project");
					const manager = this.manager(request.root, id);
					if (this.sessions.has(id)) this.save(manager);
				}
				const token = prepareRelocation(this.directory, request.root, request.target, ids);
				this.renames.set(token, { root: request.root, target: request.target, sessions: ids });
				for (const id of ids) {
					const held = this.sessions.get(id);
					if (!held) continue;
					clearTimeout(held.idle);
					held.session.dispose();
					this.sessions.delete(id);
				}
				return token;
			}
			case "rename-finish": {
				const rename = this.renames.get(request.token);
				if (!rename) return null;
				if (request.committed)
					for (const id of rename.sessions) {
						this.policies.get(id)?.relocate(rename.target);
						const grants = this.commandPolicies.get(id)?.grants;
						if (grants) {
							const moved = [...grants].map((scope) =>
								inside(scope, rename.root) ? join(rename.target, relative(rename.root, scope)) : scope,
							);
							grants.clear();
							for (const scope of moved) grants.add(scope);
						}
					}
				this.renames.delete(request.token);
				try {
					rmSync(relocationPath(this.directory, request.token), { force: true });
				} catch {
					/* An unused staging file does not affect the committed conversation. */
				}
				return null;
			}
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
			case "answer": {
				const held = this.sessions.get(this.active.get(request.turn)?.session ?? "");
				return (
					held?.questions.answer(request.request, request.reply) ||
					held?.files.answer(request.request, request.reply) ||
					held?.commands.answer(request.request, request.reply) ||
					false
				);
			}
			case "permissions": {
				const held = this.sessions.get(this.active.get(request.turn)?.session ?? "");
				if (!held) throw new Error("Turn is not ready");
				held.files.apply(request.mode);
				held.commands.apply(request.mode);
				return request.mode;
			}
			case "stop": {
				const active = this.active.get(request.turn);
				if (active !== undefined) {
					active.stopped = true;
					this.sessions.get(active.session)?.files.stop();
					this.sessions.get(active.session)?.commands.stop();
					this.sessions.get(active.session)?.questions.stop();
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
		let streamBefore: StreamFn | undefined;
		let responseRecovery: AgentRecovery | undefined;
		let saveError: unknown;
		let ending: "done" | "failed" | "stopped" = "done";
		let reason: string | null = null;
		let recovery: AgentRecovery | null | undefined;
		let account = "Selected account";
		let selectedOffer = options.ask.value;
		let entered = false;
		let beforeUsers = 0;
		let providerActive = false;
		let said = options.said;
		const recoveryPath = join(this.directory, "recovery", `${ref}.json`);
		try {
			this.path(ref);
			const userCount = this.manager(options.root, ref)
				.buildSessionContext()
				.messages.filter((message) => message.role === "user").length;
			beforeUsers = userCount;
			if (options.recovery !== undefined) {
				const pending = existsSync(recoveryPath) ? JSON.parse(readFileSync(recoveryPath, "utf8")) : null;
				if (pending?.token !== options.recovery || pending.root !== options.root) {
					recovery = null;
					throw new Error("This recovery has already been continued");
				}
				said = pending.said;
				beforeUsers = pending.beforeUsers ?? userCount;
				entered = pending.entered === true || userCount > beforeUsers;
			} else if (existsSync(recoveryPath)) {
				throw new Error("Continue the pending request before sending another message");
			}
			const offer = await this.offer({ ...options, ask: options.ask });
			selectedOffer = offer.current.value ?? undefined;
			account =
				offer.models.find((entry) => entry.value === selectedOffer)?.connection ??
				BUNDLED_CONNECTIONS.find((connection) =>
					selectedOffer?.startsWith(`spool/${connection.provider}/${connection.method}/`),
				)?.label ??
				"Selected account";
			const model = (await this.available()).find((candidate) => candidate.value === offer.current.value)?.model;
			if (model === undefined) {
				recovery = { kind: "login", account, scope: "account", ...(selectedOffer ? { offer: selectedOffer } : {}) };
				throw new Error("Connect an account and choose an available model");
			}
			held = this.sessions.get(ref);
			if (held?.idle !== undefined) clearTimeout(held.idle);
			if (held === undefined) {
				const manager = this.manager(options.root, ref);
				this.save(manager);
				const policy = this.policies.get(ref) ?? new BundledFilePolicy(options.root, this.directory);
				this.policies.set(ref, policy);
				const files = new BundledFileTurn(policy, options.permissions, emit);
				const commandPolicy = this.commandPolicies.get(ref) ?? new BundledCommandPolicy(policy);
				this.commandPolicies.set(ref, commandPolicy);
				const commands = new BundledCommandTurn(commandPolicy, options.permissions, emit);
				const questions = new BundledQuestionTurn(emit);
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
					tools: ["read", "write", "edit", "bash", "ask_person"],
					customTools: [...files.tools(), commands.tool(), questions.tool()],
					thinkingLevel: (offer.current.effort ?? "off") as ThinkingLevel,
				});
				held = { root: options.root, session, manager, files, commands, questions };
				this.sessions.set(ref, held);
			} else {
				held.files.begin(options.permissions, emit);
				held.commands.begin(options.permissions, emit);
				held.questions.begin(emit);
				await held.session.setModel(model);
				held.session.setThinkingLevel((offer.current.effort ?? "off") as ThinkingLevel);
			}
			held.files.source = this.source?.(id);
			const session = held.session;
			const manager = held.manager;
			streamBefore = session.agent.streamFunction;
			const stream = streamBefore;
			session.agent.streamFunction = (model, context, settings) => {
				responseRecovery = undefined;
				return stream(model, context, {
					...settings,
					fetch: async (input, init) => {
						const response = await (settings?.fetch ?? globalThis.fetch)(input, init);
						if (!response.ok) {
							// Read only the failed response clone. The SDK still owns and consumes its body.
							// In particular, Codex otherwise rounds resets_at into a prose minute estimate.
							try {
								responseRecovery = providerRecovery(
									`${response.status} ${await response.clone().text()}`,
									account,
									selectedOffer,
								);
							} catch {
								responseRecovery = providerRecovery(String(response.status), account, selectedOffer);
							}
							const reset = retryAfterReset(response.headers.get("retry-after"), Date.now());
							if (
								responseRecovery?.kind === "limit" &&
								responseRecovery.resetsAt === undefined &&
								reset !== undefined
							)
								responseRecovery = { ...responseRecovery, resetsAt: reset };
						}
						return response;
					},
				});
			};
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
					if (event.message.role === "user") entered = true;
					if (event.message.role === "assistant") {
						for (const block of event.message.stopReason === "error" ? [] : event.message.content)
							if (block.type === "text") emit({ kind: "said", text: block.text, parent: null });
						if (event.message.stopReason === "aborted") ending = "stopped";
						if (event.message.stopReason === "error") {
							ending = "failed";
							recovery =
								responseRecovery ?? providerRecovery(event.message.errorMessage ?? "", account, selectedOffer);
							event.message.errorMessage =
								recovery?.kind === "login"
									? `Sign in to ${account} to continue.`
									: recovery?.kind === "limit"
										? `${account} rate limit reached.`
										: "The provider request failed. Check your connection and try again.";
							event.message.diagnostics = [];
							event.message.content = [];
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
				capabilities: ["read", "write", "edit", "bash", "ask_person"],
				parent: null,
			});
			emit({ kind: "waiting", parent: null });
			if (running.stopped) ending = "stopped";
			else if (options.recovery !== undefined && entered) {
				// pi's retry does this too: retain completed tool results and omit failed assistant messages.
				const messages = session.agent.state.messages.filter(
					(message) => message.role !== "assistant" || message.stopReason !== "error",
				);
				const last = messages.at(-1);
				if (!last || last.role === "assistant") throw new Error("There is no pending model request to continue");
				session.agent.state.messages = messages;
				providerActive = true;
				await session.agent.continue();
			} else {
				providerActive = true;
				await session.prompt(
					said
						.map(
							(message, index) =>
								`${said.length > 1 ? `Message ${index + 1}:\n` : ""}${message.selection ? `${message.selection}\n\n` : ""}${message.prompt}`,
						)
						.join("\n\n"),
					{
						expandPromptTemplates: false,
						images: said.flatMap((message) =>
							(message.attachments ?? []).map((attachment) => ({
								type: "image" as const,
								mimeType: attachment.media,
								data: attachment.data,
							})),
						),
					},
				);
			}
			if (running.stopped) ending = "stopped";
			if (saveError !== undefined) throw new Error("Could not save this bundled conversation", { cause: saveError });
			this.save(manager);
			if (ending === "done" || ending === "stopped") rmSync(recoveryPath, { force: true });
		} catch (error) {
			ending = running.stopped ? "stopped" : "failed";
			const words = error instanceof Error ? error.message : "Bundled turn failed";
			if (recovery === undefined) recovery = responseRecovery ?? providerRecovery(words, account, selectedOffer);
			reason =
				recovery?.kind === "login"
					? `Sign in to ${account} to continue.`
					: recovery?.kind === "limit"
						? `${account} rate limit reached.`
						: providerActive
							? "The provider request failed. Check your connection and try again."
							: words;
		} finally {
			held?.files.stop();
			held?.commands.stop();
			held?.questions.stop();
			if (held && streamBefore) held.session.agent.streamFunction = streamBefore;
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
			if (recovery != null && ending === "failed") {
				const token = options.recovery ?? randomUUID();
				try {
					this.persist(recoveryPath, JSON.stringify({ root: options.root, token, said, entered, beforeUsers }));
					recovery = { ...recovery, token };
				} catch {
					recovery = undefined;
					reason = "Could not save the pending request";
				}
			}
			emit({
				kind: "ended",
				ending,
				reason,
				stopReason: reason,
				...(recovery !== undefined ? { recovery } : {}),
				parent: null,
			});
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
			held.commands.stop();
			held.questions.stop();
			await held.session.abort();
			this.save(held.manager);
			held.session.dispose();
		}
		this.sessions.clear();
		this.policies.clear();
		for (const policy of this.commandPolicies.values()) policy.close();
		this.commandPolicies.clear();
	}
}
