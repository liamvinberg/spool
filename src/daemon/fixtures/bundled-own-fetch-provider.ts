import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { deterministicBundledRuntime } from "./bundled-provider";

/** Mirrors the Google adapters: any fetch the adapter did not install is refused before the request. */
export async function ownFetchRuntime(directory: string) {
	const wrapped: { provider: string; fetched: boolean }[] = [];
	const runtime = await deterministicBundledRuntime(directory);
	const raw = runtime.models.getRegisteredProviderConfig("openai")?.streamSimple;
	if (!raw) throw new Error("Missing deterministic inference");
	const models = runtime.models.getModels("openai");
	runtime.models.registerProvider("openai", {
		api: "openai-responses",
		models: [...models],
		streamSimple: (model, context, options) => {
			wrapped.push({ provider: model.provider, fetched: options?.fetch !== undefined });
			return raw(model, context, options);
		},
	});
	runtime.models.registerProvider("google", {
		api: "google-generative-ai",
		models: models.map((model) => ({
			...model,
			id: "gemini-test",
			name: "Gemini test model",
			api: "google-generative-ai" as const,
			baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		})),
		streamSimple: (model, _context, options) => {
			wrapped.push({ provider: model.provider, fetched: options?.fetch !== undefined });
			if (options?.fetch && options.fetch !== globalThis.fetch)
				throw new Error("Custom fetch is not supported by the Google Generative AI adapter");
			const stream = createAssistantMessageEventStream();
			const message: AssistantMessage = {
				role: "assistant",
				content: [{ type: "text", text: "Gemini replied." }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				stopReason: "stop",
				timestamp: Date.now(),
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};
			queueMicrotask(() => {
				stream.push({ type: "start", partial: message });
				stream.push({ type: "done", reason: "stop", message });
				stream.end(message);
			});
			return stream;
		},
	});
	return { runtime, wrapped };
}
