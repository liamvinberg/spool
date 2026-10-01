import { clamp } from "./math";

export type ReelFrame = {
	/** Scroll progress through the pinned track, 0 to 1, eased toward the scrollbar. */
	progress: number;
	/** Seconds of ambient time; frozen under reduced motion. */
	time: number;
	width: number;
	height: number;
	reduced: boolean;
	/** True while the eased progress is still catching up with the scrollbar. */
	settling: boolean;
	interval: number;
};

export type ReelOptions = {
	/** The tall section whose scroll drives the film. Its first child is the pinned stage. */
	track: HTMLElement;
	render(frame: ReelFrame): void;
	/** Whether the scene still wants frames when nobody scrolls. */
	ambient(): boolean;
	/** How quickly the picture catches the scrollbar, per second. Higher is tighter. */
	follow?: number;
	/** Called after size changes, before the next render. */
	measure?(width: number, height: number): void;
	/** Ceiling on ambient draws a second; scrolling always draws every frame. */
	fps?: number;
};

/**
 * The film's clock. Native scrolling is never intercepted: the page scrolls as
 * the trackpad says and the picture follows the scroll position, eased over a
 * few frames so a stepped mouse wheel still reads as one continuous move.
 */
export function runReel({ track, render, ambient, follow = 9, measure, fps = 60 }: ReelOptions) {
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let progress = Number.NaN,
		time = 0,
		raf = 0,
		last: number | null = null,
		since = 0,
		visible = true,
		width = window.innerWidth,
		height = window.innerHeight;

	const target = () => {
		const box = track.getBoundingClientRect();
		const span = Math.max(1, box.height - height);
		return clamp(-box.top / span);
	};
	const schedule = () => {
		if (!raf) raf = window.requestAnimationFrame(tick);
	};
	function tick(stamp: number) {
		raf = 0;
		const interval = last === null ? 16.7 : Math.min(stamp - last, 100);
		last = stamp;
		const reduced = motion.matches;
		const goal = target();
		if (Number.isNaN(progress) || reduced) progress = goal;
		else progress += (goal - progress) * (1 - Math.exp((-follow * interval) / 1000));
		const settling = Math.abs(goal - progress) > 0.00002;
		if (!settling) progress = goal;
		const wantsAmbient = !reduced && visible && ambient();
		if (wantsAmbient) time += interval / 1000;
		since += interval;
		// Ambient drift needs at most `fps` draws a second, including on 120 Hz screens.
		if (settling || since >= 1000 / fps - 0.5 || !wantsAmbient) {
			since = 0;
			render({ progress, time, width, height, reduced, settling, interval });
		}
		if (document.hidden) {
			last = null;
			return;
		}
		if (settling || wantsAmbient) schedule();
		else last = null;
	}
	const resize = () => {
		width = window.innerWidth;
		height = window.innerHeight;
		measure?.(width, height);
		schedule();
	};
	const onVisibility = () => {
		last = null;
		schedule();
	};
	const seen = new IntersectionObserver(([entry]) => {
		visible = entry?.isIntersecting ?? true;
		schedule();
	});
	seen.observe(track);
	window.addEventListener("scroll", schedule, { passive: true });
	window.addEventListener("resize", resize, { passive: true });
	document.addEventListener("visibilitychange", onVisibility);
	motion.addEventListener("change", schedule);
	resize();
	void document.fonts?.ready.then(resize);

	return () => {
		window.cancelAnimationFrame(raf);
		seen.disconnect();
		window.removeEventListener("scroll", schedule);
		window.removeEventListener("resize", resize);
		document.removeEventListener("visibilitychange", onVisibility);
		motion.removeEventListener("change", schedule);
	};
}

/** Show a layer at `alpha`, and take it out of the way of clicks and readers once it is gone. */
export function setLayer(element: HTMLElement | null | undefined, alpha: number, transform?: string, blur?: number) {
	if (!element) return;
	const { style } = element;
	style.opacity = alpha.toFixed(3);
	style.visibility = alpha < 0.002 ? "hidden" : "visible";
	style.pointerEvents = alpha > 0.6 ? "auto" : "none";
	if (transform !== undefined) style.transform = transform;
	if (blur !== undefined) style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
}
