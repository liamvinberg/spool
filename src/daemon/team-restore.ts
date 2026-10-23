import { randomUUID } from "node:crypto";
import { type Context, Hono } from "hono";
import { type CloudRequestOptions, originOf } from "../cloud-auth";
import { isFramePath } from "../page-path";
import type { ProjectLink } from "../team-project";
import type { RestoreRef } from "../team-sync-protocol";
import { HistoryUnread, teamHistoryReads } from "./team-history-reads";
import { type LocalCopy, RestoreOffline, travellingFiles } from "./team-sync";

/*
 * Restore (spool#188): an editor puts a file, a frame, a page or the whole team project back to how it stood at a
 * team version. This Mac reads what each path held then from the team history, writes it into its local copy, and
 * sends it as ordinary saves marked as one restore: deleted files come back, files made since inside what goes back
 * go, and every save lands on its own base under the collision rule. Undoing one is a restore of the same paths to
 * the version just before it.
 */

/** What a restore puts back, as the canvas asks for it. */
export interface RestoreAsk {
	kind: RestoreRef["kind"];
	target: string;
	to: number;
	/** A frame's shared files ticked to go back with it. */
	also: string[];
	/** Exactly these paths, as an undo names them, instead of what `kind` and `target` cover. */
	paths: string[] | undefined;
	/** These frames' folders, as a version's restore ticks them (task 225), instead of what `kind` and `target` cover. */
	frames: string[] | undefined;
}

export function teamRestoreRoutes(deps: {
	spoolDir: string;
	request: () => CloudRequestOptions;
	resolve: (c: Context, name: string) => { root: string } | { response: Response };
	link: (root: string) => ProjectLink | undefined;
	/** The root's local copy, while it follows its team. */
	copy: (root: string) => LocalCopy | undefined;
	/** The design-relative files outside a frame's folder that it imports, transitively; undefined for no such frame. */
	importsOf: (root: string, frame: string) => Promise<readonly string[] | undefined>;
	/** The frames whose source graph reaches a shared file. */
	framesUsing: (root: string, path: string) => Promise<readonly string[] | undefined>;
}) {
	const { filesAt, savedAt, blob } = teamHistoryReads(deps);

	/** What a restore covers: the paths named, and those under the prefixes named. */
	const scopeOf = (ask: RestoreAsk): { paths: string[]; prefixes: string[] } => {
		if (ask.paths !== undefined) return { paths: ask.paths, prefixes: [] };
		if (ask.frames !== undefined) return { paths: ask.also, prefixes: ask.frames.map((frame) => `frames/${frame}/`) };
		if (ask.kind === "file") return { paths: [ask.target], prefixes: [] };
		if (ask.kind === "frame") return { paths: ask.also, prefixes: [`frames/${ask.target}/`] };
		if (ask.kind === "page")
			return { paths: [], prefixes: [ask.target === "" ? "frames/" : `frames/${ask.target}/`] };
		return { paths: [], prefixes: [""] };
	};

	/**
	 * Every path a restore covers and what it held then (null for nothing): what the team had then, what it has now,
	 * and what is on this Mac now, each inside what goes back.
	 */
	const planOf = async (root: string, link: ProjectLink, copy: LocalCopy, ask: RestoreAsk) => {
		const { paths, prefixes } = scopeOf(ask);
		const covers = (path: string) => paths.includes(path) || prefixes.some((prefix) => path.startsWith(prefix));
		const then = await filesAt(link, ask.to, paths, prefixes);
		if (ask.kind === "file" && ask.paths === undefined) {
			const exact = await savedAt(link, ask.target, ask.to);
			if (exact !== undefined) then.set(ask.target, exact.hash);
		}
		const known = copy.known();
		const all = new Set([
			...then.keys(),
			...Object.entries(known).flatMap(([path, file]) => (file.hash !== null && covers(path) ? [path] : [])),
			...travellingFiles(root).filter(covers),
		]);
		const wanted = [...all].sort().map((path) => ({ path, hash: then.get(path) ?? null }));
		/** The paths whose team version isn't what they held then: what reaches the team. */
		const changes = wanted.filter(({ path, hash }) => (known[path]?.hash ?? null) !== hash).map(({ path }) => path);
		return { wanted, changes };
	};

	/** A frame's shared files that changed since: offered to go back with it, naming the other frames using each. */
	const sharedOf = async (root: string, link: ProjectLink, copy: LocalCopy, frame: string, to: number) => {
		const imports = [...((await deps.importsOf(root, frame)) ?? [])].sort();
		if (imports.length === 0) return [];
		const then = await filesAt(link, to, imports, []);
		const known = copy.known();
		const changed = imports.filter((path) => (known[path]?.hash ?? null) !== (then.get(path) ?? null));
		return Promise.all(
			changed.map(async (path) => ({
				path,
				frames: [...((await deps.framesUsing(root, path)) ?? [])].filter((name) => name !== frame).sort(),
			})),
		);
	};

	/** The project, its link and its local copy; or the answer saying why there is no restoring it from here. */
	const where = (c: Context) => {
		const project = deps.resolve(c, c.req.param("project") ?? "");
		if ("response" in project) return project;
		const link = deps.link(project.root);
		if (link === undefined)
			return { response: c.json({ error: "not_team", message: "this project isn't a team project" }, 404) };
		if (link.origin !== originOf(deps.request()))
			return { response: c.json({ error: "other_cloud", message: `this project lives at ${link.origin}` }, 404) };
		const copy = deps.copy(project.root);
		if (copy === undefined)
			return {
				response: c.json(
					{ error: "not_synced", message: "this Mac doesn't sync the project with its team now" },
					409,
				),
			};
		return { root: project.root, link, copy };
	};

	const failed = (c: Context, error: unknown) => {
		if (error instanceof RestoreOffline) return c.json({ error: "offline", message: error.message }, 503);
		if (error instanceof HistoryUnread)
			return c.json({ error: "history_unread", message: "the team's history couldn't be read just now" }, 503);
		return c.json({ error: "offline", message: error instanceof Error ? error.message : String(error) }, 503);
	};

	return new Hono()
		.get("/:project/history/restore", async (c) => {
			const found = where(c);
			if ("response" in found) return found.response;
			const ask = readAsk({
				kind: c.req.query("kind"),
				target: c.req.query("target") ?? "",
				to: Number(c.req.query("to")),
			});
			if (ask === undefined) return c.json({ error: "invalid_input" }, 400);
			try {
				const { changes } = await planOf(found.root, found.link, found.copy, ask);
				const shared =
					ask.kind === "frame" ? await sharedOf(found.root, found.link, found.copy, ask.target, ask.to) : [];
				return c.json({ files: changes.length, shared });
			} catch (error) {
				return failed(c, error);
			}
		})
		.post("/:project/history/restore", async (c) => {
			const found = where(c);
			if ("response" in found) return found.response;
			const ask = readAsk(await c.req.json().catch(() => undefined));
			if (ask === undefined) return c.json({ error: "invalid_input" }, 400);
			try {
				const { wanted } = await planOf(found.root, found.link, found.copy, ask);
				const bytes = new Map<string, Uint8Array>();
				for (const hash of new Set(wanted.flatMap(({ hash }) => (hash === null ? [] : [hash]))))
					bytes.set(hash, await blob(found.link, hash));
				const restore: RestoreRef = { id: randomUUID(), kind: ask.kind, target: ask.target, to: ask.to };
				const answers = await found.copy.restore(
					restore,
					wanted.map(({ path, hash }) => ({ path, bytes: hash === null ? undefined : bytes.get(hash) })),
				);
				const first = Math.min(...answers.applied.map(({ version }) => version));
				return c.json({
					id: restore.id,
					applied: answers.applied.map(({ path }) => path),
					setAside: answers.setAside,
					refused: answers.refused.map(({ path }) => path),
					undo:
						answers.applied.length === 0
							? null
							: {
									kind: ask.kind,
									target: ask.target,
									to: first - 1,
									paths: answers.applied.map(({ path }) => path).sort(),
								},
				});
			} catch (error) {
				return failed(c, error);
			}
		});
}

const KINDS = new Set(["file", "frame", "page", "project"]);
const isPaths = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((path) => typeof path === "string");

/** What the canvas asked to put back; undefined when it asked for nothing a restore can be. */
export function readAsk(value: unknown): RestoreAsk | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { kind, target, to, also, paths, frames } = value as Record<string, unknown>;
	if (typeof kind !== "string" || !KINDS.has(kind) || typeof target !== "string") return undefined;
	if (typeof to !== "number" || !Number.isSafeInteger(to) || to < 0) return undefined;
	if (also !== undefined && !isPaths(also)) return undefined;
	if (paths !== undefined && !isPaths(paths)) return undefined;
	if (frames !== undefined && !(isPaths(frames) && frames.length > 0 && frames.every(isFramePath))) return undefined;
	if (kind === "file" && target === "") return undefined;
	if (kind === "frame" && target === "") return undefined;
	return { kind: kind as RestoreRef["kind"], target, to, also: also ?? [], paths, frames };
}
