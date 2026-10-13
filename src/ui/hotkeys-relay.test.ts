import { describe, expect, it } from "vitest";
import { type ComboEvent, matchesCombo, parseCombo } from "./hotkey-combos";
import { HOTKEYS, isRelayedHotkey, relayedHotkeys } from "./hotkeys";

function press(overrides: Partial<ComboEvent>): ComboEvent {
	return { key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides };
}

/** Which entry, if any, a frame would relay this press as. */
function relayed(event: ComboEvent): string | undefined {
	return relayedHotkeys().find(({ combos }) => combos.some((combo) => matchesCombo(event, parseCombo(combo))))?.id;
}

describe("what reaches out of an entered frame", () => {
	it("is Esc, the jump chords and the zoom chords, as the shim always relayed, and the tab brackets", () => {
		expect(relayedHotkeys().map(({ id }) => id)).toEqual([
			"canvas.leave",
			"canvas.zoom-in",
			"canvas.zoom-out",
			"canvas.jump-back",
			"canvas.jump-forward",
			"app.next-tab",
			"app.previous-tab",
		]);
	});

	it("takes the tab brackets by place, which the Mac menu cannot, and leaves it the rest", () => {
		expect(relayed(press({ key: "^", code: "BracketRight", metaKey: true, shiftKey: true }))).toBe("app.next-tab");
		expect(relayed(press({ key: "Å", code: "BracketLeft", metaKey: true, shiftKey: true }))).toBe("app.previous-tab");
		expect(relayed(press({ key: "Tab", code: "Tab", ctrlKey: true }))).toBeUndefined();
		expect(relayed(press({ key: "w", code: "KeyW", metaKey: true }))).toBeUndefined();
		expect(relayed(press({ key: "1", code: "Digit1", metaKey: true }))).toBeUndefined();
	});

	it("leaves on Esc whatever else is held (#22)", () => {
		for (const held of [{}, { shiftKey: true }, { altKey: true }, { metaKey: true }, { ctrlKey: true }]) {
			expect(relayed(press({ key: "Escape", ...held }))).toBe("canvas.leave");
		}
	});

	it("takes the literal ctrl jump chords, never ⌘ or a longer chord (#166)", () => {
		expect(relayed(press({ key: "o", ctrlKey: true }))).toBe("canvas.jump-back");
		expect(relayed(press({ key: "i", ctrlKey: true }))).toBe("canvas.jump-forward");
		expect(relayed(press({ key: "o", metaKey: true }))).toBeUndefined();
		expect(relayed(press({ key: "o", ctrlKey: true, metaKey: true }))).toBeUndefined();
		expect(relayed(press({ key: "O", ctrlKey: true, shiftKey: true }))).toBeUndefined();
		expect(relayed(press({ key: "o", ctrlKey: true, altKey: true }))).toBeUndefined();
	});

	it("takes the browser's zoom chords under either modifier, shifted or not", () => {
		expect(relayed(press({ key: "=", metaKey: true }))).toBe("canvas.zoom-in");
		expect(relayed(press({ key: "+", ctrlKey: true, shiftKey: true }))).toBe("canvas.zoom-in");
		expect(relayed(press({ key: "-", metaKey: true }))).toBe("canvas.zoom-out");
	});

	it("leaves every plain key to the frame", () => {
		for (const key of ["+", "=", "-", "o", "i", "p", "0", "Enter", "/"]) {
			expect(relayed(press({ key }))).toBeUndefined();
		}
	});

	it("names only entries that dispatch, and lets a frame ask for no other", () => {
		for (const { id } of relayedHotkeys()) {
			const entry = HOTKEYS.find((candidate) => candidate.id === id);
			expect(entry !== undefined && "keys" in entry).toBe(true);
			expect(isRelayedHotkey(id)).toBe(true);
		}
		expect(isRelayedHotkey("canvas.trash")).toBe(false);
		expect(isRelayedHotkey("nonsense")).toBe(false);
	});
});
