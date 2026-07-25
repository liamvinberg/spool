import { describe, expect, it } from "vitest";
import { clipboardCopyAllowed, parseFrameMessage, walkRejectionReason } from "./protocol";

describe("clipboard protocol", () => {
	it("accepts only an exact, safe frame copy request", () => {
		const request = { spool: "copy", frame: "landing", id: 73, text: "invite link" };

		expect(parseFrameMessage(request)).toEqual(request);
		expect(parseFrameMessage({ ...request, extra: true })).toBeUndefined();
		expect(parseFrameMessage({ ...request, id: 0 })).toBeUndefined();
		expect(parseFrameMessage({ ...request, id: Number.MAX_SAFE_INTEGER + 1 })).toBeUndefined();
		expect(parseFrameMessage({ ...request, text: null })).toBeUndefined();
	});

	it("grants clipboard authority only to the entered html transport", () => {
		expect(clipboardCopyAllowed("html", true, false)).toBe(true);
		expect(clipboardCopyAllowed("html", false, false)).toBe(false);
		expect(clipboardCopyAllowed("html", true, true)).toBe(false);
		expect(clipboardCopyAllowed("term", true, false)).toBe(false);
		expect(clipboardCopyAllowed(undefined, true, false)).toBe(false);
	});
});

describe("canvas walk protocol", () => {
	it("keeps terminal walks separate from exact id-bearing html walks", () => {
		const walk = {
			spool: "go",
			frame: "landing",
			target: "checkout",
			session: { scenario: "default", state: { cart: 1 }, stack: ["home"] },
			id: 73,
		};

		expect(parseFrameMessage(walk)).toEqual(walk);
		expect(parseFrameMessage({ ...walk, id: Number.MAX_SAFE_INTEGER })).toEqual({
			...walk,
			id: Number.MAX_SAFE_INTEGER,
		});
		expect(parseFrameMessage({ spool: "back", frame: "landing", target: "home" })).toEqual({
			spool: "back",
			frame: "landing",
			target: "home",
		});
		expect(parseFrameMessage({ spool: "go", frame: "landing", target: "checkout", extra: true })).toBeUndefined();
		expect(parseFrameMessage({ ...walk, extra: true })).toBeUndefined();
		expect(parseFrameMessage({ ...walk, id: 0 })).toBeUndefined();
		expect(parseFrameMessage({ ...walk, id: Number.MAX_SAFE_INTEGER + 1 })).toBeUndefined();
		expect(parseFrameMessage({ ...walk, id: "73" })).toBeUndefined();
		expect(parseFrameMessage({ ...walk, id: undefined })).toBeUndefined();
		expect(parseFrameMessage({ ...walk, session: null })).toBeUndefined();
	});

	it("binds sequenced walks to html and id-less walks to terminals", () => {
		const htmlWalk = parseFrameMessage({
			spool: "go",
			frame: "landing",
			target: "checkout",
			session: { scenario: "default", state: {}, stack: [] },
			id: 73,
		});
		const terminalWalk = parseFrameMessage({ spool: "back", frame: "shell", target: "home" });
		if (htmlWalk?.spool !== "go" || terminalWalk?.spool !== "back") throw new Error("walk fixture rejected");

		expect(walkRejectionReason(htmlWalk, "html", true, true, false)).toBeUndefined();
		expect(walkRejectionReason(htmlWalk, "html", true, true, true)).toBe("inactive");
		expect(walkRejectionReason(htmlWalk, "term", true, true, false)).toBe("inactive");
		expect(walkRejectionReason(htmlWalk, "html", false, true, false)).toBe("inactive");
		expect(walkRejectionReason(htmlWalk, "html", true, false, false)).toBe("missing");
		expect(walkRejectionReason(terminalWalk, "term", true, true, false)).toBeUndefined();
		expect(walkRejectionReason(terminalWalk, "html", true, true, false)).toBe("inactive");
		expect(walkRejectionReason(terminalWalk, undefined, true, true, false)).toBe("inactive");
	});
});

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
