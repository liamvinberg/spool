import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { type AssistantMessage, type Context, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { BundledRuntime } from "../bundled-runtime";
import { BundledCredentialStore } from "../bundled-store";

/** Replaces only provider inference. The host, credential store and SDK sessions are real. */
export async function deterministicBundledRuntime(
	directory: string,
	seen?: (context: Context) => void,
): Promise<BundledRuntime> {
	const credentials = new BundledCredentialStore(directory);
	const models = await ModelRuntime.create({
		credentials,
		modelsPath: null,
		refreshOnCreate: false,
		allowModelNetwork: false,
	});
	models.registerProvider("openai", {
		api: "openai-responses",
		models: [
			{
				id: "spool-test",
				name: "Test image model",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 100_000,
				maxTokens: 4096,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			},
		],
		streamSimple: (model, context, options) => {
			seen?.(context);
			appendFileSync(join(directory, "provider-calls.jsonl"), `${JSON.stringify(context)}\n`, { mode: 0o600 });
			const stream = createAssistantMessageEventStream();
			const message: AssistantMessage = {
				role: "assistant",
				content: [],
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
			const users = context.messages.filter((entry) => entry.role === "user");
			const text = `Saved reply ${users.length}.\n\nStill working.`;
			queueMicrotask(() => {
				stream.push({ type: "start", partial: message });
				message.content = [{ type: "text", text: "" }];
				stream.push({ type: "text_start", contentIndex: 0, partial: message });
				message.content = [{ type: "text", text }];
				stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
				const last = JSON.stringify(users.at(-1));
				const finish = () => {
					if (options?.signal?.aborted) {
						message.stopReason = "aborted";
						stream.push({ type: "error", reason: "aborted", error: message });
					} else {
						stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
						stream.push({ type: "done", reason: "stop", message });
					}
					stream.end(message);
				};
				if (last?.includes("hold this turn") && !options?.signal?.aborted)
					options?.signal?.addEventListener("abort", finish, { once: true });
				else setTimeout(finish, 30);
			});
			return stream;
		},
	});
	return new BundledRuntime(directory, credentials, models);
}
