import { describe, expect, it } from "vitest";
import { type KeyPlace, type PressedKey, readKey } from "./stage-keys";

const at: KeyPlace = {
	typing: false,
	live: false,
	keys: false,
	black: false,
	frozen: false,
	alone: false,
	filling: false,
};
const press = (key: string, more: Partial<PressedKey> = {}): PressedKey => ({
	key,
	shift: false,
	meta: false,
	ctrl: false,
	alt: false,
	prevented: false,
	...more,
});
const command = (key: string, place: Partial<KeyPlace> = {}, more: Partial<PressedKey> = {}) =>
	readKey(press(key, more), { ...at, ...place }, "").command;

describe("the keys of a talk", () => {
	it("reads the ladder a clicker, Keynote and PowerPoint taught", () => {
		for (const key of ["ArrowRight", "ArrowDown", " ", "Enter", "PageDown", "n", "N"]) {
			expect(command(key), key).toEqual({ kind: "next" });
		}
		for (const key of ["ArrowLeft", "ArrowUp", "PageUp", "p", "P", "Backspace"]) {
			expect(command(key), key).toEqual({ kind: "back" });
		}
		expect(command("ArrowRight", {}, { shift: true })).toEqual({ kind: "next-slide" });
		expect(command("ArrowLeft", {}, { shift: true })).toEqual({ kind: "previous-slide" });
		expect(command("Home")).toEqual({ kind: "first" });
		expect(command("End")).toEqual({ kind: "last" });
		expect(command("b")).toEqual({ kind: "black", on: true });
		expect(command(".")).toEqual({ kind: "black", on: true });
		expect(command("F")).toEqual({ kind: "freeze", on: true });
		expect(command("f", { frozen: true })).toEqual({ kind: "freeze", on: false });
		// played in place, with no room, the room's keys are nobody's
		for (const key of ["b", "B", ".", "f", "F"]) {
			expect(readKey(press(key), { ...at, alone: true }, ""), key).toEqual({ digits: "", taken: false });
		}
		// the slides filling this screen, which is the room: B and the period black it, with nothing apart to hold or swap
		expect(command("b", { filling: true })).toEqual({ kind: "black", on: true });
		expect(command(".", { filling: true })).toEqual({ kind: "black", on: true });
		for (const key of ["f", "F", "x", "X"]) {
			expect(readKey(press(key), { ...at, filling: true }, ""), key).toEqual({ digits: "", taken: false });
		}
		expect(command("r")).toEqual({ kind: "restart" });
		expect(command("X")).toEqual({ kind: "swap" });
		expect(command("?", {}, { shift: true })).toEqual({ kind: "help" });
		expect(command("Escape")).toEqual({ kind: "escape" });
		expect(readKey(press("q"), at, "")).toEqual({ digits: "", taken: false });
	});

	it("goes to a slide by its number once ↵ follows the digits, forgetting them on any other key", () => {
		let read = readKey(press("1"), at, "");
		read = readKey(press("2"), at, read.digits);
		expect(read).toEqual({ digits: "12", taken: true });
		expect(readKey(press("Enter"), at, read.digits)).toEqual({
			command: { kind: "go", slide: 11 },
			digits: "",
			taken: true,
		});
		expect(readKey(press("ArrowRight"), at, read.digits)).toEqual({
			command: { kind: "next" },
			digits: "",
			taken: true,
		});
		expect(readKey(press("Escape"), at, read.digits).digits).toBe("");
		// a long run keeps the last three
		expect(readKey(press("4"), at, "123").digits).toBe("234");
	});

	it("brings a black room back on any key and does nothing else with it", () => {
		for (const key of ["ArrowRight", "x", "Escape", "Tab", "PageDown"]) {
			expect(command(key, { black: true }), key).toEqual({ kind: "black", on: false });
		}
		// a modifier alone is not a key pressed
		expect(command("Shift", { black: true })).toBeUndefined();
	});

	it("leaves a text field its keys but for the clicker's two, and Esc lets go of the field", () => {
		const typing = { typing: true };
		for (const key of ["ArrowRight", " ", "Enter", "n", "1", "Backspace", "Tab", "b"]) {
			expect(readKey(press(key), { ...at, ...typing }, "").taken, key).toBe(false);
		}
		expect(command("PageDown", typing)).toEqual({ kind: "next" });
		expect(command("PageUp", typing)).toEqual({ kind: "back" });
		expect(command("Escape", typing)).toEqual({ kind: "blur" });
	});

	it("hands the whole keyboard to a live slide on Tab and takes it back on Esc, the clicker still moving the talk", () => {
		expect(command("Tab", { live: true })).toEqual({ kind: "keys", on: true });
		expect(command("Tab", { live: true }, { shift: true })).toBeUndefined();
		expect(command("Tab")).toBeUndefined();
		const held = { live: true, keys: true };
		for (const key of ["ArrowRight", "ArrowLeft", " ", "Enter", "b", "1", "Tab"]) {
			expect(readKey(press(key), { ...at, ...held }, "").taken, key).toBe(false);
		}
		expect(command("Escape", held)).toEqual({ kind: "keys", on: false });
		expect(command("PageDown", held)).toEqual({ kind: "next" });
	});

	it("leaves alone a key with a modifier, or one a slide already took", () => {
		for (const more of [{ meta: true }, { ctrl: true }, { alt: true }, { prevented: true }]) {
			expect(readKey(press("ArrowRight", more), at, "1"), JSON.stringify(more)).toEqual({
				digits: "1",
				taken: false,
			});
		}
	});
});
