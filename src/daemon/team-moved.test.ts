import { describe, expect, it } from "vitest";
import type { Comment } from "../team-sync-protocol";
import { editedSince } from "./comment-routes";
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

describe("a comment's frame edited since", () => {
	const comment = (id: string, over: Partial<Comment>): Comment => ({
		id,
		audience: "team",
		page: "",
		frame: "receipt",
		at: { x: 1, y: 2 },
		element: null,
		revision: "r1",
		still: false,
		author: { accountId: "ana", name: "ana", color: "#000" },
		agent: false,
		body: "hi",
		created: 1,
		edited: null,
		resolved: null,
		standing: "placed",
		replies: [],
		...over,
	});

	it("is said of a comment on a frame whose revision is no longer the one it was made at", async () => {
		const asked: string[] = [];
		const revisions: Record<string, string> = { receipt: "r2", cart: "r1" };
		const edited = await editedSince(
			[
				comment("a", {}),
				comment("b", { frame: "cart" }),
				comment("c", {}),
				comment("d", { frame: null, revision: null }),
				comment("e", { frame: null, standing: "deleted-frame", dropped: { frame: "receipt", at: 1 } }),
				comment("f", { frame: "gone" }),
			],
			async (frame) => {
				asked.push(frame);
				if (frame === "gone") throw new Error("no such frame");
				return revisions[frame] ?? null;
			},
		);
		expect(edited).toEqual(["a", "c"]);
		// each frame is asked once
		expect(asked).toEqual(["receipt", "cart", "gone"]);
	});
});
