import { afterEach, expect, it, vi } from "vitest";
import { QUIET_MS, talkReloads } from "./talk-reload";

afterEach(() => {
	vi.useRealTimers();
});

/** How many new builds a burst of changes to an unchanged talk asks for, or to one that changed. */
async function reloadsAfter(changes: unknown[], talkChanged = false): Promise<number> {
	vi.useFakeTimers();
	let reloads = 0;
	const reloader = talkReloads({
		page: "talk",
		frames: () => ["talk/title", "talk/words"],
		reload: () => reloads++,
		changed: async () => talkChanged,
	});
	for (const change of changes) {
		reloader.heard(change);
		await vi.advanceTimersByTimeAsync(QUIET_MS / 5);
	}
	await vi.advanceTimersByTimeAsync(QUIET_MS);
	reloader.stop();
	return reloads;
}

const code = { kind: "frame", frame: "talk/title" };
const notes = { kind: "deck", page: "talk" };
const size = { kind: "geometry", frame: "talk/words" };

it("takes one new build for a burst with a change to a slide's code in it, whatever the deck heard around it", async () => {
	expect(await reloadsAfter([code])).toBe(1);
	expect(await reloadsAfter([code, notes])).toBe(1);
	expect(await reloadsAfter([notes, code])).toBe(1);
	expect(await reloadsAfter([code, size, code])).toBe(1);
});

it("takes a change to the deck only when the talk it reads is another", async () => {
	expect(await reloadsAfter([notes, size])).toBe(0);
	expect(await reloadsAfter([notes], true)).toBe(1);
	expect(await reloadsAfter([{ kind: "frame", frame: "talk/loose" }])).toBe(0);
});
