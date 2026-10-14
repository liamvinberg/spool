import { sep } from "node:path";
import type { Context } from "hono";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { isFramePath } from "../page-path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import {
	createPage,
	duplicateFrames,
	duplicatePage,
	forgetPages,
	moveFrames,
	movePages,
	pageDir,
	type Refusal,
	renameFrame,
	renamePage,
} from "./explorer";
import { answeringDiskRefusals, type ResolveProject, withProject } from "./project-route";
import { lookupFrame } from "./projection";

/** A JSON body as fields to read, whatever arrived. */
const bodyFields = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** A `[name, ...]` field, or nothing when it is not one. */
const nameList = (value: unknown): string[] | undefined =>
	Array.isArray(value) && value.every((name): name is string => typeof name === "string") ? value : undefined;

/**
 * What a trash names (#228): frames, pages, or both. Both sides are optional on
 * the wire and the handler requires one of them to be there, so a caller that
 * only ever deletes frames writes what it always wrote.
 */
interface TrashBody {
	frames?: string[];
	pages?: string[];
}
const isRefusal = (outcome: { kind: string }): outcome is Refusal => outcome.kind === "refused";

/**
 * One explorer verb, answered (#228): the disk's refusals first, then the
 * operation's own — which already carries the status it wants said — and what
 * is left is the verb having happened, which only the route can phrase.
 */
function explorerVerb<T extends { kind: string }, R extends Response>(
	c: Context,
	work: () => T | Refusal,
	done: (value: T) => R,
): R | Response {
	const outcome = answeringDiskRefusals(c, work);
	if ("response" in outcome) return outcome.response;
	if (isRefusal(outcome.value)) return c.text(outcome.value.message, outcome.value.status);
	return done(outcome.value);
}

/** Both renames read one body; only what they move differs. */
const renameBody = validator("json", (value: unknown, c: Context) => {
	const { from, to } = bodyFields(value);
	if (typeof from !== "string" || typeof to !== "string") {
		return c.text('a rename is { "from": "…", "to": "…" }', 400);
	}
	return { from, to };
});

/**
 * The explorer's verbs (#228). Every one of them moves or copies a
 * folder, so the law that the canvas never writes frame source stands: a
 * rename leaves the `data-go` literals naming the old name exactly as
 * the author wrote them, and the flow map re-derives and reports a
 * target it can no longer find, which is where that fix belongs.
 *
 * None of them publishes an event. Each is a folder move under design/
 * that the watcher sees and names for itself — unlike a geometry write,
 * which the watcher classifies as a move rather than an edit and which
 * the API says early so a drag reaches another browser at once.
 */
export function explorerRoutes(deps: {
	resolve: ResolveProject;
	/** Moves folders to the OS Trash, which owns restore from there (#7). */
	trash: (paths: string[]) => Promise<void>;
}) {
	return new Hono()
		.post("/:project/frames/rename", renameBody, (c) =>
			withProject(c, deps.resolve, (root) => {
				const { from, to } = c.req.valid("json");
				return explorerVerb(
					c,
					() => renameFrame(root, from, to),
					() => c.body(null, 204),
				);
			}),
		)
		.post("/:project/pages/rename", renameBody, (c) =>
			withProject(c, deps.resolve, (root) => {
				const { from, to } = c.req.valid("json");
				return explorerVerb(
					c,
					() => renamePage(root, from, to),
					() => c.body(null, 204),
				);
			}),
		)
		.post(
			"/:project/frames/move",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const frames = nameList(body.frames);
				const { page } = body;
				if (frames === undefined || typeof page !== "string") {
					return c.text('a move is { "frames": [name, ...], "page": "…" }, "" being the root page', 400);
				}
				return { frames, page };
			}),
			(c) =>
				withProject(c, deps.resolve, (root) => {
					const { frames, page } = c.req.valid("json");
					return explorerVerb(
						c,
						() => moveFrames(root, frames, page),
						() => c.body(null, 204),
					);
				}),
		)
		.post(
			"/:project/pages/move",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const pages = nameList(body.pages);
				const { page } = body;
				if (pages === undefined || typeof page !== "string") {
					return c.text('a page move is { "pages": [page, ...], "page": "…" }, "" being the root page', 400);
				}
				return { pages, page };
			}),
			(c) =>
				withProject(c, deps.resolve, (root) => {
					const { pages, page } = c.req.valid("json");
					return explorerVerb(
						c,
						() => movePages(root, pages, page),
						() => c.body(null, 204),
					);
				}),
		)
		.post(
			"/:project/frames/duplicate",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const frames = nameList(body.frames);
				const { page } = body;
				if (frames === undefined || (page !== undefined && typeof page !== "string")) {
					return c.text('a duplicate is { "frames": [name, ...], "page"?: "…" }', 400);
				}
				return { frames, page };
			}),
			(c) =>
				withProject(c, deps.resolve, (root) => {
					const { frames, page } = c.req.valid("json");
					// the minted names come straight back: only this side knows them, and
					// the rail has copies to select the moment it hears they exist
					return explorerVerb(
						c,
						() => duplicateFrames(root, frames, page),
						(done) => c.json({ frames: done.copies }),
					);
				}),
		)
		.post(
			"/:project/pages/duplicate",
			validator("json", (value, c) => {
				const { name } = bodyFields(value);
				if (typeof name !== "string") return c.text('a page duplicate is { "name": "…" }', 400);
				return { name };
			}),
			(c) =>
				withProject(c, deps.resolve, (root) => {
					return explorerVerb(
						c,
						() => duplicatePage(root, c.req.valid("json").name),
						(done) => c.json({ page: done.page, frames: done.copies }),
					);
				}),
		)
		.post(
			"/:project/pages/create",
			validator("json", (value, c) => {
				const { name } = bodyFields(value);
				if (typeof name !== "string") return c.text('a page is { "name": "…" }', 400);
				return { name };
			}),
			(c) =>
				withProject(c, deps.resolve, (root) => {
					return explorerVerb(
						c,
						() => createPage(root, c.req.valid("json").name),
						() => c.body(null, 204),
					);
				}),
		)
		.post(
			"/:project/trash",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const frames = body.frames === undefined ? [] : nameList(body.frames);
				const pages = body.pages === undefined ? [] : nameList(body.pages);
				if (frames === undefined || pages === undefined || frames.length + pages.length === 0) {
					return c.text('trash must be { "frames": [name, ...] } or { "pages": [name, ...] }', 400);
				}
				const named: TrashBody = { frames, pages };
				return named;
			}),
			async (c) =>
				withProject(c, deps.resolve, async (root) => {
					// the wire's shape, not the validator's: both sides are optional so a
					// frames-only caller keeps the body it always wrote, and the validator
					// has already refused anything either side is not a list of names
					const { frames = [], pages = [] } = c.req.valid("json");
					const dirs: string[] = [];
					const pageDirs: string[] = [];
					try {
						const designDir = realDesignDir(root);
						const held: string[] = [];
						for (const page of pages) {
							const found = pageDir(root, page);
							if (found.kind === "refused") return c.text(found.message, found.status);
							held.push(found.dir);
						}
						// a page inside a page being trashed rides along inside its folder, so
						// naming both is one move rather than a move and a miss (#231)
						for (const dir of held) {
							if (!held.some((outer) => dir.startsWith(`${outer}${sep}`))) pageDirs.push(dir);
						}
						for (const name of frames) {
							if (!isFramePath(name)) return c.text(`not a frame name: "${name}"`, 400);
							const found = lookupFrame(root, name);
							if (found.kind !== "found") return c.text(`no frame "${name}" to trash`, 404);
							const dir = resolveDesignPath(designDir, found.dir);
							// a frame inside a page being trashed rides along inside its folder,
							// so naming both is one move rather than a move and a miss (#228)
							if (!pageDirs.some((pageFolder) => dir.startsWith(`${pageFolder}${sep}`))) dirs.push(dir);
						}
					} catch (error) {
						if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
						throw error;
					}
					// the whole folder moves; the OS Trash owns restore from here (#7)
					await deps.trash([...pageDirs, ...dirs]);
					// a page that is gone leaves the canvas nowhere to be, and its camera
					// and its place in the rail nothing to describe (#228)
					if (pages.length > 0) {
						try {
							forgetPages(root, pages);
						} catch {
							// bookkeeping is not worth un-saying the move for: order is advisory
							// and state validates on read, so a cleanup that threw heals the next
							// time either is read, where answering 500 from here would claim
							// folders that have already gone had never moved at all
						}
					}
					return c.body(null, 204);
				}),
		);
}
