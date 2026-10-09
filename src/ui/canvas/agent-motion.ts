import { useEffect, useRef, useState } from "react";
import { useStillness } from "./stillness";

/**
 * How long a float or a fade takes to leave, matching `--animate-agent-float-out`,
 * `--animate-agent-drop-out` and `--animate-agent-fade-out` in `ui.css` (#364).
 */
export const FLOAT_OUT_MS = 120;
export const FADE_OUT_MS = 160;

/**
 * Whether something that comes and goes is drawn, and how (#364).
 *
 * Nothing in the rail shows or hides in one frame: a thing that is asked to go stays
 * mounted for its exit, drawn `leaving`, and only then unmounts. A thing asked back while
 * it leaves is simply `open` again. Null is gone. Where stillness was asked for the exit
 * is a cut, so it goes at once.
 */
export function useLeaving(open: boolean, ms: number = FLOAT_OUT_MS): "open" | "leaving" | null {
	const still = useStillness();
	const [leaving, setLeaving] = useState(false);
	const was = useRef(open);
	useEffect(() => {
		const before = was.current;
		was.current = open;
		if (open || !before || still) {
			setLeaving(false);
			return;
		}
		setLeaving(true);
		const timer = setTimeout(() => setLeaving(false), ms);
		return () => clearTimeout(timer);
	}, [open, ms, still]);
	if (open) return "open";
	if (still) return null;
	// the frame the close lands on is already the first frame of the exit
	return leaving || was.current ? "leaving" : null;
}

/**
 * The last value something showed, kept while it leaves: a list or a popover on its way
 * out draws what it held rather than going blank under the exit.
 */
export function useHeld<T>(value: T | null | undefined): T | null {
	const held = useRef<T | null>(null);
	if (value !== null && value !== undefined) held.current = value;
	return held.current;
}

/**
 * The agent on the canvas, in motion (#366): the numbers `design/frames/explore/agent-rail/marks/legend`
 * settled, for the parts the layer drives itself. The keyframed parts read the same numbers off
 * `ui.css`, whose `--animate-agent-arrive` and the rest carry them.
 */
export const MOTION = {
	/** grows from 40% where the agent first acts */
	arrive: 260,
	/** between places, on a low arc */
	travel: 420,
	/** from the name row to the changed block's corner */
	hop: 250,
	/** the picture wipes down, the companion riding its edge */
	drawIn: 720,
	/** four corners fly out of the docked companion, and fold back in */
	cornersOut: 220,
	cornersIn: 150,
	/** one soft lift on the picture: up, then drained */
	flashUp: 80,
	flashDown: 450,
	/** its slide down the frame's left wall while it reads */
	read: 700,
	/** how long a changed block stays ringed before the companion lets go of it */
	holdEdit: 1200,
	/** dims to 45% this long after its last call, over `idle` */
	idleAfter: 2000,
	idle: 400,
	/** shrinks to 60% and fades where it stopped */
	leave: 400,
	/** each streamed line grows from its indent */
	lineIn: 180,
	/** a designer's real source runs into its tile when its file lands, before the picture draws */
	replay: 1000,
	/** name brightens, unseen dot in */
	landed: 300,
	/** the companion opens into the waiting ring, the ask unfolds under it */
	ringOpen: 320,
	/** the ring, while it waits on you */
	breathe: 2400,
} as const;

/** the house curves, as cubic-bezier control points */
export const EASE = {
	out: [0.22, 0.61, 0.36, 1],
	snap: [0.32, 0.72, 0, 1],
	inOut: [0.65, 0, 0.35, 1],
} as const;

/** a cubic-bezier easing as a function of progress, solved for x by bisection */
export function curve([x1, y1, x2, y2]: readonly [number, number, number, number]): (t: number) => number {
	const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
	return (t) => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		let lo = 0;
		let hi = 1;
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (at(x1, x2, mid) < t) lo = mid;
			else hi = mid;
		}
		return at(y1, y2, (lo + hi) / 2);
	};
}
