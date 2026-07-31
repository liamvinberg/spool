import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost, on the clock the canvas actually runs on.
 *
 * `agent-hand--ghost` decided the mechanism and this changes none of it: the layer is
 * handed the same component at two revisions, draws the older over the newer at 0.3,
 * and lets them cancel — which they do exactly, everywhere the write did not reach,
 * because the same component with the same props makes the same pixels. No diff is
 * computed anywhere. The peak is a cap rather than a crossing, so the composite is a
 * plain lerp and there is never a moment where two designs are on screen at equal
 * strength, which is the moment that reads as a broken re-render.
 *
 * **What the compile changed is when it fires, and that turned its own constant
 * inside out.** The parent counted thirteen writes and drew thirteen ghosts, and set
 * its 420ms ceiling at **573ms — the shortest interval between two writes in this
 * capture**, because a ghost still alive when the next write lands is a ghost of the
 * wrong revision. `agent-hand--accrue` then measured the regime the canvas is
 * actually in: below `LIVE_MIN_CSS_PX` a frame is a stored photograph, so the picture
 * does not follow the source, it follows the capture errand, and **thirteen writes
 * make three photographs** at 14.5s, 26.8s and 35.4s. Put both findings in one frame
 * and the parent's ceiling was measured against a clock the canvas does not run on.
 * The real gaps between two ghosts here are **12.3s and 8.6s**, so 420ms sits twenty
 * times inside its own ceiling rather than 153ms short of it.
 *
 * **The cost of that is not the number, it is what a ghost is now a ghost of.** Each
 * of the three carries a whole run — six writes, then four, then three — so the
 * doubling is not one block, it is everything the run touched plus everything the
 * run's reflows moved. Measured against the union of each block's old and new box:
 * **42.2%, 14.8% and 57.8% of the frame's own area.** The parent's loudest case was
 * one reflow doubling six blocks; this is six writes doubling five.
 *
 * **The one thing the covered regime makes cheaper is the engineering.** The parent's
 * hardest problem was that an edit reboots the document with no overlap window, so a
 * pixel-exact previous state meant holding the outgoing iframe mounted and frozen.
 * Below 400 drawn pixels there is no iframe: the shell already puts a frame's stored
 * cover over it and fades it out over 180ms once the replacement loads
 * (`frame-shell.tsx:136-144`). A ghost there is that same layer held at 0.3 for 420ms
 * instead of faded out over 180, and nothing else. So the direction's price and its
 * loudness move in opposite directions with zoom: cheap and deafening down here,
 * expensive and precise up there.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: 140 + 280, the parent's numbers kept so the two frames compare */
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
