import { useEffect, useMemo, useState } from "react";
import { type Life, type Thread, liveThread } from "./agent-threads";
import type { PlayEntry, Turn, TurnPhase } from "./turn-play";

/**
 * Twelve conversations, for the frames that ask where the switcher goes.
 *
 * `agent-threads.ts` carries three threads beside the live one, which was enough
 * to argue #136 and #144 and is not enough to argue this: every candidate for
 * taking the threads out of the rail is cheap at four and the whole question is
 * what it does at twelve. So this is that deck, and nothing in it is invented
 * loosely — the asks are the shape real asks have, three of them verbatim from
 * the running app (`what is this?`, the long one that gets cut mid-word, and
 * `new thread`), and every last line is written in the rail's own nouns the way
 * `lastLine` would project it.
 *
 * A thread carries one field the shipped one does not: the frames it wrote. That
 * is not decoration. `agent-threads.ts` in `src/` rejects naming a conversation
 * with a side call to a cheap model — *silent spend on somebody's own
 * subscription for a label* — and records that the binary's own generated title
 * never reaches print mode. What is left, if the ask is not the answer, is what
 * the thread did, and spool already knows that: it draws `write cart--empty-b`
 * in the log. `work()` below is that reading, and it costs nothing.
 */

export interface DeckThread extends Thread {
	/** the frames this conversation wrote, in the order it wrote them */
	readonly frames: readonly string[];
}

const said = (id: string, text: string): PlayEntry => ({ key: `${id}-ask`, kind: "user", text });

const did = (id: string, n: number, verb: string, subject?: string): PlayEntry => ({
	key: `${id}-${n}`,
	kind: "line",
	state: "done",
	verb,
	...(subject === undefined ? {} : { subject }),
});

const wrote = (id: string, text: string): PlayEntry => ({ key: `${id}-say`, kind: "prose", full: text, shown: text });

interface Seed {
	readonly id: string;
	readonly page: string;
	readonly ask: string;
	readonly life: Life;
	readonly since: string;
	readonly frames: readonly string[];
	readonly rows: readonly (readonly [string, string | undefined])[];
	readonly says?: string;
}

/**
 * The eleven that are not the live one, oldest last.
 *
 * Recency order is fixed once and nothing re-sorts, which is #136's rule and this
 * deck inherits it whole: a row that re-ordered as its threads worked would move a
 * name out from under a cursor already reaching for it. Every take here depends on
 * that rule harder than the strip did, and `--marks` depends on it absolutely.
 */
const SEEDS: readonly Seed[] = [
	{
		id: "takes",
		page: "app",
		ask: "three takes on the empty cart",
		life: "running",
		since: "now",
		frames: ["cart--empty", "cart--empty-b", "cart--empty-c"],
		rows: [
			["shot", "cart"],
			["look", "cart"],
			["delegate", "Design cart--empty restrained"],
			["write", "cart--empty-b"],
		],
		says: "Three designers are running. While they work, let me shoot the existing cart as my reference for the house look.",
	},
	{
		id: "new",
		page: "app",
		ask: "",
		life: "read",
		since: "2m",
		frames: [],
		rows: [],
	},
	{
		id: "home",
		page: "site",
		ask: "shoot home and fix what reads wrong",
		life: "unread",
		since: "22m",
		frames: ["home"],
		rows: [
			["shot", "home"],
			["look", "home"],
			["edit", "home"],
			["look", "home"],
		],
		says: "Home renders correctly and all numbers reconcile. One real problem: ~130px of dead space above the CTA. Absorbing it into row height and rhythm.",
	},
	{
		id: "shot",
		page: "app",
		ask: "so when the like shot patches or disappears its list has to say so",
		life: "waiting",
		since: "26m",
		frames: [],
		rows: [
			["read", "src/daemon/shots.ts"],
			["ask", "spool"],
		],
	},
	{
		id: "empty",
		page: "app",
		ask: "make the empty cart say something useful",
		life: "unread",
		since: "33m",
		frames: ["cart--empty"],
		rows: [
			["write", "cart--empty"],
			["shot", "cart--empty"],
			["look", "cart--empty"],
		],
	},
	{
		id: "what",
		page: "app",
		ask: "what is this?",
		life: "read",
		since: "41m",
		frames: [],
		rows: [
			["read", "design/AGENTS.md"],
			["read", "CONTEXT.md"],
		],
		says: "This is spool's own dogfood canvas. Every frame under design/frames is a live TSX component the canvas renders.",
	},
	{
		id: "page",
		page: "app",
		ask: "move the checkout frames onto their own page",
		life: "read",
		since: "55m",
		frames: ["cart", "receipt"],
		rows: [
			["run", "Move two folders"],
			["write", "receipt"],
		],
	},
	{
		id: "tidy",
		page: "app",
		ask: "tidy the receipt and shoot it",
		life: "read",
		since: "74m",
		frames: ["receipt"],
		rows: [
			["edit", "receipt ×6"],
			["shot", "receipt"],
			["look", "receipt"],
		],
	},
	{
		id: "tokens",
		page: "site",
		ask: "check what the tokens are called in Notion",
		life: "read",
		since: "96m",
		frames: [],
		rows: [
			["ask", "Notion"],
			["read", "design/shared/tokens.css"],
		],
	},
	{
		id: "total",
		page: "app",
		ask: "why does the receipt total round down",
		life: "read",
		since: "2h",
		frames: ["receipt"],
		rows: [
			["read", "receipt"],
			["edit", "receipt"],
		],
	},
	{
		id: "deck",
		page: "site",
		ask: "write the swedish copy deck",
		life: "read",
		since: "3h",
		frames: [],
		rows: [
			["write", "copy-deck.md"],
			["run", "Check line count and em-dashes"],
		],
	},
];

function threadOf(seed: Seed): DeckThread {
	const rows = seed.rows.map(([verb, subject], index) => did(seed.id, index, verb, subject));
	const tail = seed.rows.at(-1);
	return {
		id: seed.id,
		page: seed.page,
		ask: seed.ask === "" ? "new thread" : seed.ask,
		life: seed.life,
		since: seed.since,
		last: tail === undefined ? "" : tail[1] === undefined ? tail[0] : `${tail[0]} ${tail[1]}`,
		entries:
			seed.rows.length === 0
				? []
				: seed.says === undefined
					? [said(seed.id, seed.ask), ...rows]
					: [said(seed.id, seed.ask), ...rows.slice(0, -1), wrote(seed.id, seed.says), ...rows.slice(-1)],
		frames: seed.frames,
	};
}

/** the eleven, newest first, which is the order every row here draws them in */
export const OTHERS: readonly DeckThread[] = SEEDS.map(threadOf);

/** which of the eleven each case holds, beside the live one */
const CASES: Record<DeckCase, readonly string[]> = {
	one: [],
	four: ["takes", "new", "home"],
	twelve: SEEDS.map((seed) => seed.id),
	elsewhere: ["takes", "shot", "home"],
};

export type DeckCase = "one" | "four" | "twelve" | "elsewhere";

export const CASE_SAYS: Record<DeckCase, string> = {
	one: "one conversation, which is every project on its first day",
	four: "four: the live one, one working elsewhere, one unstarted, one nobody has read",
	twelve: "twelve, which is where every candidate for this either holds or gives up",
	elsewhere: "watch it: the thread working somewhere else finishes while you are reading this one",
};

/**
 * The deck a frame is holding, and which of them is open.
 *
 * The live thread is the capture playing in the rail; the rest stand still, so
 * opening one swaps what the transcript is showing and runs nothing. On the
 * `elsewhere` case one of them finishes five seconds in, which is the only state
 * on this page that cannot be drawn as a still: the whole point of more than one
 * agent is finding out that something landed while you were looking away.
 */
export function useDeck(entries: readonly PlayEntry[], turn: Turn, deck: DeckCase) {
	const [open, setOpen] = useState<string>("live");
	const [seen, setSeen] = useState<readonly string[]>([]);
	const [landed, setLanded] = useState(false);

	useEffect(() => {
		if (deck !== "elsewhere") return;
		const timer = window.setTimeout(() => setLanded(true), 5000);
		return () => window.clearTimeout(timer);
	}, [deck]);

	const held = CASES[deck];
	const others = useMemo(
		() =>
			OTHERS.filter((thread) => held.includes(thread.id)).map((thread): DeckThread => {
				// a thread finishing while you watch another one is the case, so it lands
				// unread rather than quietly going read behind your back
				if (landed && thread.id === "takes") return { ...thread, life: "unread", since: "now" };
				// opening a thread is what reads it, wherever the opening happened
				if (thread.life === "unread" && seen.includes(thread.id)) return { ...thread, life: "read" };
				return thread;
			}),
		[held, seen, landed],
	);

	// the live capture is a planning turn: nine and a half minutes of reading and one
	// plan, and not one frame written yet. Left empty on purpose, because it is the
	// case the work reading has to fall back on
	const live: DeckThread = { ...liveThread(turn.prompt, entries, turn.phase === "playing"), frames: [] };
	const threads: readonly DeckThread[] = [live, ...others];
	const shown = threads.find((thread) => thread.id === open) ?? live;
	const isLive = shown.id === "live";

	return {
		threads,
		open: shown,
		setOpen: (id: string) => {
			setOpen(id);
			setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]));
		},
		phase: (isLive ? turn.phase : "idle") as TurnPhase,
		/** climbs on every switch, so a swapped transcript arrives rather than cuts */
		run: isLive ? turn.run : 90 + threads.indexOf(shown),
		/** how many of the deck are doing something a person would want to know about */
		astir: threads.filter((thread) => thread.life === "running" || thread.life === "waiting").length,
		/** the loudest thing happening in a thread that is not the open one */
		loudest: loudestOf(threads.filter((thread) => thread.id !== shown.id)),
	};
}

/**
 * What a mark draws for the thread you are already reading, which is nothing (#200).
 *
 * `ThreadMark` still turns a ring for `streaming`, and the shipped strip does not: a
 * spinner beside the name of the transcript in front of you is a second spinner saying
 * what the transcript is already saying. The design folder lags the code here, so every
 * frame in this family passes its marks through this on the way in.
 */
export function drawn(life: Life): Life {
	return life === "streaming" ? "read" : life;
}

const RANK: Record<Life, number> = { waiting: 4, running: 3, unread: 2, streaming: 1, read: 0 };

/** the one mark a single cell has to stand for all of them with */
export function loudestOf(threads: readonly Thread[]): Life {
	let best: Life = "read";
	for (const thread of threads) if (RANK[thread.life] > RANK[best]) best = thread.life;
	return best;
}

/* ---------- what a thread is called ----------
 *
 * Three readings, one per frame that needs one. None of them asks a model
 * anything, because `src/ui/canvas/agent-threads.ts` already settled that spool
 * does not spend somebody's subscription on a label.
 */

/** the ask, exactly as it was typed. The reading every shipped surface uses. */
export function whole(thread: Thread): string {
	return thread.ask;
}

/**
 * The ask cut at a word, inside a budget, with no ellipsis.
 *
 * The break in the shipped name is not that it is long, it is that it is cut mid
 * word: `so when the like shot patches or disappears its li…` ends on a fragment
 * that is not a word in any language, and the eye stops on it. Cutting at the
 * last space before the budget ends on `its`, which reads as a title someone
 * wrote badly rather than as a string someone sliced. Better still, a clause mark
 * before the budget ends the name where the sentence itself paused.
 *
 * No ellipsis, on #184's own finding about the model name: an ellipsis says *this
 * is a cut string*, and a name that admits it is a cut string is not a name. What
 * is dropped is one press away in the list, in every take that has a list.
 */
const CLAUSE = /[,;:]|\s(?:and|or|but|so|then|that|which|because|when|while|if|before|after)\s/g;

export function clause(thread: Thread, budget: number): string {
	const ask = thread.ask;
	if (ask.length <= budget) return ask;
	const head = ask.slice(0, budget + 1);
	let cut = -1;
	// a clause mark in the first few words is not a pause, it is the start of the
	// sentence — cutting `so when the like shot patches` at `so` names nothing, so a
	// clause only counts once it is past half the budget
	for (const match of head.matchAll(CLAUSE)) {
		const at = match.index + (match[0].length > 1 ? 0 : 1);
		if (at >= budget / 2) cut = at;
	}
	if (cut < 0) cut = head.lastIndexOf(" ");
	return (cut < 0 ? head.slice(0, budget) : ask.slice(0, cut)).trimEnd();
}

/**
 * What the thread did, rather than what was said to it.
 *
 * A run of frames sharing a stem collapses the way #135 already collapses a run
 * of edits in the log: `cart--empty ×3`, one noun and a count. A thread that has
 * written nothing falls back to its last line, and one that has done nothing at
 * all is `new thread`, which is what an unstarted thread has always read as.
 */
export function work(thread: DeckThread): string {
	const frames = thread.frames;
	// the fallback chain, and it is two rules rather than one: what it wrote, then the
	// last thing it did, then what was asked. A thread that has only read and planned
	// has nothing of its own to be called
	if (frames.length === 0) return thread.last === "" ? thread.ask : thread.last;
	if (frames.length === 1) return frames[0] as string;
	const stem = stemOf(frames);
	return stem === "" ? `${frames.length} frames` : `${stem} ×${frames.length}`;
}

/** the longest shared prefix of a run of frame names, trimmed back to a seam */
function stemOf(frames: readonly string[]): string {
	const first = frames[0] ?? "";
	let end = first.length;
	for (const name of frames) {
		let index = 0;
		while (index < end && index < name.length && name[index] === first[index]) index += 1;
		end = index;
	}
	return first.slice(0, end).replace(/[-\s]+$/, "");
}

/** how many of a deck the work reading can actually name, which is not all of them */
export function named(threads: readonly DeckThread[]): number {
	return threads.filter((thread) => thread.frames.length > 0).length;
}
