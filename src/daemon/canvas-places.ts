import { carriedKeys, carriedPage, isPagePath, pageParent, pageWithin } from "../page-path";
import { canvasFile, readCanvasFile, writeCanvasField } from "./canvas-file";

/**
 * Where each page stands on the field holding it, in design/canvas.json (#265).
 *
 * A page's place is an arrangement a hand made, exactly like the rail's order,
 * so it lives in the committed file rather than in per-machine ephemera: a page
 * moved on one machine arrives moved on another after a pull. This is the
 * second durable `canvas-order.ts` said the file would grow, and it takes the
 * shape that module's header names — it owns exactly one key and carries every
 * other key of the file through untouched.
 *
 * Advisory, like order. A key naming a page nothing holds any more is left
 * alone rather than cleaned, because a read that tidied the file would drop the
 * place a page an agent is halfway through moving is about to come back to; and
 * a page with no key is completed by the projection, beside its parent page's
 * own field, the way a frame born without a sidecar is.
 *
 * World units in the coordinate space of the page holding it, integers, because
 * that is what a frame's sidecar stores and a page stands among frames.
 */

export interface Place {
	x: number;
	y: number;
}

/** Every page that has a place, keyed by page path; a page path is never `""`. */
export type CanvasPlaces = Record<string, Place>;

/** The stored places, or nothing stored — a malformed key set reads as absent. */
export function readPlaces(root: string): CanvasPlaces {
	const file = readCanvasFile(canvasFile(root));
	return (file.kind === "read" ? parsePlaces(file.fields.places) : undefined) ?? {};
}

/**
 * Store the places, carrying the rest of the file through. No places takes the
 * key back out rather than leaving `"places": {}` behind: a canvas nobody has
 * arranged and a canvas whose arrangement names nothing are the same fact.
 */
export function writePlaces(root: string, places: CanvasPlaces): void {
	writeCanvasField(canvasFile(root), "places", Object.keys(places).length === 0 ? undefined : places);
}

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

/**
 * A page that moved carries its subtree's places, and gives up its own where it
 * changed parent.
 *
 * A place is where a page stands on one particular field, so which of the two
 * halves survives is decided by whether it is still on that field. Renamed in
 * place, it is the same page in the same spot and the key follows the folder.
 * Moved into another page, the coordinate meant something on the field it left:
 * the key goes, and the projection completes a fresh place beside the field it
 * arrived on. Every page *inside* the one that moved keeps its place either
 * way, because none of them changed the field they stand on.
 */
export function withPageMoved(places: CanvasPlaces, from: string, to: string): CanvasPlaces | undefined {
	const touched = Object.keys(places).some((page) => carriedPage(page, from, to) !== undefined);
	if (!touched) return undefined;
	const carried = carriedKeys(places, from, to);
	if (pageParent(from) !== pageParent(to)) delete carried[to];
	return carried;
}

/** A trashed page takes its own place and every place inside it. */
export function withPagesDropped(places: CanvasPlaces, pages: readonly string[]): CanvasPlaces | undefined {
	const gone = (page: string): boolean => pages.some((each) => page === each || pageWithin(each, page));
	if (!Object.keys(places).some(gone)) return undefined;
	return Object.fromEntries(Object.entries(places).filter(([page]) => !gone(page)));
}

function asPlace(value: unknown): Place | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const { x, y } = value as { x?: unknown; y?: unknown };
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return { x: Math.round(x), y: Math.round(y) };
}
