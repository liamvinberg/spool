import { readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { cap, elementHandles, type PickedElement } from "../element-handles";
import { isFramePath } from "../page-path";
import { parseStampRef } from "../stamp";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
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
export type ElementPut = PickedElement;

/** The canvas's wire shape: a frame list, or the picked elements in pick order. */
export type SelectionPut = { frames: string[] } | { elements: ElementPut[] };

export function parseSelectionPut(value: unknown): SelectionPut | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (Array.isArray(record.frames)) {
		if (!record.frames.every((name): name is string => typeof name === "string" && isFramePath(name))) {
			return undefined;
		}
		return { frames: record.frames };
	}
	if (!Array.isArray(record.elements)) return undefined;
	const elements: ElementPut[] = [];
	for (const element of record.elements) {
		if (typeof element !== "object" || element === null) return undefined;
		const { frame, selector, outerHtml, source, generated } = element as Record<string, unknown>;
		if (typeof frame !== "string" || !isFramePath(frame)) return undefined;
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
		if (typeof frame !== "string" || !isFramePath(frame) || typeof path !== "string") return undefined;
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

	return {
		set,
		get,
		relocate: (root: string, target: string) => {
			const selection = byRoot.get(root);
			if (selection) byRoot.set(target, selection);
			byRoot.delete(root);
		},
	};
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
					path: framePathOf(frame),
					size: frameGeometry(root, frame),
				},
			];
		});
	}
	return put.elements.map((element) => elementEntry(root, element));
}

export function elementEntry(root: string, put: ElementPut): SelectionEntry {
	const stamp = put.source === null ? undefined : parseStamp(root, put.source);
	return { kind: "element", frame: put.frame, ...elementHandles(put, stamp, stamp && readText(stamp.file)) };
}

function readText(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
}

/** The frame's own source path, which its name already spells (#39, #336). */
function framePathOf(frame: string): string {
	return `design/${frameFolder(frame)}/frame.tsx`;
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
	const at = parseStampRef(source);
	if (at === undefined) return undefined;
	const { rel: raw, line, column } = at;
	const rel = normalize(raw.replaceAll("\\", "/"));
	if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return undefined;
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
