import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Rect } from "../page-box";
import { isFramePath, pageParent, ROOT_PAGE } from "../page-path";
import type { AgentEvent, AgentFrame, AgentSpot } from "./agent-events";
import type { AgentTurn } from "./agent-turn";
import { createEventFeed } from "./agent-turn-shell";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import type { ChangeEvent } from "./events";
import { readSidecar, writeGeometry } from "./geometry";
import { besideField, DEFAULT_FOOTPRINT, overlaps, pageObjectsOn } from "./placement";
import { discoverFrames, listProjectFrames, type Projection, type ReservedSpot } from "./projection";

/**
 * A turn's frames, read off `design/` rather than off its tool calls (#365).
 *
 * The Roast session wrote every frame through a shell heredoc, so a turn's calls alone
 * cannot say which frames it made: the disk can. While a turn runs, this watches the
 * project's `design/` through the change hub every canvas already listens to, diffs each
 * frame it hears about against what the frame was when the turn began, and adds what it
 * finds to the turn's own log as `frame` events: created, changed with the lines that
 * moved, deleted with the source kept so Put back can restore it. The adapters stay
 * translators of wire to events and parse no tool arguments; the reading of a call's input
 * here is the daemon's, and only for attribution and live source.
 *
 * Three more things ride the same seam, because they are all the turn's frames:
 *
 * - **Live source.** Where the engine streams a call's input (Claude Code's main agent
 *   does, a file tool or a heredoc alike), the frame's source arrives as `frame-source`
 *   before the file exists.
 * - **Reserved spots.** A designer delegation streams nothing while it works, so the moment
 *   it starts a spot is reserved for it on the root page, placed by the same beside-the-field
 *   rule a new frame gets and named from its task. The frame it writes lands there.
 * - **Put back.** A frame this turn deleted is written back from the source kept here.
 */

/** the hub, as much of it as a witness listens on and speaks through */
export interface FrameHub {
	subscribe(root: string, listener: (event: ChangeEvent) => void): () => void;
	publish(root: string, event: ChangeEvent): void;
}

/** a call a frame could be attributed to, from the moment it opens */
interface Call {
	readonly id: string;
	readonly parent: string | null;
	readonly tool: string;
	/** its input as far as it has arrived: partial JSON while it streams, then the whole */
	input: string;
	readonly opened: number;
	closed?: number;
	/** its whole input has arrived */
	complete?: boolean;
	/** the frame its input is writing, once the path has arrived */
	writing?: string;
	/** how much of that frame's source has been said as `frame-source` */
	said: number;
}

export interface Kept {
	readonly source: string;
	readonly sidecar: string | null;
}

/** how long after a call's result a frame landing still counts as that call's */
const LATE_MS = 3_000;

/** the frame a design-relative or absolute path writes, when it is a frame entry */
const FRAME_PATH = /design\/frames\/((?:[^\s"'`\\/<>|;&]+\/)*?[^\s"'`\\/<>|;&]+)\/frame\.tsx/;

/** a frame's entry, as a path inside a call's input */
export function frameWritten(text: string): string | undefined {
	const name = FRAME_PATH.exec(text)?.[1];
	return name !== undefined && isFramePath(name) ? name : undefined;
}

/**
 * One string field of a call's input as far as it has arrived, from partial JSON. A key
 * that has not arrived is undefined; a value cut mid-escape stops before the escape.
 */
export function partialField(input: string, key: string): string | undefined {
	const quoted = `"${key}"`;
	const found = input.indexOf(quoted);
	if (found < 0) return undefined;
	let index = input.indexOf('"', found + quoted.length);
	if (index < 0) return undefined;
	let value = "";
	for (index += 1; index < input.length; index += 1) {
		const char = input[index];
		if (char === '"') break;
		if (char !== "\\") {
			value += char;
			continue;
		}
		const next = input[index + 1];
		if (next === undefined) break;
		if (next === "u") {
			const hex = input.slice(index + 2, index + 6);
			if (hex.length < 4) break;
			value += String.fromCharCode(Number.parseInt(hex, 16));
			index += 5;
			continue;
		}
		value +=
			next === "n"
				? "\n"
				: next === "t"
					? "\t"
					: next === "r"
						? "\r"
						: next === "b"
							? "\b"
							: next === "f"
								? "\f"
								: next;
		index += 1;
	}
	return value;
}

/**
 * The source a call is writing into a frame, as far as it has arrived: a file tool's
 * `content`, or the body of a shell heredoc whose target is the frame's entry.
 */
export function sourceWritten(tool: string, input: string): { frame: string; source: string } | undefined {
	const path = partialField(input, "file_path");
	if (path !== undefined) {
		const frame = frameWritten(path);
		const content = partialField(input, "content");
		return frame === undefined || content === undefined ? undefined : { frame, source: content };
	}
	if (tool !== "Bash") return undefined;
	const command = partialField(input, "command");
	if (command === undefined) return undefined;
	const target = FRAME_PATH.exec(command);
	const frame = target?.[1];
	if (target === null || frame === undefined || !isFramePath(frame)) return undefined;
	// the heredoc that feeds the frame's entry: `cat > …/frame.tsx <<'EOF'` or `<<EOF … > path`
	const marker = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(command);
	if (marker === null) return undefined;
	const start = command.indexOf("\n", marker.index);
	if (start < 0) return { frame, source: "" };
	const body = command.slice(start + 1);
	// the closing marker, on a line of its own; the newline before it is the source's last
	const end = new RegExp(`(^|\\n)[\\t ]*${marker[2]}[\\t ]*(\\n|$)`).exec(body);
	return { frame, source: end === null ? body : body.slice(0, end.index + (end[1] ?? "").length) };
}

/** how many lines a source holds, counting a last line still being written */
export function linesOf(source: string): number {
	if (source === "") return 0;
	return source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
}

/** the lines of `after` that differ from `before`, 1-based and inclusive */
export function changedRange(before: string, after: string): { from: number; to: number } {
	const was = before.split("\n");
	const now = after.split("\n");
	let top = 0;
	while (top < was.length && top < now.length && was[top] === now[top]) top += 1;
	let bottom = 0;
	while (
		bottom < was.length - top &&
		bottom < now.length - top &&
		was[was.length - 1 - bottom] === now[now.length - 1 - bottom]
	)
		bottom += 1;
	const from = Math.min(top + 1, Math.max(1, now.length));
	const to = Math.max(from, now.length - bottom);
	return { from, to: Math.min(to, Math.max(1, now.length)) };
}

/** a frame name read from a task's own description: `Design hello-calm frame` → `hello-calm` */
export function spotName(description: string | null): string {
	const words = (description ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9\s-]+/g, " ")
		.split(/\s+/)
		.filter((word) => word !== "");
	while (words.length > 1 && ["design", "draw", "make", "create", "build", "the", "a", "an"].includes(words[0] ?? ""))
		words.shift();
	while (words.length > 1 && ["frame", "take", "variant", "direction"].includes(words[words.length - 1] ?? ""))
		words.pop();
	const name = words.slice(0, 5).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
	return name === "" ? "designer" : name;
}

/**
 * The spots running turns reserve, per project (#365). One instance per daemon, read by the
 * projection so a frame born into a spot stands in it and no other frame stands on one.
 */
export interface ReservedSpots {
	of(root: string): ReservedSpot[];
	reserve(root: string, key: string, spot: ReservedSpot): void;
	fill(root: string, key: string, frame: string): void;
	release(root: string, key: string): void;
}

export function createReservedSpots(): ReservedSpots {
	const roots = new Map<string, Map<string, ReservedSpot>>();
	return {
		of: (root) => [...(roots.get(root)?.values() ?? [])],
		reserve: (root, key, spot) => {
			const reserved = roots.get(root) ?? new Map<string, ReservedSpot>();
			reserved.set(key, spot);
			roots.set(root, reserved);
		},
		fill: (root, key, frame) => {
			const spot = roots.get(root)?.get(key);
			if (spot !== undefined) roots.get(root)?.set(key, { ...spot, frame });
		},
		release: (root, key) => {
			const reserved = roots.get(root);
			reserved?.delete(key);
			if (reserved?.size === 0) roots.delete(root);
		},
	};
}

export interface FrameWitnessOptions {
	readonly root: string;
	readonly hub: FrameHub;
	readonly spots: ReservedSpots;
	readonly now?: () => number;
}

/** What Put back writes, and what it says it did. */
export interface PutBack {
	readonly frame: string;
	readonly source: string;
	readonly sidecar: string | null;
}

/** What a turn's witness keeps for Put back, held with the turn for as long as it is. */
export interface FrameWitness {
	/** the deleted frame this turn kept, for Put back; undefined when it kept none */
	kept(frame: string): Kept | undefined;
	/** Put back wrote this frame: the witness takes it as known rather than as the agent's */
	restored(frame: string, source: string): void;
}

/** The engine's turn, with the frames it touches added to its log. */
export interface WitnessedTurn extends AgentTurn, FrameWitness {}

export function witnessFrames(
	turn: AgentTurn,
	{ root, hub, spots, now = Date.now }: FrameWitnessOptions,
): WitnessedTurn {
	const feed = createEventFeed<AgentEvent>();
	const { push } = feed;
	/** every frame as the turn has last seen it */
	const known = new Map<string, Kept>();
	/** the deleted ones, kept for Put back */
	const deleted = new Map<string, Kept>();
	const calls = new Map<string, Call>();
	/** an open block's call, by the thread and index its fragments name */
	const blocks = new Map<string, string>();
	/** the task each delegating call started, and the spot reserved for it */
	const tasks = new Map<string, string>();
	const reserved = new Map<string, AgentSpot>();
	let designDir: string | undefined;

	function source(dir: string): string | undefined {
		try {
			return readFileSync(join(dir, "frame.tsx"), "utf8");
		} catch {
			return undefined;
		}
	}

	function sidecarText(dir: string): string | null {
		try {
			return readFileSync(join(dir, "frame.json"), "utf8");
		} catch {
			return null;
		}
	}

	try {
		designDir = realDesignDir(root);
	} catch {
		designDir = undefined;
	}
	for (const frame of discoverFrames(root) ?? []) {
		const text = source(frame.dir);
		if (text !== undefined) known.set(frame.name, { source: text, sidecar: sidecarText(frame.dir) });
	}

	/** the call a frame landing now is most likely the work of */
	function attribute(frame: string): { call: string | null; parent: string | null; task: string | null } {
		const at = now();
		const live = [...calls.values()].filter((call) => call.closed === undefined || at - call.closed < LATE_MS);
		const named = live.filter((call) => call.input.includes(`frames/${frame}/`));
		const pick = (named.length > 0 ? named : live.filter((call) => !tasks.has(call.id))).sort(
			(a, b) => b.opened - a.opened,
		)[0];
		const delegation = named.find((call) => tasks.has(call.id));
		const chosen = pick ?? delegation;
		if (chosen === undefined) return { call: null, parent: null, task: null };
		// a delegating call is its own frames' parent: a designer the engine runs as a tool
		const parent = tasks.has(chosen.id) ? chosen.id : chosen.parent;
		return { call: chosen.id, parent, task: parent === null ? null : (tasks.get(parent) ?? null) };
	}

	/**
	 * What stands on the root page apart from `frame`, as rects: its frames, the pages on
	 * it and the spots still empty but `spot`. Nothing when the page cannot be read.
	 */
	function rootField(frame?: string, spot?: string): { field: Rect[]; projection: Projection } | undefined {
		let projection: Projection;
		try {
			projection = listProjectFrames(root, { reserved: spots.of(root) });
		} catch {
			return undefined;
		}
		const field: Rect[] = projection.frames
			.filter((one) => one.page === undefined && one.name !== frame)
			.map(({ x, y, w, h }) => ({ x, y, w, h }));
		for (const { at, box } of pageObjectsOn(ROOT_PAGE, projection.pages, projection.frames, projection.places))
			field.push({ ...at, ...box });
		for (const one of spots.of(root)) if (one.frame === undefined && one.name !== spot) field.push(one);
		return { field, projection };
	}

	/**
	 * A frame just born on the root page fills the spot reserved for its delegation, at its
	 * own size. A frame bigger than the spot that would then cover a neighbour stands beside
	 * the field instead, as any new frame would, and the spot moves with it (story 57).
	 */
	function fill(frame: string, dir: string, task: string | null): string | undefined {
		if (pageParent(frame) !== ROOT_PAGE || designDir === undefined) return undefined;
		const open = [...reserved.values()].filter((spot) => spot.state === "held");
		const spot = open.find((one) => one.name === frame) ?? open.find((one) => task !== null && one.task === task);
		if (spot === undefined) return undefined;
		const sidecar = readSidecar(join(dir, "frame.json"), designDir);
		const size = sidecar.kind === "sized" ? sidecar.footprint : sidecar.kind === "placed" ? sidecar.geometry : spot;
		let at = { x: spot.x, y: spot.y, w: size.w, h: size.h };
		if (size.w > spot.w || size.h > spot.h) {
			const field = rootField(frame, spot.name)?.field ?? [];
			if (field.some((other) => overlaps(at, other))) at = { ...besideField(field), w: size.w, h: size.h };
		}
		try {
			writeGeometry(join(dir, "frame.json"), at, designDir);
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			return undefined;
		}
		const filled: AgentSpot = { ...spot, ...at, state: "filled", frame };
		reserved.set(spot.task, filled);
		spots.fill(root, `${spot.task}`, frame);
		hub.publish(root, { kind: "geometry", frame });
		push(filled);
		return spot.name;
	}

	/** read the disk for these frames, or every frame, and say what moved */
	function rescan(names?: ReadonlySet<string>): void {
		const found = new Map((discoverFrames(root) ?? []).map((frame) => [frame.name, frame]));
		const asked = names ?? new Set([...known.keys(), ...found.keys()]);
		const look = new Set(asked);
		// a frame that vanished or appeared outside the names the watcher gave still counts
		for (const name of known.keys()) if (!found.has(name)) look.add(name);
		for (const name of found.keys()) if (!known.has(name)) look.add(name);
		for (const name of look) {
			const was = known.get(name);
			const there = found.get(name);
			if (there === undefined) {
				if (was === undefined) continue;
				known.delete(name);
				deleted.set(name, was);
				const who = attribute(name);
				push({
					kind: "frame",
					change: "deleted",
					frame: name,
					lines: 0,
					source: was.source,
					...(was.sidecar === null ? {} : { sidecar: was.sidecar }),
					call: who.call,
					task: who.task,
					parent: who.parent,
				});
				continue;
			}
			const text = source(there.dir);
			if (text === undefined || text === was?.source) continue;
			known.set(name, { source: text, sidecar: sidecarText(there.dir) });
			const who = attribute(name);
			if (was === undefined) {
				const spot = fill(name, there.dir, who.task);
				deleted.delete(name);
				push({
					kind: "frame",
					change: "created",
					frame: name,
					lines: linesOf(text),
					source: text,
					call: who.call,
					task: who.task,
					...(spot === undefined ? {} : { spot }),
					parent: who.parent,
				} satisfies AgentFrame);
				continue;
			}
			push({
				kind: "frame",
				change: "changed",
				frame: name,
				lines: linesOf(text),
				range: changedRange(was.source, text),
				call: who.call,
				task: who.task,
				parent: who.parent,
			});
		}
	}

	/** a designer started: reserve its spot on the root page, named from its task */
	function reserve(task: string, call: string | null, description: string | null, parent: string | null): void {
		if (designDir === undefined || reserved.has(task)) return;
		const read = rootField();
		if (read === undefined) return;
		const { field, projection } = read;
		const onRoot = projection.frames.filter((frame) => frame.page === undefined);
		const rightmost = [...onRoot].sort((a, b) => b.x + b.w - (a.x + a.w))[0];
		const size = rightmost === undefined ? DEFAULT_FOOTPRINT : { w: rightmost.w, h: rightmost.h };
		const taken = new Set([
			...projection.frames.map((frame) => frame.name),
			...spots.of(root).map((spot) => spot.name),
		]);
		const base = spotName(description);
		let name = base;
		for (let n = 2; taken.has(name); n += 1) name = `${base}-${n}`;
		const spot: AgentSpot = { kind: "spot", state: "held", name, task, call, ...besideField(field), ...size, parent };
		reserved.set(task, spot);
		spots.reserve(root, task, { name, x: spot.x, y: spot.y, w: spot.w, h: spot.h });
		push(spot);
	}

	function release(task: string): void {
		const spot = reserved.get(task);
		if (spot === undefined) return;
		spots.release(root, task);
		if (spot.state !== "held") return;
		const released: AgentSpot = { ...spot, state: "released" };
		reserved.set(task, released);
		push(released);
	}

	/** what a call's input says it is writing, said as the frame's source so far */
	function stream(call: Call): void {
		const written = sourceWritten(call.tool, call.input);
		if (written === undefined) return;
		call.writing = written.frame;
		if (written.source.length <= call.said) return;
		// a line at a time: the canvas counts lines, and a fragment is a few characters
		const whole = written.source.lastIndexOf("\n") + 1;
		const upTo = call.complete === true ? written.source.length : whole;
		if (upTo <= call.said) return;
		const text = written.source.slice(call.said, upTo);
		call.said = upTo;
		push({
			kind: "frame-source",
			frame: written.frame,
			call: call.id,
			text,
			lines: linesOf(written.source.slice(0, upTo)),
			parent: call.parent,
		});
	}

	/** read one event of the engine's for what it says about calls and delegations */
	function observe(event: AgentEvent): void {
		if (event.kind === "call" && event.id !== null) {
			calls.set(event.id, {
				id: event.id,
				parent: event.parent,
				tool: event.tool,
				input: "",
				opened: now(),
				said: 0,
			});
			blocks.set(`${event.parent ?? ""} ${event.block}`, event.id);
			return;
		}
		if (event.kind === "call-input") {
			const call = calls.get(blocks.get(`${event.parent ?? ""} ${event.block}`) ?? "");
			if (call === undefined) return;
			call.input += event.fragment;
			stream(call);
			return;
		}
		if (event.kind === "called") {
			const was = calls.get(event.id);
			const input = typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? {});
			const call: Call = was ?? {
				id: event.id,
				parent: event.parent,
				tool: event.tool,
				input: "",
				opened: now(),
				said: 0,
			};
			call.input = input;
			call.complete = true;
			calls.set(event.id, call);
			// the whole call: an engine that sends no fragments says the source once, here
			stream(call);
			return;
		}
		if (event.kind === "result") {
			const call = calls.get(event.id);
			if (call !== undefined) call.closed = now();
			return;
		}
		if (event.kind === "task-started") {
			if (event.call !== null) tasks.set(event.call, event.task);
			if (event.agent === "designer") reserve(event.task, event.call, event.description, event.parent);
			return;
		}
		if (event.kind === "task-done") release(event.task);
	}

	const unsubscribe = hub.subscribe(root, (change) => {
		if (feed.finished) return;
		if (change.kind === "frame") rescan(new Set([change.frame]));
	});

	void (async () => {
		try {
			for await (const event of turn.events) {
				// a delegation is said before the spot reserved for it, so the spot has a task to name
				if (event.kind === "task-started") {
					push(event);
					observe(event);
					continue;
				}
				observe(event);
				// the turn's last word waits for the disk: a write just before it is the turn's
				// and a spot nothing filled is let go with it
				if (event.kind === "closed" || (event.kind === "ended" && event.parent === null)) {
					rescan();
					for (const task of reserved.keys()) release(task);
				}
				push(event);
			}
		} finally {
			rescan();
			unsubscribe();
			for (const task of reserved.keys()) release(task);
			feed.finish();
		}
	})();

	return {
		events: { [Symbol.asyncIterator]: () => feed.events() },
		answer: (request, reply) => turn.answer(request, reply),
		interrupt: () => turn.interrupt(),
		abandon: () => turn.abandon(),
		kept: (frame) => deleted.get(frame),
		restored: (frame, text) => {
			deleted.delete(frame);
			known.set(frame, { source: text, sidecar: null });
			// a turn still running says so in its own log, so every reader of it draws the frame back
			push({ kind: "frame", change: "restored", frame, lines: linesOf(text), call: null, task: null, parent: null });
		},
	};
}

/**
 * Put a deleted frame back, from the source its turn kept (#365): the entry and its
 * sidecar, written where the frame was. Refused when the name is not a frame path or a
 * frame stands there again.
 */
export function putFrameBack(root: string, back: PutBack): void {
	if (!isFramePath(back.frame)) throw new Error(`"${back.frame}" is not a frame name`);
	const designDir = realDesignDir(root);
	const dir = resolveDesignPath(designDir, join(designDir, "frames", ...back.frame.split("/")));
	if (source(dir) !== undefined) throw new FrameStandsError(back.frame);
	mkdirSync(dir, { recursive: true });
	// where it stood comes back with it, unless something already stands in its sidecar
	if (back.sidecar !== null) {
		try {
			writeFileSync(join(dir, "frame.json"), back.sidecar, { flag: "wx" });
		} catch {}
	}
	writeFileSync(join(dir, "frame.tsx"), back.source, { flag: "wx" });

	function source(at: string): string | undefined {
		try {
			return readFileSync(join(at, "frame.tsx"), "utf8");
		} catch {
			return undefined;
		}
	}
}

/** a frame's entry stands at this name; false for a name that is not a frame's */
export function frameStands(root: string, frame: string): boolean {
	if (!isFramePath(frame)) return false;
	try {
		const designDir = realDesignDir(root);
		return existsSync(resolveDesignPath(designDir, join(designDir, "frames", ...frame.split("/"), "frame.tsx")));
	} catch {
		return false;
	}
}

export class FrameStandsError extends Error {
	constructor(frame: string) {
		super(`a frame "${frame}" stands there again`);
	}
}
