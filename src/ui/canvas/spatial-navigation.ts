import type { ProjectedFrame } from "../api";

export type SpatialDirection = "left" | "right" | "up" | "down";

interface Candidate {
	frame: ProjectedFrame;
	aligned: boolean;
	forwardGap: number;
	lateralGap: number;
	forwardCenter: number;
}

/**
 * The next frame in a direction: candidates in the perpendicular beam win,
 * then the nearest facing edge. A center half-plane keeps overlapping frames
 * directional, while the final name comparison makes equal layouts stable.
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
		candidates.push({
			frame,
			aligned: lateralGap === 0,
			forwardGap,
			lateralGap,
			forwardCenter: Math.abs(forwardCenter - fromForwardCenter),
		});
	}

	candidates.sort(
		(a, b) =>
			Number(b.aligned) - Number(a.aligned) ||
			a.forwardGap - b.forwardGap ||
			a.lateralGap - b.lateralGap ||
			a.forwardCenter - b.forwardCenter ||
			a.frame.name.localeCompare(b.frame.name),
	);
	return candidates[0]?.frame;
}

function intervalGap(a1: number, a2: number, b1: number, b2: number): number {
	return Math.max(0, a1 - b2, b1 - a2);
}
