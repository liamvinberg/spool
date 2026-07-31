/**
 * Where in a file one edit landed (#214).
 *
 * The daemon never sees a tool call — only the canvas reads the transcript — so it
 * cannot publish a range it never learns. This is the other half of that: the canvas
 * has the strings an edit was made of, the daemon owns the file, and the answer is a
 * line range the frame's own `data-spool-source` stamps can be matched against.
 *
 * Nothing here interprets the edit. It is a search for a string in a file, and the
 * caller decides which strings name the block: an applied edit is named by what it
 * put there, and the text it replaced is the fallback for the beat before the write
 * has landed on disk. First hit wins, in the order the caller asked.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { DesignBoundaryError, designRelativePath, realDesignDir, resolveDesignPath } from "./design-path";

/** One block of a file, in the spelling and the numbering a stamp uses. */
export interface LocatedRange {
	/** design-relative, which is how `data-spool-source` spells a file */
	readonly path: string;
	/** 1-based and inclusive, the same numbering as a stamp's line */
	readonly from: number;
	readonly to: number;
}

/**
 * The lines one string occupies in one file, or nothing when it is not in it.
 *
 * The first occurrence, not the only one. An `Edit`'s `old_string` is unique by that
 * tool's own contract and what replaced it almost always is too, so a second hit means
 * the caller handed over something that names no particular block — and a plate over
 * the first of two identical blocks is a worse answer than no plate, which is what
 * `undefined` gets. Counting them to refuse would cost a full scan of every file for a
 * case the tool's contract already rules out, so the first hit stands.
 *
 * A trailing newline belongs to the line it ends rather than opening a new one: an edit
 * written as a whole block ends with one, and counting it would put the plate one line
 * past the last thing that changed.
 */
export function lineRangeOf(text: string, needle: string): { from: number; to: number } | undefined {
	if (needle === "") return undefined;
	const at = text.indexOf(needle);
	if (at < 0) return undefined;
	let from = 1;
	for (let index = 0; index < at; index += 1) if (text[index] === "\n") from += 1;
	const body = needle.replace(/\n+$/, "");
	let span = 0;
	for (const char of body) if (char === "\n") span += 1;
	return { from, to: from + span };
}

/**
 * The block one of these strings names, inside this project's design/.
 *
 * The path arrives as the agent spelled it — absolute from a tool call, or relative to
 * the project root — and leaves design-relative, because the two ends of this have to
 * agree on one spelling and the stamps are the end that cannot be changed. Anything
 * that resolves outside design/ is not a frame's source and gets no answer, which is
 * the same boundary every other read in the daemon holds.
 */
export function locateInDesign(root: string, path: string, find: readonly string[]): LocatedRange | undefined {
	let designDir: string;
	let file: string;
	try {
		designDir = realDesignDir(root);
		file = resolveDesignPath(designDir, isAbsolute(path) ? path : join(root, path));
	} catch (error) {
		if (error instanceof DesignBoundaryError) return undefined;
		throw error;
	}
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
	for (const needle of find) {
		const range = lineRangeOf(text, needle);
		if (range !== undefined) return { path: designRelativePath(designDir, file), ...range };
	}
	return undefined;
}
