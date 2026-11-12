import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DECK_FILE, parseDeckFile, type Size } from "../../deck/deck-file";
import { NOTES_FILE, notesParagraphs } from "../../deck/notes";
import { isSafeName, pageParent } from "../../page-path";
import { realDesignDir, resolveDesignPath } from "../design-path";
import { parseSidecar } from "../sidecar";
import { deckPages } from "./disk";
import { readSlideSource } from "./slide-source";

/**
 * What `spool check` says of decks while the experiment is on (spool#265). Errors: a `deck.json` that does not parse,
 * or names a frame that is not there; beats not written as a literal list of distinct names; a frame importing its
 * notes. Warnings: a slide whose size is neither the talk's nor plainly a shape of its own, and notes running past a
 * slide's last beat. Read from the files alone, so it holds with no daemon running.
 */

/** One thing said, at a design path. */
export interface DeckFinding {
	readonly path: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
}

export interface DeckCheck {
	readonly errors: readonly DeckFinding[];
	readonly warnings: readonly DeckFinding[];
}

/** How far a slide's proportions may sit from the talk's and still be a slide meant at its size. */
const SAME_SHAPE = 0.15;

/**
 * The decks of a project checked: the frames `frames` names (by name under frames/) and the decks on their pages, or
 * every frame and deck when it is undefined.
 */
export function checkDecks(root: string, frames?: readonly string[]): DeckCheck {
	const designDir = realDesignDir(root);
	const read = reader(designDir);
	const errors: DeckFinding[] = [];
	const warnings: DeckFinding[] = [];
	const pagesOfFrames = new Set(frames?.map(pageParent));
	const named = frames === undefined ? undefined : new Set(frames);
	const sourceOf = (frame: string) => read(join(designDir, "frames", frame, "frame.tsx"));
	const pathOf = (...parts: string[]) => ["design", "frames", ...parts].join("/");

	for (const frame of frames ?? allFrames(designDir, read)) {
		const source = readSlideSource(sourceOf(frame) ?? "");
		if (source.unread !== undefined) errors.push({ path: pathOf(frame, "frame.tsx"), ...source.unread });
		for (const used of source.notesImports)
			errors.push({
				path: pathOf(frame, "frame.tsx"),
				line: used.line,
				column: used.column,
				message: `imports "${used.specifier}": a slide never imports its notes, which are the presenter's words beside it; write what the room reads in frame.tsx`,
			});
	}

	for (const page of deckPages(root)) {
		if (frames !== undefined && !pagesOfFrames.has(page)) continue;
		const deckPath = pathOf(page, DECK_FILE);
		const bytes = read(join(designDir, "frames", page, DECK_FILE)) ?? "";
		const file = parseDeckFile(bytes);
		if (file.kind === "unparsed") {
			errors.push({ path: deckPath, line: 1, column: 1, message: `does not parse as JSON: ${jsonError(bytes)}` });
			continue;
		}
		if (file.kind === "unknown") {
			warnings.push({
				path: deckPath,
				line: 1,
				column: 1,
				message: `is version ${JSON.stringify(file.version)}, which this spool does not lay out: write "version": 1`,
			});
			continue;
		}
		const present = new Set(framesOf(designDir, page, read));
		for (const slide of file.file.slides) {
			if (present.has(slide)) continue;
			errors.push({
				...lineOf(bytes, slide),
				path: deckPath,
				message: `lists "${slide}", and there is no ${pathOf(page, slide, "frame.tsx")}: a slide is a frame's folder on this page`,
			});
		}
		for (const slide of file.repeated)
			warnings.push({
				...lineOf(bytes, slide),
				path: deckPath,
				message: `lists "${slide}" more than once: it plays once, at its first place`,
			});
		const talk = file.file.size;
		for (const slide of file.file.slides) {
			const frame = `${page}/${slide}`;
			if (!present.has(slide) || (named !== undefined && !named.has(frame))) continue;
			const size = sizeOf(read(join(designDir, "frames", page, slide, "frame.json")));
			if (size !== undefined && (size.w !== talk.w || size.h !== talk.h) && sameShape(size, talk))
				warnings.push({
					path: pathOf(frame, "frame.json"),
					line: 1,
					column: 1,
					message: `is ${size.w}×${size.h} and the talk is ${talk.w}×${talk.h}: a slide is the talk's size (leave w and h out and spool sets them), or a shape plainly its own, such as a phone, shown fitted`,
				});
			const beats = Math.max(1, readSlideSource(sourceOf(frame) ?? "").beats.length);
			const paragraphs = notesParagraphs(read(join(designDir, "frames", page, slide, NOTES_FILE)) ?? null).length;
			if (paragraphs > beats)
				warnings.push({
					path: pathOf(frame, NOTES_FILE),
					line: 1,
					column: 1,
					message: `has ${paragraphs} paragraphs and the slide ${beats === 1 ? "1 beat" : `${beats} beats`}: one paragraph per beat, and the rest show with its last beat`,
				});
		}
	}
	return { errors, warnings };
}

/** A talk of the project: its page, and its slides in the order they play, by frame name. */
export interface Talk {
	readonly page: string;
	readonly slides: readonly string[];
}

/** Every talk of the project, each with the slides its `deck.json` lists that are frames on its page. */
export function talksOf(root: string): Talk[] {
	const designDir = realDesignDir(root);
	const read = reader(designDir);
	const talks: Talk[] = [];
	for (const page of deckPages(root)) {
		const file = parseDeckFile(read(join(designDir, "frames", page, DECK_FILE)) ?? "");
		if (file.kind !== "deck") continue;
		const present = new Set(framesOf(designDir, page, read));
		talks.push({
			page,
			slides: file.file.slides.filter((slide) => present.has(slide)).map((slide) => `${page}/${slide}`),
		});
	}
	return talks;
}

/** Whether a size has the talk's proportions and turn, within a little: a slide meant at the talk's size. */
function sameShape(size: Size, talk: Size): boolean {
	const ratio = size.w / size.h;
	const talkRatio = talk.w / talk.h;
	return ratio >= 1 === talkRatio >= 1 && Math.abs(ratio / talkRatio - 1) <= SAME_SHAPE;
}

function sizeOf(bytes: string | undefined): Size | undefined {
	if (bytes === undefined) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(bytes);
	} catch {
		return undefined;
	}
	const sidecar = parseSidecar(value);
	if (sidecar.kind === "placed") return { w: sidecar.geometry.w, h: sidecar.geometry.h };
	if (sidecar.kind === "sized") return sidecar.footprint;
	return undefined;
}

/** The line a name is listed on, one per line as spool writes it; the file's first when it cannot tell. */
function lineOf(bytes: string, name: string): { line: number; column: number } {
	const lines = bytes.split("\n");
	const at = lines.findIndex((line) => line.includes(JSON.stringify(name)));
	if (at < 0) return { line: 1, column: 1 };
	return { line: at + 1, column: (lines[at]?.indexOf(JSON.stringify(name)) ?? 0) + 1 };
}

function jsonError(bytes: string): string {
	try {
		JSON.parse(bytes);
		return "it is no object";
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

/** The frames of one page, by folder. */
function framesOf(designDir: string, page: string, read: (file: string) => string | undefined): string[] {
	return entries(join(designDir, "frames", page))
		.filter((entry) => entry.isDirectory() && isSafeName(entry.name))
		.filter((entry) => read(join(designDir, "frames", page, entry.name, "frame.tsx")) !== undefined)
		.map((entry) => entry.name);
}

/** Every frame of the project, by name, at any depth of pages. */
function allFrames(designDir: string, read: (file: string) => string | undefined): string[] {
	const found: string[] = [];
	const walk = (under: string) => {
		for (const entry of entries(join(designDir, "frames", under))) {
			if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
			const name = under === "" ? entry.name : `${under}/${entry.name}`;
			if (read(join(designDir, "frames", name, "frame.tsx")) !== undefined) found.push(name);
			else walk(name);
		}
	};
	walk("");
	return found;
}

function entries(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

/** A file's text, when it is a regular file inside design/: anything else reads as no file here. */
function reader(designDir: string): (file: string) => string | undefined {
	return (file) => {
		try {
			const inside = resolveDesignPath(designDir, file);
			if (!statSync(inside).isFile()) return undefined;
			return readFileSync(inside, "utf8");
		} catch {
			return undefined;
		}
	};
}
