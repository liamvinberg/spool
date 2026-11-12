/**
 * The play path's timing marks (spool#301): where the time between a press on
 * play and the frame on screen goes.
 *
 * Four marks, one name each wherever they are taken: `press` and `window-shown`
 * by whoever opens the player (the Mac app's main process, or the canvas for a
 * browser tab), `shell-painted` and `frame-revealed` by the played document.
 * The page's two land on the document's performance timeline as
 * `spool-play:<mark>`, which is how a browser tab reads them, and are handed to
 * the Mac app's play window (the host's desk) as wall-clock times when it takes
 * them, so its log can put all four against the press it received.
 */

export type PlayMark = "press" | "window-shown" | "shell-painted" | "frame-revealed";

/** The name a mark goes by on a performance timeline. */
export function playMarkName(mark: PlayMark): string {
	return `spool-play:${mark}`;
}

const taken = new Set<PlayMark>();

/**
 * Take a mark once the frame it describes has been painted: an animation frame
 * runs before the paint, and a task queued from it runs after. Each mark is
 * taken once per document, the first time it happens; `hand` gets it too, as a
 * wall-clock time.
 */
export function markPlayAfterPaint(mark: PlayMark, hand?: (mark: PlayMark, at: number) => void): void {
	if (taken.has(mark)) return;
	taken.add(mark);
	const take = () => {
		try {
			const entry = performance.mark(playMarkName(mark));
			hand?.(mark, performance.timeOrigin + entry.startTime);
		} catch {
			// A mark is a measurement: nothing about the play waits on it.
		}
	};
	if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(take, 0));
	else take();
}
