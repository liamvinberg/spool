import { useMemo } from "react";
import type { FlowLink, ProjectedFrame } from "../api";

/**
 * The threads (#25), to the system page's primitive: declared links solid,
 * walked links dashed 5 5, both 1.5px thread with a filled head — constant
 * screen weight, so every world measure divides by the camera's k. Drawn
 * under the frames in world space; arrows are the map, never a hit target.
 */

const HEAD_LENGTH = 10;
const HEAD_HALF_WIDTH = 4.5;
const MIN_BOW = 40;

interface Point {
	x: number;
	y: number;
}

interface Arrow {
	key: string;
	path: string;
	head: string;
	dashed: boolean;
}

export function FlowArrows({ frames, links, k }: { frames: ProjectedFrame[]; links: FlowLink[]; k: number }) {
	const arrows = useMemo(() => {
		const byName = new Map(frames.map((frame) => [frame.name, frame]));
		const out: Arrow[] = [];
		for (const link of links) {
			// a self-walk and a link to a frame not on the field draw nothing
			if (link.from === link.to) continue;
			const from = byName.get(link.from);
			const to = byName.get(link.to);
			if (from === undefined || to === undefined) continue;
			out.push({ key: `${link.from}\0${link.to}`, ...routeArrow(from, to, k), dashed: link.kind === "walked" });
		}
		return out;
	}, [frames, links, k]);

	if (arrows.length === 0) return null;
	return (
		<svg
			aria-hidden="true"
			width="1"
			height="1"
			className="pointer-events-none absolute top-0 left-0"
			style={{ overflow: "visible" }}
		>
			{arrows.map((arrow) => (
				<g key={arrow.key} fill="none" stroke="var(--color-thread)" strokeWidth={1.5 / k}>
					<path d={arrow.path} strokeDasharray={arrow.dashed ? `${5 / k} ${5 / k}` : undefined} />
					<path d={arrow.head} fill="var(--color-thread)" stroke="none" />
				</g>
			))}
		</svg>
	);
}

/**
 * Leave the facing edge of the source, arrive at the facing edge of the
 * target: a cubic whose tangents stay perpendicular to the edges, bowing with
 * distance — the system page's gentle curve at any layout.
 */
function routeArrow(from: ProjectedFrame, to: ProjectedFrame, k: number): { path: string; head: string } {
	const dx = to.x + to.w / 2 - (from.x + from.w / 2);
	const dy = to.y + to.h / 2 - (from.y + from.h / 2);
	const horizontal = Math.abs(dx) >= Math.abs(dy);
	const sign = horizontal ? Math.sign(dx) || 1 : Math.sign(dy) || 1;

	const start: Point = horizontal
		? { x: sign > 0 ? from.x + from.w : from.x, y: from.y + from.h / 2 }
		: { x: from.x + from.w / 2, y: sign > 0 ? from.y + from.h : from.y };
	const tip: Point = horizontal
		? { x: sign > 0 ? to.x : to.x + to.w, y: to.y + to.h / 2 }
		: { x: to.x + to.w / 2, y: sign > 0 ? to.y : to.y + to.h };

	// the stroke stops where the head begins; the head's tip touches the frame
	const headLength = HEAD_LENGTH / k;
	const halfWidth = HEAD_HALF_WIDTH / k;
	const end: Point = horizontal
		? { x: tip.x - sign * headLength, y: tip.y }
		: { x: tip.x, y: tip.y - sign * headLength };

	const span = horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
	const bow = Math.max(MIN_BOW / k, span * 0.4);
	const c1: Point = horizontal ? { x: start.x + sign * bow, y: start.y } : { x: start.x, y: start.y + sign * bow };
	const c2: Point = horizontal ? { x: end.x - sign * bow, y: end.y } : { x: end.x, y: end.y - sign * bow };

	const path = `M ${round(start.x)} ${round(start.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(end.x)} ${round(end.y)}`;
	const head = horizontal
		? `M ${round(tip.x)} ${round(tip.y)} L ${round(end.x)} ${round(tip.y - halfWidth)} L ${round(end.x)} ${round(tip.y + halfWidth)} Z`
		: `M ${round(tip.x)} ${round(tip.y)} L ${round(tip.x - halfWidth)} ${round(end.y)} L ${round(tip.x + halfWidth)} ${round(end.y)} Z`;
	return { path, head };
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
