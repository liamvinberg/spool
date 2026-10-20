import { describe, expect, it } from "vitest";
import { type PresenceState, readPresenceHidden, readPresenceState, readPresences } from "./team-sync-protocol";

/** Presence in a crowded project (#107): what a daemon or a browser reads of a tick, a hidden pointer and a follow. */

const here: PresenceState = {
	page: "",
	pointer: { x: 1, y: 2 },
	pressed: false,
	dragging: [],
	inside: null,
	view: null,
};
const ana = { accountId: "ana", name: "Ana", color: "#f00" };

describe("presence a tick at a time", () => {
	it("reads everyone a tick holds, leaving out an entry that isn't one", () => {
		expect(
			readPresences({
				type: "presences",
				people: [
					{ type: "presence", person: ana, state: here, still: 0 },
					{ type: "presence", person: { accountId: "ben" }, state: here, still: 0 },
					{ type: "presence", person: { ...ana, accountId: "cy" }, state: null, still: 0 },
				],
			}),
		).toEqual([
			{ type: "presence", person: ana, state: here, still: 0 },
			{ type: "presence", person: { ...ana, accountId: "cy" }, state: null, still: 0 },
		]);
	});

	it("reads nothing from a message that isn't a tick", () => {
		expect(readPresences({ type: "presences", people: "everyone" })).toBeUndefined();
		expect(readPresences({ type: "presence", people: [] })).toBeUndefined();
	});

	it("reads whether this person's pointer is hidden", () => {
		expect(readPresenceHidden({ type: "presence-hidden", hidden: true })).toBe(true);
		expect(readPresenceHidden({ type: "presence-hidden", hidden: false })).toBe(false);
		expect(readPresenceHidden({ type: "presence-hidden" })).toBeUndefined();
		expect(readPresenceHidden({ type: "presence", hidden: true })).toBeUndefined();
	});

	it("keeps who a person follows, and drops a follow that isn't an account", () => {
		expect(readPresenceState({ ...here, following: "ben" })).toEqual({ ...here, following: "ben" });
		expect(readPresenceState({ ...here, following: 7 })).toEqual(here);
		expect(readPresenceState({ ...here, following: "x".repeat(500) })).toEqual(here);
	});
});
