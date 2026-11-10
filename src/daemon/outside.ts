import { execFile } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { writeAtomic } from "../atomic-write";
import { HARNESSES, type Harness, type Terminal } from "../outside/harness";
import { type Connection, connection } from "../outside/install";
import {
	type DesignAt,
	foldHook,
	type OutsideSession,
	type Payload,
	sessionLive,
	startSession,
} from "../outside/session";
import { localCopyOf } from "../team-project";
import { PRESENCE_AGENT_WORK, PRESENCE_NAME, type PresenceAgent, readPresenceAgent } from "../team-sync-protocol";
import { realDesignDir } from "./design-path";
import { frameDirectories } from "./projection";
import { followedLink } from "./team-sync";

/**
 * Agents working in a project from outside spool, as the daemon keeps them (task 531).
 *
 * Two things come in. A `spool` verb run by an agent in a terminal says which harness it
 * runs under (`notice`), which is how spool learns a person uses one, so the canvas can
 * offer to connect it. Once connected, the harness's hooks say what the agent does
 * (`hook`), folded into one session each. Both are said to the project's canvases on its
 * change stream, as the whole of what the canvas draws, at most a few times a second.
 */

/** What a canvas draws of the agents outside spool on its project. */
export interface OutsideView {
	readonly sessions: readonly OutsideSessionView[];
	/** a harness worth asking about here, and what it changed; null when there is none */
	readonly ask: OutsideAsk | null;
	readonly connected: Readonly<Record<Harness, Connection>>;
}

export interface OutsideSessionView extends Omit<OutsideSession, "root" | "terminal" | "busy" | "drawn"> {
	/** the terminal app, named, for Open <app>; null when it can't be brought forward from here */
	readonly app: string | null;
}

export interface OutsideAsk {
	readonly harness: Harness;
	/** the frames it changed lately, the last one written last */
	readonly frames: readonly string[];
	/** when it last said it was here, unix ms: the ask waits for it to go quiet */
	readonly at: number;
}

/** A harness heard on a project, and the frames written around then. */
interface Noticed {
	at: number;
	first: number;
	frames: string[];
	looked: number;
}

/** What a person said to the ask, per harness, kept with this machine's spool. */
interface AskMemory {
	/** how many times they said Not now; a second is a no */
	notNow?: number;
	/** unix ms: no asking before it */
	until?: number;
}

/** Not now waits a week. */
export const NOT_NOW_MS = 7 * 24 * 60 * 60 * 1000;
/** A harness heard this long ago is no longer here to ask about. */
const NOTICED_MS = 30 * 60 * 1000;
/** Frames written this long before it was first heard count as its. */
const BEFORE_MS = 15 * 60 * 1000;
/** How often the canvas hears of a busy session at most. */
const TELL_MS = 120;
/** How often sessions are looked over for one that went silent. */
const SWEEP_MS = 15_000;

type Env = Readonly<Record<string, string | undefined>>;

export interface Outside {
	/** a hook from a connected harness; false when it is about no project here */
	hook(harness: Harness, payload: Payload, terminal: Terminal): boolean;
	/** a `spool` verb run by an agent in a terminal, in this project */
	notice(root: string, harness: Harness): void;
	view(root: string): OutsideView;
	/** which harnesses this machine's spool listens to */
	connected(): Readonly<Record<Harness, Connection>>;
	/** Not now: a week, and a second time never, which it says */
	later(harness: Harness): { never: boolean };
	/** connected or disconnected in the files: every canvas redraws its ask */
	changed(harness: Harness): void;
	/** bring the session's terminal app forward */
	open(root: string, id: string): Promise<boolean>;
	close(): void;
}

export function createOutside({
	spoolDir,
	roots,
	publish,
	env = process.env,
	platform = process.platform,
	now = Date.now,
	run = (command, args) =>
		new Promise<void>((resolve, reject) => {
			execFile(command, args, { timeout: 5_000 }, (error) => (error ? reject(error) : resolve()));
		}),
}: {
	spoolDir: string;
	/** every registered project root */
	roots: () => readonly string[];
	publish: (root: string, view: OutsideView) => void;
	env?: Env;
	platform?: NodeJS.Platform;
	now?: () => number;
	run?: (command: string, args: readonly string[]) => Promise<void>;
}): Outside {
	const sessions = new Map<string, OutsideSession>();
	/** the checkout each session's files are in, when it is another copy of its project's team project */
	const checkouts = new Map<string, string>();
	const noticed = new Map<string, Map<Harness, Noticed>>();
	const pending = new Map<string, ReturnType<typeof setTimeout>>();
	const memoryFile = join(spoolDir, "outside.json");

	const memory = (): Partial<Record<Harness, AskMemory>> => {
		try {
			const parsed: unknown = JSON.parse(readFileSync(memoryFile, "utf8"));
			const asks = (parsed as { asks?: unknown } | null)?.asks;
			return asks !== null && typeof asks === "object" ? (asks as Partial<Record<Harness, AskMemory>>) : {};
		} catch {
			return {};
		}
	};
	const remember = (harness: Harness, said: AskMemory | null) => {
		const asks = { ...memory() };
		if (said === null) delete asks[harness];
		else asks[harness] = said;
		writeAtomic(memoryFile, `${JSON.stringify({ asks }, null, 2)}\n`);
	};

	const rootOf = (path: string): string | null => {
		let best: string | null = null;
		for (const root of roots())
			if (
				(path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) &&
				(best === null || root.length > best.length)
			)
				best = root;
		return best;
	};

	/**
	 * The project a session at `path` is drawn on, and the folder its files are in: the registered root holding it,
	 * or else, walking up to the checkout's `spool.json`, a registered copy of the team project it names. A sibling
	 * checkout of a team project holds the same frames by the same names, a second behind.
	 */
	const homeOf = (path: string): { root: string; checkout: string } | null => {
		const root = rootOf(path);
		if (root !== null) return { root, checkout: root };
		for (let at = path; ; at = dirname(at)) {
			const link = localCopyOf(at);
			if (link !== undefined) {
				const copy = roots().find((one) => followedLink(one)?.url === link.url);
				return copy === undefined ? null : { root: copy, checkout: at };
			}
			if (dirname(at) === at) return null;
		}
	};

	/** each root's frames by folder, read again at most every two seconds */
	const folders = new Map<string, { at: number; dirs: Map<string, string> }>();
	const designAtFor = (root: string): DesignAt => {
		let known = folders.get(root);
		if (known === undefined || now() - known.at > 2_000) {
			const dirs = new Map<string, string>();
			for (const [name, dir] of frameDirectories(root)) dirs.set(dir, name);
			known = { at: now(), dirs };
			folders.set(root, known);
		}
		const { dirs } = known;
		let designDir: string;
		try {
			designDir = realDesignDir(root);
		} catch {
			return () => null;
		}
		const framesDir = join(designDir, "frames");
		// the design folder as an agent names it, through a link or not
		const named = [...new Set([join(root, "design"), designDir])];
		return (path) => {
			let file: string | null = null;
			for (const dir of named)
				if (file === null && (path === dir || path.startsWith(`${dir}${sep}`)))
					file = join(designDir, relative(dir, path));
			if (file === null) return null;
			if (file.startsWith(`${join(designDir, "shared")}${sep}`)) return "shared";
			for (let at = file; at.length > 1; at = at.slice(0, Math.max(at.lastIndexOf(sep), 1))) {
				const name = dirs.get(at);
				if (name !== undefined) return { frame: name };
				if (at === framesDir) break;
			}
			// a frame being written for the first time is known to no list yet: its folder names it. A bare folder
			// that is no frame is a page's, or one a shell went into: in the design, with no frame to stand at
			if (file.startsWith(`${framesDir}${sep}`)) {
				const rest = relative(framesDir, file).split(sep);
				if (!/\.\w+$/.test(rest.at(-1) ?? "")) return "shared";
				if (rest.length >= 2) return { frame: rest.slice(0, -1).join("/") };
			}
			return null;
		};
	};

	const appOf = (terminal: Terminal): string | null =>
		platform === "darwin" && terminal.bundle !== null && terminal.name !== null ? terminal.name : null;

	/** read off the harnesses' own files, at most every two seconds */
	let connectedRead: { at: number; value: Record<Harness, Connection> } | null = null;
	const connected = (): Record<Harness, Connection> => {
		if (connectedRead === null || now() - connectedRead.at > 2_000)
			connectedRead = {
				at: now(),
				value: Object.fromEntries(
					HARNESSES.map((harness) => [harness, connection(harness, spoolDir, env)]),
				) as Record<Harness, Connection>,
			};
		return connectedRead.value;
	};

	const view = (root: string): OutsideView => {
		const at = now();
		const shown: OutsideSessionView[] = [];
		for (const session of sessions.values()) {
			// heard from its first hook, drawn only once it changes the design this turn or a designer of its works
			if (session.root !== root || !session.drawn || !sessionLive(session, at)) continue;
			const { root: _root, terminal, busy: _busy, drawn: _drawn, ...rest } = session;
			shown.push({ ...rest, app: appOf(terminal) });
		}
		shown.sort((a, b) => b.started - a.started);
		const linked = connected();
		return { sessions: shown, ask: askFor(root, linked, at), connected: linked };
	};

	const askFor = (root: string, connected: Record<Harness, Connection>, at: number): OutsideAsk | null => {
		const heard = noticed.get(root);
		if (heard === undefined) return null;
		const said = memory();
		let best: OutsideAsk | null = null;
		for (const [harness, one] of heard) {
			if (at - one.at > NOTICED_MS || connected[harness] === "connected") continue;
			const answer = said[harness];
			if ((answer?.notNow ?? 0) >= 2 || (answer?.until ?? 0) > at) continue;
			if (best === null || one.at > best.at) best = { harness, frames: one.frames, at: one.at };
		}
		return best;
	};

	const tell = (root: string, soon = true) => {
		if (pending.has(root)) return;
		const send = () => {
			pending.delete(root);
			publish(root, view(root));
		};
		if (!soon) return send();
		const timer = setTimeout(send, TELL_MS);
		timer.unref?.();
		pending.set(root, timer);
	};

	/** the last few frames whose own files changed since `since`, written last last */
	const writtenSince = (root: string, since: number): string[] => {
		const found: { name: string; at: number }[] = [];
		for (const [name, dir] of frameDirectories(root)) {
			let latest = 0;
			try {
				for (const entry of readdirSync(dir, { withFileTypes: true })) {
					if (!entry.isFile() || entry.name === "frame.json") continue;
					latest = Math.max(latest, statSync(join(dir, entry.name)).mtimeMs);
				}
			} catch {
				continue;
			}
			if (latest >= since) found.push({ name, at: latest });
		}
		return found
			.sort((a, b) => a.at - b.at)
			.slice(-3)
			.map((one) => one.name);
	};

	const sweep = setInterval(() => {
		const at = now();
		const touched = new Set<string>();
		for (const [id, session] of sessions)
			if (!sessionLive(session, at)) {
				sessions.delete(id);
				checkouts.delete(id);
				touched.add(session.root);
			}
		for (const root of touched) tell(root, false);
	}, SWEEP_MS);
	sweep.unref?.();

	return {
		hook(harness, payload, terminal) {
			const sessionId =
				typeof payload.session_id === "string" && payload.session_id !== "" ? payload.session_id : null;
			const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : null;
			if (sessionId === null || event === null) return false;
			const id = `${harness}:${sessionId}`;
			const at = now();
			let session = sessions.get(id);
			if (session === undefined) {
				const cwd = typeof payload.cwd === "string" ? payload.cwd : null;
				const input = payload.tool_input as Payload | undefined;
				const path = typeof input?.file_path === "string" ? input.file_path : null;
				const home = (cwd === null ? null : homeOf(cwd)) ?? (path === null ? null : homeOf(path));
				if (home === null) return false;
				// nothing to show of a session that only ends
				if (event === "SessionEnd") return true;
				session = startSession(id, harness, home.root, terminal, at);
				if (home.checkout !== home.root) checkouts.set(id, home.checkout);
			}
			const designAt = designAtFor(checkouts.get(id) ?? session.root);
			const next = foldHook({ ...session, terminal }, event, payload, at, designAt);
			if (next !== null) sessions.set(id, next);
			else {
				sessions.delete(id);
				checkouts.delete(id);
			}
			// a connected harness is not one to ask about any more
			noticed.get(session.root)?.delete(harness);
			tell(session.root, next === null || next.state !== "working" || session.state !== "working");
			return true;
		},
		notice(root, harness) {
			const at = now();
			const heard = noticed.get(root) ?? new Map<Harness, Noticed>();
			noticed.set(root, heard);
			const was = heard.get(harness);
			const first = was === undefined || at - was.at > NOTICED_MS ? at : was.first;
			// the frames are looked for at most every five seconds, however often it calls
			const frames =
				was !== undefined && at - was.looked < 5_000 ? was.frames : writtenSince(root, first - BEFORE_MS);
			heard.set(harness, {
				at,
				first,
				frames,
				looked: was !== undefined && at - was.looked < 5_000 ? was.looked : at,
			});
			tell(root);
		},
		view,
		connected,
		later(harness) {
			const was = memory()[harness];
			const notNow = (was?.notNow ?? 0) + 1;
			remember(harness, { notNow, until: now() + NOT_NOW_MS });
			for (const root of noticed.keys()) tell(root, false);
			return { never: notNow >= 2 };
		},
		changed(harness) {
			connectedRead = null;
			if (connection(harness, spoolDir, env) === "connected") remember(harness, null);
			// nobody who just took it out wants it offered back
			else remember(harness, { notNow: 2 });
			for (const root of new Set([...noticed.keys(), ...[...sessions.values()].map((one) => one.root)]))
				tell(root, false);
		},
		async open(root, id) {
			const session = sessions.get(id);
			if (session === undefined || session.root !== root || appOf(session.terminal) === null) return false;
			const bundle = session.terminal.bundle;
			if (bundle === null) return false;
			try {
				await run("open", ["-b", bundle]);
				return true;
			} catch {
				return false;
			}
		},
		close() {
			clearInterval(sweep);
			for (const timer of pending.values()) clearTimeout(timer);
			pending.clear();
		},
	};
}

/**
 * What teammates see of this person's agents outside spool: each hand on its frame in the
 * person's colour, and a wait, the way a turn's agents are said. What it was asked stays on
 * this machine.
 */
export function outsidePresence(view: OutsideView): PresenceAgent | null {
	const live = view.sessions.filter((one) => one.state !== "done");
	if (live.length === 0) return null;
	const work = live.flatMap((session) =>
		session.hands.map((hand) => ({
			frame: hand.frame,
			act: session.state === "waiting" ? "ask" : hand.act === "editing" ? "edit" : "read",
			detail: `${hand.who} ${hand.act}`,
			lines: 0,
		})),
	);
	const seen = new Set<string>();
	return (
		readPresenceAgent({
			running: live.some((one) => one.state === "working"),
			status: null,
			work: work
				.filter((one) => one.frame.length <= PRESENCE_NAME && !seen.has(one.frame) && seen.add(one.frame))
				.slice(0, PRESENCE_AGENT_WORK),
		}) ?? null
	);
}
