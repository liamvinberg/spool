import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost: for a beat after the canvas gets a new picture of a frame, the picture it
 * replaced is still faintly there, and then it is not.
 *
 * `agent-hand--ghost` is the whole of the mechanism and none of it is re-argued. The
 * layer is handed the same component at two revisions, draws the older over the newer
 * at a hard 0.3, and lets them cancel, which they do exactly everywhere the write did
 * not reach. No diff is computed anywhere, and the cap rather than a crossing is what
 * keeps it off the line where two designs at comparable strength read as a broken
 * re-render.
 *
 * **What changed is the clock, and it changes what the ghost is a ghost of.** The
 * parent fires on every write and stages thirteen revisions. Below `LIVE_MIN_CSS_PX`
 * there is no document to re-render, so those thirteen re-renders are an event the
 * product does not have: the picture follows the capture errand and moves three times
 * in this turn, at 14.5s, 26.8s and 35.4s. So the ghost fires three times here, and
 * **each firing carries a whole run**. A per-write ghost shows one substitution; a
 * per-photograph ghost shows six at once, which is a much fuller frame at the same
 * cap, and it is the one the regime allows.
 *
 * **The same clock makes the ghost cheap.** The parent's hardest cost is that the old
 * DOM is gone — an edit reboots the document with a fresh `key`, so its remedy is to
 * hold the outgoing iframe mounted and frozen under the incoming one. None of that
 * applies below the threshold, because there is no document either side of the seam.
 * The frame is a stored still and the thing being replaced is the previous still,
 * which `writeCover` currently deletes. Keeping one file instead of none is the whole
 * of the implementation at canvas zoom, and `coverPlan` at `frame-shell.tsx:67`
 * already puts a stored still over a frame and fades it out. The expensive version of
 * this direction is the one nobody is looking at; the version on the canvas is two
 * JPEGs.
 *
 * **420ms survives the change of clock and its derivation does not.** The parent read
 * the ceiling off the shortest gap between two writes, 573ms, because a ghost still
 * alive when the next write lands is a ghost of the wrong revision. On the photograph
 * cadence the shortest gap between two pictures is 12.3 seconds, so that ceiling is
 * gone. The one that replaces it is the next call on this frame: the third photograph
 * lands at 35,400ms and the agent's own `shot` opens at 35,825ms, **425 milliseconds
 * later**, and a ghost still on screen when the corners strike would put two claims
 * about the whole frame on top of each other. 420 clears it by five milliseconds. The
 * floor is unchanged and still 180ms, `frame-shell.tsx:136-144`'s own cover fade.
 *
 * **It is also the lane's legend, which is the reason both objects are on this
 * canvas.** A mark in the margin that stands until its own picture arrives is a
 * quantity nobody can verify by looking, because the rule is invisible until you have
 * watched it hold three times. The ghost is the loudest event in the frame and it
 * happens at exactly the instant the marks go out. One of them teaches the other.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: 140 + 280, and the lane leaves on the same two numbers */
export const HOLD_MS = 140;
export const LEAVE_MS = 280;
export const GHOST_MS = HOLD_MS + LEAVE_MS;

/**
 * Out fast, then a tail nobody can see. Most of the 0.3 is shed inside the first 90ms
 * of the leave, so the ghost is perceptually about a fifth of a second even though it
 * is on screen for 420ms, which is what keeps it from being something a person can
 * stop and stare at. Staring is where a ghost turns into a bug.
 */
export const LEAVE = [0.33, 1, 0.68, 1] as const;

/**
 * The revision the ghost is of, or nothing.
 *
 * Only ever a step forward. A replay drops the revision back to zero in one commit,
 * and a ghost of the finished design over the found one would be the whole frame
 * doubled, which is the rendering bug this direction is accused of being, drawn on
 * purpose at the one moment nobody wrote anything.
 */
export function useGhost(rev: number): { readonly rev: number; readonly key: number } | null {
	const still = useReducedMotion() === true;
	const [ghost, setGhost] = useState<{ rev: number; key: number } | null>(null);
	const last = useRef(rev);

	useEffect(() => {
		const before = last.current;
		last.current = rev;
		if (still || rev <= before) {
			setGhost(null);
			return;
		}
		setGhost({ rev: before, key: rev });
		const timer = window.setTimeout(() => setGhost(null), GHOST_MS);
		return () => window.clearTimeout(timer);
	}, [rev, still]);

	return still ? null : ghost;
}

/**
 * The frame, with the picture it replaced still over it.
 *
 * The current render is the frame: opaque, in the flow, exactly what the canvas would
 * draw with no agent anywhere. The ghost is a sibling on top of it and touches nothing.
 * No filter, no colour, no border. It is the design's own previous state in the
 * design's own colours, which is why this direction spends no accent.
 */
export function Ghosted({
	rev,
	ghost,
	draw,
}: {
	rev: number;
	ghost: { readonly rev: number; readonly key: number } | null;
	draw: (rev: number) => ReactNode;
}) {
	return (
		<div className="relative h-full w-full">
			{draw(rev)}
			{ghost === null ? null : (
				<motion.div
					key={ghost.key}
					className="pointer-events-none absolute inset-0"
					initial={{ opacity: PEAK }}
					animate={{ opacity: 0 }}
					transition={{ duration: LEAVE_MS / 1000, delay: HOLD_MS / 1000, ease: LEAVE }}
					aria-hidden="true"
				>
					{draw(ghost.rev)}
				</motion.div>
			)}
		</div>
	);
}
