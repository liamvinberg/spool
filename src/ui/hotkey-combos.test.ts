import { describe, expect, it } from "vitest";
import {
	type ComboEvent,
	comboMatches,
	electronAccelerator,
	formatCombo,
	learnKeyboardLayout,
	lowerCombo,
	matchesCombo,
	parseCombo,
} from "./hotkey-combos";

function press(overrides: Partial<ComboEvent>): ComboEvent {
	return { key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides };
}

const APPLE = "MacIntel";

describe("any", () => {
	it("matches the key whatever else is held", () => {
		const combo = parseCombo("any+escape");
		for (const held of [{}, { shiftKey: true }, { altKey: true }, { metaKey: true }, { ctrlKey: true }]) {
			expect(matchesCombo(press({ key: "Escape", ...held }), combo)).toBe(true);
		}
		expect(matchesCombo(press({ key: "Enter" }), combo)).toBe(false);
	});

	it("stands alone, never beside a modifier or without a key", () => {
		expect(() => parseCombo("any+shift+escape")).toThrow();
		expect(() => parseCombo("any")).toThrow();
	});

	it("wears just the key's face", () => {
		expect(formatCombo("any+escape", APPLE)).toBe("esc");
	});
});

describe("bracket keys", () => {
	it("match by physical key, so ⌘] sits in one place on every layout", () => {
		const combo = parseCombo("accel+bracketright");
		// Swedish: the key right of å types ¨
		expect(matchesCombo(press({ key: "¨", code: "BracketRight", metaKey: true }), combo)).toBe(true);
		expect(matchesCombo(press({ key: "]", code: "Backslash", metaKey: true }), combo)).toBe(false);
	});

	it("wear the layout's own glyph once it is read, and the US one before", async () => {
		expect(formatCombo("accel+bracketleft", APPLE)).toBe("⌘[");
		const swedish = new Map([
			["BracketLeft", "å"],
			["BracketRight", "¨"],
		]);
		expect(await learnKeyboardLayout({ getLayoutMap: async () => swedish })).toBe(true);
		expect(formatCombo("accel+bracketleft", APPLE)).toBe("⌘Å");
		expect(formatCombo("accel+shift+bracketright", APPLE)).toBe("⌘⇧¨");
		expect(await learnKeyboardLayout({ getLayoutMap: async () => swedish })).toBe(false);
		await learnKeyboardLayout({
			getLayoutMap: async () =>
				new Map([
					["BracketLeft", "["],
					["BracketRight", "]"],
				]),
		});
	});

	it("keep the US faces where there is no Keyboard API", async () => {
		expect(await learnKeyboardLayout(undefined)).toBe(false);
		expect(await learnKeyboardLayout({})).toBe(false);
	});
});

describe("lowered combos", () => {
	it("survive JSON and match the same presses", () => {
		const combos = ["ctrl+o", "accel+plus", "shift+1", "alt+b", "t", "space", "any+escape", "accel+bracketleft"];
		const presses = [
			press({ key: "o", ctrlKey: true }),
			press({ key: "+", shiftKey: true, metaKey: true }),
			press({ key: "!", code: "Digit1", shiftKey: true }),
			press({ key: "∫", code: "KeyB", altKey: true }),
			press({ key: "T", shiftKey: true }),
			press({ key: " ", code: "Space", metaKey: true }),
			press({ key: "Escape", shiftKey: true }),
			press({ key: "å", code: "BracketLeft", metaKey: true }),
		];
		for (const combo of combos) {
			const parsed = parseCombo(combo);
			const travelled = JSON.parse(JSON.stringify(lowerCombo(parsed)));
			for (const event of presses) {
				expect(comboMatches(event, travelled, "Meta")).toBe(matchesCombo(event, parsed, APPLE));
			}
		}
	});

	it("reads nothing but its arguments, so the frame shim can carry its source", () => {
		const carried = new Function(`return (${String(comboMatches)})`)() as typeof comboMatches;
		expect(carried(press({ key: "o", ctrlKey: true }), lowerCombo(parseCombo("ctrl+o")), null)).toBe(true);
	});
});

describe("electron accelerators", () => {
	it("say the menu's keys as Electron spells them", () => {
		expect(electronAccelerator("accel+n")).toBe("CmdOrCtrl+N");
		expect(electronAccelerator("accel+o")).toBe("CmdOrCtrl+O");
		expect(electronAccelerator("accel+comma")).toBe("CmdOrCtrl+,");
		expect(electronAccelerator("accel+shift+z")).toBe("CmdOrCtrl+Shift+Z");
		expect(electronAccelerator("ctrl+tab")).toBe("Ctrl+Tab");
		expect(electronAccelerator("accel+alt+b")).toBe("CmdOrCtrl+Alt+B");
		expect(electronAccelerator("accel+plus")).toBe("CmdOrCtrl+Plus");
		expect(electronAccelerator("accel+shift+bracketright")).toBe("CmdOrCtrl+Shift+]");
		expect(electronAccelerator("alt+arrowleft")).toBe("Alt+Left");
		expect(electronAccelerator("accel+1")).toBe("CmdOrCtrl+1");
	});

	it("says nothing a menu cannot", () => {
		expect(electronAccelerator("accel")).toBeUndefined();
		expect(electronAccelerator("any+escape")).toBeUndefined();
		expect(electronAccelerator("question")).toBeUndefined();
	});
});
