import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hotBoots, hotUpdates } from "./hot-updates";

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

it("boots a frame plain until a save asks for the hot document, then swaps its saves; an entered frame reloads hot", () => {
	const boots = hotBoots();
	expect(boots.hot("a", 0)).toBe(false);
	// the first save to a plain-booted frame reloads it, into a hot document
	expect(boots.saved("a", 0)).toBe("reload");
	boots.reloading("a", 1, false);
	expect(boots.hot("a", 0)).toBe(false);
	expect(boots.hot("a", 1)).toBe(true);
	// its second swaps, and a reload of it later stays hot
	expect(boots.saved("a", 1)).toBe("swap");
	boots.reloading("a", 2, false);
	expect(boots.hot("a", 2)).toBe(true);
	// entering a plain document changes nothing until it reloads, which is hot
	expect(boots.hot("b", 0)).toBe(false);
	boots.reloading("b", 1, true);
	expect(boots.hot("b", 1)).toBe(true);
	// any other reload of a frame nobody saved or entered stays plain
	boots.reloading("c", 1, false);
	expect(boots.hot("c", 1)).toBe(false);
});
