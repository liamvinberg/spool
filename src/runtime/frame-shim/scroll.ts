import { shimConfig } from "./natives";

/**
 * Wheel and key events do not cross an iframe boundary. Once entered, the
 * frame owns both. Browser/canvas zoom gestures are claimed here and handed
 * to the host. A plain wheel chains the way a browser chains it: the frame
 * keeps it while something under the cursor can still scroll that way, and
 * it becomes a canvas pan once nothing can, so an expanded page moves the
 * canvas and a list inside a frame scrolls the list until it runs out.
 */

const canScroll = (el: Element, dx: number, dy: number): boolean => {
	const style = getComputedStyle(el);
	const root = el === document.scrollingElement || el === document.documentElement || el === document.body;
	const scrolls = (overflow: string) =>
		overflow === "auto" || overflow === "scroll" || (root && overflow === "visible");
	if (dy !== 0 && scrolls(style.overflowY) && el.scrollHeight > el.clientHeight) {
		if (dy < 0 && el.scrollTop > 0) return true;
		if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
	}
	if (dx !== 0 && scrolls(style.overflowX) && el.scrollWidth > el.clientWidth) {
		if (dx < 0 && el.scrollLeft > 0) return true;
		if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
	}
	return false;
};

const frameScrolls = (event: WheelEvent): boolean => {
	const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
	const dy = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
	const path = typeof event.composedPath === "function" ? event.composedPath() : [];
	const seen = new Set<Element>();
	for (const node of path) {
		if (!(node instanceof Element) || seen.has(node)) continue;
		seen.add(node);
		if (canScroll(node, dx, dy)) return true;
		// overscroll-behavior: contain ends the chain here, as it does natively
		const style = getComputedStyle(node);
		if (
			style.overscrollBehaviorY === "contain" ||
			style.overscrollBehaviorY === "none" ||
			style.overscrollBehaviorX === "contain" ||
			style.overscrollBehaviorX === "none"
		)
			return true;
	}
	const scroller = document.scrollingElement;
	return scroller !== null && !seen.has(scroller) && canScroll(scroller, dx, dy);
};

// A wheel gesture latches to whoever took its first tick, the way native
// scrolling does, so momentum that runs a list to its end does not fling
// the canvas. Silence longer than the latch window starts a new gesture.
const WHEEL_LATCH_MS = 150;
let wheelLatch = { until: 0, toFrame: true };

export function relayWheel(): void {
	addEventListener(
		"wheel",
		(event) => {
			if (window.parent === window) return;
			const frame = shimConfig().frame;
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				window.parent.postMessage(
					{
						spool: "zoom",
						frame,
						kind: "wheel",
						x: event.clientX,
						y: event.clientY,
						deltaY: event.deltaY,
						deltaMode: event.deltaMode,
					},
					"*",
				);
				return;
			}
			// the prototype's own handler claimed it (a carousel, a custom scroller)
			if (event.defaultPrevented) return;
			const now = event.timeStamp;
			const toFrame = now < wheelLatch.until ? wheelLatch.toFrame : frameScrolls(event);
			wheelLatch = { until: now + WHEEL_LATCH_MS, toFrame };
			if (toFrame) return;
			event.preventDefault();
			window.parent.postMessage(
				{
					spool: "scroll",
					frame,
					deltaX: event.deltaX,
					deltaY: event.deltaY,
					deltaMode: event.deltaMode,
					shiftKey: event.shiftKey === true,
				},
				"*",
			);
		},
		{ passive: false },
	);
}
