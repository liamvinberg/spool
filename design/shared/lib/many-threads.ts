import { useEffect, useRef, useState } from "react";
import { ELSEWHERE, LIVE, lastLine, type Life, liveThread, type Thread } from "./agent-threads";
import type { PlayEntry, Turn, TurnPhase } from "./turn-play";

/**
 * Twelve conversations in one project, and the four populations a switcher has to
 * survive.
 *
 * `agent-threads.ts` holds three threads plus the live one, which is the population
 * #136 and #144 argued the strip against. Four is the easy case. The question the
 * `agent-many--*` frames reopen is what happens at one, at twelve, and while
 * something you are not watching finishes — so the deck has to go further than four
 * without inventing a transcript.
 *
 * **Nothing here is written prose.** The eight extra threads carry the three archived
 * transcripts `agent-threads.ts` already lifted out of `claude-fanout.json`,
 * `claude-turn.json` and `claude-plan.json`, cycled. The only strings written by hand
 * are the asks, which is the one part of a transcript that was always the human's —
 * and four of them are verbatim from the running app rather than invented:
 * `what is this?`, `so when the shot patches…` (the app truncates it mid-word at
 * `its li…`, and the tail here is the sentence it was cut out of), `new thread`, and
 * the empty one that produces it.
 *
 * **The unstarted thread is a real member.** `fresh` has no ask and no entries: the
 * plus was pressed an hour ago and nothing was ever typed. Every take has to say what
 * that reads as, so it is in the deck rather than described in a comment.
 */

/** the three archived transcripts, in the order `agent-threads.ts` declares them */
const SOURCE = ELSEWHERE;

interface Seed {
	readonly id: string;
	/** the human's own words, or empty for a thread nobody has typed into */
	readonly ask: string;
	readonly life: Life;
	readonly since: string;
	/** which of the three archived transcripts this thread is playing back */
	readonly from: number;
}

/**
 * The eleven that are not the live one, newest first.
 *
 * Order is recency and it is fixed once, which is the rule the strip settled and none
 * of these takes reopens: a list that re-sorted as its threads worked would move a row
 * out from under a cursor already reaching for it.
 */
const SEEDS: readonly Seed[] = [
	{ id: "takes", ask: "three takes on the empty cart", life: "running", since: "now", from: 2 },
	{ id: "notion", ask: "check what the tokens are called in Notion", life: "waiting", since: "6m", from: 0 },
	{ id: "home", ask: "shoot home and fix what reads wrong", life: "unread", since: "22m", from: 1 },
	{ id: "what", ask: "what is this?", life: "read", since: "38m", from: 0 },
	{
		id: "patch",
		ask: "so when the like shot patches or disappears its line should say that rather than sitting there",
		life: "read",
		since: "1h",
		from: 1,
	},
	{ id: "fresh", ask: "", life: "read", since: "1h", from: -1 },
	{ id: "deck", ask: "write the swedish copy deck", life: "read", since: "2h", from: 0 },
	{ id: "receipt", ask: "tidy the receipt and shoot it", life: "read", since: "3h", from: 1 },
	{ id: "say", ask: "explain what you just changed", life: "read", since: "5h", from: 2 },
	{ id: "checkout", ask: "redo the whole checkout", life: "read", since: "1d", from: 1 },
	{ id: "setup", ask: "set up the thing we talked about", life: "unread", since: "2d", from: 0 },
];

const seeded = (seed: Seed): Thread => {
	const entries: readonly PlayEntry[] = seed.from < 0 ? [] : (SOURCE[seed.from]?.entries ?? []);
	return {
		id: seed.id,
		page: SOURCE[Math.max(seed.from, 0)]?.page ?? "app",
		ask: seed.ask,
		life: seed.life,
		since: seed.since,
		last: lastLine(entries),
		entries,
	};
};

/** what a thread with nothing typed into it is called, and it is the machine saying it */
export const UNSTARTED = "new thread";

/** the human's own sentence, or the machine's word for a thread that has none */
export function askOf(thread: Thread): string {
	return thread.ask === "" ? UNSTARTED : thread.ask;
}

/** the project's own frames, which is the only list that makes a subject a place (#143) */
export const HAVE = [
	"cart",
	"menu",
	"receipt",
	"home",
	"cart--empty",
	"cart--empty-b",
	"cart--empty-c",
] as const;

/**
 * What a thread has written, in the order it wrote it.
 *
 * Reads the rows the transcript already draws rather than anything new: a `write` or an
 * `edit` names its subject, and a delegate row carries its own live step in `detail`
 * (`write cart--empty-b`), which is how the fan-out's three sub-agents say what they are
 * touching. A `look` or a `shot` is not counted — reading a frame is not changing it.
 *
 * It returns file names as readily as frame names, and the difference matters to exactly
 * one take: `copy-deck.md` is a perfectly good name for a thread and a hopeless place to
 * stand on a canvas.
 */
export function wroteOf(entries: readonly PlayEntry[]): readonly string[] {
	const out: string[] = [];
	for (const entry of entries) {
		if (entry.kind !== "line") continue;
		const names: string[] = [];
		if ((entry.verb === "write" || entry.verb === "edit") && entry.subject !== undefined) names.push(entry.subject);
		const detail = entry.detail;
		if (detail !== undefined && detail.startsWith("write ")) names.push(detail.slice("write ".length));
		for (const name of names) if (!out.includes(name)) out.push(name);
	}
	return out;
}

/**
 * What each seeded thread's work landed on, declared rather than read.
 *
 * The eight extra threads borrow three archived transcripts between them, so the rows
 * inside a thread and the sentence at the top of it are not about the same frame — which
 * is fine for a switcher and useless for the one take that stands a conversation next to
 * its own work. So each seed says what it wrote, and only the live thread derives it from
 * the capture it is actually playing. Three of them wrote nothing at all, one wrote a
 * document rather than a frame, and one wrote a frame on another page: those five are the
 * honest population, not a convenience.
 */
const WROTE: Readonly<Record<string, readonly string[]>> = {
	takes: ["cart--empty-b", "cart--empty-c"],
	notion: [],
	home: ["home"],
	what: [],
	patch: ["receipt"],
	fresh: [],
	deck: ["copy-deck.md"],
	receipt: ["receipt"],
	say: [],
	checkout: ["cart", "menu", "receipt"],
	setup: ["menu"],
};

/** what a thread wrote, declared for the seeded ones and read off the capture for the live one */
export function wroteFor(thread: Thread): readonly string[] {
	return WROTE[thread.id] ?? wroteOf(thread.entries);
}

/** only the ones that are frames this project holds, which is all a canvas can point at */
export function framesOf(entries: readonly PlayEntry[]): readonly string[] {
	return wroteOf(entries).filter((name) => (HAVE as readonly string[]).includes(name));
}

/** the same filter, for a thread whose work is declared */
export function framesFor(thread: Thread): readonly string[] {
	return wroteFor(thread).filter((name) => (HAVE as readonly string[]).includes(name));
}

/**
 * One population, and it is a state rather than a variation.
 *
 * `agent-chat` set the precedent this page runs on: a picker below the app is a case
 * list when every case is a state the product will have, and a switcher inside a frame
 * only ever when it is comparing designs. Every take here draws one design against four
 * populations, so the picker is the case list and the five takes are five frames.
 */
export interface ManyCase {
	readonly id: string;
	/** which threads exist, in recency order, `live` included */
	readonly ids: readonly string[];
	/** which one the rail is drawing */
	readonly open: string;
	/** a thread that finishes while you are watching a different one */
	readonly land?: { readonly id: string; readonly at: number } | undefined;
	readonly says: string;
}

export const MANY_CASES: readonly ManyCase[] = [
	{
		id: "one",
		ids: [LIVE],
		open: LIVE,
		says: "one conversation, which is every project on its first day",
	},
	{
		id: "four",
		ids: [LIVE, "takes", "home", "deck"],
		open: LIVE,
		says: "the four #136 argued the strip against: one streaming, one working, one unread, one old",
	},
	{
		id: "twelve",
		ids: [LIVE, ...SEEDS.map((seed) => seed.id)],
		open: LIVE,
		says: "twelve, with an unstarted one, a parked one and the app's own truncated ask in it",
	},
	{
		id: "elsewhere",
		ids: [LIVE, ...SEEDS.map((seed) => seed.id)],
		open: "deck",
		land: { id: "takes", at: 6000 },
		says: "you are reading a two-hour-old thread. the live one streams and the takes land at 6s",
	},
];

export interface ManyDeck {
	readonly threads: readonly Thread[];
	readonly open: Thread;
	readonly setOpen: (id: string) => void;
	readonly phase: TurnPhase;
	readonly run: number;
	readonly send: (text: string) => void;
	readonly replay: () => void;
	/** how many are working or waiting on somebody, which is what an aggregate mark counts */
	readonly moving: readonly Thread[];
}

/**
 * The deck a take is holding, and which of it is open.
 *
 * It is `useDeck`'s shape with three things it does not have: a population chosen by the
 * case rather than fixed at four, an open thread that need not be the live one, and a
 * landing — a thread that goes from working to unread on a timer, so a take can be
 * judged on the one moment the whole feature exists for rather than on a still.
 *
 * Opening a thread reads it, wherever the opening happened. Nothing about looking
 * answers a question, so `waiting` never clears here, which is #161's rule kept.
 */
export function useManyDeck(entries: readonly PlayEntry[], turn: Turn, spec: ManyCase): ManyDeck {
	const [open, setOpen] = useState<string>(spec.open);
	const [seen, setSeen] = useState<readonly string[]>([]);
	const [landed, setLanded] = useState(false);
	const [said, setSaid] = useState<Readonly<Record<string, readonly PlayEntry[]>>>({});
	const land = spec.land;

	// the landing is on the frame's own clock rather than the capture's, because no
	// capture holds two conversations and the moment being drawn is between them
	useEffect(() => {
		if (land === undefined) return;
		const timer = window.setTimeout(() => setLanded(true), land.at);
		return () => window.clearTimeout(timer);
	}, [land]);

	const isLive = open === LIVE;
	const live: Thread = {
		...liveThread(turn.prompt, entries, turn.phase === "playing" && isLive),
		// a turn that is running while you read something else is `running`, not `streaming`:
		// streaming means *this rail is drawing it*, and here it is not
		life: turn.phase === "playing" ? (isLive ? "streaming" : "running") : "read",
	};

	const built: readonly Thread[] = [live, ...SEEDS.map(seeded)];
	const threads: readonly Thread[] = spec.ids
		.map((id) => built.find((thread) => thread.id === id))
		.filter((thread): thread is Thread => thread !== undefined)
		.map((thread) => {
			const extra = said[thread.id];
			const withSaid =
				extra === undefined
					? thread
					: { ...thread, life: "running" as Life, since: "now", entries: [...thread.entries, ...extra] };
			if (land !== undefined && landed && withSaid.id === land.id && withSaid.life === "running") {
				return { ...withSaid, life: "unread" as Life, since: "now" };
			}
			if (withSaid.life === "unread" && seen.includes(withSaid.id)) return { ...withSaid, life: "read" as Life };
			return withSaid;
		});

	const shown = threads.find((thread) => thread.id === open) ?? (threads[0] as Thread);

	return {
		threads,
		open: shown,
		setOpen: (id: string) => {
			setOpen(id);
			setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]));
		},
		phase: (shown.id === LIVE ? turn.phase : "idle") as TurnPhase,
		// climbs on every switch so the transcript arrives rather than cuts
		run: shown.id === LIVE ? turn.run : 90 + threads.indexOf(shown),
		send: (text: string) => {
			if (shown.id === LIVE) {
				turn.send(text);
				return;
			}
			setSaid((prev) => {
				const had = prev[shown.id] ?? [];
				return { ...prev, [shown.id]: [...had, { key: `${shown.id}-said-${had.length}`, kind: "user", text }] };
			});
		},
		replay: shown.id === LIVE ? turn.replay : () => {},
		moving: threads.filter(
			(thread) => thread.life === "running" || thread.life === "waiting" || thread.life === "unread",
		),
	};
}

/**
 * The case the frame is showing, remounted when it changes.
 *
 * Every take needs this and none of them needs it to be clever: the picker holds an id,
 * the frame looks the case up, and the subtree is keyed on it so switching a population
 * starts a clean clock rather than resuming somebody else's.
 */
export function useManyCase(): { picked: ManyCase; pick: (id: string) => void } {
	const [id, setId] = useState<string>(MANY_CASES[0]?.id ?? "one");
	const picked = MANY_CASES.find((entry) => entry.id === id) ?? (MANY_CASES[0] as ManyCase);
	return { picked, pick: setId };
}

/** the live thread sends itself once, so a still of any of these frames catches a turn running */
export function useOnce(ready: boolean, run: () => void): void {
	const gone = useRef(false);
	useEffect(() => {
		if (!ready || gone.current) return;
		gone.current = true;
		const timer = window.setTimeout(run, 0);
		return () => window.clearTimeout(timer);
	}, [ready, run]);
}
