import { describe, expect, it } from "vitest";
import { endsFrom, readCommenters, saidDay, saidEnds, sharedWhat } from "./share-view";

describe("who commented through a share (spool#174)", () => {
	it("reads each commenter spool.page names, dropping what isn't one", () => {
		const ines = { account: "a1", name: "Ines", posts: 3, last: 1_700_000_000_000, blocked: false };
		expect(readCommenters({ commenters: [ines, { account: "a2", name: "Ola" }, null, "x"] })).toEqual([ines]);
		expect(readCommenters({ commenters: "none" })).toBeNull();
		expect(readCommenters(null)).toBeNull();
	});
});

describe("what a share shows, as its row says it (spool#182)", () => {
	it("says whole project for a whole-project share, though spool.page still lists its pages", () => {
		expect(sharedWhat({ pages: ["", "checkout"], whole: true })).toBe("whole project");
	});

	it("names a pages share's pages, the root page as the top page", () => {
		expect(sharedWhat({ pages: ["", "flows/checkout"] })).toBe("the top page, checkout");
	});
});

describe("when a share ends, as its row and the Ends choice say it (spool#183)", () => {
	// 2025-11-09 12:00 UTC, midday so every timezone near Stockholm reads the same day
	const ninthNov = Date.UTC(2025, 10, 9, 12) / 1000;

	it("says ends and the day and short month of a share with an end", () => {
		expect(saidEnds({ endsAt: ninthNov })).toBe("ends 9 Nov");
	});

	it("says nothing for a share that never ends", () => {
		expect(saidEnds({})).toBeNull();
	});

	it("names the day each Ends choice means, counted from now", () => {
		const now = Date.UTC(2025, 10, 2, 12) / 1000;
		expect(saidDay(endsFrom("7d", now) ?? 0)).toBe("9 Nov");
		expect(saidDay(endsFrom("30d", now) ?? 0)).toBe("2 Dec");
		expect(endsFrom("never", now)).toBeUndefined();
	});
});
