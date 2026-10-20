import { commentBlock, commentBlocks } from "./daemon/comment-block";
import { CONTROL_HEADER } from "./daemon/security";
import { SpoolError } from "./errors";
import { pageParent } from "./page-path";
import { type Comment, draftFor, isOpenComment, readComment } from "./team-sync-protocol";
import { refusalOf } from "./verbs";

/**
 * `spool comments` (spool#164, ADR 0005 as amended): a member's agent reads and answers a team project's comments,
 * the one verb that writes. Reads come from the daemon's snapshot, the comments its copy last heard from spool.page,
 * and say how old that is, so they work offline. Writes go through the daemon to spool.page as the person's account
 * with the agent mark: shown as "Ana's agent", with Ana's permissions. Offline, a write is refused, never queued.
 */

/** What the daemon answers a read with: its snapshot, and when it was heard. Each comment says if its frame moved on. */
interface CommentsRead {
	online: boolean;
	heard: number | null;
	comments: Comment[];
}

/**
 * Which comments `list` prints: the open ones (neither resolved nor on a deleted page), narrowed to a page, a frame
 * or a share, or the closed ones too.
 */
export interface CommentFilters {
	page?: string | undefined;
	frame?: string | undefined;
	share?: string | undefined;
	resolved?: boolean | undefined;
}

/** The daemon serving the project, and the project's name there. */
export interface CommentsDaemon {
	daemonUrl: string;
	name: string;
	controlToken: string;
}

/** A request on the project's comments, under the control token. */
function call(daemon: CommentsDaemon, path: string, init?: { method: string; body: unknown }): Promise<Response> {
	const url = `${daemon.daemonUrl}/api/p/${encodeURIComponent(daemon.name)}/comments${path}`;
	const headers: Record<string, string> = { [CONTROL_HEADER]: daemon.controlToken };
	if (init === undefined) return fetch(url, { headers });
	headers["content-type"] = "application/json";
	return fetch(url, { method: init.method, headers, body: JSON.stringify(init.body) });
}

/** Every open comment the filters keep, each as one block, under the line that says how old the snapshot is. */
export async function listComments(daemon: CommentsDaemon, filters: CommentFilters, now = Date.now()): Promise<string> {
	const read = await readComments(daemon);
	const kept = read.comments.filter((comment) => {
		// a deleted page's comments are closed, as the canvas's Resolved view and spool.page's open count hold them
		if (filters.resolved !== true && !isOpenComment(comment)) return false;
		if (filters.page !== undefined && comment.page !== filters.page) return false;
		if (filters.frame !== undefined && comment.frame !== filters.frame) return false;
		if (filters.share !== undefined) {
			const { audience } = comment;
			if (audience === "team" || audience.share !== filters.share) return false;
		}
		return true;
	});
	const what = filters.resolved === true ? "comment" : "open comment";
	const head = `${kept.length} ${what}${kept.length === 1 ? "" : "s"}, ${age(read, now)}`;
	return kept.length === 0 ? head : `${head}\n\n${blocksOf(kept)}`;
}

/** One comment, by its id, with every reply: open or resolved. */
export async function showComment(daemon: CommentsDaemon, id: string, now = Date.now()): Promise<string> {
	const read = await readComments(daemon);
	const comment = read.comments.find((one) => one.id === id);
	if (comment === undefined) {
		throw new SpoolError(
			`no comment ${id} in what spool.page sent, ${age(read, now)}; \`spool comments\` lists them`,
		);
	}
	return `${age(read, now)}\n\n${blocksOf([comment])}`;
}

/**
 * A reply under a comment, as the person's agent: its id, and whether it is a draft. On a share's comment it is
 * (spool#174): someone outside the team reads it, so it waits on its card for the person to send it.
 */
export async function replyToComment(
	daemon: CommentsDaemon,
	id: string,
	body: string,
): Promise<{ id: string; draft: boolean }> {
	const comment = (await readComments(daemon)).comments.find((one) => one.id === id);
	const reply = idOf(await written(daemon, `/${encodeURIComponent(id)}/replies`, "POST", { body, agent: true }));
	return { id: reply, draft: comment !== undefined && draftFor(comment.audience, true, "") !== null };
}

/** Resolve a comment, or reopen one, as the person's agent. */
export async function settleComment(daemon: CommentsDaemon, id: string, to: "resolve" | "reopen"): Promise<void> {
	await written(daemon, `/${encodeURIComponent(id)}/${to}`, "POST", { agent: true });
}

/**
 * A new Team comment as the person's agent, on a frame, at the top-left of the element named (a selector or an
 * element pointer) or of the frame. Its id.
 */
export async function addComment(
	daemon: CommentsDaemon,
	frame: string,
	body: string,
	element: string | undefined,
): Promise<string> {
	const comment = {
		page: pageParent(frame),
		frame,
		at: { x: 0, y: 0 },
		element: null,
		body,
		agent: true,
		...(element === undefined ? {} : { find: element }),
	};
	return idOf(await written(daemon, "", "POST", comment));
}

async function readComments(daemon: CommentsDaemon): Promise<CommentsRead> {
	const res = await call(daemon, "");
	if (!res.ok) throw await refusalOf(res, daemon.daemonUrl);
	const value: unknown = await res.json();
	if (!isRecord(value)) throw new SpoolError("the daemon's answer about comments wasn't one");
	const { online, heard, comments } = value;
	const read = Array.isArray(comments) ? comments.map(readComment) : [];
	const all = read.filter((comment): comment is Comment => comment !== undefined);
	if (typeof online !== "boolean" || !(heard === null || typeof heard === "number") || all.length !== read.length)
		throw new SpoolError("the daemon's answer about comments wasn't one");
	return { online, heard, comments: all };
}

function blocksOf(comments: readonly Comment[]): string {
	return commentBlocks(
		comments.map((comment) => commentBlock(comment, { editedSince: comment.editedSince === true })),
	);
}

/** How old what the verb read is: live while the copy is connected, else when it was last heard. */
export function age(read: { online: boolean; heard: number | null }, now: number): string {
	if (read.online) return "live from spool.page";
	if (read.heard === null) return "offline, and nothing heard from spool.page on this Mac yet";
	return `offline: as spool.page sent them ${ago(now - read.heard)}`;
}

function ago(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return "under a minute ago";
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} days ago`;
}

/** A write through the daemon: what it answered, or the refusal said in its own words. */
async function written(daemon: CommentsDaemon, path: string, method: string, body: unknown): Promise<unknown> {
	const res = await call(daemon, path, { method, body });
	const text = await res.text();
	let answer: unknown;
	try {
		answer = JSON.parse(text);
	} catch {
		answer = undefined;
	}
	if (res.ok) return answer;
	if (isRecord(answer) && typeof answer.message === "string") {
		const reason = typeof answer.error === "string" ? answer.error : "refused";
		throw new SpoolError(reason === "offline" ? `offline: ${answer.message}` : answer.message);
	}
	if (res.status === 404) {
		throw new SpoolError("this daemon can't do that to comments yet; `spool upgrade` or restart it to catch it up");
	}
	throw await refusalOf(new Response(text, { status: res.status }), daemon.daemonUrl);
}

function idOf(answer: unknown): string {
	if (isRecord(answer) && typeof answer.id === "string") return answer.id;
	if (isRecord(answer) && isRecord(answer.comment) && typeof answer.comment.id === "string") return answer.comment.id;
	throw new SpoolError("the daemon took it but didn't say under which id");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
