import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost, back on the clock the frame is actually written on.
 *
 * `agent-hand--ghost` decided the mechanism and this changes none of it: the layer is
 * handed the same component at two revisions, draws the older over the newer at 0.3,
 * and lets them cancel — which they do exactly, everywhere the write did not reach,
 * because the same component with the same props makes the same pixels. No diff is
 * computed anywhere. The peak is a cap rather than a crossing, so the composite is a
 * plain lerp and there is never a moment where two designs are on screen at equal
 * strength, which is the moment that reads as a broken re-render.
 *
 * **What is restored is when it fires, and that puts the parent's constant back the
 * right way round.** `agent-hand--ghost` set the 420ms life against **573ms — the
 * shortest interval between two writes in this capture**, the third and fourth calls
 * of the first run at 8,758ms and 9,331ms — because a ghost still alive when the next
 * write lands is a ghost of the wrong revision. `agent-hand--ghost-loud` then re-drew
 * it on the photograph cadence, three stills at 14.5s, 26.8s and 35.4s, and concluded
 * the ceiling had been measured against a clock the canvas does not run on. That was
 * true of the product as it stands and it is a defect rather than a constraint. On the
 * write clock the ceiling is 573ms again, 420 clears it by 153ms, and **two ghosts are
 * never alive at once** — arithmetic on 420 against 573 rather than luck.
 *
 * **The cost the compile assigned to the ghost was the photograph's, not the ghost's.**
 * A photograph collapses a whole run, so each of the parent's three ghosts doubled
 * everything the run touched plus everything its reflows moved: 42.2%, 14.8% and 57.8%
 * of the frame's own area, median 42.2. One ghost per write measures **3.1, 39.0, 1.9,
 * 1.9, 29.4, 5.0, 9.0, 9.0, 5.8, 5.8, 59.3, 41.9 and 2.5 percent, median 5.8.** Ten of
 * the thirteen are under ten percent of the frame.
 *
 * The peak gets *worse*, and it is worth saying so plainly: write 11 takes the headline
 * to two lines and moves the four blocks under it, which doubles **59.3%** against the
 * compile's 57.8. So the write clock does not buy a quieter maximum. It buys a quieter
 * turn: a channel that is loud three times out of thirteen rather than two times out of
 * three.
 *
 * **The engineering does not move with the clock.** Above `LIVE_MIN_CSS_PX` an edit
 * reboots the document with no overlap window, so a pixel-exact previous state means
 * holding the outgoing iframe mounted and frozen — `agent-hand--ghost`'s finding, and
 * this frame changes nothing about it. Below it there is no iframe: the shell already
 * puts a frame's stored cover over it and fades it out over 180ms once the replacement
 * loads (`frame-shell.tsx:136-144`), and a ghost there is that same layer held at 0.3
 * for 420ms instead of faded out over 180.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: 140 + 280, `agent-hand--ghost`'s numbers so the two frames compare */
const HOLD_MS = 140;
const LEAVE_MS = 280;
export const GHOST_MS = HOLD_MS + LEAVE_MS;

/**
 * Out fast, then a tail nobody can see. Most of the 0.3 is shed inside the first 90ms
 * of the leave, so the ghost is perceptually about a fifth of a second even though it
 * is on screen for 420ms — which is what keeps it from being something a person can
 * stop and stare at, and staring is where a ghost turns into a bug.
 */
const LEAVE = [0.33, 1, 0.68, 1] as const;

/**
 * The revision the ghost is of, or nothing.
 *
 * Only ever a step forward. A replay drops the revision back to zero in one commit,
 * and a ghost of the finished design over the found one would be the whole frame
 * doubled — the rendering bug this direction is accused of being, drawn on purpose at
 * the one moment nobody wrote anything.
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
 * The frame, with what it replaced still over it.
 *
 * The current render is the frame — opaque, in the flow, exactly what the canvas
 * would draw with no agent anywhere. The ghost is a sibling on top of it and touches
 * nothing: no filter, no colour, no border. It is the design's own previous state in
 * the design's own colours, which is why this direction spends no accent.
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
