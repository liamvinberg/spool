import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";
import type { Beat } from "./spool-public";

/**
 * A slide's beats and whether it is live (spool#265), the frame half of a deck. `ui.beats(names)` reads the beat the
 * slide is on; `ui.live()` says clicks belong to the slide. Nothing here knows a deck: a host that steps a talk puts a
 * slide on a beat, by frame, and every slide nobody put on one reads as its last beat, so a slide shows complete on
 * the canvas, in a still and in ordinary play.
 *
 * A host puts a slide on a beat three ways, all landing in `setSlideBeat`: a stage in the same document calls it, the
 * canvas posts `{ spool: "beat", beat }` to a frame's window, and the player shell sends
 * `{ spool: "player-beat", frame, beat }` over its private port; `beat` is the index from 0, `null` takes the slide
 * back to its last beat. Each slide tells its host what it is once it has drawn it, as a `SlideReport`.
 */

/** What a slide told its host, once drawn: the beats it names, whether it is live, and the beat it now shows. */
export interface SlideReport {
	readonly frame: string;
	/** none when it never called `ui.beats`, and it then plays as one beat */
	readonly beats: readonly string[];
	readonly live: boolean;
	/** the index it drew, from 0 */
	readonly beat: number;
}

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

/** A host's word putting this document's slide on a beat, as the canvas posts it: `beat` from 0, or `null`. */
export function parseSlideBeat(data: unknown): { beat: number | null } | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const message = data as { spool?: unknown; beat?: unknown };
	if (message.spool !== "beat") return undefined;
	return isBeat(message.beat) ? { beat: message.beat } : undefined;
}

/** The player shell's word putting a slide of its document on a beat. */
export function parsePlayerBeat(data: Record<string, unknown>): { frame: string; beat: number | null } | undefined {
	if (data.spool !== "player-beat" || typeof data.frame !== "string" || !isBeat(data.beat)) return undefined;
	return { frame: data.frame, beat: data.beat };
}

const isBeat = (value: unknown): value is number | null =>
	value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);

/**
 * `ui.beats` and `ui.live` for a document: `frame` names the slide a call outside every `SlideScope` belongs to, and
 * `report` carries what each slide drew to its host, once per change.
 */
export function slideCalls(host: { frame(): string; report(slide: SlideReport): void }) {
	const said = new Map<string, { beats: readonly string[]; live: boolean; beat: number }>();
	const told = new Map<string, string>();
	let scheduled = false;
	const tell = (frame: string, change: Partial<{ beats: readonly string[]; live: boolean; beat: number }>) => {
		said.set(frame, { ...(said.get(frame) ?? { beats: [], live: false, beat: 0 }), ...change });
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			for (const [frame, slide] of said) {
				const report: SlideReport = { frame, ...slide };
				const text = JSON.stringify(report);
				if (told.get(frame) === text) continue;
				told.set(frame, text);
				host.report(report);
			}
		});
	};

	function useBeats<const Names extends readonly [string, ...string[]]>(names: Names): Beat<Names[number]> {
		const frame = useContext(SlideScope) ?? host.frame();
		const at = useSyncExternalStore(subscribe, () => placed.get(frame));
		const last = Math.max(0, names.length - 1);
		const index = at === undefined ? last : Math.min(at, last);
		const key = JSON.stringify(names);
		useLayoutEffect(() => tell(frame, { beats: JSON.parse(key) as string[], beat: index }), [frame, key, index]);
		return {
			name: (names[index] ?? "") as Names[number],
			index,
			reached: (name) => {
				const of = names.indexOf(name);
				return of >= 0 && of <= index;
			},
		};
	}

	function useLive(): void {
		const frame = useContext(SlideScope) ?? host.frame();
		useLayoutEffect(() => tell(frame, { live: true }), [frame]);
	}

	return { beats: useBeats, live: useLive };
}
