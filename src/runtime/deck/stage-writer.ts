/**
 * Whose code wrote `ui.state` (spool#332). The stage's document names, on each module it preloads, the slides of the
 * talk that reach it; a write's stack runs through the modules of the code that made it. The slides that could have made
 * it are those that reach every one of them: a write from a slide waiting out of sight, from a timer or a promise as
 * much as as it mounts, is told from one by the slide on show, unless it ran only through code the two share. A timer
 * keeps the slide it was set as, so one a slide set as it was put on is that slide's through shared code too.
 */

/** The scripts a stack runs through, innermost first. */
export function scriptsOn(stack: string): string[] {
	return [...stack.matchAll(/(https?:\/\/[^\s()@]+?):\d+:\d+/g)].flatMap((match) =>
		match[1] === undefined ? [] : [match[1]],
	);
}

/**
 * The slides whose code could have made the call `stack` is of: those that reach every slide module on it. Undefined
 * when no slide's module is on it (the runtime's own doing), empty when no one slide reaches them all.
 */
export function writersOf(
	stack: string,
	reach: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> | undefined {
	let writers: Set<string> | undefined;
	for (const script of scriptsOn(stack)) {
		const slides = reach.get(script);
		if (slides === undefined) continue;
		writers = writers === undefined ? new Set(slides) : new Set(slides.filter((slide) => writers?.has(slide)));
	}
	return writers;
}

/** The slides reaching each module the stage's document preloads, by its address. */
export function readReach(): Map<string, readonly string[]> {
	const reach = new Map<string, readonly string[]>();
	for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-spool-slides]")) {
		try {
			const slides: unknown = JSON.parse(link.dataset.spoolSlides ?? "");
			if (Array.isArray(slides) && slides.every((slide) => typeof slide === "string")) reach.set(link.href, slides);
		} catch {
			// a link not of the stage's making names nobody
		}
	}
	return reach;
}

/** The stack of the call running now, deep enough to reach a slide's code through the runtime's own. */
export function stackNow(): string {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 64;
	try {
		return new Error().stack ?? "";
	} finally {
		Error.stackTraceLimit = limit;
	}
}

/** The slide a timer running now was set as: by its code as it was put on, or by a timer of its. */
let timerFor: string | undefined;

/** The slide the timer running now was set as (`asSlide`), undefined for code no such timer runs. */
export function timerSlide(): string | undefined {
	return timerFor;
}

/**
 * Runs `run` as `slide`'s: the timers set while it runs, and the timers those set, run as that slide's too, through
 * code the slides share as much as through the slide's own (spool#332).
 */
export function asSlide<T>(slide: string, run: () => T): T {
	const was = timerFor;
	timerFor = slide;
	try {
		return run();
	} finally {
		timerFor = was;
	}
}

/** Timers keep the slide they were set as (`asSlide`): installed once in a stage's document, before any slide runs. */
export function followTimers(scope: Pick<Window, "setTimeout" | "setInterval"> = window): void {
	for (const name of ["setTimeout", "setInterval"] as const) {
		const native = scope[name];
		const follow = (handler: TimerHandler, timeout?: number, ...rest: unknown[]) => {
			const slide = timerFor;
			if (slide === undefined || typeof handler !== "function") return native(handler, timeout, ...rest);
			return native((...given: unknown[]) => asSlide(slide, () => handler(...given)), timeout, ...rest);
		};
		// it looks as the timer it stands in for does: its name, and the marks a fake clock that put it there knows it by
		Object.defineProperties(follow, Object.getOwnPropertyDescriptors(native));
		scope[name] = follow;
	}
}
