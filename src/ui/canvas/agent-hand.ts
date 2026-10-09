/**
 * Where a write the agent landed went on the canvas (#214, #366).
 *
 * The canvas reads the transcript and the daemon owns the file, so neither can say alone
 * which block a write changed: the daemon turns the write's strings into a line range,
 * and a frame's own document turns the range into a box. That box is what the agent's
 * companion hops to and rings (`agent-companion-layer`), which replaced the hand's node,
 * thread, plate and lane.
 *
 * A located mark is a fact about the pixels, so it needs a document, and below
 * `LIVE_MIN_CSS_PX` a frame is a stored photograph with no document in it: a frame drawn
 * too small to read gets the companion at the lines' height and no ring, and nothing
 * lands retroactively when a zoom later boots it.
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { locateWrite } from "../api";
import type { AgentTurn } from "./agent-stream";
import type { Box } from "./camera";

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
): { marks: readonly HandMark[]; strike: (frame: string, write: string, box: Box) => void } {
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

	return { marks, strike };
}
