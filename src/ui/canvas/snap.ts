import type { Box } from "./camera";

/**
 * Snap math for drag-move (#23), pure: the dragged selection's bounding box
 * pulls onto other frames' edges and centers within a threshold. Edges snap
 * to edges, centers to centers — never across kinds. Per axis the closest
 * alignment wins and its coordinate becomes the guide line.
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
const PAIRS: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[0, 2],
	[2, 0],
	[2, 2],
	[1, 1],
];

export function snapMovedBox(moving: Box, statics: Box[], threshold: number): SnapResult {
	const x = snapAxis(
		[moving.x, moving.x + moving.w / 2, moving.x + moving.w],
		statics.map((s) => [s.x, s.x + s.w / 2, s.x + s.w]),
		threshold,
	);
	const y = snapAxis(
		[moving.y, moving.y + moving.h / 2, moving.y + moving.h],
		statics.map((s) => [s.y, s.y + s.h / 2, s.y + s.h]),
		threshold,
	);
	return { dx: x.delta, dy: y.delta, v: x.guides, h: y.guides };
}

function snapAxis(
	own: [number, number, number],
	targets: Array<[number, number, number]>,
	threshold: number,
): { delta: number; guides: number[] } {
	let best: { delta: number; coord: number } | undefined;
	for (const target of targets) {
		for (const [o, t] of PAIRS) {
			const coord = target[t] as number;
			const delta = coord - (own[o] as number);
			if (Math.abs(delta) <= threshold && (best === undefined || Math.abs(delta) < Math.abs(best.delta))) {
				best = { delta, coord };
			}
		}
	}
	return best === undefined ? { delta: 0, guides: [] } : { delta: best.delta, guides: [best.coord] };
}
