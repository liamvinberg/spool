import type { Camera } from "../api";
import type { Box } from "./camera";

/**
 * When a frame counts as looked at.
 *
 * Marks clear by being read, not by being clicked. On a canvas that is the
 * honest gesture: an agent hands you six variations, you zoom to that row and
 * read them, and asking for six clicks on top of that is a chore the medium
 * asks for nowhere else. Pressing a frame clears it too, but pressing is the
 * shortcut rather than the rule.
 *
 * Which means the rule has to be strict enough that "looked at" is true. Two
 * questions, both about the screen rather than the world:
 *
 *   prominence   the frame fills at least half the viewport in one direction.
 *                One direction rather than both, because a phone frame will
 *                never fill a wide window's width and a landing page will never
 *                fill its height, and either one of them can be the thing you
 *                are reading. This is the whole test at ordinary zooms.
 *   wholeness    in each direction, at least half of what could be on screen
 *                is. Without it a frame ten times the viewport passes on a
 *                five-pixel sliver of its edge: prominent across, invisible
 *                down.
 *
 * And time, because on screen is not the same as looked at: a pan that sweeps a
 * row in a fifth of a second leaves every mark standing.
 */

/** How much of the viewport one direction of a frame must fill. */
export const PROMINENCE = 0.5;

/** How much of what could be shown in each direction has to be. */
export const WHOLENESS = 0.5;

/** How long a frame must hold both, in ms. */
export const DWELL_MS = 900;

/** How often the canvas asks. Small enough that dwell is not quantised coarsely. */
export const TICK_MS = 150;

/**
 * How long the canvas keeps counting after the last thing a person did.
 *
 * Frames in view of an empty chair are not being seen, and without this the
 * whole field clears itself overnight — including the frames an agent writes
 * into it while nobody is there, which is the case the mark exists for. Long
 * enough that reading a frame without touching anything still counts.
 */
export const ATTENTION_MS = 30_000;

/** Is this frame being looked at, right now, by a camera on this viewport? */
export function looked(frame: Box, camera: Camera, vw: number, vh: number): boolean {
	if (vw <= 0 || vh <= 0) return false;
	const left = frame.x * camera.k + camera.x;
	const top = frame.y * camera.k + camera.y;
	const w = frame.w * camera.k;
	const h = frame.h * camera.k;
	if (w <= 0 || h <= 0) return false;
	const across = Math.max(0, Math.min(left + w, vw) - Math.max(left, 0));
	const down = Math.max(0, Math.min(top + h, vh) - Math.max(top, 0));
	const whole = across >= Math.min(w, vw) * WHOLENESS && down >= Math.min(h, vh) * WHOLENESS;
	if (!whole) return false;
	return across >= vw * PROMINENCE || down >= vh * PROMINENCE;
}

/**
 * One tick of the dwell clock, mutating the held map and naming what crossed.
 *
 * A frame that leaves the test loses its time rather than banking it: looking
 * twice for half a second each is two glances, not one read.
 */
export function advanceDwell(
	held: Map<string, number>,
	looking: Iterable<string>,
	tick: number = TICK_MS,
	target: number = DWELL_MS,
): string[] {
	const now = new Set(looking);
	for (const name of held.keys()) {
		if (!now.has(name)) held.delete(name);
	}
	const crossed: string[] = [];
	for (const name of now) {
		const total = (held.get(name) ?? 0) + tick;
		held.set(name, total);
		if (total >= target) {
			held.delete(name);
			crossed.push(name);
		}
	}
	return crossed;
}
