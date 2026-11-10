import { isSafeName } from "../page-path";

/**
 * A deck's file (spool#265): `deck.json` in a page's folder makes the page a deck. It holds the layout's version, the
 * talk's size and `slides`, the talk's frames in order by their folder names on that page. Every other frame of the
 * page is loose. Read without touching a disk, so the daemon and the window read the same bytes alike.
 *
 * Reading forgives: unknown keys are kept for the next write, an entry that is no folder name is skipped, and a
 * repeated name counts once. A name with no frame behind it is kept too, because it is most often a frame an agent
 * is about to write. Bytes that do not parse are a write caught in flight and make no deck at all. A version this
 * spool does not know is left strictly alone: the version names the layout rules, so two spools never fight over
 * places.
 *
 * Written one name per line, so team sync's line merge can merge two people's edits to the talk.
 */

export interface Size {
	readonly w: number;
	readonly h: number;
}

export const DECK_FILE = "deck.json";
/** The layout rules this spool lays a deck out by. A change to the layout's numbers is a new version. */
export const DECK_VERSION = 1;
/** The talk's size when the file states none. */
export const TALK_SIZE: Size = { w: 1280, h: 720 };
const LEAST: Size = { w: 240, h: 240 };
const MOST: Size = { w: 3840, h: 2160 };

export interface DeckFile {
	readonly size: Size;
	/** The talk by folder name, in order, each once, names with no frame behind them included. */
	readonly slides: readonly string[];
	/** Every key the file had, as it had it, so a write carries what this spool does not know. */
	readonly fields: Readonly<Record<string, unknown>>;
}

export type DeckFileRead =
	/** `repeated`: names the file lists more than once, each counted at its first place */
	| { readonly kind: "deck"; readonly file: DeckFile; readonly repeated: readonly string[] }
	/** bytes that are no JSON object: a write in flight, or a hand's mistake; the page stays ordinary */
	| { readonly kind: "unparsed" }
	/** a layout version this spool does not know, which it never writes over */
	| { readonly kind: "unknown"; readonly version: unknown };

/** A size within what a talk can take, in whole pixels. */
export function clampSize(size: Size): Size {
	return {
		w: Math.round(Math.min(MOST.w, Math.max(LEAST.w, size.w))),
		h: Math.round(Math.min(MOST.h, Math.max(LEAST.h, size.h))),
	};
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function parseDeckFile(bytes: string): DeckFileRead {
	let value: unknown;
	try {
		value = JSON.parse(bytes);
	} catch {
		return { kind: "unparsed" };
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return { kind: "unparsed" };
	const fields = value as Record<string, unknown>;
	// a file with no version is the one an agent wrote from the guide's first version
	if (fields.version !== undefined && fields.version !== DECK_VERSION)
		return { kind: "unknown", version: fields.version };
	const size = clampSize({
		w: finite(fields.w) ? fields.w : TALK_SIZE.w,
		h: finite(fields.h) ? fields.h : TALK_SIZE.h,
	});
	const listed = Array.isArray(fields.slides) ? fields.slides : [];
	const slides: string[] = [];
	const repeated = new Set<string>();
	for (const name of listed) {
		if (typeof name !== "string" || !isSafeName(name)) continue;
		if (slides.includes(name)) repeated.add(name);
		else slides.push(name);
	}
	return { kind: "deck", file: { size, slides, fields }, repeated: [...repeated] };
}

/** A new deck's file: the talk's frames in order, at the talk's size. */
export function newDeckFile(slides: readonly string[], size: Size = TALK_SIZE): DeckFile {
	return { size: clampSize(size), slides: once(slides), fields: {} };
}

/**
 * The file's bytes: the version, the size and the talk first, then every other key the file had, in its order. A
 * name is written once whatever the list held, so no write can leave the talk naming a frame twice.
 */
export function deckFileBytes(file: DeckFile): string {
	const { version: _version, w: _w, h: _h, slides: _slides, ...rest } = file.fields;
	const shaped = { version: DECK_VERSION, w: file.size.w, h: file.size.h, slides: once(file.slides), ...rest };
	return `${JSON.stringify(shaped, null, "\t")}\n`;
}

/**
 * The file's talk after a change to the talk of the frames that are there: a listed name with no frame behind it keeps
 * its place before the frame it stood before, or goes to the end when that frame left the talk. A change made while
 * an agent is halfway through writing a deck never drops a slide it has listed and not yet written.
 */
export function withAbsent(listed: readonly string[], present: ReadonlySet<string>, line: readonly string[]): string[] {
	const before = new Map<string, string[]>();
	let waiting: string[] = [];
	for (const name of listed) {
		if (present.has(name)) {
			if (waiting.length > 0) before.set(name, waiting);
			waiting = [];
		} else waiting.push(name);
	}
	const staying = new Set(line);
	const stranded = [...before].flatMap(([name, absent]) => (staying.has(name) ? [] : absent));
	return once([...line.flatMap((name) => [...(before.get(name) ?? []), name]), ...stranded, ...waiting]);
}

function once(names: readonly string[]): string[] {
	return [...new Set(names)];
}
