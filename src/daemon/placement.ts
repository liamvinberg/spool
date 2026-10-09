import { composePage, medianFrameArea, pageBox, type Rect, type Size, shelfPages } from "../page-box";
import { pageHolds, pageParent, pageSlot } from "../page-path";
import type { CanvasPlaces, Place } from "./canvas-fields";
import type { Footprint } from "./sidecar";

/**
 * Where things stand on a field when nobody said: a frame born without a
 * sidecar and a page without a place. Pure, so the daemon placing what it finds
 * on disk and the cloud reading its copy of the same folder place them alike.
 */

/**
 * What a frame is when nobody said. A size left out is a size nobody thought
 * about, and the frame it belongs to is far more often a page than a phone: a
 * phone is a deliberate shape and states itself, while a desktop frame is what
 * you get when the thought was about the design rather than the viewport.
 * Everything here still holds the sizes it asked for; this is only the floor
 * under a frame that asked for nothing.
 */
export const DEFAULT_W = 1440;
export const DEFAULT_H = 900;
const GUTTER = 80;

export const DEFAULT_FOOTPRINT: Footprint = { w: DEFAULT_W, h: DEFAULT_H };

/** One frame as the placement reads it: where it sits, and which page's field it is on. */
export type FieldFrame = Rect & { page?: string };

/**
 * Where the next thing on a field goes: beside what is already there, on that
 * field's top line, never on top of anything.
 *
 * One rule, two callers. A frame born without a sidecar and a page with no
 * place are the same problem — something has arrived on a field that never said
 * where it stands — so they are answered the same way, and the field each of
 * them is measured against holds both kinds of thing.
 */
/** two rects share some area; touching edges do not */
export function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function besideField(field: readonly Rect[]): { x: number; y: number } {
	if (field.length === 0) return { x: GUTTER, y: GUTTER };
	return {
		x: Math.max(...field.map((each) => each.x + each.w)) + GUTTER,
		y: Math.min(...field.map((each) => each.y)),
	};
}

/** The box a page's object occupies on the field holding it (#265, `page-box.ts`). */
export function pageObjectBox(page: string, frames: readonly FieldFrame[]): Size {
	const under = frames.filter((frame) => pageHolds(page, pageSlot(frame)));
	const beside = frames.filter((frame) => pageSlot(frame) === pageParent(page));
	return pageBox(composePage(under), medianFrameArea(beside), under.length);
}

/** Every page standing on one page's field, as rects, in page order. */
export function pageObjectsOn(
	parent: string,
	pages: readonly string[],
	frames: readonly FieldFrame[],
	places: CanvasPlaces,
) {
	return pages
		.filter((page) => pageParent(page) === parent && places[page] !== undefined)
		.map((page) => ({ page, at: places[page] as Place, box: pageObjectBox(page, frames) }));
}

/**
 * Every page's place: the stored ones kept, the missing ones completed.
 *
 * A page with no place is given one exactly the way a frame with no sidecar is,
 * because a page is a thing on that field and the two of them are arranged among
 * each other. So the field a page is placed against holds both: the frames on
 * the parent page, and the pages already standing there.
 *
 * A field with no frames of its own is the exception (`shelfPages`): its pages
 * have nothing to be arranged against, so they stand on a shelf the daemon
 * owns, and a stored place there is overwritten rather than kept. The first
 * frame written onto that field makes the shelf the arrangement, and from then
 * on it is a hand's.
 *
 * Otherwise a stored place is left alone whatever it says, including one naming
 * a page that has since gone. Order is deterministic so two daemons reading the
 * same disk fill in the same coordinates.
 */
export function placePages(
	pages: readonly string[],
	frames: readonly FieldFrame[],
	stored: CanvasPlaces,
): { places: CanvasPlaces; filled: boolean } {
	const places: CanvasPlaces = { ...stored };
	const sorted = [...pages].sort((a, b) => a.localeCompare(b));
	const parents = [...new Set(sorted.map(pageParent))].sort((a, b) => a.localeCompare(b));
	let filled = false;
	for (const parent of parents) {
		const field: Rect[] = frames
			.filter((frame) => pageSlot(frame) === parent)
			.map(({ x, y, w, h }) => ({ x, y, w, h }));
		const held = sorted.filter((each) => pageParent(each) === parent);
		if (field.length === 0) {
			const shelf = shelfPages(held.map((page) => pageObjectBox(page, frames)));
			held.forEach((page, at) => {
				const place = shelf[at];
				if (place === undefined) return;
				const was = places[page];
				if (was?.x !== place.x || was.y !== place.y) filled = true;
				places[page] = place;
			});
			continue;
		}
		for (const { at, box } of pageObjectsOn(parent, sorted, frames, places)) field.push({ ...at, ...box });
		for (const page of held.filter((each) => places[each] === undefined)) {
			const box = pageObjectBox(page, frames);
			const at = besideField(field);
			places[page] = at;
			field.push({ ...at, ...box });
			filled = true;
		}
	}
	return { places, filled };
}
