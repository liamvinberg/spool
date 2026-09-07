import { snapEdge } from "./snap-edge";
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface Size {
	w: number;
	h: number;
}
export type Sign = -1 | 0 | 1;
export interface Target {
	id: string;
	label?: string;
	box: Box;
}
export interface Request {
	sx: Sign;
	sy: Sign;
	zoom: number;
	threshold?: number;
	bypass?: boolean;
	ratio?: number;
}
export interface Correction {
	size: Size;
	v: number[];
	h: number[];
}
export const edge = (box: Box, axis: "x" | "y", sign: Sign) =>
	axis === "x" ? box.x + (sign > 0 ? box.w : 0) : box.y + (sign > 0 ? box.h : 0);
/** Existing frame snapEdge owns nearest edge/centre stops and stable input-order ties.
 * Geometry is document CSS pixels. Explicit outer canvas zoom sets the
 * six-screen-pixel threshold. Sensitivity converts a document edge correction
 * to authored CSS size; target collection and browser validation live elsewhere. */
export function correction(
	box: Box,
	size: Size,
	targets: Target[],
	request: Request,
	sensitivity: Size,
	scale: Size = { w: 1, h: 1 },
): Correction {
	if (!Number.isFinite(request.zoom) || request.zoom <= 0) throw new Error("invalid canvas zoom");
	const axes = (["x", "y"] as const).map((axis) => {
		const sign = axis === "x" ? request.sx : request.sy;
		const slope = axis === "x" ? sensitivity.w : sensitivity.h;
		const value = edge(box, axis, sign);
		const snap =
			sign === 0 || request.bypass || Math.abs(slope) < 0.001
				? { value, guides: [] }
				: snapEdge(
						value,
						targets.map((t) => t.box),
						axis,
						(request.threshold ?? 6) / request.zoom,
					);
		return { axis, delta: snap.value - value, guides: snap.guides, slope };
	});
	const next = { ...size };
	let v: number[] = [],
		h: number[] = [];
	if (request.ratio) {
		const winner = axes.filter((a) => a.guides.length).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
		if (winner) {
			if (winner.axis === "x") {
				next.w = Math.max(8, Math.round(size.w + winner.delta / winner.slope));
				next.h = Math.max(8, size.h + ((box.w + (next.w - size.w) * scale.w) / request.ratio - box.h) / scale.h);
				v = winner.guides;
			} else {
				next.h = Math.max(8, Math.round(size.h + winner.delta / winner.slope));
				next.w = Math.max(8, size.w + ((box.h + (next.h - size.h) * scale.h) * request.ratio - box.w) / scale.w);
				h = winner.guides;
			}
		}
	} else {
		for (const a of axes)
			if (a.guides.length) {
				if (a.axis === "x") {
					next.w = Math.max(8, Math.round(size.w + a.delta / a.slope));
					v = a.guides;
				} else {
					next.h = Math.max(8, Math.round(size.h + a.delta / a.slope));
					h = a.guides;
				}
			}
	}
	return { size: next, v, h };
}
export function truthful(
	result: Correction,
	actual: Box,
	targets: Target[],
	request: Request,
	original: Target[] = targets,
): boolean {
	const stops = (t: Target, axis: "x" | "y") => [
		t.box[axis],
		t.box[axis] + (axis === "x" ? t.box.w : t.box.h) / 2,
		t.box[axis] + (axis === "x" ? t.box.w : t.box.h),
	];
	const matches = (axis: "x" | "y", guides: number[], sign: Sign) =>
		guides.every(
			(g) =>
				Math.abs(edge(actual, axis, sign) - g) < 0.02 &&
				targets.some((t) =>
					stops(t, axis).some(
						(stop, i) =>
							Math.abs(stop - g) < 0.02 &&
							original.some((o) => o.id === t.id && Math.abs(stops(o, axis)[i]! - g) < 0.02),
					),
				),
		);
	return matches("x", result.v, request.sx) && matches("y", result.h, request.sy);
}
