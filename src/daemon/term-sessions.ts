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
import { frameGeometry } from "./projection";
import type { TermExecutor, TermProcess } from "./term-exec";
import { termScreenFile } from "./thumbs";

/**
 * Terminal sessions (#42): the daemon owns one real process per running
 * terminal frame and holds its screen in a headless emulator, so the truth
 * about a terminal lives server-side — attach late and receive the screen so
 * far, hibernate and the buffer serializes to disk, rasterize a still and it
 * comes from the grid. Lifecycle is the canvas's freeze/unmount economy made
 * kernel-real: warm = SIGSTOP, hibernated = killed with the screen kept.
 * Death is legible and never auto-healed: an exited process keeps its last
 * screen and exit code until a save or an explicit revive.
 */

const DEFAULT_DETACH_GRACE_MS = 3000;

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
	term: Terminal;
	serialize: SerializeAddon;
	filter: ReturnType<typeof createOscFilter>;
	proc: TermProcess | undefined;
	state: "running" | "frozen" | "exited";
	exitCode: number | undefined;
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

	function broadcast(session: Session, message: string | Uint8Array): void {
		for (const client of session.clients) client.send(message);
	}

	function control(session: Session, message: object): void {
		broadcast(session, JSON.stringify(message));
	}

	async function spawnInto(session: Session): Promise<void> {
		const generation = ++session.generation;
		const frameDir = join(session.root, "design", "frames", session.frame);
		const proc = await executor({
			frameDir,
			entry: join(frameDir, "term.tsx"),
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
				session.term.write(out);
				broadcast(session, out);
			}
			for (const target of navs) control(session, { t: "nav", target });
		});
		proc.onExit((code) => {
			if (session.generation !== generation) return;
			session.proc = undefined;
			session.state = "exited";
			session.exitCode = code;
			control(session, { t: "exit", code });
			void persist(session);
			publish(session.root, session.frame);
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
		writeAtomic(termScreenFile(session.root, session.frame), `${JSON.stringify(record)}\n`);
	}

	function readPersisted(root: string, frame: string): PersistedScreen | undefined {
		try {
			const raw = JSON.parse(readFileSync(termScreenFile(root, frame), "utf8")) as PersistedScreen;
			if (typeof raw.cols !== "number" || typeof raw.rows !== "number" || typeof raw.screen !== "string") {
				return undefined;
			}
			return raw;
		} catch {
			return undefined;
		}
	}

	async function attach(root: string, frame: string, client: TermClient): Promise<{ detach: () => void }> {
		let session = sessions.get(key(root, frame));
		if (session === undefined) {
			const { w, h } = frameGeometry(root, frame);
			const { cols, rows } = cellsForPx(w, h);
			session = {
				root,
				frame,
				...makeEmulator(cols, rows),
				filter: createOscFilter(),
				proc: undefined,
				state: "running",
				exitCode: undefined,
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
		const snapshot = session.serialize.serialize();
		if (snapshot.length > 0) client.send(new TextEncoder().encode(snapshot));
		if (session.state === "exited") client.send(JSON.stringify({ t: "exit", code: session.exitCode ?? 0 }));
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
		session.term.resize(cols, rows);
		session.proc?.resize(cols, rows);
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

	async function restart(session: Session): Promise<void> {
		killProcess(session);
		session.proc = undefined;
		session.term.reset();
		session.filter = createOscFilter();
		control(session, { t: "restart" });
		await spawnInto(session);
		control(session, { t: "state", state: "running" });
	}

	async function revive(root: string, frame: string): Promise<void> {
		const session = sessions.get(key(root, frame));
		if (session === undefined || session.state !== "exited") return;
		await restart(session);
	}

	/** A source save: the write–save–see loop for a live process, revival for a dead one. */
	async function handleChange(root: string, frame: string): Promise<void> {
		const session = sessions.get(key(root, frame));
		if (session === undefined) return;
		await restart(session);
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

	return { attach, input, resize, freeze, revive, handleChange, grid, still, close };
}

export type TermSessions = ReturnType<typeof createTermSessions>;
