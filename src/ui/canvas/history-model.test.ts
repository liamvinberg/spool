import { describe, expect, it } from "vitest";
import type { HistoryStretch } from "../api";
import {
	dayName,
	markHeight,
	movedInSays,
	paceOf,
	people,
	ranSays,
	setAsideSays,
	shownDays,
	throughOf,
	touchedSays,
} from "./history-model";

/**
 * How the History pane reads a team project's stretches (spool#187): the room above a row for the quiet before it,
 * how tall its mark runs, what it touched and what reached a frame through its imports, the days, the person pick,
 * and the line that ends the history.
 */

const MINUTE = 60_000;
/** Wednesday 21 October 2026 at midnight, here: the days the pane names are the asker's own. */
const WEDNESDAY = new Date(2026, 9, 21).getTime();
const at = (hours: number, minutes = 0) => WEDNESDAY + hours * 3_600_000 + minutes * MINUTE;

function stretch(over: Partial<HistoryStretch> & { who?: string }): HistoryStretch {
	const who = over.who ?? "ana";
	return {
		from: 1,
		to: 2,
		start: at(9),
		end: at(9, 30),
		by: { accountId: who, name: who === "ana" ? "Ana" : who === "ben" ? "Ben" : "Sara", color: "x", device: "Mac" },
		saves: 12,
		setAside: 0,
		paths: ["frames/cart/frame.tsx"],
		more: 0,
		...over,
	};
}

describe("the History pane's pace", () => {
	it("spaces a row by the square root of the quiet above it, capped, and says a long quiet", () => {
		const above = stretch({ start: at(11, 0), end: at(11, 20) });
		expect(paceOf(null, stretch({}))).toEqual({ space: 0, quiet: null });
		// 4 minutes: a breath, unsaid
		expect(paceOf(above, stretch({ end: at(10, 56) }))).toEqual({ space: 6, quiet: null });
		// 50 minutes
		expect(paceOf(above, stretch({ end: at(10, 10) }))).toEqual({ space: 23, quiet: "50 min quiet" });
		// a whole night's quiet is no taller than three hours'
		expect(paceOf(above, stretch({ end: at(6, 0) }))).toEqual({ space: 44, quiet: "5 h quiet" });
		expect(paceOf(above, stretch({ end: at(9, 35) }))).toEqual({ space: 30, quiet: "1 h 25 min quiet" });
	});

	it("draws a mark as tall as the stretch ran, never a dot nor a column", () => {
		expect(markHeight(stretch({ start: at(9), end: at(9) }))).toBe(9);
		expect(markHeight(stretch({ start: at(9), end: at(9, 50) }))).toBe(20);
		expect(markHeight(stretch({ start: at(9), end: at(13) }))).toBe(44);
	});

	it("says how long a stretch ran", () => {
		expect(ranSays(stretch({ start: at(9), end: at(9) }))).toBe("under a minute");
		expect(ranSays(stretch({ start: at(9), end: at(9, 42) }))).toBe("42 min");
		expect(ranSays(stretch({ start: at(9), end: at(10, 5) }))).toBe("1 h 5 min");
		expect(ranSays(stretch({ start: at(9), end: at(11) }))).toBe("2 h");
	});
});

describe("what a stretch touched", () => {
	it("names its frames and files once each, and counts the rest", () => {
		const touched = stretch({
			paths: [
				"frames/cart/frame.tsx",
				"frames/cart/frame.json",
				"frames/checkout/receipt/frame.tsx",
				"shared/ui/order-button.tsx",
				"canvas.json",
			],
			more: 3,
		});
		expect(touchedSays(touched)).toBe("cart, checkout/receipt, order-button.tsx, canvas.json and 3 more");
	});

	it("marks what reached a frame through the shared files it imports, and nothing of the frame's own", () => {
		const both = stretch({ paths: ["frames/cart/frame.tsx", "shared/ui/order-button.tsx"] });
		expect(throughOf(both, "cart")).toBe("through order-button.tsx");
		expect(throughOf(both, null)).toBeNull();
		expect(throughOf(stretch({ paths: ["frames/cart/frame.tsx"] }), "cart")).toBeNull();
		const two = stretch({ paths: ["shared/ui/order-button.tsx", "shared/ui/icon.tsx"] });
		expect(throughOf(two, "cart")).toBe("through order-button.tsx and icon.tsx");
		// a frame named like the start of another's is not that one
		expect(throughOf(stretch({ paths: ["frames/cart-old/frame.tsx"] }), "cart")).toBe("through frame.tsx");
	});

	it("says whose save arrived first over one set aside", () => {
		const bens = stretch({ who: "ben" });
		expect(setAsideSays(bens, { by: { accountId: "ana", name: "Ana" } })).toBe(
			"Ana's save arrived first, so Ben's was set aside. It is kept here 90 days.",
		);
		expect(setAsideSays(bens, null)).toBe("Ben's save was set aside. It is kept here 90 days.");
	});
});

describe("the days and the people", () => {
	it("names today and yesterday with their date, and any other day by its own", () => {
		const now = at(15);
		expect(dayName(WEDNESDAY, now)).toBe("Today · Wed 21 Oct");
		expect(dayName(new Date(2026, 9, 20).getTime(), now)).toBe("Yesterday · Tue 20 Oct");
		expect(dayName(new Date(2026, 9, 17).getTime(), now)).toBe("Sat 17 Oct");
	});

	it("keeps one person's stretches when picked, and every day's count of what shows", () => {
		const days = [
			{ day: WEDNESDAY, stretches: [stretch({ who: "ben", saves: 3 }), stretch({ who: "ana", saves: 4 })] },
			{ day: WEDNESDAY - 86_400_000, stretches: [stretch({ who: "ana", saves: 5 })] },
		];
		expect(shownDays(days, null).map((day) => [day.saves, day.shown.length])).toEqual([
			[7, 2],
			[5, 1],
		]);
		const bens = shownDays(days, "ben");
		expect(bens.map((day) => [day.saves, day.shown.map((one) => one.by.accountId)])).toEqual([
			[3, ["ben"]],
			[0, []],
		]);
	});

	it("lists everyone who saved, once each, in the order they first show", () => {
		const days = [
			{ day: WEDNESDAY, stretches: [stretch({ who: "ben" }), stretch({ who: "ana" }), stretch({ who: "ben" })] },
		];
		expect(people(days).map((one) => one.accountId)).toEqual(["ben", "ana"]);
	});
});

describe("the end of the history", () => {
	it("says when, by whom and in which commit the project moved in from git", () => {
		const moved = { at: new Date(2026, 9, 7, 9, 12).getTime(), by: { accountId: "ana", name: "Ana" } };
		expect(movedInSays({ ...moved, commit: "4e1c9a2f00000000000000000000000000000000" })).toBe(
			"Moved in from git on Wed 7 Oct by Ana, in 4e1c9a2. Older history is in the repo.",
		);
		// moved in before the commit was told
		expect(movedInSays({ ...moved, commit: null })).toBe(
			"Moved in from git on Wed 7 Oct by Ana. Older history is in the repo.",
		);
	});
});
