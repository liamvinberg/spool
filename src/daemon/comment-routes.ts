import { type Context, Hono } from "hono";
import { isFramePath, isPagePath } from "../page-path";
import { type Comment, type CommentElement, type CommentPoint, isCommentBody } from "../team-sync-protocol";
import type { ResolveProject } from "./project-route";
import { type ElementPut, elementEntry } from "./selection";
import { CommentRefused, CommentsOffline, type NewComment, type NewReply } from "./team-comments";

/** What the canvas sends to place a comment: where, on which element as the frame's shim saw it, and the words. */
interface CommentInput {
	page: string;
	frame: string | null;
	at: CommentPoint;
	element: Omit<ElementPut, "frame"> | null;
	body: string;
}

/** A frame as it is when a comment is made on it: its source revision and the picture of it this Mac has. */
export interface FrameNow {
	revision: string | null;
	still: Uint8Array | undefined;
}

/**
 * The canvas's side of a team project's comments (ADR 0011): read every comment this Mac knows, write one, reply
 * under one. Writing goes to the team through the local copy's sync connection and only while it is connected: a
 * comment is never queued on this Mac, so offline it is refused and the words stay in the canvas's composer.
 */
export function commentRoutes(deps: {
	resolve: ResolveProject;
	comments: (root: string) => { online: boolean; comments: Comment[] };
	comment: (root: string, comment: NewComment, still?: Uint8Array) => Promise<string>;
	reply: (root: string, reply: NewReply) => Promise<string>;
	/** The frame's source revision and current still, for a comment made on it now. */
	frameNow: (root: string, frame: string) => Promise<FrameNow>;
}) {
	const withRoot = async (c: Context, act: (root: string) => Promise<Response>) => {
		const project = deps.resolve(c, c.req.param("project") ?? "");
		return "response" in project ? project.response : act(project.root);
	};
	return new Hono()
		.get("/:project/comments", (c) => withRoot(c, async (root) => c.json(deps.comments(root))))
		.post("/:project/comments", (c) =>
			withRoot(c, async (root) => {
				const input = readCommentInput(await c.req.json().catch(() => undefined));
				if (input === undefined)
					return c.text(
						"a comment is { page, frame, at: { x, y }, element: { selector, outerHtml, source, generated } | null, body }",
						400,
					);
				const { page, frame, at, body } = input;
				const element: CommentElement | null =
					frame === null || input.element === null ? null : handlesOf(root, { ...input.element, frame });
				const now = frame === null ? { revision: null, still: undefined } : await deps.frameNow(root, frame);
				return answered(c, () =>
					deps.comment(root, { page, frame, at, element, revision: now.revision, body }, now.still),
				);
			}),
		)
		.post("/:project/comments/:comment/replies", (c) =>
			withRoot(c, async (root) => {
				const input: unknown = await c.req.json().catch(() => undefined);
				const body = isRecord(input) ? input.body : undefined;
				if (!isCommentBody(body)) return c.text("a reply is { body } with 1 to 4,000 characters", 400);
				return answered(c, () => deps.reply(root, { comment: c.req.param("comment") ?? "", body }));
			}),
		);
}

/** The team's answer: the new id, or why it wasn't taken. */
async function answered(c: Context, send: () => Promise<string>): Promise<Response> {
	try {
		return c.json({ id: await send() }, 201);
	} catch (error) {
		if (error instanceof CommentsOffline) return c.json({ error: "offline", message: error.message }, 409);
		if (error instanceof CommentRefused) {
			const status = error.reason === "comment_not_found" ? 404 : error.reason === "unavailable" ? 503 : 400;
			return c.json({ error: error.reason, message: error.message }, status);
		}
		throw error;
	}
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
	if (typeof page !== "string" || !(page === "" || isPagePath(page)) || !isCommentBody(body)) return undefined;
	if (!(frame === null || (typeof frame === "string" && isFramePath(frame)))) return undefined;
	if (!isRecord(at)) return undefined;
	const { x, y } = at;
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	if (element === null || element === undefined) return { page, frame, at: { x, y }, element: null, body };
	if (!isRecord(element)) return undefined;
	const { selector, outerHtml, source, generated } = element;
	if (typeof selector !== "string" || typeof outerHtml !== "string") return undefined;
	if (!(source === null || typeof source === "string") || typeof generated !== "boolean") return undefined;
	return { page, frame, at: { x, y }, element: { selector, outerHtml, source, generated }, body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
