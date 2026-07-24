import { describe, expect, it } from "vitest";
import { parseFrameMessage } from "./protocol";

describe("external link protocol", () => {
	it("accepts a resolved web destination and rejects a shapeless intent", () => {
		const intent = {
			spool: "external",
			frame: "landing",
			href: "https://github.com/liamvinberg/spool",
		};

		expect(parseFrameMessage(intent)).toEqual(intent);
		expect(parseFrameMessage({ spool: "external", frame: "landing" })).toBeUndefined();
		expect(parseFrameMessage({ spool: "external", frame: "landing", href: 42 })).toBeUndefined();
		expect(parseFrameMessage({ spool: "external", frame: "landing", href: "javascript:alert(1)" })).toBeUndefined();
		expect(parseFrameMessage({ spool: "external", frame: "landing", href: "/relative" })).toBeUndefined();
		expect(
			parseFrameMessage({ spool: "external", frame: "landing", href: "https://user:secret@example.com" }),
		).toBeUndefined();
	});
});

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

describe("frame modifier protocol", () => {
	it("accepts Meta hold changes and rejects malformed modifier intents", () => {
		const held = { spool: "modifier", frame: "host", modifier: "Meta", held: true };

		expect(parseFrameMessage(held)).toEqual(held);
		expect(parseFrameMessage({ spool: "modifier", frame: "host", modifier: "Meta" })).toBeUndefined();
		expect(parseFrameMessage({ spool: "modifier", frame: "host", modifier: "Control", held: true })).toBeUndefined();
		expect(parseFrameMessage({ spool: "modifier", frame: "host", modifier: "Meta", held: "true" })).toBeUndefined();
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
