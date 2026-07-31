import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost: for a beat after a write, the frame it replaced is still faintly there,
 * and then it is not.
 *
 * `agent-hand--ghost`'s file, carried across unchanged, because the question this frame
 * asks of it is whether it needs changing. **It does not, and the mechanism is why.**
 * Nothing here knows what changed: the layer is handed two whole renders of the same
 * component at two revisions, draws the older over the newer at a 0.3 cap, and lets
 * them cancel — which they do exactly, everywhere the write did not reach, because the
 * same component with the same props makes the same pixels. Cancellation is per pixel,
 * so it is indifferent to how many pixels there are. **This is the only channel in the
 * family with no dependence on the frame's shape, its size, or its zoom**, and the only
 * one that needs no wall to stand on.
 *
 * The two constants are the parent's and both are still right at this shape. The floor
 * is **180ms**, `frame-shell.tsx:136-144`'s cover fade, which is spool's own measure of
 * how long a reboot's seam lasts. The ceiling is **573ms**, the shortest interval
 * between two writes in `claude-edits` — the third and fourth calls of the first run,
 * 8,758ms to 9,331ms. Neither is a function of the frame's box. **420ms** sits between
 * them: 140 held at the cap, 280 leaving on a curve that sheds most of the ink in its
 * first 90ms.
 *
 * What *is* a function of shape is what the ghost has to say, and it changes in the
 * ghost's favour. See `kaffe-desk.tsx`: a reflow's blast radius is its column's width,
 * so the worst a left-column write can double here is 34.2% of the frame against a
 * phone's 92.7%.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: 140 + 280 */
const HOLD_MS = 140;
const LEAVE_MS = 280;
export const GHOST_MS = HOLD_MS + LEAVE_MS;

/** out fast, then a tail nobody can see */
const LEAVE = [0.33, 1, 0.68, 1] as const;

/**
 * The revision the ghost is of, or nothing.
 *
 * Only ever a step forward. A replay drops the revision back to zero in one commit, and
 * a ghost of the finished design over the found one would be the whole frame doubled.
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
 * no filter, no colour, no border. It is the design's own previous state in the design's
 * own colours, which is why this direction spends no accent.
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
