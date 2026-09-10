import type { HostInput, HostOutput } from "./bundled-protocol";
import type { BundledRuntime } from "./bundled-runtime";
import { closeBundledSandbox } from "./bundled-sandbox";

export function serveBundledHost(runtime: BundledRuntime): void {
	const send = (message: HostOutput) => {
		if (process.connected) process.send?.(message);
	};
	process.on("message", (input: HostInput) => {
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
		void runtime.close().finally(() => closeBundledSandbox().finally(() => process.exit()));
	});
}
