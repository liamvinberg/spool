import { randomUUID } from "node:crypto";
import {
	type Dirent,
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DECK_FILE, type DeckFileRead, parseDeckFile } from "../../deck/deck-file";
import { type DeckFrame, settle } from "../../deck/layout";
import { NOTES_FILE, notesByBeat } from "../../deck/notes";
import type { DeckProblem, DeckRead, DeckSlide, UnreadDeck } from "../../deck/wire";
import { isPagePath, isSafeName, pageName, pageParent, pageUnder } from "../../page-path";
import { realDesignDir, resolveDesignPath } from "../design-path";
import { parseSidecar } from "../sidecar";
import { beatAsked, beatLabel, readSlideSource, type ShotBeat } from "./slide-source";

/**
 * A deck's page as the disk has it (spool#265), and the one way the daemon writes into it: a file written whole in a
 * folder that is there, never a folder made. A reader, a watcher or team sync never sees half a file, and a folder a
 * hand, a move or a removal took away is never made again by a write that was on its way to it.
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

/**
 * Whether a project's `design/` is whole: a copy whose `canvas.json` is gone is being removed or was never finished
 * (#243), and nothing is laid out or written in it.
 */
export function isWhole(designDir: string): boolean {
	return existsLexically(join(designDir, "canvas.json"));
}

/** One page's folder and what it holds; nothing when the page is not there, or its project is not whole. */
export function readPage(root: string, page: string): DeckPage | undefined {
	if (!isPagePath(page)) return undefined;
	const designDir = realDesignDir(root);
	if (!isWhole(designDir)) return undefined;
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
	if (file.kind === "unparsed")
		return { page: page.page, why: "unparsed", problems: [{ kind: "unparsed", name: page.page }] };
	if (file.kind === "unknown") return { page: page.page, why: "version", problems: [] };
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
	const slides = deck.line.map((folder) => {
		const { slide, unread, extra } = slideOf(page, folder);
		if (unread) problems.push({ kind: "beats", name: slide.name });
		if (extra) problems.push({ kind: "notes", name: slide.name });
		return slide;
	});
	return {
		page: page.page,
		size: deck.talk,
		slides,
		loose: deck.loose.map((spot) => ({ name: named(spot.folder), cell: { col: spot.col, row: spot.row } })),
		problems,
	};
}

/**
 * The beat `spool shot --beat` asks of a frame, read from its source as it is on disk: an index from 0 and what its files
 * are named after (`beatLabel`), or why not.
 * Undefined for a frame with no source there, which the boot then says is not found.
 */
export function frameBeatAsked(
	root: string,
	frame: string,
	asked: string,
): ShotBeat | { readonly message: string } | undefined {
	const designDir = realDesignDir(root);
	let text: string | undefined;
	try {
		text = readText(designDir, join(designDir, "frames", frame, "frame.tsx"));
	} catch {
		return undefined;
	}
	if (text === undefined) return undefined;
	const source = readSlideSource(text);
	const index = beatAsked(frame, source, asked);
	return typeof index === "number" ? { index, label: beatLabel(source, index) } : index;
}

/**
 * The beats a frame names when it is a slide of a talk (its page's `deck.json` lists it), as its source on disk names
 * them, none for a slide that names none (spool#318: what the booth times beat by beat); undefined for any other frame
 * (spool#319: what the booth takes an opening still of).
 */
export function slideBeats(root: string, frame: string): readonly string[] | undefined {
	const page = pageParent(frame);
	if (!isPagePath(page)) return undefined;
	try {
		const designDir = realDesignDir(root);
		const file = parseDeckFile(readText(designDir, join(designDir, "frames", page, DECK_FILE)) ?? "");
		if (file.kind !== "deck" || !file.file.slides.includes(pageName(frame))) return undefined;
		return readSlideSource(readText(designDir, join(designDir, "frames", frame, "frame.tsx")) ?? "").beats;
	} catch {
		return undefined;
	}
}

/**
 * One slide as its files say: the beats and live its source names, and its notes by beat. `unread` says its beats are
 * not written so they can be read, `extra` that its notes run past its last beat.
 */
function slideOf(page: DeckPage, folder: string): { slide: DeckSlide; unread: boolean; extra: boolean } {
	const dir = join(page.dir, folder);
	const source = readSlideSource(readText(page.designDir, join(dir, "frame.tsx")) ?? "");
	const { notes, extra } = notesByBeat(readText(page.designDir, join(dir, NOTES_FILE)) ?? null, source.beats.length);
	return {
		slide: { name: pageUnder(page.page, folder), beats: source.beats, live: source.live, notes },
		unread: source.unread !== undefined,
		extra,
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

/** A path inside `design/`, as a record of the change keeps it: relative, so a project that moved keeps its records. */
export function designPath(page: DeckPage, ...under: string[]): string {
	return join("frames", page.page, ...under);
}

/** A file's bytes under `design/`, `null` when there is none. */
export function readDesignFile(designDir: string, path: string): string | null {
	return readBytes(resolveDesignPath(designDir, join(designDir, path)))?.toString("utf8") ?? null;
}

/**
 * A file under `design/` written whole, or taken away for `null`, in a folder that must already be there: a missing
 * folder throws `ENOENT` rather than being made. Written to a staging name beside it first, then renamed over it.
 */
export function writeDesignFile(designDir: string, path: string, bytes: string | null): void {
	const file = resolveDesignPath(designDir, join(designDir, path));
	if (bytes === null) {
		rmSync(file, { force: true });
		return;
	}
	const staged = `${file}.${randomUUID()}.tmp`;
	try {
		writeFileSync(staged, bytes, { flag: "wx" });
		renameSync(staged, file);
	} finally {
		rmSync(staged, { force: true });
	}
}

/** Whether a frame of the page still has its entry, asked just before writing beside it. */
export function frameStands(page: DeckPage, folder: string): boolean {
	return existsLexically(join(page.dir, folder, "frame.tsx"));
}

/** Bytes a `deck.json` may be written with: a deck this spool reads back, naming no frame twice. */
export function assertDeckBytes(bytes: string | null): void {
	if (bytes === null) return;
	const read = parseDeckFile(bytes);
	if (read.kind !== "deck" || read.repeated.length > 0)
		throw new Error("spool will not write a deck.json it cannot read back");
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
