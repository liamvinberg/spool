import { describe, expect, it } from "vitest";
import { commentRefusalSays, hearComments, NO_COMMENTS_HEARD } from "./team-comments-heard";
import type { Comment } from "./team-sync-protocol";

const person = { accountId: "ana", name: "Ana", color: "#f00" };
const comment = (id: string, created = 1): Comment => ({
	id,
	audience: "team",
	page: "",
	frame: null,
	at: { x: 0, y: 0 },
	element: null,
	revision: null,
	still: false,
	standing: "placed",
	author: person,
	agent: false,
	body: id,
	created,
	edited: null,
	resolved: null,
	replies: [],
});

describe("hearComments", () => {
	it("puts a snapshot's parts together and replaces what was held only at its last", () => {
		const held = { comments: [comment("old")], reads: { old: 5 } };
		const first = hearComments(held, {
			type: "comments",
			comments: [comment("a")],
			first: true,
			last: false,
			reads: { a: 3 },
		});
		expect(first.comments.map((one) => one.id)).toEqual(["old"]);
		const last = hearComments(first, { type: "comments", comments: [comment("b")], first: false, last: true });
		expect(last).toEqual({ comments: [comment("a"), comment("b")], reads: { a: 3 } });
	});

	it("keeps the person's reads of comments still there when a snapshot says nobody's", () => {
		const held = { comments: [comment("a"), comment("b")], reads: { a: 3, b: 4 } };
		const next = hearComments(held, { type: "comments", comments: [comment("a")], first: true, last: true });
		expect(next.reads).toEqual({ a: 3 });
	});

	it("adds, replies, changes, removes and reads, and leaves the held object as it is for an answer", () => {
		let held = hearComments(NO_COMMENTS_HEARD, { type: "comment-added", comment: comment("a") });
		held = hearComments(held, {
			type: "comment-replied",
			comment: "a",
			reply: { id: "r", author: person, agent: false, body: "r", created: 2, edited: null, draftFor: null },
		});
		expect(held.comments[0]?.replies.map((one) => one.id)).toEqual(["r"]);
		held = hearComments(held, { type: "comment-changed", comment: { ...comment("a"), body: "edited" } });
		expect(held.comments[0]?.body).toBe("edited");
		// one never heard of (a comment repointed onto what this reader reads) is one more
		const appended = hearComments(held, { type: "comment-changed", comment: comment("z") });
		expect(appended.comments.map((one) => one.id)).toEqual(["a", "z"]);
		held = hearComments(held, { type: "comment-seen", comment: "a", read: 9 });
		expect(held.reads).toEqual({ a: 9 });
		expect(hearComments(held, { type: "comment-posted", ref: "c1", id: "a" })).toBe(held);
		held = hearComments(held, { type: "comment-removed", id: "a" });
		expect(held).toEqual({ comments: [], reads: {} });
	});
});

describe("commentRefusalSays", () => {
	it("says signed out of the Mac or the browser, and when a rate limit lifts", () => {
		expect(commentRefusalSays("signed_out", "mac")).toBe("this Mac is signed out of spool.page");
		expect(commentRefusalSays("signed_out", "browser")).toBe("you're signed out of spool.page");
		expect(commentRefusalSays("rate_limited", "browser", 1)).toMatch(/\(in 1 second\)$/u);
	});
});
