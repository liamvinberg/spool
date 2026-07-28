/**
 * Finding a frame by name, in a project that has 88 of them and where 49 share
 * the same twelve characters.
 *
 * The Pages rail is a collapsed alphabetical list, so `agent` is one row reading
 * `55` and the frame you want is inside it. That is the number in
 * `agent-play--jump-quiet`'s docstring, and it is the whole reason a palette
 * exists: *"Finding `home` in it means knowing which page it is on."*
 *
 * Plain substring finds. It cannot rank, and with 49 names sharing a prefix,
 * ranking is the entire product. So this is a subsequence matcher with four
 * rules, and every one of them is here because a real query in this project
 * needed it:
 *
 *   boundary   a character landing at the start of a segment is worth 14, one
 *              landing mid-segment is worth 1. `nav` inside `--nav-dock` is a
 *              name; `nav` inside some longer word is a coincidence.
 *   run        a character immediately after the previous one is worth 8 more.
 *              Solid beats scattered, always.
 *   skip       every character you stepped over inside the match costs 10. Without
 *              this, `plan` scores *higher* on `agent-play--nav-dock` than on
 *              `agent-play--plan-log`, because `pla` + a boundary `n` collects two
 *              boundary bonuses and the real match only collects one. Try it.
 *   exact      a name that is exactly the query wins by 1000. `agent-play` and
 *              `agent-play--entered` are both frames and both are prefixes, so
 *              nothing else can separate them.
 *
 * What is deliberately *not* a rule: where in the name the match starts. People
 * type the variant tail, not the family. `drop` has to find `agent-play--ask-drop`
 * at full strength even though it lands sixteen characters in.
 *
 * Ties break by recency, which is the same order the empty query uses. One rule
 * covers both: score, then newest. And a match that spent more on skips than it
 * earned on hits is dropped, because it was never a match, it was a coincidence
 * that happened to be spellable.
 */

const DASH = 45; // "-"

const HIT = 1;
const BOUNDARY = 14;
const RUN = 8;
const SKIP = 10;
const EXACT = 1000;

export interface FrameRow {
	readonly name: string;
	readonly page: string;
	/** how long ago the folder appeared on disk, worded the way the empty list prints it */
	readonly age: string;
}

/**
 * Every frame in this project, newest folder first. Read off `design/frames/`
 * and its folder birth times, not invented: the point of the palette is how the
 * real `agent-play--` cluster reads, and lorem names would have hidden it.
 *
 * The four `spool-canvas--find-*` at the top are these four frames. They were the
 * newest thing on disk when this was captured, which is exactly the state the
 * empty list is for.
 */
export const FRAMES: readonly FrameRow[] = [
	{ name: "spool-canvas--find-dim", page: "app", age: "now" },
	{ name: "spool-canvas--find-tail", page: "app", age: "now" },
	{ name: "spool-canvas--find-split", page: "app", age: "now" },
	{ name: "spool-canvas--find-fresh", page: "app", age: "now" },
	{ name: "agent-mark--open", page: "agent", age: "3m" },
	{ name: "agent-mark--edge", page: "agent", age: "3m" },
	{ name: "agent-mark--label", page: "agent", age: "3m" },
	{ name: "agent-play--ask-drop", page: "agent", age: "41m" },
	{ name: "agent-play--ask-shelf", page: "agent", age: "58m" },
	{ name: "agent-play--ask-composer", page: "agent", age: "59m" },
	{ name: "agent-play--ask-log", page: "agent", age: "59m" },
	{ name: "agent-nav-strip", page: "agent", age: "1h" },
	{ name: "agent-play--nav-drawer", page: "agent", age: "1h" },
	{ name: "agent-play--nav-dock", page: "agent", age: "1h" },
	{ name: "agent-play--nav-pages", page: "agent", age: "1h" },
	{ name: "agent-play--nav-only", page: "agent", age: "1h" },
	{ name: "agent-nav-marks", page: "agent", age: "2h" },
	{ name: "agent-play--mcp-estate", page: "agent", age: "2h" },
	{ name: "agent-play--nav-shut", page: "agent", age: "2h" },
	{ name: "agent-play--mcp-steps", page: "agent", age: "2h" },
	{ name: "agent-play--mcp-quiet", page: "agent", age: "2h" },
	{ name: "agent-play--nav-host", page: "agent", age: "2h" },
	{ name: "agent-play--nav-edge", page: "agent", age: "2h" },
	{ name: "agent-play--mcp-raw", page: "agent", age: "2h" },
	{ name: "agent-play--nav-row", page: "agent", age: "2h" },
	{ name: "agent-play--mcp-tool", page: "agent", age: "2h" },
	{ name: "agent-play--mcp-ask", page: "agent", age: "2h" },
	{ name: "agent-play--jump-gone", page: "agent", age: "4h" },
	{ name: "agent-play--jump-quiet", page: "agent", age: "5h" },
	{ name: "agent-play--jump-row", page: "agent", age: "5h" },
	{ name: "agent-play--jump-name", page: "agent", age: "5h" },
	{ name: "agent-play--entered-said", page: "agent", age: "5h" },
	{ name: "agent-play--entered-quiet", page: "agent", age: "5h" },
	{ name: "agent-play--entered-drop", page: "agent", age: "5h" },
	{ name: "agent-play--wall-login", page: "agent", age: "5h" },
	{ name: "agent-play--entered", page: "agent", age: "5h" },
	{ name: "agent-play--wall-install", page: "agent", age: "5h" },
	{ name: "agent-play--edit-pass", page: "agent", age: "6h" },
	{ name: "agent-play--edit-run", page: "agent", age: "6h" },
	{ name: "agent-play--edit-log", page: "agent", age: "6h" },
	{ name: "site-frames--depth", page: "site", age: "8h" },
	{ name: "site-mobile--reveal", page: "site", age: "9h" },
	{ name: "site-mobile--real", page: "site", age: "9h" },
	{ name: "site-disk--write", page: "site", age: "9h" },
	{ name: "site-disk--reversible", page: "site", age: "9h" },
	{ name: "site-flows--graph", page: "site", age: "9h" },
	{ name: "site-flows--kaffe", page: "site", age: "9h" },
	{ name: "site-frames--stage", page: "site", age: "9h" },
	{ name: "site-mobile--install-first", page: "site", age: "9h" },
	{ name: "site-mobile--still-first", page: "site", age: "9h" },
	{ name: "site-mobile", page: "site", age: "9h" },
	{ name: "agent-play--limit-stop", page: "agent", age: "9h" },
	{ name: "agent-play--limit-strip", page: "agent", age: "9h" },
	{ name: "agent-play--limit-line", page: "agent", age: "9h" },
	{ name: "agent-play--threads-menu", page: "agent", age: "10h" },
	{ name: "agent-play--threads-placed", page: "agent", age: "10h" },
	{ name: "agent-play--threads-strip", page: "agent", age: "10h" },
	{ name: "agent-play--model-engines", page: "agent", age: "16h" },
	{ name: "agent-play--model-menu", page: "agent", age: "16h" },
	{ name: "agent-play--model-line", page: "agent", age: "16h" },
	{ name: "agent-play--shot-inline", page: "agent", age: "16h" },
	{ name: "agent-play--shot-open", page: "agent", age: "16h" },
	{ name: "agent-play--shot-line", page: "agent", age: "16h" },
	{ name: "agent-play--plan-pinned", page: "agent", age: "16h" },
	{ name: "agent-play--plan-log", page: "agent", age: "16h" },
	{ name: "agent-play", page: "agent", age: "16h" },
	{ name: "agent-play--context", page: "agent", age: "16h" },
	{ name: "agent-play--plural", page: "agent", age: "16h" },
	{ name: "agent-play--plural-many", page: "agent", age: "16h" },
	{ name: "agent-play--subagents", page: "agent", age: "16h" },
	{ name: "site-hub--composed", page: "site", age: "16h" },
	{ name: "site-states", page: "site", age: "17h" },
	{ name: "site-hub--tutorial", page: "site", age: "18h" },
	{ name: "site-hub--shell", page: "site", age: "18h" },
	{ name: "site-hub--clone", page: "site", age: "18h" },
	{ name: "site-hub--annotated", page: "site", age: "18h" },
	{ name: "spool-home", page: "app", age: "3d" },
	{ name: "site-disk", page: "site", age: "3d" },
	{ name: "site-flows", page: "site", age: "3d" },
	{ name: "site-frames", page: "site", age: "3d" },
	{ name: "site-hub", page: "site", age: "3d" },
	{ name: "site-terminals", page: "site", age: "3d" },
	{ name: "directing--annotate", page: "directing", age: "3d" },
	{ name: "spool-player", page: "app", age: "4d" },
	{ name: "spool-canvas", page: "app", age: "5d" },
	{ name: "spool-canvas--menu", page: "app", age: "5d" },
	{ name: "spool-empty-project", page: "app", age: "5d" },
	{ name: "spool-system", page: "app", age: "5d" },
];

/** the Pages rail's own numbers, counted rather than typed, in the order it sorts them */
export function pageCounts(): readonly { readonly page: string; readonly count: number }[] {
	const counts = new Map<string, number>();
	for (const row of FRAMES) counts.set(row.page, (counts.get(row.page) ?? 0) + 1);
	return [...counts]
		.map(([page, count]) => ({ page, count }))
		.sort((a, b) => a.page.localeCompare(b.page));
}

export interface Hit {
	readonly row: FrameRow;
	/** indices into `row.name` the query landed on, ascending */
	readonly matched: readonly number[];
	readonly score: number;
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
 * The list the palette draws. An empty query is not an empty answer: it is every
 * frame, newest first, which is the loop this exists for. An agent says it made
 * six variations, you press `/`, and they are the top six with nothing typed.
 */
export function findFrames(query: string): readonly Hit[] {
	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return FRAMES.map((row) => ({ row, matched: [], score: 0 }));

	const hits: { hit: Hit; fresh: number }[] = [];
	FRAMES.forEach((row, fresh) => {
		const found = against(wanted, row.name.toLowerCase());
		// a match that spent more on skips than it earned on hits was a coincidence
		if (found === null || found.score <= 0) return;
		hits.push({ hit: { row, matched: found.matched, score: found.score }, fresh });
	});
	hits.sort((a, b) => b.hit.score - a.hit.score || a.fresh - b.fresh);
	return hits.map((entry) => entry.hit);
}

/**
 * How every row treatment weighs a character. Three zones and no more: the run-up
 * you did not ask for, the letters you typed, and the part of the name that comes
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
}

/** the characters of `name[from..to)` collapsed into as few spans as their weights allow */
export function runsIn(name: string, weights: readonly Weight[], from: number, to: number): readonly Run[] {
	const out: Run[] = [];
	for (let i = from; i < to; i++) {
		const weight = weights[i] ?? "plain";
		const last = out.at(-1);
		if (last !== undefined && last.weight === weight) out[out.length - 1] = { text: last.text + name.charAt(i), weight };
		else out.push({ text: name.charAt(i), weight });
	}
	return out;
}

export interface Segment {
	readonly text: string;
	/** where it starts in the whole name, so a weight lookup needs no offset arithmetic */
	readonly at: number;
	/** the run of dashes in front of it: "" at the head, then "-" or "--" */
	readonly gap: string;
}

/** a name cut on its dashes, keeping `--` whole because it is the variant seam and not two of anything */
export function segmentsOf(name: string): readonly Segment[] {
	const out: Segment[] = [];
	let i = 0;
	let gap = "";
	while (i < name.length) {
		let j = i;
		if (name.charAt(i) === "-") {
			while (j < name.length && name.charAt(j) === "-") j++;
			gap = name.slice(i, j);
			i = j;
			continue;
		}
		while (j < name.length && name.charAt(j) !== "-") j++;
		out.push({ text: name.slice(i, j), at: i, gap });
		gap = "";
		i = j;
	}
	return out;
}

export interface Split {
	readonly base: string;
	/** null when the frame is nobody's variant, which is a real and common case */
	readonly variant: string | null;
	/** where the variant starts in the whole name */
	readonly at: number;
}

export function splitVariant(name: string): Split {
	const seam = name.indexOf("--");
	if (seam < 0) return { base: name, variant: null, at: 0 };
	return { base: name.slice(0, seam), variant: name.slice(seam + 2), at: seam + 2 };
}
