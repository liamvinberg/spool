import {
	COMMENT_STILL_BYTES,
	type Comment,
	type CommentAudience,
	type CommentChange,
	type CommentPlace,
	type CommentPost,
	type CommentRefusal,
	type CommentReply,
	frameRevision,
	isFrameSource,
	pageOf,
} from "./team-sync-protocol";

/*
 * The rules comments keep (spec "Who may do what", "Audiences and access", "Limits"), as pure functions over the
 * protocol's own shapes: who reads what, who may change what, where a share's comment may go, what a draft is, and
 * the limits' arithmetic. spool.page's sync object keeps comments in its tables and spool's fake spool.page keeps them
 * in memory, and both ask these, so the daemon's tests against the fake prove the rules the real object holds.
 * Re-exported from `team-sync-protocol.ts`, so `spool.page/sync-protocol` carries them.
 */

/** Every change to a comment that is there, as a socket or the comments API names it. */
export const COMMENT_CHANGE_TYPES = [
	"comment-resolve",
	"comment-reopen",
	"comment-edit",
	"comment-delete",
	"comment-read",
	"comment-unread",
	"comment-send",
] as const satisfies readonly CommentChange["type"][];

// every change the protocol has is in the list: one added only to the union fails to compile here
const EVERY_CHANGE: Exclude<CommentChange["type"], (typeof COMMENT_CHANGE_TYPES)[number]> extends never ? true : false =
	true;
void EVERY_CHANGE;

/** Whether a message's type is a change to a comment that is there. */
export function isCommentChange(type: unknown): type is CommentChange["type"] {
	return COMMENT_CHANGE_TYPES.some((one) => one === type);
}

/**
 * The status each refusal is answered with over HTTP, by spool.page's comments API and the daemon's alike: not a
 * comment it takes (400), no such comment or none of theirs (404), signed out (401), not theirs to do (403), the team
 * unpaid (402), its share ended (409), a limit (429, with when), or spool.page unreachable (503).
 */
export const COMMENT_REFUSAL_STATUS = {
	invalid_comment: 400,
	too_long: 400,
	still_too_large: 400,
	comment_not_found: 404,
	signed_out: 401,
	not_editor: 403,
	not_author: 403,
	blocked: 403,
	unpaid: 402,
	share_ended: 409,
	rate_limited: 429,
	too_many_open: 429,
	share_limited: 429,
	unavailable: 503,
} as const satisfies Record<CommentRefusal, number>;

/**
 * Who reads comments on one socket or through one request: a member (`share` null), who reads every audience, or
 * someone on one share's page, who reads only that share's (spool#174).
 */
export interface CommentReader {
	accountId: string;
	share: string | null;
}

/**
 * Who changes a comment: a reader, and whether they edit the project (admins and editors do), which lets them delete
 * anyone's words.
 */
export interface CommentWriter extends CommentReader {
	edits: boolean;
}

/** Whether a reader reads a comment of this audience, as stored (`team` or a share's id) or as a reader gets it. */
export function readsAudience(reader: CommentReader, audience: CommentAudience | string): boolean {
	if (reader.share === null) return true;
	return (typeof audience === "string" ? audience : audience.share) === reader.share;
}

/** Whether a reply is there for a reader at all: a draft is only for the member it waits for. */
function seesReply(reader: CommentReader, reply: Pick<CommentReply, "draftFor">): boolean {
	return reply.draftFor === null || (reader.share === null && reply.draftFor === reader.accountId);
}

/**
 * A comment as one reader gets it, or undefined when it isn't theirs to read (spool#174). A draft is only its person's.
 * A share's reader reads its comments and every reply but a draft, and none of what is the team's: no element
 * handles, revision, still, "edited since", mentions or share.
 */
export function forReader(comment: Comment, reader: CommentReader): Comment | undefined {
	if (!readsAudience(reader, comment.audience)) return undefined;
	const replies = comment.replies.filter((reply) => seesReply(reader, reply));
	if (reader.share === null) return replies.length === comment.replies.length ? comment : { ...comment, replies };
	const { share: _share, mentions: _mentions, editedSince: _edited, ...seen } = comment;
	return { ...seen, element: null, revision: null, still: false, replies: replies.map(replyForOutsider) };
}

/** A reply made under a comment, as one reader hears it; undefined when it isn't theirs to hear. */
export function replyForReader(
	reader: CommentReader,
	comment: Pick<Comment, "audience">,
	reply: CommentReply,
): CommentReply | undefined {
	if (!readsAudience(reader, comment.audience) || !seesReply(reader, reply)) return undefined;
	return reader.share === null ? reply : replyForOutsider(reply);
}

/** A reply as someone on a share reads it: whom it mentions is the team's. */
export function replyForOutsider(reply: CommentReply): CommentReply {
	const { mentions: _mentions, ...seen } = reply;
	return seen;
}

/** Whether a comment is open: neither resolved nor gone with its page, which only the resolved view shows. */
export function isOpenComment(comment: Pick<Comment, "resolved" | "standing">): boolean {
	return comment.resolved === null && comment.standing !== "deleted-page";
}

/** The message a change is about, as stored: its comment's audience, and the message's author and draft. */
export interface ChangedMessage {
	audience: CommentAudience | string;
	author: string;
	/** The account a reply waits for while it is a draft; null for one that went out, and for a comment. */
	draftFor: string | null;
}

/**
 * Why a writer may not make a change, or undefined when they may (spec "Who may do what"): anyone who reads a
 * comment resolves, reopens and reads it; only the author edits their words; the author, or an admin or editor,
 * deletes them; only the member a draft waits for sends it, and nobody else touches a draft they can't read.
 * `message` is the comment, or the reply the change names; undefined when it isn't there.
 */
export function changeRefusal(
	change: CommentChange,
	writer: CommentWriter,
	message: ChangedMessage | undefined,
): CommentRefusal | undefined {
	if (message === undefined || !readsAudience(writer, message.audience)) return "comment_not_found";
	switch (change.type) {
		case "comment-send":
			return writer.share === null && message.draftFor === writer.accountId ? undefined : "not_author";
		case "comment-edit":
			return message.author === writer.accountId ? undefined : "not_author";
		case "comment-delete":
			if (!seesReply(writer, message)) return "comment_not_found";
			return message.author === writer.accountId || writer.edits ? undefined : "not_author";
		default:
			return undefined;
	}
}

/** A share a member's comment may speak to: live, with the pages it shows; "ended"; or undefined for none of this project's. */
export type PostableShare = { pages: readonly string[] } | "ended" | undefined;

/** Whether a comment stands on one of a share's pages, on its field or on a frame of it. */
export function onSharedPage(post: Pick<CommentPost, "page" | "frame">, pages: readonly string[]): boolean {
	return pages.includes(post.page) && (post.frame === null || pageOf(post.frame) === post.page);
}

/**
 * Why a member's comment may not go to its audience, or undefined when it may (spool#174): a share's comment goes
 * only to a live share of this project that shows its page, and never from their agent, whose words reach a share
 * only as a draft its person sends.
 */
export function memberPostRefusal(post: CommentPost, share: PostableShare): CommentRefusal | undefined {
	if (post.audience === undefined || post.audience === "team") return undefined;
	if (post.agent === true) return "invalid_comment";
	if (share === "ended") return "share_ended";
	return share === undefined || !onSharedPage(post, share.pages) ? "invalid_comment" : undefined;
}

/**
 * Whom a reply waits for as a draft: an agent's reply on a share's comment waits for its person to send it, so an
 * agent never talks to a client unchecked; null for a reply that goes out.
 */
export function draftFor(audience: CommentAudience | string, agent: boolean, account: string): string | null {
	return audience !== "team" && agent ? account : null;
}

/** Whether bytes may be a comment's still: one PNG or JPEG image, within the size a comment keeps. */
export function isCommentStill(bytes: Uint8Array): boolean {
	if (bytes.byteLength > COMMENT_STILL_BYTES) return false;
	const starts = (magic: readonly number[]) => magic.every((byte, at) => bytes[at] === byte);
	return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || starts([0xff, 0xd8, 0xff]);
}

/** A refilling bucket as kept: its level when last taken from, and when, in milliseconds. */
export interface CommentBucket {
	level: number;
	at: number;
}

/**
 * One post from a bucket that holds `size` and refills it continuously over `windowMs`, as one account's minute is
 * kept: the bucket to keep once it is taken, or how many seconds until one fits.
 */
export function takeFromBucket(
	was: CommentBucket | undefined,
	size: number,
	windowMs: number,
	now: number,
): { bucket: CommentBucket } | { retryAfter: number } {
	const level = was === undefined ? size : Math.min(size, was.level + (Math.max(0, now - was.at) * size) / windowMs);
	if (level < 1) return { retryAfter: Math.max(1, Math.ceil(((1 - level) * windowMs) / size / 1_000)) };
	return { bucket: { level: level - 1, at: now } };
}

/**
 * Whether one more post fits a cap on any `windowMs` (a link share's day): `times` are the posts already taken. How
 * many seconds until the oldest of them leaves the window, or undefined when one fits now.
 */
export function windowWait(times: readonly number[], cap: number, windowMs: number, now: number): number | undefined {
	const inside = times.filter((at) => at > now - windowMs).sort((a, b) => a - b);
	if (inside.length < cap) return undefined;
	const frees = inside[inside.length - cap] ?? now;
	return Math.max(1, Math.ceil((frees + windowMs - now) / 1_000));
}

/** Whether saves left a comment's place as it was. */
export function samePlace(a: CommentPlace, b: CommentPlace): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Where a frame stood, from its `frame.json`'s bytes; undefined when they don't say all four numbers. */
export function frameGeometry(bytes: Uint8Array): { x: number; y: number; w: number; h: number } | undefined {
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const { x, y, w, h } = Object.fromEntries(Object.entries(value));
	const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
	return finite(x) && finite(y) && finite(w) && finite(h) ? { x, y, w, h } : undefined;
}

/**
 * A frame's source revision from the files a copy holds, by their hashes (spool#160): only the frame's own source
 * counts. Null when the copy holds no frame there.
 */
export async function frameRevisionOf(
	frame: string,
	files: readonly { path: string; hash: string }[],
): Promise<string | null> {
	const own = files.filter(({ path }) => isFrameSource(frame, path));
	if (!own.some(({ path }) => path === `frames/${frame}/frame.tsx`)) return null;
	return frameRevision(own.map(({ hash }) => hash));
}
