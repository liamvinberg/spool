import { pageParent, pageWithin } from "../../page-path";
import type { Geometry } from "../api";

/**
 * The peek's arithmetic (spool#224): one folder's frames as a small flat map at
 * their real geometry, and the way back from a point on that map to a spot on
 * the folder's own canvas, where a frame carried onto it lands.
 */

/** the map's size, the same for every folder so walking from one to the next moves nothing but the stills */
export const PEEK_MAP = { w: 296, h: 184 } as const;

/** How a page's frames sit in a box: world px to map px, and the world point at the box's top left. */
export interface MapFit {
	readonly s: number;
	readonly ox: number;
	readonly oy: number;
}

type Box = Pick<Geometry, "x" | "y" | "w" | "h">;

function boundsOf(boxes: readonly Box[]): Box | undefined {
	if (boxes.length === 0) return undefined;
	const x = Math.min(...boxes.map((b) => b.x));
	const y = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.w));
	const bottom = Math.max(...boxes.map((b) => b.y + b.h));
	return { x, y, w: right - x, h: bottom - y };
}

/** The frames fitted inside a w × h box, centred, keeping their spots; an empty page is a screen's worth of field. */
export function peekFit(frames: readonly Box[], w: number, h: number, pad = 12): MapFit {
	const box = boundsOf(frames) ?? { x: 0, y: 0, w: 1440, h: 900 };
	const s = Math.min((w - pad * 2) / Math.max(1, box.w), (h - pad * 2) / Math.max(1, box.h));
	return { s, ox: box.x - (w / s - box.w) / 2, oy: box.y - (h / s - box.h) / 2 };
}

/** the world point under a point on the map */
export function worldAt(fit: MapFit, mx: number, my: number): { x: number; y: number } {
	return { x: fit.ox + mx / fit.s, y: fit.oy + my / fit.s };
}

/**
 * Where frames carried onto a spot stand on their new page: the group centred
 * on it, each keeping its place among the others, rounded as the sidecar is.
 */
export function placesAt(
	frames: readonly (Box & { readonly name: string })[],
	spot: { readonly x: number; readonly y: number },
): Record<string, Geometry> {
	const box = boundsOf(frames);
	if (box === undefined) return {};
	const left = spot.x - box.w / 2;
	const top = spot.y - box.h / 2;
	return Object.fromEntries(
		frames.map((frame) => [
			frame.name,
			{
				x: Math.round(left + frame.x - box.x),
				y: Math.round(top + frame.y - box.y),
				w: Math.round(frame.w),
				h: Math.round(frame.h),
			},
		]),
	);
}

/**
 * How long a drag rests on a folder before it looks into it: a shut tree row
 * opens under a carried page, a peek opens beside a carried frame.
 *
 * A drag crosses folders on its way to somewhere else, so looking into every one
 * it touches unfolds things under the hand that is trying to cross them. Resting
 * is the difference between passing over a folder and looking into one, and the
 * arc on the row's chevron says the rest is being counted.
 */
export const SPRING_MS = 450;

/** Where a folder can be peeked from: a row of the Pages tree, a row of a list of pages, a name on the path. */
export type PeekFrom = "tree" | "list" | "path";

/**
 * Where something carried would land outside the rail's own gaps: into a
 * folder named by a tree row, a list row, a path name or a cell of a peek, or
 * on a spot of a peek's map, a world point on that folder's canvas.
 */
export type CarryTarget =
	| { readonly kind: "into"; readonly page: string; readonly at: PeekFrom | "peek" }
	| { readonly kind: "spot"; readonly page: string; readonly x: number; readonly y: number };

/**
 * The one reading of a drag over the chrome, which the canvas's frame drag and
 * the rail's row drag both ask on every move. `own` is the rail's word for a
 * pointer inside its own list: the folder row its drop would go into, if any,
 * which is all the carrier needs there to spring a peek.
 */
export interface Carrier {
	over(carried: Carried, x: number, y: number, own?: string | null): CarryTarget | null;
	/** the drag let go or was put back: nothing is lit, and a peek it sprang goes */
	end(): void;
}

/** What a drag carries across the chrome: frames, or pages, by name. */
export interface Carried {
	readonly kind: "frame" | "page";
	readonly names: readonly string[];
}

/**
 * Whether what is carried can land on a page: frames anywhere but the page
 * they are all on already, a page anywhere but inside itself or where it is.
 */
export function canLand(carried: Carried, page: string, pageOfFrame: (name: string) => string): boolean {
	if (carried.names.length === 0) return false;
	if (carried.kind === "frame") return !carried.names.every((name) => pageOfFrame(name) === page);
	return carried.names.every((each) => each !== page && !pageWithin(each, page) && pageParent(each) !== page);
}
