import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal } from "@xterm/headless";
import { writeAtomic } from "../atomic-write";
import { gridFromBuffer } from "../term/buffer-grid";
import { cellsForPx, MIN_COLS, MIN_ROWS } from "../term/cells";
import { resetCursorVisibility, serializedCursorVisibility, trackCursorVisibility } from "../term/cursor-visibility";
import { createOscFilter } from "../term/osc";
import type { Grid } from "../term/still";
import { gridToSvg } from "../term/still";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { frameGeometry, lookupFrame, type TerminalCoverState, type TerminalCoverUnavailable } from "./projection";
import type { TermExecutor, TermProcess } from "./term-exec";
import { terminalSourceVersion } from "./term-source";
import { termScreenFile } from "./thumbs";

/**
 * Dormant terminal sessions for a future OS-sandboxed executor: one process per running
 * terminal frame and holds its screen in a headless emulator, so the truth
 * about a terminal lives server-side — attach late and receive the screen so
 * far, hibernate and the buffer serializes to disk, rasterize a still and it
 * comes from the grid. Lifecycle is the canvas's freeze/unmount economy made
 * kernel-real: warm = SIGSTOP, hibernated = killed with the screen kept.
 * Death is legible and never auto-healed: an exited process keeps its last
 * screen and exit code until an explicit revive.
 */

const DEFAULT_DETACH_GRACE_MS = 3000;
/** One million cells keeps persisted still reconstruction bounded in xterm. */
const MAX_PERSISTED_COLS = 1000;
const MAX_PERSISTED_ROWS = 1000;

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
	sourceVersion: string;
	exitCode?: number;
}

export type TermScreen = { kind: "current"; grid: Grid } | TerminalCoverUnavailable;

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
	/** The source snapshot this process actually started from. */
	sourceVersion: string;
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
	const serializeScreen = (session: Session) =>
		session.serialize.serialize() + serializedCursorVisibility(session.term);

	function makeEmulator(cols: number, rows: number): { term: Terminal; serialize: SerializeAddon } {
		const term = new HeadlessTerminal({ cols, rows, allowProposedApi: true });
		trackCursorVisibility(term);
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
		const sourceVersion = terminalSourceVersion(session.root, session.frame);
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
		session.sourceVersion = sourceVersion;
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
						if (session.generation === generation) session.altStash = serializeScreen(session);
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
			screen: serializeScreen(session),
			sourceVersion: session.sourceVersion,
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

	function readPersisted(
		root: string,
		frame: string,
	): { kind: "current"; record: PersistedScreen } | { kind: "stale" } | { kind: "never-run" } {
		let text: string;
		try {
			text = readFileSync(termScreenFile(root, frame), "utf8");
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "never-run" };
			throw error;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return { kind: "stale" };
		}
		const record = persistedScreen(parsed);
		if (record === undefined || record.sourceVersion !== terminalSourceVersion(root, frame)) return { kind: "stale" };
		return { kind: "current", record };
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
				sourceVersion: terminalSourceVersion(root, frame),
				generation: 0,
			};
			sessions.set(key(root, frame), session);
			const persisted = readPersisted(root, frame);
			if (persisted.kind === "current" && persisted.record.exitCode !== undefined) {
				const record = persisted.record;
				// a corpse hibernated: restore the last screen, stay dead until revived
				session.state = "exited";
				session.exitCode = record.exitCode;
				session.sourceVersion = record.sourceVersion;
				session.term.resize(record.cols, record.rows);
				session.cols = record.cols;
				session.rows = record.rows;
				await new Promise<void>((r) => session?.term.write(record.screen, r));
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
		const snapshot = serializeScreen(session);
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
		resetCursorVisibility(session.term);
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
		if (persisted.kind === "current" && persisted.record.exitCode !== undefined) {
			const { exitCode: _exitCode, ...screen } = persisted.record;
			writeAtomic(termScreenFile(root, frame), `${JSON.stringify(screen)}\n`);
		}
	}

	/** Source changes invalidate lazily through their digest; they never start or restart code. */
	async function handleChange(_root: string, _frame: string): Promise<void> {
		return;
	}

	async function screen(root: string, frame: string): Promise<TermScreen> {
		const session = sessions.get(key(root, frame));
		if (session !== undefined) {
			if (session.sourceVersion !== terminalSourceVersion(root, frame)) return stale(frame);
			await settled(session.term);
			return { kind: "current", grid: gridFromBuffer(session.term) };
		}
		const persisted = readPersisted(root, frame);
		if (persisted.kind === "stale") return stale(frame);
		if (persisted.kind === "never-run") return neverRun(frame);
		const { record } = persisted;
		const { term } = makeEmulator(record.cols, record.rows);
		await new Promise<void>((r) => term.write(record.screen, r));
		const result = gridFromBuffer(term);
		term.dispose();
		return { kind: "current", grid: result };
	}

	function cover(root: string, frame: string): TerminalCoverState {
		const session = sessions.get(key(root, frame));
		if (session !== undefined) {
			return session.sourceVersion === terminalSourceVersion(root, frame) ? { kind: "current" } : stale(frame);
		}
		const persisted = readPersisted(root, frame);
		if (persisted.kind === "stale") return stale(frame);
		if (persisted.kind === "never-run") return neverRun(frame);
		return { kind: "current" };
	}

	async function grid(root: string, frame: string): Promise<Grid | undefined> {
		const result = await screen(root, frame);
		return result.kind === "current" ? result.grid : undefined;
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

	return { attach, input, resize, freeze, revive, restart, handleChange, cover, screen, grid, still, close };
}

function stale(frame: string): TerminalCoverUnavailable {
	return {
		kind: "stale",
		message: `persisted screen for "${frame}" is stale after its source changed; terminal execution is disabled, so no current screen is available`,
	};
}

function neverRun(frame: string): TerminalCoverUnavailable {
	return {
		kind: "never-run",
		message: `no persisted screen for "${frame}"; it has not run yet, and saving it does not create a screen`,
	};
}

export type TermSessions = ReturnType<typeof createTermSessions>;

function persistedScreen(value: unknown): PersistedScreen | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { cols, rows, screen, sourceVersion, exitCode } = value as Record<string, unknown>;
	if (!supportedDimension(cols, MIN_COLS, MAX_PERSISTED_COLS)) return undefined;
	if (!supportedDimension(rows, MIN_ROWS, MAX_PERSISTED_ROWS)) return undefined;
	if (typeof screen !== "string" || typeof sourceVersion !== "string") return undefined;
	if (exitCode !== undefined && (typeof exitCode !== "number" || !Number.isSafeInteger(exitCode))) return undefined;
	return {
		cols,
		rows,
		screen,
		sourceVersion,
		...(exitCode === undefined ? {} : { exitCode }),
	};
}

function supportedDimension(value: unknown, min: number, max: number): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
