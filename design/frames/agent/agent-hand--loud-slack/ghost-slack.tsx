import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The ghost, on the clock the canvas is supposed to run on.
 *
 * `agent-hand--ghost` decided the mechanism and this changes none of it: the layer is
 * handed the same component at two revisions, draws the older over the newer at 0.3,
 * and lets them cancel — which they do exactly, everywhere the write did not reach,
 * because the same component with the same props makes the same pixels. No diff is
 * computed anywhere. The peak is a cap rather than a crossing, so the composite is a
 * plain lerp and there is never a moment where two designs are on screen at equal
 * strength, which is the moment that reads as a broken re-render.
 *
 * **`agent-hand--ghost-loud` turned this file's constant inside out and it is turned
 * back.** The compile drew three ghosts, one per photograph, and concluded that 420ms
 * sat twenty times inside its own ceiling because the real interval between two
 * photographs is 12.3s and 8.6s. That was a fact about the photograph clock. On the
 * write clock there are thirteen ghosts again, the ceiling is the shortest interval
 * between two writes — **573ms**, writes three and four of the first run at 8,758 and
 * 9,331 — and 420 clears it by 153ms with two ghosts never alive at once. The parent's
 * arithmetic was right the whole time, and what made it look absurd was the clock.
 *
 * **What did not come back is the loudness, and it went the wrong way.** The compile
 * measured its worst ghost at 57.8% of the frame's area doubled, one ghost carrying a
 * whole run of three writes, and called it the moment a person reads a rendering
 * fault. Measured per write over the same thirteen, the worst is **write 11 at
 * 61.7%** — the headline gaining a line and pushing four blocks down the page. It is
 * *larger* than the run that contains it, and the reason is worth having: run 3 is
 * writes 11, 12 and 13, and write 12 crops the hero by 26px, so the run partly undoes
 * its own reflow before anybody photographs it. **A per-write ghost never gets that
 * cancellation.** Firing more often did not make each firing quieter.
 *
 * The rest of the thirteen are small: nine of them are under 10% and the median is
 * 9.0%. So the distribution is one bad case, one 42.9%, one 41.3%, and ten that a
 * reader would have to be looking for. The cap is what keeps write 11 a statement
 * rather than a fault, and it is doing more work here than the compile credited it
 * with.
 *
 * **The one thing the covered regime made cheaper is gone with it.** Below
 * `LIVE_MIN_CSS_PX` the shell already puts a frame's stored cover over it and fades it
 * out over 180ms, so a ghost there is that layer held at 0.3 and nothing else. Above
 * it there is a live iframe and the parent's own engineering bill is back: an edit
 * reboots the document with no overlap window, so a pixel-exact previous state means
 * holding the outgoing iframe mounted and frozen for the length of the ghost. This
 * frame draws the live regime, so it is drawing the expensive one.
 */

/** the old render's ceiling, and its only strength */
const PEAK = 0.3;
/** held at the cap, then gone: the parent's 140 + 280, measured against 573 and clear of it */
const HOLD_MS = 140;
const LEAVE_MS = 280;
export const GHOST_MS = HOLD_MS + LEAVE_MS;

/**
 * Out fast, then a tail nobody can see. Most of the 0.3 is shed inside the first 90ms
 * of the leave, so the ghost is perceptually about a fifth of a second even though it
 * is on screen for 420ms — which is what keeps it from being something a person can
 * stop and stare at, and staring is where a ghost turns into a bug.
 */
export const LEAVE = [0.33, 1, 0.68, 1] as const;

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
