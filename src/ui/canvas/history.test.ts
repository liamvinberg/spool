import { describe, expect, it } from "vitest";
import type { Geometry } from "../api";
import {
	drop,
	emptyHistory,
	entryOf,
	HISTORY_LIMIT,
	type History,
	type HistoryEntry,
	type Liveness,
	type Rects,
	record,
	rectsOf,
	type Staging,
	type Taken,
	takeRedo,
	takeUndo,
	type Way,
} from "./history";

const rect = (x: number, y = 0, w = 100, h = 80) => ({ x, y, w, h });
const geometry = (rects: Rects): HistoryEntry => ({ kind: "geometry", rects });

/** The canvas an entry is checked against: frames on their pages, named pages, the toast. */
function at(frames: Record<string, string> = {}, pages: string[] = [], pending: Staging | null = null): Liveness {
	return { frames: new Map(Object.entries(frames)), pages: new Set(pages), pending };
}

/** Frames on the root page, which is what the geometry entries here care about. */
const alive = (...names: string[]) => at(Object.fromEntries(names.map((name) => [name, ""])));

/** The rects a taken entry writes, run this way — undefined when it took something else. */
function wrote(taken: Taken | undefined, way: Way): Record<string, Geometry> | undefined {
	const entry = taken?.entry;
	return entry?.kind === "geometry" ? rectsOf(entry.rects, way) : undefined;
}

describe("entryOf", () => {
	it("keeps only frames that actually moved", () => {
		const entry = entryOf({ a: rect(0), b: rect(50) }, { a: rect(10), b: rect(50) });
		expect(entry?.kind).toBe("geometry");
		expect(Object.keys(entry?.kind === "geometry" ? entry.rects : {})).toEqual(["a"]);
	});

	it("rounds both sides like the sidecar write", () => {
		const entry = entryOf({ a: { x: 10.4, y: 0.6, w: 100.2, h: 80 } }, { a: { x: 24.6, y: 0.6, w: 100.2, h: 80 } });
		expect(entry?.kind === "geometry" ? entry.rects.a : undefined).toEqual({
			before: rect(10, 1),
			after: rect(25, 1),
		});
	});

	it("is undefined when the gesture ends where it began", () => {
		expect(entryOf({ a: rect(10.4) }, { a: rect(10.4) })).toBeUndefined();
		expect(entryOf({}, {})).toBeUndefined();
	});
});

describe("record", () => {
	it("pushes the entry and voids redo", () => {
		let history = record(emptyHistory(), geometry({ a: { before: rect(0), after: rect(10) } }));
		const taken = takeUndo(history, alive("a"));
		history = record(taken?.history ?? history, geometry({ a: { before: rect(0), after: rect(30) } }));
		expect(history.undo).toHaveLength(1);
		expect(history.redo).toHaveLength(0);
	});

	it("caps the stack at HISTORY_LIMIT, oldest first", () => {
		let history = emptyHistory();
		for (let i = 0; i <= HISTORY_LIMIT + 4; i++) {
			history = record(history, geometry({ a: { before: rect(i), after: rect(i + 1) } }));
		}
		expect(history.undo).toHaveLength(HISTORY_LIMIT);
		const oldest = history.undo[0];
		expect(oldest?.kind === "geometry" ? oldest.rects.a?.before : undefined).toEqual(rect(5));
	});
});

describe("geometry entries", () => {
	it("round-trips: undo restores before, redo restores after", () => {
		const history = record(emptyHistory(), geometry({ a: { before: rect(0), after: rect(10) } }));
		const undone = takeUndo(history, alive("a"));
		expect(wrote(undone, "undo")).toEqual({ a: rect(0) });
		expect(undone?.history.undo).toHaveLength(0);
		const redone = takeRedo(undone?.history ?? history, alive("a"));
		expect(wrote(redone, "redo")).toEqual({ a: rect(10) });
		expect(redone?.history.undo).toHaveLength(1);
		expect(redone?.history.redo).toHaveLength(0);
	});

	it("skips an entry whose frames were all deleted and serves the older one", () => {
		let history = record(emptyHistory(), geometry({ a: { before: rect(0), after: rect(10) } }));
		history = record(history, geometry({ b: { before: rect(50), after: rect(60) } }));
		const taken = takeUndo(history, alive("a"));
		expect(wrote(taken, "undo")).toEqual({ a: rect(0) });
		// the dead entry is gone for good — redo holds only what was applied
		expect(taken?.history.undo).toHaveLength(0);
		expect(taken?.history.redo).toHaveLength(1);
	});

	it("restores only the surviving frames of a mixed entry", () => {
		const history = record(
			emptyHistory(),
			geometry({ a: { before: rect(0), after: rect(10) }, b: { before: rect(50), after: rect(60) } }),
		);
		const taken = takeUndo(history, alive("a"));
		expect(wrote(taken, "undo")).toEqual({ a: rect(0) });
		const kept = taken?.history.redo[0];
		expect(kept?.kind === "geometry" ? kept.rects : undefined).toEqual({ a: { before: rect(0), after: rect(10) } });
	});

	it("is undefined on an empty stack", () => {
		expect(takeUndo(emptyHistory(), alive("a"))).toBeUndefined();
		expect(takeRedo(emptyHistory(), alive("a"))).toBeUndefined();
	});
});

describe("rename entries", () => {
	const renamed: HistoryEntry = { kind: "rename", of: "frame", from: "home", to: "landing" };

	it("serves the reverse rename while both ends are true, and the forward one back", () => {
		const history = record(emptyHistory(), renamed);
		const undone = takeUndo(history, at({ landing: "" }));
		expect(undone?.entry).toEqual(renamed);
		expect(undone?.history.redo).toHaveLength(1);
		// the inverse ran: the frame answers to its old name again
		expect(takeRedo(undone?.history ?? history, at({ home: "" }))?.entry).toEqual(renamed);
	});

	it("skips when the name it would take is claimed, because the daemon would refuse it", () => {
		const history = record(emptyHistory(), renamed);
		// somebody else minted a frame called home while this sat on the stack
		expect(takeUndo(history, at({ landing: "", home: "" }))).toBeUndefined();
		// a page holds the name against a frame too — one namespace (#228)
		expect(takeUndo(history, at({ landing: "" }, ["home"]))).toBeUndefined();
	});

	it("skips when the row it is about is gone, and tells a page from a frame", () => {
		expect(takeUndo(record(emptyHistory(), renamed), at({ shell: "" }))).toBeUndefined();
		const page: HistoryEntry = { kind: "rename", of: "page", from: "shop", to: "store" };
		// a frame called store is not the page this entry is about
		expect(takeUndo(record(emptyHistory(), page), at({ store: "" }))).toBeUndefined();
		expect(takeUndo(record(emptyHistory(), page), at({}, ["store"]))?.entry).toEqual(page);
	});
});

describe("move entries", () => {
	const moved: HistoryEntry = {
		kind: "move",
		frames: [
			{ name: "cart", from: "" },
			{ name: "pay", from: "admin" },
		],
		to: "shop",
		lists: [],
	};

	it("undoes only the frames still sitting where the move left them", () => {
		const history = record(emptyHistory(), moved);
		// somebody dragged pay somewhere else in the meantime
		const taken = takeUndo(history, at({ cart: "shop", pay: "admin" }, ["shop", "admin"]));
		expect(taken?.entry.kind === "move" ? taken.entry.frames : undefined).toEqual([{ name: "cart", from: "" }]);
	});

	it("skips a frame whose page to land on is gone, and the whole entry when none is left", () => {
		const history = record(emptyHistory(), moved);
		// admin was trashed: pay has nowhere to go back to, cart still goes to the root page
		const taken = takeUndo(history, at({ cart: "shop", pay: "shop" }, ["shop"]));
		expect(taken?.entry.kind === "move" ? taken.entry.frames : undefined).toEqual([{ name: "cart", from: "" }]);
		expect(takeUndo(history, at({ cart: "", pay: "admin" }, ["shop", "admin"]))).toBeUndefined();
	});

	it("redoes the frames still standing on the pages they came from", () => {
		const history = record(emptyHistory(), moved);
		const taken = takeRedo({ undo: [], redo: history.undo }, at({ cart: "", pay: "admin" }, ["shop", "admin"]));
		expect(taken?.entry.kind === "move" ? taken.entry.frames.map((each) => each.name) : undefined).toEqual([
			"cart",
			"pay",
		]);
	});
});

describe("reorder entries", () => {
	it("is always live, because the stored order is advisory and the merge drops what went stale", () => {
		const entry: HistoryEntry = {
			kind: "reorder",
			lists: [{ of: "frames", page: "", before: ["a", "b"], after: ["b", "a"] }],
		};
		const history = record(emptyHistory(), entry);
		expect(takeUndo(history, at())?.entry).toEqual(entry);
	});
});

describe("mint entries", () => {
	const minted: HistoryEntry = { kind: "mint", staged: { frames: ["home-copy"], page: null } };

	it("stages what still exists, and skips once nothing of it does", () => {
		const history = record(emptyHistory(), minted);
		expect(takeUndo(history, at({ "home-copy": "" }))?.entry).toEqual(minted);
		expect(takeUndo(history, at({ home: "" }))).toBeUndefined();
	});

	it("narrows a page mint to the half of it that is left", () => {
		const entry: HistoryEntry = { kind: "mint", staged: { frames: ["cart-copy"], page: "shop-copy" } };
		const taken = takeUndo(record(emptyHistory(), entry), at({}, ["shop-copy"]));
		expect(taken?.entry).toEqual({ kind: "mint", staged: { frames: [], page: "shop-copy" } });
	});

	/**
	 * Redo is the toast's own undo. The copies are still on disk while it is up,
	 * so putting them back is un-staging rather than minting them a second time
	 * under names the daemon would have to invent again.
	 */
	it("redoes only against the toast that is holding exactly what it minted", () => {
		const history = { undo: [], redo: [minted] };
		expect(takeRedo(history, at({}, [], { frames: ["home-copy"], page: null }))?.entry).toEqual(minted);
		expect(takeRedo(history, at({}, [], { frames: ["shell"], page: null }))).toBeUndefined();
		expect(takeRedo(history, at({}, [], null))).toBeUndefined();
	});
});

/**
 * A page made with frames gathered into it: two halves owned by two places, and
 * one entry so that one press takes both. Undo needs the page to still be there
 * to empty; redo is the toast's own undo, exactly as it is for the mint this is
 * half of.
 */
describe("gather entries", () => {
	const gathered: HistoryEntry = { kind: "gather", page: "loose", frames: [{ name: "home", from: "" }], lists: [] };

	it("undoes while the page is still there and the frames are still in it", () => {
		const history = record(emptyHistory(), gathered);
		expect(takeUndo(history, at({ home: "loose" }, ["loose"]))?.entry).toEqual(gathered);
		// the page went away in the meantime, so there is nothing left to take back
		expect(takeUndo(history, at({ home: "" }, []))).toBeUndefined();
	});

	it("redoes only against the toast that is holding the page it made", () => {
		const history = { undo: [], redo: [gathered] };
		expect(takeRedo(history, at({ home: "" }, ["loose"], { frames: [], page: "loose" }))?.entry).toEqual(gathered);
		expect(takeRedo(history, at({ home: "" }, ["loose"], null))).toBeUndefined();
	});
});

describe("one stack", () => {
	/**
	 * The projection walks with the entries, exactly as it does on the canvas:
	 * each inverse changes what the next one is checked against.
	 */
	it("walks geometry, a rename and a reorder back, then forward again", () => {
		const move = geometry({ home: { before: rect(0), after: rect(40) } });
		const rename: HistoryEntry = { kind: "rename", of: "frame", from: "home", to: "landing" };
		const shuffle: HistoryEntry = {
			kind: "reorder",
			lists: [{ of: "frames", page: "", before: ["landing", "cart"], after: ["cart", "landing"] }],
		};
		let history = record(record(record(emptyHistory(), move), rename), shuffle);

		const one = takeUndo(history, at({ landing: "", cart: "" }));
		expect(one?.entry).toEqual(shuffle);
		const two = takeUndo(one?.history ?? history, at({ landing: "", cart: "" }));
		expect(two?.entry).toEqual(rename);
		const three = takeUndo(two?.history ?? history, at({ home: "", cart: "" }));
		expect(wrote(three, "undo")).toEqual({ home: rect(0) });
		history = three?.history ?? history;
		expect(history.undo).toHaveLength(0);
		expect(history.redo).toHaveLength(3);

		const back = takeRedo(history, at({ home: "", cart: "" }));
		expect(wrote(back, "redo")).toEqual({ home: rect(40) });
		const next = takeRedo(back?.history ?? history, at({ home: "", cart: "" }));
		expect(next?.entry).toEqual(rename);
		const last = takeRedo(next?.history ?? history, at({ landing: "", cart: "" }));
		expect(last?.entry).toEqual(shuffle);
		expect(last?.history.redo).toHaveLength(0);
		expect(last?.history.undo).toHaveLength(3);
	});

	/**
	 * A stale press does the next real thing rather than nothing. Consuming it
	 * would make ⌘Z look broken for exactly as many presses as the disk moved
	 * behind spool's back, which is the moment a person most needs it to work.
	 */
	it("falls through a stale entry to the one under it, in one press", () => {
		const move = geometry({ home: { before: rect(0), after: rect(40) } });
		const rename: HistoryEntry = { kind: "rename", of: "frame", from: "home", to: "landing" };
		const history = record(record(emptyHistory(), move), rename);

		// an agent renamed it again behind spool's back: landing is nobody's frame
		const taken = takeUndo(history, at({ hero: "", home: "" }));
		expect(wrote(taken, "undo")).toEqual({ home: rect(0) });
		expect(taken?.history.undo).toHaveLength(0);
		// the entry that could not run is gone rather than sitting in the future
		expect(taken?.history.redo).toHaveLength(1);
	});

	/**
	 * Redo skips the same way undo does, and for the same reason. A redo stack
	 * pops its oldest entry first, so what is stale here is the geometry entry
	 * underneath the rename rather than on top of it.
	 */
	it("falls through a stale redo entry to the one above it, in one press", () => {
		const move = geometry({ shell: { before: rect(0), after: rect(40) } });
		const rename: HistoryEntry = { kind: "rename", of: "frame", from: "home", to: "landing" };
		const history: History = { undo: [], redo: [rename, move] };

		// shell was trashed while both sat there; home is still here to be renamed
		const taken = takeRedo(history, at({ home: "" }));
		expect(taken?.entry).toEqual(rename);
		// the entry that could not run is gone, and the live one moved across
		expect(taken?.history.redo).toHaveLength(0);
		expect(taken?.history.undo).toEqual([rename]);
	});

	it("takes a refused entry back off the stack it was pushed onto", () => {
		const rename: HistoryEntry = { kind: "rename", of: "page", from: "shop", to: "store" };
		const taken = takeUndo(record(emptyHistory(), rename), at({}, ["store"]));
		expect(taken?.history.redo).toHaveLength(1);
		expect(drop(taken?.history ?? emptyHistory(), "undo")).toEqual({ undo: [], redo: [] });
	});
});

/**
 * Depth (#231). A page is named by its path, so an entry about one carries a
 * path and the check is against paths — two pages under different pages may
 * share a name, and a frame's name still has to miss every one of them.
 */
describe("entries about a nested page", () => {
	const renamed: HistoryEntry = {
		kind: "rename",
		of: "page",
		from: "explorations/chat",
		to: "explorations/agent-chat",
	};

	it("serves a nested rename while both paths hold, and the forward one back", () => {
		const history = record(emptyHistory(), renamed);
		const undone = takeUndo(history, at({}, ["explorations", "explorations/agent-chat"]));
		expect(undone?.entry).toEqual(renamed);
		expect(takeRedo(undone?.history ?? history, at({}, ["explorations", "explorations/chat"]))?.entry).toEqual(
			renamed,
		);
	});

	it("skips when the path it would take is a page already", () => {
		const history = record(emptyHistory(), renamed);
		const taken = at({}, ["explorations", "explorations/agent-chat", "explorations/chat"]);
		expect(takeUndo(history, taken)).toBeUndefined();
	});

	it("tells one page from another with the same name under a different page", () => {
		const history = record(emptyHistory(), renamed);
		// site/chat is a different page entirely, so it claims nothing here
		expect(takeUndo(history, at({}, ["explorations", "explorations/agent-chat", "site/chat"]))?.entry).toEqual(
			renamed,
		);
	});

	it("holds a frame name against a page's name wherever that page sits", () => {
		const frame: HistoryEntry = { kind: "rename", of: "frame", from: "chat", to: "home" };
		const history = record(emptyHistory(), frame);
		// undoing takes "chat" back, and a page answers to it at whatever depth it sits
		expect(takeUndo(history, at({ home: "" }, ["explorations/chat"]))).toBeUndefined();
		expect(takeUndo(history, at({ home: "" }, ["explorations/notes"]))?.entry).toEqual(frame);
	});

	const moved: HistoryEntry = {
		kind: "move-page",
		pages: [{ name: "explorations/chat", from: "explorations" }],
		to: "application",
		lists: [
			{ of: "pages", page: "explorations", before: ["chat"], after: [] },
			{ of: "pages", page: "application", before: [], after: ["chat"] },
		],
	};

	it("looks for a moved page where the move left it, and puts it back where it came from", () => {
		const history = record(emptyHistory(), moved);
		const undone = takeUndo(history, at({}, ["explorations", "application", "application/chat"]));
		expect(undone?.entry).toEqual(moved);
		// redo reaches for it where it started instead
		expect(
			takeRedo(undone?.history ?? history, at({}, ["explorations", "application", "explorations/chat"]))?.entry,
		).toEqual(moved);
	});

	it("skips a page somebody moved elsewhere while the entry sat on the stack", () => {
		const history = record(emptyHistory(), moved);
		expect(takeUndo(history, at({}, ["explorations", "application", "site/chat"]))).toBeUndefined();
	});

	it("skips when the page it would go back into is gone", () => {
		const history = record(emptyHistory(), moved);
		expect(takeUndo(history, at({}, ["application", "application/chat"]))).toBeUndefined();
	});

	/**
	 * A page can never land inside itself or inside one of its own. The daemon
	 * refuses it and the rail will not draw the drop, so a stale entry whose way
	 * back has become a page inside what is moving skips here rather than serving
	 * an undo the daemon would refuse a round trip later.
	 */
	it("skips a move whose way back is now a page inside what is moving", () => {
		const restructured: HistoryEntry = {
			kind: "move-page",
			pages: [{ name: "site/chat", from: "application/chat/inner" }],
			to: "application",
			lists: [],
		};
		const alive = at({}, ["application", "application/chat", "application/chat/inner"]);
		expect(takeUndo(record(emptyHistory(), restructured), alive)).toBeUndefined();
	});

	it("skips a redo whose destination has moved inside the page it would take", () => {
		const restructured: HistoryEntry = {
			kind: "move-page",
			pages: [{ name: "application", from: "" }],
			to: "application/chat",
			lists: [],
		};
		const alive = at({}, ["application", "application/chat"]);
		expect(takeRedo({ undo: [], redo: [restructured] }, alive)).toBeUndefined();
	});
});
