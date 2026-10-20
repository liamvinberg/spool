import { describe, expect, it } from "vitest";
import { MOVE_SAID_MS, movesToSay } from "./team-moved";

/** What a copy says it moved, on the saves that delete the old files, until the team has it (spool#160). */

describe("a rename held for the team", () => {
	it("is said on each save that deletes under its old folder, until the team holds nothing there", () => {
		const moves = movesToSay();
		moves.said({ frames: [{ from: "receipt", to: "thanks" }] });
		const holds = new Set(["frames/receipt/"]);
		const held = (folder: string) => holds.has(folder);
		// a save that only adds the new files says nothing
		expect(moves.carried([], held)).toBeUndefined();
		expect(moves.carried(["frames/receipt/frame.tsx"], held)).toEqual({
			frames: [{ from: "receipt", to: "thanks" }],
		});
		// the old folder's last file went in a later bundle: said again
		expect(moves.carried(["frames/receipt/frame.json"], held)).toEqual({
			frames: [{ from: "receipt", to: "thanks" }],
		});
		holds.clear();
		expect(moves.carried(["frames/receipt/frame.json"], held)).toBeUndefined();
	});

	it("says a page's move with its pages, and forgets one no save carried in time", () => {
		let now = 0;
		const moves = movesToSay(() => now);
		moves.said({ pages: [{ from: "shop", to: "store" }] });
		expect(moves.carried(["frames/shop/cart/frame.tsx"], () => true)).toEqual({
			pages: [{ from: "shop", to: "store" }],
		});
		moves.said({ frames: [{ from: "a", to: "b" }] });
		now = MOVE_SAID_MS + 1;
		expect(moves.carried(["frames/a/frame.tsx"], () => true)).toBeUndefined();
	});
});
