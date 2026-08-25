/**
 * The boot curtain's clock (#244): when the curtain is allowed on screen, how
 * little it may stay for, and how it leaves.
 *
 * The curtain says nothing about the project. It knows nothing about it: where
 * the frames sit, what they are called and how many there are all arrive with
 * `/frames`, which is most of the wait. So what stands in the meantime is the
 * mark, winding on and off, and the numbers here are the whole of its timing.
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
 * mark fading out of its own fade-in. Measured against the dev daemon this is
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
