import { describe, expect, it } from "vitest";
import type { Comment, CommentReply } from "../team-sync-protocol";
import { commentBlock, commentBlocks } from "./comment-block";

/**
 * The one rendering of a comment (spool#164): what `spool comments` prints and what a prompt carries when a comment
 * is sent to the agent are this function called twice, so what is asserted here holds for both readers. The block
 * names the comment by the id the verb takes, says who wrote it and who reads it, points at the source the way the
 * selection block does, says when the frame changed since, and carries every message in order.
 */

const ana = { accountId: "acc-ana", name: "Ana", color: "#7aa7ff" };
const bo = { accountId: "acc-bo", name: "Bo", color: "#eaa94a" };

const comment = (over: Partial<Comment> = {}): Comment => ({
	id: "k3m9p2qa",
	audience: "team",
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
	still: true,
	author: ana,
	agent: false,
	body: "Thanks! is loud for a receipt.",
	created: 1_000,
	edited: null,
	resolved: null,
	standing: "placed",
	replies: [],
	...over,
});

const reply = (over: Partial<CommentReply> = {}): CommentReply => ({
	id: "r7x2",
	author: bo,
	agent: false,
	body: "Or the order number.",
	created: 2_000,
	edited: null,
	draftFor: null,
	...over,
});

describe("the comment block", () => {
	it("names the comment, who wrote it and who reads it, points at the element, then says the words", () => {
		expect(commentBlock(comment(), { editedSince: false })).toBe(
			[
				'<comment id="k3m9p2qa">',
				"Ana, to the team, open",
				"on app/receipt · h2 — design/frames/app/receipt/frame.tsx:12-14",
				"  <h2>Thanks!</h2>",
				"Ana: Thanks! is loud for a receipt.",
				"</comment>",
			].join("\n"),
		);
	});

	it("carries every reply in order, an agent's as its person's agent", () => {
		const block = commentBlock(
			comment({
				replies: [
					reply(),
					reply({ id: "r8", author: ana, agent: true, body: "Toned it down to a label." }),
					reply({ id: "r9", body: "Better." }),
				],
			}),
			{ editedSince: false },
		);

		expect(block.split("\n").slice(4, -1)).toEqual([
			"Ana: Thanks! is loud for a receipt.",
			"Bo: Or the order number.",
			"Ana's agent: Toned it down to a label.",
			"Bo: Better.",
		]);
	});

	it("says an agent wrote the comment itself, and who resolved it", () => {
		const block = commentBlock(comment({ agent: true, resolved: { by: bo, at: 3_000 } }), { editedSince: false });

		expect(block.split("\n")[1]).toBe("Ana's agent, to the team, resolved by Bo");
		expect(block).toContain("\nAna's agent: Thanks! is loud for a receipt.\n");
		const byAgent = comment({ resolved: { by: bo, at: 3_000, agent: true } });
		expect(commentBlock(byAgent, { editedSince: false }).split("\n")[1]).toBe(
			"Ana, to the team, resolved by Bo's agent",
		);
	});

	it("points at the frame alone when nothing was under the pin", () => {
		expect(commentBlock(comment({ element: null }), { editedSince: false }).split("\n")[2]).toBe(
			"on app/receipt — design/frames/app/receipt/frame.tsx",
		);
	});

	it("says where a comment on the field stands, and on a frame or page since deleted", () => {
		const field = { frame: null, element: null, revision: null };
		expect(commentBlock(comment(field), { editedSince: false }).split("\n")[2]).toBe("on the field of page app");
		expect(commentBlock(comment({ ...field, page: "" }), { editedSince: false }).split("\n")[2]).toBe(
			"on the field of the root page",
		);
		expect(commentBlock(comment({ standing: "deleted-frame" }), { editedSince: false }).split("\n")[2]).toBe(
			"on the field of page app, where app/receipt stood before it was deleted",
		);
		expect(commentBlock(comment({ standing: "deleted-page" }), { editedSince: false }).split("\n")[2]).toBe(
			"on page app, which was deleted",
		);
	});

	it("says the frame was edited since, and that the still from then is attached when it is", () => {
		expect(commentBlock(comment(), { editedSince: true }).split("\n")[4]).toBe(
			"edited since: the frame changed after this comment was made",
		);
		expect(commentBlock(comment(), { editedSince: true, still: true }).split("\n")[4]).toBe(
			"edited since: the frame changed after this comment was made; the image attached is the frame as it was then",
		);
	});

	it("names a share's audience, marks edited words, and keeps a draft apart from what was sent", () => {
		const block = commentBlock(
			comment({
				audience: { share: "s1" },
				edited: 1_500,
				replies: [reply({ author: ana, agent: true, draftFor: "acc-ana", body: "We'll fix it today." })],
			}),
			{ editedSince: false, shareName: (id) => (id === "s1" ? "Northwind review" : undefined) },
		);

		expect(block.split("\n")[1]).toBe("Ana, to share Northwind review, open");
		expect(block).toContain("\nAna (edited): Thanks! is loud for a receipt.\n");
		expect(block).toContain("\nAna's agent, a draft not sent: We'll fix it today.\n");
		expect(commentBlock(comment({ audience: { share: "s2" } }), { editedSince: false }).split("\n")[1]).toBe(
			"Ana, to share s2, open",
		);
	});

	it("indents a message's later lines under it, so the block's shape holds", () => {
		const block = commentBlock(comment({ body: "Two things:\n- the heading\n- the total" }), { editedSince: false });

		expect(block.split("\n").slice(4, -1)).toEqual(["Ana: Two things:", "  - the heading", "  - the total"]);
	});

	it("puts a blank line between blocks", () => {
		expect(commentBlocks(["<comment>a</comment>", "<comment>b</comment>"])).toBe(
			"<comment>a</comment>\n\n<comment>b</comment>",
		);
	});
});
