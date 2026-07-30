import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * Measuring, because this page's history is a list of widths computed by hand and
 * found wrong at the real rail width.
 *
 * #180 hand-summed the composer footer at 433 and the box was 391. #184 then found
 * that its own correction was wrong too, for a reason worth repeating here: summing
 * children's `scrollWidth` breaks the moment one of the children is the thing that
 * truncates, because the cut moves a level deeper and the child's own box shrinks
 * with it. What that ticket landed on is the only honest instrument, and it is what
 * this file wraps: **draw the row twice, and ask the copy that is allowed to be as
 * wide as it likes how wide it wants to be.**
 *
 * So `useFit` hands back two refs. `has` goes on the box the row actually lives in,
 * and reports the room it has. `wants` goes on an invisible `w-max` duplicate of the
 * same children, and reports what they would take if nothing stopped them. Both are
 * read after the fonts land, because Fragment Mono arrives late enough that a
 * measurement taken on mount is measuring a fallback face.
 */

export interface Fit {
	/** the room the row is in */
	readonly has: number;
	/** what the row would take if nothing stopped it */
	readonly wants: number;
	readonly fits: boolean;
	/** how much is left over, or how much is missing */
	readonly spare: number;
}

const NOTHING: Fit = { has: 0, wants: 0, fits: true, spare: 0 };

export function useFit<A extends HTMLElement, B extends HTMLElement>(
	watch: unknown = null,
): { has: RefObject<A | null>; wants: RefObject<B | null>; fit: Fit } {
	const has = useRef<A>(null);
	const wants = useRef<B>(null);
	const [fit, setFit] = useState<Fit>(NOTHING);

	useEffect(() => {
		const box = has.current;
		const ghost = wants.current;
		if (box === null || ghost === null) return;
		const read = () => {
			const room = box.clientWidth;
			const want = ghost.offsetWidth;
			setFit({ has: room, wants: want, fits: want <= room, spare: room - want });
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(box);
		observer.observe(ghost);
		// the mono face lands after first paint, and every number here is a mono number
		void document.fonts?.ready.then(read);
		const timer = window.setTimeout(read, 240);
		return () => {
			observer.disconnect();
			window.clearTimeout(timer);
		};
	}, [watch]);

	return { has, wants, fit };
}

/** one box's own width, for a claim about a gap rather than about a row */
export function useWidth<T extends HTMLElement>(watch: unknown = null): [RefObject<T | null>, number] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const node = ref.current;
		if (node === null) return;
		const read = () => setWidth(Math.round(node.getBoundingClientRect().width));
		read();
		const observer = new ResizeObserver(read);
		observer.observe(node);
		void document.fonts?.ready.then(read);
		const timer = window.setTimeout(read, 240);
		return () => {
			observer.disconnect();
			window.clearTimeout(timer);
		};
	}, [watch]);
	return [ref, width];
}

/** the numbers as the machine would print them, which is the register a readout is in */
export function say(fit: Fit): string {
	if (fit.has === 0) return "measuring";
	return fit.fits
		? `wants ${fit.wants} · has ${fit.has} · ${fit.spare} spare`
		: `wants ${fit.wants} · has ${fit.has} · ${-fit.spare} over`;
}
