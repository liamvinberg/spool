import { describe, expect, it } from "vitest";
import { accelChord, accelLabel, accelPressed, applePlatform } from "./platform-keys";

const APPLE = "MacIntel";
const OTHER = "Linux x86_64";

const held = (mods?: { meta?: boolean; ctrl?: boolean }) => ({
	metaKey: mods?.meta ?? false,
	ctrlKey: mods?.ctrl ?? false,
});

describe("applePlatform — which family a platform string names", () => {
	it("names the Apple platforms", () => {
		expect(applePlatform("MacIntel")).toBe(true);
		expect(applePlatform("macOS")).toBe(true);
		expect(applePlatform("iPhone")).toBe(true);
	});

	it("names everything else, unknown platforms included", () => {
		expect(applePlatform("Win32")).toBe(false);
		expect(applePlatform("Windows")).toBe(false);
		expect(applePlatform("Linux x86_64")).toBe(false);
		expect(applePlatform("")).toBe(false);
	});
});

describe("accelPressed — the accel modifier, exclusive per platform", () => {
	it("reads ⌘ on Apple", () => {
		expect(accelPressed(held({ meta: true }), APPLE)).toBe(true);
	});

	it("reads ctrl off Apple, where the Super key never reaches the page", () => {
		expect(accelPressed(held({ ctrl: true }), OTHER)).toBe(true);
	});

	/** The reason this is not a union: on the Mac ctrl+click is the secondary
	 * click, so accepting either modifier would fire the binding and the context
	 * menu from one press. */
	it("refuses ctrl on Apple", () => {
		expect(accelPressed(held({ ctrl: true }), APPLE)).toBe(false);
	});

	it("refuses meta off Apple", () => {
		expect(accelPressed(held({ meta: true }), OTHER)).toBe(false);
	});

	it("refuses a bare event on either platform", () => {
		expect(accelPressed(held(), APPLE)).toBe(false);
		expect(accelPressed(held(), OTHER)).toBe(false);
	});

	it("holds when both modifiers are down — the platform's own still counts", () => {
		expect(accelPressed(held({ meta: true, ctrl: true }), APPLE)).toBe(true);
		expect(accelPressed(held({ meta: true, ctrl: true }), OTHER)).toBe(true);
	});
});

describe("accelLabel — how a platform spells the modifier", () => {
	it("prefixes a key the way the platform writes it", () => {
		expect(`${accelLabel(APPLE)}Z`).toBe("⌘Z");
		expect(`${accelLabel(OTHER)}Z`).toBe("ctrl+Z");
	});
});

describe("accelChord — the only presses spool takes from a live frame (#210)", () => {
	const press = (key: string, mods?: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }) => ({
		key,
		metaKey: mods?.meta ?? false,
		ctrlKey: mods?.ctrl ?? false,
		altKey: mods?.alt ?? false,
		shiftKey: mods?.shift ?? false,
	});

	it("takes esc and f behind the platform's own modifier", () => {
		expect(accelChord(press("Escape", { meta: true }), APPLE)).toBe("leave");
		expect(accelChord(press("f", { meta: true }), APPLE)).toBe("fullscreen");
		expect(accelChord(press("Escape", { ctrl: true }), OTHER)).toBe("leave");
		expect(accelChord(press("F", { ctrl: true }), OTHER)).toBe("fullscreen");
	});

	it("leaves every plain key to the prototype, its own esc included", () => {
		expect(accelChord(press("Escape"), APPLE)).toBeUndefined();
		expect(accelChord(press("f"), APPLE)).toBeUndefined();
		expect(accelChord(press("p"), APPLE)).toBeUndefined();
	});

	it("is the platform's modifier and no other", () => {
		expect(accelChord(press("Escape", { ctrl: true }), APPLE)).toBeUndefined();
		expect(accelChord(press("Escape", { meta: true }), OTHER)).toBeUndefined();
	});

	it("is that chord exactly, so a longer one is somebody else's", () => {
		expect(accelChord(press("Escape", { meta: true, shift: true }), APPLE)).toBeUndefined();
		expect(accelChord(press("f", { meta: true, alt: true }), APPLE)).toBeUndefined();
	});

	it("answers nothing to a key that is not one of the two", () => {
		expect(accelChord(press("z", { meta: true }), APPLE)).toBeUndefined();
	});
});
