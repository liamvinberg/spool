import { expect, it } from "vitest";
import { contentBoxOf, type SnapRequest, type SnapTarget, snapResize, truthful } from "./element-snap";
import type { ParentReading } from "./protocol";

/**
 * Element resize snapping (#311), as decisions over data.
 *
 * The dragged edge is pulled onto a sibling's edge or centre, or onto the
 * parent's content box, when it comes within six screen pixels of one. Every
 * number here is in the frame document's own pixels; what the canvas supplies
 * is its zoom, which is what turns six screen pixels into six of these.
 */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

const target = (id: number, x: number, y: number, w: number, h: number): SnapTarget => ({ id, box: box(x, y, w, h) });

const ask = (over: Partial<SnapRequest> = {}): SnapRequest => ({
	sx: 1,
	sy: 0,
	zoom: 1,
	ratio: null,
	sensitivity: { w: 1, h: 1 },
	limits: { minW: 0, minH: 0, maxW: null, maxH: null },
	...over,
});

it("pulls the dragged edge onto the nearest sibling edge inside six pixels", () => {
	// the element is 197 wide at x=0; the sibling's right edge is at 200
	const snap = snapResize(box(0, 0, 197, 100), { w: 197, h: 100 }, [target(1, 40, 200, 160, 40)], ask());
	expect(snap.size).toEqual({ w: 200, h: 100 });
	expect(snap.v).toEqual([200]);
	expect(snap.h).toEqual([]);
});

it("measures the six pixels on the screen, not in the document", () => {
	const stop = [target(1, 40, 200, 160, 40)];
	// at half zoom six screen pixels are twelve of the document's own
	const near = snapResize(box(0, 0, 191, 100), { w: 191, h: 100 }, stop, ask({ zoom: 0.5 }));
	expect(near.size.w).toBe(200);
	expect(snapResize(box(0, 0, 191, 100), { w: 191, h: 100 }, stop, ask({ zoom: 2 })).v).toEqual([]);
	// and at double zoom three document pixels are already six on the screen
	expect(snapResize(box(0, 0, 197.5, 100), { w: 197.5, h: 100 }, stop, ask({ zoom: 2 })).size.w).toBe(200);
});

it("leaves an edge the size cannot move to the layout that owns it", () => {
	// a normal-flow element's west edge does not move when its width does
	const west = snapResize(
		box(200, 0, 100, 100),
		{ w: 100, h: 100 },
		[target(1, 197, 200, 160, 40)],
		ask({ sx: -1, sensitivity: { w: 0, h: 1 } }),
	);
	expect(west).toEqual({ size: { w: 100, h: 100 }, v: [], h: [] });
});

it("moves the west edge of an element the file places, which travels the other way", () => {
	// the placement moves with the size, so a pixel of width is a pixel left
	const west = snapResize(
		box(200, 0, 100, 100),
		{ w: 100, h: 100 },
		[target(1, 197, 200, 160, 40)],
		ask({ sx: -1, sensitivity: { w: -1, h: 1 } }),
	);
	expect(west.size).toEqual({ w: 103, h: 100 });
	expect(west.v).toEqual([197]);
});

it("keeps a whole-pixel drag whole rather than snapping to a fractional stop", () => {
	const whole = { w: (value: number) => Math.round(value), h: (value: number) => Math.round(value) };
	const fractional = [target(1, 40, 200, 160.4, 40)];
	expect(snapResize(box(0, 0, 197, 100), { w: 197, h: 100 }, fractional, ask({ quantize: whole })).v).toEqual([]);
	// a stop a whole pixel can reach is still reached
	const reached = snapResize(
		box(0, 0, 197, 100),
		{ w: 197, h: 100 },
		[target(1, 40, 200, 160, 40)],
		ask({ quantize: whole }),
	);
	expect(reached.size.w).toBe(200);
});

it("refuses a stop the element's own limits put out of reach", () => {
	const capped = snapResize(
		box(0, 0, 197, 100),
		{ w: 197, h: 100 },
		[target(1, 40, 200, 160, 40)],
		ask({ limits: { minW: 0, minH: 0, maxW: 198, maxH: null } }),
	);
	expect(capped).toEqual({ size: { w: 197, h: 100 }, v: [], h: [] });
});

it("corrects both axes of a corner independently", () => {
	const corner = snapResize(
		box(0, 0, 197, 98),
		{ w: 197, h: 98 },
		[target(1, 200, 100, 60, 40)],
		ask({ sx: 1, sy: 1 }),
	);
	expect(corner.size).toEqual({ w: 200, h: 100 });
	expect(corner.v).toEqual([200]);
	expect(corner.h).toEqual([100]);
});

it("keeps the proportions ⇧ holds, taking the nearer of the two stops", () => {
	// 2:1, east and south both live; the width is 3 away and the height 5, so
	// the width wins and the height follows it rather than its own stop
	const ratio = snapResize(
		box(0, 0, 197, 98),
		{ w: 197, h: 98 },
		[target(1, 200, 103, 60, 40)],
		ask({ sx: 1, sy: 1, ratio: 2 }),
	);
	expect(ratio.size).toEqual({ w: 200, h: 100 });
	expect(ratio.v).toEqual([200]);
	expect(ratio.h).toEqual([]);
});

it("leaves no guide where the proportions cannot reach the stop", () => {
	const conflicted = snapResize(
		box(0, 0, 197, 98),
		{ w: 197, h: 98 },
		[target(1, 200, 103, 60, 40)],
		ask({ sx: 1, sy: 1, ratio: 2, limits: { minW: 0, minH: 0, maxW: null, maxH: 99 } }),
	);
	expect(conflicted).toEqual({ size: { w: 197, h: 98 }, v: [], h: [] });
});

it("holds a guide to the edge that landed and the target it named", () => {
	const before = [target(1, 40, 200, 160, 40)];
	const snap = snapResize(box(0, 0, 197, 100), { w: 197, h: 100 }, before, ask());
	const request = ask();
	// the layout put the edge where the correction said, on the same node's edge
	expect(truthful(snap, box(0, 0, 200, 100), before, request, before)).toBe(true);
	// the edge the layout actually gave is somewhere else
	expect(truthful(snap, box(0, 0, 198, 100), before, request, before)).toBe(false);
	// the target moved while the correction was applied, so the guide is stale
	expect(truthful(snap, box(0, 0, 200, 100), [target(1, 50, 200, 160, 40)], request, before)).toBe(false);
	// a different node at the same place is not the boundary that was named
	expect(truthful(snap, box(0, 0, 200, 100), [target(2, 40, 200, 160, 40)], request, before)).toBe(false);
});

it("refuses a guide over a box that lost the proportions it promised", () => {
	const before = [target(1, 200, 103, 60, 40)];
	const snap = snapResize(box(0, 0, 197, 98), { w: 197, h: 98 }, before, ask({ sx: 1, sy: 1, ratio: 2 }));
	const request = ask({ sx: 1, sy: 1, ratio: 2 });
	expect(truthful(snap, box(0, 0, 200, 100), before, request, before)).toBe(true);
	expect(truthful(snap, box(0, 0, 200, 120), before, request, before)).toBe(false);
});

it("keeps the offered order when two stops are equally near", () => {
	// the sibling and the parent's content box are three pixels away on either
	// side; the pool is offered siblings first, and the tie keeps that order
	const sibling = target(1, 40, 0, 160, 40);
	const parent = target(2, 0, 0, 206, 400);
	expect(snapResize(box(0, 0, 203, 100), { w: 203, h: 100 }, [sibling, parent], ask()).v).toEqual([200]);
	expect(snapResize(box(0, 0, 203, 100), { w: 203, h: 100 }, [parent, sibling], ask()).v).toEqual([206]);
});

it("lets the other axis round to what it can be written as", () => {
	// 5:3 held by ⇧: 208 wide is 124.8 tall, and a whole-pixel height of 125 is
	// the same shape as far as the box that comes back can tell
	const whole = { w: (value: number) => Math.round(value), h: (value: number) => Math.round(value) };
	const ratio = snapResize(
		box(0, 0, 205, 123),
		{ w: 205, h: 123 },
		[target(1, 40, 0, 168, 40)],
		ask({ sx: 1, sy: 0, ratio: 160 / 96, quantize: whole }),
	);
	expect(ratio.size).toEqual({ w: 208, h: 125 });
	expect(ratio.v).toEqual([208]);
});

/** A box 300 wide and 180 tall at (100, 50), with 1px borders and 12px padding. */
const reading = (over: Partial<ParentReading> = {}): ParentReading => ({
	box: { x: 100, y: 50, w: 300, h: 180 },
	scale: { w: 1, h: 1 },
	border: { left: 1, right: 1, top: 1, bottom: 1 },
	padding: { left: 12, right: 12, top: 10, bottom: 10 },
	size: { w: 300, h: 180 },
	borderBox: true,
	overflow: { x: "visible", y: "visible" },
	outer: { w: 300, h: 180 },
	inner: { w: 298, h: 178 },
	edge: { left: 1, top: 1 },
	scroll: { left: 0, top: 0 },
	...over,
});

it("takes the content box out of what the document said the parent is", () => {
	// 300 wide less two 1px borders and two 12px paddings
	expect(contentBoxOf(reading())).toEqual({ x: 113, y: 61, w: 274, h: 158 });
});

it("takes the space a scrollbar was given out of the content it measures", () => {
	// the box scrolls and 12 pixels of it are the scrollbar's: a reading that
	// spent them on content would put its right edge twelve pixels too far out
	const scrolling = reading({
		overflow: { x: "visible", y: "scroll" },
		inner: { w: 286, h: 178 },
	});
	expect(contentBoxOf(scrolling)).toEqual({ x: 113, y: 61, w: 262, h: 158 });
});

it("keeps the fraction the engine resolved the box to", () => {
	const fractional = reading({ box: { x: 100, y: 50, w: 300.5, h: 180 }, size: { w: 300.5, h: 180 } });
	expect(contentBoxOf(fractional)?.w).toBe(274.5);
});

it("moves the content box with the scroll its children are under", () => {
	const scrolled = reading({ scroll: { left: 30, top: 24 } });
	expect(contentBoxOf(scrolled)).toEqual({ x: 83, y: 37, w: 274, h: 158 });
});

it("proves nothing about a parent whose own numbers disagree", () => {
	// the resolved size and the box it is drawn as cannot both be right
	expect(contentBoxOf(reading({ size: { w: 260, h: 180 } }))).toBeNull();
	// a reservation measured against a fractional border cannot be trusted
	expect(
		contentBoxOf(
			reading({
				overflow: { x: "visible", y: "scroll" },
				border: { left: 1.5, right: 1.5, top: 1, bottom: 1 },
				inner: { w: 285, h: 178 },
				box: { x: 100, y: 50, w: 300, h: 180 },
			}),
		),
	).toBeNull();
});
