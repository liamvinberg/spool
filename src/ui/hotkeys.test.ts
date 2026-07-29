import { describe, expect, it } from "vitest";
import { type ComboEvent, formatCombo, matchesCombo, parseCombo } from "./hotkey-combos";
import { HOTKEYS, hotkeyChips, hotkeyKey, listedHotkeys, SCOPE_PRIORITY } from "./hotkeys";

function press(overrides: Partial<ComboEvent>): ComboEvent {
	return { key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides };
}

describe("combo parsing", () => {
	it("reads modifiers and the key", () => {
		expect(parseCombo("accel+shift+z")).toEqual({ accel: true, ctrl: false, shift: true, alt: false, key: "z" });
		expect(parseCombo("ctrl+o")).toEqual({ accel: false, ctrl: true, shift: false, alt: false, key: "o" });
	});

	it("allows a bare accel hold and nothing else keyless", () => {
		expect(parseCombo("accel").key).toBeNull();
		expect(() => parseCombo("shift")).toThrow(/names no key/);
	});

	it("rejects a second key and an unknown token", () => {
		expect(() => parseCombo("a+b")).toThrow(/two keys/);
		expect(() => parseCombo("meta+z")).toThrow(/unknown token/);
	});
});

describe("combo matching", () => {
	it("accel is the union: either platform modifier answers", () => {
		const combo = parseCombo("accel+z");
		expect(matchesCombo(press({ key: "z", metaKey: true }), combo)).toBe(true);
		expect(matchesCombo(press({ key: "z", ctrlKey: true }), combo)).toBe(true);
		expect(matchesCombo(press({ key: "z" }), combo)).toBe(false);
	});

	it("a modifier the combo does not name must not be held", () => {
		expect(matchesCombo(press({ key: "t", shiftKey: true }), parseCombo("t"))).toBe(false);
		expect(matchesCombo(press({ key: "z", metaKey: true, shiftKey: true }), parseCombo("accel+z"))).toBe(false);
		expect(matchesCombo(press({ key: "t", metaKey: true }), parseCombo("t"))).toBe(false);
	});

	it("ctrl is literal: meta beside it is a different chord", () => {
		const combo = parseCombo("ctrl+o");
		expect(matchesCombo(press({ key: "o", ctrlKey: true }), combo)).toBe(true);
		expect(matchesCombo(press({ key: "o", ctrlKey: true, metaKey: true }), combo)).toBe(false);
		expect(matchesCombo(press({ key: "o", metaKey: true }), combo)).toBe(false);
	});

	it("letters survive caps lock", () => {
		expect(matchesCombo(press({ key: "P" }), parseCombo("p"))).toBe(true);
	});

	it("shifted digits match by code, the way ⇧1 is ! before it is a 1", () => {
		const combo = parseCombo("shift+1");
		expect(matchesCombo(press({ key: "!", code: "Digit1", shiftKey: true }), combo)).toBe(true);
		expect(matchesCombo(press({ key: "1", code: "Digit1" }), combo)).toBe(false);
		expect(matchesCombo(press({ key: "0", code: "Digit0" }), parseCombo("0"))).toBe(true);
	});

	it("slash and question ignore shift: some layouts spell them with it", () => {
		expect(matchesCombo(press({ key: "/", shiftKey: true }), parseCombo("slash"))).toBe(true);
		expect(matchesCombo(press({ key: "?", shiftKey: true }), parseCombo("question"))).toBe(true);
		expect(matchesCombo(press({ key: "?" }), parseCombo("question"))).toBe(true);
	});

	it("character keys match however the layout spells them", () => {
		// "+" is ⇧= on US layouts and "=" is ⇧0 on Swedish: shift is spelling, not chord
		expect(matchesCombo(press({ key: "+", shiftKey: true }), parseCombo("plus"))).toBe(true);
		expect(matchesCombo(press({ key: "+", shiftKey: true, metaKey: true }), parseCombo("accel+plus"))).toBe(true);
		expect(matchesCombo(press({ key: "=", shiftKey: true, metaKey: true }), parseCombo("accel+equals"))).toBe(true);
	});

	it("space matches by code, under any modifier", () => {
		expect(matchesCombo(press({ key: " ", code: "Space" }), parseCombo("space"))).toBe(true);
		expect(matchesCombo(press({ key: " ", code: "Space", shiftKey: true }), parseCombo("space"))).toBe(true);
		expect(matchesCombo(press({ key: " ", code: "Space", metaKey: true }), parseCombo("space"))).toBe(true);
	});

	it("a bare accel combo is the platform modifier key itself", () => {
		// no navigator in this environment, so the platform reads as Apple
		expect(matchesCombo(press({ key: "Meta" }), parseCombo("accel"))).toBe(true);
		expect(matchesCombo(press({ key: "Control" }), parseCombo("accel"))).toBe(false);
	});
});

describe("combo faces", () => {
	// no navigator here: Apple faces, the same honest default platform-keys takes
	it("wears the platform accel face and the app's glyphs", () => {
		expect(formatCombo("accel+z")).toBe("⌘Z");
		expect(formatCombo("shift+a")).toBe("⇧A");
		expect(formatCombo("ctrl+o")).toBe("⌃O");
		expect(formatCombo("backspace")).toBe("⌫");
		expect(formatCombo("enter")).toBe("↵");
		expect(formatCombo("question")).toBe("?");
	});
});

describe("the register", () => {
	it("never binds one chord twice within a scope", () => {
		for (const scope of SCOPE_PRIORITY) {
			const seen = new Set<string>();
			for (const entry of HOTKEYS) {
				if (entry.scope !== scope || !("keys" in entry)) continue;
				for (const combo of entry.keys) {
					const spelled = JSON.stringify(parseCombo(combo));
					expect(seen.has(spelled), `${scope} binds ${combo} twice`).toBe(false);
					seen.add(spelled);
				}
			}
		}
	});

	it("tells a label for every listed entry and a face for every chip", () => {
		for (const entry of HOTKEYS) {
			if ("listed" in entry) continue;
			expect(entry.label.length, `${entry.id} has no label`).toBeGreaterThan(0);
			const chips = hotkeyChips(entry);
			expect(chips.keys.length > 0 || chips.gesture !== undefined, `${entry.id} shows nothing`).toBe(true);
		}
	});

	it("keeps every scope inside the priority walk", () => {
		for (const entry of HOTKEYS) {
			expect(SCOPE_PRIORITY).toContain(entry.scope);
		}
	});

	it("wears the faces the menus already drew", () => {
		expect(hotkeyKey("canvas.play")).toBe("P");
		expect(hotkeyKey("canvas.tidy")).toBe("⇧A");
		expect(hotkeyKey("canvas.trash")).toBe("⌫");
		expect(hotkeyKey("canvas.tool-select")).toBe("V");
		expect(hotkeyKey("canvas.threads")).toBe("T");
	});

	it("lists rows for every group it names", () => {
		expect(listedHotkeys("Frames").map((entry) => entry.id)).toContain("canvas.enter");
		expect(listedHotkeys("Help").map((entry) => entry.id)).toContain("app.help");
	});
});
