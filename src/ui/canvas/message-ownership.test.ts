// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

Object.assign(window, { __SPOOL_CONTROL__: "test-control-token" });
const { ownsFrameMessage } = await import("./canvas");

describe("canvas frame message ownership", () => {
	it("rejects a mounted frame window that claims another frame", () => {
		const inbox = {} as WindowProxy;
		const checkout = {} as WindowProxy;
		const iframes = new Map<string, Pick<HTMLIFrameElement, "contentWindow">>([
			["inbox", { contentWindow: inbox }],
			["checkout", { contentWindow: checkout }],
		]);

		expect(ownsFrameMessage(iframes, "checkout", inbox)).toBe(false);
		expect(ownsFrameMessage(iframes, "checkout", checkout)).toBe(true);
	});

	it("rejects a stale window after its iframe is replaced", () => {
		const stale = {} as WindowProxy;
		const current = {} as WindowProxy;
		const iframes = new Map<string, Pick<HTMLIFrameElement, "contentWindow">>([
			["checkout", { contentWindow: stale }],
		]);

		iframes.set("checkout", { contentWindow: current });

		expect(ownsFrameMessage(iframes, "checkout", stale)).toBe(false);
		expect(ownsFrameMessage(iframes, "checkout", current)).toBe(true);
	});
});
