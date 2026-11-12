import { afterEach, expect, it, vi } from "vitest";
import { createHand, REST_MS } from "./present-hand";

afterEach(() => {
	vi.useRealTimers();
});

it("wakes the bar on a move of 6 px from where the hand was, never on its first move or a tremble, and lets it go once the hand rests off it", () => {
	vi.useFakeTimers();
	const said: boolean[] = [];
	const hand = createHand((awake) => said.push(awake));
	// the first move after the talk starts only says where the hand is
	hand.move({ x: 100, y: 100 });
	hand.move({ x: 103, y: 104 });
	expect(said).toEqual([]);
	hand.move({ x: 106, y: 100 });
	expect(said).toEqual([true]);
	// a tremble around where it woke it does nothing, and the rest is counted from the move that woke it
	vi.advanceTimersByTime(REST_MS - 1);
	hand.move({ x: 108, y: 103 });
	vi.advanceTimersByTime(1);
	expect(said).toEqual([true, false]);

	// the pointer on the bar keeps it, however long the hand rests there; off it, the rest counts again
	hand.move({ x: 120, y: 100 });
	hand.hold(true);
	vi.advanceTimersByTime(REST_MS * 3);
	expect(said).toEqual([true, false, true]);
	hand.hold(false);
	vi.advanceTimersByTime(REST_MS);
	expect(said).toEqual([true, false, true, false]);

	hand.stop();
	hand.move({ x: 400, y: 400 });
	vi.advanceTimersByTime(REST_MS);
	expect(said).toEqual([true, false, true, false]);
});
