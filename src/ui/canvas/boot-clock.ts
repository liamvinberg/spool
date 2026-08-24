/**
 * The boot curtain's clock and its hand (#244): when the curtain is allowed on
 * screen, and how the thread runs while it is there.
 *
 * The curtain says nothing about the project. It knows nothing about it — where
 * the frames sit, what they are called and how many there are all arrive with
 * `/frames`, which is most of the wait. So what stands in the meantime is the
 * mark's own thread, and the only thing that varies is how it travels.
 */

/**
 * How long the daemon may take before the curtain is allowed to draw anything.
 *
 * Measured on this machine against the largest real project (130 frames): the
 * canvas mounts around 230ms into the navigation and `/frames` replies around
 * 240ms after that, so a warm boot spends a fraction of a second here and a
 * daemon busy resolving flows has been seen to spend five seconds. The gate is
 * what keeps the fast boot from flashing something nobody asked to see.
 */
export const GATE_MS = 160;
/** the curtain arriving, once the gate has passed */
export const ENTER_MS = 180;
/**
 * The least time a curtain that did appear stays on screen before it starts to
 * leave. The gate alone leaves a band where the projection lands a few
 * milliseconds after the curtain is allowed to draw, and what that renders is a
 * thread fading out of its own fade-in. Measured against the dev daemon this is
 * not hypothetical: a cold boot did exactly that. It is deliberately longer
 * than the entrance, so the fade out never starts before the fade in finished.
 */
export const MIN_SHOWN_MS = 200;

/**
 * The curtain leaving. It fades *across* the frames rather than holding them
 * back: the canvas underneath is already real from the moment the projection
 * lands, and withholding it to protect the curtain's exit would be the worse
 * trade every time.
 */
export const EXIT_MS = 400;

/**
 * Where the curtain is. `waiting` and `gone` both draw nothing, and they are
 * different states: a boot that answers inside the gate goes straight from one
 * to the other, having never drawn a pixel.
 */
export type Curtain = "waiting" | "showing" | "leaving" | "gone";

export type CurtainSignal = "gate" | "ready" | "exited";

/** A curtain only ever moves forward, so a late signal cannot raise it again. */
export function nextCurtain(phase: Curtain, signal: CurtainSignal): Curtain {
	switch (signal) {
		case "gate":
			return phase === "waiting" ? "showing" : phase;
		case "ready":
			if (phase === "waiting") return "gone";
			return phase === "showing" ? "leaving" : phase;
		case "exited":
			return phase === "leaving" ? "gone" : phase;
	}
}

/** One way the thread travels: a cycle length and the curve it travels on. */
export interface ThreadMotion {
	readonly name: string;
	readonly durationMs: number;
	readonly easing: string;
}

/**
 * The four hands the thread is drawn by, one picked per boot.
 *
 * The path never changes, because the path is the mark. What changes is the
 * pace: a loader a person meets several times a day wears a groove, and the
 * same 1.9 seconds every time is what makes the wait feel like the same wait.
 * These are far enough apart to read as different and close enough together
 * that none of them is a surprise.
 */
export const THREAD_MOTIONS: readonly ThreadMotion[] = [
	/** the default hand: the thread breathing through the wave */
	{ name: "drift", durationMs: 1900, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
	/** unvarying, the way thread comes off a spool that is turning */
	{ name: "reel", durationMs: 1500, easing: "linear" },
	/** slow at the ends and quick through the middle, like a thread being pulled taut */
	{ name: "catch", durationMs: 2200, easing: "cubic-bezier(0.85, 0, 0.15, 1)" },
	/** away fast and settling long, the slack running out */
	{ name: "slack", durationMs: 2600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
];

/**
 * The hand for one boot, from a number in [0, 1).
 *
 * Taking the roll as an argument rather than rolling inside is what makes this
 * testable, and it is also what keeps the pick stable for the life of a curtain:
 * the caller rolls once at mount and the motion never changes underneath a
 * running animation.
 */
export function pickMotion(roll: number): ThreadMotion {
	const first = THREAD_MOTIONS[0];
	if (first === undefined) throw new Error("the thread needs at least one motion");
	if (!Number.isFinite(roll)) return first;
	const index = Math.min(THREAD_MOTIONS.length - 1, Math.max(0, Math.floor(roll * THREAD_MOTIONS.length)));
	return THREAD_MOTIONS[index] ?? first;
}
