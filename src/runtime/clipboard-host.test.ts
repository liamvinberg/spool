import { describe, expect, it, vi } from "vitest";
import { fulfillClipboardCopy } from "./clipboard-host";

describe("trusted clipboard surface", () => {
	it("invokes the browser synchronously and replies to the captured source after fulfillment", async () => {
		let finishWrite: (() => void) | undefined;
		const writeText = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishWrite = resolve;
				}),
		);
		const postMessage = vi.fn();

		fulfillClipboardCopy({ spool: "copy", frame: "home", id: 73, text: "invite link" }, postMessage, {
			writeText,
		});

		expect(writeText).toHaveBeenCalledWith("invite link");
		expect(postMessage).not.toHaveBeenCalled();
		finishWrite?.();
		await vi.waitFor(() => {
			expect(postMessage).toHaveBeenCalledWith({ spool: "copy-result", frame: "home", id: 73 });
		});
	});

	it("returns only the browser error's safe name and message", async () => {
		const denied = Object.assign(new Error("Write permission denied"), {
			name: "NotAllowedError",
			secret: "must not cross",
		});
		const postMessage = vi.fn();

		fulfillClipboardCopy({ spool: "copy", frame: "home", id: 74, text: "invite link" }, postMessage, {
			writeText: () => Promise.reject(denied),
		});

		await vi.waitFor(() => {
			expect(postMessage).toHaveBeenCalledWith({
				spool: "copy-result",
				frame: "home",
				id: 74,
				error: { name: "NotAllowedError", message: "Write permission denied" },
			});
		});
		expect(JSON.stringify(postMessage.mock.calls)).not.toContain("must not cross");
	});

	it("normalizes a missing API and a synchronous non-Error throw", async () => {
		const missing = vi.fn();
		fulfillClipboardCopy({ spool: "copy", frame: "home", id: 75, text: "invite link" }, missing, undefined);
		expect(missing).toHaveBeenCalledWith({
			spool: "copy-result",
			frame: "home",
			id: 75,
			error: { name: "NotSupportedError", message: "Clipboard API is not available" },
		});

		const thrown = vi.fn();
		fulfillClipboardCopy({ spool: "copy", frame: "home", id: 76, text: "invite link" }, thrown, {
			writeText() {
				throw "blocked";
			},
		});
		expect(thrown).toHaveBeenCalledWith({
			spool: "copy-result",
			frame: "home",
			id: 76,
			error: { name: "Error", message: "blocked" },
		});
	});
});
