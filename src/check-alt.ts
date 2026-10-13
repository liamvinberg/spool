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
// the key itself, its two places on the board, or a combo string a hotkey
// library takes ("alt+k", "mod+alt+arrowleft")
const READS_ALT =
	/\baltKey\b|getModifierState\(\s*["'`]Alt["'`]\s*\)|["'`](?:Alt|AltLeft|AltRight)["'`]|["'`](?:[a-z]+\+)*alt\+/iu;

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

/** The first read in the frame's folder and the folders inside it, by path. */
function firstRead(folder: string, under = ""): { file: string; line: number } | undefined {
	let names: string[];
	try {
		names = readdirSync(join(folder, under)).sort();
	} catch {
		return undefined;
	}
	for (const name of names) {
		if (name.startsWith(".") || name === "node_modules") continue;
		const file = under === "" ? name : `${under}/${name}`;
		const path = join(folder, file);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			const found = firstRead(folder, file);
			if (found !== undefined) return found;
			continue;
		}
		if (!stat.isFile() || !SOURCE.has(extname(name).toLowerCase())) continue;
		const lines = withoutComments(readFileSync(path, "utf8")).split("\n");
		const index = lines.findIndex((line) => READS_ALT.test(line));
		if (index !== -1) return { file, line: index + 1 };
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
			// a quote or apostrophe left open never runs past its line
			if (char === quote || (char === "\n" && quote !== "`")) quote = null;
			index += 1;
			continue;
		}
		// an apostrophe in words (JSX text: Don't) follows a letter; a string
		// never starts straight after one
		const word = index > 0 && /[\p{L}\p{N}]/u.test(source[index - 1] as string);
		if ((char === '"' || char === "'" || char === "`") && !word) {
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
