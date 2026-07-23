import { readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { extractJsxSpan } from "./jsx-span";
import { isSafeName } from "./project-files";
import { frameFolder, frameGeometry, lookupFrame } from "./projection";

/**
 * What Liam points at (#23), held in daemon memory and served over the API —
 * never mirrored to disk (#3). The payload is #6's contract: always a list;
 * frame entries carry {kind, frame, path, size}; element entries add
 * {lines, selector, excerpt}, four handles triangulating identity because no
 * single one survives a document that is both edited and executing. Generated
 * elements degrade honestly: lines point at the nearest stamped ancestor,
 * excerpt becomes live outerHTML, selector is the primary handle.
 */

export type SelectionEntry =
	| { kind: "frame"; frame: string; path: string; size: { w: number; h: number } }
	| {
			kind: "element";
			frame: string;
			path: string;
			lines: [number, number];
			selector: string;
			excerpt: string;
			generated?: true;
	  };

/** One element as the shim saw it — the canvas sends a list of these. */
export interface ElementPut {
	frame: string;
	selector: string;
	outerHtml: string;
	source: string | null;
	generated: boolean;
}

/** The canvas's wire shape: a frame list, or the picked elements in pick order. */
export type SelectionPut = { frames: string[] } | { elements: ElementPut[] };

const EXCERPT_CAP = 240;

export function parseSelectionPut(value: unknown): SelectionPut | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (Array.isArray(record.frames)) {
		if (!record.frames.every((name): name is string => typeof name === "string" && isSafeName(name))) {
			return undefined;
		}
		return { frames: record.frames };
	}
	if (!Array.isArray(record.elements)) return undefined;
	const elements: ElementPut[] = [];
	for (const element of record.elements) {
		if (typeof element !== "object" || element === null) return undefined;
		const { frame, selector, outerHtml, source, generated } = element as Record<string, unknown>;
		if (typeof frame !== "string" || !isSafeName(frame)) return undefined;
		if (typeof selector !== "string" || typeof outerHtml !== "string") return undefined;
		if (source !== null && typeof source !== "string") return undefined;
		if (typeof generated !== "boolean") return undefined;
		elements.push({ frame, selector, outerHtml, source, generated });
	}
	return { elements };
}

export function createSelectionStore() {
	const byRoot = new Map<string, SelectionEntry[]>();

	function set(root: string, put: SelectionPut): void {
		byRoot.set(root, enrich(root, put));
	}

	function get(root: string): SelectionEntry[] {
		return byRoot.get(root) ?? [];
	}

	return { set, get };
}

export type SelectionStore = ReturnType<typeof createSelectionStore>;

function enrich(root: string, put: SelectionPut): SelectionEntry[] {
	if ("frames" in put) {
		// a frame that vanished serves nothing — never a fabricated path/size
		return put.frames.flatMap((frame) => {
			const found = lookupFrame(root, frame);
			if (found.kind !== "found") return [];
			return [
				{
					kind: "frame" as const,
					frame,
					path: framePathOf(frame, found.page),
					size: frameGeometry(root, frame),
				},
			];
		});
	}
	return put.elements.map((element) => elementEntry(root, element));
}

function elementEntry(root: string, { frame, selector, outerHtml, source, generated }: ElementPut): SelectionEntry {
	const found = lookupFrame(root, frame);
	const framePath = framePathOf(frame, found.kind === "found" ? found.page : undefined);
	const stamp = source === null ? undefined : parseStamp(root, source);
	if (stamp === undefined) {
		// no stamp anywhere: JS-created DOM under an unstamped root (#6 degrade)
		return {
			kind: "element",
			frame,
			path: framePath,
			lines: [1, 1],
			selector,
			excerpt: cap(outerHtml),
			generated: true,
		};
	}

	const span = spanOf(stamp);
	const lines: [number, number] = span?.lines ?? [stamp.line, stamp.line];
	// a generated element's own markup never exists in source: live outerHTML
	// is the excerpt, the stamped ancestor lends its lines
	const excerpt = generated ? cap(outerHtml) : (span?.excerpt ?? sourceLine(stamp) ?? cap(outerHtml));
	const entry: SelectionEntry = { kind: "element", frame, path: `design/${stamp.rel}`, lines, selector, excerpt };
	return generated ? { ...entry, generated: true } : entry;
}

/** The frame's own source path, wherever its page put the folder (#39). */
function framePathOf(frame: string, page: string | undefined): string {
	return `design/${frameFolder(frame, page)}/frame.tsx`;
}

interface Stamp {
	file: string;
	rel: string;
	line: number;
	column: number;
}

/**
 * "frames/cart/frame.tsx:4:4" → a file safely inside design/. Stamps ride
 * DOM attributes, so anything malformed or escaping design/ reads as no
 * stamp at all — the entry degrades, the read never leaves the project.
 */
function parseStamp(root: string, source: string): Stamp | undefined {
	const match = source.match(/^(.+):(\d+):(\d+)$/);
	const [, raw, lineText, columnText] = match ?? [];
	if (raw === undefined || lineText === undefined || columnText === undefined) return undefined;
	const rel = normalize(raw.replaceAll("\\", "/"));
	if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return undefined;
	const line = Number.parseInt(lineText, 10);
	const column = Number.parseInt(columnText, 10);
	if (line < 1 || column < 1) return undefined;
	return { file: join(root, "design", rel), rel: rel.split(sep).join("/"), line, column };
}

function spanOf(stamp: Stamp): { lines: [number, number]; excerpt: string } | undefined {
	let text: string;
	try {
		text = readFileSync(stamp.file, "utf8");
	} catch {
		return undefined;
	}
	return extractJsxSpan(text, stamp.line, stamp.column);
}

/** The stamped line verbatim — the needle when the span cannot be walked. */
function sourceLine(stamp: Stamp): string | undefined {
	try {
		const line = readFileSync(stamp.file, "utf8").split("\n")[stamp.line - 1];
		return line === undefined || line.trim() === "" ? undefined : line.trim();
	} catch {
		return undefined;
	}
}

function cap(text: string): string {
	return text.length <= EXCERPT_CAP ? text : `${text.slice(0, EXCERPT_CAP - 1)}…`;
}
