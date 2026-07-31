import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost, back on the clock it was measured against.
 *
 * `agent-hand--ghost` decided the mechanism and nothing here changes it: the layer is
 * handed the same component at two revisions, draws the older over the newer at 0.3,
 * and lets them cancel — which they do exactly, everywhere the write did not reach,
 * because the same component with the same props makes the same pixels. No diff is
 * computed anywhere. The peak is a cap rather than a crossing, so the composite is a
 * plain lerp and there is never a moment where two designs sit on screen at equal
 * strength, which is the moment that reads as a broken re-render.
 *
 * **What changes is how many there are, and it puts the constant back where it came
 * from.** `agent-hand--ghost-loud` fired three ghosts, one per stored photograph, and
 * observed that 420ms then sat twenty times inside its own ceiling. It did — because
 * the ceiling had stopped applying. The 420 was measured against **573ms**, the
 * shortest interval between two writes in this capture (the third and fourth calls of
 * the first run, 8758ms to 9331ms), on the rule that a ghost still alive when the next
 * write lands is a ghost of the wrong revision. Draw thirteen writes and that rule is
 * live again: 420 against 573 leaves **153ms of clear air** at the tightest moment in
 * thirty-seven seconds, and two ghosts are never alive at once by arithmetic rather
 * than by luck.
 *
 * **And the loudness comes back down with it.** A ghost of a whole run doubled 42.2%,
 * 14.8% and 57.8% of the frame's area, which is where the compile's "that is a
 * rendering fault" reading came from. A ghost of one write doubles one block, plus
 * whatever that write's reflow moved — four of the thirteen move what is under them and
 * nine change in place. The direction's own loudest case is back to being one reflow
 * rather than six writes at once.
 *
 * The thirteen fire at 7153, 8758, 9331, 9924, 10721, 11988, 20868, 22435, 23221,
 * 24203, 30341, 31648 and 32837ms. Within a run the gaps are 573 to 1605ms; between
 * runs they are 8.9s and 6.1s.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: 140 + 280, and 420 against the 573ms floor is the whole of it */
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
 * Only ever a step forward. A replay drops the revision back to zero in one commit, and
 * a ghost of the finished design over the found one would be the whole frame doubled —
 * the rendering bug this direction is accused of being, drawn on purpose at the one
 * moment nobody wrote anything.
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
 * The current render is the frame — opaque, in the flow, exactly what the canvas would
 * draw with no agent anywhere. The ghost is a sibling on top of it and touches nothing:
 * no filter, no colour, no border. It is the design's own previous state in the
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
