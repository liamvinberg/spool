import type { ProjectedFrame } from "../api";

export type SpatialDirection = "left" | "right" | "up" | "down";

/** Canvas-world distance: local groups use 80–580px gaps; separate fields sit thousands apart. */
export const MAX_SPATIAL_DISTANCE = 640;

interface Candidate {
	frame: ProjectedFrame;
	near: boolean;
	distance: number;
	aligned: boolean;
	forwardGap: number;
	lateralGap: number;
	forwardCenter: number;
}

/**
 * The next frame in a direction: candidates in the perpendicular beam win,
 * then the nearest facing edge. A center half-plane keeps overlapping frames
 * directional, while the final name comparison makes equal layouts stable.
 * Past MAX_SPATIAL_DISTANCE the key is never dead: with nothing in the local
 * group that way, the nearest frame beyond it is taken.
 */
export function nextSpatialFrame(
	from: ProjectedFrame,
	frames: readonly ProjectedFrame[],
	direction: SpatialDirection,
): ProjectedFrame | undefined {
	const horizontal = direction === "left" || direction === "right";
	const sign = direction === "left" || direction === "up" ? -1 : 1;
	const fromForwardCenter = horizontal ? from.x + from.w / 2 : from.y + from.h / 2;
	const fromForwardStart = horizontal ? from.x : from.y;
	const fromForwardEnd = horizontal ? from.x + from.w : from.y + from.h;
	const fromLateralStart = horizontal ? from.y : from.x;
	const fromLateralEnd = horizontal ? from.y + from.h : from.x + from.w;
	const candidates: Candidate[] = [];

	for (const frame of frames) {
		if (frame.name === from.name) continue;
		const forwardStart = horizontal ? frame.x : frame.y;
		const forwardEnd = horizontal ? frame.x + frame.w : frame.y + frame.h;
		const forwardCenter = (forwardStart + forwardEnd) / 2;
		if ((forwardCenter - fromForwardCenter) * sign <= 0) continue;

		const lateralStart = horizontal ? frame.y : frame.x;
		const lateralEnd = horizontal ? frame.y + frame.h : frame.x + frame.w;
		const lateralGap = intervalGap(fromLateralStart, fromLateralEnd, lateralStart, lateralEnd);
		const forwardGap =
			sign > 0 ? Math.max(0, forwardStart - fromForwardEnd) : Math.max(0, fromForwardStart - forwardEnd);
		const distance = Math.hypot(forwardGap, lateralGap);
		candidates.push({
			frame,
			near: distance <= MAX_SPATIAL_DISTANCE,
			distance,
			aligned: lateralGap === 0,
			forwardGap,
			lateralGap,
			forwardCenter: Math.abs(forwardCenter - fromForwardCenter),
		});
	}

	candidates.sort(
		(a, b) =>
			Number(b.near) - Number(a.near) ||
			(a.near ? 0 : a.distance - b.distance) ||
			Number(b.aligned) - Number(a.aligned) ||
			a.forwardGap - b.forwardGap ||
			a.lateralGap - b.lateralGap ||
			a.forwardCenter - b.forwardCenter ||
			a.frame.name.localeCompare(b.frame.name),
	);
	return candidates[0]?.frame;
}

/**
 * The way back along ⌥-arrow steps: `at` is the frame the last step landed on,
 * `back` the frames it came from, newest last, each with the direction left in.
 */
export interface SpatialTrail {
	at: string;
	back: readonly { name: string; direction: SpatialDirection }[];
}

const OPPOSITE: Record<SpatialDirection, SpatialDirection> = {
	left: "right",
	right: "left",
	up: "down",
	down: "up",
};

/**
 * One ⌥-arrow step. Reversing the last step returns to the frame it came
 * from (→ then ← lands where you started) whatever the geometry says; any
 * other step goes to the spatial neighbour and extends the trail. A trail not
 * standing on `from` is stale (the selection moved some other way) and starts over.
 */
export function stepSpatially(
	from: ProjectedFrame,
	frames: readonly ProjectedFrame[],
	direction: SpatialDirection,
	trail: SpatialTrail | null,
): { target: ProjectedFrame; trail: SpatialTrail } | undefined {
	const back = trail?.at === from.name ? trail.back : [];
	const last = back.at(-1);
	if (last !== undefined && last.direction === OPPOSITE[direction]) {
		const target = frames.find((frame) => frame.name === last.name);
		if (target !== undefined) return { target, trail: { at: target.name, back: back.slice(0, -1) } };
	}
	const target = nextSpatialFrame(from, frames, direction);
	if (target === undefined) return undefined;
	return { target, trail: { at: target.name, back: [...back, { name: from.name, direction }] } };
}

/** The gap between two frames, corner to corner: what MAX_SPATIAL_DISTANCE measures. */
export function spatialGap(a: ProjectedFrame, b: ProjectedFrame): number {
	return Math.hypot(intervalGap(a.x, a.x + a.w, b.x, b.x + b.w), intervalGap(a.y, a.y + a.h, b.y, b.y + b.h));
}

function intervalGap(a1: number, a2: number, b1: number, b2: number): number {
	return Math.max(0, a1 - b2, b1 - a2);
}
