/**
 * The settle transition (#210): the beats inline play flies in on, and the
 * curve the camera follows while it does. Prototyped as `play-inline--settle`
 * in `design/`, where the three characters were compared live.
 *
 * Three beats rather than one. The app's furniture dissolves first — the top
 * bar, the sidebar, the agent rail, the tools, and the frame labels together —
 * and the canvas takes the whole window as it goes. That is what lets the
 * flight cross where the rails were instead of sliding under them, and it is
 * why the labels have to go: a counter-scaled 12px label cannot ride a zoom
 * that grows its frame to fill the window.
 *
 * Then the camera flies, on the canvas camera's own ease-out, and stops three
 * per cent short. Then that last three per cent drifts home while the stage
 * fades in around the frame, and the pill arrives once nothing is moving.
 *
 * The tail is the one place this does not use the camera's own curve: an
 * ease-out leaves its last segment at full speed, and a second ease-out after a
 * near-stop reads as a bump. The drift is a smoothstep, so it leaves slowly and
 * arrives slowly.
 */

/** The camera's own easing (`canvas.tsx` animateCamera): cubic ease-out. */
export const OUT = (p: number): number => 1 - (1 - p) ** 3;

/** The tail: slow out of the near-stop, slow into the landing. */
export const DRIFT = (p: number): number => p * p * (3 - 2 * p);

/** How far the flight gets before it stops short. */
export const FLIGHT_SHORT = 0.97;

/** The share of the flight spent covering that first 97%. */
export const FLIGHT_SPLIT = 0.57;

/** Every beat of the way in, in milliseconds from the press. */
export const PLAY_IN = {
	/** The furniture dissolves before anything moves, and the canvas takes the window. */
	chrome: 120,
	/** The camera leaves once it has. */
	start: 120,
	/** And is home this long after leaving. */
	fly: 600,
	/**
	 * The stage closes in around the frame, and its own fade is the dim: held
	 * back this long so one beat of canvas going quiet is visible on the way in.
	 */
	stageAt: 480,
	stage: 280,
	/** The pill last, once nothing is moving. */
	pillAt: 680,
	pill: 200,
} as const;

/**
 * Coming back is not staged: the arrival was the point, the departure is not.
 *
 * The one thing it does keep is the order. The furniture only comes back once
 * the camera has stopped — `chromeAt` is exactly `flyAt + fly` — because a
 * sidebar fading in over a canvas still moving under it is the same seam the
 * way in exists to avoid, just run backwards.
 */
export const PLAY_OUT = {
	pill: 110,
	stageAt: 60,
	stage: 240,
	flyAt: 80,
	fly: 500,
	chromeAt: 580,
	chrome: 220,
} as const;

/** When the canvas gives the window back and returns to its own box. */
export const PLAY_OUT_LANDS = PLAY_OUT.flyAt + PLAY_OUT.fly;

/**
 * The staged flight as one easing function: `p` is how much of the flight's
 * time has passed, the answer is how much of the distance is behind you. Two
 * segments, and the seam sits at exactly 97% so neither side of it has a
 * discontinuity to smooth over.
 */
export function flightProgress(p: number): number {
	const t = Math.min(1, Math.max(0, p));
	if (t <= FLIGHT_SPLIT) return FLIGHT_SHORT * OUT(t / FLIGHT_SPLIT);
	return FLIGHT_SHORT + (1 - FLIGHT_SHORT) * DRIFT((t - FLIGHT_SPLIT) / (1 - FLIGHT_SPLIT));
}
