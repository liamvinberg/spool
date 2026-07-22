import type { Box } from "./camera";

/**
 * Snap math for the hands (#23), pure: drag-move pulls the dragged selection's
 * bounding box onto other frames' edges and centers, resize pulls the dragged
 * edge alone onto the same stops. Edges snap to edges, centers to centers —
 * never across kinds. Per axis the closest alignment corrects the gesture;
 * every alignment the corrected geometry lands on becomes a guide line, an
 * equal-size match showing its two edge lines with the redundant center
 * dropped — the Figma pattern, so equal heights never flicker.
 */

export interface SnapResult {
	dx: number;
	dy: number;
	/** World x coordinates of vertical guide lines. */
	v: number[];
	/** World y coordinates of horizontal guide lines. */
	h: number[];
}

/** own index × target index over [edge, center, edge] — the legal pairs. */
const PAIRS: ReadonlyArray<readonly [0 | 1 | 2, 0 | 1 | 2]> = [
	[0, 0],
	[0, 2],
	[2, 0],
	[2, 2],
	[1, 1],
];

/** Alignment looser than float noise is no alignment — guides never lie. */
const EPS = 1e-6;

const stopsOf = (box: Box, axis: "x" | "y"): [number, number, number] =>
	axis === "x" ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.y, box.y + box.h / 2, box.y + box.h];

export function snapMovedBox(moving: Box, statics: Box[], threshold: number): SnapResult {
	const x = snapAxis(
		stopsOf(moving, "x"),
		statics.map((s) => stopsOf(s, "x")),
		threshold,
	);
	const y = snapAxis(
		stopsOf(moving, "y"),
		statics.map((s) => stopsOf(s, "y")),
		threshold,
	);
	return { dx: x.delta, dy: y.delta, v: x.guides, h: y.guides };
}

/** The dragged edge of a resize: the nearest stop within the threshold wins. */
export function snapEdge(
	value: number,
	statics: Box[],
	axis: "x" | "y",
	threshold: number,
): { value: number; guides: number[] } {
	let best: number | undefined;
	for (const target of statics) {
		for (const stop of stopsOf(target, axis)) {
			if (
				Math.abs(stop - value) <= threshold &&
				(best === undefined || Math.abs(stop - value) < Math.abs(best - value))
			) {
				best = stop;
			}
		}
	}
	if (best === undefined) return { value, guides: [] };
	const snapped = best;
	const guides: number[] = [];
	for (const target of statics) {
		for (const stop of stopsOf(target, axis)) {
			if (Math.abs(stop - snapped) <= EPS && !guides.includes(stop)) guides.push(stop);
		}
	}
	return { value: snapped, guides: guides.sort((a, b) => a - b) };
}

function snapAxis(
	own: [number, number, number],
	targets: Array<[number, number, number]>,
	threshold: number,
): { delta: number; guides: number[] } {
	let best: number | undefined;
	for (const target of targets) {
		for (const [o, t] of PAIRS) {
			const delta = target[t] - own[o];
			if (Math.abs(delta) <= threshold && (best === undefined || Math.abs(delta) < Math.abs(best))) best = delta;
		}
	}
	if (best === undefined) return { delta: 0, guides: [] };
	const delta = best;
	const guides: number[] = [];
	for (const target of targets) {
		const landed = PAIRS.filter(([o, t]) => Math.abs(target[t] - (own[o] + delta)) <= EPS);
		const hasEdge = landed.some(([o]) => o !== 1);
		for (const [o, t] of landed) {
			// an equal-size match: its edge lines carry it, the center would repeat it
			if (o === 1 && hasEdge) continue;
			const coord = target[t];
			if (!guides.includes(coord)) guides.push(coord);
		}
	}
	return { delta, guides: guides.sort((a, b) => a - b) };
}
