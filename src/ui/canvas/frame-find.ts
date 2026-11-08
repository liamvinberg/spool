import { type Match, matchName } from "../../name-match";
import { pageName } from "../../page-path";
import type { ProjectedFrame } from "../api";
import { pageLabel, pageOf } from "./pages";

/**
 * Finding a frame in a project where most names share a long prefix.
 *
 * Plain substring finds but cannot rank, and with dozens of names sharing one
 * `--` family prefix, ranking is the entire product. The matcher itself is
 * `name-match.ts` — the folder chooser asks the same question of folder names (#251),
 * so the scoring lives where both can reach it. What is left here is what only
 * frames know (finder-wake, task 443): a frame answers by its name, then by its
 * page, a little behind the name so a tie goes to the name, and failing both, from
 * three letters up, by the words on its face, because a person remembers the
 * screen with the Renew button long before its folder name. Ties break by recency,
 * which is the same order the empty query uses, so one rule covers both.
 */

/** the page answering loses a tie with the name */
const PAGE_COST = 4;
/** what a frame says only answers from this many letters, so `ca` is never every frame with a card on it */
const SAID_FROM = 3;

export interface Hit {
	readonly frame: ProjectedFrame;
	/**
	 * indices into the frame's own name (its last segment, which is what a row
	 * prints) the query landed on, ascending; empty when the page or the words answered
	 */
	readonly matched: readonly number[];
	/** indices into the page's label, when the page answered */
	readonly page: readonly number[];
	/** the phrase on the frame that answered, when neither its name nor its page did */
	readonly said?: { readonly phrase: string; readonly matched: readonly number[] } | undefined;
	readonly score: number;
}

/** What each frame says, by name: the booth reads it off the frame as it photographs it. */
export type FrameWords = ReadonlyMap<string, readonly string[]>;

const NO_WORDS: FrameWords = new Map();

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
export function findFrames(
	query: string,
	frames: readonly ProjectedFrame[],
	words: FrameWords = NO_WORDS,
): readonly Hit[] {
	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return frames.map((frame) => ({ frame, matched: [], page: [], score: 0 }));

	const hits: { hit: Hit; fresh: number }[] = [];
	frames.forEach((frame, fresh) => {
		const byName = matchFrame(wanted, frame.name);
		const byPage = matchName(wanted, pageLabel(pageOf(frame)).toLowerCase());
		const pageScore = byPage === null ? null : byPage.score - PAGE_COST;
		if (byName !== null && (pageScore === null || byName.score >= pageScore)) {
			hits.push({ hit: { frame, matched: byName.matched, page: [], score: byName.score }, fresh });
		} else if (byPage !== null && pageScore !== null) {
			hits.push({ hit: { frame, matched: [], page: byPage.matched, score: pageScore }, fresh });
		} else {
			const said = saidOn(words.get(frame.name), wanted);
			// below every name and page that answered: the matcher never scores those under one
			if (said !== undefined) hits.push({ hit: { frame, matched: [], page: [], said, score: 0 }, fresh });
		}
	});
	hits.sort((a, b) => b.hit.score - a.hit.score || a.fresh - b.fresh);
	return hits.map((entry) => entry.hit);
}

/**
 * One frame against the query (#336). A frame is named by its path, and a row
 * prints its own name beside its page, so the query is asked of both: the own
 * name first, which keeps an exact name exact on any page, and the whole path
 * second, so typing across the page and the name finds it. What landed is said
 * against the own name, which is the only part a row draws the name's hits in.
 */
function matchFrame(wanted: string, name: string): Match | null {
	const leaf = pageName(name);
	const own = matchName(wanted, leaf.toLowerCase());
	const whole = leaf === name ? null : matchName(wanted, name.toLowerCase());
	if (whole === null || (own !== null && own.score >= whole.score)) return own;
	const offset = name.length - leaf.length;
	return { score: whole.score, matched: whole.matched.filter((at) => at >= offset).map((at) => at - offset) };
}

/** The first phrase on a frame holding the query, one where it starts a word before one where it does not. */
function saidOn(phrases: readonly string[] | undefined, wanted: string): Hit["said"] {
	if (phrases === undefined || wanted.length < SAID_FROM) return undefined;
	let best: { phrase: string; at: number; start: boolean } | undefined;
	for (const phrase of phrases) {
		const at = phrase.toLowerCase().indexOf(wanted);
		if (at < 0) continue;
		const start = at === 0 || !/[\p{L}\p{N}]/u.test(phrase.charAt(at - 1));
		if (best === undefined || (start && !best.start)) best = { phrase, at, start };
		if (start) break;
	}
	if (best === undefined) return undefined;
	const from = best.at;
	return { phrase: best.phrase, matched: Array.from({ length: wanted.length }, (_, i) => from + i) };
}

/**
 * How long ago something happened, worded the way the finder's rows print it.
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
