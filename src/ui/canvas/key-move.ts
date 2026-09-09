import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { SourcePropertyGroupValue } from "../../source-property-group";
import type { Refusal } from "./hand-edit";
import {
	authoredSpelling,
	type Offset,
	RESIZE_PROPERTIES,
	type ResizeProperty,
	resizeFields,
	type SizeWrite,
} from "./hand-resize";
import type { PickedSelection } from "./overlays";
import type { ElementSizing } from "./protocol";

/**
 * Moving the held element with the arrow keys (#308).
 *
 * One press means one of two different things, and only the document knows
 * which: an element the file already places freely moves by a pixel, and an
 * element the parent lays out moves one place along the row it is in. Both are
 * one gesture for as long as the key is down, which is one save and one press
 * of undo however many times the key repeated.
 *
 * A move never invents a placement. A normal-flow element is not given offsets,
 * an axis the parent layout names none for refuses by name, and siblings
 * without stable identities refuse before anything is written, because two of
 * them changing places would take each other's running state with them.
 */

/** What every gesture knows from its first press, whatever it turns out to be. */
interface Pressed {
	key: string;
	pick: PickedSelection;
	/** presses so far, one place each, forward positive */
	presses: number;
	/** what those presses asked for in pixels: one or ten each */
	pixels: number;
	horizontal: boolean;
	/** the release that arrived before the document answered */
	ended: boolean | null;
}

type KeyMove =
	| (Pressed & { kind: "asking" })
	| (Pressed & {
			kind: "nudge";
			properties: readonly ResizeProperty[];
			offset: Offset;
			writes: Record<ResizeProperty, SizeWrite>;
	  })
	/** a reversed flex row or column draws the authored order backwards */
	| (Pressed & { kind: "reorder"; reversed: boolean })
	| (Pressed & { kind: "refused" });

export interface KeyMoveCanvas {
	/** the one element the arrows belong to, or nothing where they belong to the frames */
	held: () => PickedSelection | undefined;
	/** a source operation already in flight, which an arrow must not join */
	busy: () => boolean;
	askSizing: (frame: string, selector: string, apply: (sizing: ElementSizing | null) => void) => void;
	openRingWrite: (pick: PickedSelection, fields: readonly { property: string; scope: string }[]) => void;
	sampleRingWrite: (value: SourcePropertyGroupValue) => void;
	closeRingWrite: (commit: boolean) => void;
	showRefusal: (frame: string, selector: string, refusal: Refusal) => void;
	clearRefusal: () => void;
	move: (pick: PickedSelection, steps: number, action: string) => void;
	/** the held rung's own read: what the file writes a placement in, and the project's step */
	ring: RefObject<{ className: string; step: number }>;
}

export function useKeyMove(canvas: KeyMoveCanvas): {
	moveElement: (event: KeyboardEvent, step: number) => boolean;
	finishKeyMove: (commit: boolean) => void;
} {
	const at = useRef(canvas);
	at.current = canvas;
	const gesture = useRef<KeyMove | null>(null);

	/** One sample of a held arrow, in the element's own authored placement. */
	const sample = useCallback(() => {
		const held = gesture.current;
		if (held === null || held.kind !== "nudge") return;
		at.current.sampleRingWrite({
			kind: "fields",
			changes: resizeFields(
				held.properties,
				{ w: 0, h: 0 },
				{ x: held.horizontal ? held.pixels : 0, y: held.horizontal ? 0 : held.pixels },
				held.offset,
				at.current.ring.current.step,
				held.writes,
			).map((change) => ({ ...change, scope: "" })),
		});
	}, []);

	/** Where a held arrow ends: one save for the whole of it, or nothing at all. */
	const finishKeyMove = useCallback((commit: boolean) => {
		const held = gesture.current;
		if (held === null) return;
		// a release that beats the document's answer is remembered, not lost
		if (held.kind === "asking") {
			held.ended = commit;
			return;
		}
		gesture.current = null;
		if (held.kind === "nudge") {
			at.current.closeRingWrite(commit && held.pixels !== 0);
			return;
		}
		if (held.kind !== "reorder" || !commit || held.presses === 0) return;
		const steps = held.reversed ? -held.presses : held.presses;
		if (at.current.busy()) return;
		const places = Math.abs(steps);
		at.current.move(
			held.pick,
			steps,
			`move this element ${steps > 0 ? "after" : "before"} ${places === 1 ? "its neighbour" : `${places} of its siblings`}`,
		);
	}, []);
	const finish = useRef(finishKeyMove);
	finish.current = finishKeyMove;

	/** What the document says this element is, which decides what an arrow does to it. */
	const open = useCallback(
		(opened: Pressed & { kind: "asking" }) => {
			const { pick, horizontal } = opened;
			at.current.askSizing(pick.frame, pick.selector, (sizing) => {
				// the gesture this answer belongs to, not whichever one is current when
				// it lands: a second arrow pressed while the document is still thinking
				// opens its own gesture, and the older answer is about the older one
				if (gesture.current !== opened) return;
				const { ended } = opened;
				const refuse = (code: Refusal["code"], says: string) => {
					gesture.current = { ...opened, kind: "refused" };
					at.current.showRefusal(pick.frame, pick.selector, { code, says });
				};
				if (sizing === null) {
					gesture.current = null;
					return;
				}
				if (sizing.free) {
					const property: ResizeProperty = horizontal ? "left" : "top";
					const placed = horizontal ? sizing.offset.left : sizing.offset.top;
					if (placed === null)
						refuse("authored-unit", `this element has no ${property} of its own for a key to move`);
					else {
						const spelling = authoredSpelling(
							at.current.ring.current.className,
							RESIZE_PROPERTIES[property].family,
							sizing.units,
						);
						if (spelling.kind === "refused") refuse("authored-unit", spelling.says);
						else {
							gesture.current = {
								...opened,
								kind: "nudge",
								properties: [property],
								offset: { left: sizing.offset.left ?? 0, top: sizing.offset.top ?? 0 },
								writes: {
									[property]: spelling.kind === "pixels" ? { unit: "px", per: 1 } : spelling,
								} as Record<ResizeProperty, SizeWrite>,
							};
							at.current.openRingWrite(pick, [{ property, scope: "" }]);
							sample();
						}
					}
				} else if (sizing.flow.axis !== (horizontal ? "row" : "column"))
					refuse("source", "the parent layout decides this position; use its alignment or spacing");
				else gesture.current = { ...opened, kind: "reorder", reversed: sizing.flow.reversed };
				if (ended !== null) finish.current(ended);
			});
		},
		[sample],
	);

	/**
	 * One arrow press on the held element. A different key ends the gesture the
	 * last one opened, so each key is its own save.
	 */
	const moveElement = useCallback(
		(event: KeyboardEvent, step: number): boolean => {
			const pick = at.current.held();
			if (pick === undefined || pick.generated) return false;
			const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
			const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
			if (gesture.current !== null && gesture.current.key !== event.key) finishKeyMove(true);
			const pixels = (forward ? 1 : -1) * step;
			const held = gesture.current;
			if (held !== null && held.key === event.key) {
				if (held.kind === "refused") return true;
				held.presses += forward ? 1 : -1;
				held.pixels += pixels;
				sample();
				return true;
			}
			if (at.current.busy()) return true;
			const opened: Pressed & { kind: "asking" } = {
				key: event.key,
				pick,
				kind: "asking",
				presses: forward ? 1 : -1,
				pixels,
				horizontal,
				ended: null,
			};
			gesture.current = opened;
			at.current.clearRefusal();
			open(opened);
			return true;
		},
		[finishKeyMove, open, sample],
	);

	/**
	 * The release that ends one. Every arrow answers here, including the one a
	 * different key already completed, and a window that loses focus mid-hold
	 * cancels rather than saving a move nobody finished asking for.
	 */
	useEffect(() => {
		const up = (event: KeyboardEvent) => {
			if (gesture.current?.key === event.key) finish.current(true);
		};
		const cancel = () => finish.current(false);
		window.addEventListener("keyup", up);
		window.addEventListener("blur", cancel);
		return () => {
			window.removeEventListener("keyup", up);
			window.removeEventListener("blur", cancel);
		};
	}, []);

	return { moveElement, finishKeyMove };
}
