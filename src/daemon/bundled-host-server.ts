import { randomUUID } from "node:crypto";
import type { HostInput, HostOutput } from "./bundled-protocol";
import type { BundledRuntime } from "./bundled-runtime";
import { closeBundledSandbox } from "./bundled-sandbox";
import type { SourceAgentReply } from "./source-agent";

export function serveBundledHost(runtime: BundledRuntime): void {
	const send = (message: HostOutput) => {
		if (process.connected) process.send?.(message);
	};
	const pending = new Map<string, { resolve(value: SourceAgentReply): void; reject(error: Error): void }>();
	runtime.source = (turn) => ({
		request: (request) =>
			new Promise((resolve, reject) => {
				if (!process.connected) return reject(new Error("The source owner disconnected"));
				const id = randomUUID();
				pending.set(id, { resolve, reject });
				send({ kind: "source", id, turn, request });
			}),
	});
	process.on("message", (input: HostInput) => {
		if ("kind" in input && input.kind === "source-reply") {
			const held = pending.get(input.id);
			pending.delete(input.id);
			if (input.value) held?.resolve(input.value);
			else held?.reject(new Error(input.error ?? "Source operation failed"));
			return;
		}
		if (!("request" in input)) return;
		const { id, request } = input;
		void (async () => {
			if (request.kind === "turn") {
				await runtime.turn(id, request.options, (event) => send({ kind: "event", id, event }));
				return;
			}
			const value = await runtime.request(request);
			send({ kind: "reply", id, value });
			if (request.kind === "close") process.disconnect();
		})().catch(() =>
			send({
				kind: "error",
				id,
				message:
					"The bundled engine could not complete this operation. Check that its local state can be saved and try again.",
			}),
		);
	});
	process.on("disconnect", () => {
		for (const held of pending.values()) held.reject(new Error("The source owner disconnected"));
		pending.clear();
		void runtime.close().finally(() => closeBundledSandbox().finally(() => process.exit()));
	});
}
