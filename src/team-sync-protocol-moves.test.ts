import { describe, expect, it } from "vitest";
import {
	type CommentPlace,
	type DesignNow,
	movedName,
	movesComments,
	placeAfter,
	readCommentsMessage,
	readMoved,
	sameSourceMoves,
} from "./team-sync-protocol";

/**
 * Where a comment stands as its frames and pages are renamed, moved, deleted and brought back (spool#160): the rules
 * spool.page's sync object keeps, held here so the fake team keeps the same ones.
 */

/** A team's copy holding some frames, each where its frame.json says, and every page they stand on. */
function design(frames: Record<string, { x: number; y: number; w: number; h: number }>, last = frames): DesignNow {
	return {
		frame: (name) => name in frames,
		page: (page) => page === "" || Object.keys(frames).some((name) => name.startsWith(`${page}/`)),
		geometry: (name) => last[name],
	};
}

const onFrame = (frame: string, at = { x: 40, y: 30 }): CommentPlace => ({
	page: frame.includes("/") ? frame.slice(0, frame.lastIndexOf("/")) : "",
	frame,
	at,
	standing: "placed",
	home: { frame, at },
	dropped: null,
});

const BOX = { x: 1000, y: 200, w: 390, h: 844 };

describe("a comment as saves change its frame", () => {
	it("follows a rename, and a page's move takes the frames on it", () => {
		expect(
			placeAfter(onFrame("receipt"), { frames: [{ from: "receipt", to: "thanks" }] }, design({ thanks: BOX }), 1),
		).toEqual(onFrame("thanks"));
		const moved = placeAfter(
			onFrame("shop/cart"),
			{ pages: [{ from: "shop", to: "store" }] },
			design({ "store/cart": BOX }),
			1,
		);
		expect(moved).toMatchObject({ page: "store", frame: "store/cart", standing: "placed" });
		expect(movedName("shop/sub/cart", { pages: [{ from: "shop", to: "store" }] }, "page")).toBe("store/sub/cart");
		expect(movedName("shopping", { pages: [{ from: "shop", to: "store" }] }, "page")).toBe("shopping");
	});

	it("stands on a frame moved before its new files are there", () => {
		expect(placeAfter(onFrame("receipt"), { frames: [{ from: "receipt", to: "thanks" }] }, design({}), 1)).toEqual(
			onFrame("thanks"),
		);
	});

	it("drops where it stood when its frame is deleted, held inside the frame, and goes back when it comes back", () => {
		const far = onFrame("receipt", { x: 900, y: 30 });
		const dropped = placeAfter(far, {}, design({}, { receipt: BOX }), 5);
		expect(dropped).toEqual({
			page: "",
			frame: null,
			at: { x: BOX.x + BOX.w, y: BOX.y + 30 },
			standing: "deleted-frame",
			home: { frame: "receipt", at: { x: 900, y: 30 } },
			dropped: 5,
		});
		// later saves leave it where it dropped
		expect(placeAfter(dropped, {}, design({ other: BOX }), 9)).toEqual(dropped);
		// a frame saved again at that path takes it back
		expect(placeAfter(dropped, {}, design({ receipt: BOX }), 12)).toEqual(far);
	});

	it("leaves the canvas with its page, and comes back with it", () => {
		const gone = placeAfter(onFrame("shop/cart"), {}, design({}, { "shop/cart": BOX }), 5);
		expect(gone).toMatchObject({ page: "shop", frame: null, standing: "deleted-page", dropped: 5 });
		expect(placeAfter(gone, {}, design({ "shop/other": BOX }), 9)).toMatchObject({ standing: "deleted-frame" });
		const field: CommentPlace = {
			page: "shop",
			frame: null,
			at: { x: 1, y: 2 },
			standing: "placed",
			home: null,
			dropped: null,
		};
		expect(placeAfter(field, {}, design({}), 1)).toMatchObject({ standing: "deleted-page" });
		expect(
			placeAfter(field, { pages: [{ from: "shop", to: "store" }] }, design({ "store/a": BOX }), 1),
		).toMatchObject({
			page: "store",
			standing: "placed",
		});
	});

	it("drops at its own point when the frame never said where it stood", () => {
		expect(placeAfter(onFrame("receipt"), {}, design({}, {}), 5)).toMatchObject({ at: { x: 40, y: 30 } });
	});
});

describe("a bundle that deletes and adds a frame's source", () => {
	const gone = (path: string, was: string) => ({ path, was, now: null });
	const came = (path: string, now: string) => ({ path, was: null, now });

	it("is a move when exactly one frame went and one came with the same bytes", () => {
		expect(sameSourceMoves([gone("frames/a/frame.tsx", "h1"), came("frames/b/frame.tsx", "h1")])).toEqual([
			{ from: "a", to: "b" },
		]);
	});

	it("is no move for a copy, a twin, a different source, or a file that isn't an entry", () => {
		expect(sameSourceMoves([came("frames/b/frame.tsx", "h1")])).toEqual([]);
		expect(
			sameSourceMoves([
				gone("frames/a/frame.tsx", "h1"),
				came("frames/b/frame.tsx", "h1"),
				came("frames/c/frame.tsx", "h1"),
			]),
		).toEqual([]);
		expect(sameSourceMoves([gone("frames/a/frame.tsx", "h1"), came("frames/b/frame.tsx", "h2")])).toEqual([]);
		expect(sameSourceMoves([gone("frames/a/frame.json", "h1"), came("frames/b/frame.json", "h1")])).toEqual([]);
	});

	it("is only weighed when an entry came or went, something was deleted, or Spool said it moved", () => {
		expect(movesComments([{ path: "frames/a/frame.tsx", was: "h1", now: "h2" }])).toBe(false);
		expect(movesComments([{ path: "frames/a/frame.json", was: "h1", now: "h2" }])).toBe(false);
		expect(movesComments([came("frames/a/frame.json", "h1")])).toBe(false);
		expect(movesComments([came("frames/a/frame.tsx", "h1")])).toBe(true);
		expect(movesComments([gone("frames/a/parts.tsx", "h1")])).toBe(true);
		expect(movesComments([], { frames: [{ from: "a", to: "b" }] })).toBe(true);
	});
});

describe("what a Mac says it moved", () => {
	it("reads frames and pages by their paths, and nothing that isn't one", () => {
		expect(readMoved({ frames: [{ from: "a", to: "b" }], pages: [] })).toEqual({ frames: [{ from: "a", to: "b" }] });
		expect(readMoved({})).toEqual({});
		expect(readMoved({ frames: [{ from: "", to: "b" }] })).toBeUndefined();
		expect(readMoved({ frames: "a" })).toBeUndefined();
		expect(readMoved(null)).toBeUndefined();
	});

	it("reads a comment changed, with the frame it dropped from", () => {
		const comment = {
			id: "c1",
			audience: "team",
			page: "",
			frame: null,
			at: { x: 1, y: 2 },
			element: null,
			revision: "a".repeat(64),
			still: false,
			author: { accountId: "ana", name: "ana", color: "#000" },
			agent: false,
			body: "hi",
			created: 1,
			edited: null,
			resolved: null,
			replies: [],
			standing: "deleted-frame",
			dropped: { frame: "receipt", at: 5 },
		};
		const read = readCommentsMessage({ type: "comment-changed", comment });
		expect(read).toMatchObject({
			type: "comment-changed",
			comment: { standing: "deleted-frame", dropped: { frame: "receipt", at: 5 } },
		});
	});
});
