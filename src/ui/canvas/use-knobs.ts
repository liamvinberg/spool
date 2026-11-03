import { useEffect, useState, useSyncExternalStore } from "react";
import type { StampShift } from "../../daemon/hand-write";
import type { KnobAction, KnobCall, KnobPath, KnobsDeclared, KnobValue, KnobValues } from "../../runtime/knob-protocol";
import { revertPatch, type TextWritten } from "../api";
import type { TunePhase } from "../primitives/inputs";
import { REFUSAL_MS, type Refusal } from "./hand-edit";
import { amend, drop, type History, type HistoryEntry, type Way } from "./history";
import {
	type KnobLine,
	type KnobStatus,
	knobId,
	knobStatus,
	readersOf,
	sameValue,
	sharedFile,
	specAt,
	stillLive,
	valueNow,
} from "./knobs";
import type { Notice } from "./toast";
import { wroteNothing } from "./use-hand-edit";

/**
 * The knobs' lane (#220): what each frame's document declared, the values the
 * rail has posted into it while a hand tunes, and the one write a gesture
 * ends in. A value is posted to every frame whose document declared the same
 * call, because a shared knob is one value for all of them; it stands until a
 * new document reports the literal the file now holds.
 *
 * Held outside React, because a drag posts sixty values a second and only the
 * rail has to draw them: the canvas hands messages in and the rail subscribes.
 */

export type KnobEntry = Extract<HistoryEntry, { kind: "knob" }>;

/** The write half of a release, as the write lane's client answers it. */
export type WriteKnob = (
	project: string,
	frame: string,
	ask: { at: string; path: KnobPath; value: KnobValue },
) => Promise<TextWritten | undefined>;

export interface KnobLaneDeps {
	project: string;
	post: (frame: string, message: KnobValues | KnobAction) => void;
	writeKnob: WriteKnob;
	/** what every hand write does once it has landed: the echo it suppresses, the stamps it moves (`use-hand-edit.ts`) */
	landed: (
		frame: string,
		readAt: string,
		written: { path: string; fingerprint: string; shifts: StampShift[] | null },
	) => void;
	/** frames whose next reload the canvas caused, held behind their last paint */
	holdNext: { current: Set<string> };
	history: { current: History };
	updateHistory: (next: History) => void;
	recordEntry: (entry: HistoryEntry) => void;
	setNotice: (notice: Notice | null) => void;
}

/** What the rail draws of one frame's knobs. */
export interface FrameKnobs {
	calls: readonly KnobCall[];
	/** the values posted into it, by call and path */
	live: ReadonlyMap<string, Readonly<Record<KnobPath, KnobValue>>>;
	status: KnobStatus | null;
	/** the row an undo or redo just changed; the count makes each wash its own */
	washed: { id: string; at: string; path: KnobPath; n: number } | null;
	refused: { id: string; refusal: Refusal } | null;
}

const NONE: FrameKnobs = { calls: [], live: new Map(), status: null, washed: null, refused: null };

/** How long a written status stands before the foot goes quiet. */
const STATUS_MS = 2400;

const pick = (values: Record<KnobPath, KnobValue>, keep: (path: KnobPath) => boolean) =>
	Object.fromEntries(Object.entries(values).filter(([path]) => keep(path)));

export function createKnobLane(deps: () => KnobLaneDeps) {
	const declared = new Map<string, readonly KnobCall[]>();
	const live = new Map<string, Map<string, Record<KnobPath, KnobValue>>>();
	/** frames reloaded whose new document has declared nothing yet */
	const pending = new Set<string>();
	/** each gesture under way, by knob: the value it started from */
	const gestures = new Map<string, KnobValue | undefined>();
	let status: { frame: string; status: KnobStatus } | null = null;
	let washed: { frame: string; id: string; at: string; path: KnobPath; n: number } | null = null;
	let refused: { frame: string; id: string; refusal: Refusal } | null = null;
	let statusTimer: ReturnType<typeof setTimeout> | undefined;
	let refusedTimer: ReturnType<typeof setTimeout> | undefined;
	let washes = 0;
	const listeners = new Set<() => void>();
	const views = new Map<string, FrameKnobs>();

	const changed = () => {
		views.clear();
		for (const listener of listeners) listener();
	};

	const view = (frame: string): FrameKnobs => {
		const calls = declared.get(frame);
		if (calls === undefined) return NONE;
		let seen = views.get(frame);
		if (seen === undefined) {
			seen = {
				calls,
				live: live.get(frame) ?? new Map(),
				status: status?.frame === frame ? status.status : null,
				washed: washed?.frame === frame ? washed : null,
				refused: refused?.frame === frame ? { id: refused.id, refusal: refused.refusal } : null,
			};
			views.set(frame, seen);
		}
		return seen;
	};

	const say = (frame: string, next: KnobStatus | null) => {
		clearTimeout(statusTimer);
		status = next === null ? null : { frame, status: next };
		if (next !== null && next.kind !== "live") {
			statusTimer = setTimeout(() => {
				status = null;
				changed();
			}, STATUS_MS);
		}
	};

	const literal = (frame: string, at: string, path: KnobPath): KnobValue | undefined => {
		const spec = specAt(declared.get(frame) ?? [], at, path);
		return spec === undefined ? undefined : valueNow(spec, undefined);
	};

	const current = (frame: string, at: string, path: KnobPath): KnobValue | undefined =>
		live.get(frame)?.get(at)?.[path] ?? literal(frame, at, path);

	/** One value into every document that declared its call; its own literal again is no value to hold. */
	const put = (at: string, path: KnobPath, value: KnobValue | undefined) => {
		for (const frame of readersOf(declared, at)) {
			const calls = live.get(frame) ?? new Map<string, Record<KnobPath, KnobValue>>();
			const values = { ...calls.get(at) };
			if (value === undefined || sameValue(value, literal(frame, at, path))) delete values[path];
			else values[path] = value;
			if (Object.keys(values).length === 0) calls.delete(at);
			else calls.set(at, values);
			live.set(frame, calls);
			deps().post(frame, { spool: "knob-values", at, values });
		}
	};

	const forget = (frame: string) => {
		declared.delete(frame);
		live.delete(frame);
		pending.delete(frame);
	};

	// --- the frame's side ------------------------------------------------------

	/**
	 * A document said what it declares: the rail redraws, and what it has not
	 * caught up with is told again, or told to read its literal. A new
	 * document's literals are the file's, so only a gesture still under way
	 * outlives one; the same document again keeps what differs from its own.
	 */
	const heard = (message: KnobsDeclared) => {
		const { frame } = message;
		const held = live.get(frame) ?? new Map<string, Record<KnobPath, KnobValue>>();
		const fresh = pending.delete(frame);
		declared.set(frame, message.calls);
		const kept = fresh
			? new Map(
					[...held]
						.map(([at, values]) => [at, pick(values, (path) => gestures.has(knobId(at, path)))] as const)
						.filter(([, values]) => Object.keys(values).length > 0),
				)
			: stillLive(message.calls, held);
		live.set(frame, kept);
		for (const at of held.keys()) deps().post(frame, { spool: "knob-values", at, values: kept.get(at) ?? {} });
		changed();
	};

	/** The frame's document is being replaced: what it declared stands until the new one says otherwise. */
	const reloading = (frame: string) => {
		if (declared.has(frame)) pending.add(frame);
	};

	/** A new document arrived having declared nothing: its frame has no knobs any more. */
	const arrived = (frame: string) => {
		if (!pending.has(frame)) return;
		forget(frame);
		changed();
	};

	/** The frame's document went with nothing after it: a still, or no frame. */
	const gone = (frame: string) => {
		if (!declared.has(frame)) return;
		forget(frame);
		changed();
	};

	// --- the hand's side -------------------------------------------------------

	const refuse = (frame: string, id: string, refusal: Refusal) => {
		clearTimeout(refusedTimer);
		refused = { frame, id, refusal };
		refusedTimer = setTimeout(() => {
			refused = null;
			changed();
		}, REFUSAL_MS);
	};

	/**
	 * One report of a gesture on a knob (#220): `live` posts it into the
	 * frame, `cancel` puts back the value from before the gesture and writes
	 * nothing, and `commit` is the gesture's one write.
	 */
	const tune = (frame: string, knob: Extract<KnobLine, { kind: "knob" }>, next: KnobValue, phase: TunePhase) => {
		const { at, path, id } = knob;
		if (refused?.id === id) refused = null;
		const from = gestures.has(id) ? gestures.get(id) : current(frame, at, path);
		if (phase === "live") {
			gestures.set(id, from);
			put(at, path, next);
			say(frame, knobStatus("live", frame, at, path, from, next));
			changed();
			return;
		}
		gestures.delete(id);
		// a cancel carries the value from before its gesture
		if (phase === "cancel" || sameValue(from, next)) {
			put(at, path, next);
			say(frame, null);
			changed();
			return;
		}
		put(at, path, next);
		say(frame, null);
		changed();
		if (from !== undefined) void write(frame, knob, from, next);
	};

	const write = async (frame: string, knob: Extract<KnobLine, { kind: "knob" }>, from: KnobValue, to: KnobValue) => {
		const d = deps();
		const { at, path, id } = knob;
		// the other frames rendering a shared knob reload on the write's echo,
		// behind the paint they show now: the echo can beat the answer here
		const readers = sharedFile(frame, at) === null ? [] : readersOf(declared, at).filter((one) => one !== frame);
		for (const other of readers) d.holdNext.current.add(other);
		const written = await d.writeKnob(d.project, frame, { at, path, value: to });
		const putBack = (refusal: Refusal) => {
			for (const other of readers) deps().holdNext.current.delete(other);
			put(at, path, from);
			refuse(frame, id, refusal);
			changed();
		};
		if (written === undefined) {
			putBack({ code: "failed", says: "the knob could not be written" });
			return;
		}
		if (!written.ok) {
			putBack(written.refusal);
			return;
		}
		if (wroteNothing(written.undo)) {
			for (const other of readers) deps().holdNext.current.delete(other);
			return;
		}
		const now = deps();
		now.landed(frame, at, written);
		now.recordEntry({
			kind: "knob",
			frame,
			at,
			path,
			before: from,
			after: to,
			patch: written.undo,
			...(readers.length > 0 ? { frames: readers } : {}),
		});
		say(frame, knobStatus("written", frame, at, path, from, to, readers.length + 1));
		changed();
		if (written.uncaught === true) {
			now.setNotice({ kind: "success", message: "No history here: nothing is catching hand edits" });
		}
	};

	/** An action knob pressed: the frames running its call hear it, and nothing is written. */
	const press = (knob: Extract<KnobLine, { kind: "knob" }>) => {
		for (const frame of readersOf(declared, knob.at)) {
			deps().post(frame, { spool: "knob-action", at: knob.at, path: knob.path });
		}
	};

	/**
	 * One knob entry, run either way, on the canvas's one stack. The patch
	 * goes back over the wire and its answer is the entry's inverse from here
	 * on; the value it puts back is posted into the frames at once, so nothing
	 * reloads for it, and its row washes where it can be seen.
	 */
	const walk = (entry: KnobEntry, way: Way, taking: History) => {
		const readers = entry.frames ?? [];
		for (const other of readers) deps().holdNext.current.add(other);
		void revertPatch(deps().project, entry.patch).then((reverted) => {
			const d = deps();
			// a press that landed after this one owns the stacks now
			if (d.history.current !== taking) return;
			if (reverted === undefined || !reverted.ok) {
				for (const other of readers) d.holdNext.current.delete(other);
				d.updateHistory(drop(d.history.current, way));
				d.setNotice({
					kind: "error",
					message:
						reverted === undefined
							? "The step could not be put back"
							: "The file changed since; this step is dropped",
				});
				return;
			}
			d.updateHistory(amend(d.history.current, way, { ...entry, patch: reverted.undo }));
			d.landed(entry.frame, entry.at, reverted);
			const [from, to] = way === "undo" ? [entry.after, entry.before] : [entry.before, entry.after];
			put(entry.at, entry.path, to);
			say(
				entry.frame,
				knobStatus(
					way === "undo" ? "undone" : "redone",
					entry.frame,
					entry.at,
					entry.path,
					from,
					to,
					readers.length + 1,
				),
			);
			washes += 1;
			washed = { frame: entry.frame, id: knobId(entry.at, entry.path), at: entry.at, path: entry.path, n: washes };
			changed();
		});
	};

	return {
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		view,
		heard,
		reloading,
		arrived,
		gone,
		tune,
		press,
		walk,
		dispose: () => {
			clearTimeout(statusTimer);
			clearTimeout(refusedTimer);
		},
	};
}

export type KnobLane = ReturnType<typeof createKnobLane>;

/** The lane as the canvas holds it: one for the canvas's life, reading the canvas as it was last drawn. */
export function useKnobLane(deps: KnobLaneDeps): KnobLane {
	const [held] = useState(() => ({ deps }));
	held.deps = deps;
	const [lane] = useState(() => createKnobLane(() => held.deps));
	useEffect(() => lane.dispose, [lane]);
	return lane;
}

/** One frame's knobs, redrawn when they move. */
export function useFrameKnobs(lane: KnobLane, frame: string): FrameKnobs {
	return useSyncExternalStore(lane.subscribe, () => lane.view(frame));
}
