import { useRemembered } from "../remembered";

/**
 * How wide a rail is, and where it is allowed to stop.
 *
 * Both rails had this vocabulary and neither shared it: the pages navigator and the agent
 * rail each declared the same strip, floor, ceiling and two thresholds, and each held the
 * width in a bare `useState` that a reload threw away. They are mirror images in only one
 * respect — which arrow key opens which, because one is on the left and one is on the right
 * — and that stayed with them. Everything a width *is* is here.
 *
 * The two positions a settled rail can be in are the strip and the panel. There is nothing
 * between `STRIP_WIDTH` and `MIN_WIDTH`, and that gap is the point: a rail is either a
 * column you read or an edge you press, and the drag picks whichever the hand was nearer.
 */

/** shut: an edge with the one control that opens it */
export const STRIP_WIDTH = 44;
/** the narrowest a rail may be while it is still a rail */
export const MIN_WIDTH = 200;
export const MAX_WIDTH = 480;
/** let go below this and the rail shuts rather than sitting at an unusable width */
export const SNAP_BELOW = 144;
/** at or under this the rail draws as the strip: it is shut, whatever the number says */
export const COLLAPSED_BELOW = 72;

/** where a rail lands when the hand lets go of it */
export const settledWidth = (latest: number): number =>
	latest < SNAP_BELOW ? STRIP_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, latest));

/**
 * Whether a remembered number is a width this rail could actually be in.
 *
 * The guard is the strict one on purpose (`remembered.ts` explains why): a stored width is
 * trusted by a component that will lay itself out with it, and the gap between the strip and
 * the floor is a real part of the vocabulary, so a value inside that gap is not a narrow
 * rail — it is a shape this app never puts a rail in, and it is discarded rather than
 * clamped into range.
 */
export const isRailWidth = (value: unknown): value is number =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	(value === STRIP_WIDTH || (value >= MIN_WIDTH && value <= MAX_WIDTH));

/**
 * A rail's width, remembered across reloads.
 *
 * `panel` is where the rail opens to and what a browser that has never been dragged gets.
 * It differs per rail — 248 for the pages navigator, 420 for the agent — which is why it is
 * an argument rather than a constant here.
 */
export function useRailWidth(key: string, panel: number): [number, (next: number) => void] {
	return useRemembered(`rail.${key}.width`, panel, isRailWidth);
}
