import { createHash, randomUUID } from "node:crypto";
import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, rmSync, type Stats } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { WebSocket } from "undici";
import { writeAtomic } from "../atomic-write";
import { CloudSignedOut, type CloudVault } from "../cloud-auth";
import { CloudTeamRefused, cloudTeams } from "../cloud-teams";
import { SpoolError } from "../errors";
import { localCopyOf, type ProjectLink, parseProjectLink, TEAM_GITIGNORE } from "../team-project";
import {
	CLOSE_NOT_EDITOR,
	CLOSE_SIGNED_OUT,
	decodeFrame,
	encodeFrame,
	FILE_LIMIT_BYTES,
	type Limited,
	PROJECT_LIMIT_BYTES,
	PROTOCOL_VERSION,
	type Presence,
	type PresenceState,
	RESEND_PATHS,
	readPresenceState,
	SAVES_PER_MINUTE,
	SAVES_PER_MONTH,
	travels,
} from "../team-sync-protocol";
import { FORMAT_VERSION, SOLO_GITIGNORE } from "../templates";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { guardAgainstGit } from "./git-guard";
import { forgetMarks, recordMark, type SetAsideMark } from "./set-aside";
import { rescanAfterWatchStarts, type TreeWatch, watchTree } from "./watch-tree";

/**
 * The daemon's half of team sync: one connection per local copy to the team project's sync object at
 * spool.page, which orders every save and relays it to every other editor.
 *
 * A local save goes up whole, carrying the team version it was built on. A teammate's save comes down and is
 * written atomically as a real file, so the canvas, the photo booth and every agent read it like any other
 * edit. Before writing, the copy records the file as the team's version, which is how the watcher tells a
 * teammate's write from a local save and never sends it back.
 *
 * Only Spool's own layout travels (`travels`), checked here on the way out and again on the way in: regular
 * files reached through real folders, 25 MB at most. What doesn't travel stays here and the copy says so.
 */

/** What a local copy remembers of the team between runs, in `design/.spool`, which never travels. */
interface CopyState {
	project: string;
	/** The newest team version this copy has been sent. */
	head: number;
	/** Each path as this copy last had it from the team: its version, and its hash or null for deleted. */
	files: Record<string, { version: number; hash: string | null }>;
	/** The team project ended for this machine, and the folder is an ordinary project here now. */
	ended?: true;
	/** When this copy last watched design/ for git (ms): whatever git did after it is checked as git's. */
	watched?: number;
}

export interface SyncSocket {
	send(frame: string | Uint8Array): void;
	close(): void;
}

export interface SyncSocketEvents {
	open(): void;
	message(data: string | ArrayBuffer): void;
	/** `code` is the close code the cloud gave, if it gave one. */
	close(code?: number): void;
}

/**
 * Whether this machine still edits a team project, as spool.page says when asked: `not_editor` when the account
 * was removed or made a viewer or the team or project is gone, `unknown` when spool.page can't be reached.
 */
export type Standing = "editor" | "not_editor" | "signed_out" | "unknown";

/** The connection itself, swapped by tests for an in-process team. */
export type OpenSyncSocket = (url: string, token: string, events: SyncSocketEvents) => SyncSocket;

export interface LocalCopyOptions {
	root: string;
	/** The spool.page this machine signs in to. A link to any other is refused: the token never goes there. */
	origin: string;
	vault: Pick<CloudVault, "read">;
	openSocket?: OpenSyncSocket;
	notice?: (message: string) => void;
	/** This copy's set-aside marks changed: one of its saves lost a collision, or a mark went. */
	onMarks?: () => void;
	/** Another person on this team canvas moved, arrived or left (`state` null). */
	onPresence?: (presence: Presence) => void;
	/** Asked when spool.page refused or cut the connection: does this machine still edit the project? */
	standing?: () => Promise<Standing>;
	/** The project ended for this machine. The copy has stopped; ending it is its owner's. */
	ended?: () => void;
	/**
	 * A solo project moving into this team project (DEV-190): it has no `spool.json` until the team has every file,
	 * and everything on disk is the person's own work, git-tracked or not, so git's index is never consulted.
	 */
	moving?: ProjectLink;
}

export interface LocalCopy {
	/** Resolves whenever the copy is caught up and nothing it sent is waiting on an answer. */
	idle(): Promise<void>;
	/** Where this machine's person is on the canvas, or null once nobody here is looking. Never stored. */
	presence(state: PresenceState | null): void;
	/** Everyone else on the canvas now, `still` counted to this moment. */
	people(): Presence[];
	/**
	 * The agent this daemon runs on the project finished its turn: said to the team once the turn's saves have gone
	 * up, so the pages they touched settle for outsiders. Offline, nothing is said, and a quiet spell does it.
	 */
	turnEnded(): void;
	close(): void;
}

/** Why a file git put in design/ that the team doesn't have stays on this machine. */
const GIT_ONLY = "git put it here and your team doesn't have it; edit it to send it";
/** Why a file outside the layout stays on the machine that wrote it. */
const OUTSIDE_LAYOUT = "only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync";
/** How sync says each limit it paused on. */
const LIMITS: Record<Limited, string> = {
	project_full: `the team's design/ is at its ${PROJECT_LIMIT_BYTES / 1_000_000_000} GB limit`,
	rate_limited: `this project took ${SAVES_PER_MINUTE} saves in the last minute`,
	monthly_limit: `you've made ${SAVES_PER_MONTH.toLocaleString("en")} saves to this project this month`,
	unavailable: "spool.page couldn't check saves just now",
};
/** How long a pause lasts when spool.page can't say when its limit lifts. */
const RETRY_LIMIT_SECONDS = 60;
/** How long the copy's record waits for more changes before it is written: a catch-up of many files is one write. */
const RECORD_MS = 250;
/** How long the watcher's burst for one save is let settle before the files are read. */
const SETTLE_MS = 50;
/** A file this big must have been still for longer before it is read: it may be being written in many pieces. */
const BIG_FILE_BYTES = 1_000_000;
const BIG_FILE_STILL_MS = 500;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
/** A keepalive the sync object answers without waking. */
const PING_MS = 30_000;
/** How long a turn's last writes are given to reach the watcher before its end is said after them. */
const TURN_SETTLE_MS = 500;
/** The longest git may hold its index lock before what it left is looked at anyway: a crashed git leaves one. */
const GIT_WAIT_MS = 10_000;

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
	const link = options.moving ?? followedLink(options.root);
	if (link === undefined) throw new SpoolError(`${options.root} is not a local copy of a team project`);
	if (link.origin !== options.origin)
		throw new SpoolError(
			`${options.root}/spool.json names ${link.origin}, but this machine signs in to ${options.origin}; it is not synced`,
		);
	const designDir = realDesignDir(options.root);
	const stateFile = join(designDir, ".spool", "sync.json");
	const state = readState(stateFile, link.url);
	/**
	 * A copy with no record of the team yet holds only its person's own work, as a move does: what git tracks in a
	 * teammate's `design/` after a pull of the move commit that had to merge is frames they made, which go up.
	 */
	let ownWork = Object.keys(state.files).length === 0;

	let closed = false;
	let socket: SyncSocket | undefined;
	let caughtUp = false;
	let failure: Error | undefined;
	let retryMs = RECONNECT_MIN_MS;
	let retry: NodeJS.Timeout | undefined;
	let ping: NodeJS.Timeout | undefined;
	let refs = 0;
	/** Saves sent and not yet answered, by their ref, with the bytes a set-aside mark keeps. */
	const inflight = new Map<string, { path: string; hash: string | null; bytes: Buffer | undefined; batch: string }>();
	/** While a connection catches up, everything it sets aside arrives together, as one batch. */
	let burst: string | undefined;
	/** Paths that changed again while their last save was in flight. */
	const dirty = new Set<string>();
	/** Paths whose save was set aside: the team's version that follows overwrites what is here. */
	const yielding = new Set<string>();
	const changed = new Set<string>();
	let settle: NodeJS.Timeout | undefined;
	let watch: TreeWatch | undefined;
	let waiters: { resolve(): void; reject(error: Error): void }[] = [];
	const presence = copyPresence(options.onPresence);
	/** Paths that didn't travel and why, each said once until it travels or goes. */
	const held = new Map<string, string>();
	/** A limit paused sync: why, and until when nothing is sent. What changes meanwhile waits on disk. */
	let paused: { why: string; until: number } | undefined;
	let resume: NodeJS.Timeout | undefined;
	let toldSignedOut = false;

	// a local copy whose folder went (a worktree removed) is neither read from nor written to: what it lacks is no
	// delete, and nothing comes down into it. Its spool.json going is not that: an old branch checked out has none
	const present = () => existsSync(options.root);
	/** The copy has looked at everything git may have done while it wasn't watching, and watches now. */
	let watching = false;
	/** A change to the record not written yet: a burst of files lands as one write, not one per file. */
	let recording: NodeJS.Timeout | undefined;
	const persist = () => {
		if (recording !== undefined) clearTimeout(recording);
		recording = undefined;
		if (watching) state.watched = Date.now();
		if (present()) writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
	};
	const persistSoon = () => {
		recording ??= setTimeout(persist, RECORD_MS);
		recording.unref?.();
	};
	const isIdle = () =>
		caughtUp &&
		inflight.size === 0 &&
		yielding.size === 0 &&
		changed.size === 0 &&
		restoring.size === 0 &&
		deferred.size === 0;
	const wake = () => {
		if (!isIdle()) return;
		for (const waiter of waiters.splice(0)) waiter.resolve();
	};
	const fail = (error: Error) => {
		failure = error;
		for (const waiter of waiters.splice(0)) waiter.reject(error);
	};

	/** What is at a design-relative path, without following a link; nothing when nothing can be there. */
	const statOf = (path: string): Stats | undefined => {
		try {
			return lstatSync(join(designDir, ...path.split("/")), { throwIfNoEntry: false });
		} catch {
			// a file where the path needs a folder
			return undefined;
		}
	};

	/** The bytes of a regular file at a design-relative path, or nothing for a missing file, a folder or a link. */
	const readLocal = (path: string): Buffer | undefined =>
		statOf(path)?.isFile() === true ? readFileSync(join(designDir, ...path.split("/"))) : undefined;

	const stays = (path: string) => whyStays(designDir, path);

	/**
	 * Whether a file was written too recently to be read whole: one may still be being written, and its first part
	 * must not travel as if it were all of it. A big one is let lie longer, since it is written in more pieces.
	 * It is checked again once it has been still that long.
	 */
	const writing = (path: string): boolean => {
		const stat = statOf(path);
		if (stat === undefined) return false;
		const still = stat.size > BIG_FILE_BYTES ? BIG_FILE_STILL_MS : SETTLE_MS;
		const age = Date.now() - stat.mtimeMs;
		if (age < 0 || age >= still) return false;
		changed.add(path);
		if (settle !== undefined) clearTimeout(settle);
		settle = setTimeout(checkChanged, Math.max(still - age, SETTLE_MS));
		return true;
	};

	/** Say once that a file didn't travel and why; it stays here as it is. */
	const hold = (path: string, why: string) => {
		if (held.get(path) === why) return;
		held.set(path, why);
		notice(`${path} didn't travel: ${why}`);
	};

	/** A file the watcher saw outside the layout, said unless it is Spool's own or the system's. */
	const outside = (path: string) => {
		if (path === ".gitignore" || path.startsWith(".spool/") || path.split("/").at(-1) === ".DS_Store") return;
		const stat = statOf(path);
		if (stat?.isFile() === true || stat?.isSymbolicLink() === true) hold(path, OUTSIDE_LAYOUT);
	};

	const isPaused = () => paused !== undefined && Date.now() < paused.until;

	/** A limit was reached: nothing more is sent until it may have lifted, then everything waiting is tried. */
	const pause = (reason: Limited, retryAfter: unknown) => {
		const why = LIMITS[reason];
		if (paused?.why !== why) notice(`Sync paused: ${why}. Changes stay on this Mac until it lifts.`);
		const seconds = typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : RETRY_LIMIT_SECONDS;
		paused = { why, until: Date.now() + seconds * 1_000 };
		if (resume !== undefined) clearTimeout(resume);
		resume = setTimeout(() => {
			resume = undefined;
			if (caughtUp) checkEverything();
			wake();
		}, seconds * 1_000);
		resume.unref?.();
		if (!live) fail(new SpoolError(`sync paused: ${why}`));
	};

	const signedOut = () => {
		if (!toldSignedOut) notice(`${link.url} is not synced while this machine is signed out; run \`spool login\``);
		toldSignedOut = true;
	};

	const send = (path: string, bytes: Buffer | undefined) => {
		if (socket === undefined) return;
		const ref = String(++refs);
		const hash = bytes === undefined ? null : digest(bytes);
		inflight.set(ref, { path, hash, bytes, batch: burst ?? randomUUID() });
		socket.send(
			encodeFrame(
				{ type: "save", ref, path, base: state.files[path]?.version ?? null, deleted: bytes === undefined },
				bytes,
			),
		);
	};

	/** Send one path if it differs from the team's version this copy last had, unless git made it differ. */
	const check = (path: string) => {
		if (!travels(path) || restoring.has(path) || !present() || isPaused()) return;
		if (!ownWork && guard.busy() && !gitStale) {
			deferred.add(path);
			waitForGit();
			return;
		}
		if ([...inflight.values()].some((sent) => sent.path === path)) {
			dirty.add(path);
			return;
		}
		if (writing(path)) return;
		const why = stays(path);
		if (why !== undefined) return hold(path, why);
		const bytes = readLocal(path);
		const hash = bytes === undefined ? null : digest(bytes);
		const known = state.files[path];
		if (hash !== (known?.hash ?? null) && gitWrote(path, bytes)) return restore(path, bytes);
		held.delete(path);
		if (hash !== (known?.hash ?? null)) send(path, bytes);
	};

	// --- the git guard: what git writes into design/ never goes up; the team's version comes back over it ---

	/** Paths git wrote over, whose team version has been asked for and not yet put back. */
	const restoring = new Set<string>();
	/** Paths changed while git held its index lock, looked at once it lets go. */
	const deferred = new Set<string>();
	let gitWait: NodeJS.Timeout | undefined;
	let gitWaitSince = 0;
	let gitStale = false;
	let asking: NodeJS.Immediate | undefined;

	/** design/ went whole, as a pull that untracks it or a `git clean` takes it: refilled, never sent as deletes. */
	const vanished = () => !existsSync(join(designDir, "canvas.json"));

	/** Git's doing, or a folder that vanished: neither is a save. */
	const gitWrote = (path: string, bytes: Buffer | undefined) =>
		(bytes === undefined && vanished()) || (!ownWork && guard.wrote(path, bytes));

	/**
	 * Put the team's version back: ask for its bytes. A file the team doesn't have is left as git left it and never
	 * sent: whatever git wrote is in git, but it is never deleted on git's word, since that word can be wrong.
	 */
	const restore = (path: string, bytes: Buffer | undefined) => {
		if (vanished())
			// everything the folder held comes back, not only what the watcher has named so far
			for (const [missing, file] of Object.entries(state.files))
				if (file.hash !== null && readLocal(missing) === undefined) restoring.add(missing);
		const known = state.files[path];
		if (known === undefined || known.hash === null) {
			if (bytes !== undefined) hold(path, GIT_ONLY);
			return;
		}
		// a folder taken away whole takes its .gitignore with it, and the refill must stay out of git too
		if (!existsSync(join(designDir, ".gitignore"))) {
			const refilling = !existsSync(designDir);
			writeAtomic(join(designDir, ".gitignore"), TEAM_GITIGNORE);
			if (refilling && live) follow();
		}
		restoring.add(path);
		askSoon();
	};

	/** One `resend` for everything restoring, once this pass has found it all. */
	const askSoon = () => {
		asking ??= setImmediate(() => {
			asking = undefined;
			if (socket === undefined || !caughtUp) return;
			const paths = [...restoring];
			for (let at = 0; at < paths.length; at += RESEND_PATHS)
				socket.send(encodeFrame({ type: "resend", paths: paths.slice(at, at + RESEND_PATHS) }));
		});
	};

	const waitForGit = () => {
		if (gitWait !== undefined) return;
		if (deferred.size === 1) gitWaitSince = Date.now();
		gitWait = setTimeout(() => {
			gitWait = undefined;
			if (closed) return;
			if (guard.busy() && Date.now() - gitWaitSince < GIT_WAIT_MS) return waitForGit();
			gitStale = guard.busy();
			const paths = [...deferred];
			deferred.clear();
			for (const path of paths) check(path);
			gitStale = false;
			wake();
		}, SETTLE_MS);
		gitWait.unref?.();
	};

	const guard = options.moving
		? { busy: () => false, wrote: () => false, watching: () => {}, close: () => {} }
		: guardAgainstGit(
				designDir,
				(paths) => {
					for (const path of paths) changed.add(path);
					settle ??= setTimeout(checkChanged, SETTLE_MS);
				},
				state.watched,
			);

	/** Every travelling file on disk, and every path the team has that may have gone from it. */
	const checkEverything = () => {
		for (const path of new Set([...filesUnder(designDir, ""), ...Object.keys(state.files)])) check(path);
	};

	/**
	 * A folder watch started somewhere in the daemon, and macOS may have dropped a save meanwhile: every file changed
	 * since then is looked at, and every known path gone from disk. Before it is caught up, the catch-up does it all.
	 */
	const gaps = live
		? rescanAfterWatchStarts((since) => {
				if (closed || !caughtUp) return;
				for (const path of filesUnder(designDir, "")) if ((statOf(path)?.mtimeMs ?? 0) >= since) check(path);
				for (const path of Object.keys(state.files)) if (statOf(path) === undefined) check(path);
				wake();
			})
		: undefined;

	/** What a watcher event names: the path itself, everything under it if it is a folder, and anything that was. */
	const checkChanged = () => {
		settle = undefined;
		const paths = [...changed];
		changed.clear();
		if (!caughtUp) return;
		for (const path of paths) {
			// .spool and every other dot-folder are this machine's alone
			const dotted = path.split("/").some((segment) => segment.startsWith("."));
			if (dotted || !travels(path)) outside(path);
			if (dotted) continue;
			check(path);
			for (const under of filesUnder(designDir, path)) check(under);
			for (const known of Object.keys(state.files)) if (known.startsWith(`${path}/`)) check(known);
		}
		// a design/ removed whole may be named as nothing more than itself
		if (vanished()) checkEverything();
		wake();
	};

	/** A teammate's save, or the team's version of a path in a catch-up. */
	const receive = (message: Record<string, unknown>, bytes: Uint8Array | undefined) => {
		const { path, version, deleted } = message;
		if (typeof path !== "string" || typeof version !== "number" || deleted !== (bytes === undefined)) return;
		if (!present()) return;
		if (version > state.head) state.head = version;
		// a hostile or broken cloud could name anything: only Spool's own layout is ever written
		let target: string;
		try {
			if (!travels(path) || (bytes?.byteLength ?? 0) > FILE_LIMIT_BYTES) throw new Error(path);
			const named = join(designDir, ...path.split("/"));
			target = resolveDesignPath(designDir, named, path);
			// regular files only: never written through a symlink, even one that stays inside design/
			if (target !== named) throw new Error(path);
		} catch {
			notice(`refused a team file outside Spool's layout: ${path}`);
			return;
		}
		const incoming = bytes === undefined ? null : digest(bytes);
		const local = readLocal(path);
		const here = local === undefined ? null : digest(local);
		if (
			here !== incoming &&
			here !== (state.files[path]?.hash ?? null) &&
			!yielding.has(path) &&
			!restoring.has(path)
		) {
			// changed here and not sent yet: it goes up built on the version it was, and the team settles it
			persistSoon();
			return;
		}
		yielding.delete(path);
		restoring.delete(path);
		// the team's version first, so the watcher reads this write as the team's and never sends it back
		state.files[path] = { version, hash: incoming };
		persistSoon();
		if (here === incoming) return;
		if (bytes === undefined) {
			rmSync(target, { force: true });
			pruneEmpty(designDir, dirname(target));
		} else writeAtomic(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
	};

	/** A collision this copy lost, kept for the canvas to mark. */
	const mark = (lost: Omit<SetAsideMark, "id" | "at" | "deleted">, bytes: Buffer | undefined) => {
		recordMark(designDir, lost, bytes);
		notice(
			lost.kind === "restored"
				? `${lost.path} is back: a teammate's edit beats your delete`
				: `your change to ${lost.path} was set aside: a teammate's save reached the team first`,
		);
		options.onMarks?.();
	};

	const handle = (data: string | ArrayBuffer) => {
		const framed = decodeFrame(data);
		if (framed === null) return;
		const { message, bytes } = framed;
		if (message.type === "presence") return presence.hear(message);
		if (message.type === "file") receive(message, bytes);
		else if (message.type === "caught-up") {
			if (typeof message.head === "number" && message.head > state.head) state.head = message.head;
			persist();
			caughtUp = true;
			toldSignedOut = false;
			retryMs = RECONNECT_MIN_MS;
			checkEverything();
			ownWork = false;
			// what git did while nobody watched has been put back; from here the guard sees git as it goes
			if (live && !watching) {
				watching = true;
				guard.watching();
				persist();
			}
			burst = undefined;
			presence.joined(socket);
			// what git wrote over before the connection dropped is still waiting on the team's version
			if (restoring.size > 0) askSoon();
		} else if (message.type === "restored") {
			const { path, version } = message;
			if (typeof path === "string" && travels(path) && typeof version === "number")
				mark({ path, kind: "restored", version, by: byOf(message.by), batch: burst ?? randomUUID() }, undefined);
		} else if (message.type === "saved" || message.type === "set-aside" || message.type === "refused") {
			const sent = typeof message.ref === "string" ? inflight.get(message.ref) : undefined;
			if (sent === undefined || typeof message.ref !== "string") return;
			inflight.delete(message.ref);
			if (message.type === "saved" && typeof message.version === "number") {
				state.files[sent.path] = { version: message.version, hash: sent.hash };
				persistSoon();
				// this copy's own save of a marked file reached the team, and is the answer to the mark
				if (forgetMarks(designDir, { path: sent.path })) options.onMarks?.();
				if (paused !== undefined && !isPaused()) {
					paused = undefined;
					notice("Sync resumed.");
				}
			}
			if (message.type === "set-aside") {
				yielding.add(sent.path);
				const version = typeof message.version === "number" ? message.version : 0;
				mark({ path: sent.path, kind: "set-aside", version, by: byOf(message.by), batch: sent.batch }, sent.bytes);
			}
			if (message.type === "refused") refused(sent.path, message.reason, message.retryAfter);
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
			signedOut();
			return reconnect();
		}
		let opened = false;
		socket = openSocket(syncUrl(link), token, {
			open: () => {
				burst = randomUUID();
				opened = true;
				socket?.send(
					encodeFrame({ type: "hello", protocol: PROTOCOL_VERSION, format: FORMAT_VERSION, since: state.head }),
				);
			},
			message: handle,
			close: (code) => {
				socket = undefined;
				caughtUp = false;
				burst = undefined;
				// what was in flight is settled by the next catch-up: applied saves come back as the team's version
				inflight.clear();
				dirty.clear();
				yielding.clear();
				presence.lost();
				if (closed) return;
				if (!live) return fail(new SpoolError(`spool.page closed the sync connection for ${link.url}`));
				if (code === CLOSE_SIGNED_OUT) signedOut();
				// cut off, or refused before it opened: spool.page says whether this machine still edits the project
				if (code === CLOSE_NOT_EDITOR || !opened) return void askStanding();
				reconnect();
			},
		});
	};

	/** Whether the project ended for this machine; otherwise the copy keeps trying, as it does offline. */
	const askStanding = async () => {
		const standing = (await options.standing?.()) ?? "unknown";
		if (closed) return;
		if (standing === "not_editor" && options.ended !== undefined) return options.ended();
		if (standing === "signed_out") signedOut();
		reconnect();
	};

	/** A save spool.page wouldn't take: the file stays here, and a limit pauses sync until it lifts. */
	const refused = (path: string, reason: unknown, retryAfter: unknown) => {
		if (reason === "too_large") hold(path, `it's over ${FILE_LIMIT_BYTES / 1_000_000} MB`);
		else if (reason === "outside_layout" || reason === "invalid_save") hold(path, OUTSIDE_LAYOUT);
		else if (typeof reason === "string" && Object.hasOwn(LIMITS, reason)) pause(reason as Limited, retryAfter);
		// signed_out and not_editor: the connection closes next, and the close is what is answered
	};

	const reconnect = () => {
		if (closed || retry !== undefined) return;
		retry = setTimeout(() => void connect(), retryMs);
		retry.unref?.();
		retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
	};

	/**
	 * Watch design/ for saves, again after a refill: a design/ removed whole can take its watch with it. A followed
	 * copy is out of git whatever `.gitignore` it came with (a solo one survives a pull of the move commit).
	 */
	const follow = () => {
		const ignore = join(designDir, ".gitignore");
		if (present() && existsSync(designDir) && readLocal(".gitignore")?.toString() !== TEAM_GITIGNORE)
			writeAtomic(ignore, TEAM_GITIGNORE);
		watch?.close();
		watch = watchTree(
			designDir,
			(filename) => {
				if (filename === null) return;
				changed.add(filename.split(sep).join("/"));
				settle ??= setTimeout(checkChanged, SETTLE_MS);
			},
			() => notice(`stopped watching ${designDir}; restart spool to sync it again`),
		);
	};

	if (live) {
		follow();
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
		presence: (state) => presence.say(caughtUp ? socket : undefined, state),
		people: () => presence.people(),
		turnEnded: () => {
			const said = setTimeout(() => {
				const waited = isIdle()
					? Promise.resolve()
					: new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
				waited.then(
					() => {
						if (!closed && caughtUp) socket?.send(encodeFrame({ type: "turn-ended" }));
					},
					() => {},
				);
			}, TURN_SETTLE_MS);
			said.unref?.();
		},
		close: () => {
			closed = true;
			if (retry !== undefined) clearTimeout(retry);
			if (settle !== undefined) clearTimeout(settle);
			if (ping !== undefined) clearInterval(ping);
			if (gitWait !== undefined) clearTimeout(gitWait);
			if (asking !== undefined) clearImmediate(asking);
			gaps?.close();
			// when this copy stopped watching: whatever git does from now is checked when it is followed again
			if (watching || recording !== undefined) persist();
			guard.close();
			if (resume !== undefined) clearTimeout(resume);
			watch?.close();
			socket?.close();
			socket = undefined;
			waiters = [];
		},
	};
}

/**
 * One local copy's share of presence. What this machine says goes up only while the copy is caught up, and is
 * said again on every reconnect; who else is here is known only for as long as the connection is up.
 */
function copyPresence(onPresence: ((presence: Presence) => void) | undefined) {
	let mine: PresenceState | null = null;
	const others = new Map<string, { presence: Presence; heard: number }>();
	const tell = (state: PresenceState | null) => encodeFrame({ type: "presence", state });
	return {
		say(socket: SyncSocket | undefined, state: PresenceState | null): void {
			const changed = JSON.stringify(state) !== JSON.stringify(mine);
			mine = state;
			if (changed) socket?.send(tell(state));
		},
		joined(socket: SyncSocket | undefined): void {
			if (mine !== null) socket?.send(tell(mine));
		},
		hear(message: Record<string, unknown>): void {
			const { person, still } = message;
			const state = readPresenceState(message.state);
			if (state === undefined || typeof still !== "number" || !isPerson(person)) return;
			const presence: Presence = { type: "presence", person, state, still };
			if (state === null) others.delete(person.accountId);
			else others.set(person.accountId, { presence, heard: Date.now() });
			onPresence?.(presence);
		},
		/** The connection dropped: everyone it showed is gone until it is back. */
		lost(): void {
			for (const { presence } of others.values()) onPresence?.({ ...presence, state: null, still: 0 });
			others.clear();
		},
		people: (): Presence[] =>
			[...others.values()].map(({ presence, heard }) => ({
				...presence,
				still: presence.still + Date.now() - heard,
			})),
	};
}

function isPerson(value: unknown): value is Presence["person"] {
	if (typeof value !== "object" || value === null) return false;
	const { accountId, name, color } = value as Record<string, unknown>;
	return typeof accountId === "string" && typeof name === "string" && typeof color === "string";
}

/**
 * Every team project the daemon has registered, followed for as long as it stays registered. A local copy
 * whose `design/` isn't there yet waits for a fetch to fill it, and one whose project ended is never followed.
 */
export function createTeamSync(deps: {
	spoolDir: string;
	origin: () => string;
	vault: (origin: string) => Pick<CloudVault, "read">;
	fetch?: typeof fetch;
	openSocket?: OpenSyncSocket;
	/** What a local copy has to say, and the root it is about. */
	notice?: (message: string, root?: string) => void;
	/** A local copy's set-aside marks changed. */
	onMarks?: (root: string) => void;
}) {
	const copies = new Map<string, LocalCopy>();
	/** Who listens for presence on each root's canvas. */
	const watchers = new Map<string, Set<(presence: Presence) => void>>();
	let closed = false;
	const say = deps.notice ?? ((message: string) => console.error(`spool: ${message}`));

	const standing =
		(link: ProjectLink, origin: string, vault: Pick<CloudVault, "read">) => async (): Promise<Standing> => {
			try {
				const request = { origin, vault, ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) };
				const { role } = await cloudTeams(deps.spoolDir, request).project(link.team, link.project);
				return role === "viewer" ? "not_editor" : "editor";
			} catch (error) {
				if (error instanceof CloudSignedOut) return "signed_out";
				// not in the team, the team deleted, or the project removed: all answered the same
				if (error instanceof CloudTeamRefused && error.status === 404) return "not_editor";
				return "unknown";
			}
		};

	const end = (root: string, link: ProjectLink) => {
		copies.get(root)?.close();
		copies.delete(root);
		try {
			endLocalCopy(root, link);
			say(`No longer synced with ${link.team}. This is now a project on this Mac only.`, root);
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
		}
	};

	return {
		keeping(roots: readonly string[]): void {
			if (closed) return;
			const wanted = roots.filter(
				(root) => followedLink(root) !== undefined && existsSync(join(root, "design", "canvas.json")),
			);
			for (const [root, copy] of copies) {
				if (wanted.includes(root)) continue;
				copy.close();
				copies.delete(root);
			}
			for (const root of wanted) {
				if (copies.has(root)) continue;
				try {
					const origin = deps.origin();
					const vault = deps.vault(origin);
					const link = followedLink(root);
					if (link === undefined) continue;
					copies.set(
						root,
						followLocalCopy({
							root,
							origin,
							vault,
							...(deps.openSocket === undefined ? {} : { openSocket: deps.openSocket }),
							notice: (message) => say(message, root),
							standing: standing(link, origin, vault),
							ended: () => end(root, link),
							...(deps.onMarks === undefined ? {} : { onMarks: () => deps.onMarks?.(root) }),
							onPresence: (presence) => {
								for (const watcher of watchers.get(root) ?? []) watcher(presence);
							},
						}),
					);
				} catch (error) {
					say(error instanceof Error ? error.message : String(error), root);
				}
			}
		},
		/** The local copy at a root, while it is followed. */
		copy: (root: string): LocalCopy | undefined => copies.get(root),
		/** Hear who else is on a root's team canvas as it changes. Returns the unsubscribe. */
		watchPresence(root: string, watcher: (presence: Presence) => void): () => void {
			const set = watchers.get(root) ?? new Set();
			watchers.set(root, set.add(watcher));
			return () => {
				set.delete(watcher);
				if (set.size === 0) watchers.delete(root);
			};
		},
		close(): void {
			closed = true;
			for (const copy of copies.values()) copy.close();
			copies.clear();
		},
	};
}

export type TeamSync = ReturnType<typeof createTeamSync>;

/**
 * A team project ended for this machine: its local copy becomes an ordinary project here. The solo
 * `design/.gitignore` comes back, so the folder can be committed again; `spool.json` and git are left alone; and
 * the copy's record says it ended, so the daemon never follows it again. No file is touched.
 */
export function endLocalCopy(root: string, link: ProjectLink): void {
	const designDir = realDesignDir(root);
	writeAtomic(join(designDir, ".gitignore"), SOLO_GITIGNORE);
	const stateFile = join(designDir, ".spool", "sync.json");
	// the link the copy was followed by: a branch checked out now may have no spool.json
	const state: CopyState = { ...readState(stateFile, link.url), ended: true };
	writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
}

/**
 * A copy that ended here is got again, its person an editor once more: it is a local copy again, out of git, and the
 * daemon follows it. What changed here meanwhile goes up as saves built on the versions it last had.
 */
export function resumeLocalCopy(root: string): void {
	const designDir = realDesignDir(root);
	const stateFile = join(designDir, ".spool", "sync.json");
	const { ended: _, ...state } = JSON.parse(readFileSync(stateFile, "utf8")) as CopyState;
	writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
	writeAtomic(join(designDir, ".gitignore"), TEAM_GITIGNORE);
}

/** Whether a local copy's team project ended for this machine. */
export function hasEnded(root: string): boolean {
	return copyRecord(root)?.ended === true;
}

/**
 * The team project a root is a local copy of, for as long as it is one: the link its `spool.json` holds, or, while a
 * branch with no `spool.json` is checked out, the link its copy was followed by. A copy stays one whatever branch is
 * out: it keeps syncing, and git keeps no history of it. Nothing for a solo project, or a copy whose project ended.
 */
export function followedLink(root: string): ProjectLink | undefined {
	const record = copyRecord(root);
	if (record?.ended === true) return undefined;
	return localCopyOf(root) ?? parseProjectLink(record?.project);
}

/** What a local copy's record in `design/.spool` says, unchecked, if it has one. */
function copyRecord(root: string): Partial<CopyState> | undefined {
	try {
		return JSON.parse(readFileSync(join(root, "design", ".spool", "sync.json"), "utf8")) as Partial<CopyState>;
	} catch {
		return undefined;
	}
}

const openWebSocket: OpenSyncSocket = (url, token, events) => {
	const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
	socket.binaryType = "arraybuffer";
	socket.addEventListener("open", () => events.open());
	socket.addEventListener("message", (event) => events.message(event.data as string | ArrayBuffer));
	// a failed handshake or a dropped line is an error and then a close; the close is what is answered
	socket.addEventListener("error", () => {});
	socket.addEventListener("close", (event) => events.close(event.code));
	return { send: (frame) => socket.send(frame), close: () => socket.close() };
};

function byOf(value: unknown): SetAsideMark["by"] {
	if (typeof value !== "object" || value === null) return null;
	const { accountId, device } = value as Record<string, unknown>;
	return typeof accountId === "string" && typeof device === "string" ? { accountId, device } : null;
}

function readState(file: string, project: string): CopyState {
	try {
		const state = JSON.parse(readFileSync(file, "utf8")) as CopyState;
		if (state.project === project && typeof state.head === "number" && typeof state.files === "object") return state;
	} catch {
		// a copy with no record yet starts from nothing: the catch-up brings the whole team copy
	}
	return { project, head: 0, files: {} };
}

/**
 * Why a file on disk stays on this machine though its path is in the layout: it is a symlink or reached through
 * one, or it is too big. Nothing when it may travel, or isn't there.
 */
function whyStays(designDir: string, path: string): string | undefined {
	const segments = path.split("/");
	let at = designDir;
	for (const [index, segment] of segments.entries()) {
		at = join(at, segment);
		const stat = lstatSync(at, { throwIfNoEntry: false });
		if (stat?.isSymbolicLink() === true) return "symlinks stay on this Mac";
		if (stat === undefined || (index < segments.length - 1 && !stat.isDirectory())) return undefined;
		if (index === segments.length - 1 && stat.isFile() && stat.size > FILE_LIMIT_BYTES)
			return `it's over ${FILE_LIMIT_BYTES / 1_000_000} MB`;
	}
	return undefined;
}

/**
 * Every file in a project's `design/` that would stay on this Mac as a local copy, and why: outside Spool's layout,
 * a symlink, or over 25 MB. Spool's own files (`.spool/`, `.gitignore`) and the system's aren't named.
 */
export function staysOnThisMac(root: string): { path: string; why: string }[] {
	const designDir = realDesignDir(root);
	const found: { path: string; why: string }[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			const path = relative(designDir, full).split(sep).join("/");
			if (path === ".spool" || path === ".gitignore" || entry.name === ".DS_Store") continue;
			if (entry.isDirectory()) walk(full);
			else if (!travels(path)) found.push({ path, why: OUTSIDE_LAYOUT });
			else {
				const why = whyStays(designDir, path);
				if (why !== undefined) found.push({ path, why });
			}
		}
	};
	walk(designDir);
	return found.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * What a move must wait for (DEV-190): every file on disk that travels whose bytes the team hasn't confirmed to this
 * copy yet, design-relative. What stays on this Mac never travels, so it is never waited for.
 */
export function unconfirmedFiles(root: string, link: ProjectLink): string[] {
	const designDir = realDesignDir(root);
	const { files } = readState(join(designDir, ".spool", "sync.json"), link.url);
	return filesUnder(designDir, "")
		.filter(
			(path) =>
				whyStays(designDir, path) === undefined &&
				files[path]?.hash !== digest(readFileSync(join(designDir, ...path.split("/")))),
		)
		.sort();
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
export function pruneEmpty(designDir: string, dir: string): void {
	for (let at = dir; relative(designDir, at).includes(sep); at = dirname(at)) {
		try {
			if (readdirSync(at).length > 0) return;
			rmdirSync(at);
		} catch {
			return;
		}
	}
}
