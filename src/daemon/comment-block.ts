import { frameFolder } from "../page-path";
import type { Comment, CommentPerson } from "../team-sync-protocol";

/**
 * One comment as an agent reads it (spool#164), as one block of text.
 *
 * There is one rendering of a comment and both readers get it: what `spool comments` prints and what a turn's prompt
 * carries when the person sends a comment to their agent are this function, called twice, as the selection block is
 * (`selection-block.ts`). An agent in a terminal and the agent in the rail read one contract.
 *
 * What it says, in order: the comment's id, which is how the verb names it; who wrote it (their agent, when it was),
 * who reads it and whether it is open; where it stands, as a pointer the agent can read the source from (the frame,
 * and the element under the pin with its path, lines and excerpt); that the frame was edited since, when it was; then
 * the first message and every reply, in order. Times are left out: what an agent acts on is the words and where.
 */

/** What the block knows beyond the comment itself. */
export interface CommentBlockContext {
	/** The frame's source changed after the comment was made: what it points at may have moved or gone. */
	editedSince: boolean;
	/** The still from the comment's revision rides with the block, as an image in a prompt. */
	still?: boolean;
	/** A share's name by its id, for a comment whose audience is one share; its id when there is none. */
	shareName?: (id: string) => string | undefined;
}

export function commentBlock(comment: Comment, context: CommentBlockContext): string {
	const lines = [`<comment id="${comment.id}">`, head(comment, context), ...place(comment)];
	if (context.editedSince)
		lines.push(
			context.still === true
				? "edited since: the frame changed after this comment was made; the image attached is the frame as it was then"
				: "edited since: the frame changed after this comment was made",
		);
	lines.push(...said(who(comment.author, comment.agent), comment.edited !== null, comment.body));
	for (const reply of comment.replies) {
		const by = who(reply.author, reply.agent);
		lines.push(...said(reply.draftFor === null ? by : `${by}, a draft not sent`, reply.edited !== null, reply.body));
	}
	lines.push("</comment>");
	return lines.join("\n");
}

/** Comments in a row, a blank line between each: what the verb prints and a prompt leads with. */
export function commentBlocks(blocks: readonly string[]): string {
	return blocks.join("\n\n");
}

/** A person as a comment names them: their agent when it wrote on their behalf. */
function who(person: CommentPerson, agent: boolean): string {
	return agent ? `${person.name}'s agent` : person.name;
}

/** Who wrote it, who reads it, and whether it is open. */
function head(comment: Comment, context: CommentBlockContext): string {
	const audience =
		comment.audience === "team"
			? "to the team"
			: `to share ${context.shareName?.(comment.audience.share) ?? comment.audience.share}`;
	const state = comment.resolved === null ? "open" : `resolved by ${comment.resolved.by.name}`;
	return `${who(comment.author, comment.agent)}, ${audience}, ${state}`;
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
