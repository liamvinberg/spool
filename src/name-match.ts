/**
 * Matching one name against what somebody typed, and saying where it landed.
 *
 * This is the frame finder's matcher (#22), lifted out of `ui/canvas/frame-find.ts`
 * when the folder picker (#251) needed the same question asked of directory names.
 * One matcher, two callers: the canvas ranks frames with it in the browser, the
 * daemon ranks folders with it on disk, and neither owns it.
 *
 * A subsequence matcher with four rules, each one here because a real query
 * needed it:
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
 * strength sixteen characters in.
 */

/** `-` `_` `.` `/` `space`: what a person hears as the end of a word. */
const SEAMS = new Set([45, 95, 46, 47, 32]);

const HIT = 1;
const BOUNDARY = 14;
const RUN = 8;
const SKIP = 10;
const EXACT = 1000;

export interface Match {
	readonly score: number;
	/** indices into the name the query landed on, ascending */
	readonly matched: readonly number[];
}

/**
 * One name against one query. Returns null when the query is not a subsequence
 * of the name at all, and the winning path when it is: the highest-scoring set
 * of landing places, not the first one found. A greedy left-to-right walk would
 * take `n` from `agent` and never reach `--nav-`, so this is a proper table.
 *
 * Both arguments arrive lowercased by the caller — a matcher that lowercases
 * per name would do it once per keystroke per row.
 */
export function matchName(query: string, name: string): Match | null {
	const qn = query.length;
	const nn = name.length;
	// an empty query is not a match, it is a question nobody asked: the caller decides what it shows
	if (qn === 0 || qn > nn) return null;

	// at[i][j]: the best total for query[0..i] with query[i] landing on name[j]
	const at = new Float64Array(qn * nn).fill(Number.NEGATIVE_INFINITY);
	const via = new Int32Array(qn * nn).fill(-1);

	for (let i = 0; i < qn; i++) {
		for (let j = 0; j < nn; j++) {
			if (query.charCodeAt(i) !== name.charCodeAt(j)) continue;
			const boundary = j === 0 || SEAMS.has(name.charCodeAt(j - 1)) ? BOUNDARY : 0;
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
	const total = score + (name === query ? EXACT : 0);
	// a match that spent more on skips than it earned on hits was never a match, it was a
	// coincidence that happened to be spellable — so it is the matcher that drops it, not each caller
	return total <= 0 ? null : { score: total, matched };
}

/**
 * How a row weighs a character. Three zones and no more: the run-up you did
 * not ask for, the letters you typed, and the part of the name that comes
 * after them, which is where the difference between two near-identical names
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
