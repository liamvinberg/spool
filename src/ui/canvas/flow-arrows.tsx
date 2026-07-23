import { useMemo } from "react";
import type { FlowEdge, ProjectedFrame } from "../api";
import { clamp } from "./camera";
import type { SiteBoxes } from "./protocol";

/**
 * The threads (#34), to the system page's primitive: every directed frame edge
 * draws one arrow, anchored to its first declared navigation site. The site's
 * stamped box projects onto the frame edge facing the target, with the
 * frame-edge midline as fallback. Edges claimed only from branches draw faint;
 * dashed is retired. Heads pick their target side by approach angle, and every
 * touch point on a frame edge — arriving tips and fallback tails alike —
 * spreads along it, so arrows can never chain through a shared point into a
 * link nobody declared. 1.5px thread, constant screen weight (world measures
 * divide by the camera's k), drawn under the frames; arrows are the map, never
 * a hit target.
 */

const HEAD_LENGTH = 10;
const HEAD_HALF_WIDTH = 4.5;
const MIN_BOW = 40;
/** World-unit lane distance between touch points sharing a frame edge. */
const SPREAD = 32;
/** World-unit margin keeping touch points off frame corners. */
const EDGE_MARGIN = 16;
const FAINT_OPACITY = 0.4;

interface Point {
	x: number;
	y: number;
}

type Side = "n" | "s" | "e" | "w";

const OUTWARD: Record<Side, Point> = {
	n: { x: 0, y: -1 },
	s: { x: 0, y: 1 },
	e: { x: 1, y: 0 },
	w: { x: -1, y: 0 },
};

const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

export interface RoutedArrow {
	key: string;
	tail: Point;
	tip: Point;
	path: string;
	head: string;
	faint: boolean;
}

/** Frame-local site boxes by frame name, as the shims answered them. */
export type SiteBoxesByFrame = Record<string, SiteBoxes>;

interface TouchPoint {
	/** Cross-axis coordinate along the edge; mutated by the spread pass. */
	at: number;
	/** The far end's cross-axis coordinate — lanes sort by where they go. */
	toward: number;
	/** Anchored tails keep their element's position; the rest spread. */
	anchored: boolean;
}

interface Spec {
	key: string;
	from: ProjectedFrame;
	to: ProjectedFrame;
	exit: Side;
	entry: Side;
	tail: TouchPoint;
	tip: TouchPoint;
	faint: boolean;
}

export function anchorKeyOf(path: string, anchor: { line: number; col: number }): string {
	return `${path}:${anchor.line}:${anchor.col}`;
}

/**
 * Lay out every drawable arrow: tails out of their elements, heads spread at
 * the target edge. Pure world-space geometry — the seam the tests hold.
 */
export function routeArrows(
	edges: FlowEdge[],
	frames: ProjectedFrame[],
	siteBoxes: SiteBoxesByFrame,
	k: number,
): RoutedArrow[] {
	const byName = new Map(frames.map((frame) => [frame.name, frame]));
	const specs: Spec[] = [];

	for (const edge of edges) {
		// a self-walk and a link to a frame not on the field draw nothing
		if (edge.from === edge.to) continue;
		const from = byName.get(edge.from);
		const to = byName.get(edge.to);
		if (from === undefined || to === undefined) continue;
		const target = center(to);
		const site = edge.sites[0];
		const box =
			site?.anchor === undefined ? null : (siteBoxes[edge.from]?.[anchorKeyOf(site.path, site.anchor)] ?? null);
		// the element's center in world space, clamped into the frame — a
		// scrolled-away element still claims its edge honestly
		const anchored = box !== null;
		const anchor: Point =
			box === null
				? center(from)
				: {
						x: clamp(from.x + box.x + box.w / 2, from.x, from.x + from.w),
						y: clamp(from.y + box.y + box.h / 2, from.y, from.y + from.h),
					};
		const exit = sideToward(anchor, target);
		const tail: TouchPoint = {
			at: clampToEdge(cross(exit, anchor), from, exit),
			toward: cross(exit, target),
			anchored,
		};
		const tailPoint = onEdge(from, exit, tail.at);
		// the head lands on the face the approach sees: opposite the travel side
		const entry = OPPOSITE[sideToward(tailPoint, target)];
		specs.push({
			key: `${edge.from}\0${edge.to}`,
			from,
			to,
			exit,
			entry,
			tail,
			tip: { at: clampToEdge(cross(entry, target), to, entry), toward: cross(entry, tailPoint), anchored: false },
			faint: edge.certainty === "might",
		});
	}

	spreadTouchPoints(specs);

	return specs.map((spec) => {
		const tail = onEdge(spec.from, spec.exit, spec.tail.at);
		const tip = onEdge(spec.to, spec.entry, spec.tip.at);
		return { key: spec.key, tail, tip, faint: spec.faint, ...draw(tail, tip, spec.exit, spec.entry, k) };
	});
}

/**
 * One frame edge, one lane set: every unanchored touch point on it — tips
 * always, tails when no element was located — distributes around the edge
 * midline, ordered by where its far end lies so neighbouring arrows never
 * cross at the edge. This is what makes a shared point impossible (#34).
 */
function spreadTouchPoints(specs: Spec[]): void {
	const lanes = new Map<string, { point: TouchPoint; frame: ProjectedFrame; side: Side }[]>();
	for (const spec of specs) {
		if (!spec.tail.anchored) {
			push(lanes, `${spec.from.name}\0${spec.exit}`, { point: spec.tail, frame: spec.from, side: spec.exit });
		}
		push(lanes, `${spec.to.name}\0${spec.entry}`, { point: spec.tip, frame: spec.to, side: spec.entry });
	}
	for (const members of lanes.values()) {
		if (members.length < 2) continue;
		const sample = members[0];
		if (sample === undefined) continue;
		const [lo, hi] = edgeSpan(sample.frame, sample.side);
		const mid = (lo + hi) / 2;
		const spacing = Math.min(SPREAD, (hi - lo) / (members.length - 1));
		members.sort((a, b) => a.point.toward - b.point.toward);
		members.forEach((member, i) => {
			member.point.at = clamp(mid + (i - (members.length - 1) / 2) * spacing, lo, hi);
		});
	}
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key);
	if (list === undefined) map.set(key, [value]);
	else list.push(value);
}

/** The cubic and its head: tangents leave and arrive perpendicular to their
 * edges, bowing with distance — the system page's gentle curve at any angle. */
function draw(tail: Point, tip: Point, exit: Side, entry: Side, k: number): { path: string; head: string } {
	const headLength = HEAD_LENGTH / k;
	const halfWidth = HEAD_HALF_WIDTH / k;
	const away = OUTWARD[entry];
	// the stroke stops where the head begins; the head's tip touches the frame
	const end: Point = { x: tip.x + away.x * headLength, y: tip.y + away.y * headLength };
	const bow = Math.max(MIN_BOW / k, Math.hypot(end.x - tail.x, end.y - tail.y) * 0.4);
	const out = OUTWARD[exit];
	const c1: Point = { x: tail.x + out.x * bow, y: tail.y + out.y * bow };
	const c2: Point = { x: end.x + away.x * bow, y: end.y + away.y * bow };
	const path = `M ${round(tail.x)} ${round(tail.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(end.x)} ${round(end.y)}`;
	const flank: Point = { x: -away.y, y: away.x };
	const head = `M ${round(tip.x)} ${round(tip.y)} L ${round(end.x + flank.x * halfWidth)} ${round(end.y + flank.y * halfWidth)} L ${round(end.x - flank.x * halfWidth)} ${round(end.y - flank.y * halfWidth)} Z`;
	return { path, head };
}

function center(frame: ProjectedFrame): Point {
	return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}

/** The side of the box a ray from `from` toward `to` leaves through. */
function sideToward(from: Point, to: Point): Side {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "e" : "w";
	return dy >= 0 ? "s" : "n";
}

/** The coordinate that runs along a side: y on the verticals, x on the horizontals. */
function cross(side: Side, point: Point): number {
	return side === "e" || side === "w" ? point.y : point.x;
}

function edgeSpan(frame: ProjectedFrame, side: Side): [number, number] {
	return side === "e" || side === "w"
		? [frame.y + EDGE_MARGIN, frame.y + frame.h - EDGE_MARGIN]
		: [frame.x + EDGE_MARGIN, frame.x + frame.w - EDGE_MARGIN];
}

function clampToEdge(at: number, frame: ProjectedFrame, side: Side): number {
	const [lo, hi] = edgeSpan(frame, side);
	return clamp(at, lo, hi);
}

function onEdge(frame: ProjectedFrame, side: Side, at: number): Point {
	switch (side) {
		case "e":
			return { x: frame.x + frame.w, y: at };
		case "w":
			return { x: frame.x, y: at };
		case "n":
			return { x: at, y: frame.y };
		case "s":
			return { x: at, y: frame.y + frame.h };
	}
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

export function FlowArrows({
	frames,
	edges,
	siteBoxes,
	k,
}: {
	frames: ProjectedFrame[];
	edges: FlowEdge[];
	siteBoxes: SiteBoxesByFrame;
	k: number;
}) {
	const arrows = useMemo(() => routeArrows(edges, frames, siteBoxes, k), [edges, frames, siteBoxes, k]);

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
				<g
					key={arrow.key}
					fill="none"
					stroke="var(--color-thread)"
					strokeWidth={1.5 / k}
					opacity={arrow.faint ? FAINT_OPACITY : undefined}
				>
					<path d={arrow.path} />
					<path d={arrow.head} fill="var(--color-thread)" stroke="none" />
				</g>
			))}
		</svg>
	);
}
