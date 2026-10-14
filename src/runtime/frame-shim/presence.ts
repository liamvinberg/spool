import { shimConfig } from "./natives";

/**
 * Presence inside a live frame: the pointer, a press and a scroll in here
 * never reach the canvas, so they are told to it in this document's own
 * pixels, and the canvas says them to the team. A pointer only reaches a
 * frame that is entered, so only an entered frame ever tells. A scroll is
 * told as every scroller's movement added up, the page's and a list's
 * alike: what the team sees is that one happened, and which way.
 */
let presencePoint: { x: number; y: number } | null = null;
let presencePressed = false;
let presenceScrolled = { x: 0, y: 0 };
const scrollersSeen = new WeakMap<Element, { x: number; y: number }>();

const tellPresence = (): void => {
	if (window.parent === window) return;
	window.parent.postMessage(
		{
			spool: "presence",
			frame: shimConfig().frame,
			x: presencePoint === null ? null : presencePoint.x,
			y: presencePoint === null ? null : presencePoint.y,
			pressed: presencePressed,
			scrolled: presenceScrolled,
		},
		"*",
	);
};

export function tellPresenceOut(): void {
	addEventListener(
		"pointermove",
		(event) => {
			presencePoint = { x: event.clientX, y: event.clientY };
			tellPresence();
		},
		true,
	);
	addEventListener(
		"pointerdown",
		(event) => {
			if (event.button !== 0) return;
			presencePoint = { x: event.clientX, y: event.clientY };
			presencePressed = true;
			tellPresence();
		},
		true,
	);
	const endPresencePress = (): void => {
		if (!presencePressed) return;
		presencePressed = false;
		tellPresence();
	};
	addEventListener("pointerup", endPresencePress, true);
	addEventListener("pointercancel", endPresencePress, true);
	addEventListener(
		"scroll",
		(event) => {
			const scroller =
				event.target === document ? document.scrollingElement || document.documentElement : event.target;
			if (!(scroller instanceof Element)) return;
			const was = scrollersSeen.get(scroller) || { x: 0, y: 0 };
			const now = { x: scroller.scrollLeft, y: scroller.scrollTop };
			scrollersSeen.set(scroller, now);
			presenceScrolled = {
				x: Math.round(presenceScrolled.x + now.x - was.x),
				y: Math.round(presenceScrolled.y + now.y - was.y),
			};
			tellPresence();
		},
		true,
	);
}
