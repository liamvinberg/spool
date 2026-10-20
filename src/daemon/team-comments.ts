import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";
import type { ProjectLink } from "../team-project";
import {
	type Comment,
	type CommentChange,
	type CommentPost,
	type CommentRefusal,
	type CommentReplyPost,
	encodeFrame,
	readComment,
	readCommentsMessage,
} from "../team-sync-protocol";
import type { SyncSocket } from "./team-sync";

/**
 * A local copy's share of its team project's comments (ADR 0011): every comment it was last told of and when, kept
 * in this machine's own state (never in `design/`) so a canvas shows them offline and after a restart, and what this
 * machine's person writes, sent on the copy's sync connection while it is caught up and answered by the team.
 *
 * Comments are never saves: they ride the socket, never the files, and nothing here touches `design/`.
 */

/**
 * Where this machine keeps a team project's comments: in its own state, by the project's address, so every local
 * copy of one project reads the same, and a copy reads them offline from nothing but its `spool.json`.
 */
export function keptCommentsFile(spoolDir: string, link: ProjectLink): string {
	return join(spoolDir, "comments", new URL(link.origin).host, link.team, `${link.project}.json`);
}

/**
 * The comments a copy last heard, and when it heard them: null when it never has. With them, when this machine's
 * person last read each one they have read, by its id, which reaches every Mac and browser of theirs.
 */
export interface KeptComments {
	heard: number | null;
	comments: Comment[];
	reads: Record<string, number>;
}

/** What a person writes for a new comment: where it stands and its words. The team says who wrote it. */
export type NewComment = Omit<CommentPost, "type" | "ref">;
/** What a person writes under a comment. */
export type NewReply = Omit<CommentReplyPost, "type" | "ref">;
/** A change a person makes to a comment that is there: resolve, reopen, edit, delete, read or mark unread. */
export type NewChange = CommentChange extends infer Change
	? Change extends CommentChange
		? Omit<Change, "ref">
		: never
	: never;

/** Comments can't be written now: the copy isn't connected to its team, so nothing is queued. */
export class CommentsOffline extends SpoolError {
	override readonly name = "CommentsOffline";
	constructor() {
		super("comments need spool.page, and this project isn't connected to it right now; try again once it is");
	}
}

/** The team wouldn't take a comment or reply, and why. */
export class CommentRefused extends SpoolError {
	override readonly name = "CommentRefused";
	constructor(
		readonly reason: CommentRefusal,
		readonly retryAfter?: number,
	) {
		super(
			reason === "rate_limited" && retryAfter !== undefined
				? `${REFUSALS[reason]} (in ${retryAfter} second${retryAfter === 1 ? "" : "s"})`
				: REFUSALS[reason],
		);
	}
}

const REFUSALS: Record<CommentRefusal, string> = {
	invalid_comment: "a comment needs words, and at most 4,000 characters of them",
	still_too_large: "the frame's picture was too large to keep with the comment",
	comment_not_found: "that comment isn't there anymore",
	signed_out: "this Mac is signed out of spool.page",
	not_editor: "you aren't an editor of this project anymore",
	unpaid: "the team has no paid time left",
	unavailable: "spool.page couldn't take the comment just now",
	too_long: "a comment or reply is at most 4,000 characters",
	rate_limited: "that's more comments than spool.page takes from one person in a minute; wait a moment and send again",
	too_many_open: "this project has as many open comments as it can hold; resolve some to make room",
	not_author: "only its author can edit it, and only its author or an editor can delete it",
};

/** How long a comment waits on the team's answer before it is said to have failed. */
const ANSWER_MS = 15_000;

export interface CopyComments {
	/** Hear one message from the team, with the bytes riding it: true when it was about comments. */
	hear(message: Record<string, unknown>, bytes?: Uint8Array): boolean;
	/** Every comment this copy knows, in the order they were made, and when it last heard them. */
	list(): KeptComments;
	/** Send a new comment on a caught-up connection, with the frame's still if there is one. Its id. */
	post(socket: SyncSocket | undefined, comment: NewComment, still?: Uint8Array): Promise<string>;
	/** Send a reply on a caught-up connection. Its id. */
	reply(socket: SyncSocket | undefined, reply: NewReply): Promise<string>;
	/** Send a change to a comment on a caught-up connection; settled once the team took it and said what changed. */
	change(socket: SyncSocket | undefined, change: NewChange): Promise<string>;
	/** Ask the team for the still a comment kept of its frame: its bytes, or undefined when it kept none. */
	still(socket: SyncSocket | undefined, comment: string): Promise<Uint8Array | undefined>;
	/** The connection went: whatever waits on an answer fails as offline. */
	lost(): void;
}

/** A copy's comments, kept in `file`; with none, they're only held while the copy runs. */
export function copyComments(file: string | undefined, onChange?: () => void): CopyComments {
	let { heard, comments, reads } = file === undefined ? { heard: null, comments: [], reads: {} } : readKept(file);
	/** A snapshot arriving in parts, put together until its last part, with this person's reads if it says them. */
	let incoming: { comments: Comment[]; reads: Record<string, number> | undefined } | undefined;
	let refs = 0;
	const waiting = new Map<
		string,
		{ resolve(answer: Answer): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
	>();

	let kept = JSON.stringify({ comments, reads });
	/** Keep what was heard and when; a canvas is told only when it brought something new. */
	const keep = () => {
		heard = Date.now();
		if (file !== undefined) {
			mkdirSync(dirname(file), { recursive: true });
			writeAtomic(file, `${JSON.stringify({ heard, comments, reads })}\n`);
		}
		const now = JSON.stringify({ comments, reads });
		if (now === kept) return;
		kept = now;
		onChange?.();
	};
	const settle = (ref: string, outcome: Answer | { error: Error }): void => {
		const waiter = waiting.get(ref);
		if (waiter === undefined) return;
		waiting.delete(ref);
		clearTimeout(waiter.timer);
		if ("error" in outcome) waiter.reject(outcome.error);
		else waiter.resolve(outcome);
	};
	const send = (socket: SyncSocket | undefined, message: Record<string, unknown>, bytes?: Uint8Array) => {
		if (socket === undefined) return Promise.reject(new CommentsOffline());
		refs += 1;
		const ref = `c${refs}`;
		return new Promise<Answer>((resolve, reject) => {
			const timer = setTimeout(() => settle(ref, { error: new CommentRefused("unavailable") }), ANSWER_MS);
			timer.unref?.();
			waiting.set(ref, { resolve, reject, timer });
			socket.send(encodeFrame({ ...message, ref }, bytes));
		});
	};

	return {
		hear(message, bytes) {
			if (!String(message.type).startsWith("comment")) return false;
			const heard = readCommentsMessage(message);
			if (heard === undefined) return true;
			switch (heard.type) {
				case "comments":
					if (heard.first) incoming = { comments: [], reads: heard.reads === undefined ? undefined : {} };
					if (incoming !== undefined) {
						incoming.comments.push(...heard.comments);
						if (incoming.reads !== undefined) Object.assign(incoming.reads, heard.reads ?? {});
					}
					if (heard.last && incoming !== undefined) {
						comments = incoming.comments;
						// a snapshot sent again to every reader (a rename) says nobody's reads: this person's stand
						if (incoming.reads !== undefined) reads = incoming.reads;
						else
							reads = Object.fromEntries(
								Object.entries(reads).filter(([id]) => comments.some((one) => one.id === id)),
							);
						incoming = undefined;
						keep();
					}
					break;
				case "comment-changed":
					comments = comments.map((comment) => (comment.id === heard.comment.id ? heard.comment : comment));
					keep();
					break;
				case "comment-removed": {
					comments = comments.filter((comment) => comment.id !== heard.id);
					const { [heard.id]: _gone, ...rest } = reads;
					reads = rest;
					keep();
					break;
				}
				case "comment-seen": {
					const { [heard.comment]: _was, ...rest } = reads;
					reads = heard.read === null ? rest : { ...rest, [heard.comment]: heard.read };
					keep();
					break;
				}
				case "comment-added":
					comments = [...comments.filter((comment) => comment.id !== heard.comment.id), heard.comment];
					keep();
					break;
				case "comment-replied":
					comments = comments.map((comment) =>
						comment.id === heard.comment
							? {
									...comment,
									replies: [...comment.replies.filter((reply) => reply.id !== heard.reply.id), heard.reply],
								}
							: comment,
					);
					keep();
					break;
				case "comment-posted":
					settle(heard.ref, { id: heard.id });
					break;
				case "comment-still":
					settle(heard.ref, { still: bytes });
					break;
				case "comment-refused":
					settle(heard.ref, { error: new CommentRefused(heard.reason, heard.retryAfter) });
					break;
			}
			return true;
		},
		list: () => ({ heard, comments, reads }),
		post: (socket, comment, still) => send(socket, { type: "comment-post", ...comment }, still).then(posted),
		reply: (socket, reply) => send(socket, { type: "comment-reply", ...reply }).then(posted),
		change: (socket, change) => send(socket, { ...change }).then(posted),
		still: (socket, comment) =>
			send(socket, { type: "comment-still-ask", comment }).then((answer) =>
				"still" in answer ? answer.still : undefined,
			),
		lost() {
			incoming = undefined;
			for (const ref of [...waiting.keys()]) settle(ref, { error: new CommentsOffline() });
		},
	};
}

/** What the team answers a write or an ask with: the new id, or a still's bytes (none when it kept none). */
type Answer = { id: string } | { still: Uint8Array | undefined };

/** A write's answer: the id the team gave it. */
function posted(answer: Answer): string {
	if ("id" in answer) return answer.id;
	throw new CommentRefused("unavailable");
}

/** The comments a copy last heard and when, as it kept them; none when it kept none or they can't be read. */
export function readKept(file: string): KeptComments {
	let kept: unknown;
	try {
		kept = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return { heard: null, comments: [], reads: {} };
	}
	if (typeof kept !== "object" || kept === null || !("comments" in kept) || !Array.isArray(kept.comments))
		return { heard: null, comments: [], reads: {} };
	const heard = "heard" in kept && typeof kept.heard === "number" && Number.isFinite(kept.heard) ? kept.heard : null;
	const reads: Record<string, number> = {};
	if ("reads" in kept && typeof kept.reads === "object" && kept.reads !== null)
		for (const [id, at] of Object.entries(kept.reads))
			if (typeof at === "number" && Number.isFinite(at)) reads[id] = at;
	return { heard, comments: kept.comments.flatMap((comment: unknown) => readComment(comment) ?? []), reads };
}
