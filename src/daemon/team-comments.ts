import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";
import {
	type Comment,
	type CommentPost,
	type CommentRefusal,
	type CommentReplyPost,
	encodeFrame,
	readComment,
	readCommentsMessage,
} from "../team-sync-protocol";
import type { SyncSocket } from "./team-sync";

/**
 * A local copy's share of its team project's comments (ADR 0011): every comment it was last told of, kept on disk
 * in `design/.spool/comments.json` so a canvas shows them offline and after a restart, and what this machine's
 * person writes, sent on the copy's sync connection while it is caught up and answered by the team.
 *
 * Comments are never saves: they ride the socket, never the files, and nothing here touches `design/`'s own files.
 */

/** What a person writes for a new comment: where it stands and its words. The team says who wrote it. */
export type NewComment = Omit<CommentPost, "type" | "ref">;
/** What a person writes under a comment. */
export type NewReply = Omit<CommentReplyPost, "type" | "ref">;

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
	constructor(readonly reason: CommentRefusal) {
		super(REFUSALS[reason]);
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
};

/** How long a comment waits on the team's answer before it is said to have failed. */
const ANSWER_MS = 15_000;

export interface CopyComments {
	/** Hear one message from the team: true when it was about comments. */
	hear(message: Record<string, unknown>): boolean;
	/** Every comment this copy knows, in the order they were made. */
	list(): Comment[];
	/** Send a new comment on a caught-up connection, with the frame's still if there is one. Its id. */
	post(socket: SyncSocket | undefined, comment: NewComment, still?: Uint8Array): Promise<string>;
	/** Send a reply on a caught-up connection. Its id. */
	reply(socket: SyncSocket | undefined, reply: NewReply): Promise<string>;
	/** The connection went: whatever waits on an answer fails as offline. */
	lost(): void;
}

export function copyComments(file: string, onChange?: () => void): CopyComments {
	let comments = readKept(file);
	/** A snapshot arriving in parts, put together until its last part. */
	let incoming: Comment[] | undefined;
	let refs = 0;
	const waiting = new Map<
		string,
		{ resolve(id: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
	>();

	let kept = JSON.stringify({ comments });
	/** Keep what changed, and say so; a snapshot that brings nothing new says nothing. */
	const keep = () => {
		const now = JSON.stringify({ comments });
		if (now === kept) return;
		kept = now;
		if (existsSync(dirname(file))) writeAtomic(file, `${now}\n`);
		onChange?.();
	};
	const settle = (ref: string, outcome: { id: string } | { error: Error }) => {
		const waiter = waiting.get(ref);
		if (waiter === undefined) return;
		waiting.delete(ref);
		clearTimeout(waiter.timer);
		if ("id" in outcome) waiter.resolve(outcome.id);
		else waiter.reject(outcome.error);
	};
	const send = (socket: SyncSocket | undefined, message: Record<string, unknown>, bytes?: Uint8Array) => {
		if (socket === undefined) return Promise.reject(new CommentsOffline());
		refs += 1;
		const ref = `c${refs}`;
		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => settle(ref, { error: new CommentRefused("unavailable") }), ANSWER_MS);
			timer.unref?.();
			waiting.set(ref, { resolve, reject, timer });
			socket.send(encodeFrame({ ...message, ref }, bytes));
		});
	};

	return {
		hear(message) {
			if (!String(message.type).startsWith("comment")) return false;
			const heard = readCommentsMessage(message);
			if (heard === undefined) return true;
			switch (heard.type) {
				case "comments":
					if (heard.first) incoming = [];
					incoming?.push(...heard.comments);
					if (heard.last && incoming !== undefined) {
						comments = incoming;
						incoming = undefined;
						keep();
					}
					break;
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
				case "comment-refused":
					settle(heard.ref, { error: new CommentRefused(heard.reason) });
					break;
			}
			return true;
		},
		list: () => comments,
		post: (socket, comment, still) => send(socket, { type: "comment-post", ...comment }, still),
		reply: (socket, reply) => send(socket, { type: "comment-reply", ...reply }),
		lost() {
			incoming = undefined;
			for (const ref of [...waiting.keys()]) settle(ref, { error: new CommentsOffline() });
		},
	};
}

/** The comments a copy last knew, as it kept them; none when it kept none or they can't be read. */
export function readKept(file: string): Comment[] {
	let kept: unknown;
	try {
		kept = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return [];
	}
	if (typeof kept !== "object" || kept === null || !("comments" in kept) || !Array.isArray(kept.comments)) return [];
	return kept.comments.flatMap((comment: unknown) => readComment(comment) ?? []);
}
