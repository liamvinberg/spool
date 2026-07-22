import { describe, expect, it } from "vitest";
import { parseFrameMessage } from "./protocol";

describe("frame zoom protocol", () => {
	it("accepts entered-frame pinch and shortcut intents", () => {
		const wheel = {
			spool: "zoom",
			frame: "host",
			kind: "wheel",
			x: 12,
			y: 34,
			deltaY: -20,
			deltaMode: 0,
		};
		const shortcut = { spool: "zoom", frame: "host", kind: "out" };

		expect(parseFrameMessage(wheel)).toEqual(wheel);
		expect(parseFrameMessage(shortcut)).toEqual(shortcut);
	});

	it("rejects malformed zoom intents", () => {
		expect(parseFrameMessage({ spool: "zoom", frame: "host", kind: "wheel", deltaY: -20 })).toBeUndefined();
		expect(parseFrameMessage({ spool: "zoom", frame: "host", kind: "huge" })).toBeUndefined();
	});
});

describe("site boxes protocol (#34)", () => {
	it("accepts a shim's site-box answer and rejects a shapeless one", () => {
		const answer = {
			spool: "site-boxes",
			frame: "cart",
			id: 3,
			boxes: { "frames/cart/frame.tsx:4:4": { x: 10, y: 20, w: 120, h: 44 }, "frames/cart/frame.tsx:9:4": null },
		};

		expect(parseFrameMessage(answer)).toEqual(answer);
		expect(parseFrameMessage({ spool: "site-boxes", frame: "cart", id: 3 })).toBeUndefined();
		expect(parseFrameMessage({ spool: "site-boxes", frame: "cart", boxes: {} })).toBeUndefined();
	});
});
