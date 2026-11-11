import { createContext, useContext, useSyncExternalStore } from "react";
import type { Beat } from "./spool-public";

/**
 * A slide's beats and whether it is live (spool#265), the frame half of a deck. `ui.beats(names)` reads the beat the
 * slide is on; `ui.live()` says clicks belong to the slide. Nothing here knows a deck: the stage puts a slide on a beat,
 * by frame, with `setSlideBeat`, and every slide nobody put on one reads as its last beat, so a slide shows complete on
 * the canvas, in a still and in ordinary play. The stage learns a slide's beats and whether it is live from its source,
 * read by the daemon, so a slide tells nobody what it drew.
 */

/**
 * Which frame a slide is, for a document holding several: a stage that renders slides side by side wraps each in it.
 * Outside it, a slide is the frame its document is showing.
 */
export const SlideScope = createContext<string | null>(null);

/** Where hosts have put slides, by frame. */
const placed = new Map<string, number>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

/** A slide put on a beat, from 0, or back on its last beat for `null`. Each slide reading it draws again. */
export function setSlideBeat(frame: string, beat: number | null): void {
	if (beat === null ? !placed.has(frame) : placed.get(frame) === beat) return;
	if (beat === null) placed.delete(frame);
	else placed.set(frame, beat);
	for (const listener of listeners) listener();
}

/** `ui.beats` and `ui.live` for a document: `frame` names the slide a call outside every `SlideScope` belongs to. */
export function slideCalls(host: { frame(): string }) {
	function useBeats<const Names extends readonly [string, ...string[]]>(names: Names): Beat<Names[number]> {
		const frame = useContext(SlideScope) ?? host.frame();
		const at = useSyncExternalStore(subscribe, () => placed.get(frame));
		const last = Math.max(0, names.length - 1);
		const index = at === undefined ? last : Math.min(at, last);
		return {
			name: (names[index] ?? "") as Names[number],
			index,
			reached: (name) => {
				const of = names.indexOf(name);
				return of >= 0 && of <= index;
			},
		};
	}

	/** what makes a slide live is the call in its source, which the daemon reads; at run time it does nothing */
	function useLive(): void {}

	return { beats: useBeats, live: useLive };
}
