import { type Match, matchName } from "../../name-match";
import { pageName } from "../../page-path";
import type { ProjectedFrame } from "../api";

/**
 * Finding a frame by name in a project where most names share a long prefix.
 *
 * Plain substring finds but cannot rank, and with dozens of names sharing one
 * `--` family prefix, ranking is the entire product. The matcher itself is
 * `name-match.ts` — the picker asks the same question of folder names (#251),
 * so the scoring lives where both can reach it. What is left here is what only
 * frames know: ties break by recency, which is the same order the empty query
 * uses, so one rule covers both.
 */

export interface Hit {
	readonly frame: ProjectedFrame;
	/**
	 * indices into the frame's own name (its last segment, which is what a row
	 * prints) the query landed on, ascending
	 */
	readonly matched: readonly number[];
	readonly score: number;
}

/** Newest folder first: the empty query's order and the ranked list's tiebreak. */
export function newestFirst(frames: readonly ProjectedFrame[]): ProjectedFrame[] {
	return [...frames].sort((a, b) => (b.born ?? 0) - (a.born ?? 0) || a.name.localeCompare(b.name));
}

/**
 * The list the finder draws, over frames already sorted newest first. An empty
 * query is not an empty answer: it is every frame, newest first, which is the
 * loop this exists for. An agent says it made six variations, you press `/`,
 * and they are the top six with nothing typed.
 */
export function findFrames(query: string, frames: readonly ProjectedFrame[]): readonly Hit[] {
	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return frames.map((frame) => ({ frame, matched: [], score: 0 }));

	const hits: { hit: Hit; fresh: number }[] = [];
	frames.forEach((frame, fresh) => {
		const found = matchFrame(wanted, frame.name);
		if (found === null) return;
		hits.push({ hit: { frame, matched: found.matched, score: found.score }, fresh });
	});
	hits.sort((a, b) => b.hit.score - a.hit.score || a.fresh - b.fresh);
	return hits.map((entry) => entry.hit);
}

/**
 * One frame against the query (#336). A frame is named by its path, and a row
 * prints its own name beside its page, so the query is asked of both: the own
 * name first, which keeps an exact name exact on any page, and the whole path
 * second, so typing the page finds what is on it. What landed is said against
 * the own name, which is the only part a row draws the hits in.
 */
function matchFrame(wanted: string, name: string): Match | null {
	const leaf = pageName(name);
	const own = matchName(wanted, leaf.toLowerCase());
	const whole = leaf === name ? null : matchName(wanted, name.toLowerCase());
	if (whole === null || (own !== null && own.score >= whole.score)) return own;
	const offset = name.length - leaf.length;
	return { score: whole.score, matched: whole.matched.filter((at) => at >= offset).map((at) => at - offset) };
}

/**
 * How long ago something happened, worded the way the empty list prints it.
 *
 * One wording rather than two: the finder says how long ago a frame was born and the
 * agent rail's flyout says how long ago a thread last did anything, and an age read in
 * one place should not be spelled differently in the other.
 */
export function ageOf(born: number | undefined, now: number): string | undefined {
	if (born === undefined) return undefined;
	const gone = Math.max(0, now - born);
	if (gone < 60_000) return "now";
	if (gone < 3_600_000) return `${Math.floor(gone / 60_000)}m`;
	if (gone < 86_400_000) return `${Math.floor(gone / 3_600_000)}h`;
	return `${Math.floor(gone / 86_400_000)}d`;
}
