import { describe, expect, it } from "vitest";
import { lastTab, numberedTab, popClosed, pushClosed, reopenedOrder, steppedTab } from "./tab-keys";

const OPEN = ["/a", "/b", "/c"];

describe("the strip by number", () => {
	it("is Home at 1 and the projects after it", () => {
		expect(numberedTab(OPEN, 1)).toBeNull();
		expect(numberedTab(OPEN, 2)).toBe("/a");
		expect(numberedTab(OPEN, 4)).toBe("/c");
	});

	it("is nothing past the end", () => {
		expect(numberedTab(OPEN, 5)).toBeUndefined();
		expect(numberedTab([], 2)).toBeUndefined();
	});

	it("ends at the last project, or Home with none open", () => {
		expect(lastTab(OPEN)).toBe("/c");
		expect(lastTab([])).toBeNull();
	});
});

describe("stepping the strip", () => {
	it("goes on and back from where it is", () => {
		expect(steppedTab(OPEN, "/a", 1)).toBe("/b");
		expect(steppedTab(OPEN, "/b", -1)).toBe("/a");
		expect(steppedTab(OPEN, null, 1)).toBe("/a");
		expect(steppedTab(OPEN, "/a", -1)).toBeNull();
	});

	it("wraps past either end", () => {
		expect(steppedTab(OPEN, "/c", 1)).toBeNull();
		expect(steppedTab(OPEN, null, -1)).toBe("/c");
	});

	it("stays on Home with nothing open", () => {
		expect(steppedTab([], null, 1)).toBeNull();
		expect(steppedTab([], null, -1)).toBeNull();
	});
});

describe("closed tabs", () => {
	it("come back last closed first", () => {
		const stack = pushClosed(pushClosed([], { root: "/a", slot: 0 }), { root: "/b", slot: 1 });
		const first = popClosed(stack, () => true);
		expect(first.tab).toEqual({ root: "/b", slot: 1 });
		expect(popClosed(first.rest, () => true).tab).toEqual({ root: "/a", slot: 0 });
	});

	it("hold a project once, from where it was closed last", () => {
		const stack = pushClosed(pushClosed([], { root: "/a", slot: 0 }), { root: "/a", slot: 2 });
		expect(stack).toEqual([{ root: "/a", slot: 2 }]);
	});

	it("pass over projects no longer on this machine", () => {
		const stack = [
			{ root: "/a", slot: 0 },
			{ root: "/gone", slot: 1 },
		];
		const { tab, rest } = popClosed(stack, (root) => root !== "/gone");
		expect(tab?.root).toBe("/a");
		expect(rest).toEqual([]);
		expect(popClosed([], () => true).tab).toBeUndefined();
	});

	it("go back in their old slot, or the end when the strip is shorter now", () => {
		expect(reopenedOrder(["/a", "/c"], { root: "/b", slot: 1 })).toEqual(["/a", "/b", "/c"]);
		expect(reopenedOrder(["/a"], { root: "/b", slot: 3 })).toEqual(["/a", "/b"]);
		expect(reopenedOrder(["/a", "/b"], { root: "/b", slot: 0 })).toEqual(["/a", "/b"]);
	});
});
