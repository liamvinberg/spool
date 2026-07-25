import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal } from "@xterm/headless";
import { writeAtomic } from "../atomic-write";
import { gridFromBuffer } from "../term/buffer-grid";
import { cellsForPx } from "../term/cells";
import { createOscFilter } from "../term/osc";
import type { Grid } from "../term/still";
import { gridToSvg } from "../term/still";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { frameGeometry, lookupFrame } from "./projection";
import type { TermExecutor, TermProcess } from "./term-exec";
import { termScreenFile } from "./thumbs";

/**
 * Dormant terminal sessions for a future OS-sandboxed executor: one process per running
 * terminal frame and holds its screen in a headless emulator, so the truth
 * about a terminal lives server-side — attach late and receive the screen so
 * far, hibernate and the buffer serializes to disk, rasterize a still and it
 * comes from the grid. Lifecycle is the canvas's freeze/unmount economy made
 * kernel-real: warm = SIGSTOP, hibernated = killed with the screen kept.
 * Death is legible and never auto-healed: an exited process keeps its last
 * screen and exit code until a save or an explicit revive.
 */

const DEFAULT_DETACH_GRACE_MS = 3000;

/** The ways a TUI leaves the alternate screen — the wipe before its artifact vanishes. */
const LEAVE_ALT = ["\x1b[?1049l", "\x1b[?1047l", "\x1b[?47l"].map((s) => Uint8Array.from(s, (c) => c.charCodeAt(0)));

/** Byte offset of the last leave-alt sequence in a chunk, -1 for none. */
function lastLeaveAlt(out: Uint8Array): number {
	for (let i = out.length - 1; i >= 0; i--) {
		if (out[i] !== 0x1b) continue;
		for (const seq of LEAVE_ALT) {
			if (i + seq.length <= out.length && seq.every((byte, j) => out[i + j] === byte)) return i;
		}
	}
	return -1;
}

// both xterm packages are CJS — createRequire keeps the types honest
const require = createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } = require("@xterm/headless") as typeof import("@xterm/headless");
const { SerializeAddon: Serialize } = require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");

export interface TermClient {
	send(message: string | Uint8Array): void;
}

interface PersistedScreen {
	cols: number;
	rows: number;
	screen: string;
	exitCode?: number;
}

interface Session {
	root: string;
	frame: string;
	designDir: string;
	/** Canonical design-contained still path, fixed when the session opens. */
	screenFile: string;
	term: Terminal;
	serialize: SerializeAddon;
	filter: ReturnType<typeof createOscFilter>;
	proc: TermProcess | undefined;
	state: "running" | "frozen" | "exited";
	exitCode: number | undefined;
	/** The screen serialized just before the last leave-alt-screen sequence —
	 * a dying TUI wipes its own artifact on the way out, and this is it. */
	altStash: string | undefined;
	clients: Set<TermClient>;
	detachTimer: NodeJS.Timeout | undefined;
	cols: number;
	rows: number;
	/** Bumped per spawn so a killed process's exit can't mark its successor dead. */
	generation: number;
}

export interface TermSessionsOptions {
	executor: TermExecutor;
	/** The still behind this frame changed — the canvas should refetch it. */
	publish: (root: string, frame: string) => void;
	detachGraceMs?: number;
}

export function createTermSessions({ executor, publish, detachGraceMs }: TermSessionsOptions) {
	const sessions = new Map<string, Session>();
	const grace = detachGraceMs ?? DEFAULT_DETACH_GRACE_MS;
	const key = (root: string, frame: string) => `${root}\0${frame}`;

	function makeEmulator(cols: number, rows: number): { term: Terminal; serialize: SerializeAddon } {
		const term = new HeadlessTerminal({ cols, rows, allowProposedApi: true });
		const serialize = new Serialize();
		term.loadAddon(serialize as Parameters<Terminal["loadAddon"]>[0]);
		return { term, serialize };
	}

	/** Every write settled — the buffer reflects everything streamed so far. */
	function settled(term: Terminal): Promise<void> {
		return new Promise((resolve) => term.write("", resolve));
	}

	/** Nothing but blanks on the visible screen. */
	function screenBlank(term: Terminal): boolean {
		const buffer = term.buffer.active;
		for (let y = 0; y < term.rows; y++) {
			if ((buffer.getLine(y + buffer.viewportY)?.translateToString(true) ?? "").trim() !== "") return false;
		}
		return true;
	}

	function broadcast(session: Session, message: string | Uint8Array): void {
		for (const client of session.clients) client.send(message);
	}

	function control(session: Session, message: object): void {
		broadcast(session, JSON.stringify(message));
	}

	async function spawnInto(session: Session): Promise<void> {
		const generation = ++session.generation;
		// the frame's folder is wherever its page put it (#39) — a flat join
		// would miss every paged terminal
		const found = lookupFrame(session.root, session.frame);
		const designDir = session.designDir;
		const candidate = found.kind === "found" ? found.dir : join(designDir, "frames", session.frame);
		const frameDir = resolveDesignPath(designDir, candidate);
		const entry = resolveDesignPath(designDir, join(frameDir, "term.tsx"));
		const proc = await executor({
			frameDir,
			entry,
			cols: session.cols,
			rows: session.rows,
		});
		session.proc = proc;
		session.state = "running";
		session.exitCode = undefined;
		proc.onData((chunk) => {
			if (session.generation !== generation) return;
			const { out, navs } = session.filter.push(chunk);
			if (out.length > 0) {
				// a leave-alt-screen wipes the display: keep the frame before it,
				// so a death that rides one still has its last screen (see onExit)
				const leave = lastLeaveAlt(out);
				if (leave >= 0) {
					session.term.write(out.subarray(0, leave), () => {
						if (session.generation === generation) session.altStash = session.serialize.serialize();
					});
					session.term.write(out.subarray(leave));
				} else {
					session.term.write(out);
				}
				broadcast(session, out);
			}
			for (const target of navs) control(session, { t: "nav", target });
		});
		proc.onExit((code) => {
			if (session.generation !== generation) return;
			session.proc = undefined;
			session.state = "exited";
			session.exitCode = code;
			void (async () => {
				await settled(session.term);
				// the artifact law: an exited TUI keeps its last screen. One that
				// left the alternate screen on the way out blanked it — restore the
				// frame stashed just before the wipe, everywhere at once.
				if (session.altStash !== undefined && screenBlank(session.term)) {
					session.term.write(session.altStash);
					broadcast(session, new TextEncoder().encode(session.altStash));
				}
				session.altStash = undefined;
				control(session, { t: "exit", code });
				await persist(session);
				publish(session.root, session.frame);
			})();
		});
	}

	async function persist(session: Session): Promise<void> {
		await settled(session.term);
		const record: PersistedScreen = {
			cols: session.cols,
			rows: session.rows,
			screen: session.serialize.serialize(),
			...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
		};
		let screenFile: string;
		try {
			screenFile = resolveDesignPath(session.designDir, session.screenFile);
		} catch {
			// A project removed while a process exits has nowhere lawful to
			// persist. Never recreate a vanished design/ from an async tail.
			return;
		}
		writeAtomic(screenFile, `${JSON.stringify(record)}\n`);
	}

	function readPersisted(root: string, frame: string): PersistedScreen | undefined {
		try {
			const raw = JSON.parse(readFileSync(termScreenFile(root, frame), "utf8")) as PersistedScreen;
			if (typeof raw.cols !== "number" || typeof raw.rows !== "number" || typeof raw.screen !== "string") {
				return undefined;
			}
			return raw;
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			return undefined;
		}
	}

	async function attach(root: string, frame: string, client: TermClient): Promise<{ detach: () => void }> {
		let session = sessions.get(key(root, frame));
		if (session === undefined) {
			const { w, h } = frameGeometry(root, frame);
			const { cols, rows } = cellsForPx(w, h);
			const designDir = realDesignDir(root);
			session = {
				root,
				frame,
				designDir,
				screenFile: termScreenFile(root, frame),
				...makeEmulator(cols, rows),
				filter: createOscFilter(),
				proc: undefined,
				state: "running",
				exitCode: undefined,
				altStash: undefined,
				clients: new Set(),
				detachTimer: undefined,
				cols,
				rows,
				generation: 0,
			};
			sessions.set(key(root, frame), session);
			const persisted = readPersisted(root, frame);
			if (persisted?.exitCode !== undefined) {
				// a corpse hibernated: restore the last screen, stay dead until revived
				session.state = "exited";
				session.exitCode = persisted.exitCode;
				session.term.resize(persisted.cols, persisted.rows);
				session.cols = persisted.cols;
				session.rows = persisted.rows;
				await new Promise<void>((r) => session?.term.write(persisted.screen, r));
			} else {
				await spawnInto(session);
			}
		}
		if (session.detachTimer !== undefined) {
			clearTimeout(session.detachTimer);
			session.detachTimer = undefined;
		}
		session.clients.add(client);

		await settled(session.term);
		// the daemon owns the grid's size: the client sizes its emulator to this
		// before the snapshot lands, or a replay serialized at other columns
		// wraps every line and shreds the screen
		client.send(JSON.stringify({ t: "size", cols: session.cols, rows: session.rows }));
		const snapshot = session.serialize.serialize();
		if (snapshot.length > 0) client.send(new TextEncoder().encode(snapshot));
		// an attach-time exit is arrival state, not a death watched happen: the
		// mark lets the enter gesture (walk arrival, canvas enter) revive it
		if (session.state === "exited")
			client.send(JSON.stringify({ t: "exit", code: session.exitCode ?? 0, attach: true }));
		else client.send(JSON.stringify({ t: "state", state: "running" }));

		return {
			detach: () => {
				const live = sessions.get(key(root, frame));
				if (live === undefined) return;
				live.clients.delete(client);
				if (live.clients.size > 0 || live.detachTimer !== undefined) return;
				live.detachTimer = setTimeout(() => void hibernate(live), grace);
			},
		};
	}

	/** A stopped process only honors its death after a continue — never rely on
	 * orphaned-group courtesy to deliver it. */
	function killProcess(session: Session): void {
		if (session.state === "frozen") session.proc?.signal("SIGCONT");
		session.proc?.kill();
	}

	async function hibernate(session: Session): Promise<void> {
		if (session.clients.size > 0) return;
		await persist(session);
		killProcess(session);
		session.generation++;
		session.term.dispose();
		sessions.delete(key(session.root, session.frame));
		publish(session.root, session.frame);
	}

	function input(root: string, frame: string, data: Uint8Array): void {
		const session = sessions.get(key(root, frame));
		if (session?.state === "running" || session?.state === "frozen") session.proc?.write(data);
	}

	function resize(root: string, frame: string, cols: number, rows: number): void {
		const session = sessions.get(key(root, frame));
		if (session === undefined || (cols === session.cols && rows === session.rows)) return;
		session.cols = cols;
		session.rows = rows;
		// a corpse keeps its last screen verbatim — the new size waits for the
		// revival's respawn; reflowing dead output could only shred it
		if (session.state === "exited") return;
		session.term.resize(cols, rows);
		session.proc?.resize(cols, rows);
		// every mirror follows the daemon's grid — including the asker
		control(session, { t: "size", cols, rows });
	}

	function freeze(root: string, frame: string, on: boolean): void {
		const session = sessions.get(key(root, frame));
		if (session === undefined || session.proc === undefined) return;
		if (on && session.state === "running") {
			session.proc.signal("SIGSTOP");
			session.state = "frozen";
		} else if (!on && session.state === "frozen") {
			session.proc.signal("SIGCONT");
			session.state = "running";
		}
	}

	async function respawn(session: Session): Promise<void> {
		killProcess(session);
		session.proc = undefined;
		session.term.reset();
		// a corpse resized while dead deferred the new grid to this respawn
		if (session.term.cols !== session.cols || session.term.rows !== session.rows) {
			session.term.resize(session.cols, session.rows);
		}
		session.filter = createOscFilter();
		session.altStash = undefined;
		control(session, { t: "restart" });
		control(session, { t: "size", cols: session.cols, rows: session.rows });
		await spawnInto(session);
		control(session, { t: "state", state: "running" });
	}

	async function revive(root: string, frame: string): Promise<void> {
		const session = sessions.get(key(root, frame));
		if (session === undefined || session.state !== "exited") return;
		await respawn(session);
	}

	/** A play-session restart (#44): whatever the state — running, frozen, or a
	 * corpse — the walk gets a clean run, and every mirrored surface sees it.
	 * No live session: a hibernated corpse loses its death mark so the next
	 * attach spawns fresh instead of restoring it; otherwise quiet no-op. */
	async function restart(root: string, frame: string): Promise<void> {
		const session = sessions.get(key(root, frame));
		if (session !== undefined) {
			await respawn(session);
			return;
		}
		const persisted = readPersisted(root, frame);
		if (persisted?.exitCode !== undefined) {
			const { exitCode: _exitCode, ...screen } = persisted;
			writeAtomic(termScreenFile(root, frame), `${JSON.stringify(screen)}\n`);
		}
	}

	/** A source save: the write–save–see loop for a live process, revival for a dead one. */
	async function handleChange(root: string, frame: string): Promise<void> {
		const session = sessions.get(key(root, frame));
		if (session === undefined) return;
		await respawn(session);
	}

	async function grid(root: string, frame: string): Promise<Grid | undefined> {
		const session = sessions.get(key(root, frame));
		if (session !== undefined) {
			await settled(session.term);
			return gridFromBuffer(session.term);
		}
		const persisted = readPersisted(root, frame);
		if (persisted === undefined) return undefined;
		const { term } = makeEmulator(persisted.cols, persisted.rows);
		await new Promise<void>((r) => term.write(persisted.screen, r));
		const result = gridFromBuffer(term);
		term.dispose();
		return result;
	}

	async function still(root: string, frame: string, fontCss?: string): Promise<string | undefined> {
		const shape = await grid(root, frame);
		return shape === undefined ? undefined : gridToSvg(shape, fontCss);
	}

	async function close(): Promise<void> {
		for (const session of [...sessions.values()]) {
			if (session.detachTimer !== undefined) clearTimeout(session.detachTimer);
			session.clients.clear();
			await hibernate(session);
		}
	}

	return { attach, input, resize, freeze, revive, restart, handleChange, grid, still, close };
}

export type TermSessions = ReturnType<typeof createTermSessions>;
