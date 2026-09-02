import { useEffect, useRef, useState } from "react";
import type { PlayEntry, Turn, TurnPhase } from "shared/lib/turn-play";

/**
 * More than one conversation, and most of them somewhere you are not looking.
 *
 * The rail was designed for one thread. It is not one: a developer tasks an agent
 * on the page they are standing on, walks to another page, and starts a second one
 * there. So a thread is a conversation plus the page it was started from, and the
 * hard states are the two you cannot see from here.
 *
 * Five lives, and three of them need a mark:
 *
 *   streaming   the thread in the rail right now. The transcript already says it,
 *               so the mark is only there to keep the row aligned with its
 *               neighbours.
 *   running     working on another page. A turning ring, colourless, because state
 *               in this rail is motion and the one accent belongs to the selection.
 *   waiting     stopped, and only a person can move it: parked on a question (#145)
 *               or bounced off a login (#127). The disc held inside the ring, and
 *               the loudest of the three on purpose — it is the only one of them
 *               that is actually stuck. Settled in #161.
 *   unread      it finished while you were away and nobody has read it. A solid
 *               dot at text strength, the way a mailbox says it, and still not the
 *               accent.
 *   read        nothing. An old thread is a name and a time.
 *
 * `waiting` and `unread` are told apart by what clears them, and that is the whole
 * reason they are two states rather than one drawing. Opening a thread reads it, so
 * `unread` clears on a look. Nothing about looking answers a question, so `waiting`
 * clears only when the person acts — which is why the clearing rule below fires on
 * `unread` alone and must keep doing so.
 *
 * The threads below are captures rather than inventions. `takes` is
 * claude-fanout.json, three designers on one frame, one landed and two still
 * turning. `home` and `copy-deck` are rows and prose lifted verbatim out of
 * claude-turn.json and claude-plan.json. The human's own asks are the only strings
 * here written by hand, because a prompt is the one thing in a transcript that was
 * never the agent's.
 *
 * A thread's one line is the rail's line: spool's nouns, `write cart--empty-b`
 * rather than `Writing design/frames/cart--empty-b/frame.tsx`, which is the same
 * projection the transcript already does to the same event.
 */

export type Life = "streaming" | "running" | "waiting" | "unread" | "read";

export interface Thread {
	readonly id: string;
	/** the page it was started from, and the page its frames live on */
	readonly page: string;
	/** what the human asked, in the human's words: the only name a thread has */
	readonly ask: string;
	readonly life: Life;
	/** how long since it last did anything */
	readonly since: string;
	/** the last line it wrote, in the rail's nouns */
	readonly last: string;
	/** what the rail draws when this thread is the open one */
	readonly entries: readonly PlayEntry[];
}

const shot = (frame: string) => ({
	path: `design/.spool/verify/${frame}.png`,
	media: "image/png",
	frame,
});

/**
 * Three designers on one empty cart, two of them still going.
 *
 * Verbatim from claude-fanout.json: the parent's own prose, its reference shot of
 * `cart`, and the three delegate descriptions. One task_updated landed inside the
 * window, so one row is checked and two are turning, and the live step behind each
 * is the task_progress snapshot it was on.
 */
const TAKES: readonly PlayEntry[] = [
	{ key: "takes-ask", kind: "user", text: "three takes on the empty cart, keep the house look" },
	{
		key: "takes-say",
		kind: "prose",
		full: "Three designers are running. While they work, let me shoot the existing cart as my reference for the house look.",
		shown:
			"Three designers are running. While they work, let me shoot the existing cart as my reference for the house look.",
	},
	{ key: "takes-shot", kind: "line", state: "done", verb: "shot", subject: "cart" },
	{ key: "takes-look", kind: "line", state: "done", verb: "look", subject: "cart", shot: shot("cart") },
	{ key: "takes-d1", kind: "line", state: "done", verb: "delegate", subject: "Design cart--empty restrained" },
	{
		key: "takes-d2",
		kind: "line",
		state: "running",
		verb: "delegate",
		subject: "Design cart--empty-b re-order",
		detail: "write cart--empty-b",
	},
	{
		key: "takes-d3",
		kind: "line",
		state: "running",
		verb: "delegate",
		subject: "Design cart--empty-c expressive",
		detail: "look cart--empty-c",
	},
];

/**
 * The one that finished while you were on another page.
 *
 * Its shape is the verify end of claude-turn.json, `spool shot home` and a Read of
 * the PNG that comes back, and the sentence in the middle is claude-plan.json's
 * verbatim. It found a real problem, fixed it, shot it again, and then nobody
 * looked.
 */
const HOME: readonly PlayEntry[] = [
	{ key: "home-ask", kind: "user", text: "shoot home and fix whatever reads wrong" },
	{ key: "home-shot", kind: "line", state: "done", verb: "shot", subject: "home" },
	{ key: "home-look", kind: "line", state: "done", verb: "look", subject: "home", shot: shot("home") },
	{
		key: "home-say",
		kind: "prose",
		full: "Home renders correctly and all numbers reconcile. One real problem: ~130px of dead space above the CTA. Absorbing it into row height and rhythm.",
		shown:
			"Home renders correctly and all numbers reconcile. One real problem: ~130px of dead space above the CTA. Absorbing it into row height and rhythm.",
	},
	{ key: "home-edit", kind: "line", state: "done", verb: "edit", subject: "home" },
	{ key: "home-shot2", kind: "line", state: "done", verb: "shot", subject: "home" },
	{ key: "home-look2", kind: "line", state: "done", verb: "look", subject: "home", shot: shot("home") },
];

/** An hour old and already read. Rows and prose out of claude-turn.json. */
const DECK: readonly PlayEntry[] = [
	{ key: "deck-ask", kind: "user", text: "write the swedish copy deck for the app frames" },
	{ key: "deck-write", kind: "line", state: "done", verb: "write", subject: "copy-deck.md" },
	{ key: "deck-check", kind: "line", state: "done", verb: "run", subject: "Check line count and em-dashes" },
	{
		key: "deck-say",
		kind: "prose",
		full: "The copy deck landed early. It ships its own state (2 of 5 done, different streak numbers) and a three-state legend, so I'll regenerate the data to match the copy rather than fight it.",
		shown:
			"The copy deck landed early. It ships its own state (2 of 5 done, different streak numbers) and a three-state legend, so I'll regenerate the data to match the copy rather than fight it.",
	},
];

/**
 * The threads that are not the one in the rail, in the order they were started.
 *
 * Two of them sit on `site`, which is not an accident. A page holds as many
 * conversations as you start there, and any design that reaches a thread through
 * its page has to answer for that.
 */
export const ELSEWHERE: readonly Thread[] = [
	{
		id: "deck",
		page: "site",
		ask: "write the swedish copy deck",
		life: "read",
		since: "1h",
		last: "run Check line count and em-dashes",
		entries: DECK,
	},
	{
		id: "home",
		page: "site",
		ask: "shoot home and fix what reads wrong",
		life: "unread",
		since: "22m",
		last: "look home",
		entries: HOME,
	},
	{
		id: "takes",
		page: "takes",
		ask: "three takes on the empty cart",
		life: "running",
		since: "now",
		last: "write cart--empty-b",
		entries: TAKES,
	},
];

/** the id the live capture plays under, so the strip and the list can find it */
export const LIVE = "live";

/** the page the live thread was started from, which is the page on screen */
export const LIVE_PAGE = "app";

/** the ask the live thread starts itself with */
export const LIVE_ASK = "plan the whole build before you write anything";

/**
 * These three frames answer a question about threads you are not watching, and
 * one of the three you have to see is the one that is streaming. So the live
 * thread sends itself once on boot rather than waiting to be typed into, and the
 * composer stays exactly as playable as it is on every other frame here.
 */
export function useAutoAsk(ready: boolean, send: (text: string) => void, text: string): void {
	const gone = useRef(false);
	useEffect(() => {
		if (!ready || gone.current) return;
		gone.current = true;
		// on the first frame after commit rather than on a beat, so a headless boot
		// catches a turn that is already running rather than one about to start
		const timer = window.setTimeout(() => send(text), 0);
		return () => window.clearTimeout(timer);
	}, [ready, send, text]);
}

/** what a thread was last seen doing, read off the rows it has so far */
export function lastLine(entries: readonly PlayEntry[]): string {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.kind !== "line") continue;
		return entry.subject === undefined ? entry.verb : `${entry.verb} ${entry.subject}`;
	}
	return "";
}

/**
 * The live thread, as a row in the same list as the rest.
 *
 * Its name is whatever the human typed, because that is a thread's only name and
 * there is nothing else to call it before the first reply lands.
 *
 * `waiting` outranks `streaming`, because a turn parked on a question is still
 * `playing` as far as `useTurn` is concerned — nothing past the hold is scheduled, so
 * the phase never settles — and that is exactly the case #161 found: the strip drew a
 * turning ring for a thread that had stopped and was burning nothing.
 */
export function liveThread(
	prompt: string,
	entries: readonly PlayEntry[],
	streaming: boolean,
	waiting = false,
): Thread {
	return {
		id: LIVE,
		page: LIVE_PAGE,
		ask: prompt === "" ? "new thread" : prompt,
		life: waiting ? "waiting" : streaming ? "streaming" : "read",
		since: "now",
		last: lastLine(entries),
		entries,
	};
}

/**
 * The threads a rail is holding, and which of them is open.
 *
 * The live one is a replay of a real capture and the other three are captures
 * standing still, so opening one swaps what the transcript is showing and nothing
 * else. Typing into a thread that is not the live one puts the message in that
 * thread and sets it running, which is what queueing into a conversation
 * somewhere else actually does, and is why the composer is never a dead control
 * here.
 *
 * Order is recency and it is settled once. Re-sorting a strip while its threads
 * work would move a name out from under a cursor that was already reaching for it.
 */
export function useDeck(entries: readonly PlayEntry[], turn: Turn) {
	const [open, setOpen] = useState<string>(LIVE);
	const [seen, setSeen] = useState<readonly string[]>([]);
	const [queued, setQueued] = useState<Readonly<Record<string, readonly PlayEntry[]>>>({});

	const live = liveThread(turn.prompt, entries, turn.phase === "playing");
	const others: readonly Thread[] = ELSEWHERE.map((thread) => {
		const said = queued[thread.id];
		if (said !== undefined) return { ...thread, life: "running", since: "now", entries: [...thread.entries, ...said] };
		// opening a thread is what reads it, wherever the opening happened: a click on
		// a tab, a pick in the list, or walking onto the page it belongs to
		if (thread.life === "unread" && seen.includes(thread.id)) return { ...thread, life: "read" };
		return thread;
	});
	const threads: readonly Thread[] = [live, ...others.slice().reverse()];
	const shown = threads.find((thread) => thread.id === open) ?? live;
	const isLive = shown.id === LIVE;

	const send = (text: string) => {
		if (isLive) {
			turn.send(text);
			return;
		}
		setQueued((prev) => {
			const had = prev[shown.id] ?? [];
			return { ...prev, [shown.id]: [...had, { key: `${shown.id}-said-${had.length}`, kind: "user", text }] };
		});
	};

	return {
		threads,
		open: shown,
		setOpen: (id: string) => {
			setOpen(id);
			setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]));
		},
		/** a thread that is not the live replay has no clock, so its composer is simply ready */
		phase: (isLive ? turn.phase : "idle") as TurnPhase,
		/** climbs on a replay and again on every switch, so the transcript arrives rather than cuts */
		run: isLive ? turn.run : 90 + threads.indexOf(shown),
		send,
		replay: isLive ? turn.replay : () => {},
	};
}
