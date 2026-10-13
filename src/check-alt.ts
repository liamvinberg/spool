import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";

/** Where a frame's own source first reads the ⌥ key. */
export interface AltReader {
	/** The file, relative to the project root. */
	path: string;
	line: number;
}

const SOURCE = new Set([".tsx", ".ts", ".jsx", ".js", ".mjs"]);

// what reading ⌥ looks like in a key handler: the flag, the modifier state,
// the key itself, or its two places on the board
const READS_ALT = /\baltKey\b|getModifierState\(\s*["'`]Alt["'`]\s*\)|["'`](?:Alt|AltLeft|AltRight)["'`]/u;

/**
 * The frames among `frames` (names under design/frames) whose own sources
 * read the ⌥ key (DEV-295). Inside a live frame ⌥ arrows and a held ⌥ are
 * spool's for moving between frames unless the frame keeps them with
 * preventDefault, so a frame that handles ⌥ is worth one look. The frame's
 * folder only: shared parts are many frames' and say nothing of one.
 */
export function altReaders(root: string, frames: readonly string[]): AltReader[] {
	const designDir = realDesignDir(root);
	const found: AltReader[] = [];
	for (const frame of frames) {
		let folder: string;
		try {
			folder = resolveDesignPath(designDir, join(designDir, "frames", frame));
		} catch (error) {
			if (error instanceof DesignBoundaryError) continue;
			throw error;
		}
		const hit = firstRead(folder);
		if (hit !== undefined) found.push({ path: join("design", "frames", frame, hit.file), line: hit.line });
	}
	return found;
}

/** One line for a frame that reads ⌥: where, and what spool does with the key. */
export function describeAltReader(reader: AltReader): string {
	return `${reader.path}:${reader.line} reads the ⌥ key: inside a live frame ⌥ arrows and a held ⌥ move between frames unless the frame calls preventDefault on them`;
}

function firstRead(folder: string): { file: string; line: number } | undefined {
	let names: string[];
	try {
		names = readdirSync(folder).sort();
	} catch {
		return undefined;
	}
	for (const name of names) {
		if (!SOURCE.has(extname(name).toLowerCase())) continue;
		const path = join(folder, name);
		if (!statSync(path).isFile()) continue;
		const lines = withoutComments(readFileSync(path, "utf8")).split("\n");
		const index = lines.findIndex((line) => READS_ALT.test(line));
		if (index !== -1) return { file: name, line: index + 1 };
	}
	return undefined;
}

/** The source with its comments blanked, lines kept where they were. */
export function withoutComments(source: string): string {
	let out = "";
	let index = 0;
	let quote: string | null = null;
	while (index < source.length) {
		const char = source[index] as string;
		const next = source[index + 1];
		if (quote !== null) {
			out += char;
			if (char === "\\") {
				out += next ?? "";
				index += 2;
				continue;
			}
			if (char === quote) quote = null;
			index += 1;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
			quote = char;
			out += char;
			index += 1;
			continue;
		}
		if (char === "/" && next === "/") {
			const end = source.indexOf("\n", index);
			index = end === -1 ? source.length : end;
			continue;
		}
		if (char === "/" && next === "*") {
			const end = source.indexOf("*/", index + 2);
			const comment = source.slice(index, end === -1 ? source.length : end + 2);
			out += comment.replace(/[^\n]/gu, " ");
			index += comment.length;
			continue;
		}
		out += char;
		index += 1;
	}
	return out;
}
