import { composePage, fitComposition, medianFrameArea, type PageComposition, pageBox, type Rect } from "../../page-box";
import { pageHolds, pageName, pageParent, pageSlot } from "../../page-path";
import type { Place, ProjectedFrame } from "../api";

/**
 * The page objects standing on the page the canvas is showing (#265).
 *
 * Composed here rather than fetched: the projection already carries every frame
 * in the project with its page, its geometry and its cover, so a page's picture
 * is a read of what this side is holding. Nothing is baked, there is no second
 * asset, and a frame edited on a page two levels down redraws the object above
 * it as soon as the projection lands.
 */

/** One frame inside a page object, placed in the object's own space. */
export interface PageObjectFrame extends Rect {
	readonly name: string;
	/** The frame's cover hash, absent while it has no picture yet. */
	readonly hash?: string;
}

export interface PageObject {
	/** The page's path, which is its identity. */
	readonly page: string;
	/** What it is called — the last segment, which is what the label says. */
	readonly name: string;
	/** Every frame under it, its own pages' included: the number the rail carries. */
	readonly count: number;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly composition: PageComposition<PageObjectFrame>;
	/** The composition's transform into the box: uniform, whole, centred. */
	readonly fit: { scale: number; dx: number; dy: number };
}

/** Every frame under a page, at whatever depth — the subtree the object draws. */
export function framesUnder(page: string, frames: readonly ProjectedFrame[]): ProjectedFrame[] {
	return frames.filter((frame) => pageHolds(page, pageSlot(frame)));
}

/**
 * The pages standing on one page's field, in the order they are drawn.
 *
 * Only its own pages: a page two levels down is drawn inside the object above
 * it, never beside it. Sorted by path so the draw order is stable, which is all
 * the order has to be — where each one sits is its place, not its index.
 */
export function pageObjectsOn(
	activePage: string,
	pages: readonly string[],
	frames: readonly ProjectedFrame[],
	places: Readonly<Record<string, Place>>,
): PageObject[] {
	const beside = frames.filter((frame) => pageSlot(frame) === activePage);
	const median = medianFrameArea(beside);
	return pages
		.filter((page) => pageParent(page) === activePage)
		.sort((a, b) => a.localeCompare(b))
		.flatMap((page) => {
			const at = places[page];
			if (at === undefined) return [];
			const under = framesUnder(page, frames);
			const composition = composePage(
				under.map((frame) => ({
					name: frame.name,
					x: frame.x,
					y: frame.y,
					w: frame.w,
					h: frame.h,
					...(frame.cover === undefined ? {} : { hash: frame.cover.hash }),
				})),
			);
			const box = pageBox(composition, median, under.length);
			return [
				{
					page,
					name: pageName(page),
					count: under.length,
					x: at.x,
					y: at.y,
					...box,
					composition,
					fit: fitComposition(composition, box),
				},
			];
		});
}

/**
 * The page object under a point, the last-drawn one first.
 *
 * A page is picked on its own, so this answers before nothing rather than
 * beside the frame hit test: a press either landed on a page or it did not.
 */
export function pageObjectAt(objects: readonly PageObject[], point: { x: number; y: number }): PageObject | null {
	for (let at = objects.length - 1; at >= 0; at--) {
		const object = objects[at];
		if (object === undefined) continue;
		if (
			point.x >= object.x &&
			point.x <= object.x + object.w &&
			point.y >= object.y &&
			point.y <= object.y + object.h
		) {
			return object;
		}
	}
	return null;
}

/**
 * Whether the page the canvas is standing on has nothing to draw at all.
 *
 * Not "no frames on it" — a page of pages draws its pages and is not empty.
 * This is the other case the two used to share a picture: a page nobody has
 * written into, which holds nothing anywhere and gets the words the empty
 * project gets, scoped to itself.
 */
export function pageIsBare(activePage: string, pages: readonly string[], frames: readonly ProjectedFrame[]): boolean {
	if (frames.some((frame) => pageSlot(frame) === activePage)) return false;
	return !pages.some((page) => pageParent(page) === activePage);
}
