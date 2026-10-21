import { createHash, randomUUID } from "node:crypto";
import { type Context, Hono } from "hono";
import { authorizedCloudRequest, type CloudRequestOptions, originOf } from "../cloud-auth";
import type { ProjectLink } from "../team-project";
import type { RestoreRef } from "../team-sync-protocol";
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
}

/** The most paths and prefixes one read of the files at a version names, as spool.page takes them. */
const READ_PATHS = 200;
const PAGE = 500;

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
	/** One of the team history's reads, as this Mac's account. */
	const history = async (link: ProjectLink, read: string, query: URLSearchParams): Promise<Response> =>
		authorizedCloudRequest(
			deps.spoolDir,
			`/api/teams/${encodeURIComponent(link.team)}/projects/${encodeURIComponent(link.project)}/history${read}?${query}`,
			{},
			deps.request(),
		);

	const json = async <T>(response: Response): Promise<T> => {
		if (!response.ok) throw new HistoryUnread(response.status);
		return (await response.json()) as T;
	};

	/** What each path named, or under a prefix named, held at a version: its hash, null where it was deleted. */
	const filesAt = async (link: ProjectLink, to: number, paths: string[], prefixes: string[]) => {
		const held = new Map<string, string | null>();
		const asks = [...prefixes.map((prefix) => ({ prefix })), ...paths.map((path) => ({ path }))];
		for (let at = 0; at < asks.length; at += READ_PATHS) {
			let after: string | null = "";
			while (after !== null) {
				const query = new URLSearchParams({ at: String(to), limit: String(PAGE) });
				if (after !== "") query.set("after", after);
				for (const ask of asks.slice(at, at + READ_PATHS))
					if ("prefix" in ask) query.append("prefix", ask.prefix);
					else query.append("path", ask.path);
				const page: { files: { path: string; hash: string | null }[]; next: string | null } = await json(
					await history(link, "/files", query),
				);
				for (const file of page.files) held.set(file.path, file.hash);
				after = page.next;
			}
		}
		return held;
	};

	/** What a path held at exactly `to` when that version is a save to it, set aside or not: a set-aside put back. */
	const savedAt = async (link: ProjectLink, path: string, to: number) => {
		const query = new URLSearchParams({ path, before: String(to + 1), limit: "1" });
		const page: { saves: { version: number; hash: string | null }[] } = await json(
			await history(link, "/saves", query),
		);
		const [save] = page.saves;
		return save?.version === to ? save : undefined;
	};

	/** What a restore covers: the paths named, and those under the prefixes named. */
	const scopeOf = (ask: RestoreAsk): { paths: string[]; prefixes: string[] } => {
		if (ask.paths !== undefined) return { paths: ask.paths, prefixes: [] };
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

	/** The bytes behind a hash, read from the team history and checked against it. */
	const blob = async (link: ProjectLink, hash: string): Promise<Uint8Array> => {
		const response = await history(link, `/blobs/${hash}`, new URLSearchParams());
		if (!response.ok) throw new HistoryUnread(response.status);
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new HistoryUnread(502);
		return bytes;
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

class HistoryUnread extends Error {
	constructor(readonly status: number) {
		super(`the team history answered ${status}`);
	}
}

const KINDS = new Set(["file", "frame", "page", "project"]);
const isPaths = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((path) => typeof path === "string");

/** What the canvas asked to put back; undefined when it asked for nothing a restore can be. */
export function readAsk(value: unknown): RestoreAsk | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { kind, target, to, also, paths } = value as Record<string, unknown>;
	if (typeof kind !== "string" || !KINDS.has(kind) || typeof target !== "string") return undefined;
	if (typeof to !== "number" || !Number.isSafeInteger(to) || to < 0) return undefined;
	if (also !== undefined && !isPaths(also)) return undefined;
	if (paths !== undefined && !isPaths(paths)) return undefined;
	if (kind === "file" && target === "") return undefined;
	if (kind === "frame" && target === "") return undefined;
	return { kind: kind as RestoreRef["kind"], target, to, also: also ?? [], paths };
}
