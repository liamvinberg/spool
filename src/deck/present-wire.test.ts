import { expect, it } from "vitest";
import { roomPasses } from "./present-wire";
import type { KeyCommand } from "./stage-keys";

it("passes every key's command from the room to the presenter, and never a write to the talk's state", () => {
	const keys: KeyCommand[] = [
		{ kind: "next" },
		{ kind: "go", slide: 3 },
		{ kind: "black", on: true },
		{ kind: "freeze", on: true },
		{ kind: "restart" },
		{ kind: "keys", on: true },
		{ kind: "keys", on: false },
		{ kind: "swap" },
		{ kind: "help" },
		{ kind: "escape" },
	];
	expect(keys.filter(roomPasses)).toEqual(keys);
	expect(roomPasses({ kind: "state", state: { count: 2 } })).toBe(false);
});
