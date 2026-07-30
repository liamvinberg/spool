import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Measuring instead of asserting.
 *
 * This page's history is a list of widths computed by hand and then found wrong in the
 * browser: #180's footer wanted 433 in 391, #184's `scrollWidth` sum broke a second time
 * once the truncating child moved a level deeper, #186's four menus were all supposed to
 * differ in height and cluster inside 98px. So every number an `agent-many--*` frame
 * prints comes from the document it is printing on, and the two ways to get one are here.
 *
 * `useBox` is for things that exist: a column, a transcript, a name. `useTextWidth` is for
 * things that do not — what a string *would* be at a size, which is the only way to ask
 * whether a name would have fitted somewhere it was never drawn.
 */

export interface Box {
	readonly w: number;
	readonly h: number;
}

/** an element's own box, live, so a drag or a case switch re-reads it rather than remembering */
export function useBox<T extends HTMLElement>(): { ref: RefObject<T | null>; box: Box } {
	const ref = useRef<T | null>(null);
	const [box, setBox] = useState<Box>({ w: 0, h: 0 });
	useLayoutEffect(() => {
		const node = ref.current;
		if (node === null) return;
		const read = () => setBox({ w: Math.round(node.getBoundingClientRect().width), h: Math.round(node.getBoundingClientRect().height) });
		read();
		const watch = new ResizeObserver(read);
		watch.observe(node);
		return () => watch.disconnect();
	}, []);
	return { ref, box };
}

/**
 * What a string would be, at a font, without drawing it.
 *
 * Canvas rather than a hidden span, because a hidden span is a real box in a real layout
 * and this has to answer for strings that are never laid out at all — the eleven asks a
 * column of marks deliberately does not draw. It waits on `document.fonts.ready`, since
 * Fragment Mono and Familjen Grotesk are injected into the document and a measurement
 * taken against the fallback is a measurement of the wrong typeface.
 */
export function useTextWidths(items: readonly string[], font: string): readonly number[] {
	const [widths, setWidths] = useState<readonly number[]>([]);
	const key = items.join("\n");
	useEffect(() => {
		let live = true;
		void document.fonts.ready.then(() => {
			if (!live) return;
			const canvas = document.createElement("canvas");
			const pen = canvas.getContext("2d");
			if (pen === null) return;
			pen.font = font;
			setWidths(key.split("\n").map((text) => Math.round(pen.measureText(text).width)));
		});
		return () => {
			live = false;
		};
	}, [key, font]);
	return widths;
}

/**
 * The transcript's own box, from inside the rail rather than around it.
 *
 * `PlayRail`'s scroller carries `pages-scrollbar`, which is the one stable handle on it
 * from outside — so a take can print how wide the log's measure actually is once its own
 * chrome has taken its cut, and how tall the log has grown against the box holding it.
 * That second number is what kills the obvious place to put a thread's name: the log is
 * bottom-anchored, so its head is above the box long before a turn is over.
 *
 * It polls, because the log grows for nine and a half minutes and a number taken once at
 * mount is a number about an empty transcript.
 */
export function useLogBox(host: RefObject<HTMLElement | null>): {
	/** the scroller's own box, padding included */
	readonly w: number;
	readonly h: number;
	/** the reading measure inside it, which is the box less the rail's 14px gutters */
	readonly measure: number;
	readonly grown: number;
	/** how far down the box the first thing in the log sits, which `mt-auto` puts near the bottom */
	readonly head: number;
} {
	const [read, setRead] = useState({ w: 0, h: 0, measure: 0, grown: 0, head: 0 });
	useEffect(() => {
		const tick = () => {
			const box = host.current?.querySelector<HTMLElement>(".pages-scrollbar");
			if (box === null || box === undefined) return;
			const first = box.firstElementChild;
			const head = first instanceof HTMLElement ? Math.round(first.getBoundingClientRect().top - box.getBoundingClientRect().top) : 0;
			setRead({
				w: box.clientWidth,
				h: box.clientHeight,
				measure: box.clientWidth - 28,
				grown: box.scrollHeight,
				head,
			});
		};
		tick();
		const timer = window.setInterval(tick, 400);
		return () => window.clearInterval(timer);
	}, [host]);
	return read;
}

/** the rail's own two type faces, as a canvas takes them */
export const MONO_SM = "12px 'Fragment Mono'";
export const MONO_XS = "11px 'Fragment Mono'";
export const SANS_BASE = "13px 'Familjen Grotesk'";

/** the widest of a set, and how many of them would not fit in a box */
export function overflow(widths: readonly number[], room: number): { readonly widest: number; readonly cut: number } {
	return {
		widest: widths.reduce((most, width) => Math.max(most, width), 0),
		cut: widths.filter((width) => width > room).length,
	};
}
