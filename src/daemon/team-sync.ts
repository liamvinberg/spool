import { createHash } from "node:crypto";
import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { WebSocket } from "undici";
import { writeAtomic } from "../atomic-write";
import type { CloudVault } from "../cloud-auth";
import { SpoolError } from "../errors";
import { isTeamProject, type ProjectLink, readProjectLink } from "../team-project";
import { decodeFrame, encodeFrame, PROTOCOL_VERSION, travels } from "../team-sync-protocol";
import { FORMAT_VERSION } from "../templates";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { type TreeWatch, watchTree } from "./watch-tree";

/**
 * The daemon's half of team sync: one connection per local copy to the team project's sync object at
 * spool.page, which orders every save and relays it to every other editor.
 *
 * A local save goes up whole, carrying the team version it was built on. A teammate's save comes down and is
 * written atomically as a real file, so the canvas, the photo booth and every agent read it like any other
 * edit. Before writing, the copy records the file as the team's version, which is how the watcher tells a
 * teammate's write from a local save and never sends it back.
 *
 * Only Spool's own layout travels (`travels`), checked here on the way out and again on the way in.
 */

/** What a local copy remembers of the team between runs, in `design/.spool`, which never travels. */
interface CopyState {
	project: string;
	/** The newest team version this copy has been sent. */
	head: number;
	/** Each path as this copy last had it from the team: its version, and its hash or null for deleted. */
	files: Record<string, { version: number; hash: string | null }>;
}

export interface SyncSocket {
	send(frame: string | Uint8Array): void;
	close(): void;
}

export interface SyncSocketEvents {
	open(): void;
	message(data: string | ArrayBuffer): void;
	close(): void;
}

/** The connection itself, swapped by tests for an in-process team. */
export type OpenSyncSocket = (url: string, token: string, events: SyncSocketEvents) => SyncSocket;

export interface LocalCopyOptions {
	root: string;
	/** The spool.page this machine signs in to. A link to any other is refused: the token never goes there. */
	origin: string;
	vault: Pick<CloudVault, "read">;
	openSocket?: OpenSyncSocket;
	notice?: (message: string) => void;
}

export interface LocalCopy {
	/** Resolves whenever the copy is caught up and nothing it sent is waiting on an answer. */
	idle(): Promise<void>;
	close(): void;
}

/** How long the watcher's burst for one save is let settle before the files are read. */
const SETTLE_MS = 50;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
/** A keepalive the sync object answers without waking. */
const PING_MS = 30_000;

/** A local copy kept in step with its team for as long as the daemon runs: it reconnects, and follows the folder. */
export function followLocalCopy(options: LocalCopyOptions): LocalCopy {
	return localCopy(options, true);
}

/**
 * Bring a local copy level with the team once, then disconnect: everything the team has comes down, and
 * everything new here goes up. What `spool init --team` uploads with and what a fetch fills `design/` with.
 */
export async function syncLocalCopy(options: LocalCopyOptions): Promise<void> {
	const copy = localCopy(options, false);
	try {
		await copy.idle();
	} finally {
		copy.close();
	}
}

/** The sync socket's address for a team project. */
export function syncUrl(link: ProjectLink): string {
	return `${link.origin.replace(/^https:/u, "wss:")}/api/teams/${link.team}/projects/${link.project}/sync`;
}

function localCopy(options: LocalCopyOptions, live: boolean): LocalCopy {
	const notice = options.notice ?? ((message: string) => console.error(`spool: ${message}`));
	const openSocket = options.openSocket ?? openWebSocket;
	const link = readProjectLink(options.root);
	if (link.origin !== options.origin)
		throw new SpoolError(
			`${options.root}/spool.json names ${link.origin}, but this machine signs in to ${options.origin}; it is not synced`,
		);
	const designDir = realDesignDir(options.root);
	const stateFile = join(designDir, ".spool", "sync.json");
	const state = readState(stateFile, link.url);

	let closed = false;
	let socket: SyncSocket | undefined;
	let caughtUp = false;
	let failure: Error | undefined;
	let retryMs = RECONNECT_MIN_MS;
	let retry: NodeJS.Timeout | undefined;
	let ping: NodeJS.Timeout | undefined;
	let refs = 0;
	/** Saves sent and not yet answered, by their ref. */
	const inflight = new Map<string, { path: string; hash: string | null }>();
	/** Paths that changed again while their last save was in flight. */
	const dirty = new Set<string>();
	/** Paths whose save was set aside: the team's version that follows overwrites what is here. */
	const yielding = new Set<string>();
	const changed = new Set<string>();
	let settle: NodeJS.Timeout | undefined;
	let watch: TreeWatch | undefined;
	let waiters: { resolve(): void; reject(error: Error): void }[] = [];

	const persist = () => writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
	const isIdle = () => caughtUp && inflight.size === 0 && yielding.size === 0 && changed.size === 0;
	const wake = () => {
		if (!isIdle()) return;
		for (const waiter of waiters.splice(0)) waiter.resolve();
	};
	const fail = (error: Error) => {
		failure = error;
		for (const waiter of waiters.splice(0)) waiter.reject(error);
	};

	/** The bytes of a regular file at a design-relative path, or nothing for a missing file, a folder or a link. */
	const readLocal = (path: string): Buffer | undefined => {
		const file = join(designDir, ...path.split("/"));
		const stat = lstatSync(file, { throwIfNoEntry: false });
		return stat?.isFile() === true ? readFileSync(file) : undefined;
	};

	const send = (path: string, bytes: Buffer | undefined) => {
		if (socket === undefined) return;
		const ref = String(++refs);
		const hash = bytes === undefined ? null : digest(bytes);
		inflight.set(ref, { path, hash });
		socket.send(
			encodeFrame(
				{ type: "save", ref, path, base: state.files[path]?.version ?? null, deleted: bytes === undefined },
				bytes,
			),
		);
	};

	/** Send one path if it differs from the team's version this copy last had. */
	const check = (path: string) => {
		if (!travels(path)) return;
		if ([...inflight.values()].some((sent) => sent.path === path)) {
			dirty.add(path);
			return;
		}
		const bytes = readLocal(path);
		const hash = bytes === undefined ? null : digest(bytes);
		const known = state.files[path];
		if (hash === (known?.hash ?? null)) return;
		send(path, bytes);
	};

	/** Every travelling file on disk, and every path the team has that may have gone from it. */
	const checkEverything = () => {
		for (const path of new Set([...filesUnder(designDir, ""), ...Object.keys(state.files)])) check(path);
	};

	/** What a watcher event names: the path itself, everything under it if it is a folder, and anything that was. */
	const checkChanged = () => {
		settle = undefined;
		const paths = [...changed];
		changed.clear();
		if (!caughtUp) return;
		for (const path of paths) {
			// .spool and every other dot-folder are this machine's alone
			if (path.split("/").some((segment) => segment.startsWith("."))) continue;
			check(path);
			for (const under of filesUnder(designDir, path)) check(under);
			for (const known of Object.keys(state.files)) if (known.startsWith(`${path}/`)) check(known);
		}
		wake();
	};

	/** A teammate's save, or the team's version of a path in a catch-up. */
	const receive = (message: Record<string, unknown>, bytes: Uint8Array | undefined) => {
		const { path, version, deleted } = message;
		if (typeof path !== "string" || typeof version !== "number" || deleted !== (bytes === undefined)) return;
		if (version > state.head) state.head = version;
		// a hostile or broken cloud could name anything: only Spool's own layout is ever written
		let target: string;
		try {
			if (!travels(path)) throw new Error(path);
			target = resolveDesignPath(designDir, join(designDir, ...path.split("/")), path);
		} catch {
			notice(`refused a team file outside Spool's layout: ${path}`);
			return;
		}
		const incoming = bytes === undefined ? null : digest(bytes);
		const local = readLocal(path);
		const here = local === undefined ? null : digest(local);
		if (here !== incoming && here !== (state.files[path]?.hash ?? null) && !yielding.has(path)) {
			// changed here and not sent yet: it goes up built on the version it was, and the team settles it
			persist();
			return;
		}
		yielding.delete(path);
		// the team's version first, so the watcher reads this write as the team's and never sends it back
		state.files[path] = { version, hash: incoming };
		persist();
		if (here === incoming) return;
		if (bytes === undefined) {
			rmSync(target, { force: true });
			pruneEmpty(designDir, dirname(target));
		} else writeAtomic(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
	};

	const handle = (data: string | ArrayBuffer) => {
		const framed = decodeFrame(data);
		if (framed === null) return;
		const { message, bytes } = framed;
		if (message.type === "file") receive(message, bytes);
		else if (message.type === "caught-up") {
			if (typeof message.head === "number" && message.head > state.head) state.head = message.head;
			persist();
			caughtUp = true;
			retryMs = RECONNECT_MIN_MS;
			checkEverything();
		} else if (message.type === "saved" || message.type === "set-aside" || message.type === "refused") {
			const sent = typeof message.ref === "string" ? inflight.get(message.ref) : undefined;
			if (sent === undefined || typeof message.ref !== "string") return;
			inflight.delete(message.ref);
			if (message.type === "saved" && typeof message.version === "number") {
				state.files[sent.path] = { version: message.version, hash: sent.hash };
				persist();
			}
			if (message.type === "set-aside") {
				yielding.add(sent.path);
				notice(`your change to ${sent.path} was set aside: a teammate's save reached the team first`);
			}
			if (message.type === "refused") notice(`${sent.path} did not travel: ${String(message.reason)}`);
			if (dirty.delete(sent.path)) check(sent.path);
		}
		wake();
	};

	const connect = async () => {
		retry = undefined;
		if (closed) return;
		let token: string | undefined;
		try {
			token = await options.vault.read();
		} catch {
			token = undefined;
		}
		if (closed) return;
		if (token === undefined) {
			if (!live) return fail(new SpoolError("not signed in; run `spool login`"));
			notice(`${link.url} is not synced while this machine is signed out; run \`spool login\``);
			return reconnect();
		}
		socket = openSocket(syncUrl(link), token, {
			open: () => {
				socket?.send(
					encodeFrame({ type: "hello", protocol: PROTOCOL_VERSION, format: FORMAT_VERSION, since: state.head }),
				);
			},
			message: handle,
			close: () => {
				socket = undefined;
				caughtUp = false;
				// what was in flight is settled by the next catch-up: applied saves come back as the team's version
				inflight.clear();
				dirty.clear();
				yielding.clear();
				if (closed) return;
				if (!live) return fail(new SpoolError(`spool.page closed the sync connection for ${link.url}`));
				reconnect();
			},
		});
	};

	const reconnect = () => {
		if (closed || retry !== undefined) return;
		retry = setTimeout(() => void connect(), retryMs);
		retry.unref?.();
		retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
	};

	if (live) {
		watch = watchTree(
			designDir,
			(filename) => {
				if (filename === null) return;
				changed.add(filename.split(sep).join("/"));
				settle ??= setTimeout(checkChanged, SETTLE_MS);
			},
			() => notice(`stopped watching ${designDir}; restart spool to sync it again`),
		);
		ping = setInterval(() => socket?.send("ping"), PING_MS);
		ping.unref?.();
	}
	void connect();

	return {
		idle: () =>
			failure !== undefined
				? Promise.reject(failure)
				: isIdle()
					? Promise.resolve()
					: new Promise<void>((resolve, reject) => waiters.push({ resolve, reject })),
		close: () => {
			closed = true;
			if (retry !== undefined) clearTimeout(retry);
			if (settle !== undefined) clearTimeout(settle);
			if (ping !== undefined) clearInterval(ping);
			watch?.close();
			socket?.close();
			socket = undefined;
			waiters = [];
		},
	};
}

/**
 * Every team project the daemon has registered, followed for as long as it stays registered. A local copy
 * whose `design/` isn't there yet waits for a fetch to fill it.
 */
export function createTeamSync(deps: {
	origin: () => string;
	vault: (origin: string) => Pick<CloudVault, "read">;
	openSocket?: OpenSyncSocket;
	notice?: (message: string) => void;
}) {
	const copies = new Map<string, LocalCopy>();
	let closed = false;
	return {
		keeping(roots: readonly string[]): void {
			if (closed) return;
			const wanted = roots.filter((root) => isTeamProject(root) && existsSync(join(root, "design", "canvas.json")));
			for (const [root, copy] of copies) {
				if (wanted.includes(root)) continue;
				copy.close();
				copies.delete(root);
			}
			for (const root of wanted) {
				if (copies.has(root)) continue;
				try {
					const origin = deps.origin();
					copies.set(
						root,
						followLocalCopy({
							root,
							origin,
							vault: deps.vault(origin),
							...(deps.openSocket === undefined ? {} : { openSocket: deps.openSocket }),
							...(deps.notice === undefined ? {} : { notice: deps.notice }),
						}),
					);
				} catch (error) {
					(deps.notice ?? console.error)(error instanceof Error ? error.message : String(error));
				}
			}
		},
		/** The local copy at a root, while it is followed. */
		copy: (root: string): LocalCopy | undefined => copies.get(root),
		close(): void {
			closed = true;
			for (const copy of copies.values()) copy.close();
			copies.clear();
		},
	};
}

export type TeamSync = ReturnType<typeof createTeamSync>;

const openWebSocket: OpenSyncSocket = (url, token, events) => {
	const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
	socket.binaryType = "arraybuffer";
	socket.addEventListener("open", () => events.open());
	socket.addEventListener("message", (event) => events.message(event.data as string | ArrayBuffer));
	// a failed handshake or a dropped line is an error and then a close; the close is what is answered
	socket.addEventListener("error", () => {});
	socket.addEventListener("close", () => events.close());
	return { send: (frame) => socket.send(frame), close: () => socket.close() };
};

function readState(file: string, project: string): CopyState {
	try {
		const state = JSON.parse(readFileSync(file, "utf8")) as CopyState;
		if (state.project === project && typeof state.head === "number" && typeof state.files === "object") return state;
	} catch {
		// a copy with no record yet starts from nothing: the catch-up brings the whole team copy
	}
	return { project, head: 0, files: {} };
}

function digest(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** Every regular file under a design-relative folder that could travel, never through a dot-folder. */
function filesUnder(designDir: string, path: string): string[] {
	const found: string[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) found.push(relative(designDir, full).split(sep).join("/"));
		}
	};
	walk(path === "" ? designDir : join(designDir, ...path.split("/")));
	return found.filter(travels);
}

/** Folders a teammate's deletes emptied go too, so an emptied frame is no page; `frames/` and `shared/` stay. */
function pruneEmpty(designDir: string, dir: string): void {
	for (let at = dir; relative(designDir, at).includes(sep); at = dirname(at)) {
		try {
			if (readdirSync(at).length > 0) return;
			rmdirSync(at);
		} catch {
			return;
		}
	}
}
