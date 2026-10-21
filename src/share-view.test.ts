import { describe, expect, it } from "vitest";
import { readCommenters, sharedWhat } from "./share-view";

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
