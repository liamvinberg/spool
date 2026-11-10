import { applyRule } from "../../deck/changes";
import { type DeckFile, deckFileBytes, newDeckFile, parseDeckFile, withAbsent } from "../../deck/deck-file";
import { type Deck, placesOf, placesToWrite, reconcilePlan, settle } from "../../deck/layout";
import type { DeckChange, DeckChangeAnswer, DeckRead } from "../../deck/wire";
import { isSafeName, pageParent } from "../../page-path";
import type { Moved } from "../frame-links";
import { geometryBytes } from "../geometry";
import { parseSidecar } from "../sidecar";
import {
	type DeckPage,
	deckFileOf,
	deckFramesOf,
	deckReadOf,
	readPage,
	swapNotes,
	writeDeck,
	writeSidecar,
} from "./disk";

/**
 * Everything the daemon writes for a deck (spool#265), each kept whole: reconciling a page after any hand changed it,
 * applying a hand's change with what its undo needs, and keeping `deck.json` in step with the rail's renames, moves and
 * trash. Each runs from the first read to the last write without yielding, so two of them never interleave.
 */

/** Why a change never happened, in the status the route answers with. */
export interface DeckRefusal {
	readonly kind: "refused";
	readonly status: 400 | 404 | 409;
	readonly message: string;
}

const refuse = (status: DeckRefusal["status"], message: string): DeckRefusal => ({ kind: "refused", status, message });

/** A page's deck, ready to change: its file and its settled deck. */
interface Ready {
	readonly kind: "ready";
	readonly page: DeckPage;
	readonly file: DeckFile;
	readonly deck: Deck;
}

/** Why a page cannot be laid out or changed now, or what it holds. */
function ready(page: DeckPage): Ready | DeckRefusal {
	const read = deckFileOf(page);
	if (read === undefined) return refuse(404, `page "${page.page}" is no deck: it holds no ${"deck.json"}`);
	if (read.kind === "unparsed")
		return refuse(409, `page "${page.page}"'s deck.json does not parse: a write in flight`);
	if (read.kind === "unknown")
		return refuse(
			409,
			`page "${page.page}"'s deck.json is version ${String(read.version)}, which this spool does not lay out`,
		);
	const { frames, unreadable } = deckFramesOf(page);
	if (unreadable.length > 0)
		return refuse(
			409,
			`the sidecar of "${unreadable[0]}" does not parse: a write in flight, so the deck waits for it`,
		);
	return { kind: "ready", page, file: read.file, deck: settle(read.file.size, read.file.slides, frames) };
}

/**
 * Lay a deck's page out as its files say, writing only the sidecars whose place differs. Nothing is written for a page
 * that is no deck, whose `deck.json` does not parse or is of a version this spool does not know, or that holds a
 * sidecar that does not parse: each of those is somebody else's write, finished or in flight. What it wrote, by folder.
 */
export function reconcileDeck(root: string, page: string): string[] {
	const found = readPage(root, page);
	if (found === undefined) return [];
	const deck = ready(found);
	if (deck.kind === "refused") return [];
	const { frames } = deckFramesOf(found);
	const writes = reconcilePlan(deck.file.size, deck.file.slides, frames);
	for (const [folder, box] of writes) writeSidecar(found, folder, geometryBytes(box));
	return [...writes.keys()];
}

/** A deck change applied whole, answering with the page after it and the changes that undo and redo it. */
export function changeDeck(root: string, change: DeckChange): DeckChangeAnswer | DeckRefusal {
	const found = readPage(root, change.page);
	if (found === undefined) return refuse(404, `no page "${change.page}" on the canvas`);
	if (change.kind === "make") return make(found, change.slides ?? [], change.size);
	if (change.kind === "restore") return restore(found, change);
	// what any hand left unsettled is laid out first, as keeping in step rather than as this change, so the undo
	// returns to a deck that is already laid out and stays where it lands
	reconcileDeck(root, change.page);
	const page = readPage(root, change.page) as DeckPage;
	const now = ready(page);
	if (now.kind === "refused") return now;
	const result = applyRule(now.deck, change);
	if (result.kind === "refused") return refuse(400, result.message);
	const present = new Set(page.frames.map((frame) => frame.folder));
	const slides = withAbsent(now.file.slides, present, result.deck.line);
	const { size } = now.file;
	// a file only changes when what it says does: a hand's own spelling of it stands until then
	const same = sameList(slides, now.file.slides) && size.w === result.deck.talk.w && size.h === result.deck.talk.h;
	const file: DeckFile = { ...now.file, size: result.deck.talk, slides };
	return write(page, same ? page.bytes : deckFileBytes(file), result.deck, result.swap);
}

/** A page made a deck: the talk is the frames named, in order, and every other frame of the page goes loose. */
function make(
	page: DeckPage,
	slides: readonly string[],
	size: { w: number; h: number } | undefined,
): DeckChangeAnswer | DeckRefusal {
	if (page.bytes !== undefined) return refuse(409, `page "${page.page}" is a deck already`);
	const present = new Set(page.frames.map((frame) => frame.folder));
	const absent = slides.find((folder) => !present.has(folder));
	if (absent !== undefined) return refuse(400, `no frame "${absent}" on page "${page.page}"`);
	if (size !== undefined && (!Number.isFinite(size.w) || !Number.isFinite(size.h)))
		return refuse(400, "a deck's size is two numbers");
	const { frames, unreadable } = deckFramesOf(page);
	if (unreadable.length > 0)
		return refuse(
			409,
			`the sidecar of "${unreadable[0]}" does not parse: a write in flight, so the deck waits for it`,
		);
	const file = newDeckFile(slides, size);
	return write(page, deckFileBytes(file), settle(file.size, file.slides, frames));
}

/**
 * One change's writes, and the restores that undo and redo it. The notes trade first, because it is the one write
 * that can be refused by the disk, and then every place and the file, each whole.
 */
function write(
	page: DeckPage,
	bytes: string | undefined,
	deck: Deck,
	swap?: readonly [string, string],
): DeckChangeAnswer | DeckRefusal {
	const { frames } = deckFramesOf(page);
	const writes = placesToWrite(placesOf(deck), frames);
	const before: Record<string, string | null> = {};
	const after: Record<string, string | null> = {};
	for (const [folder, box] of writes) {
		before[folder] = page.frames.find((frame) => frame.folder === folder)?.sidecar ?? null;
		after[folder] = geometryBytes(box);
	}
	const fileChanged = bytes !== undefined && bytes !== page.bytes;
	if (swap !== undefined) swapNotes(page, swap[0], swap[1]);
	for (const [folder, sidecar] of Object.entries(after)) writeSidecar(page, folder, sidecar);
	if (fileChanged) writeDeck(page, bytes);
	const restoreTo = (deckBytes: string | null, sidecars: Record<string, string | null>): DeckChange => ({
		kind: "restore",
		page: page.page,
		deck: deckBytes,
		sidecars,
		...(swap === undefined ? {} : { swap }),
	});
	return {
		changed: fileChanged || writes.size > 0 || swap !== undefined,
		deck: readDeck(page),
		undo: restoreTo(page.bytes ?? null, before),
		redo: restoreTo(bytes ?? page.bytes ?? null, after),
	};
}

/**
 * A deck's files put back to bytes an earlier answer carried. The notes are traded back rather than written, so an
 * undo can never put back old words over new ones; a frame gone since has no sidecar to put back and is passed over.
 * Nothing is written over a `deck.json` that does not parse or that another spool owns.
 */
function restore(page: DeckPage, change: Extract<DeckChange, { kind: "restore" }>): DeckChangeAnswer | DeckRefusal {
	const now = deckFileOf(page);
	if (now?.kind === "unparsed")
		return refuse(409, `page "${page.page}"'s deck.json does not parse: a write in flight`);
	if (now?.kind === "unknown")
		return refuse(409, `page "${page.page}"'s deck.json is of a version this spool does not lay out`);
	let bytes = change.deck;
	if (bytes !== null) {
		const read = parseDeckFile(bytes);
		if (read.kind !== "deck") return refuse(400, "a restore's deck.json must be a deck this spool reads");
		// bytes naming a frame twice came from a hand; spool never writes them back, only the talk they mean
		if (read.repeated.length > 0) bytes = deckFileBytes(read.file);
	}
	const present = new Map(page.frames.map((frame) => [frame.folder, frame]));
	const sidecars: Record<string, string | null> = {};
	for (const [folder, sidecar] of Object.entries(change.sidecars)) {
		if (!isSafeName(folder)) return refuse(400, `not a frame folder: "${folder}"`);
		if (!present.has(folder)) continue;
		if (sidecar !== null && parseSidecar(parseJson(sidecar)).kind === "none")
			return refuse(400, `a restore's sidecar for "${folder}" must place or size the frame`);
		sidecars[folder] = sidecar;
	}
	const swap = change.swap;
	if (swap !== undefined) {
		const gone = swap.find((folder) => !present.has(folder));
		if (gone !== undefined) return refuse(409, `"${gone}" left the page, so its notes cannot be traded back`);
	}
	const undoSidecars: Record<string, string | null> = {};
	for (const folder of Object.keys(sidecars)) undoSidecars[folder] = present.get(folder)?.sidecar ?? null;
	const fileChanged = bytes !== (page.bytes ?? null);
	const moved = Object.keys(sidecars).filter((folder) => sidecars[folder] !== undoSidecars[folder]);
	if (swap !== undefined) swapNotes(page, swap[0], swap[1]);
	for (const folder of moved) writeSidecar(page, folder, sidecars[folder] ?? null);
	if (fileChanged) writeDeck(page, bytes);
	const restoreTo = (deck: string | null, to: Record<string, string | null>): DeckChange => ({
		kind: "restore",
		page: page.page,
		deck,
		sidecars: to,
		...(swap === undefined ? {} : { swap }),
	});
	return {
		changed: fileChanged || moved.length > 0 || swap !== undefined,
		deck: readDeck(page),
		undo: restoreTo(page.bytes ?? null, undoSidecars),
		redo: restoreTo(bytes, sidecars),
	};
}

/** The page's deck read as it stands now. */
function readDeck(page: DeckPage): DeckRead | null {
	const again = readPage(page.root, page.page);
	const read = again === undefined ? undefined : deckReadOf(again);
	return read === undefined || !("slides" in read) ? null : read;
}

function parseJson(bytes: string): unknown {
	try {
		return JSON.parse(bytes);
	} catch {
		return undefined;
	}
}

/**
 * The rail renamed or moved frames: a frame renamed on a deck's page keeps its place in the talk under its new name,
 * and one moved to another page leaves the talk it was in. A page that moved carries its `deck.json` and its frames'
 * names along unchanged.
 */
export function deckFollowsMoves(root: string, moved: Moved): void {
	const byPage = new Map<string, Map<string, string | undefined>>();
	for (const { from, to } of moved.frames ?? []) {
		const page = pageParent(from);
		const renames = byPage.get(page) ?? new Map<string, string | undefined>();
		renames.set(folderOf(from), pageParent(to) === page ? folderOf(to) : undefined);
		byPage.set(page, renames);
	}
	for (const [page, renames] of byPage) {
		rewriteTalk(root, page, (slides) =>
			slides.flatMap((folder) => {
				if (!renames.has(folder)) return [folder];
				const to = renames.get(folder);
				return to === undefined ? [] : [to];
			}),
		);
	}
}

/** Frames went to the Trash: out of the talk they were in. Put back, they come back loose. */
export function deckFollowsTrash(root: string, frames: readonly string[]): void {
	const byPage = new Map<string, Set<string>>();
	for (const frame of frames) {
		const page = pageParent(frame);
		byPage.set(page, (byPage.get(page) ?? new Set()).add(folderOf(frame)));
	}
	for (const [page, gone] of byPage) rewriteTalk(root, page, (slides) => slides.filter((folder) => !gone.has(folder)));
}

/** A deck's talk rewritten by bookkeeping, leaving every other key and an unknown version's file alone. */
function rewriteTalk(root: string, page: string, rewrite: (slides: readonly string[]) => string[]): void {
	const found = readPage(root, page);
	if (found === undefined) return;
	const read = deckFileOf(found);
	if (read?.kind !== "deck") return;
	const slides = rewrite(read.file.slides);
	if (sameList(slides, read.file.slides)) return;
	writeDeck(found, deckFileBytes({ ...read.file, slides }));
}

function sameList(one: readonly string[], other: readonly string[]): boolean {
	return one.length === other.length && one.every((name, at) => other[at] === name);
}

function folderOf(frame: string): string {
	return frame.slice(frame.lastIndexOf("/") + 1);
}
