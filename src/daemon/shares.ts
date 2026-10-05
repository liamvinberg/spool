import { createHash } from "node:crypto";
import { type Dirent, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { writeAtomic } from "../atomic-write";
import { account, type CloudRequestOptions, CloudSignedOut, cloudOrigin } from "../cloud-auth";
import { CloudShareRefused, cloudShares, type SharePlace } from "../cloud-shares";
import { CloudTeamRefused } from "../cloud-teams";
import { ROOT_PAGE } from "../page-path";
import type { ProjectShares, ShareRequest } from "../share-view";
import { localCopyOf } from "../team-project";
import { FILE_LIMIT_BYTES, travels } from "../team-sync-protocol";
import { daemonCompileHost } from "./compile-host";
import { compileFrameDocument } from "./design-compile";
import { realDesignDir } from "./design-path";
import { projectDesign } from "./design-projection";
import { diskDesignFiles } from "./disk-files";
import { hasEnded } from "./team-sync";

/** A solo project's link to spool.page, beside its other machine state: which cloud, and the id it was given. */
const SHARE_STATE = ".spool/share.json";
/** How long a shared page of a solo project goes without saves before its files go up anyway. */
export const SOLO_QUIET_MS = 30_000;

interface SoloShareState {
	origin: string;
	project: string;
}

export interface ProjectSharesOptions {
	spoolDir: string;
	/** Where spool.page is, the Keychain and the fetch: the machine's own unless a test hands in a fake. */
	request?: CloudRequestOptions | undefined;
	/** Spool's version, as a frame's compile is asked for it. */
	version: string;
	resolve: (c: Context, name: string) => { root: string } | { response: Response };
	/** Follow a project's saves; returns how to stop. */
	watch: (root: string, saved: () => void) => () => void;
	log?: (line: string) => void;
}

/**
 * The daemon's side of sharing a project's pages. A team project's shares live in spool.page, and this Mac's
 * editor changes them through its device session. A solo project shares the same way: its daemon starts it at
 * spool.page the first time, and uploads only what its shared pages are made of (each shared frame's own folder
 * and every file its compile reads, the canvas's order, the scenarios), by content hash, sending only the bytes
 * spool.page lacks, then the covers of the frames it shows. It uploads again when its agent's turn ends, or once
 * its saves have been quiet a while, which is when outsiders see a page move on.
 */
export function createProjectShares(options: ProjectSharesOptions) {
	const log = options.log ?? (() => {});
	const origin = () => options.request?.origin ?? cloudOrigin(process.env);
	const client = () => cloudShares(options.spoolDir, { ...options.request, origin: origin() });
	/** One upload at a time, in the order asked. */
	let queue: Promise<unknown> = Promise.resolve();
	const quiet = new Map<string, ReturnType<typeof setTimeout>>();
	const watching = new Map<string, () => void>();
	/** The newest cover the booth took of each frame since the daemon started, with the version it is of. */
	const shots = new Map<string, { source: string; bytes: Uint8Array }>();
	/** The frames each solo project's last upload showed: the only ones whose covers leave this Mac. */
	const shown = new Map<string, ReadonlySet<string>>();

	const sendCover = async (id: string, frame: string, cover: { source: string; bytes: Uint8Array }) => {
		const cloud = client();
		if (!(await cloud.hasCover(id, cover.source))) await cloud.putCover(id, cover.source, frame, cover.bytes);
	};

	const stateFile = (root: string) => join(root, "design", SHARE_STATE);
	const readState = (root: string): SoloShareState | undefined => {
		try {
			const value = JSON.parse(readFileSync(stateFile(root), "utf8")) as Partial<SoloShareState>;
			return typeof value.origin === "string" && typeof value.project === "string"
				? { origin: value.origin, project: value.project }
				: undefined;
		} catch {
			return undefined;
		}
	};

	/** Where a project's shares are, or why it has none: a team's own, a solo project's, or one yet to start. */
	const placeOf = (root: string): SharePlace | "new" | "unavailable" => {
		const link = localCopyOf(root);
		if (link !== undefined)
			return hasEnded(root) || link.origin !== origin()
				? "unavailable"
				: { kind: "team", team: link.team, project: link.project };
		const state = readState(root);
		if (state === undefined) return "new";
		return state.origin === origin() ? { kind: "solo", id: state.project } : "unavailable";
	};

	const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
		const next = queue.then(run, run);
		queue = next.catch(() => {});
		return next;
	};

	/**
	 * Put a solo project's shared pages at spool.page as they stand: the files they are made of and nothing else,
	 * the bytes it lacks first, then the list that makes them its copy, then the covers of their frames. The pages
	 * are its live shares', or those a share about to be made asks for; with none, its copy there is emptied.
	 */
	async function upload(root: string, id: string, asked?: readonly string[]): Promise<void> {
		const cloud = client();
		const pages = asked ?? [
			...new Set((await cloud.list({ kind: "solo", id })).shares.flatMap((share) => share.pages)),
		];
		const { files, frames, sources } = await sharedFiles(root, realDesignDir(root), pages, options.version);
		const hashes: Record<string, string> = {};
		for (const [path, bytes] of files) hashes[path] = sha256(bytes);
		const byHash = new Map([...files].map(([path, bytes]) => [hashes[path] ?? "", bytes]));
		const send = async (missing: readonly string[]) => {
			for (const hash of missing) {
				const bytes = byHash.get(hash);
				if (bytes !== undefined) await cloud.putBlob(id, hash, bytes);
			}
		};
		await send((await cloud.lacking(id, [...new Set(Object.values(hashes))])).missing);
		try {
			await cloud.putSource(id, hashes);
		} catch (error) {
			// bytes spool.page let go of meanwhile: sent again, once
			if (!(error instanceof CloudShareRefused) || error.missing.length === 0) throw error;
			await send(error.missing);
			await cloud.putSource(id, hashes);
		}
		shown.set(root, new Set(frames));
		// a frame's cover goes up under the version it is of, so outsiders see it while that version is theirs
		for (const frame of frames) {
			const cover = shots.get(`${root}\0${frame}`);
			if (cover !== undefined && cover.source === sources.get(frame)) await sendCover(id, frame, cover);
		}
		if (asked !== undefined) return;
		if (pages.length === 0) stopWatching(root);
		else follow(root);
	}

	/** A solo project's shared pages, uploaded now: after a turn, a quiet spell, or a share's change. */
	const uploadNow = (root: string) => {
		const place = placeOf(root);
		if (typeof place === "string" || place.kind !== "solo") return Promise.resolve();
		clearTimeout(quiet.get(root));
		quiet.delete(root);
		return enqueue(() => upload(root, place.id)).catch((error: unknown) => {
			if (!(error instanceof CloudSignedOut))
				log(`the shared pages of ${basename(root)} weren't sent: ${describe(error)}`);
		});
	};

	/** Follow a shared solo project's saves: once they have been quiet a while, its shared pages go up. */
	function follow(root: string): void {
		if (watching.has(root)) return;
		watching.set(
			root,
			options.watch(root, () => {
				clearTimeout(quiet.get(root));
				const timer = setTimeout(() => void uploadNow(root), SOLO_QUIET_MS);
				timer.unref?.();
				quiet.set(root, timer);
			}),
		);
	}

	function stopWatching(root: string): void {
		watching.get(root)?.();
		watching.delete(root);
		clearTimeout(quiet.get(root));
		quiet.delete(root);
	}

	/** Answer the canvas: the project's shares as spool.page has them, or why it has none. */
	const answer = async (c: Context, act: () => Promise<unknown>) => {
		try {
			return c.json((await act()) ?? {});
		} catch (error) {
			if (error instanceof CloudTeamRefused)
				return c.json({ error: error.code }, error.status as ContentfulStatusCode);
			if (error instanceof CloudSignedOut) return c.json({ error: "signed_out" }, 401);
			return c.json({ error: "unreachable" }, 503);
		}
	};

	const routes = new Hono()
		.get("/:project/shares", async (c) => {
			const project = options.resolve(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const place = placeOf(project.root);
			if (place === "unavailable") return c.json({ state: "unavailable" } satisfies ProjectShares);
			try {
				// a project that has never shared has nothing at spool.page yet: it may share once someone is signed in
				if (place === "new") await account(options.spoolDir, { ...options.request, origin: origin() });
				const shares = place === "new" ? [] : (await client().list(place)).shares;
				if (place !== "new" && place.kind === "solo" && shares.length > 0) follow(project.root);
				return c.json({ state: "ready", shares, manage: true } satisfies ProjectShares);
			} catch (error) {
				return c.json(
					(error instanceof CloudSignedOut
						? { state: "signed-out" }
						: { state: "unreachable" }) satisfies ProjectShares,
				);
			}
		})
		.post("/:project/shares", async (c) => {
			const project = options.resolve(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const request = (await c.req.json().catch(() => null)) as ShareRequest | null;
			if (request === null || typeof request !== "object") return c.json({ error: "invalid_share" }, 400);
			const { root } = project;
			return answer(c, async () => {
				let place = placeOf(root);
				if (place === "unavailable") throw new CloudTeamRefused("unavailable", 409);
				if (place === "new") {
					const started = await client().createSolo(basename(root));
					writeAtomic(stateFile(root), `${JSON.stringify({ origin: origin(), project: started.id })}\n`);
					place = { kind: "solo", id: started.id };
				}
				if (place.kind === "team") return client().create(place, request);
				// a solo project's new pages go up before the share that shows them, so it opens on them at once
				const solo = place;
				await enqueue(async () => {
					const { shares } = await client().list(solo);
					const pages = [...new Set([...shares.flatMap((share) => share.pages), ...(request.pages ?? [])])];
					await upload(root, solo.id, pages);
				});
				const share = await client().create(solo, request);
				follow(root);
				return share;
			});
		})
		.patch("/:project/shares/:share", async (c) => {
			const project = options.resolve(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const change = (await c.req.json().catch(() => ({}))) as { add?: string[]; remove?: string[] };
			return answer(c, async () => {
				const place = placeOf(project.root);
				if (typeof place === "string") throw new CloudTeamRefused("share_not_found", 404);
				await client().change(place, c.req.param("share"), change);
				return null;
			});
		})
		.delete("/:project/shares/:share", async (c) => {
			const project = options.resolve(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return answer(c, async () => {
				const place = placeOf(project.root);
				if (typeof place === "string") throw new CloudTeamRefused("share_not_found", 404);
				await client().stop(place, c.req.param("share"));
				// what only the stopped share showed leaves spool.page with it
				if (place.kind === "solo") void uploadNow(project.root);
				return null;
			});
		});

	return {
		routes,
		/** The agent on a project finished its turn: a shared solo project's pages go up now. */
		turnEnded: (root: string) => {
			if (watching.has(root)) void uploadNow(root);
		},
		/** The registered projects: a solo project that shares is followed from the daemon's start. */
		keeping: (roots: Iterable<string>) => {
			const kept = new Set(roots);
			for (const root of kept) {
				const place = placeOf(root);
				if (typeof place !== "string" && place.kind === "solo") follow(root);
			}
			for (const root of [...watching.keys()]) if (!kept.has(root)) stopWatching(root);
		},
		/**
		 * The booth took a frame's cover: kept for the next upload, and sent now when the project is a shared solo
		 * project (a team project's go up through `team-covers.ts`).
		 */
		covered: (root: string, frame: string, source: string, bytes: Uint8Array) => {
			shots.set(`${root}\0${frame}`, { source, bytes });
			const place = placeOf(root);
			if (typeof place === "string" || place.kind !== "solo" || !shown.get(root)?.has(frame)) return;
			void enqueue(() => sendCover(place.id, frame, { source, bytes })).catch(() => {
				// not a frame spool.page holds, or out of reach: the next upload sends it
			});
		},
		/** Everything asked of spool.page so far, finished. */
		settled: () => queue,
		close: () => {
			for (const root of [...watching.keys()]) stopWatching(root);
		},
	};
}

export type ProjectSharesService = ReturnType<typeof createProjectShares>;

/**
 * What a solo project's shared pages are made of: the canvas's order, each shared frame's own folder, every file
 * its compile reads, and the scenarios a frame reads as it plays. Only what may travel (the same layout a team
 * project syncs), regular files only, none over 25 MB.
 */
export async function sharedFiles(
	root: string,
	designDir: string,
	pages: readonly string[],
	version: string,
): Promise<{ files: Map<string, Buffer>; frames: string[]; sources: Map<string, string> }> {
	const wanted = new Set<string>(["canvas.json"]);
	const shown = new Set(pages);
	const frames = projectDesign(designDir, diskDesignFiles)
		.frames.filter((frame) => shown.has(frame.page ?? ROOT_PAGE))
		.map((frame) => frame.name);
	const sources = new Map<string, string>();
	for (const frame of frames) {
		for (const path of filesUnder(designDir, `frames/${frame}`)) wanted.add(path);
		try {
			const compiled = await compileFrameDocument(daemonCompileHost, {
				designDir,
				frame,
				project: basename(root),
				authority: { projectCapability: "", controlOrigin: "http://127.0.0.1" },
				version,
			});
			sources.set(frame, compiled.source);
			for (const input of compiled.inputs) {
				const path = relative(designDir, input).split(sep).join("/");
				if (!path.startsWith("..")) wanted.add(path);
			}
		} catch {
			// a frame that doesn't compile goes up as its own folder: spool.page keeps showing its last version
		}
	}
	if (frames.length > 0) for (const path of filesUnder(designDir, "shared/scenarios")) wanted.add(path);
	const files = new Map<string, Buffer>();
	for (const path of [...wanted].sort()) {
		if (!travels(path)) continue;
		const file = join(designDir, path);
		try {
			const stat = lstatSync(file);
			if (stat.isFile() && stat.size <= FILE_LIMIT_BYTES) files.set(path, readFileSync(file));
		} catch {
			// gone, or never there: an input a compile looked for and didn't find
		}
	}
	return { files: shown.size === 0 ? new Map() : files, frames, sources };
}

/** Every file in a folder and below it, design-relative, leaving out any frame nested inside and dot-entries. */
function filesUnder(designDir: string, folder: string): string[] {
	const found: string[] = [];
	const walk = (at: string, top: boolean) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(join(designDir, at), { withFileTypes: true });
		} catch {
			return;
		}
		if (!top && entries.some((entry) => entry.name === "frame.tsx" && entry.isFile())) return;
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const path = `${at}/${entry.name}`;
			if (entry.isDirectory()) walk(path, false);
			else if (entry.isFile()) found.push(path);
		}
	};
	walk(folder, true);
	return found;
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function describe(error: unknown): string {
	if (error instanceof CloudTeamRefused) return error.code;
	return error instanceof Error ? error.message : String(error);
}
