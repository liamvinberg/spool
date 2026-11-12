import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { afterStill } from "./settle";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("waits while a frame is in the hand at the moment it would have settled, and settles once it is let go", () => {
	let hand = false;
	const settled = vi.fn();
	afterStill(500, () => hand, settled);
	vi.advanceTimersByTime(499);
	// lifted just before the settle, the canvas not yet having drawn it carried
	hand = true;
	vi.advanceTimersByTime(1);
	expect(settled).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1000);
	expect(settled).not.toHaveBeenCalled();
	hand = false;
	vi.advanceTimersByTime(500);
	expect(settled).toHaveBeenCalledTimes(1);
});
