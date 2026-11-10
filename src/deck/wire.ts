import { isSafeName } from "../page-path";
import type { DeckRule } from "./changes";
import type { Size } from "./deck-file";
import type { Cell } from "./layout";

/**
 * What the daemon and the window say to each other about decks (spool#265): the deck read, and the one deck-change
 * operation every hand's gesture goes through. Frames inside a change are named by their folder on the deck's page,
 * as `deck.json` names them; frames in a read are named by their path, as the canvas names them.
 */

/** One slide of the talk, in order. The next tickets add its beats, whether it is live and its notes by beat. */
export interface DeckSlide {
	/** the frame's path, as the canvas names it */
	readonly name: string;
}

/** A frame on a deck's page that is not in the talk, and the cell it rests in. */
export interface DeckLoose {
	readonly name: string;
	readonly cell: Cell;
}

/**
 * What is wrong with a deck, said rather than refused. `missing`: the talk lists a frame that is not there (yet).
 * `repeated`: the talk lists a frame more than once, counted at its first place. `unreadable`: a frame's sidecar does
 * not parse, a write in flight most likely, and the page is not laid out until it does.
 */
export type DeckProblem =
	| { readonly kind: "missing"; readonly name: string }
	| { readonly kind: "repeated"; readonly name: string }
	| { readonly kind: "unreadable"; readonly name: string };

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
	/** the page becomes a deck whose talk is these frames, in order (none: an empty talk) */
	| { readonly kind: "make"; readonly page: string; readonly slides?: readonly string[]; readonly size?: Size }
	/**
	 * the deck's file and these frames' sidecars back to exactly these bytes, `null` being no file; `swap` trades two
	 * frames' notes back, never writing a note's words
	 */
	| {
			readonly kind: "restore";
			readonly page: string;
			readonly deck: string | null;
			readonly sidecars: Readonly<Record<string, string | null>>;
			readonly swap?: readonly [string, string];
	  };

/**
 * `POST /api/p/:project/deck`'s answer. `undo` and `redo` are changes to send back through the same route, which make
 * one undo entry; `changed` is false when nothing on disk moved, which needs no entry. `deck` is the page after the
 * change, `null` when it is no longer a deck.
 */
export interface DeckChangeAnswer {
	readonly changed: boolean;
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

/** A deck change as the wire carries it, or nothing when it is not one. */
export function parseDeckChange(value: unknown): DeckChange | undefined {
	if (!isFields(value) || typeof value.page !== "string") return undefined;
	const page = value.page;
	switch (value.kind) {
		case "insert": {
			const frames = folders(value.frames);
			return frames !== undefined && whole(value.at) ? { kind: "insert", page, frames, at: value.at } : undefined;
		}
		case "trade":
			return folder(value.frame) && folder(value.slide)
				? { kind: "trade", page, frame: value.frame, slide: value.slide }
				: undefined;
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
			return { kind: "make", page, slides, ...(to === undefined ? {} : { size: to }) };
		}
		case "restore": {
			const deck = value.deck;
			if (deck !== null && typeof deck !== "string") return undefined;
			if (!isFields(value.sidecars)) return undefined;
			const sidecars: Record<string, string | null> = {};
			for (const [name, bytes] of Object.entries(value.sidecars)) {
				if (!isSafeName(name) || (bytes !== null && typeof bytes !== "string")) return undefined;
				sidecars[name] = bytes;
			}
			const swap = value.swap;
			if (swap !== undefined && !(Array.isArray(swap) && swap.length === 2 && swap.every(folder))) return undefined;
			const pair = swap as [string, string] | undefined;
			return {
				kind: "restore",
				page,
				deck,
				sidecars,
				...(pair === undefined ? {} : { swap: [pair[0], pair[1]] as const }),
			};
		}
		default:
			return undefined;
	}
}
