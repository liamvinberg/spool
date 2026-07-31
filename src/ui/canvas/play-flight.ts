/**
 * The settle transition (#210): the beats inline play flies in on, and the
 * curve the camera follows while it does. Prototyped as `play-inline--settle`
 * in `design/`, where the three characters were compared live.
 *
 * Three beats rather than one. The canvas chrome dissolves first, because a
 * counter-scaled 12px label cannot ride a zoom that grows its frame to fill the
 * viewport. Then the camera flies, on the canvas camera's own ease-out, and
 * stops three per cent short. Then that last three per cent drifts home while
 * the stage fades in around the frame, and the pill arrives once nothing is
 * moving any more.
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
	/** The canvas chrome dissolves before anything moves. */
	chrome: 120,
	/** The camera leaves once it has. */
	start: 120,
	/** And is home this long after leaving. */
	fly: 600,
	/** The field of other frames dims behind the flight. */
	fieldAt: 120,
	field: 380,
	/**
	 * The stage closes in around the frame. Held back so one beat of dimmed,
	 * hibernating canvas is visible on the way in.
	 */
	stageAt: 480,
	stage: 280,
	/** The pill last, once nothing is moving. */
	pillAt: 680,
	pill: 200,
} as const;

/** Coming back is not staged: the arrival was the point, the departure is not. */
export const PLAY_OUT = {
	pill: 110,
	stageAt: 60,
	stage: 240,
	flyAt: 80,
	fly: 500,
	chromeAt: 300,
	chrome: 220,
} as const;

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
