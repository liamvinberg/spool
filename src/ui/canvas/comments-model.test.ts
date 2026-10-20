import { describe, expect, it } from "vitest";
import type { Comment, CommentReply } from "../../team-sync-protocol";
import {
	counts,
	FILTERS,
	fanOut,
	gather,
	groupsOf,
	isForYou,
	isUnread,
	listed,
	mentionAsked,
	mentionedIn,
	mentionRuns,
	pageCount,
} from "./comments-model";

const person = (accountId: string) => ({ accountId, name: accountId, color: "#7aa7ff" });

function comment(id: string, at: number, extra: Partial<Comment> = {}): Comment {
	return {
		id,
		audience: "team",
		page: "app",
		frame: "cart",
		at: { x: 10, y: 10 },
		element: null,
		revision: null,
		still: false,
		author: person("ana"),
		agent: false,
		body: "words",
		created: at,
		edited: null,
		resolved: null,
		standing: "placed",
		replies: [],
		...extra,
	};
}

function reply(id: string, by: string, at: number, extra: Partial<CommentReply> = {}): CommentReply {
	return { id, author: person(by), agent: false, body: "yes", created: at, edited: null, draftFor: null, ...extra };
}

describe("unread, for one person", () => {
	it("is anyone else's word after they last read it, never their own and never an edit", () => {
		const anas = comment("c1", 100);
		expect(isUnread(anas, { me: "ben", reads: {} })).toBe(true);
		expect(isUnread(anas, { me: "ana", reads: {} })).toBe(false);
		expect(isUnread(anas, { me: "ben", reads: { c1: 150 } })).toBe(false);
		expect(isUnread({ ...anas, edited: 200 }, { me: "ben", reads: { c1: 150 } })).toBe(false);
		const answered = { ...anas, replies: [reply("r1", "ben", 300)] };
		expect(isUnread(answered, { me: "ana", reads: {} })).toBe(true);
		expect(isUnread(answered, { me: "ben", reads: { c1: 150 } })).toBe(false);
		// a draft waits for its own person only
		const drafted = { ...anas, replies: [reply("r2", "ben", 300, { draftFor: "ben" })] };
		expect(isUnread(drafted, { me: "ana", reads: { c1: 150 } })).toBe(false);
	});
});

describe("for you", () => {
	it("holds what mentions you, and what you wrote or replied in", () => {
		expect(isForYou(comment("c1", 1), "ana")).toBe(true);
		expect(isForYou(comment("c1", 1), "ben")).toBe(false);
		expect(isForYou(comment("c1", 1, { mentions: [person("ben")] }), "ben")).toBe(true);
		expect(isForYou(comment("c1", 1, { replies: [reply("r", "ben", 2)] }), "ben")).toBe(true);
		expect(isForYou(comment("c1", 1, { replies: [reply("r", "cy", 2, { mentions: [person("ben")] })] }), "ben")).toBe(
			true,
		);
		expect(isForYou(comment("c1", 1), null)).toBe(false);
	});
});

describe("the inbox's list", () => {
	const reader = { me: "ben", reads: { old: 500 } };
	const all = [
		comment("old", 1),
		comment("new", 50),
		comment("talked", 10, { replies: [reply("r", "ana", 90)] }),
		comment("done", 70, { resolved: { by: person("ben"), at: 80 } }),
		comment("gone", 60, { standing: "deleted-page", page: "promo" }),
		comment("site", 40, { page: "site" }),
		comment("mine", 30, { author: person("ben") }),
	];
	const ids = (comments: readonly Comment[]) => comments.map((one) => one.id);

	it("lists the page's open comments, newest word first, the resolved and a deleted page's only under Resolved", () => {
		expect(ids(listed(all, FILTERS, reader, "app"))).toEqual(["talked", "new", "mine", "old"]);
		expect(ids(listed(all, { ...FILTERS, resolved: true }, reader, "app"))).toEqual([
			"talked",
			"done",
			"new",
			"mine",
			"old",
		]);
		expect(ids(listed(all, { ...FILTERS, scope: "project", resolved: true }, reader, "app"))).toContain("gone");
		expect(ids(listed(all, { ...FILTERS, scope: "project" }, reader, "app"))).not.toContain("gone");
	});

	it("filters to the unread and to what's for you, and sorts the unread first", () => {
		expect(ids(listed(all, { ...FILTERS, show: "unread" }, reader, "app"))).toEqual(["talked", "new"]);
		expect(ids(listed(all, { ...FILTERS, show: "yours" }, reader, "app"))).toEqual(["mine"]);
		expect(ids(listed(all, { ...FILTERS, sort: "unread" }, reader, "app"))).toEqual(["talked", "new", "mine", "old"]);
		expect(counts(all, reader)).toEqual({ open: 5, resolved: 2, unread: 3, yours: 1 });
	});

	it("groups by frame, or by page, a deleted page's in a group of its own", () => {
		const shown = listed(all, { ...FILTERS, scope: "project", resolved: true }, reader, "app");
		expect(groupsOf(shown, "frame").map((group) => [group.page, group.frame, group.gone, ids(group.items)])).toEqual([
			["app", "cart", null, ["talked", "done", "new", "mine", "old"]],
			["promo", "cart", "page", ["gone"]],
			["site", "cart", null, ["site"]],
		]);
		expect(groupsOf(shown, "page").map((group) => group.page)).toEqual(["app", "promo", "site"]);
	});

	it("counts a page object's open comments, its pages' too, and says whether one is unread", () => {
		const nested = [...all, comment("deep", 1, { page: "site/blog" })];
		expect(pageCount(nested, "site", reader)).toEqual({ open: 2, unread: true });
		expect(pageCount(nested, "promo", reader)).toEqual({ open: 0, unread: false });
	});
});

describe("pins on screen", () => {
	it("gather into one count when a tip stands within 32px of another's, one link at a time", () => {
		const pins = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 30, y: 0 },
			{ id: "c", x: 58, y: 0 },
			{ id: "d", x: 200, y: 0 },
		];
		expect(gather(pins).map((group) => group.map((pin) => pin.id))).toEqual([["a", "b", "c"], ["d"]]);
		expect(gather(pins, 20).map((group) => group.length)).toEqual([1, 1, 1, 1]);
	});

	it("fan out on an arc above the count, each apart", () => {
		const spots = fanOut(3, { x: 100, y: 100 });
		expect(spots).toHaveLength(3);
		for (const spot of spots) expect(spot.y).toBeLessThan(100);
		expect(new Set(spots.map((spot) => spot.x)).size).toBe(3);
	});
});

describe("mentions", () => {
	const people = [
		{ accountId: "a1", name: "Ana" },
		{ accountId: "a2", name: "Ana Lind" },
		{ accountId: "b1", name: "Bo" },
	];

	it("are the members named @Name in the words, the longest name winning", () => {
		expect(mentionedIn("@Ana Lind and @Bo, look", people)).toEqual(["a2", "b1"]);
		expect(mentionedIn("@Ana, @Bob", people)).toEqual(["a1"]);
		expect(mentionedIn("mail@Bo", people)).toEqual(["b1"]);
		expect(mentionRuns("hi @Bo!", people)).toEqual([
			{ text: "hi ", mention: false },
			{ text: "@Bo", mention: true },
			{ text: "!", mention: false },
		]);
		expect(mentionRuns("plain", [])).toEqual([{ text: "plain", mention: false }]);
	});

	it("are asked for by an @ being typed at the end of the words", () => {
		expect(mentionAsked("look @An")).toEqual({ at: 5, typed: "An" });
		expect(mentionAsked("@")).toEqual({ at: 0, typed: "" });
		expect(mentionAsked("mail@x")).toBeNull();
		expect(mentionAsked("@Ana done")).toBeNull();
	});
});

describe("for you, on a share (spool#174)", () => {
	it("is what someone outside the team wrote through a share you made", () => {
		const share = { kind: "link" as const, who: [], by: "ana" };
		const outsiders = comment("c1", 100, {
			author: person("jonas"),
			outsider: true,
			share,
			audience: { share: "s1" },
		});
		expect(isForYou(outsiders, "ana")).toBe(true);
		expect(isForYou(outsiders, "ben")).toBe(false);
		const answered = comment("c2", 100, {
			author: person("ben"),
			share,
			audience: { share: "s1" },
			replies: [reply("r1", "jonas", 200, { outsider: true })],
		});
		expect(isForYou(answered, "ana")).toBe(true);
		// a member's words on the share alone aren't
		expect(isForYou(comment("c3", 100, { author: person("ben"), share, audience: { share: "s1" } }), "ana")).toBe(
			false,
		);
	});
});
