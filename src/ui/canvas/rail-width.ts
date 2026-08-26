import type { KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";
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

/**
 * The properties rail's panel width (#256).
 *
 * 300 is what `inspector.tsx` shipped before the agent took the column, and it
 * is what the column can afford beside the agent's strip: two open rails do not
 * fit, so the number is chosen against the field it leaves rather than against
 * the rows it holds.
 */
export const PROPERTIES_WIDTH = 300;

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

/**
 * The grip on a rail's inner edge, as behaviour rather than as markup (#256).
 *
 * Both rails carry the same one: a 12px column with pointer capture on it,
 * arrows that snap to either end, a drag clamped to the range, and a release
 * that settles where the vocabulary says. Only the label and the width it opens
 * to differ, so what is shared is handed back as props and each rail draws its
 * own button around them.
 *
 * `dragging` is out here too, because it is what a rail suppresses its width
 * transition on: a transition during a drag is the rail lagging the hand.
 */
export function useRailDrag(
	width: number,
	onWidth: (next: number) => void,
	panel: number,
): { dragging: boolean; grip: RailGrip } {
	const [dragging, setDragging] = useState(false);
	const held = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);

	const finish = (target: HTMLElement, pointerId: number) => {
		const current = held.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		held.current = null;
		setDragging(false);
		onWidth(settledWidth(current.latestWidth));
	};

	return {
		dragging,
		grip: {
			onKeyDown: (event) => {
				// a focused grip answers its own arrows; stop them short of the
				// hotkey dispatch, or the same press would nudge the selection
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				event.stopPropagation();
				if (event.key === "ArrowLeft") onWidth(panel);
				if (event.key === "ArrowRight") onWidth(STRIP_WIDTH);
			},
			onPointerDown: (event) => {
				if (event.button !== 0) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				held.current = { pointerId: event.pointerId, startWidth: width, startX: event.clientX, latestWidth: width };
				setDragging(true);
			},
			onPointerMove: (event) => {
				const current = held.current;
				if (current === null || current.pointerId !== event.pointerId) return;
				const next = Math.min(
					MAX_WIDTH,
					Math.max(STRIP_WIDTH, current.startWidth + current.startX - event.clientX),
				);
				current.latestWidth = next;
				onWidth(next);
			},
			onPointerUp: (event) => finish(event.currentTarget, event.pointerId),
			onPointerCancel: (event) => finish(event.currentTarget, event.pointerId),
		},
	};
}

/** What the grip's own button spreads onto itself; the label and the class are the rail's. */
export interface RailGrip {
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	onPointerDown: (event: PointerEvent<HTMLElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLElement>) => void;
	onPointerUp: (event: PointerEvent<HTMLElement>) => void;
	onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

/** the hairline that lights under the pointer, which both rails draw the same way */
export const GRIP_CLASS = "group -left-1.5 absolute top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none";
export const GRIP_HAIR =
	"absolute top-0 right-[5px] bottom-0 w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread";
