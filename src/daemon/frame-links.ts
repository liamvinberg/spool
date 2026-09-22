import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { writeAtomic } from "../atomic-write";
import { carriedPage } from "../page-path";
import { realDesignDir } from "./design-path";
import { targetLiterals } from "./nav-sites";
import { frameDirectories, frameFolder } from "./projection";
import { unnoticed } from "./seen";

/**
 * Walk targets re-aimed when frames change name (#336).
 *
 * A frame is named by its path, so renaming a frame, moving it to another page,
 * or renaming or moving a page that holds it all change what every walk into it
 * has to say. A gesture that promised to rearrange must not leave the flows
 * broken, so after the folders move, every target that named a moved frame is
 * written again at its new name. That covers every source file under design/,
 * shared/ included, because a name means the same frame wherever it is spelled.
 *
 * What counts as a target is exactly what the flow map reads (`nav-sites.ts`):
 * a `data-go` string, a `ui.go` literal, either arm of a branch between them,
 * and a `links` value. A destination the parser cannot read (a constant, a
 * lookup, a built string) is left alone and stays reported as unreadable,
 * never guessed at. A copy is not a rename: the frames a copy was made from
 * still answer to their names, so every walk keeps its destination.
 */

/** Where one old frame name lands, or nothing when the change never touched it. */
export type Retarget = (target: string) => string | undefined;

/** The frames and pages a change moved, as old name → new name pairs. */
export interface Moved {
	frames?: ReadonlyArray<{ from: string; to: string }>;
	pages?: ReadonlyArray<{ from: string; to: string }>;
}

/** One retarget for every kind of move: a frame by its name, a page by everything under it. */
export function retargetFor(moved: Moved): Retarget {
	const frames = new Map((moved.frames ?? []).map(({ from, to }) => [from, to]));
	const pages = moved.pages ?? [];
	return (target) => {
		const frame = frames.get(target);
		if (frame !== undefined) return frame;
		// a frame is never a page, so only the frames under a page move with it
		for (const page of pages) {
			const carried = carriedPage(target, page.from, page.to);
			if (carried !== undefined) return carried;
		}
		return undefined;
	};
}

const SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

/**
 * Rewrite every target a change moved, in every source file under design/, and
 * say which design-relative files were written, sorted.
 *
 * Every file is rewritten in memory before the first write lands, so the frames
 * the writes touch are known up front. The rewrite is spool's bookkeeping
 * rather than an edit to what a frame draws, so a frame somebody had already
 * looked at stays seen (`seen.ts`).
 */
export function retargetLinks(root: string, retarget: Retarget): string[] {
	const designDir = realDesignDir(root);
	const writes: { file: string; path: string; source: string }[] = [];
	for (const file of sourceFiles(designDir)) {
		const path = relative(designDir, file).split(sep).join("/");
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const rewritten = retargetSource(source, path, retarget);
		if (rewritten !== source) writes.push({ file, path, source: rewritten });
	}
	if (writes.length > 0) {
		const touched = [...frameDirectories(root)].flatMap(([name, dir]) =>
			writes.some((write) => write.path.startsWith(`${frameFolder(name)}/`)) ? [{ name, dir }] : [],
		);
		unnoticed(root, touched, () => {
			for (const write of writes) writeAtomic(write.file, write.source);
		});
	}
	return writes.map((write) => write.path);
}

/**
 * One file's text with its moved targets written at their new names. Each new
 * name is written inside the quotes the author used; a name that cannot sit
 * inside them unescaped is left as it was, and the flow map reports it missing.
 */
export function retargetSource(source: string, path: string, retarget: Retarget): string {
	const edits: { start: number; end: number; text: string }[] = [];
	for (const literal of targetLiterals(source, path)) {
		const to = retarget(literal.target);
		if (to === undefined || to === literal.target) continue;
		const quote = source[literal.start];
		if (quote === undefined || !`"'\``.includes(quote) || /["'`\\$\n]/.test(to)) continue;
		edits.push({ start: literal.start, end: literal.end, text: `${quote}${to}${quote}` });
	}
	if (edits.length === 0) return source;
	let out = source;
	for (const edit of edits.sort((a, b) => b.start - a.start)) {
		out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`;
	}
	return out;
}

/** Every authored source file under design/, app-owned and hidden folders skipped. */
function sourceFiles(designDir: string): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const child = join(dir, entry.name);
			if (entry.isDirectory()) walk(child);
			else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) found.push(child);
		}
	};
	walk(designDir);
	return found.sort();
}
