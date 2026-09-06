import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model, ModelsStore, ModelsStoreEntry, ModelsStoreOperationOptions } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { BUNDLED_CONNECTIONS } from "./bundled-connections";
import { writePrivate } from "./bundled-store";

const modelData = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	provider: z.string(),
	api: z.string(),
	baseUrl: z.string(),
	reasoning: z.boolean(),
	input: z.array(z.enum(["text", "image"])),
	contextWindow: z.number().positive(),
	maxTokens: z.number().positive(),
	cost: z.object({
		input: z.number().nonnegative(),
		output: z.number().nonnegative(),
		cacheRead: z.number().nonnegative(),
		cacheWrite: z.number().nonnegative(),
	}),
	thinkingLevelMap: z
		.object({
			off: z.string().nullable().optional(),
			minimal: z.string().nullable().optional(),
			low: z.string().nullable().optional(),
			medium: z.string().nullable().optional(),
			high: z.string().nullable().optional(),
			xhigh: z.string().nullable().optional(),
			max: z.string().nullable().optional(),
		})
		.optional(),
});
const catalogData = z.object({
	models: z.array(z.unknown()),
	checkedAt: z.number().optional(),
	lastModified: z.number().optional(),
	etag: z.string().optional(),
});
const PROVIDERS = [...new Set(BUNDLED_CONNECTIONS.map((connection) => connection.provider))];

/** Only model data crosses this boundary. Endpoints, headers, compatibility and auth remain pinned code. */
export class BundledCatalog implements ModelsStore {
	private readonly baseline = new Map<string, readonly Model<Api>[]>();
	private readonly memory = new Map<string, ModelsStoreEntry>();
	private pending: Promise<void> | undefined;
	private nextRefresh = 0;
	private connections = "";
	private controller: AbortController | undefined;
	constructor(
		private readonly directory: string,
		private readonly persist = writePrivate,
	) {}

	private compatible(provider: string, values: readonly unknown[]): Model<Api>[] {
		const baseline = this.baseline.get(provider) ?? [];
		return values.flatMap((value) => {
			const parsed = modelData.safeParse(value);
			if (!parsed.success || parsed.data.provider !== provider || !parsed.data.input.includes("image")) return [];
			const data = parsed.data;
			const template =
				baseline.find(
					(model) => model.id === data.id && model.api === data.api && model.baseUrl === data.baseUrl,
				) ?? baseline.find((model) => model.api === data.api && model.baseUrl === data.baseUrl);
			if (!template) return [];
			const unchanged = baseline.find((model) => model === value);
			if (unchanged) return [unchanged];
			const { thinkingLevelMap, ...fields } = data;
			const { thinkingLevelMap: _previousThinking, ...request } = template;
			const thinking: NonNullable<Model<Api>["thinkingLevelMap"]> = {};
			for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const) {
				const mapped = thinkingLevelMap?.[level];
				if (mapped !== undefined) thinking[level] = mapped;
			}
			return [
				{
					...request,
					...fields,
					api: template.api,
					...(thinkingLevelMap === undefined ? {} : { thinkingLevelMap: thinking }),
				},
			];
		});
	}
	install(runtime: ModelRuntime): void {
		for (const id of PROVIDERS) {
			const provider = runtime.getProvider(id);
			if (!provider) continue;
			const baseline = provider.getModels();
			this.baseline.set(id, baseline);
			runtime.registerNativeProvider({
				...provider,
				getModels: () => {
					const merged = new Map(
						baseline.filter((model) => model.input.includes("image")).map((model) => [model.id, model]),
					);
					for (const model of this.compatible(id, provider.getModels())) merged.set(model.id, model);
					return [...merged.values()];
				},
			});
		}
	}
	async read(provider: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
		options?.signal?.throwIfAborted();
		try {
			const data = catalogData.parse(
				JSON.parse(readFileSync(join(this.directory, `models-${provider}.json`), "utf8")),
			);
			const entry = {
				models: this.compatible(provider, data.models),
				...(data.checkedAt === undefined ? {} : { checkedAt: data.checkedAt }),
				...(data.lastModified === undefined ? {} : { lastModified: data.lastModified }),
				...(data.etag === undefined ? {} : { etag: data.etag }),
			};
			this.memory.set(provider, entry);
			return entry;
		} catch {
			return this.memory.get(provider);
		}
	}
	async write(provider: string, entry: ModelsStoreEntry, options?: ModelsStoreOperationOptions): Promise<void> {
		options?.signal?.throwIfAborted();
		const previous = this.memory.get(provider);
		const safe =
			previous?.lastModified && (!entry.lastModified || entry.lastModified < previous.lastModified)
				? { ...previous, ...(entry.checkedAt === undefined ? {} : { checkedAt: entry.checkedAt }) }
				: { ...entry, models: this.compatible(provider, entry.models) };
		this.persist(join(this.directory, `models-${provider}.json`), JSON.stringify(safe));
		this.memory.set(provider, safe);
	}
	async delete(provider: string, options?: ModelsStoreOperationOptions): Promise<void> {
		await this.write(provider, { models: [] }, options);
	}
	async restore(runtime: ModelRuntime): Promise<void> {
		await runtime.refresh({ providers: PROVIDERS, allowNetwork: false });
	}
	/** One bounded background revalidation per four hours; failures retry after one minute. */
	refresh(runtime: ModelRuntime, timeoutMs = 4_000): Promise<void> {
		if (this.pending) return this.pending;
		this.controller = new AbortController();
		const controller = this.controller;
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		this.pending = runtime
			.listCredentials({ signal: controller.signal })
			.then(async (connections) => {
				const allowed = connections.filter((connection) =>
					BUNDLED_CONNECTIONS.some(
						(entry) => entry.provider === connection.providerId && entry.method === connection.type,
					),
				);
				const signature = JSON.stringify(allowed);
				if (signature === this.connections && Date.now() < this.nextRefresh) return;
				this.connections = signature;
				const result = await runtime.refresh({
					providers: allowed.map((connection) => connection.providerId),
					allowNetwork: true,
					signal: controller.signal,
				});
				this.nextRefresh = Date.now() + (result.aborted || result.errors.size ? 60_000 : 4 * 60 * 60_000);
			})
			.catch(() => {
				this.nextRefresh = Date.now() + 60_000;
			})
			.finally(() => {
				clearTimeout(timeout);
				this.pending = undefined;
				this.controller = undefined;
			});
		return this.pending;
	}
	close(): void {
		this.controller?.abort();
	}
}
