/**
 * How long a slide held stands before it settles, its own document starting and the stage resting on it: longer than a
 * double-click, whose first click selects the slide the second goes into, so that click starts nothing under the flight.
 */
export const SETTLE_MS = 500;

/**
 * Runs `then` once `ms` have passed with nothing in the hand when they end; while something is, it waits `ms` again.
 * A frame lifted is in the hand from the move that lifts it, a frame before the canvas draws it carried, and nothing
 * may start then (spool#299): a document starting holds the window's frames back.
 */
export function afterStill(ms: number, inHand: () => boolean, then: () => void): { stop(): void } {
	let timer: ReturnType<typeof setTimeout>;
	const end = () => {
		if (inHand()) timer = setTimeout(end, ms);
		else then();
	};
	timer = setTimeout(end, ms);
	return { stop: () => clearTimeout(timer) };
}
