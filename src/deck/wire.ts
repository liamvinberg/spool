import { isSafeName } from "../page-path";
import type { DeckRule } from "./changes";
import type { Size } from "./deck-file";
import type { Cell } from "./layout";

/**
 * What the daemon and the window say to each other about decks (spool#265): the deck read, and the one deck-change
 * operation every hand's gesture goes through. Frames inside a change are named by their folder on the deck's page,
 * as `deck.json` names them; frames in a read are named by their path, as the canvas names them.
 */

/** One slide of the talk, in order. */
export interface DeckSlide {
	/** the frame's path, as the canvas names it */
	readonly name: string;
	/**
	 * the beats its `ui.beats` call names, in order, read from its source; none when it names none (or names them so
	 * they cannot be read without running it, a `beats` problem), and it then plays as one beat
	 */
	readonly beats: readonly string[];
	/** whether it calls `ui.live()`: clicks reach it rather than advancing the talk */
	readonly live: boolean;
	/**
	 * its `notes.md` by beat, one entry per beat it plays (at least one), "" for a beat with no words; paragraphs past
	 * its last beat are the last beat's too
	 */
	readonly notes: readonly string[];
}

/** A frame on a deck's page that is not in the talk, and the cell it rests in. */
export interface DeckLoose {
	readonly name: string;
	readonly cell: Cell;
}

/**
 * What is wrong with a deck, said rather than refused, each naming a frame or, for the page's own, the page.
 * - `missing`: the talk lists a frame that is not there (yet).
 * - `repeated`: the talk lists a frame more than once, counted at its first place.
 * - `unreadable`: a frame's sidecar does not parse, a write in flight most likely; the page waits for it.
 * - `looping`: another hand (another machine or another spool) keeps putting this frame back where this spool does not
 *   lay it, so this spool stopped laying the page out until its `deck.json` changes or the daemon restarts.
 * - `interrupted`: a change to the page stopped half way and its files were written over since; what it would have
 *   put back is kept in `design/.spool/deck-changes/`.
 * - `unparsed`: the page's `deck.json` does not parse. While it is being written that passes; one a merge left broken
 *   stays, and is somebody's to mend: nothing on the page is laid out or written until it parses.
 * - `beats`: a slide's `ui.beats` list is not written out as a literal list of distinct names, so its beats cannot be
 *   known before it runs; it reads as one beat.
 * - `notes`: a slide's `notes.md` has more paragraphs than the slide has beats; the rest show with its last beat.
 */
export type DeckProblem = {
	readonly kind: "missing" | "repeated" | "unreadable" | "looping" | "interrupted" | "unparsed" | "beats" | "notes";
	readonly name: string;
};

/** One deck: a page holding a `deck.json` of a version this spool knows. */
export interface DeckRead {
	readonly page: string;
	readonly size: Size;
	readonly slides: readonly DeckSlide[];
	readonly loose: readonly DeckLoose[];
	readonly problems: readonly DeckProblem[];
}

/**
 * A page holding a `deck.json` that is no deck here: bytes that do not parse (a write in flight), or a layout version
 * this spool does not know. Such a page shows as an ordinary page and nothing on it is written.
 */
export interface UnreadDeck {
	readonly page: string;
	readonly why: "unparsed" | "version";
	readonly problems: readonly DeckProblem[];
}

/** `GET /api/p/:project/decks` */
export interface DecksRead {
	readonly decks: readonly DeckRead[];
	readonly unread: readonly UnreadDeck[];
}

/**
 * A deck change: one of the rules, applied whole to a page; making a deck of a page; or putting a deck's files back
 * as an undo or redo found them. Nobody writes a `restore` by hand: it comes back in a change's answer.
 */
export type DeckChange =
	| (DeckRule & { readonly page: string })
	/**
	 * the page becomes a deck whose talk is these frames, in order (none: an empty talk); with `starter`, a page that
	 * is not there yet is made holding New presentation's five starter slides as its talk, and `slides` is left out
	 */
	| {
			readonly kind: "make";
			readonly page: string;
			readonly slides?: readonly string[];
			readonly size?: Size;
			readonly starter?: true;
	  }
	/**
	 * the words of one beat of a frame's notes, `beat` counted from 0: its `notes.md` is made, rewritten, or removed
	 * once no beat has words left
	 */
	| {
			readonly kind: "notes";
			readonly page: string;
			readonly frame: string;
			readonly beat: number;
			readonly text: string;
	  }
	/**
	 * the deck's files put from `from` to `to`, and refused when they no longer hold `from`: an undo or redo never
	 * writes over what any hand did since, and the same undo sent twice does nothing the second time
	 */
	| { readonly kind: "restore"; readonly page: string; readonly from: DeckFiles; readonly to: DeckFiles };

/**
 * A deck's files as a change found or left them, exactly: its `deck.json`, and the sidecars and notes of the frames it
 * touched, by folder; `null` is no file. A restore's `from` and `to` name the same files.
 */
export interface DeckFiles {
	readonly deck: string | null;
	readonly sidecars: Readonly<Record<string, string | null>>;
	readonly notes: Readonly<Record<string, string | null>>;
}

/**
 * `POST /api/p/:project/deck`'s answer. `undo` and `redo` are changes to send back through the same route, which make
 * one undo entry; `changed` is false when nothing on disk moved, which needs no entry. `deck` is the page after the
 * change, `null` when it is no longer a deck. `made` says the change made the page itself, which was nowhere before
 * it: `undo` then only takes the deck's own files back, and the page's own undo is putting it in the Trash.
 */
export interface DeckChangeAnswer {
	readonly changed: boolean;
	readonly made?: true;
	readonly deck: DeckRead | null;
	readonly undo: DeckChange;
	readonly redo: DeckChange;
}

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const folders = (value: unknown): string[] | undefined =>
	Array.isArray(value) && value.every((name) => typeof name === "string" && isSafeName(name))
		? (value as string[])
		: undefined;
const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const size = (value: unknown): Size | undefined =>
	isFields(value) && typeof value.w === "number" && typeof value.h === "number"
		? { w: value.w, h: value.h }
		: undefined;
const cell = (value: unknown): Cell | undefined =>
	isFields(value) && whole(value.col) && whole(value.row) ? { col: value.col, row: value.row } : undefined;
const folder = (value: unknown): value is string => typeof value === "string" && isSafeName(value);

const bytesByFolder = (value: unknown): Record<string, string | null> | undefined => {
	if (!isFields(value)) return undefined;
	const found: Record<string, string | null> = {};
	for (const [name, bytes] of Object.entries(value)) {
		if (!isSafeName(name) || (bytes !== null && typeof bytes !== "string")) return undefined;
		found[name] = bytes;
	}
	return found;
};
const deckFiles = (value: unknown): DeckFiles | undefined => {
	if (!isFields(value) || (value.deck !== null && typeof value.deck !== "string")) return undefined;
	const sidecars = bytesByFolder(value.sidecars);
	const notes = bytesByFolder(value.notes);
	return sidecars === undefined || notes === undefined ? undefined : { deck: value.deck, sidecars, notes };
};

/** A deck change as the wire carries it, or nothing when it is not one. */
export function parseDeckChange(value: unknown): DeckChange | undefined {
	if (!isFields(value) || typeof value.page !== "string") return undefined;
	const page = value.page;
	switch (value.kind) {
		case "insert": {
			const frames = folders(value.frames);
			return frames !== undefined && whole(value.at) ? { kind: "insert", page, frames, at: value.at } : undefined;
		}
		case "place": {
			const frames = folders(value.frames);
			const to = value.cell === undefined ? undefined : cell(value.cell);
			if (frames === undefined || (value.cell !== undefined && to === undefined)) return undefined;
			return { kind: "place", page, frames, ...(to === undefined ? {} : { cell: to }) };
		}
		case "reorder":
			return folder(value.frame) && whole(value.to)
				? { kind: "reorder", page, frame: value.frame, to: value.to }
				: undefined;
		case "arrange": {
			const slides = folders(value.slides);
			return slides === undefined ? undefined : { kind: "arrange", page, slides };
		}
		case "size": {
			const to = size(value.size);
			return to === undefined ? undefined : { kind: "size", page, size: to };
		}
		case "make": {
			const slides = value.slides === undefined ? [] : folders(value.slides);
			const to = value.size === undefined ? undefined : size(value.size);
			if (slides === undefined || (value.size !== undefined && to === undefined)) return undefined;
			if (value.starter !== undefined && (value.starter !== true || slides.length > 0)) return undefined;
			return {
				kind: "make",
				page,
				slides,
				...(to === undefined ? {} : { size: to }),
				...(value.starter === true ? { starter: true } : {}),
			};
		}
		case "notes":
			return folder(value.frame) && whole(value.beat) && value.beat >= 0 && typeof value.text === "string"
				? { kind: "notes", page, frame: value.frame, beat: value.beat, text: value.text }
				: undefined;
		case "restore": {
			const from = deckFiles(value.from);
			const to = deckFiles(value.to);
			if (from === undefined || to === undefined) return undefined;
			const same = (one: object, other: object) =>
				Object.keys(one).sort().join("/") === Object.keys(other).sort().join("/");
			if (!same(from.sidecars, to.sidecars) || !same(from.notes, to.notes)) return undefined;
			return { kind: "restore", page, from, to };
		}
		default:
			return undefined;
	}
}

/** The file a deck's talk exports as, PDF or HTML: named after its page (spool#275), a nested page's path joined. */
export function talkFileName(page: string, format: "pdf" | "html"): string {
	return `${page.replaceAll("/", "-")}.${format}`;
}
