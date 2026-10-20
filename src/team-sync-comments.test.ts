import { describe, expect, it } from "vitest";
import {
	COMMENT_CHANGE_TYPES,
	changeRefusal,
	forReader,
	isCommentChange,
	memberPostRefusal,
	takeFromBucket,
	windowWait,
} from "./team-sync-comments";
import type { Comment, CommentPost } from "./team-sync-protocol";

const DAY = 24 * 3600_000;

describe("the comment rules both spool.page and the fake keep", () => {
	it("know every change a socket sends, the draft's send among them", () => {
		expect(COMMENT_CHANGE_TYPES).toContain("comment-send");
		expect(isCommentChange("comment-send")).toBe(true);
		expect(isCommentChange("comment-post")).toBe(false);
	});

	it("cap a link share's day over any 24 hours, never twice the cap across a refill", () => {
		const times: number[] = [];
		let now = 0;
		for (; windowWait(times, 300, DAY, now) === undefined; now += 1000) times.push(now);
		expect(times).toHaveLength(300);
		// half a day on, the bucket a refill would have half-filled takes nothing
		expect(windowWait(times, 300, DAY, DAY / 2)).toBeGreaterThan(0);
		// the first post leaves the window a day after it was made
		expect(windowWait(times, 300, DAY, DAY - 1)).toBe(1);
		expect(windowWait(times, 300, DAY, DAY + 1)).toBeUndefined();
	});

	it("refill a person's minute continuously, and say how long until one fits", () => {
		let bucket: { level: number; at: number } | undefined;
		for (let post = 0; post < 10; post += 1) {
			const taken = takeFromBucket(bucket, 10, 60_000, 0);
			if (!("bucket" in taken)) throw new Error("refused early");
			bucket = taken.bucket;
		}
		expect(takeFromBucket(bucket, 10, 60_000, 0)).toEqual({ retryAfter: 6 });
		expect(takeFromBucket(bucket, 10, 60_000, 6_000)).toMatchObject({ bucket: { at: 6_000 } });
	});

	it("let only the member a draft waits for send it, and nobody touch another's draft", () => {
		const draft = { audience: "s1", author: "ana", draftFor: "ana" };
		const send = { type: "comment-send", ref: "r", comment: "c", reply: "d" } as const;
		expect(changeRefusal(send, { accountId: "ana", share: null, edits: true }, draft)).toBeUndefined();
		expect(changeRefusal(send, { accountId: "ben", share: null, edits: true }, draft)).toBe("not_author");
		expect(changeRefusal(send, { accountId: "ana", share: "s1", pages: [""], edits: false }, draft)).toBe(
			"not_author",
		);
		const remove = { type: "comment-delete", ref: "r", comment: "c", reply: "d" } as const;
		expect(changeRefusal(remove, { accountId: "ben", share: null, edits: true }, draft)).toBe("comment_not_found");
		// someone on another share reads none of it
		const resolve = { type: "comment-resolve", ref: "r", comment: "c" } as const;
		expect(changeRefusal(resolve, { accountId: "jo", share: "s2", pages: [""], edits: false }, draft)).toBe(
			"comment_not_found",
		);
	});

	it("give a share's reader its comments only on the pages it shows, so a moved frame's names stay the team's", () => {
		const ana = { accountId: "ana", name: "Ana", color: "#000" };
		const comment: Comment = {
			id: "c1",
			audience: { share: "s1" },
			page: "",
			frame: "home",
			at: { x: 0, y: 0 },
			element: null,
			revision: null,
			still: false,
			author: ana,
			agent: false,
			body: "For the client",
			created: 1,
			edited: null,
			resolved: null,
			standing: "placed",
			replies: [],
		};
		const reader = { accountId: "jo", share: "s1", pages: [""] } as const;
		expect(forReader(comment, reader)?.frame).toBe("home");
		expect(forReader({ ...comment, page: "secret", frame: "secret/home" }, reader)).toBeUndefined();
		expect(forReader({ ...comment, page: "secret" }, { accountId: "ana", share: null })?.page).toBe("secret");
	});

	it("take a member's share comment only to a live share of its page, never from their agent", () => {
		const post: CommentPost = {
			type: "comment-post",
			ref: "r",
			page: "plans",
			frame: "plans/table",
			at: { x: 0, y: 0 },
			element: null,
			revision: null,
			body: "For the client",
			audience: { share: "s1" },
		};
		expect(memberPostRefusal(post, { pages: ["plans"] })).toBeUndefined();
		expect(memberPostRefusal(post, { pages: [""] })).toBe("invalid_comment");
		expect(memberPostRefusal(post, "ended")).toBe("share_ended");
		expect(memberPostRefusal({ ...post, agent: true }, { pages: ["plans"] })).toBe("invalid_comment");
		expect(memberPostRefusal({ ...post, audience: "team" }, undefined)).toBeUndefined();
	});
});
