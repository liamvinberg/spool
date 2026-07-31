import type { ProjectedFrame } from "../api";

/**
 * Finding a frame by name in a project where most names share a long prefix.
 *
 * Plain substring finds but cannot rank, and with dozens of names sharing one
 * `--` family prefix, ranking is the entire product. So: a subsequence matcher
 * with four rules, each one here because a real query needed it:
 *
 *   boundary   a character landing at the start of a segment is worth 14, one
 *              landing mid-segment is worth 1. `nav` inside `--nav-dock` is a
 *              name; `nav` inside some longer word is a coincidence.
 *   run        a character immediately after the previous one is worth 8 more.
 *              Solid beats scattered, always.
 *   skip       every character stepped over inside the match costs 10. Without
 *              this, `plan` scores higher on `agent-play--nav-dock` than on
 *              `agent-play--plan-log`: `pla` plus a boundary `n` collects two
 *              boundary bonuses where the real match collects one.
 *   exact      a name that is exactly the query wins by 1000. `agent-play` and
 *              `agent-play--entered` are both frames and both are prefixes, so
 *              nothing else can separate them.
 *
 * What is deliberately not a rule: where in the name the match starts. People
 * type the variant tail, and `drop` has to find `agent-play--ask-drop` at full
 * strength sixteen characters in. Ties break by recency, which is the same
 * order the empty query uses — one rule covers both: score, then newest. And a
 * match that spent more on skips than it earned on hits is dropped, because it
 * was never a match, it was a coincidence that happened to be spellable.
 */

const DASH = 45; // "-"

const HIT = 1;
const BOUNDARY = 14;
const RUN = 8;
const SKIP = 10;
const EXACT = 1000;

export interface Hit {
	readonly frame: ProjectedFrame;
	/** indices into `frame.name` the query landed on, ascending */
	readonly matched: readonly number[];
	readonly score: number;
}

/** Newest folder first: the empty query's order and the ranked list's tiebreak. */
export function newestFirst(frames: readonly ProjectedFrame[]): ProjectedFrame[] {
	return [...frames].sort((a, b) => (b.born ?? 0) - (a.born ?? 0) || a.name.localeCompare(b.name));
}

/**
 * One name against one query. Returns null when the query is not a subsequence
 * of the name at all, and the winning path when it is: the highest-scoring set
 * of landing places, not the first one found. A greedy left-to-right walk would
 * take `n` from `agent` and never reach `--nav-`, so this is a proper table.
 */
function against(query: string, name: string): { readonly score: number; readonly matched: number[] } | null {
	const qn = query.length;
	const nn = name.length;
	if (qn === 0) return { score: 0, matched: [] };
	if (qn > nn) return null;

	// at[i][j]: the best total for query[0..i] with query[i] landing on name[j]
	const at = new Float64Array(qn * nn).fill(Number.NEGATIVE_INFINITY);
	const via = new Int32Array(qn * nn).fill(-1);

	for (let i = 0; i < qn; i++) {
		for (let j = 0; j < nn; j++) {
			if (query.charCodeAt(i) !== name.charCodeAt(j)) continue;
			const boundary = j === 0 || name.charCodeAt(j - 1) === DASH ? BOUNDARY : 0;
			if (i === 0) {
				// nothing before the first landing is a skip: typing the tail is normal
				at[i * nn + j] = HIT + boundary;
				continue;
			}
			let best = Number.NEGATIVE_INFINITY;
			let from = -1;
			for (let k = 0; k < j; k++) {
				const prior = at[(i - 1) * nn + k] ?? Number.NEGATIVE_INFINITY;
				if (prior === Number.NEGATIVE_INFINITY) continue;
				const step = prior + (k === j - 1 ? RUN : 0) - SKIP * (j - k - 1);
				if (step > best) {
					best = step;
					from = k;
				}
			}
			if (from < 0) continue;
			at[i * nn + j] = best + HIT + boundary;
			via[i * nn + j] = from;
		}
	}

	let end = -1;
	let score = Number.NEGATIVE_INFINITY;
	for (let j = 0; j < nn; j++) {
		const total = at[(qn - 1) * nn + j] ?? Number.NEGATIVE_INFINITY;
		if (total > score) {
			score = total;
			end = j;
		}
	}
	if (end < 0) return null;

	const matched: number[] = [];
	let j = end;
	for (let i = qn - 1; i >= 0; i--) {
		matched.push(j);
		j = via[i * nn + j] ?? -1;
	}
	matched.reverse();
	return { score: score + (name === query ? EXACT : 0), matched };
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
		const found = against(wanted, frame.name.toLowerCase());
		// a match that spent more on skips than it earned on hits was a coincidence
		if (found === null || found.score <= 0) return;
		hits.push({ hit: { frame, matched: found.matched, score: found.score }, fresh });
	});
	hits.sort((a, b) => b.hit.score - a.hit.score || a.fresh - b.fresh);
	return hits.map((entry) => entry.hit);
}

/**
 * How the row weighs a character. Three zones and no more: the run-up you did
 * not ask for, the letters you typed, and the part of the name that comes
 * after them, which is where the difference between two near-identical frames
 * always lives.
 */
export type Weight = "runup" | "hit" | "plain";

export function charWeights(name: string, matched: readonly number[]): readonly Weight[] {
	const first = matched[0] ?? 0;
	const hits = new Set(matched);
	const out: Weight[] = [];
	for (let i = 0; i < name.length; i++) out.push(hits.has(i) ? "hit" : i < first ? "runup" : "plain");
	return out;
}

export interface Run {
	readonly text: string;
	readonly weight: Weight;
	/** where the run starts in the name — the stable key a render needs */
	readonly at: number;
}

/** The characters of `name` collapsed into as few spans as their weights allow. */
export function runsIn(name: string, weights: readonly Weight[]): readonly Run[] {
	const out: Run[] = [];
	for (let i = 0; i < name.length; i++) {
		const weight = weights[i] ?? "plain";
		const last = out.at(-1);
		if (last !== undefined && last.weight === weight) {
			out[out.length - 1] = { text: last.text + name.charAt(i), weight, at: last.at };
		} else {
			out.push({ text: name.charAt(i), weight, at: i });
		}
	}
	return out;
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
