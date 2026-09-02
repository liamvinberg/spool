import { type Dir, DISK } from "shared/lib/picker-disk";

/**
 * Finding a folder anywhere under home by typing part of its name.
 *
 * The matcher is the one already in the product — `src/ui/canvas/frame-find.ts`,
 * the frame finder's — with one change and one addition. The change: a segment
 * starts after any of `- _ . /`, not after `-` alone, because a folder is named
 * `gym-brute-api` on one machine and `gym_brute_api` on the next and both are
 * the same word to the person typing. The addition: two folders can score the
 * same and only one of them is the answer, so ties break on what the picker
 * knows and the finder never had to — a spool project before a plain folder,
 * then the shallower path, then alphabetically.
 *
 * Depth as a tiebreak rather than a score: `~/personal/projects/gym-brute` and
 * `~/session-archive/2025/gymlog` both answer to `gym`, and the second is not a
 * worse *match*, it is a worse *guess*. Keeping that out of the score means a
 * long exact name still beats a short scattered one however deep it is buried.
 */

const HIT = 1;
const BOUNDARY = 14;
const RUN = 8;
const SKIP = 10;
const EXACT = 1000;

/** `-` `_` `.` `/` `space`: what a person hears as the end of a word in a path */
const SEAMS = new Set([45, 95, 46, 47, 32]);

export interface Hit {
	readonly dir: Dir;
	/** indices into `dir.name` the query landed on, ascending */
	readonly matched: readonly number[];
	readonly score: number;
}

/**
 * One name against one query: the highest-scoring set of landing places, not the
 * first one found. A greedy walk takes `g` from the leading `g` of `go` and never
 * reaches the one that matters, so this is a proper table.
 */
function against(query: string, name: string): { readonly score: number; readonly matched: number[] } | null {
	const qn = query.length;
	const nn = name.length;
	if (qn === 0) return { score: 0, matched: [] };
	if (qn > nn) return null;

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
	return { score: score + (name === query ? EXACT : 0), matched };
}

/** every folder under home the query answers to, best guess first */
export function searchDisk(query: string): readonly Hit[] {
	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return [];
	const hits: Hit[] = [];
	for (const dir of DISK) {
		const found = against(wanted, dir.name.toLowerCase());
		// a match that spent more on skips than it earned on hits was a coincidence
		if (found === null || found.score <= 0) continue;
		hits.push({ dir, matched: found.matched, score: found.score });
	}
	hits.sort(
		(a, b) =>
			b.score - a.score ||
			Number(b.dir.isProject) - Number(a.dir.isProject) ||
			a.dir.depth - b.dir.depth ||
			a.dir.name.localeCompare(b.dir.name),
	);
	return hits;
}

/** how many directories a deep search read, so the readout can say it */
export const DISK_SIZE = DISK.length;

export type Weight = "runup" | "hit" | "plain";

export interface Run {
	readonly text: string;
	readonly weight: Weight;
	readonly at: number;
}

/** the characters of a name collapsed into as few spans as their weights allow */
export function runsIn(name: string, matched: readonly number[]): readonly Run[] {
	const first = matched[0] ?? 0;
	const hits = new Set(matched);
	const out: Run[] = [];
	for (let i = 0; i < name.length; i++) {
		const weight: Weight = hits.has(i) ? "hit" : i < first ? "runup" : "plain";
		const last = out.at(-1);
		if (last !== undefined && last.weight === weight) {
			out[out.length - 1] = { text: last.text + name.charAt(i), weight, at: last.at };
		} else {
			out.push({ text: name.charAt(i), weight, at: i });
		}
	}
	return out;
}
