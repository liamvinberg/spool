/**
 * An uncaught throw's stack, read back to the frame's own files. A frame's
 * bundle is one inline module in its document, so every stack line of it names
 * the document's URL at a line deep in the bundle; with the bundle's source map
 * that line becomes the .tsx file and line that threw. A shot or logs boot
 * pays for the map only when a boot threw (`compileFrameSourceMap`).
 */

/** A bundle as compiled with its map: the module the document inlines, and the map's fields read here. */
export interface BundleMap {
	/** The module as the document inlines it, escaped for its script tag. */
	bootJs: string;
	/** As the map names them, relative to wherever the caller resolves them. */
	sources: readonly string[];
	mappings: string;
}

/** Where a module script's text starts in its document: its first line and that line's column, zero-based. */
interface ScriptStart {
	line: number;
	column: number;
}

/** The document's inline frame module, located by its own text; nothing when the document holds another bundle. */
export function locateBundle(document: string, inlined: string): ScriptStart | undefined {
	const tag = '<script type="module">';
	const at = document.lastIndexOf(`${tag}${inlined}`);
	if (at === -1) return undefined;
	const start = at + tag.length;
	const before = document.slice(0, start);
	const line = before.split("\n").length - 1;
	return { line, column: start - (before.lastIndexOf("\n") + 1) };
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT = new Map([...BASE64].map((char, i) => [char, i]));

/** One generated line's segments, decoded: [generated column, source, line, column], all zero-based. */
type Segment = [number, number, number, number];

/**
 * The segments of one generated line. The map's fields are deltas carried
 * across every line before it, so the lines above are decoded and dropped.
 */
function segmentsOf(mappings: string, wanted: number): Segment[] {
	let source = 0;
	let line = 0;
	let column = 0;
	const lines = mappings.split(";");
	let found: Segment[] = [];
	for (let index = 0; index <= wanted && index < lines.length; index++) {
		let generated = 0;
		const segments: Segment[] = [];
		for (const segment of (lines[index] ?? "").split(",")) {
			if (segment === "") continue;
			const fields = decodeVlq(segment);
			generated += fields[0] ?? 0;
			if (fields.length < 4) continue;
			source += fields[1] ?? 0;
			line += fields[2] ?? 0;
			column += fields[3] ?? 0;
			segments.push([generated, source, line, column]);
		}
		found = segments;
	}
	return found;
}

function decodeVlq(segment: string): number[] {
	const values: number[] = [];
	let value = 0;
	let shift = 0;
	for (const char of segment) {
		const digit = DIGIT.get(char) ?? 0;
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
			continue;
		}
		values.push(value & 1 ? -(value >>> 1) : value >>> 1);
		value = 0;
		shift = 0;
	}
	return values;
}

/** A bundle position, zero-based, as `file:line:column` the way an editor takes it, or nothing unmapped. */
export function originalPosition(map: BundleMap, line: number, column: number): string | undefined {
	let best: Segment | undefined;
	for (const segment of segmentsOf(map.mappings, line)) {
		if (segment[0] > column) break;
		best = segment;
	}
	if (best === undefined) return undefined;
	const file = map.sources[best[1]];
	return file === undefined ? undefined : `${file}:${best[2] + 1}:${best[3] + 1}`;
}

/** A stack line's location: `at name (url:line:col)` or `at url:line:col`. */
const STACK_LINE = /^(\s*at (?:.*? \()?)(.+?):(\d+):(\d+)(\)?)\s*$/;

/** How many of the frame's own stack lines are kept; the rest is React and libraries calling it. */
const MAPPED_LINES = 8;

/**
 * A stack with every line in the frame's document rewritten to the file and
 * line it came from, and the lines that are not the frame's (React's
 * scheduler, a library) left out, since they say nothing an agent can edit.
 * A stack with no line in the document comes back as it was, cut short.
 */
export function mapStack(
	stack: string,
	isDocument: (url: string) => boolean,
	locate: (line: number, column: number) => string | undefined,
): string {
	const [head, ...rest] = stack.split("\n");
	const kept: string[] = [];
	const others: string[] = [];
	for (const line of rest) {
		const match = STACK_LINE.exec(line);
		if (match === null) {
			if (others.length === 0 && kept.length === 0) others.push(line);
			continue;
		}
		const [, lead = "", url = "", row = "", col = "", close = ""] = match;
		if (!isDocument(url)) {
			others.push(line);
			continue;
		}
		const where = locate(Number(row) - 1, Number(col) - 1);
		if (where === undefined) others.push(line);
		else if (kept.length < MAPPED_LINES) kept.push(`${lead}${where}${close}`);
	}
	if (kept.length > 0) return [head, ...kept].join("\n");
	return [head, ...others.slice(0, MAPPED_LINES)].join("\n");
}

/**
 * Locates a document position in the bundle it inlines: the document's line
 * and column, zero-based, to the bundle's, then to the source.
 */
export function documentLocator(document: string, map: BundleMap) {
	const start = locateBundle(document, map.bootJs);
	if (start === undefined) return undefined;
	return (line: number, column: number): string | undefined => {
		const row = line - start.line;
		if (row < 0) return undefined;
		return originalPosition(map, row, row === 0 ? column - start.column : column);
	};
}

/**
 * A boot's uncaught throws with their stacks read back to the frame's files,
 * in its console and in its errors alike. The map is compiled only when a
 * throw has a line in the document to map.
 */
export async function mapBootStacks<T extends { entries: { type: string; text: string }[]; errors: string[] }>(
	boot: T,
	document: string,
	documentPath: string,
	sourceMap: () => Promise<BundleMap | undefined>,
): Promise<T> {
	const isDocument = (url: string) => {
		try {
			return new URL(url).pathname === documentPath;
		} catch {
			return false;
		}
	};
	const map = boot.errors.some((text) => text.includes(documentPath)) ? await sourceMap() : undefined;
	const locate = map === undefined ? undefined : documentLocator(document, map);
	const read = (text: string) => mapStack(text, isDocument, locate ?? (() => undefined));
	return {
		...boot,
		errors: boot.errors.map(read),
		entries: boot.entries.map((entry) => (entry.type === "pageerror" ? { ...entry, text: read(entry.text) } : entry)),
	};
}
