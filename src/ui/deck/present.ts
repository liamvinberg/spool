import { useSyncExternalStore } from "react";
import { mintTalk } from "../../deck/present-wire";
import { experimentOn } from "../experiments";

/** Where a talk is presented from: a deck page of a project, and the slide it starts on, by its path. */
export interface PresentFrom {
	readonly project: string;
	readonly page: string;
	readonly slide: string;
}

/** A talk asked to be presented, and the room's window opened for it as Present was pressed. */
export interface PresentAsk extends PresentFrom {
	/** its name: the channel its two windows speak over, and the room's address */
	readonly talk: string;
	/** when Present was pressed, which the presenter's clock counts from */
	readonly pressed: number;
	/** the room's window, when the browser let it open and handed it over */
	readonly room: Window | null;
}

/**
 * Present a deck from one of its slides (spool#265): what a slide's play on its name label, the Present action on a
 * deck's row in Pages do. The room's window opens here, while the press that asked
 * for it is still the user's, and the canvas (`presenting.tsx`) turns spool's own window into the presenter view. One
 * talk at a time: a press while one is on does nothing.
 */
export function presentDeck(from: PresentFrom): void {
	if (!experimentOn("deck") || asked !== null) return;
	const talk = mintTalk();
	asked = { ...from, talk, pressed: Date.now(), room: openRoom(from, talk) };
	tell();
}

/** The room's address: the deck page's plain play address, as the room of `talk`. */
export function roomAddress(from: PresentFrom, talk: string): string {
	const query = new URLSearchParams({ deck: from.page, frame: from.slide, room: talk });
	return `/play/${encodeURIComponent(from.project)}?${query}`;
}

/** A window of its own the size of a small screen, which can be moved to the projector's, or shared in a call. */
const ROOM_WINDOW = "popup,width=960,height=540";

/** Opens the room's window of `talk`, or opens it again; null when the browser kept it to itself. */
export function openRoom(from: PresentFrom, talk: string): Window | null {
	return window.open(roomAddress(from, talk), `spool-room-${talk}`, ROOM_WINDOW);
}

/** The talk is over: Present may be pressed again. */
export function presentDone(): void {
	if (asked === null) return;
	asked = null;
	tell();
}

/** The talk asked for, while one is. */
export function usePresentAsk(): PresentAsk | null {
	return useSyncExternalStore(subscribe, () => asked);
}

let asked: PresentAsk | null = null;
const listeners = new Set<() => void>();

function tell(): void {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
