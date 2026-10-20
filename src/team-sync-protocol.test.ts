import { describe, expect, it } from "vitest";
import {
	COMMENT_BODY_LIMIT,
	type Comment,
	type CommentPost,
	PRESENCE_AGENT_WORDS,
	PRESENCE_AGENT_WORK,
	type PresenceAgent,
	type PresenceState,
	readComment,
	readCommentPost,
	readCommentReplyPost,
	readCommentsMessage,
	readPresence,
	readPresenceState,
} from "./team-sync-protocol";

/**
 * A presence state as a daemon, a browser or spool.page reads it: copied field by field and
 * bounded, so what one person says stays small for everyone it is relayed to.
 */

const here: PresenceState = {
	page: "ideas",
	pointer: { x: 1, y: 2 },
	pressed: false,
	dragging: [],
	inside: null,
	view: null,
};

const agent: PresenceAgent = {
	running: true,
	status: "2 designers working",
	work: [
		{ frame: "ideas/home--calm", act: "reading", detail: "Read the home frame", lines: 0 },
		{ frame: "app/home", act: "edit", detail: null, lines: 120 },
	],
};

describe("a presence state's agent (#378)", () => {
	it("is copied whole when it is well formed, and is no part of a state that has none", () => {
		expect(readPresenceState({ ...here, agent })).toEqual({ ...here, agent });
		expect(readPresenceState(here)).toEqual(here);
		expect(readPresenceState(here)).not.toHaveProperty("agent");
		expect(readPresenceState({ ...here, agent: { ...agent, status: null, work: [] } })).toEqual({
			...here,
			agent: { running: true, status: null, work: [] },
		});
	});

	it("copies only the fields it knows", () => {
		const read = readPresenceState({
			...here,
			extra: "no",
			agent: { ...agent, secret: "no", work: [{ ...agent.work[0], source: "export default …" }] },
		});
		expect(read).toEqual({ ...here, agent: { ...agent, work: [agent.work[0]] } });
	});

	it("drops an agent past its bounds or not well formed, and keeps where the person is", () => {
		const one = agent.work[0];
		const wrong = [
			"working",
			{ ...agent, running: "yes" },
			{ ...agent, status: "x".repeat(PRESENCE_AGENT_WORDS + 1) },
			{ ...agent, work: Array.from({ length: PRESENCE_AGENT_WORK + 1 }, () => one) },
			{ ...agent, work: [{ ...one, frame: "x".repeat(161) }] },
			{ ...agent, work: [{ ...one, act: "a-word-far-too-long-to-be-one" }] },
			{ ...agent, work: [{ ...one, detail: "x".repeat(PRESENCE_AGENT_WORDS + 1) }] },
			{ ...agent, work: [{ ...one, lines: -1 }] },
			{ ...agent, work: [{ ...one, lines: 1.5 }] },
			{ ...agent, work: "calm" },
		];
		for (const value of wrong) expect(readPresenceState({ ...here, agent: value })).toEqual(here);
		expect(
			readPresenceState({
				...here,
				agent: { ...agent, work: Array.from({ length: PRESENCE_AGENT_WORK }, () => one) },
			})?.agent?.work,
		).toHaveLength(PRESENCE_AGENT_WORK);
	});

	it("rides a relayed presence message to the canvas", () => {
		const message = {
			type: "presence",
			person: { accountId: "ada", name: "ada", color: "#eaa94a" },
			state: { ...here, agent },
			still: 0,
		};
		expect(readPresence(message)?.state).toEqual({ ...here, agent });
	});
});

/**
 * Comments as the object, a daemon and a browser read them off the socket: one definition, copied field by field,
 * so what reaches a reader is only ever what the protocol says a comment is.
 */
describe("comments on the sync socket", () => {
	const post: CommentPost = {
		type: "comment-post",
		ref: "r1",
		page: "app",
		frame: "app/receipt",
		at: { x: 197, y: 428 },
		element: {
			name: "h2",
			path: "design/frames/app/receipt/frame.tsx",
			lines: [12, 14],
			selector: "main > h2",
			excerpt: "<h2>Thanks!</h2>",
		},
		revision: "a".repeat(64),
		body: "Thanks! is loud for a receipt.",
	};
	const ana = { accountId: "acc-ana", name: "ana", color: "#7aa7ff" };
	const comment: Comment = {
		id: "k3m9p2qa",
		audience: "team",
		page: "app",
		frame: "app/receipt",
		at: { x: 197, y: 428 },
		element: post.element,
		revision: post.revision,
		still: true,
		author: ana,
		agent: false,
		body: post.body,
		created: 1_000,
		edited: null,
		resolved: null,
		standing: "placed",
		replies: [
			{
				id: "r7x2",
				author: ana,
				agent: false,
				body: "Or the order number.",
				created: 2_000,
				edited: null,
				draftFor: null,
			},
		],
	};

	it("takes a post on a frame or on the field, and only the fields it knows", () => {
		expect(readCommentPost({ ...post })).toEqual(post);
		expect(readCommentPost({ ...post, author: "someone else", extra: 1 })).toEqual(post);
		const field = { ...post, frame: null, element: null, revision: null, at: { x: -40.5, y: 1200 } };
		expect(readCommentPost(field)).toEqual(field);
		expect(readCommentPost({ ...post, page: "" })).toEqual({ ...post, page: "" });
		expect(readCommentPost({ ...post, agent: true })).toEqual({ ...post, agent: true });
	});

	it("refuses a post whose words are empty or too long, or that is not well formed", () => {
		const wrong = [
			{ ...post, body: "" },
			{ ...post, body: "  \n " },
			{ ...post, body: "x".repeat(COMMENT_BODY_LIMIT + 1) },
			{ ...post, at: { x: Number.NaN, y: 1 } },
			{ ...post, frame: "" },
			{ ...post, revision: "not a hash" },
			{ ...post, element: { ...post.element, lines: [1] } },
			// the field has no frame, so no element and no revision
			{ ...post, frame: null },
			{ ...post, ref: "" },
			{ ...post, agent: false },
		];
		for (const message of wrong) expect(readCommentPost(message)).toBeUndefined();
		expect(readCommentPost({ ...post, body: "x".repeat(COMMENT_BODY_LIMIT) })).toBeDefined();
	});

	it("takes a reply to a comment by its id", () => {
		const reply = { type: "comment-reply", ref: "r2", comment: comment.id, body: "On it." };
		expect(readCommentReplyPost(reply)).toEqual(reply);
		expect(readCommentReplyPost({ ...reply, comment: "" })).toBeUndefined();
		expect(readCommentReplyPost({ ...reply, body: " " })).toBeUndefined();
	});

	it("reads a comment back as it was sent, its replies in order", () => {
		const sent = JSON.parse(JSON.stringify(comment)) as unknown;
		expect(readComment(sent)).toEqual(comment);
		expect(readComment({ ...comment, audience: { share: "s1" } })).toEqual({ ...comment, audience: { share: "s1" } });
		expect(readComment({ ...comment, standing: "gone" })).toBeUndefined();
		expect(readComment({ ...comment, author: { accountId: "acc-ana" } })).toBeUndefined();
		expect(readComment({ ...comment, replies: [{ id: "r" }] })).toBeUndefined();
	});

	it("reads the object's messages about comments, and nothing else", () => {
		expect(readCommentsMessage({ type: "comments", comments: [comment], first: true, last: true })).toEqual({
			type: "comments",
			comments: [comment],
			first: true,
			last: true,
		});
		expect(readCommentsMessage({ type: "comment-added", comment })).toEqual({ type: "comment-added", comment });
		expect(readCommentsMessage({ type: "comment-posted", ref: "r1", id: comment.id })).toEqual({
			type: "comment-posted",
			ref: "r1",
			id: comment.id,
		});
		expect(readCommentsMessage({ type: "comment-refused", ref: "r1", reason: "not_editor" })).toEqual({
			type: "comment-refused",
			ref: "r1",
			reason: "not_editor",
		});
		expect(readCommentsMessage({ type: "comment-refused", ref: "r1", reason: "because" })).toBeUndefined();
		expect(readCommentsMessage({ type: "comments", comments: [{}], first: true, last: true })).toBeUndefined();
		expect(readCommentsMessage({ type: "presence" })).toBeUndefined();
	});
});
