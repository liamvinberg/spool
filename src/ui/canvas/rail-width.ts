import type { KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

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
 * The strip is a side's rail now (`pane-window.tsx`), always there, so the far end of the
 * range is the side collapsing rather than a width — which is what `onSettle` is for.
 */

/** shut: an edge with the one control that opens it */
export const STRIP_WIDTH = 44;
/** the narrowest a rail may be while it is still a rail */
export const MIN_WIDTH = 200;
export const MAX_WIDTH = 480;
/** let go below this and the rail shuts rather than sitting at an unusable width */
export const SNAP_BELOW = 144;

/**
 * The properties rail's panel width (#256).
 *
 * 300 is what `inspector.tsx` shipped before the agent took the column, and it
 * is what the column can afford beside the strip: two open surfaces do not fit,
 * so the number is chosen against the field it leaves rather than against the
 * rows it holds.
 */
export const PROPERTIES_WIDTH = 300;

/** the pages navigator's panel width */
export const PAGES_WIDTH = 248;

/** where a rail lands when the hand lets go of it */
export const settledWidth = (latest: number): number =>
	latest < SNAP_BELOW ? STRIP_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, latest));

/**
 * The grip on a rail's inner edge, as behaviour rather than as markup (#256).
 *
 * A 12px column with pointer capture on it, arrows that snap to either end, a
 * drag clamped to the range, and a release that settles where the vocabulary
 * says. `side` is which edge of the window the rail stands on, which is all
 * that makes the left and the right mirror images: which way a drag widens it,
 * and which arrow opens it.
 *
 * `dragging` is out here too, because it is what a rail suppresses its width
 * transition on: a transition during a drag is the rail lagging the hand.
 */
export function useRailDrag({
	width,
	side,
	panel,
	onWidth,
	onSettle = onWidth,
	floor = STRIP_WIDTH,
	max = MAX_WIDTH,
}: {
	width: number;
	side: "left" | "right";
	/** what the open arrow settles at */
	panel: number;
	onWidth: (next: number) => void;
	/**
	 * Where the hand let go, when the release is a different act from the move:
	 * the far end of the range can be a side collapsing rather than a width, and
	 * a hand passing through it mid-drag has not decided anything.
	 */
	onSettle?: (next: number) => void;
	/** the narrowest the hand may draw it mid-drag */
	floor?: number;
	/** the widest, which the canvas's own floor can bring in under the ceiling */
	max?: number;
}): { dragging: boolean; grip: RailGrip } {
	const [dragging, setDragging] = useState(false);
	const held = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const opens = side === "left" ? "ArrowRight" : "ArrowLeft";

	const finish = (target: HTMLElement, pointerId: number) => {
		const current = held.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		held.current = null;
		setDragging(false);
		onSettle(settledWidth(Math.min(current.latestWidth, max)));
	};

	return {
		dragging,
		grip: {
			onKeyDown: (event) => {
				// a focused grip answers its own arrows; stop them short of the
				// hotkey dispatch, or the same press would nudge the selection
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				event.stopPropagation();
				onSettle(event.key === opens ? panel : STRIP_WIDTH);
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
				const travel = side === "left" ? event.clientX - current.startX : current.startX - event.clientX;
				const next = Math.min(max, Math.max(floor, current.startWidth + travel));
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
