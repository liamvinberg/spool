import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { DeckChange, DeckChangeAnswer, DeckRead, DecksRead } from "../../deck/wire";
import { pageParent } from "../../page-path";
import { controlFetch } from "../api";
import { experimentOn } from "../experiments";

/**
 * The window's side of a project's decks (spool#265): the deck read, kept current, and the one sender every deck
 * gesture goes through, whether it starts on the canvas, in the Pages rail or in Properties. Nothing here draws.
 *
 * - `createDeckReads` / `useDeckReads`: the project's `GET …/decks`, read again whenever the daemon says a deck
 *   changed (`tellDeckChange`, which the canvas's event stream calls), and taking a change's own answer at once.
 * - `useDeckRead`: one page's deck, or nothing when the page is no deck (or the experiment is off).
 * - `changeDeck`: send one intent; the answer goes into the reads and comes back as the one undo entry it makes.
 * - `walkDeck`: run that entry back or forward.
 */

/** The window event a deck change is passed on as, with the page in `detail`. */
export const DECK_CHANGE = "spool-deck-change";

/** The daemon said a deck page changed: every reader of the project's decks reads again. */
export function tellDeckChange(page: string): void {
	window.dispatchEvent(new CustomEvent(DECK_CHANGE, { detail: page }));
}

/** The window event a frame's change is passed on as, with the page holding it in `detail`. */
const DECK_FRAME = "spool-deck-frame";

/**
 * A frame changed on disk, its source or its place: when its page is a deck the deck is read again, since a frame
 * written onto a deck page from outside is a loose frame the deck did not hold before, and the gestures on the page
 * ask the deck where it stands.
 */
export function tellFrameChange(frame: string): void {
	window.dispatchEvent(new CustomEvent(DECK_FRAME, { detail: pageParent(frame) }));
}

/** The window event every change the daemon publishes is passed on as, for a talk playing in this window. */
const DECK_STAGE = "spool-deck-stage";

/** The daemon published a change: a talk playing here reads it with `stageChange`, and takes a new build if it must. */
export function tellStageChange(change: unknown): void {
	window.dispatchEvent(new CustomEvent(DECK_STAGE, { detail: change }));
}

/** Hear every change `tellStageChange` passes on. Returns the unsubscribe. */
export function onStageChange(heard: (change: unknown) => void): () => void {
	const listener = (event: Event) => heard((event as CustomEvent<unknown>).detail);
	window.addEventListener(DECK_STAGE, listener);
	return () => window.removeEventListener(DECK_STAGE, listener);
}

/** One undo entry: a deck change's answer, run back with `undo` and forward with `redo`. */
export interface DeckEntry {
	readonly kind: "deck";
	readonly page: string;
	readonly undo: DeckChange;
	readonly redo: DeckChange;
}

/** What one intent came to. */
export type DeckSent =
	/** it was applied (or there was nothing to change, `entry` absent): one entry to record */
	| { readonly kind: "done"; readonly answer: DeckChangeAnswer; readonly entry?: DeckEntry }
	/** the daemon refused it whole, with its reason: a 409 is a write in flight or another hand's since */
	| { readonly kind: "refused"; readonly status: number; readonly message: string };

const decksUrl = (project: string) => `/api/p/${encodeURIComponent(project)}/decks`;
const deckUrl = (project: string) => `/api/p/${encodeURIComponent(project)}/deck`;

/** The project's decks, or null when the daemon has none to say (the experiment off, or no answer). */
export async function fetchDecks(project: string): Promise<DecksRead | null> {
	try {
		const response = await controlFetch(decksUrl(project));
		return response.ok ? ((await response.json()) as DecksRead) : null;
	} catch {
		return null;
	}
}

/** Send one deck change as is. Most callers want `changeDeck`, which also keeps the reads current. */
export async function sendDeckChange(project: string, change: DeckChange): Promise<DeckSent> {
	try {
		const response = await controlFetch(deckUrl(project), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(change),
		});
		if (!response.ok) return { kind: "refused", status: response.status, message: await response.text() };
		const answer = (await response.json()) as DeckChangeAnswer;
		// a page the change made was nowhere before it, and its undo is the Trash's, which the caller records
		return answer.changed && answer.made !== true
			? { kind: "done", answer, entry: { kind: "deck", page: change.page, undo: answer.undo, redo: answer.redo } }
			: { kind: "done", answer };
	} catch (error) {
		return { kind: "refused", status: 0, message: error instanceof Error ? error.message : String(error) };
	}
}

/** A project's decks as the window last read them. */
export interface DeckReads {
	get(): DecksRead | null;
	/** One page's deck; nothing for a page that is no deck. */
	deckOf(page: string): DeckRead | undefined;
	/** Hear every change. Returns the unsubscribe. */
	subscribe(listener: () => void): () => void;
	/** Read again; a read overtaken by a newer answer is dropped. */
	refresh(): Promise<void>;
	/** A change's answer, which is newer than anything read before it: the page's deck, or null for no deck. */
	take(page: string, deck: DeckRead | null): void;
}

export function createDeckReads(project: string, read = fetchDecks): DeckReads {
	let state: DecksRead | null = null;
	// every read and every answer taken counts, so a read that set off before an answer never lands after it
	let generation = 0;
	const listeners = new Set<() => void>();
	const tell = () => {
		for (const listener of listeners) listener();
	};
	return {
		get: () => state,
		deckOf: (page) => state?.decks.find((deck) => deck.page === page),
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async refresh() {
			const mine = ++generation;
			const next = await read(project);
			if (mine !== generation) return;
			state = next;
			tell();
		},
		take(page, deck) {
			generation++;
			const decks = (state?.decks ?? []).filter((one) => one.page !== page);
			state = { decks: deck === null ? decks : [...decks, deck], unread: state?.unread ?? [] };
			tell();
		},
	};
}

/**
 * A project's deck reads, made once per project and kept current while the experiment is on; with it off there are
 * none and nothing is read.
 */
export function useDeckReads(project: string): DeckReads | null {
	const reads = useMemo(() => (experimentOn("deck") ? createDeckReads(project) : null), [project]);
	useEffect(() => {
		if (reads === null) return;
		void reads.refresh();
		const changed = () => void reads.refresh();
		const framed = (event: Event) => {
			if (reads.deckOf((event as CustomEvent<string>).detail) !== undefined) void reads.refresh();
		};
		window.addEventListener(DECK_CHANGE, changed);
		window.addEventListener(DECK_FRAME, framed);
		return () => {
			window.removeEventListener(DECK_CHANGE, changed);
			window.removeEventListener(DECK_FRAME, framed);
		};
	}, [reads]);
	return reads;
}

const NO_READS = () => () => {};

/** One page's deck as the reads have it, drawn again when it changes. */
export function useDeckRead(reads: DeckReads | null, page: string): DeckRead | undefined {
	return useSyncExternalStore(reads?.subscribe ?? NO_READS, () => reads?.deckOf(page));
}

/** Send one intent; its answer goes into the reads. The entry, when it made one, is the caller's to record. */
export async function changeDeck(project: string, reads: DeckReads, change: DeckChange): Promise<DeckSent> {
	const sent = await sendDeckChange(project, change);
	if (sent.kind === "done") reads.take(change.page, sent.answer.deck);
	return sent;
}

/**
 * Run an entry back (`undo`) or forward (`redo`). False when the daemon refused it: the files no longer hold what the
 * entry left, because another hand wrote since, and the entry is stale.
 */
export async function walkDeck(
	project: string,
	reads: DeckReads,
	entry: DeckEntry,
	way: "undo" | "redo",
): Promise<DeckSent> {
	return changeDeck(project, reads, way === "undo" ? entry.undo : entry.redo);
}

/** A deck's talk as one HTML file that plays from disk (spool#275), or why it can't be built: a slide that won't compile. */
export async function fetchTalkHtml(project: string, page: string): Promise<Uint8Array> {
	const response = await controlFetch(
		`/api/p/${encodeURIComponent(project)}/deck-export?page=${encodeURIComponent(page)}`,
	);
	if (!response.ok) throw new Error((await response.text()) || "The talk could not be exported. Try again.");
	return new Uint8Array(await response.arrayBuffer());
}
