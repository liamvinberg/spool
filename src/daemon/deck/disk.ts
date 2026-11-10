import { randomUUID } from "node:crypto";
import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../../atomic-write";
import { DECK_FILE, type DeckFileRead, parseDeckFile } from "../../deck/deck-file";
import { type DeckFrame, settle } from "../../deck/layout";
import type { DeckProblem, DeckRead, UnreadDeck } from "../../deck/wire";
import { isPagePath, isSafeName, pageUnder } from "../../page-path";
import { realDesignDir, resolveDesignPath } from "../design-path";
import { parseSidecar } from "../sidecar";

/**
 * A deck's page as the disk has it (spool#265), and the few ways the daemon writes it: a frame's sidecar, the page's
 * `deck.json`, and two frames' notes traded. Every write is whole: a reader, a watcher or team sync never sees half a
 * file, and a trade of notes never has a moment where a note exists nowhere.
 */

/** A frame on the deck's page: a folder of the page holding a frame entry. */
export interface PageFrame {
	readonly folder: string;
	readonly dir: string;
	/** Its sidecar's bytes; absent when it has none. */
	readonly sidecar?: string;
}

export interface DeckPage {
	readonly root: string;
	readonly page: string;
	readonly designDir: string;
	readonly dir: string;
	/** `deck.json`'s bytes; absent when the page is no deck. */
	readonly bytes?: string;
	readonly frames: readonly PageFrame[];
}

/** One page's folder and what it holds; nothing when the page is not there. */
export function readPage(root: string, page: string): DeckPage | undefined {
	if (!isPagePath(page)) return undefined;
	const designDir = realDesignDir(root);
	const dir = resolveDesignPath(designDir, join(designDir, "frames", page));
	let entries: Dirent[];
	try {
		if (!lstatSync(dir).isDirectory()) return undefined;
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return undefined;
	}
	// a folder holding a frame entry or a sidecar is a frame, never a page
	if (entries.some((entry) => entry.name === "frame.tsx" || entry.name === "frame.json")) return undefined;
	const frames: PageFrame[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
		const folder = join(dir, entry.name);
		if (!existsLexically(join(folder, "frame.tsx"))) continue;
		const sidecar = readText(designDir, join(folder, "frame.json"));
		frames.push({ folder: entry.name, dir: folder, ...(sidecar === undefined ? {} : { sidecar }) });
	}
	frames.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
	const bytes = readText(designDir, join(dir, DECK_FILE));
	return { root, page, designDir, dir, ...(bytes === undefined ? {} : { bytes }), frames };
}

/** What the page's `deck.json` says; nothing when it has none. */
export function deckFileOf(page: DeckPage): DeckFileRead | undefined {
	return page.bytes === undefined ? undefined : parseDeckFile(page.bytes);
}

/**
 * The page's frames as the layout reads them, and the frames whose sidecar does not parse. Those are a write caught in
 * flight as often as not, so a page holding one is laid out by nobody until it parses: a sidecar is never written over
 * bytes nobody can read.
 */
export function deckFramesOf(page: DeckPage): { frames: DeckFrame[]; unreadable: string[] } {
	const frames: DeckFrame[] = [];
	const unreadable: string[] = [];
	for (const frame of page.frames) {
		if (frame.sidecar === undefined) {
			frames.push({ folder: frame.folder });
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(frame.sidecar);
		} catch {
			parsed = undefined;
		}
		const sidecar = parseSidecar(parsed);
		if (sidecar.kind === "placed") {
			const { x, y, w, h } = sidecar.geometry;
			frames.push({ folder: frame.folder, size: { w, h }, at: { x, y, w, h } });
		} else if (sidecar.kind === "sized") frames.push({ folder: frame.folder, size: sidecar.footprint });
		else unreadable.push(frame.folder);
	}
	return { frames, unreadable };
}

/** The deck read of a page holding a `deck.json`: the deck, or why it is none here. */
export function deckReadOf(page: DeckPage): DeckRead | UnreadDeck | undefined {
	const file = deckFileOf(page);
	if (file === undefined) return undefined;
	if (file.kind === "unparsed") return { page: page.page, why: "unparsed" };
	if (file.kind === "unknown") return { page: page.page, why: "version" };
	const { frames, unreadable } = deckFramesOf(page);
	const deck = settle(file.file.size, file.file.slides, frames);
	const present = new Set(page.frames.map((frame) => frame.folder));
	const named = (folder: string) => pageUnder(page.page, folder);
	const problems: DeckProblem[] = [
		...file.file.slides
			.filter((folder) => !present.has(folder))
			.map((folder) => ({ kind: "missing" as const, name: named(folder) })),
		...file.repeated.map((folder) => ({ kind: "repeated" as const, name: named(folder) })),
		...unreadable.map((folder) => ({ kind: "unreadable" as const, name: named(folder) })),
	];
	return {
		page: page.page,
		size: deck.talk,
		slides: deck.line.map((folder) => ({ name: named(folder) })),
		loose: deck.loose.map((spot) => ({ name: named(spot.folder), cell: { col: spot.col, row: spot.row } })),
		problems,
	};
}

/** Every page of a project holding a `deck.json`, by path. */
export function deckPages(root: string): string[] {
	const designDir = realDesignDir(root);
	const found: string[] = [];
	const walk = (dir: string, page: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
			const child = join(dir, entry.name);
			if (existsLexically(join(child, "frame.tsx")) || existsLexically(join(child, "frame.json"))) continue;
			const inner = pageUnder(page, entry.name);
			if (existsLexically(join(child, DECK_FILE))) found.push(inner);
			walk(child, inner);
		}
	};
	walk(resolveDesignPath(designDir, join(designDir, "frames")), "");
	return found.sort();
}

/** Whether a page's folder holds a `deck.json`, asked without reading it. */
export function holdsDeck(root: string, page: string): boolean {
	if (!isPagePath(page)) return false;
	try {
		const designDir = realDesignDir(root);
		return existsSync(join(designDir, "frames", page, DECK_FILE));
	} catch {
		return false;
	}
}

/** A frame's sidecar written whole, or taken away for `null`. */
export function writeSidecar(page: DeckPage, folder: string, bytes: string | null): void {
	const file = resolveDesignPath(page.designDir, join(page.dir, folder, "frame.json"));
	if (bytes === null) rmSync(file, { force: true });
	else writeAtomic(file, bytes);
}

/**
 * The page's `deck.json` written whole, or taken away for `null`. Bytes that would make no deck, or name a frame twice,
 * are refused here, the one door every deck write goes through.
 */
export function writeDeck(page: DeckPage, bytes: string | null): void {
	const file = resolveDesignPath(page.designDir, join(page.dir, DECK_FILE));
	if (bytes === null) {
		rmSync(file, { force: true });
		return;
	}
	const read = parseDeckFile(bytes);
	if (read.kind !== "deck" || read.repeated.length > 0)
		throw new Error("spool will not write a deck.json it cannot read back");
	writeAtomic(file, bytes);
}

/**
 * Two frames' `notes.md` traded, the notes belonging to the place in the talk rather than the frame. Neither note's
 * words are ever only in memory: both are first copied into `design/.spool`, which stays on this machine, and that
 * copy goes only once both have landed. Each note is written whole where the other was, and a frame that had none
 * ends with none, its file removed only after the other side has it.
 */
export function swapNotes(page: DeckPage, one: string, other: string): void {
	const first = resolveDesignPath(page.designDir, join(page.dir, one, "notes.md"));
	const second = resolveDesignPath(page.designDir, join(page.dir, other, "notes.md"));
	const a = readBytes(first);
	const b = readBytes(second);
	if (a === undefined && b === undefined) return;
	const kept = join(page.designDir, ".spool", "deck-swap", `${randomUUID()}.json`);
	writeAtomic(
		kept,
		JSON.stringify({
			[first]: a?.toString("base64") ?? null,
			[second]: b?.toString("base64") ?? null,
		}),
	);
	if (b !== undefined) writeAtomic(first, b);
	if (a !== undefined) writeAtomic(second, a);
	if (b === undefined) rmSync(first, { force: true });
	if (a === undefined) rmSync(second, { force: true });
	rmSync(kept, { force: true });
}

function readText(designDir: string, file: string): string | undefined {
	return readBytes(resolveDesignPath(designDir, file))?.toString("utf8");
}

function readBytes(file: string): Buffer | undefined {
	try {
		return readFileSync(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

/** A name in a folder, its link not followed: what discovery reads a frame entry by. */
function existsLexically(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}
