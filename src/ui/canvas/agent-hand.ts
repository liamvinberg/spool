/**
 * The agent's hand on a frame: what it is holding, and what it has just changed (#214).
 *
 * The canvas used to say nothing while the agent worked. A frame's picture swapped to a
 * new one some seconds after a write landed and that was the whole of it. This is the
 * vocabulary that replaced it, compiled from twenty-eight explorations on the `agent`
 * page — `design/frames/agent/agent-hand` is the canonical frame and the visual source of
 * truth, and every number below was argued there rather than picked here.
 *
 * Three tool calls, five objects, no words anywhere:
 *
 *   node      the participant, welded to the wall, unchanging
 *   thread    length is the kind of hold, tension is whether a call is open
 *   corners   the `shot` posture, four arcs that never close
 *   plate     the block a write changed, tinted and drained
 *   lane      one mark per landed write, at the height of what it changed
 *
 * Two of them are facts about the transcript and three are facts about the pixels, and
 * that split is what decides where each may draw. **Presence** — thread, node, corners —
 * needs only a name off the wire, so it draws on any visible frame at any zoom. A
 * **located mark** — plate, lane — needs a box, a box needs a document, and below
 * `LIVE_MIN_CSS_PX` a frame is a stored photograph with no document in it. So a frame
 * drawn too small to read gets the presence and nothing located, and nothing lands
 * retroactively when a zoom later boots it.
 *
 * The camera never moves for any of this. The rail is the wayfinder: its frame reference
 * is already a jump. Following the agent is #216.
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { locateWrite } from "../api";
import type { AgentTurn } from "./agent-stream";
import type { AgentEntry, AgentRow } from "./agent-transcript";
import type { Box } from "./camera";

/**
 * Whether the plate is drawn at all.
 *
 * It is the one place the hand puts ink on the design rather than in the seam beside it,
 * and it is the sole channel that says *what* changed. The grilling kept it and asked for
 * it severable, because it may yet be disliked in the flesh — so this is the one-line
 * decision, and nothing downstream of it needs touching to take it out: locating still
 * happens, the lane still marks the heights, and the frame simply keeps its own pixels.
 */
export const PLATE_DRAWN = true;

/* ---------- what the hand is doing ---------- */

export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** calls landed in the open run, which plucks the thread and is printed nowhere */
	readonly count: number;
	readonly picturing: boolean;
}

/**
 * How long a hold is.
 *
 * Taking a frame in is the whole of it — `read`, `look`, `logs` — and changing it is a
 * segment, because a write is somewhere in the file rather than all of it. Everything
 * spool has no word for takes the whole, which is the honest default: an unknown call on
 * a frame is the agent at that frame, and claiming it touched one part of it would be
 * inventing a fact.
 */
const HOLD_OF: Record<string, Hold> = { write: "part", edit: "part" };

/** the verb that takes the ink off the wall and puts it around the frame */
const PICTURING = "shot";

/** every row the log holds, each delegate's own unfolded in place — a delegate's work is the thread's (#194) */
function allRows(entries: readonly AgentEntry[]): AgentRow[] {
	const out: AgentRow[] = [];
	for (const entry of entries) {
		if (entry.kind !== "row") continue;
		out.push(entry);
		out.push(...allRows(entry.delegated));
	}
	return out;
}

/**
 * Where the agent is, read off the same rows the rail is reading.
 *
 * The open call if there is one, and the last frame it named if there is not — so the
 * thread stays where the agent left it between calls and goes slack rather than
 * vanishing and coming back. Only while the turn is running: a settled turn has nobody
 * at any frame, and a turn parked on a question is waiting on a person rather than
 * working a frame.
 */
export function handOf(entries: readonly AgentEntry[], running: boolean): Hand | null {
	if (!running) return null;
	const named = allRows(entries).filter((row) => row.frame !== null);
	const last = named.at(-1);
	if (last === undefined) return null;
	const open = named.filter((row) => row.state === "running").at(-1) ?? null;
	const on = open ?? last;
	if (on.frame === null) return null;
	return {
		frame: on.frame,
		hold: HOLD_OF[on.verb] ?? "whole",
		verb: open === null ? null : open.verb,
		count: open === null ? 0 : open.count,
		picturing: open !== null && open.verb === PICTURING,
	};
}

/* ---------- what it has just changed ---------- */

/**
 * The key a range anchor and its answer agree on, both sides' spelling.
 *
 * Apart from a point anchor's `path:line:col` because they are different questions of the
 * same document, answered into the same map: one stamp exactly, or every stamp inside a
 * span of lines.
 */
export function rangeKeyOf(path: string, from: number, to: number): string {
	return `${path}:${from}-${to}`;
}

/**
 * One write that has been located in its file and is waiting for the pixels.
 *
 * The daemon answers lines; a document turns lines into a box; and the only document that
 * can answer honestly is one that has already reloaded with the write in it. So an arm
 * sits here from the moment the range lands and is put to every frame that boots while it
 * does — which is a stronger correlation than the path alone, because a document that
 * renders nothing from those lines simply answers no box.
 *
 * It is asked of a boot rather than of the change event that caused one, because a write
 * to a shared component reloads every frame that mounts it and each of them measures the
 * same lines somewhere else. One arm, as many marks as there are frames showing it.
 */
export interface ArmedWrite {
	/** the call's own id, which is what keeps one write from being drawn twice */
	readonly key: string;
	/** design-relative, which is how `data-spool-source` spells a file */
	readonly path: string;
	readonly from: number;
	readonly to: number;
}

/**
 * One located write, on one frame, with the box that frame's document gave it.
 *
 * A write lands in a file and a file can be read by several frames, so one write is as
 * many marks as there are frames showing it — which is the whole reason the box is asked
 * of the document rather than computed from the file: a shared component sits in a
 * different place on every page that mounts it.
 */
export interface HandMark {
	/** the frame and the write, so a second write to one file restarts rather than stacks */
	readonly key: string;
	readonly frame: string;
	/** frame-local CSS pixels, as the document measured them */
	readonly box: Box;
}

/**
 * How long a mark stays on screen, which is how long the canvas holds it.
 *
 * The lane's life, because it is the longer of the two: the plate is over inside it and
 * takes itself off. Both envelopes and the numbers behind them are in `ui.css`, where the
 * marks are actually drawn — this is the one thing about them the canvas has to know,
 * which is when to stop keeping a mark at all.
 */
export const LANE_MS = 6000;

/**
 * How long an arm waits for a document to answer before letting go.
 *
 * Long enough for a watcher debounce, a compile and a boot; short enough that a write
 * whose frame is a picture, or whose file nothing on the canvas reads, does not sit there
 * waiting to strike the next time something unrelated reloads. Nothing lands
 * retroactively — that is the degrade, stated.
 */
export const ARM_MS = 8000;

/** the mark one write leaves on one frame, which is the pair that must not be drawn twice */
export function markKeyOf(frame: string, write: string): string {
	return `${frame}:${write}`;
}

/**
 * The whole hand, as one thing the canvas holds: where the agent is, and every write it
 * has landed that some document has been able to place.
 *
 * The arms live in a ref the caller owns rather than in state here, because the one place
 * they are read is inside the frame-message handler that asks a booting document where
 * those lines went — and that handler is installed once and reads everything through
 * refs, the way every other rung of the canvas does.
 */
export function useAgentHand(
	project: string,
	turn: AgentTurn,
	armed: RefObject<Map<string, ArmedWrite>>,
): { hand: Hand | null; marks: readonly HandMark[]; strike: (frame: string, write: string, box: Box) => void } {
	/**
	 * Where the agent is, off the same rows the rail is drawing.
	 *
	 * Recomputed with the transcript rather than accumulated, for the reason the transcript
	 * itself is: the same events give the same posture, so nothing here can drift out of
	 * step with the log six inches away.
	 */
	const hand = useMemo(() => handOf(turn.entries, turn.phase === "playing"), [turn.entries, turn.phase]);
	const [marks, setMarks] = useState<HandMark[]>([]);
	/** every write already sent for locating, since the projection re-lists them each tick */
	const locating = useRef(new Set<string>());
	/** every mark already struck, so a second boot inside one arm does not restrike it */
	const struck = useRef(new Set<string>());

	/**
	 * Ask the daemon where each landed write went.
	 *
	 * The canvas reads the transcript and the daemon owns the file, so neither can answer
	 * this alone. What comes back is a line range, which stays armed until a document that
	 * shows those lines boots and can be measured — see `ArmedWrite`.
	 */
	useEffect(() => {
		for (const write of turn.writes) {
			if (locating.current.has(write.key)) continue;
			locating.current.add(write.key);
			void locateWrite(project, write.path, [...write.find]).then((range) => {
				if (range === undefined) return;
				armed.current.set(write.key, { key: write.key, path: range.path, from: range.from, to: range.to });
				// an arm nobody ever answered lets go by itself: a write whose frame is a
				// picture, or whose file nothing on this canvas reads, must not be waiting to
				// strike the next time something unrelated reboots
				setTimeout(() => armed.current.delete(write.key), ARM_MS);
			});
		}
	}, [project, turn.writes, armed]);

	/** one located write, on one frame, for as long as the ledger keeps it */
	const strike = useCallback((frame: string, write: string, box: Box) => {
		const key = markKeyOf(frame, write);
		if (struck.current.has(key)) return;
		struck.current.add(key);
		setMarks((current) => [...current, { key, frame, box }]);
		setTimeout(() => {
			struck.current.delete(key);
			setMarks((current) => current.filter((mark) => mark.key !== key));
		}, LANE_MS);
	}, []);

	return { hand, marks, strike };
}
