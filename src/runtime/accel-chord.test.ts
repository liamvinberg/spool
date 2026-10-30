import { describe, expect, it } from "vitest";
import { accelChord } from "./accel-chord";

const APPLE = "MacIntel";
const OTHER = "Linux x86_64";

describe("accelChord — the only press spool takes from a live frame (#227)", () => {
	const press = (key: string, mods?: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }) => ({
		key,
		metaKey: mods?.meta ?? false,
		ctrlKey: mods?.ctrl ?? false,
		altKey: mods?.alt ?? false,
		shiftKey: mods?.shift ?? false,
	});

	it("takes esc behind the platform's own modifier", () => {
		expect(accelChord(press("Escape", { meta: true }), APPLE)).toBe("leave");
		expect(accelChord(press("Escape", { ctrl: true }), OTHER)).toBe("leave");
	});

	it("leaves every plain key to the prototype, its own esc included", () => {
		expect(accelChord(press("Escape"), APPLE)).toBeUndefined();
		expect(accelChord(press("p"), APPLE)).toBeUndefined();
	});

	it("is that chord exactly, so a longer one is somebody else's", () => {
		expect(accelChord(press("Escape", { meta: true, shift: true }), APPLE)).toBeUndefined();
		expect(accelChord(press("Escape", { meta: true, alt: true }), APPLE)).toBeUndefined();
	});

	it("answers nothing to a key that is not the one", () => {
		expect(accelChord(press("z", { meta: true }), APPLE)).toBeUndefined();
		expect(accelChord(press("f", { meta: true }), APPLE)).toBeUndefined();
	});
});
