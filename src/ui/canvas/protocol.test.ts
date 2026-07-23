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

describe("element tree protocol (#37)", () => {
	it("accepts a shim's tree answer and rejects a shapeless one", () => {
		const answer = {
			spool: "tree",
			frame: "cart",
			id: 5,
			roots: [{ tag: "main", selector: "main", source: "frames/cart/frame.tsx:3:3", text: "", children: [] }],
		};

		expect(parseFrameMessage(answer)).toEqual(answer);
		expect(parseFrameMessage({ spool: "tree", frame: "cart", id: 5 })).toBeUndefined();
		expect(parseFrameMessage({ spool: "tree", frame: "cart", roots: [] })).toBeUndefined();
	});

	it("accepts a shim's describe answer and rejects a shapeless one", () => {
		const answer = { spool: "described", frame: "cart", id: 6, chains: [[], []] };

		expect(parseFrameMessage(answer)).toEqual(answer);
		expect(parseFrameMessage({ spool: "described", frame: "cart", id: 6 })).toBeUndefined();
		expect(parseFrameMessage({ spool: "described", frame: "cart", chains: [] })).toBeUndefined();
	});
});
