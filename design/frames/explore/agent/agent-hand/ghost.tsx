import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost: for a beat after a write, the frame it replaced is still faintly
 * there, and then it is not.
 *
 * `agent-hand--ghost`'s file, inherited whole and unchanged, including the 420ms.
 * `--ghost-lane` and `--ghost-loud` both had to re-derive that number against the
 * photograph cadence, where the interval between two ghosts is 12.3 seconds rather
 * than 573ms. This frame is back on the write clock — thirteen writes, thirteen
 * ghosts, shortest gap 573ms — so 420 is right again for exactly the reason it was
 * right the first time, and nothing here touches it.
 *
 * Nothing here knows what changed. The layer is handed two whole renders of the
 * same component at two revisions, draws the older one over the newer one, and
 * lets them cancel — which they do, exactly, everywhere the write did not reach,
 * because the same component with the same props produces the same pixels. **So
 * the diff is free.** Every other way of saying *this block changed* needs a box,
 * and a box needs a map from a byte offset in a source file to a rectangle on a
 * rendered page, which is the thing nobody has. Two renders and an opacity need
 * none of it, and they are right about the reflow case as well: a write that
 * pushes the six blocks under it down the page doubles all six, which is loud in
 * proportion to how much moved.
 *
 * **The peak is a cap rather than a crossing.** The old render is drawn at 0.3 and
 * never higher, so the composite is a plain lerp — 0.3 of what it was over 0.7 of
 * what it is. Where they agree the lerp is the identity and the frame is untouched;
 * where they disagree you get a 30% memory of the old and the new held 30% short of
 * full for the length of the hold. Starting the old at full and dissolving would be
 * more literally *the substitution*, and it was the first thing drawn here: it
 * delays the thing the person is waiting for by the length of its own fade, and it
 * passes through a moment where two designs are on screen at equal strength, which
 * is precisely the moment that reads as a broken re-render. A cap cannot reach that
 * moment. The cost is that the ghost can only ever be a hint of the old rather than
 * a legible copy of it, which at 152px it was going to be anyway.
 *
 * **How long it lives, from the capture's own numbers.** The floor is 180ms:
 * `frame-shell.tsx:136-144` fades a frame's stored cover out over exactly that once
 * a rebooted document reports `loaded`, so 180ms is spool's own measure of how long
 * a reboot's seam lasts, and a ghost shorter than the seam is a fade of nothing. The
 * ceiling is 573ms, the shortest interval between two writes in `claude-edits` —
 * measured, the gap between the third and fourth calls of the first run, 8,758ms to
 * 9,331ms. A ghost still on screen when the next write lands is a ghost of the wrong
 * revision. **420ms** sits between them: 140 held at the cap so the peak is a state
 * rather than a crossing, 280 leaving, and 153ms of clear air before the tightest
 * next write. Across the thirteen writes here, two ghosts are never alive at once.
 * If they ever were, the key would remount the layer and the older one would go: the
 * ghost is one revision back, always, and never a stack.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: 140 + 280 */
const HOLD_MS = 140;
const LEAVE_MS = 280;
export const GHOST_MS = HOLD_MS + LEAVE_MS;

/**
 * Out fast, then a tail nobody can see. Most of the 0.3 is shed inside the first
 * 90ms of the leave, so the ghost is *perceptually* about a fifth of a second even
 * though it is on screen for 420ms — which is what keeps it from being something a
 * person can stop and stare at, and staring is where a ghost turns into a bug.
 */
const LEAVE = [0.33, 1, 0.68, 1] as const;

/**
 * The revision the ghost is of, or nothing.
 *
 * Only ever a step forward. A replay drops the revision back to zero in one commit,
 * and a ghost of the finished design over the found one would be the whole frame
 * doubled — which is the rendering bug this direction is accused of being, drawn on
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
 * The frame, with what it replaced still over it.
 *
 * The current render is the frame — opaque, in the flow, exactly what the canvas
 * would draw with no agent anywhere. The ghost is a sibling on top of it and touches
 * nothing: no filter, no colour, no border. It is the design's own previous state in
 * the design's own colours, which is why this direction spends no accent. The thread
 * colour is the human's selection and a memory of the frame is not a mark on it.
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
