import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost, carried over from `agent-hand--ghost` with its mechanism untouched and
 * its clock re-derived.
 *
 * Nothing here knows what changed. The layer is handed two whole renders of the same
 * component at two revisions, draws the older one over the newer one at a hard 0.3
 * cap, and lets them cancel — which they do, exactly, everywhere the change did not
 * reach, because the same component with the same props produces the same pixels. The
 * diff is free, there is no box, there is no source map, and the reflow case is right
 * for nothing: a change that pushes six blocks down the page doubles all six, loud in
 * proportion to how much moved.
 *
 * **What is different is what the ghost is a ghost of.** The parent fired it on every
 * write, on the reading that a write redraws the frame. Below 400 drawn pixels it does
 * not — `cover.ts:8` sets `LIVE_MIN_CSS_PX` to 400 and the gate at `lifecycle.ts:245`
 * refuses to mount a document under it, so at 39% a 390px frame draws 152 and what is
 * on the canvas is a stored photograph. The picture moves when the capture errand
 * finishes, which across this capture is **three times against thirteen writes** — at
 * 14.5s, 26.8s and 35.4s, carrying six writes, four and three. So the ghost fires
 * three times here, and each one is a run's worth of change rather than one write's.
 *
 * **That releases the constant and this frame declines to spend it.** The parent's
 * 420ms had a measured ceiling of 573ms, the shortest gap between two writes, because
 * a ghost still alive when the next write lands is a ghost of the wrong revision. At
 * the photograph's cadence the gaps are 12.3s and 8.6s, so the ceiling is twenty times
 * further away and 420 is no longer forced. It is kept anyway, and the reason is that
 * the ceiling was never the only thing holding it there. **A ghost is legible as
 * information exactly as long as nobody can stop and stare at it**, and what it now
 * carries is six writes at once rather than one — a headline resized, a lede doubled,
 * a button refilled and a hero recoloured, all doubled together. That is the frame's
 * loudest state and the one most easily read as a broken re-render, so the honest
 * move on being handed more room was to leave it alone. 140ms held at the cap and 280
 * leaving on a curve that sheds most of its ink in the first 90.
 *
 * The floor is unmoved and now sits under a seam that really is there: 180ms is what
 * `frame-shell.tsx:136-144` fades a stored cover out over, and a new photograph is
 * exactly that cover being replaced.
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
 * Only ever a step forward. A replay drops the revision back to zero in one commit,
 * and a ghost of the finished design over the found one would be the whole frame
 * doubled — which is the rendering bug this direction is accused of being, drawn on
 * purpose at the one moment nobody changed anything.
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
 * design's own colours, which is why this direction spends no accent, and why the word
 * on the wall outside can spend the canvas's ink without the two ever meeting.
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
