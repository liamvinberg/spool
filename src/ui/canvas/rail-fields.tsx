import {
	createContext,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import { cn } from "../cn";
import { NumberField } from "../primitives/inputs";
import { PropertyRow } from "../primitives/structure";

/**
 * The rail's controls (#258): a scrubbing row and a number box, which is
 * all the frame's own geometry needs.
 *
 * A field is chrome-less until the pointer is on it, so the rail reads as a
 * list of values rather than as a wall of boxes.
 */

/** Shared app roles for the rail's values and asides */
export const VALUE = "type-value";

/** How far the pointer travels for one step of a scrub. */
const SCRUB_PX = 4;

/**
 * One sample of a scrub: the whole steps the pointer crossed, and the pixels
 * left over for the sample after it.
 *
 * The leftovers are what make it continuous. A number moves in whole steps, so
 * a sample shorter than one has to be carried rather than dropped, or most of
 * a slow drag never happens. Shift is read per sample and multiplies only the
 * steps that sample sends, so taking it up mid-drag slows the rest of the
 * gesture down instead of rescaling what has already been written.
 */
export function scrubStep(carried: number, movement: number, coarse: boolean): { carry: number; units: number } {
	const together = carried + movement;
	const steps = Math.trunc(together / SCRUB_PX);
	return { carry: together - steps * SCRUB_PX, units: steps * (coarse ? 10 : 1) };
}

/**
 * The scrub of the row a field is drawn in (#321).
 *
 * The gesture belongs to the row, which is what knows the value and how it
 * steps; the number itself is the thing a hand reaches for. So the row hands
 * its press down rather than every number box growing an argument for it, and
 * a box in a row with nothing to scrub gets nothing.
 */
const RowScrub = createContext<((event: ReactPointerEvent<HTMLElement>) => void) | null>(null);

/* ---------- the row ---------- */

/** a property row whose label scrubs its number */
export function Row({
	name,
	onScrub,
	onScrubEnd,
	onScrubCancel,
	children,
}: {
	name: string;
	/** a numeric row: dragging the label or the field steps the value by the units crossed */
	onScrub?: ((units: number) => void) | undefined;
	/** the pointer let go: whatever the scrub was making is done being made */
	onScrubEnd?: (() => void) | undefined;
	onScrubCancel?: (() => void) | undefined;
	children: ReactNode;
}) {
	const cancelScrub = useRef<(() => void) | null>(null);
	const callbacks = useRef({ onScrub, onScrubEnd, onScrubCancel });
	useLayoutEffect(() => {
		callbacks.current = { onScrub, onScrubEnd, onScrubCancel };
	});
	const scrubbable = onScrub !== undefined;
	useEffect(() => {
		if (!scrubbable) cancelScrub.current?.();
		return () => cancelScrub.current?.();
	}, [scrubbable]);
	const down = (event: ReactPointerEvent<HTMLElement>) => {
		if (!scrubbable || event.button !== 0 || cancelScrub.current !== null) return;
		const target = event.currentTarget,
			doc = target.ownerDocument;
		// A field takes the press as well: it is focused and its caret placed,
		// exactly as a click on it always was, and only a pointer that travels
		// turns into a scrub. The label has nothing to focus, so its press is
		// the gesture whole, and preventing the default keeps a drag across it
		// from selecting the words of the row.
		const field = target.tagName === "INPUT";
		if (!field) event.preventDefault();
		const pointer = event.pointerId;
		let at = event.clientX,
			carry = 0,
			started = false,
			asked = false,
			pending = false,
			locked = false,
			finished = false;
		const finish = (canceled: boolean) => {
			if (finished) return;
			finished = true;
			cancelScrub.current = null;
			doc.removeEventListener("pointermove", move, true);
			doc.removeEventListener("pointerup", up, true);
			doc.removeEventListener("pointercancel", cancelPointer, true);
			doc.defaultView?.removeEventListener("keydown", key, true);
			target.removeEventListener("lostpointercapture", lostCapture);
			doc.defaultView?.removeEventListener("blur", cancel);
			try {
				if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
			} catch {
				/* The document listeners also work when capture is unavailable. */
			}
			// a lock still on its way is given up when it arrives, so a scrub that
			// ended first never leaves the pointer hidden
			if (doc.pointerLockElement === target) doc.exitPointerLock?.();
			else if (!pending) unlisten();
			if (!started) return;
			if (canceled) callbacks.current.onScrubCancel?.();
			else callbacks.current.onScrubEnd?.();
		};
		/**
		 * Past the first whole step the pointer belongs to the number.
		 *
		 * The drag is measured in movement all the way through, granted or not,
		 * so the scrub is the same gesture either way and starts at the
		 * threshold rather than when an answer arrives (#322). Granted, it also
		 * never runs out of screen: a width goes on growing past the edge of the
		 * display for as long as the hand keeps moving. Escape gives the lock
		 * back without the page hearing the key, so losing it is how a locked
		 * scrub is called off.
		 */
		const unlisten = () => {
			doc.removeEventListener("pointerlockchange", locking, true);
			doc.removeEventListener("pointerlockerror", refused, true);
		};
		const lock = () => {
			if (typeof target.requestPointerLock !== "function") return;
			asked = true;
			pending = true;
			doc.addEventListener("pointerlockchange", locking, true);
			doc.addEventListener("pointerlockerror", refused, true);
			try {
				const answer: unknown = target.requestPointerLock();
				if (answer instanceof Promise) answer.catch(() => {});
			} catch {
				/* a browser that will not lock: the drag stays on the screen it has */
			}
		};
		/** The browser will not lock, which the drag on `movementX` does not need. */
		const refused = () => {
			pending = false;
			if (finished) unlisten();
		};
		const locking = () => {
			pending = false;
			const now = doc.pointerLockElement === target;
			if (finished) {
				if (now) doc.exitPointerLock?.();
				else unlisten();
				return;
			}
			if (locked && !now) {
				cancel();
				return;
			}
			locked = now;
		};
		const move = (next: PointerEvent) => {
			if (next.pointerId !== pointer || finished) return;
			// movement first: under a lock the pointer stays where it was, and a
			// browser that reports none leaves the position to say what moved
			const moved = next.movementX || next.clientX - at;
			at = next.clientX;
			const step = scrubStep(carry, moved, next.shiftKey);
			carry = step.carry;
			if (step.units === 0) return;
			if (!started) {
				started = true;
				lock();
			}
			callbacks.current.onScrub?.(step.units);
		};
		const up = (next: PointerEvent) => {
			if (next.pointerId === pointer) finish(false);
		};
		const cancelPointer = (next: PointerEvent) => {
			if (next.pointerId === pointer) finish(true);
		};
		/**
		 * The capture is gone. Engaging the lock is what takes it here (#322) —
		 * this gesture's own doing, and not the pointer being taken away — so
		 * once the lock has been asked for, the loss says nothing.
		 */
		const lostCapture = (next: PointerEvent) => {
			if (!asked) cancelPointer(next);
		};
		const cancel = () => finish(true);
		const key = (next: KeyboardEvent) => {
			if (next.key !== "Escape") return;
			next.preventDefault();
			next.stopPropagation();
			cancel();
		};
		cancelScrub.current = cancel;
		// Captured, so nothing that stops a move bubbling on its way up can lose the scrub.
		doc.addEventListener("pointermove", move, true);
		doc.addEventListener("pointerup", up, true);
		doc.addEventListener("pointercancel", cancelPointer, true);
		doc.defaultView?.addEventListener("keydown", key, true);
		target.addEventListener("lostpointercapture", lostCapture);
		doc.defaultView?.addEventListener("blur", cancel);
		try {
			target.setPointerCapture(pointer);
		} catch {
			/* Keep the document fallback. */
		}
	};
	return (
		<PropertyRow
			data-properties-row={name}
			label={
				<span
					data-scrub=""
					onPointerDown={down}
					className={cn("block truncate select-none", scrubbable && "cursor-ew-resize hover:text-primary")}
				>
					{name}
				</span>
			}
		>
			<RowScrub.Provider value={scrubbable ? down : null}>{children}</RowScrub.Provider>
		</PropertyRow>
	);
}

/* ---------- a number the frame's own file holds ---------- */

/**
 * The properties panel's number: the system's quiet NumberField, which a row
 * can scrub. Arrows step the way the row's scrub does with the pointer.
 */
export function NumField({
	value,
	readout,
	onCommit,
	onStep,
}: {
	value: number;
	/** what the number measures: `px` */
	readout?: string | undefined;
	onCommit: (typed: number) => void;
	/** whole units, signed: arrows send 1, shift sends 10 */
	onStep: (units: number) => void;
}) {
	const scrub = useContext(RowScrub);
	return (
		<NumberField
			className="flex-1"
			value={value}
			unit={readout}
			onValueChange={onCommit}
			onStep={onStep}
			inputProps={{
				// the number is the thing a hand reaches for: a press on it scrubs
				// the row's own value the moment the pointer travels (#321)
				...(scrub === null ? {} : { onPointerDown: scrub }),
				onDragStart: (event) => {
					// Native dragging of the selected number cancels the scrub's pointer on Linux.
					if (scrub !== null) event.preventDefault();
				},
				// the canvas's own keys stay out of a number being typed
				onKeyDown: (event) => event.stopPropagation(),
			}}
		/>
	);
}

/* ---------- where a popup lands, and when it goes away ---------- */

/**
 * A panel that hangs off a control, placed in the viewport rather than in its
 * row.
 *
 * Fixed because the rail scrolls and its rows sit inside `overflow-y-auto`: a
 * menu positioned in the row would be clipped by it. It opens upwards when it
 * would run off the bottom, because the row it belongs to has to stay in view
 * beside it.
 */
export function popoverAt(rect: DOMRect, width: number, height: number): { left: number; top: number; width: number } {
	const below = rect.bottom + 4;
	const flip = below + height > innerHeight - 8;
	return {
		left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
		top: flip ? Math.max(8, rect.top - 4 - height) : below,
		width,
	};
}

/** A press anywhere outside the panel or the control that opened it closes it. */
export function useCloseOnPressAway(
	open: boolean,
	close: () => void,
	...inside: readonly React.RefObject<HTMLElement | null>[]
): void {
	// the refs are the same list every render at one call site, so the effect
	// turns on `open` alone rather than on an array rebuilt each time
	const held = useRef(inside);
	held.current = inside;
	useEffect(() => {
		if (!open) return;
		const away = (event: Event) => {
			const target = event.target as Node | null;
			if (target !== null && held.current.some((ref) => ref.current?.contains(target) === true)) return;
			close();
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [open, close]);
}
