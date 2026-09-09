import type { Box } from "./camera";
import type { Sign, Size, SizeLimits } from "./hand-resize";
import { snapEdge } from "./snap";

/**
 * Element resize snapping (#311), pure.
 *
 * The frame snapping this reuses is the same calculation: `snapEdge` pulls one
 * dragged edge onto the nearest edge or centre in range and says which stops it
 * landed on. What differs is what the stops are made of — a sibling's box and
 * the parent's content box, measured by the document rather than owned by the
 * canvas — and that a size is not a position: an element cannot be moved onto a
 * stop, so the correction is a size, and how far the dragged edge travels per
 * pixel of that size is a fact only the running layout can state.
 *
 * That fact is `sensitivity`. It is why a normal-flow element's west edge earns
 * no snap: the layout, not the size, decides where that edge is, so the edge
 * does not move and nothing here pretends otherwise.
 */

/** The approved reach: six screen pixels, whatever the canvas is zoomed to. */
export const SNAP_SCREEN_PX = 6;

/** Closer than this and the edge is on the stop; further and the guide would lie. */
const LANDED = 0.02;

/** One thing a dragged edge may land on, identified by the node it was read off. */
export interface SnapTarget {
	/** the document's own per-node identity — never an authored id, which repeats */
	id: number;
	box: Box;
}

/** What one sample asks of the snap: the gesture's shape, in document pixels. */
export interface SnapRequest {
	sx: Sign;
	sy: Sign;
	/** the outer canvas zoom, which turns six screen pixels into document ones */
	zoom: number;
	/** ⌘/Ctrl: the whole pool drops while it is held */
	bypass: boolean;
	/** the border box proportions ⇧ keeps, or null where the axes are free */
	ratio: number | null;
	/** how far the dragged edge moves per pixel of written size, per axis */
	sensitivity: { w: number; h: number };
	limits: SizeLimits;
	/** the sizes this drag can actually write, which whole-pixel drags round */
	quantize?: { w(value: number): number; h(value: number): number };
}

/** A corrected size and the stops it is a true statement about. */
export interface ElementSnap {
	size: Size;
	/** document x coordinates of the vertical guides the correction earned */
	v: number[];
	/** document y coordinates of the horizontal guides */
	h: number[];
}

type Axis = "x" | "y";

/** The edge this drag is holding, which is the one a stop may pull. */
export const activeEdge = (box: Box, axis: Axis, sign: Sign): number =>
	axis === "x" ? box.x + (sign > 0 ? box.w : 0) : box.y + (sign > 0 ? box.h : 0);

const along = (axis: Axis): "w" | "h" => (axis === "x" ? "w" : "h");

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function boundsOf(request: SnapRequest, axis: Axis): { min: number; max: number } {
	const { limits } = request;
	const min = axis === "x" ? limits.minW : limits.minH;
	const max = axis === "x" ? limits.maxW : limits.maxH;
	// CSS gives the minimum precedence where the two contradict, as the drag does
	return { min, max: Math.max(min, max ?? Number.MAX_SAFE_INTEGER) };
}

/**
 * The size the drag would have to write, and whether it can.
 *
 * A drag writing whole pixels can only land on whole pixels, and a size the
 * element's own limits refuse is a size it never reaches. Either way the stop
 * is out of reach, and an unreachable stop earns no guide rather than a guide
 * over a size nobody got.
 */
function reachable(request: SnapRequest, axis: Axis, wanted: number, slope: number): number | null {
	const { min, max } = boundsOf(request, axis);
	const quantized = request.quantize?.[along(axis)](wanted) ?? wanted;
	const settled = clamp(quantized, min, max);
	return Math.abs((settled - wanted) * slope) <= LANDED ? settled : null;
}

interface AxisSnap {
	axis: Axis;
	sign: Sign;
	slope: number;
	/** how far the dragged edge would move to reach the nearest stop */
	delta: number;
	guides: number[];
}

/**
 * One sample's correction: the nearest stop within the threshold, once.
 *
 * Every sample starts from the raw pointer intent rather than from the last
 * corrected size, so a snap never feeds itself and a slow drag past a stop
 * leaves it rather than sticking to it.
 */
export function snapResize(box: Box, size: Size, targets: readonly SnapTarget[], request: SnapRequest): ElementSnap {
	const none: ElementSnap = { size, v: [], h: [] };
	if (!(request.zoom > 0) || request.bypass) return none;
	const boxes = targets.map((target) => target.box);
	const threshold = SNAP_SCREEN_PX / request.zoom;
	const axes: AxisSnap[] = (["x", "y"] as const).map((axis) => {
		const sign = axis === "x" ? request.sx : request.sy;
		const slope = axis === "x" ? request.sensitivity.w : request.sensitivity.h;
		// an edge the size cannot move is the layout's, and is left to it
		if (sign === 0 || Math.abs(slope) < 0.001) return { axis, sign, slope, delta: 0, guides: [] };
		const value = activeEdge(box, axis, sign);
		const snap = snapEdge(value, boxes, axis, threshold);
		return { axis, sign, slope, delta: snap.value - value, guides: snap.guides };
	});

	const corrected = { ...size };
	const marks: { v: number[]; h: number[] } = { v: [], h: [] };
	// ⇧ holds one shape, so one axis is corrected and the other is what that
	// shape then makes it: two stops at once would be two different boxes
	const pulled = request.ratio === null ? axes : nearest(axes);
	for (const axis of pulled) {
		if (axis.guides.length === 0) continue;
		const settled = reachable(request, axis.axis, corrected[along(axis.axis)] + axis.delta / axis.slope, axis.slope);
		if (settled === null) continue;
		if (request.ratio !== null) {
			const held = proportional(request, axis.axis, settled, request.ratio);
			if (held === null) continue;
			corrected.w = held.w;
			corrected.h = held.h;
		} else corrected[along(axis.axis)] = settled;
		if (axis.axis === "x") marks.v = axis.guides;
		else marks.h = axis.guides;
	}
	if (marks.v.length === 0 && marks.h.length === 0) return none;
	return { size: corrected, ...marks };
}

/** Under ⇧ the nearer stop is the one the drag meant; the other follows it. */
function nearest(axes: readonly AxisSnap[]): AxisSnap[] {
	const offered = axes.filter((axis) => axis.guides.length > 0);
	return offered.length < 2
		? offered
		: [offered.reduce((best, axis) => (Math.abs(axis.delta) < Math.abs(best.delta) ? axis : best))];
}

/** The box that keeps the proportions, or nothing where the other axis cannot. */
function proportional(request: SnapRequest, axis: Axis, settled: number, ratio: number): Size | null {
	const other = axis === "x" ? settled / ratio : settled * ratio;
	const kept = reachable(request, axis === "x" ? "y" : "x", other, 1);
	if (kept === null) return null;
	return axis === "x" ? { w: settled, h: kept } : { w: kept, h: settled };
}

/** The three stops a target offers on one axis, in the order it offers them. */
const stopsOf = (box: Box, axis: Axis): number[] =>
	axis === "x" ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.y, box.y + box.h / 2, box.y + box.h];

/**
 * Whether the guides are still true of the box the layout actually made.
 *
 * A correction is a proposal: CSS may round it away, refuse it, or move the
 * target itself while answering it. So the drawn guide is checked against the
 * measurement taken afterwards — the dragged edge really is on the line, and
 * the line really is a boundary the same node still keeps, the same one it was
 * chosen for. A node replaced by another wearing the same authored id fails
 * that, because identity here is the node's own.
 */
export function truthful(
	result: ElementSnap,
	actual: Box,
	fresh: readonly SnapTarget[],
	request: SnapRequest,
	original: readonly SnapTarget[],
): boolean {
	if (request.ratio !== null && Math.abs(actual.w / actual.h - request.ratio) > LANDED) return false;
	const holds = (axis: Axis, guides: readonly number[], sign: Sign): boolean =>
		guides.every(
			(guide) =>
				Math.abs(activeEdge(actual, axis, sign) - guide) <= LANDED &&
				fresh.some((target) =>
					stopsOf(target.box, axis).some(
						(stop, at) =>
							Math.abs(stop - guide) <= LANDED &&
							original.some(
								(was) =>
									was.id === target.id &&
									Math.abs((stopsOf(was.box, axis)[at] ?? Number.NaN) - guide) <= LANDED,
							),
					),
				),
		);
	return holds("x", result.v, request.sx) && holds("y", result.h, request.sy);
}
