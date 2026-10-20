import { frameFolder } from "../page-path";
import { saidList } from "../share-view";
import type { Comment, CommentPerson, CommentShare } from "../team-sync-protocol";

/**
 * One comment as an agent reads it (spool#164), as one block of text.
 *
 * There is one rendering of a comment and both readers get it: what `spool comments` prints and what a turn's prompt
 * carries when the person sends a comment to their agent are this function, called twice, as the selection block is
 * (`selection-block.ts`). An agent in a terminal and the agent in the rail read one contract.
 *
 * What it says, in order: the comment's id, which is how the verb names it; who wrote it (their agent, when it was;
 * "via" their share, for someone outside the team), who reads it, by the share's readers and its id as `--share`
 * takes it, and whether it is open; where it stands, as a pointer the agent can read the source from (the frame,
 * and the element under the pin with its path, lines and excerpt); that the frame was edited since, when it was; then
 * the first message and every reply, in order. Times are left out: what an agent acts on is the words and where.
 */

/** What the block knows beyond the comment itself. */
export interface CommentBlockContext {
	/** The frame's source changed after the comment was made: what it points at may have moved or gone. */
	editedSince: boolean;
	/** The still from the comment's revision rides with the block, as an image in a prompt. */
	still?: boolean;
}

export function commentBlock(comment: Comment, context: CommentBlockContext): string {
	const lines = [`<comment id="${comment.id}">`, head(comment), ...place(comment)];
	if (context.editedSince)
		lines.push(
			context.still === true
				? "edited since: the frame changed after this comment was made; the image attached is the frame as it was then"
				: "edited since: the frame changed after this comment was made",
		);
	lines.push(...said(who(comment.author, comment.agent, comment), comment.edited !== null, comment.body));
	for (const reply of comment.replies) {
		const by = who(reply.author, reply.agent, reply.outsider === true ? comment : undefined);
		lines.push(...said(reply.draftFor === null ? by : `${by}, a draft not sent`, reply.edited !== null, reply.body));
	}
	lines.push("</comment>");
	return lines.join("\n");
}

/** Comments in a row, a blank line between each: what the verb prints and a prompt leads with. */
export function commentBlocks(blocks: readonly string[]): string {
	return blocks.join("\n\n");
}

/**
 * A person as a comment names them: their agent when it wrote on their behalf, and the share they came through when
 * they are outside the team (`outside`, the comment they wrote under, when they are).
 */
function who(person: CommentPerson, agent: boolean, outside?: Pick<Comment, "outsider" | "share">): string {
	if (agent) return `${person.name}'s agent`;
	if (outside?.outsider !== true || outside.share === undefined) return person.name;
	return `${person.name} via ${shareSaid(outside.share)}`;
}

/** A share by who outside the team reads it: "the link share", "the share with Ines and Ola". */
function shareSaid(share: CommentShare): string {
	if (share.kind === "link") return "the link share";
	return share.who.length === 0 ? "a named share" : `the share with ${saidList(share.who)}`;
}

/** Who wrote it, who reads it, and whether it is open. */
function head(comment: Comment): string {
	const { audience, share } = comment;
	const to =
		audience === "team"
			? "to the team"
			: `to ${share === undefined ? "a share" : shareSaid(share)} [${audience.share}]${share?.ended === true ? ", which ended" : ""}`;
	const { resolved } = comment;
	const state =
		comment.standing === "deleted-page"
			? "page deleted"
			: resolved === null
				? "open"
				: `resolved by ${who(resolved.by, resolved.agent === true)}`;
	return `${who(comment.author, comment.agent, comment)}, ${to}, ${state}`;
}

/** Where it stands: the frame and the element under the pin, or the page's field. */
function place(comment: Comment): string[] {
	const page = comment.page === "" ? "the root page" : `page ${comment.page}`;
	if (comment.standing === "deleted-page") return [`on ${page}, which was deleted`];
	if (comment.standing === "deleted-frame")
		return [
			comment.frame === null
				? `on the field of ${page}, where a deleted frame stood`
				: `on the field of ${page}, where ${comment.frame} stood before it was deleted`,
		];
	if (comment.frame === null) return [`on the field of ${page}`];
	const element = comment.element;
	if (element === null) return [`on ${comment.frame} — design/${frameFolder(comment.frame)}/frame.tsx`];
	return [
		`on ${comment.frame} · ${element.name} — ${element.path}:${element.lines[0]}-${element.lines[1]}`,
		`  ${element.excerpt}`,
	];
}

/** One message: who said it, then its words, every line after the first indented under it. */
function said(by: string, edited: boolean, body: string): string[] {
	const [first = "", ...rest] = body.split("\n");
	return [`${by}${edited ? " (edited)" : ""}: ${first}`, ...rest.map((line) => `  ${line}`)];
}
