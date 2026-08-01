import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { FORMAT_VERSION } from "../templates";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { isSafeName } from "./project-files";

/**
 * Manual order, in design/canvas.json (#228).
 *
 * It lives beside the format stamp rather than in .spool/ because an
 * arrangement somebody made by hand is the canvas, not this machine's cache of
 * it: canvas.json is committed and cloned, .spool/ is per-machine ephemera. So
 * this owns exactly one key of that file and carries every other key through
 * untouched — a project that grows a second durable is not this module's to
 * know about, and a write must never be how it loses one.
 *
 * Order is advisory. A name in it can be stale, can name a frame that moved
 * page, and can be missing a frame born a second ago; the client merges it
 * against the projection. Nothing here rewrites it to agree, because a read
 * that "cleaned" the file would drop the place a frame is about to come back to.
 */

/** The root page's slot — the same `""` the move and duplicate wires spell it with. */
export const ROOT_PAGE = "";

export interface CanvasOrder {
	/**
	 * Named pages in rail order. The root page is permanent and first (#39), so
	 * it never appears here — unlike `frames`, whose root slot is a real one.
	 */
	pages?: string[];
	/** Each page's frames in rail order, keyed by page name, `""` for the root page. */
	frames?: Record<string, string[]>;
}

/** A canvas.json spool will not overwrite, because it cannot read what it would lose. */
export class CanvasFileError extends Error {
	constructor() {
		super("design/canvas.json is not a JSON object — spool will not overwrite it");
		this.name = "CanvasFileError";
	}
}

function canvasFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, "canvas.json"));
}

type CanvasFile =
	| { kind: "read"; fields: Record<string, unknown> }
	| { kind: "absent" }
	/** Present, and not an object: the one state a write refuses rather than clobbers. */
	| { kind: "unreadable" };

function readCanvasFile(file: string): CanvasFile {
	let raw: string;
	try {
		// the boundary was answered before the read: this takes a resolved path
		raw = readFileSync(file, "utf8");
	} catch {
		return { kind: "absent" };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { kind: "unreadable" };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { kind: "unreadable" };
	return { kind: "read", fields: parsed as Record<string, unknown> };
}

/** The stored order, or nothing stored — a malformed one reads as absent. */
export function readOrder(root: string): CanvasOrder {
	const file = readCanvasFile(canvasFile(root));
	return (file.kind === "read" ? parseOrder(file.fields.order) : undefined) ?? {};
}

/**
 * Store one order, carrying the rest of the file through. An order of nothing
 * takes the key back out rather than leaving `"order": {}` behind: no order and
 * an order naming nothing are the same fact about this canvas.
 */
export function writeOrder(root: string, order: CanvasOrder): void {
	const file = canvasFile(root);
	const held = readCanvasFile(file);
	if (held.kind === "unreadable") throw new CanvasFileError();
	// a project whose marker vanished gets it back stamped, never a bare order
	const fields: Record<string, unknown> = held.kind === "read" ? { ...held.fields } : { format: FORMAT_VERSION };
	if (isEmpty(order)) delete fields.order;
	else fields.order = order;
	writeAtomic(file, `${JSON.stringify(fields, null, "\t")}\n`);
}

/** Strict on the way in (PUT bodies), lenient on the way out — the state file's rule. */
export function parseOrder(value: unknown): CanvasOrder | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const order: CanvasOrder = {};
	if (record.pages !== undefined) {
		if (!isNameList(record.pages)) return undefined;
		order.pages = record.pages;
	}
	if (record.frames !== undefined) {
		const claimed = record.frames;
		if (typeof claimed !== "object" || claimed === null || Array.isArray(claimed)) return undefined;
		const frames: Record<string, string[]> = {};
		for (const [page, names] of Object.entries(claimed)) {
			if (!isPageSlot(page) || !isNameList(names)) return undefined;
			frames[page] = names;
		}
		order.frames = frames;
	}
	return order;
}

/** A page rename carries the page's own place in the rail and its frame list. */
export function withPageRenamed(order: CanvasOrder, from: string, to: string): CanvasOrder | undefined {
	const named = order.pages?.includes(from) === true;
	const held = order.frames?.[from];
	if (!named && held === undefined) return undefined;
	const carried: CanvasOrder = { ...order };
	if (order.pages !== undefined) carried.pages = order.pages.map((page) => (page === from ? to : page));
	if (order.frames !== undefined && held !== undefined) {
		const frames = { ...order.frames, [to]: held };
		delete frames[from];
		carried.frames = frames;
	}
	return carried;
}

/** A trashed page takes its place in the rail and its frame list with it. */
export function withPagesDropped(order: CanvasOrder, pages: readonly string[]): CanvasOrder | undefined {
	const gone = new Set(pages);
	const named = order.pages?.some((page) => gone.has(page)) === true;
	const held = Object.keys(order.frames ?? {}).some((page) => gone.has(page));
	if (!named && !held) return undefined;
	const dropped: CanvasOrder = { ...order };
	if (order.pages !== undefined) dropped.pages = order.pages.filter((page) => !gone.has(page));
	if (order.frames !== undefined) {
		const frames = { ...order.frames };
		for (const page of gone) delete frames[page];
		dropped.frames = frames;
	}
	return dropped;
}

function isEmpty(order: CanvasOrder): boolean {
	return (order.pages ?? []).length === 0 && Object.keys(order.frames ?? {}).length === 0;
}

function isPageSlot(page: string): boolean {
	return page === ROOT_PAGE || isSafeName(page);
}

function isNameList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((name) => typeof name === "string" && isSafeName(name));
}
