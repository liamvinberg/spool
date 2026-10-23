import { createHash } from "node:crypto";
import { basename, join, posix } from "node:path";
import * as esbuild from "esbuild";
import { type Context, Hono } from "hono";
import { type CloudRequestOptions, originOf } from "../cloud-auth";
import { isFramePath } from "../page-path";
import type { ProjectLink } from "../team-project";
import { type CompileHost, compileFrameDocument, describeCompileError, type FrameAuthority } from "./design-compile";
import type { DesignEntry, DesignFileKind, DesignFiles } from "./design-files";
import { errorDocument } from "./document";
import type { HistoryCache } from "./history-cache";
import { parseSidecar } from "./sidecar";
import { pinnedTailwind } from "./stylesheet-workers";
import { inProcessStylesheets } from "./tailwind";
import { HistoryUnread, teamHistoryReads } from "./team-history-reads";
import { type MomentFiles, readVersion } from "./history-version";
import { inertWebfonts, type Webfonts } from "./webfonts";

/*
 * Compare with now (spool#189): a frame as it stood at a team version, beside today's on the canvas. This Mac reads
 * what the whole project held then from the team history, by hash, and compiles the frame from those bytes alone:
 * its own files, and whatever those old bytes import, followed as the compile reaches it, which may be files gone or
 * changed since. What it read is kept in the machine's history cache, never in design/, so the same moment is read
 * once. The old frame is served at its own address, `/p/<project>/history/<version>/frames/<frame>`.
 *
 * A set-aside save is never in what the history says the files held: comparing at one names its path and hash, and
 * the moment is the files then with that one save in place.
 */

/** One save put in place over what the files held: a set-aside save's own bytes, `hash` null for a delete. */
interface Saved {
	path: string;
	hash: string | null;
}

/** How many compiled old frames are kept in memory: a compare's few, and the last ones looked at. */
const DOCUMENTS = 16;
/** How many times a compile may reach for bytes it hasn't got before it is taken as broken. */
const ROUNDS = 64;
const HASH = /^[0-9a-f]{64}$/u;
const EMPTY = new Uint8Array(0);

export function teamCompareRoutes(deps: {
	spoolDir: string;
	version: string;
	request: () => CloudRequestOptions;
	resolve: (c: Context, name: string) => { root: string } | { response: Response };
	link: (root: string) => ProjectLink | undefined;
	cache: HistoryCache;
	authority: (root: string) => FrameAuthority;
	webfonts?: Webfonts | undefined;
	/** What the team holds now as this Mac knows it, while the root follows its team: each path's hash, null deleted. */
	known: (root: string) => Readonly<Record<string, { hash: string | null }>> | undefined;
}) {
	const reads = teamHistoryReads(deps);
	const documents = new Map<string, { document: string; etag: string }>();

	const momentKey = (at: number, saved: Saved | undefined) =>
		saved === undefined
			? String(at)
			: `${at}~${createHash("sha256")
					.update(`${saved.path}\0${saved.hash ?? ""}`)
					.digest("hex")
					.slice(0, 16)}`;

	/** What the project held at a moment: the cache's, or read from the team history once and kept. */
	const filesAt = async (link: ProjectLink, at: number, saved: Saved | undefined): Promise<MomentFiles> => {
		const key = `moments/${link.team}/${link.project}/${momentKey(at, saved)}.json`;
		const kept = deps.cache.read(key);
		if (kept !== undefined) return JSON.parse(Buffer.from(kept).toString("utf8")) as MomentFiles;
		const held = await reads.filesAt(link, at, [], [""]);
		if (saved !== undefined) held.set(saved.path, saved.hash);
		const files: Record<string, string> = {};
		for (const [path, hash] of [...held].sort(([a], [b]) => (a < b ? -1 : 1))) if (hash !== null) files[path] = hash;
		deps.cache.write(key, new TextEncoder().encode(JSON.stringify(files)));
		return files;
	};

	/** The bytes behind a hash: the cache's, or read from the team history once and kept. */
	const blob = async (link: ProjectLink, hash: string): Promise<Uint8Array> => {
		const kept = deps.cache.read(`blobs/${hash}`);
		if (kept !== undefined) return kept;
		const bytes = await reads.blob(link, hash);
		deps.cache.write(`blobs/${hash}`, bytes);
		return bytes;
	};

	/** The old frame's document, compiled from the moment's bytes, fetching each the compile reaches for. */
	const compile = async (root: string, link: ProjectLink, at: number, saved: Saved | undefined, frame: string) => {
		const key = `${root}\0${momentKey(at, saved)}\0${frame}`;
		const kept = documents.get(key);
		if (kept !== undefined) return { kind: "ok" as const, ...kept };
		const files = await filesAt(link, at, saved);
		const own = `frames/${frame}/`;
		if (files[`${own}frame.tsx`] === undefined) return { kind: "absent" as const };
		const bytes = new Map<string, Uint8Array>();
		for (const [path, hash] of Object.entries(files))
			if (path.startsWith(own) && !path.slice(own.length).includes("/")) bytes.set(hash, await blob(link, hash));
		const designDir = join(deps.spoolDir, "history-cache", "moment", basename(root), "design");
		const missed = new Set<string>();
		const momentFiles = filesOfMoment(designDir, files, bytes, missed);
		const host: CompileHost = {
			esbuild,
			files: momentFiles,
			stylesheets: inProcessStylesheets({ files: momentFiles, tailwind: pinnedTailwind }),
		};
		for (let round = 0; round < ROUNDS; round += 1) {
			missed.clear();
			let compiled: Awaited<ReturnType<typeof compileFrameDocument>> | undefined;
			let failed: unknown;
			try {
				compiled = await compileFrameDocument(host, {
					designDir,
					frame,
					project: basename(root),
					authority: deps.authority(root),
					version: deps.version,
					webfonts: deps.webfonts ?? inertWebfonts(),
				});
			} catch (error) {
				failed = error;
			}
			if (missed.size > 0) {
				for (const hash of missed) bytes.set(hash, await blob(link, hash));
				continue;
			}
			if (compiled === undefined) {
				const message = await describeCompileError(esbuild, failed);
				return { kind: "error" as const, document: errorDocument(frame, message), message };
			}
			const done = { document: compiled.document, etag: compiled.etag };
			documents.set(key, done);
			for (const old of documents.keys()) {
				if (documents.size <= DOCUMENTS) break;
				documents.delete(old);
			}
			return { kind: "ok" as const, ...done };
		}
		const message = `frame "${frame}" reached for more files than a compare reads`;
		return { kind: "error" as const, document: errorDocument(frame, message), message };
	};

	/** The project and its link; or the answer saying why its history can't be read from here. */
	const where = (c: Context) => {
		const project = deps.resolve(c, c.req.param("project") ?? "");
		if ("response" in project) return project;
		const link = deps.link(project.root);
		if (link === undefined)
			return { response: c.json({ error: "not_team", message: "this project isn't a team project" }, 404) };
		if (link.origin !== originOf(deps.request()))
			return { response: c.json({ error: "other_cloud", message: `this project lives at ${link.origin}` }, 404) };
		return { root: project.root, link };
	};

	const unread = (c: Context, error: unknown) =>
		error instanceof HistoryUnread
			? c.json({ error: "history_unread", message: "the team's history couldn't be read just now" }, 503)
			: c.json({ error: "offline", message: error instanceof Error ? error.message : String(error) }, 503);

	/** A compare's moment, from its query: the version, and a set-aside save's path and hash when it names one. */
	const momentOf = (c: Context): { at: number; saved: Saved | undefined } | undefined => {
		const at = Number(c.req.param("at") ?? c.req.query("at"));
		if (!Number.isSafeInteger(at) || at < 0) return undefined;
		const path = c.req.query("path");
		const hash = c.req.query("hash");
		if (path === undefined) return { at, saved: undefined };
		if (path === "" || hash === undefined || (hash !== "" && !HASH.test(hash))) return undefined;
		return { at, saved: { path, hash: hash === "" ? null : hash } };
	};

	const documentUrl = (project: string, frame: string, at: number, saved: Saved | undefined) => {
		const base = `/p/${encodeURIComponent(project)}/history/${at}/frames/${encodeURIComponent(frame)}`;
		return saved === undefined
			? base
			: `${base}?${new URLSearchParams({ path: saved.path, hash: saved.hash ?? "" })}`;
	};

	const api = new Hono().get("/:project/history/compare", async (c) => {
		const found = where(c);
		if ("response" in found) return found.response;
		const frame = c.req.query("frame") ?? "";
		const moment = momentOf(c);
		if (!isFramePath(frame) || moment === undefined) return c.json({ error: "invalid_input" }, 400);
		try {
			const files = await filesAt(found.link, moment.at, moment.saved);
			const entry = `frames/${frame}/frame.tsx`;
			if (files[entry] === undefined) return c.json({ state: "absent" });
			const sidecar = files[`frames/${frame}/frame.json`];
			let place: { x: number; y: number; w: number; h: number } | null = null;
			if (sidecar !== undefined) {
				const read = parseSidecar(jsonOf(await blob(found.link, sidecar)));
				if (read.kind === "placed") place = read.geometry;
			}
			return c.json({
				state: "ready",
				url: documentUrl(c.req.param("project") ?? "", frame, moment.at, moment.saved),
				place,
			});
		} catch (error) {
			return unread(c, error);
		}
	});

	/** A frame's sidecar place at a moment; null without one. */
	const placeAt = async (link: ProjectLink, files: MomentFiles, frame: string) => {
		const sidecar = files[`frames/${frame}/frame.json`];
		if (sidecar === undefined) return null;
		const read = parseSidecar(jsonOf(await blob(link, sidecar)));
		return read.kind === "placed" ? read.geometry : null;
	};

	/**
	 * A version as the History pane shows it (task 225): the frames on a page as they stood at `at`, what the
	 * version did to each from `before` (the version just before it), which stand the same now, and what restoring
	 * it would change across the project. A frame it deleted is served as it stood just before.
	 */
	api.get("/:project/history/version", async (c) => {
		const found = where(c);
		if ("response" in found) return found.response;
		const at = Number(c.req.query("at"));
		const before = Number(c.req.query("before"));
		const page = c.req.query("page") ?? "";
		if (!Number.isSafeInteger(at) || at < 0 || !Number.isSafeInteger(before) || before < -1 || before > at)
			return c.json({ error: "invalid_input" }, 400);
		if (page !== "" && !isFramePath(page)) return c.json({ error: "invalid_input" }, 400);
		const known = deps.known(found.root);
		if (known === undefined)
			return c.json({ error: "not_synced", message: "this Mac doesn't sync the project with its team now" }, 409);
		try {
			const then = await filesAt(found.link, at, undefined);
			const earlier = before < 0 ? {} : await filesAt(found.link, before, undefined);
			const now: Record<string, string> = {};
			for (const [path, file] of Object.entries(known)) if (file.hash !== null) now[path] = file.hash;
			const read = readVersion({ then, before: earlier, now, page });
			const project = c.req.param("project") ?? "";
			const frames = await Promise.all(
				read.frames.map(async (frame) => ({
					name: frame.name,
					now: frame.now,
					same: frame.same,
					did: frame.did,
					then: frame.then
						? { url: documentUrl(project, frame.name, at, undefined), place: await placeAt(found.link, then, frame.name) }
						: null,
					before:
						frame.did === "deleted"
							? {
									url: documentUrl(project, frame.name, before, undefined),
									place: await placeAt(found.link, earlier, frame.name),
								}
							: null,
				})),
			);
			return c.json({ frames, differs: read.differs, shared: read.shared });
		} catch (error) {
			return unread(c, error);
		}
	});

	const served = new Hono().get("/:project/history/:at/frames/:frame", async (c) => {
		const found = where(c);
		if ("response" in found) return c.text("not found", 404);
		const frame = c.req.param("frame");
		const moment = momentOf(c);
		if (!isFramePath(frame) || moment === undefined) return c.text("not found", 404);
		try {
			const doc = await compile(found.root, found.link, moment.at, moment.saved, frame);
			if (doc.kind === "absent") return c.text(`no frame "${frame}" at version ${moment.at}`, 404);
			if (doc.kind === "error") return c.html(doc.document, 500);
			// a moment never changes: the same address is the same document for as long as it is kept
			c.header("cache-control", "no-cache");
			if (c.req.header("if-none-match") === doc.etag) return c.body(null, 304);
			c.header("etag", doc.etag);
			return c.html(doc.document);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return c.html(errorDocument(frame, `the team's history couldn't be read just now: ${message}`), 503);
		}
	});

	return { api, served };
}

function jsonOf(bytes: Uint8Array): unknown {
	try {
		return JSON.parse(Buffer.from(bytes).toString("utf8"));
	} catch {
		return undefined;
	}
}

/**
 * A moment's files as a compile reads them, under a design folder that is nowhere on disk: every path and folder the
 * moment held, and the bytes of those read so far. A file whose bytes aren't here yet reads as empty, and its hash is
 * noted in `missed` for the next round to fetch.
 */
function filesOfMoment(
	designDir: string,
	files: MomentFiles,
	bytes: ReadonlyMap<string, Uint8Array>,
	missed: Set<string>,
): DesignFiles {
	const root = posix.resolve(designDir);
	const hashes = new Map<string, string>();
	const folders = new Map<string, Map<string, DesignFileKind>>();
	const folder = (path: string) => {
		let names = folders.get(path);
		if (names === undefined) {
			names = new Map();
			folders.set(path, names);
		}
		return names;
	};
	folder(root);
	for (const [path, hash] of Object.entries(files)) {
		const file = posix.join(root, path);
		hashes.set(file, hash);
		let child = file;
		let kind: DesignFileKind = "file";
		for (let parent = posix.dirname(child); child !== root; child = parent, parent = posix.dirname(child)) {
			folder(parent).set(posix.basename(child), kind);
			kind = "directory";
		}
	}
	const kind = (path: string): DesignFileKind | undefined => {
		const at = posix.resolve(path);
		return hashes.has(at) ? "file" : folders.has(at) ? "directory" : undefined;
	};
	return {
		read: (path) => {
			const hash = hashes.get(posix.resolve(path));
			if (hash === undefined) return undefined;
			const held = bytes.get(hash);
			if (held !== undefined) return held;
			missed.add(hash);
			return EMPTY;
		},
		list: (path): DesignEntry[] | undefined => {
			const names = folders.get(posix.resolve(path));
			return names === undefined ? undefined : [...names].map(([name, kind]) => ({ name, kind }));
		},
		kind,
		realpath: (path) => (kind(path) === undefined ? undefined : posix.resolve(path)),
	};
}
