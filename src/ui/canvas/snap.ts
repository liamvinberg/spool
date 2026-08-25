import type { Box } from "./camera";

/**
 * Snap math for the hands (#23, #241), pure: drag-move pulls the dragged
 * selection's bounding box onto other frames' edges and centers and its gaps
 * onto the spacing its run already keeps, resize pulls the dragged edge alone
 * onto the same edge and center stops. Edges snap to edges, centers to
 * centers — never across kinds. Per axis every candidate competes in one pool
 * and the smallest correction wins, an exact tie going to alignment, so no
 * kind silently outranks another.
 *
 * The marks are read off the corrected geometry rather than off the winning
 * candidate, which is why a correction that satisfies both an alignment and a
 * spacing draws both and every mark is a true statement about where the frame
 * now is. An alignment draws a guide line, an equal-size match showing its two
 * edge lines with the redundant center dropped — the Figma pattern, so equal
 * heights never flicker. A matched spacing draws a span in every gap of the
 * run carrying that value, the new one included, which is what makes it read
 * as "these are the same".
 */

/** A matched gap: a segment, so it needs both ends and a perpendicular place. */
export interface Span {
	/** The axis the gap is measured along — an x gap draws as a horizontal bar. */
	axis: "x" | "y";
	/** The gap's near end along the axis. */
	from: number;
	/** The gap's far end along the axis. */
	to: number;
	/** The middle of the two frames' shared perpendicular overlap. */
	at: number;
}

/** What a corrected drag has to say about where it landed. */
export interface SnapMarks {
	/** World x coordinates of vertical guide lines. */
	v: number[];
	/** World y coordinates of horizontal guide lines. */
	h: number[];
	/** Every gap carrying a spacing the corrected geometry matched. */
	spans: Span[];
}

export interface SnapResult extends SnapMarks {
	dx: number;
	dy: number;
}

/** Alignment looser than float noise is no alignment — guides never lie. */
const EPS = 1e-6;

/** A box seen from one axis: where it starts, centers and ends along it. */
interface Extent {
	min: number;
	mid: number;
	max: number;
}

type Stop = keyof Extent;

const STOPS: readonly Stop[] = ["min", "mid", "max"];

/** own stop × target stop — the legal pairs, never an edge against a center. */
const PAIRS: ReadonlyArray<readonly [Stop, Stop]> = [
	["min", "min"],
	["min", "max"],
	["max", "min"],
	["max", "max"],
	["mid", "mid"],
];

const extentOf = (box: Box, axis: "x" | "y"): Extent =>
	axis === "x"
		? { min: box.x, mid: box.x + box.w / 2, max: box.x + box.w }
		: { min: box.y, mid: box.y + box.h / 2, max: box.y + box.h };

const overlapOf = (a: Extent, b: Extent): number => Math.min(a.max, b.max) - Math.max(a.min, b.min);

const perpOf = (axis: "x" | "y"): "x" | "y" => (axis === "x" ? "y" : "x");

/** A box seen from one axis: how far it reaches along it, and across it. */
interface Member {
	along: Extent;
	across: Extent;
}

const memberOf = (box: Box, axis: "x" | "y"): Member => ({
	along: extentOf(box, axis),
	across: extentOf(box, perpOf(axis)),
});

function* consecutive<T>(items: readonly T[]): Generator<[T, T]> {
	let previous: T | undefined;
	for (const item of items) {
		if (previous !== undefined) yield [previous, item];
		previous = item;
	}
}

/**
 * The run a spacing is measured within: everything whose perpendicular extent
 * overlaps the moved box's, by any amount, ordered along the axis. Derived per
 * drag and per axis and never declared, so a tall frame joins every horizontal
 * run it spans and the rule carries no threshold to argue about.
 */
export function runOf(moving: Box, statics: Box[], axis: "x" | "y"): Box[] {
	const own = extentOf(moving, perpOf(axis));
	return statics.filter((s) => overlapOf(own, extentOf(s, perpOf(axis))) > EPS).sort((a, b) => a[axis] - b[axis]);
}

export function snapMovedBox(
	moving: Box,
	statics: Box[],
	threshold: number,
	options: { suppressed?: boolean } = {},
): SnapResult {
	// the modifier drops the whole pool: on a dense page the candidates are
	// close enough together that there has to be a way to put a frame anywhere
	if (options.suppressed === true) return { dx: 0, dy: 0, v: [], h: [], spans: [] };
	const dx = axisDelta(moving, statics, "x", threshold);
	const dy = axisDelta(moving, statics, "y", threshold);
	const moved: Box = { ...moving, x: moving.x + dx, y: moving.y + dy };
	return {
		dx,
		dy,
		v: alignGuides(extentOf(moving, "x"), statics, "x", dx),
		h: alignGuides(extentOf(moving, "y"), statics, "y", dy),
		spans: [...spansOf(moved, statics, "x"), ...spansOf(moved, statics, "y")],
	};
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
		const stops = extentOf(target, axis);
		for (const stop of STOPS) {
			if (
				Math.abs(stops[stop] - value) <= threshold &&
				(best === undefined || Math.abs(stops[stop] - value) < Math.abs(best - value))
			) {
				best = stops[stop];
			}
		}
	}
	if (best === undefined) return { value, guides: [] };
	const snapped = best;
	const guides: number[] = [];
	for (const target of statics) {
		const stops = extentOf(target, axis);
		for (const stop of STOPS) {
			if (Math.abs(stops[stop] - snapped) <= EPS && !guides.includes(stops[stop])) guides.push(stops[stop]);
		}
	}
	return { value: snapped, guides: guides.sort((a, b) => a - b) };
}

/** One pool per axis: proximity decides, and an exact tie goes to alignment. */
function axisDelta(moving: Box, statics: Box[], axis: "x" | "y", threshold: number): number {
	const align = alignDelta(extentOf(moving, axis), statics, axis, threshold);
	const gap = gapDelta(moving, runOf(moving, statics, axis), axis, threshold);
	if (align === undefined) return gap ?? 0;
	if (gap === undefined) return align;
	return Math.abs(gap) + EPS < Math.abs(align) ? gap : align;
}

function alignDelta(own: Extent, statics: Box[], axis: "x" | "y", threshold: number): number | undefined {
	let best: number | undefined;
	for (const target of statics) {
		const stops = extentOf(target, axis);
		for (const [o, t] of PAIRS) {
			const delta = stops[t] - own[o];
			if (Math.abs(delta) <= threshold && (best === undefined || Math.abs(delta) < Math.abs(best))) best = delta;
		}
	}
	return best;
}

function alignGuides(own: Extent, statics: Box[], axis: "x" | "y", delta: number): number[] {
	const guides: number[] = [];
	for (const target of statics) {
		const stops = extentOf(target, axis);
		const landed = PAIRS.filter(([o, t]) => Math.abs(stops[t] - (own[o] + delta)) <= EPS);
		const hasEdge = landed.some(([o]) => o !== "mid");
		for (const [o, t] of landed) {
			// an equal-size match: its edge lines carry it, the center would repeat it
			if (o === "mid" && hasEdge) continue;
			if (!guides.includes(stops[t])) guides.push(stops[t]);
		}
	}
	return guides.sort((a, b) => a - b);
}

/**
 * The gap two members keep along the axis, and the bar that would mark it. A
 * pair that misses the other across the axis still keeps a real gap, so the
 * spacing still counts; what it cannot have is a bar, because there is no
 * shared band to lay one across.
 */
function gapOf(before: Member, after: Member, axis: "x" | "y"): { value: number; span?: Span } | undefined {
	const value = after.along.min - before.along.max;
	if (value <= EPS) return undefined;
	if (overlapOf(before.across, after.across) <= EPS) return { value };
	const at = (Math.max(before.across.min, after.across.min) + Math.min(before.across.max, after.across.max)) / 2;
	return { value, span: { axis, from: before.along.max, to: after.along.min, at } };
}

/**
 * The spacing candidates, both kinds: the gap the moved box would keep to a
 * run neighbour matching a gutter the run's statics already keep, and the
 * position between two of them that makes its own two gaps equal. Candidates
 * come only from this run — a gutter in an unrelated cluster is a number that
 * isn't on screen, and reaching for it would make the frame twitch.
 */
function gapDelta(moving: Box, run: Box[], axis: "x" | "y", threshold: number): number | undefined {
	if (run.length < 2) return undefined;
	const own = extentOf(moving, axis);
	const size = own.max - own.min;
	const members = run.map((box) => memberOf(box, axis));
	const gutters: number[] = [];
	for (const [before, after] of consecutive(members)) {
		const gutter = gapOf(before, after, axis)?.value;
		if (gutter === undefined) continue;
		if (!gutters.some((seen) => Math.abs(seen - gutter) <= EPS)) gutters.push(gutter);
	}

	let best: number | undefined;
	const offer = (delta: number) => {
		if (Math.abs(delta) <= threshold && (best === undefined || Math.abs(delta) < Math.abs(best))) best = delta;
	};
	/** A gutter only carries where the anchor really is the moved box's neighbour. */
	const neighbouring = (delta: number, anchor: Extent) => {
		const mid = own.mid + delta;
		const lo = Math.min(mid, anchor.mid);
		const hi = Math.max(mid, anchor.mid);
		return !members.some((m) => m.along.mid > lo + EPS && m.along.mid < hi - EPS);
	};

	for (const { along: anchor } of members) {
		for (const gutter of gutters) {
			const delta = own.mid > anchor.mid ? anchor.max + gutter - own.min : anchor.min - gutter - own.max;
			if (neighbouring(delta, anchor)) offer(delta);
		}
	}
	for (const [before, after] of consecutive(members)) {
		if (own.mid <= before.along.mid || own.mid >= after.along.mid) continue;
		const free = after.along.min - before.along.max - size;
		if (free <= EPS) continue;
		offer(before.along.max + free / 2 - own.min);
	}
	return best;
}

/**
 * The spans the corrected geometry earns: every gap in the run carrying a
 * value one of the moved box's own gaps carries. Read off the geometry, so an
 * insertion draws both of its gaps and an append draws the whole gutter it
 * joined, and a gap that matches nothing draws nothing.
 */
function spansOf(moved: Box, statics: Box[], axis: "x" | "y"): Span[] {
	const run = runOf(moved, statics, axis);
	if (run.length === 0) return [];
	const members = [...run, moved]
		.sort((a, b) => a[axis] - b[axis])
		.map((box) => ({ ...memberOf(box, axis), moved: box === moved }));
	const gaps: Array<{ value: number; own: boolean; span?: Span }> = [];
	for (const [before, after] of consecutive(members)) {
		const gap = gapOf(before, after, axis);
		if (gap !== undefined) gaps.push({ ...gap, own: before.moved || after.moved });
	}
	const matched = gaps.filter(
		(gap) => gap.own && gaps.some((other) => other !== gap && Math.abs(other.value - gap.value) <= EPS),
	);
	if (matched.length === 0) return [];
	return gaps
		.filter((gap) => matched.some((match) => Math.abs(match.value - gap.value) <= EPS))
		.flatMap((gap) => (gap.span === undefined ? [] : [gap.span]));
}
