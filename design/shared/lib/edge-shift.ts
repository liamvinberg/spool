import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * How far the transcript moved the wrong way, measured rather than asserted.
 *
 * The rule being tested is one sentence: the log may move up as things arrive and it
 * may never move down unless a person opened something. So the instrument watches
 * every entry in the box on every animation frame and records the largest *downward*
 * step any one of them takes between two frames.
 *
 * Four things it does on purpose.
 *
 * **It measures against the box, not the page.** An entry's offset is its top minus
 * the scroll box's own top, so a scroll, a re-layout and a splice are all read the way
 * a person reads them — as the words being somewhere else on screen than they were a
 * sixtieth of a second ago. This is why nothing here subtracts `scrollTop`: the scroll
 * *is* part of the movement.
 *
 * **It only counts entries you could see.** An entry scrolled out of the box can be
 * moved without anybody noticing, and counting it would report a jolt nobody felt. An
 * entry is in when any part of it is inside the box's own bounds, on both frames.
 *
 * **It ignores subpixel.** Sub-half-a-pixel deltas come out of the compositor rounding
 * a height animation and are not motion. The threshold is 0.5px and the worst is
 * reported to a tenth.
 *
 * **It never re-renders at the rate it samples.** The counters live in refs and flush
 * to state five times a second, because a meter that re-rendered the frame sixty times
 * a second would be measuring the load it was adding.
 */

export interface Shift {
	/** the largest single downward step, in px, of anything visible */
	readonly worst: number;
	/** how many frames had one at all */
	readonly moves: number;
	/** frames looked at */
	readonly frames: number;
	/** where the worst one happened, in the log's own words */
	readonly where: string | null;
}

const NONE: Shift = { worst: 0, moves: 0, frames: 0, where: null };

/** a step smaller than this is the compositor rounding, not the layout moving */
const FLOOR = 0.5;

export function useShift(view: RefObject<HTMLElement | null>, run: number, watching: boolean): Shift {
	const [shown, setShown] = useState<Shift>(NONE);
	const worst = useRef(0);
	const where = useRef<string | null>(null);
	const moves = useRef(0);
	const frames = useRef(0);
	const seen = useRef(new Map<string, { top: number; inside: boolean }>());

	useEffect(() => {
		worst.current = 0;
		where.current = null;
		moves.current = 0;
		frames.current = 0;
		seen.current = new Map();
		setShown(NONE);
	}, [run]);

	useEffect(() => {
		if (!watching) return;
		let alive = true;
		const step = () => {
			if (!alive) return;
			const box = view.current;
			if (box !== null) {
				const bounds = box.getBoundingClientRect();
				const next = new Map<string, { top: number; inside: boolean }>();
				let fell = 0;
				let fellOn: string | null = null;
				for (const node of box.querySelectorAll<HTMLElement>("[data-edge-key]")) {
					const key = node.dataset.edgeKey ?? "";
					const rect = node.getBoundingClientRect();
					const top = rect.top - bounds.top;
					const inside = rect.bottom > bounds.top && rect.top < bounds.bottom;
					const last = seen.current.get(key);
					if (last !== undefined && last.inside && inside) {
						const delta = top - last.top;
						if (delta > fell) {
							fell = delta;
							fellOn = key;
						}
					}
					next.set(key, { top, inside });
				}
				seen.current = next;
				frames.current += 1;
				if (fell > FLOOR) {
					moves.current += 1;
					if (fell > worst.current) {
						worst.current = fell;
						where.current = fellOn;
					}
				}
			}
			window.requestAnimationFrame(step);
		};
		const handle = window.requestAnimationFrame(step);
		const flush = window.setInterval(
			() =>
				setShown({
					worst: Math.round(worst.current * 10) / 10,
					moves: moves.current,
					frames: frames.current,
					where: where.current,
				}),
			200,
		);
		return () => {
			alive = false;
			window.cancelAnimationFrame(handle);
			window.clearInterval(flush);
			// the turn ending is exactly when the number stops being provisional, and the
			// interval would otherwise leave it up to 200ms short of what was measured
			setShown({
				worst: Math.round(worst.current * 10) / 10,
				moves: moves.current,
				frames: frames.current,
				where: where.current,
			});
		};
	}, [view, watching]);

	return shown;
}
