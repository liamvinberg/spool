/**
 * The curves the third wave is built on.
 *
 * Wave two lost on feel rather than on concept, so the timings stop being a
 * per-frame decision here. Four rules, and every take on the `throw--` rows
 * obeys them:
 *
 * 1. Nothing that answers a pointer takes longer than 120ms. A look is free
 *    only if it lands inside the movement that asked for it.
 * 2. Content swaps crossfade on a linear curve. Two renders of the same card
 *    share most of their pixels, so a linear crossfade dissolves the block that
 *    changed and leaves the rest looking untouched; an eased one shimmers.
 * 3. Springs are for things with mass — a card you dragged, a pill that slid,
 *    a menu that came out from under the pointer. Nothing springs just to look
 *    alive.
 * 4. Leaving is faster than arriving. You already know what is coming back.
 */

/** arrivals: out-expo, the curve that lands rather than glides */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** the one curve for anything that has to go both ways */
export const EASE_BOTH: [number, number, number, number] = [0.65, 0, 0.35, 1];

/** a candidate becoming another candidate, in the same pixels */
export const SWAP_IN = { duration: 0.1, ease: "linear" as const };
export const SWAP_OUT = { duration: 0.08, ease: "linear" as const };

/** an outline, a veil, a hint: it is either there or it is not */
export const MARK = { duration: 0.07, ease: "linear" as const };

/** a marker that slid from one place to another */
export const PILL = { type: "spring" as const, stiffness: 640, damping: 44, mass: 0.6 };

/** something you let go of, coming to rest */
export const SETTLE = { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.9 };

/** something you pulled out from under the pointer */
export const POP = { type: "spring" as const, stiffness: 520, damping: 36, mass: 0.65 };

/** where a flick would have ended, so a scrub settles where the hand aimed */
export function project(position: number, velocity: number, decay = 0.09): number {
	return position + velocity * decay;
}

/** the index a scrub landed on, clamped to the set rather than wrapped */
export function nearest(offset: number, pitch: number, length: number): number {
	const raw = Math.round(offset / pitch);
	return Math.min(length - 1, Math.max(0, raw));
}

/** the angle a marking menu was flicked at, in degrees from straight up */
export function bearing(dx: number, dy: number): number {
	const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
	return deg < 0 ? deg + 360 : deg;
}
