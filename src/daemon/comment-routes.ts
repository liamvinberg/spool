import { type Context, Hono } from "hono";
import type { CloudRequestOptions } from "../cloud-auth";
import { cloudTeams } from "../cloud-teams";
import { isFramePath, isPagePath } from "../page-path";
import { personName } from "../person-name";
import { readProjectLink } from "../team-project";
import { COMMENT_MENTIONS, type CommentElement, type CommentPoint, isCommentBody } from "../team-sync-protocol";
import type { ResolveProject } from "./project-route";
import { type ElementPut, elementEntry } from "./selection";
import {
	CommentRefused,
	CommentsOffline,
	type KeptComments,
	type NewChange,
	type NewComment,
	type NewReply,
} from "./team-comments";

/** What the canvas sends to place a comment: where, on which element as the frame's shim saw it, and the words. */
interface CommentInput {
	page: string;
	frame: string | null;
	at: CommentPoint;
	element: Omit<ElementPut, "frame"> | null;
	body: string;
	mentions: string[] | undefined;
}

/** Someone a comment can mention: a member of the project's team, by account. */
export interface Mentionable {
	accountId: string;
	name: string;
	you: boolean;
}

/** How long a team's people are trusted before spool.page is asked again. */
const PEOPLE_MS = 5 * 60_000;

/**
 * Whom a root's team project's comments can mention: its team's members, from spool.page, remembered a while.
 * Empty while spool.page can't be reached, so an @ then names nobody rather than failing the composer.
 */
export function teamPeople(spoolDir: string, request?: CloudRequestOptions): (root: string) => Promise<Mentionable[]> {
	const known = new Map<string, { at: number; people: Mentionable[] }>();
	return async (root) => {
		const team = readProjectLink(root).team;
		const was = known.get(team);
		if (was !== undefined && Date.now() - was.at < PEOPLE_MS) return was.people;
		try {
			const { members } = await cloudTeams(spoolDir, request).people(team);
			const people = members.map((member) => ({
				accountId: member.accountId,
				name: personName(member),
				you: member.you === true,
			}));
			known.set(team, { at: Date.now(), people });
			return people;
		} catch {
			return was?.people ?? [];
		}
	};
}

/** A frame as it is when a comment is made on it: its source revision and the picture of it this Mac has. */
export interface FrameNow {
	revision: string | null;
	still: Uint8Array | undefined;
}

/**
 * The canvas's side of a team project's comments (ADR 0011): read every comment this Mac knows, write one, reply
 * under one, and change one: resolve, reopen, edit, delete, read and mark unread. Writing goes to the team through
 * the local copy's sync connection and only while it is connected: nothing is queued on this Mac, so offline it is
 * refused and the words stay in the canvas's composer.
 */
export function commentRoutes(deps: {
	resolve: ResolveProject;
	comments: (root: string) => { online: boolean } & KeptComments;
	comment: (root: string, comment: NewComment, still?: Uint8Array) => Promise<string>;
	reply: (root: string, reply: NewReply) => Promise<string>;
	change: (root: string, change: NewChange) => Promise<string>;
	/** The members of the project's team, whom a comment can mention; empty when spool.page can't say. */
	people: (root: string) => Promise<Mentionable[]>;
	/** The frame's source revision and current still, for a comment made on it now. */
	frameNow: (root: string, frame: string) => Promise<FrameNow>;
}) {
	const withRoot = async (c: Context, act: (root: string) => Promise<Response>) => {
		const project = deps.resolve(c, c.req.param("project") ?? "");
		return "response" in project ? project.response : act(project.root);
	};
	/** A change sent, answered with the comment as the team now has it: gone, read, or whole. */
	const change = (c: Context, root: string, made: NewChange) =>
		refusedOr(c, async () => {
			await deps.change(root, made);
			if (made.type === "comment-delete" && made.reply === undefined) return c.json({ removed: made.comment });
			const { comments, reads } = deps.comments(root);
			const comment = comments.find((one) => one.id === made.comment);
			if (comment === undefined) return c.json({ error: "comment_not_found" }, 404);
			if (made.type === "comment-read" || made.type === "comment-unread")
				return c.json({ comment, read: reads[comment.id] ?? null });
			return c.json({ comment });
		});
	const edit = (c: Context, reply?: string) =>
		withRoot(c, async (root) => {
			const input: unknown = await c.req.json().catch(() => undefined);
			const body = isRecord(input) ? input.body : undefined;
			const mentions = isRecord(input) ? readMentions(input.mentions) : undefined;
			if (!isCommentBody(body) || mentions === null)
				return c.text("an edit is { body, mentions? } with 1 to 4,000 characters", 400);
			return change(c, root, {
				type: "comment-edit",
				comment: c.req.param("comment") ?? "",
				body,
				...(reply === undefined ? {} : { reply }),
				...(mentions === undefined ? {} : { mentions }),
			});
		});
	const remove = (c: Context, reply?: string) =>
		withRoot(c, (root) =>
			change(c, root, {
				type: "comment-delete",
				comment: c.req.param("comment") ?? "",
				...(reply === undefined ? {} : { reply }),
			}),
		);
	const simple = (type: "comment-resolve" | "comment-reopen" | "comment-read" | "comment-unread") => (c: Context) =>
		withRoot(c, (root) => change(c, root, { type, comment: c.req.param("comment") ?? "" }));
	return new Hono()
		.get("/:project/comments", (c) => withRoot(c, async (root) => c.json(deps.comments(root))))
		.get("/:project/comments/people", (c) => withRoot(c, async (root) => c.json({ people: await deps.people(root) })))
		.post("/:project/comments/:comment/resolve", simple("comment-resolve"))
		.post("/:project/comments/:comment/reopen", simple("comment-reopen"))
		.post("/:project/comments/:comment/read", simple("comment-read"))
		.post("/:project/comments/:comment/unread", simple("comment-unread"))
		.patch("/:project/comments/:comment", (c) => edit(c))
		.delete("/:project/comments/:comment", (c) => remove(c))
		.patch("/:project/comments/:comment/replies/:reply", (c) => edit(c, c.req.param("reply")))
		.delete("/:project/comments/:comment/replies/:reply", (c) => remove(c, c.req.param("reply")))
		.post("/:project/comments", (c) =>
			withRoot(c, async (root) => {
				const input = readCommentInput(await c.req.json().catch(() => undefined));
				if (input === undefined)
					return c.text(
						"a comment is { page, frame, at: { x, y }, element: { selector, outerHtml, source, generated } | null, body, mentions? }",
						400,
					);
				const { page, frame, at, body, mentions } = input;
				const element: CommentElement | null =
					frame === null || input.element === null ? null : handlesOf(root, { ...input.element, frame });
				const now = frame === null ? { revision: null, still: undefined } : await deps.frameNow(root, frame);
				return answered(c, () =>
					deps.comment(
						root,
						{
							page,
							frame,
							at,
							element,
							revision: now.revision,
							body,
							...(mentions === undefined ? {} : { mentions }),
						},
						now.still,
					),
				);
			}),
		)
		.post("/:project/comments/:comment/replies", (c) =>
			withRoot(c, async (root) => {
				const input: unknown = await c.req.json().catch(() => undefined);
				const body = isRecord(input) ? input.body : undefined;
				const mentions = isRecord(input) ? readMentions(input.mentions) : undefined;
				if (!isCommentBody(body) || mentions === null)
					return c.text("a reply is { body, mentions? } with 1 to 4,000 characters", 400);
				return answered(c, () =>
					deps.reply(root, {
						comment: c.req.param("comment") ?? "",
						body,
						...(mentions === undefined ? {} : { mentions }),
					}),
				);
			}),
		);
}

/** The team's answer: the new id, or why it wasn't taken. */
function answered(c: Context, send: () => Promise<string>): Promise<Response> {
	return refusedOr(c, async () => c.json({ id: await send() }, 201));
}

/**
 * What the team answered, or why it wasn't taken: offline (409), no such comment (404), not the person's to change
 * (403), too soon again (429, with when), the team unreachable (503), or otherwise not a comment it takes (400).
 */
async function refusedOr(c: Context, send: () => Promise<Response>): Promise<Response> {
	try {
		return await send();
	} catch (error) {
		if (error instanceof CommentsOffline) return c.json({ error: "offline", message: error.message }, 409);
		if (error instanceof CommentRefused) {
			const { reason, retryAfter } = error;
			const status =
				reason === "comment_not_found"
					? 404
					: reason === "not_author" || reason === "not_editor"
						? 403
						: reason === "rate_limited"
							? 429
							: reason === "unpaid"
								? 402
								: reason === "unavailable"
									? 503
									: 400;
			if (retryAfter !== undefined) c.header("retry-after", String(retryAfter));
			return c.json(
				{ error: reason, message: error.message, ...(retryAfter === undefined ? {} : { retryAfter }) },
				status,
			);
		}
		throw error;
	}
}

/** The accounts a message mentions: undefined when it says none, null when what it says isn't a list of them. */
function readMentions(value: unknown): string[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > COMMENT_MENTIONS) return null;
	const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64);
	return ids.length === value.length ? [...new Set(ids)] : null;
}

/** An element's four handles, as the selection names it: the frame is the comment's own. */
function handlesOf(root: string, put: ElementPut): CommentElement | null {
	const entry = elementEntry(root, put);
	if (entry.kind !== "element") return null;
	const { name, path, lines, selector, excerpt, generated } = entry;
	return { name, path, lines, selector, excerpt, ...(generated === true ? { generated } : {}) };
}

function readCommentInput(value: unknown): CommentInput | undefined {
	if (!isRecord(value)) return undefined;
	const { page, frame, at, element, body } = value;
	const mentions = readMentions(value.mentions);
	if (mentions === null) return undefined;
	if (typeof page !== "string" || !(page === "" || isPagePath(page)) || !isCommentBody(body)) return undefined;
	if (!(frame === null || (typeof frame === "string" && isFramePath(frame)))) return undefined;
	if (!isRecord(at)) return undefined;
	const { x, y } = at;
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	if (element === null || element === undefined) return { page, frame, at: { x, y }, element: null, body, mentions };
	if (!isRecord(element)) return undefined;
	const { selector, outerHtml, source, generated } = element;
	if (typeof selector !== "string" || typeof outerHtml !== "string") return undefined;
	if (!(source === null || typeof source === "string") || typeof generated !== "boolean") return undefined;
	return { page, frame, at: { x, y }, element: { selector, outerHtml, source, generated }, body, mentions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
