import { isPagePath, isPageSlot, isSafeName, ROOT_PAGE } from "../page-path";

/**
 * The arrangements design/canvas.json keeps beside its format stamp, as values:
 * the rail's order (canvas-order.ts) and where each page stands (canvas-places.ts).
 * Reading them needs no disk, so the cloud reads its copy of the file the same way.
 */

export interface CanvasOrder {
	/**
	 * Each parent page's own pages in rail order, keyed by the parent's path,
	 * `""` for the root parent. The root page is permanent and first (#39), so it
	 * never appears in a list — unlike `frames`, whose root slot is a real one.
	 */
	pages?: Record<string, string[]>;
	/** Each page's frames in rail order, keyed by the page's path, `""` for the root page. */
	frames?: Record<string, string[]>;
}

export interface Place {
	x: number;
	y: number;
}

/** Every page that has a place, keyed by page path; a page path is never `""`. */
export type CanvasPlaces = Record<string, Place>;

/** Strict on the way in (PUT bodies), lenient on the way out — the state file's rule. */
export function parsePlaces(value: unknown): CanvasPlaces | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const places: CanvasPlaces = {};
	for (const [page, place] of Object.entries(value as Record<string, unknown>)) {
		// the root page is the field itself and stands nowhere, so it is never keyed
		if (!isPagePath(page)) return undefined;
		const point = asPlace(place);
		if (point === undefined) return undefined;
		places[page] = point;
	}
	return places;
}

function asPlace(value: unknown): Place | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const { x, y } = value as { x?: unknown; y?: unknown };
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return { x: Math.round(x), y: Math.round(y) };
}

/** Strict on the way in (PUT bodies), lenient on the way out — the state file's rule. */
export function parseOrder(value: unknown): CanvasOrder | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const order: CanvasOrder = {};
	if (record.pages !== undefined) {
		// a flat project's file says the root parent's list and nothing else, which
		// is what it has always said: reading it is what keeps that file unchanged
		const pages = isNameList(record.pages) ? { [ROOT_PAGE]: record.pages } : parseLists(record.pages);
		if (pages === undefined) return undefined;
		order.pages = pages;
	}
	if (record.frames !== undefined) {
		const frames = parseLists(record.frames);
		if (frames === undefined) return undefined;
		order.frames = frames;
	}
	return order;
}

/** Lists of names keyed by the page they belong to; `""` is the root page's slot. */
function parseLists(value: unknown): Record<string, string[]> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const lists: Record<string, string[]> = {};
	for (const [page, names] of Object.entries(value as Record<string, unknown>)) {
		if (!isPageSlot(page) || !isNameList(names)) return undefined;
		lists[page] = names;
	}
	return lists;
}

function isNameList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((name) => typeof name === "string" && isSafeName(name));
}
