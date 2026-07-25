import { describe, expect, it } from "vitest";
import {
	clipboardFailure,
	clipboardSuccess,
	parseClipboardCopyRequest,
	parseClipboardCopyResult,
} from "./clipboard-protocol";

describe("clipboard protocol", () => {
	it("accepts only the exact copy request shape", () => {
		const request = { spool: "copy", frame: "checkout", id: 42, text: "order 42" };

		expect(parseClipboardCopyRequest(request)).toEqual(request);
		expect(parseClipboardCopyRequest({ ...request, extra: true })).toBeUndefined();
		expect(parseClipboardCopyRequest({ ...request, frame: 42 })).toBeUndefined();
		expect(parseClipboardCopyRequest({ ...request, id: 0 })).toBeUndefined();
		expect(parseClipboardCopyRequest({ ...request, id: Number.MAX_SAFE_INTEGER + 1 })).toBeUndefined();
		expect(parseClipboardCopyRequest({ ...request, text: 42 })).toBeUndefined();
	});

	it("accepts exact success and safe failure results", () => {
		const success = { spool: "copy-result", frame: "checkout", id: 42 };
		const failure = {
			spool: "copy-result",
			frame: "checkout",
			id: 42,
			error: { name: "NotAllowedError", message: "Write permission denied" },
		};

		expect(parseClipboardCopyResult(success)).toEqual(success);
		expect(parseClipboardCopyResult(failure)).toEqual(failure);
		expect(parseClipboardCopyResult({ ...success, ok: true })).toBeUndefined();
		expect(parseClipboardCopyResult({ ...failure, error: { ...failure.error, stack: "secret" } })).toBeUndefined();
		expect(parseClipboardCopyResult({ ...failure, error: { name: "", message: "denied" } })).toBeUndefined();
		expect(parseClipboardCopyResult({ ...failure, error: { name: "Error", message: 42 } })).toBeUndefined();
	});

	it("serializes browser errors without carrying arbitrary values", () => {
		const denied = Object.assign(new Error("Write permission denied"), { name: "NotAllowedError" });

		expect(clipboardSuccess("checkout", 42)).toEqual({
			spool: "copy-result",
			frame: "checkout",
			id: 42,
		});
		expect(clipboardFailure("checkout", 42, denied)).toEqual({
			spool: "copy-result",
			frame: "checkout",
			id: 42,
			error: { name: "NotAllowedError", message: "Write permission denied" },
		});
		expect(clipboardFailure("checkout", 42, "blocked")).toEqual({
			spool: "copy-result",
			frame: "checkout",
			id: 42,
			error: { name: "Error", message: "blocked" },
		});
		const browserMessage = "policy ".repeat(1000);
		expect(
			clipboardFailure("checkout", 42, Object.assign(new Error(browserMessage), { name: "NotAllowedError" })),
		).toEqual({
			spool: "copy-result",
			frame: "checkout",
			id: 42,
			error: { name: "NotAllowedError", message: browserMessage },
		});
	});
});
