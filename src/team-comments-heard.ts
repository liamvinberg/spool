import type { Comment, CommentRefusal, CommentsMessage } from "./team-sync-protocol";

/**
 * A team project's comments as one reader holds them from what the team tells it (ADR 0011): every comment it was
 * last told of, in the order they were made, and when its person last read each one they have read. A Mac's daemon
 * keeps them in its own state; a member's browser on the canvas holds them while it looks (spool#173). Both hear the
 * same messages and put them together the same way here, and neither touches anything else.
 */
export interface HeardComments {
	comments: Comment[];
	reads: Record<string, number>;
	/** A snapshot arriving in parts, put together until its last part, with this person's reads if it says them. */
	incoming?: { comments: Comment[]; reads: Record<string, number> | undefined } | undefined;
}

export const NO_COMMENTS_HEARD: HeardComments = { comments: [], reads: {} };

/**
 * What one comments message makes of what a reader holds: the same object when it says nothing about the comments
 * themselves (an answer to the reader's own write), so a caller tells what changed by identity. A snapshot's parts
 * are held aside until its last, which replaces everything at once.
 */
export function hearComments(held: HeardComments, heard: CommentsMessage): HeardComments {
	const { comments, reads } = held;
	switch (heard.type) {
		case "comments": {
			const was = heard.first ? { comments: [], reads: heard.reads === undefined ? undefined : {} } : held.incoming;
			if (was === undefined) return held;
			const incoming = {
				comments: [...was.comments, ...heard.comments],
				reads: was.reads === undefined ? undefined : { ...was.reads, ...(heard.reads ?? {}) },
			};
			if (!heard.last) return { comments, reads, incoming };
			// a snapshot sent again to every reader (a rename) says nobody's reads: this person's stand
			const kept =
				incoming.reads ??
				Object.fromEntries(Object.entries(reads).filter(([id]) => incoming.comments.some((one) => one.id === id)));
			return { comments: incoming.comments, reads: kept };
		}
		case "comment-changed":
			// a comment as it now is, in its place in the order; one never heard of is one more
			return {
				...held,
				comments: comments.some((comment) => comment.id === heard.comment.id)
					? comments.map((comment) => (comment.id === heard.comment.id ? heard.comment : comment))
					: [...comments, heard.comment],
			};
		case "comment-removed": {
			const { [heard.id]: _gone, ...rest } = reads;
			return { ...held, comments: comments.filter((comment) => comment.id !== heard.id), reads: rest };
		}
		case "comment-seen": {
			const { [heard.comment]: _was, ...rest } = reads;
			return { ...held, reads: heard.read === null ? rest : { ...rest, [heard.comment]: heard.read } };
		}
		case "comment-added":
			return {
				...held,
				comments: [...comments.filter((comment) => comment.id !== heard.comment.id), heard.comment],
			};
		case "comment-replied":
			return {
				...held,
				comments: comments.map((comment) =>
					comment.id === heard.comment
						? {
								...comment,
								replies: [...comment.replies.filter((reply) => reply.id !== heard.reply.id), heard.reply],
							}
						: comment,
				),
			};
		case "comment-posted":
		case "comment-refused":
		case "comment-still":
			return held;
	}
}

/**
 * Why the team wouldn't take a comment, a reply or a change, in the words a person reads: the same on a Mac and in a
 * browser, but for being signed out, which each says of itself.
 */
export function commentRefusalSays(
	reason: CommentRefusal,
	where: "mac" | "browser",
	retryAfter?: number | undefined,
): string {
	if (reason === "signed_out")
		return where === "mac" ? "this Mac is signed out of spool.page" : "you're signed out of spool.page";
	const said = REFUSALS[reason];
	return reason === "rate_limited" && retryAfter !== undefined
		? `${said} (in ${retryAfter} second${retryAfter === 1 ? "" : "s"})`
		: said;
}

const REFUSALS: Record<Exclude<CommentRefusal, "signed_out">, string> = {
	invalid_comment: "a comment needs words, and at most 4,000 characters of them",
	still_too_large: "the frame's picture was too large to keep with the comment",
	comment_not_found: "that comment isn't there anymore",
	not_editor: "you aren't an editor of this project anymore",
	unpaid: "the team has no paid time left",
	unavailable: "spool.page couldn't take the comment just now",
	too_long: "a comment or reply is at most 4,000 characters",
	rate_limited: "that's more comments than spool.page takes from one person in a minute; wait a moment and send again",
	too_many_open: "this project has as many open comments as it can hold; resolve some to make room",
	not_author: "only its author can edit it, and only its author or an editor can delete it",
	blocked: "the team has blocked you from commenting on this share",
	share_ended: "this share has ended, so its comments take nothing new",
	share_limited: "this link has had as many comments as it takes in a day; try again later",
};
