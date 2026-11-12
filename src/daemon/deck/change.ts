import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyRule } from "../../deck/changes";
import { DECK_FILE, type DeckFile, deckFileBytes, newDeckFile, parseDeckFile, withAbsent } from "../../deck/deck-file";
import { type Deck, placesOf, placesToWrite, reconcilePlan, settle, slotBox } from "../../deck/layout";
import { withBeatNotes } from "../../deck/notes";
import type { DeckChange, DeckChangeAnswer, DeckFiles, DeckRead } from "../../deck/wire";
import { isPagePath, pageParent, ROOT_PAGE } from "../../page-path";
import { realDesignDir, resolveDesignPath } from "../design-path";
import type { Moved } from "../frame-links";
import { geometryBytes } from "../geometry";
import { isPageFolder } from "../projection";
import { parseSidecar } from "../sidecar";
import {
	assertDeckBytes,
	type DeckPage,
	deckFileOf,
	deckFramesOf,
	deckReadOf,
	designPath,
	frameStands,
	isWhole,
	readDesignFile,
	readPage,
	writeDesignFile,
} from "./disk";
import { commitSteps, recoverDeckChanges, type Step } from "./journal";
import { readSlideSource } from "./slide-source";
import { STARTER } from "./starter";

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

/** A sidecar reconcile wrote: the bytes it found (none: the frame had no place) and the bytes it wrote. */
export interface Rewrite {
	readonly folder: string;
	readonly from: string | undefined;
	readonly to: string;
}

/**
 * Lay a deck's page out as its files say, writing only the sidecars whose place differs. Nothing is written for a page
 * that is no deck, whose `deck.json` does not parse or is of a version this spool does not know, or that holds a
 * sidecar that does not parse: each of those is somebody else's write, finished or in flight. A frame whose folder or
 * entry went in the meantime is passed over, never made again. What it wrote.
 */
export function reconcileDeck(root: string, page: string): Rewrite[] {
	const found = readPage(root, page);
	if (found === undefined) return [];
	const deck = ready(found);
	if (deck.kind === "refused") return [];
	const { frames } = deckFramesOf(found);
	const rewrites: Rewrite[] = [];
	for (const [folder, box] of reconcilePlan(deck.file.size, deck.file.slides, frames)) {
		if (!frameStands(found, folder)) continue;
		const to = geometryBytes(box);
		try {
			writeDesignFile(found.designDir, designPath(found, folder, "frame.json"), to);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		rewrites.push({ folder, from: found.frames.find((frame) => frame.folder === folder)?.sidecar, to });
	}
	return rewrites;
}

/**
 * A deck change applied whole, answering with the page after it and the changes that undo and redo it. A change the
 * daemon died inside earlier is put back first, so a retry starts from files that are whole.
 */
export function changeDeck(root: string, change: DeckChange): DeckChangeAnswer | DeckRefusal {
	if (change.kind === "make" && change.starter === true) return makeStarter(root, change.page, change.size);
	const first = readPage(root, change.page);
	if (first === undefined) return refuse(404, `no page "${change.page}" on the canvas`);
	recoverDeckChanges(first.designDir);
	const found = readPage(root, change.page) as DeckPage;
	if (change.kind === "make") return make(found, change.slides ?? [], change.size);
	if (change.kind === "restore") return restore(found, change);
	if (change.kind === "notes") return notes(found, change);
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
	return write(page, same ? (page.bytes ?? null) : deckFileBytes(file), result.deck);
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
 * New presentation: a page that is not there yet, made whole holding the starter's slides as its talk, their notes,
 * their places and its `deck.json`. It is put together out of sight under `design/.spool/` and moved onto the canvas
 * in one rename, so no watcher, sync or reader ever sees the page half made, and a failure leaves nothing behind.
 */
function makeStarter(
	root: string,
	page: string,
	size: { w: number; h: number } | undefined,
): DeckChangeAnswer | DeckRefusal {
	if (!isPagePath(page)) return refuse(400, `not a page name: "${page}"`);
	if (size !== undefined && (!Number.isFinite(size.w) || !Number.isFinite(size.h)))
		return refuse(400, "a deck's size is two numbers");
	const designDir = realDesignDir(root);
	if (!isWhole(designDir)) return refuse(409, "this project's design/ is not whole, so nothing is made in it");
	const parent = pageParent(page);
	// the whole destination, every link on its way collapsed, so a link out of design/ is refused before anything is made
	const target = resolveDesignPath(designDir, join(designDir, "frames", ...page.split("/")));
	// a page inside a page nothing holds has nowhere to be born, as with New page
	if (parent !== ROOT_PAGE && !isPageFolder(dirname(target))) return refuse(404, `no page "${parent}" on the canvas`);
	if (existsSync(target)) return refuse(409, `"${page}" is taken`);
	const file = newDeckFile(
		STARTER.map((slide) => slide.folder),
		size,
	);
	const staged = join(designDir, ".spool", "deck-new", randomUUID());
	const after: Files = { deck: deckFileBytes(file), sidecars: {}, notes: {} };
	try {
		mkdirSync(staged, { recursive: true });
		for (const [index, slide] of STARTER.entries()) {
			const dir = join(staged, slide.folder);
			mkdirSync(dir);
			writeFileSync(join(dir, "frame.tsx"), slide.source);
			const sidecar = geometryBytes(slotBox(file.size, index));
			writeFileSync(join(dir, "frame.json"), sidecar);
			writeFileSync(join(dir, "notes.md"), slide.notes);
			after.sidecars[slide.folder] = sidecar;
			after.notes[slide.folder] = slide.notes;
		}
		writeFileSync(join(staged, DECK_FILE), after.deck as string);
		renameSync(staged, target);
	} finally {
		rmSync(staged, { recursive: true, force: true });
	}
	const before: Files = {
		deck: null,
		sidecars: Object.fromEntries(Object.keys(after.sidecars).map((folder) => [folder, null])),
		notes: Object.fromEntries(Object.keys(after.notes).map((folder) => [folder, null])),
	};
	const made = readPage(root, page) as DeckPage;
	return { ...answerOf(made, true, before, after), made: true };
}

/**
 * One beat's words written into a frame's notes, the file made or removed as it needs. Its beats are counted from its
 * source as the deck read counts them; nothing else on the page is read or written, so a write in flight elsewhere on
 * it does not hold the words back.
 */
function notes(page: DeckPage, change: Extract<DeckChange, { kind: "notes" }>): DeckChangeAnswer | DeckRefusal {
	const read = deckFileOf(page);
	if (read === undefined) return refuse(404, `page "${page.page}" is no deck: it holds no ${"deck.json"}`);
	if (read.kind !== "deck")
		return refuse(409, `page "${page.page}"'s deck.json is not one this spool reads now, so it writes nothing there`);
	if (!page.frames.some((frame) => frame.folder === change.frame))
		return refuse(404, `no frame "${change.frame}" on page "${page.page}"`);
	const source = readDesignFile(page.designDir, designPath(page, change.frame, "frame.tsx")) ?? "";
	const beats = readSlideSource(source).beats.length;
	const before = notesOf(page, change.frame);
	const after = withBeatNotes(before, change.beat, beats, change.text);
	const deck = page.bytes ?? null;
	return commitFiles(
		page,
		{ deck, sidecars: {}, notes: { [change.frame]: before } },
		{ deck, sidecars: {}, notes: { [change.frame]: after } },
	);
}

/**
 * One change's files, written as one transaction: every place that moves, then `deck.json`. The
 * answer's undo and redo carry the files as the change found and left them, each refused once they hold something else.
 */
function write(page: DeckPage, bytes: string | null, deck: Deck): DeckChangeAnswer | DeckRefusal {
	const before: Files = { deck: page.bytes ?? null, sidecars: {}, notes: {} };
	const after: Files = { deck: bytes, sidecars: {}, notes: {} };
	const { frames } = deckFramesOf(page);
	for (const [folder, box] of placesToWrite(placesOf(deck), frames)) {
		before.sidecars[folder] = page.frames.find((frame) => frame.folder === folder)?.sidecar ?? null;
		after.sidecars[folder] = geometryBytes(box);
	}
	return commitFiles(page, before, after);
}

/** Files the change is not writing are named with the bytes they hold, so `from` and `to` name the same files. */
type Files = { deck: string | null; sidecars: Record<string, string | null>; notes: Record<string, string | null> };

/** `from` to `to` written as one transaction, and the answer that undoes and redoes it. */
function commitFiles(page: DeckPage, from: Files, to: Files): DeckChangeAnswer {
	if (to.deck !== from.deck) assertDeckBytes(to.deck);
	const steps: Step[] = [
		...Object.keys(to.notes).map((folder) => ({
			path: designPath(page, folder, "notes.md"),
			before: from.notes[folder] ?? null,
			after: to.notes[folder] ?? null,
		})),
		...Object.keys(to.sidecars).map((folder) => ({
			path: designPath(page, folder, "frame.json"),
			before: from.sidecars[folder] ?? null,
			after: to.sidecars[folder] ?? null,
		})),
		{ path: designPath(page, DECK_FILE), before: from.deck, after: to.deck },
	];
	commitSteps(page.designDir, page.page, steps);
	return answerOf(
		page,
		steps.some((step) => step.before !== step.after),
		from,
		to,
	);
}

/** The answer to a change that took a deck's files from `from` to `to`. */
function answerOf(page: DeckPage, changed: boolean, from: Files, to: Files): DeckChangeAnswer {
	const restoreTo = (one: DeckFiles, other: DeckFiles): DeckChange => ({
		kind: "restore",
		page: page.page,
		from: one,
		to: other,
	});
	return { changed, deck: readDeck(page), undo: restoreTo(to, from), redo: restoreTo(from, to) };
}

/**
 * A deck's files put back to bytes an earlier answer carried, refused while they hold anything but what that answer
 * left: a hand's edit since is never written over, and an undo sent twice is refused the second time rather than
 * trading a slide's notes back again. `deck.json` and the sidecars are compared for what they say, so a hand that only
 * re-spelled one has not changed it; notes are compared byte for byte. A frame that has left the page since cannot be
 * put back and refuses the whole restore.
 */
function restore(page: DeckPage, change: Extract<DeckChange, { kind: "restore" }>): DeckChangeAnswer | DeckRefusal {
	const read = deckFileOf(page);
	if (read?.kind === "unparsed")
		return refuse(409, `page "${page.page}"'s deck.json does not parse: a write in flight`);
	if (read?.kind === "unknown")
		return refuse(409, `page "${page.page}"'s deck.json is of a version this spool does not lay out`);
	const since = (what: string) => refuse(409, `${what} changed since, so undoing or redoing would write over it`);
	if (!sameDeck(page.bytes ?? null, change.from.deck)) return since(`page "${page.page}"'s deck.json`);
	let deck = change.to.deck;
	if (deck !== null) {
		const next = parseDeckFile(deck);
		if (next.kind !== "deck") return refuse(400, "a restore's deck.json must be a deck this spool reads");
		// bytes naming a frame twice came from a hand; spool never writes them back, only the talk they mean
		if (next.repeated.length > 0) deck = deckFileBytes(next.file);
	}
	const present = new Map(page.frames.map((frame) => [frame.folder, frame]));
	const now: Files = { deck: page.bytes ?? null, sidecars: {}, notes: {} };
	for (const [folder, expected] of Object.entries(change.from.sidecars)) {
		const wanted = change.to.sidecars[folder] ?? null;
		const frame = present.get(folder);
		if (frame === undefined && wanted !== null)
			return refuse(409, `"${folder}" left the page, so it cannot be put back`);
		const bytes = frame?.sidecar ?? null;
		if (bytes !== null && sidecarOf(bytes) === undefined)
			return refuse(409, `the sidecar of "${folder}" does not parse: a write in flight, so the deck waits for it`);
		if (wanted !== null && sidecarOf(wanted) === undefined)
			return refuse(400, `a restore's sidecar for "${folder}" must place or size the frame`);
		if (sidecarOf(bytes) !== sidecarOf(expected)) return since(`the place of "${folder}"`);
		now.sidecars[folder] = bytes;
	}
	for (const [folder, expected] of Object.entries(change.from.notes)) {
		const wanted = change.to.notes[folder] ?? null;
		if (!present.has(folder) && wanted !== null)
			return refuse(409, `"${folder}" left the page, so its notes cannot be put back`);
		const bytes = present.has(folder) ? notesOf(page, folder) : null;
		if (bytes !== expected) return since(`the notes of "${folder}"`);
		now.notes[folder] = bytes;
	}
	return commitFiles(page, now, {
		deck,
		sidecars: { ...change.to.sidecars },
		notes: { ...change.to.notes },
	});
}

/** Two `deck.json`s that say the same: equal once read, or byte for byte when either is no deck. */
function sameDeck(one: string | null, other: string | null): boolean {
	if (one === other) return true;
	if (one === null || other === null) return false;
	const a = parseDeckFile(one);
	const b = parseDeckFile(other);
	return a.kind === "deck" && b.kind === "deck" && deckFileBytes(a.file) === deckFileBytes(b.file);
}

/** What a sidecar says, comparable as a string; "" for none, nothing for bytes that say nothing. */
function sidecarOf(bytes: string | null): string | undefined {
	if (bytes === null) return "";
	let value: unknown;
	try {
		value = JSON.parse(bytes);
	} catch {
		return undefined;
	}
	const read = parseSidecar(value);
	if (read.kind === "placed") return JSON.stringify(read.geometry);
	if (read.kind === "sized") return JSON.stringify(read.footprint);
	return undefined;
}

function notesOf(page: DeckPage, folder: string): string | null {
	return readDesignFile(page.designDir, designPath(page, folder, "notes.md"));
}

/** The page's deck read as it stands now. */
function readDeck(page: DeckPage): DeckRead | null {
	const again = readPage(page.root, page.page);
	const read = again === undefined ? undefined : deckReadOf(again);
	return read === undefined || !("slides" in read) ? null : read;
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

/**
 * A deck's talk rewritten by bookkeeping, reading nothing but its `deck.json`, so an ordinary page answers at once
 * whatever its frames hold. Every other key, and an unknown version's file, are left alone.
 */
function rewriteTalk(root: string, page: string, rewrite: (slides: readonly string[]) => string[]): void {
	if (page === ROOT_PAGE || !isPagePath(page)) return;
	const designDir = realDesignDir(root);
	if (!isWhole(designDir)) return;
	const path = `frames/${page}/${DECK_FILE}`;
	const bytes = readDesignFile(designDir, path);
	if (bytes === null) return;
	const read = parseDeckFile(bytes);
	if (read.kind !== "deck") return;
	const slides = rewrite(read.file.slides);
	if (sameList(slides, read.file.slides)) return;
	const next = deckFileBytes({ ...read.file, slides });
	assertDeckBytes(next);
	try {
		writeDesignFile(designDir, path, next);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

function sameList(one: readonly string[], other: readonly string[]): boolean {
	return one.length === other.length && one.every((name, at) => other[at] === name);
}

function folderOf(frame: string): string {
	return frame.slice(frame.lastIndexOf("/") + 1);
}
