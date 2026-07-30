import { readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { extractJsxSpan, type JsxSpan } from "./jsx-span";
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
			/**
			 * What spool calls this element: the name the source wrote, or the live tag
			 * when there is no source to read (#116). Never unique — sibling rows of one
			 * list share it — which is why removal reaches out to the canvas, where they
			 * are two boxes in two places.
			 */
			name: string;
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

/**
 * A selection the rail captured, read back off the wire (#170).
 *
 * The one caller is a queued message, which carries the selection block from its own
 * Enter rather than from the moment the queue fires — so the list has to travel, and
 * the daemon reads it back rather than looking one up. It is the same enriched shape
 * the daemon served the rail in the first place: `spool selection`'s own renderer is
 * still the only thing that turns it into bytes, so a chat turn and a CLI agent read
 * one contract.
 *
 * Strict rather than coercing. A half-read entry would print `undefined` into
 * somebody's prompt, which is worse than the turn being turned away.
 *
 * The one thing it does rewrite is the excerpt's length, because `selectionBlock` is
 * written against the promise that every excerpt reaching it is already inside the cap
 * — true of the store, which caps on the way in, and not true of a list arriving over
 * the wire. Capping here keeps that promise for both readers rather than teaching the
 * renderer to distrust its input. It is the only field with a budget, and the entry's
 * pointer, which is the whole of what an agent needs, is never touched.
 */
export function parseSelectionEntries(value: unknown): SelectionEntry[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const entries: SelectionEntry[] = [];
	for (const raw of value) {
		if (typeof raw !== "object" || raw === null) return undefined;
		const { kind, frame, path, size, name, lines, selector, excerpt, generated } = raw as Record<string, unknown>;
		if (typeof frame !== "string" || !isSafeName(frame) || typeof path !== "string") return undefined;
		if (kind === "frame") {
			const box = size as Record<string, unknown> | undefined;
			if (typeof box?.w !== "number" || typeof box.h !== "number") return undefined;
			entries.push({ kind: "frame", frame, path, size: { w: box.w, h: box.h } });
			continue;
		}
		if (kind !== "element") return undefined;
		if (typeof name !== "string" || typeof selector !== "string" || typeof excerpt !== "string") return undefined;
		if (!Array.isArray(lines) || lines.length !== 2 || !lines.every((line) => typeof line === "number")) {
			return undefined;
		}
		if (generated !== undefined && generated !== true) return undefined;
		entries.push({
			kind: "element",
			frame,
			name,
			path,
			lines: [lines[0] as number, lines[1] as number],
			selector,
			excerpt: cap(excerpt),
			...(generated === true ? { generated: true as const } : {}),
		});
	}
	return entries;
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
			name: tagOf(outerHtml),
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
	// and its name comes from the same place its excerpt does — the stamped
	// ancestor's authored name would be somebody else's word for it
	const name = generated ? tagOf(outerHtml) : (span?.name ?? tagOf(outerHtml));
	const entry: SelectionEntry = {
		kind: "element",
		frame,
		name,
		path: `design/${stamp.rel}`,
		lines,
		selector,
		excerpt,
	};
	return generated ? { ...entry, generated: true } : entry;
}

/** The frame's own source path, wherever its page put the folder (#39). */
function framePathOf(frame: string, page: string | undefined): string {
	return `design/${frameFolder(frame, page)}/frame.tsx`;
}

export interface Stamp {
	file: string;
	rel: string;
	line: number;
	column: number;
}

/**
 * "frames/cart/frame.tsx:4:4" → a file safely inside design/. Malformed or
 * lexical traversal stamps degrade to no stamp. A symlink escape fails with
 * the shared path-relative boundary diagnostic.
 */
export function parseStamp(root: string, source: string): Stamp | undefined {
	const match = source.match(/^(.+):(\d+):(\d+)$/);
	const [, raw, lineText, columnText] = match ?? [];
	if (raw === undefined || lineText === undefined || columnText === undefined) return undefined;
	const rel = normalize(raw.replaceAll("\\", "/"));
	if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return undefined;
	const line = Number.parseInt(lineText, 10);
	const column = Number.parseInt(columnText, 10);
	if (line < 1 || column < 1) return undefined;
	let file: string;
	try {
		const designDir = realDesignDir(root);
		file = resolveDesignPath(designDir, join(designDir, rel), raw);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
	return { file, rel: rel.split(sep).join("/"), line, column };
}

function spanOf(stamp: Stamp): JsxSpan | undefined {
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

/**
 * The live DOM's own word for an element, off the serialization it handed over.
 *
 * `outerHTML` always opens on the tag, so this is a read rather than a guess; the
 * fallback exists because a payload is somebody else's input and a noun is not
 * worth a 400.
 */
function tagOf(outerHtml: string): string {
	return /^<\s*([A-Za-z][\w$.:-]*)/.exec(outerHtml.slice(0, 80))?.[1] ?? "element";
}
