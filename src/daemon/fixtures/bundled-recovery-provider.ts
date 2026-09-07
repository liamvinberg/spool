import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { deterministicBundledRuntime } from "./bundled-provider";

export async function recoveryRuntime(directory: string) {
	const runtime = await deterministicBundledRuntime(directory);
	const raw = runtime.models.getRegisteredProviderConfig("openai")?.streamSimple;
	if (!raw) throw new Error("Missing deterministic inference");
	const models = runtime.models.getModels("openai");
	for (const provider of ["openai", "anthropic"])
		runtime.models.registerProvider(provider, {
			api: "openai-responses",
			models: models.flatMap((model) => [model, { ...model, id: "second-test", name: "Second image model" }]),
			streamSimple: (model, context, options) => {
				const path = join(directory, "failure.json");
				const failure = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
				if (
					model.provider === "openai" &&
					failure &&
					(!failure.afterTool ||
						context.messages.some(
							(entry) =>
								entry.role === "toolResult" &&
								(!failure.afterMutation || entry.toolName === "edit" || entry.toolName === "write"),
						))
				) {
					appendFileSync(join(directory, "failed-calls.jsonl"), `${JSON.stringify(context)}\n`);
					const stream = createAssistantMessageEventStream();
					const message: AssistantMessage = {
						role: "assistant",
						content: [],
						api: model.api,
						provider: model.provider,
						model: model.id,
						stopReason: "error",
						errorMessage: failure.message,
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
						stream.push({ type: "error", reason: "error", error: message });
						stream.end(message);
					});
					return stream;
				}
				return raw(model, context, options);
			},
		});
	return runtime;
}
