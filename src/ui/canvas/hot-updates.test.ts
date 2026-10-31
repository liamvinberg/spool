import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hotUpdates } from "./hot-updates";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

it("reloads a frame whose update goes unanswered past the bound, and nothing once it is answered or reloaded", () => {
	const fellBack: string[] = [];
	const hot = hotUpdates(1000, (frame) => fellBack.push(frame));
	const sent: number[] = [];
	hot.offer("a", (id) => sent.push(id));
	hot.offer("b", (id) => sent.push(id));
	hot.offer("c", (id) => sent.push(id));
	expect(hot.answer("a", sent[0] ?? 0, true)).toBe("applied");
	hot.cancel("b");
	vi.advanceTimersByTime(1000);
	expect(fellBack).toEqual(["c"]);
});

it("answers only the latest of overlapping updates, and the older one's bound pays nothing", () => {
	const fellBack: string[] = [];
	const hot = hotUpdates(1000, (frame) => fellBack.push(frame));
	const sent: number[] = [];
	hot.offer("a", (id) => sent.push(id));
	vi.advanceTimersByTime(600);
	hot.offer("a", (id) => sent.push(id));
	const [older = 0, latest = 0] = sent;
	vi.advanceTimersByTime(600);
	expect(fellBack).toEqual([]);
	expect(hot.answer("a", older, false)).toBe("stale");
	expect(hot.answer("a", latest, false)).toBe("refused");
	vi.advanceTimersByTime(2000);
	expect(fellBack).toEqual([]);
});
