import { screenConflict } from "../../daemon/class-write";
import { gapOf, stepLength } from "../../properties/families";
import { type At, editsFor, rowFor } from "../../properties/rows";
import type { SourcePropertyValue } from "../../source-property";
import type { RungRead } from "../api";
import { ringBlocks } from "./hand-resize";
import { BASE, scopedClass } from "./properties-scope";

/**
 * Gap by handle (#306), as decisions over data.
 *
 * The space between a flex container's children is the one piece of spacing
 * you can point at, so it is the one worth a handle. The rules here are about
 * honesty rather than convenience: a band is drawn only where the distance it
 * covers is that gap and nothing else, so grabbing it moves what it looks
 * like it moves. Everywhere else — a wrapped line, distributed space, a
 * margin, a transform, a gap too thin to hit — the rail keeps the property and
 * the canvas offers nothing.
 *
 * The frame answers with the boxes and the container's own words; every
 * decision below is pure over that answer and the numbers the pointer made.
 */

/** The two gaps a single-line flex container can have, one per direction. */
export type GapAxis = "column-gap" | "row-gap";

/** What the document says about one flex container's gaps. */
export interface GapReading {
	display: string;
	/** `flex-direction`, reverse included */
	direction: string;
	wrap: string;
	justify: string;
	writing: string;
	/** the resolved `column-gap`, as the document computes it: `16px`, `normal` */
	columnGap: string;
	rowGap: string;
	/**
	 * A text node, generated content or a transformed ancestor.
	 *
	 * Any of them means the boxes are not the whole story — an anonymous flex
	 * item sits between two children with no element to measure, and a scaled
	 * ancestor makes every distance a picture of one. The container answers
	 * with the fact rather than the canvas guessing at it.
	 */
	ambiguous: boolean;
	/** every element child, in DOM order, in the frame's own pixels */
	children: GapChild[];
}

export interface GapChild {
	box: { x: number; y: number; w: number; h: number };
	/** out of flow or not displayed: it stands between no pair */
	out: boolean;
	/** a margin, a transform or `display: contents`: no distance here is the gap alone */
	displaced: boolean;
}

/** A band drawn over one gap, in the frame's own pixels. */
export interface GapBand {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The thickness a gap needs on screen before a pointer can hit it. */
export const GAP_TARGET_PX = 6;

/** How much of the crossing edge a band needs on screen to be worth drawing. */
export const GAP_CROSS_PX = 12;

/** How near the measured distance must be to the gap for the band to be that gap. */
const GAP_TOLERANCE_PX = 0.5;

/**
 * Which gap a drag on this container would write.
 *
 * A row is separated by its column gap and a column by its row gap, whichever
 * end each starts from. Anything but flex has no single answer — a grid's
 * tracks are two gaps at once — and a container written down the page reads
 * its own axes the other way round, which this geometry does not yet prove.
 */
export function gapAxisOf(reading: GapReading): GapAxis | null {
	if (!["flex", "inline-flex"].includes(reading.display)) return null;
	if (reading.writing !== "horizontal-tb") return null;
	return reading.direction.startsWith("row")
		? "column-gap"
		: reading.direction.startsWith("column")
			? "row-gap"
			: null;
}

/** The px a gap resolves to, or nothing where it is a keyword or a relative length. */
function gapPixels(reading: GapReading, axis: GapAxis): number | null {
	const value = axis === "column-gap" ? reading.columnGap : reading.rowGap;
	if (!value.endsWith("px")) return null;
	const px = Number.parseFloat(value);
	return Number.isFinite(px) ? px : null;
}

/**
 * Where this container's gaps are, as bands a pointer can grab.
 *
 * A band stands between two children only where the distance between them is
 * the gap and nothing else. One thing that is not true of the pair — a margin,
 * a transform, a child skipped over, a distributed layout, a wrapped line —
 * takes the whole container's handles away rather than leaving one band
 * standing for a space it does not name.
 *
 * Zoom is here because a target is hit on screen: a 4px gap is real, and under
 * a camera showing it as two pixels it is the rail's to edit.
 */
export function gapBands(reading: GapReading, zoom: number): GapBand[] {
	const axis = gapAxisOf(reading);
	if (axis === null) return [];
	if (reading.wrap !== "nowrap" || reading.justify.startsWith("space-") || reading.ambiguous) return [];
	const value = gapPixels(reading, axis);
	if (value === null || value * zoom < GAP_TARGET_PX) return [];
	const flow = reading.children.filter((child) => !child.out);
	if (flow.some((child) => child.displaced)) return [];
	const across = axis === "column-gap";
	const near = (child: GapChild) => (across ? child.box.x : child.box.y);
	const far = (child: GapChild) => (across ? child.box.x + child.box.w : child.box.y + child.box.h);
	const sorted = [...flow].sort((a, b) => near(a) - near(b));
	const bands: GapBand[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const before = sorted[i - 1];
		const after = sorted[i];
		if (before === undefined || after === undefined) continue;
		const start = far(before);
		const end = near(after);
		if (Math.abs(end - start - value) > GAP_TOLERANCE_PX) return [];
		const crossStart = Math.max(across ? before.box.y : before.box.x, across ? after.box.y : after.box.x);
		const crossEnd = Math.min(
			across ? before.box.y + before.box.h : before.box.x + before.box.w,
			across ? after.box.y + after.box.h : after.box.x + after.box.w,
		);
		if ((crossEnd - crossStart) * zoom < GAP_CROSS_PX) continue;
		bands.push(
			across
				? { x: start, y: crossStart, w: end - start, h: crossEnd - crossStart }
				: { x: crossStart, y: start, w: crossEnd - crossStart, h: end - start },
		);
	}
	return bands;
}

/**
 * What this element's own class cell authors on that axis, base scope only.
 *
 * The rail's own reading — `gap-4` is both axes and `gap-x-6` is one of them —
 * so the field and the band always say the same thing. A screen variant is
 * another scope's value and is not what an unqualified drag would write.
 */
export function authoredGap(className: string, axis: GapAxis): string | null {
	const gap = gapOf(scopedClass(className, BASE));
	return axis === "column-gap" ? gap.x : gap.y;
}

/** A signed length string taken back apart, the way the rail's own rows read one. */
function takeApart(value: string): { value: string; negative: boolean } | null {
	if (value === "") return null;
	const negative = value.startsWith("-");
	return { value: (negative ? value.slice(1) : value).replace(/!$/, ""), negative };
}

/** The custom-value spelling a step can move without changing what the value is. */
const CUSTOM = /^\[([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)\]$/i;

/**
 * Whether a drag can move this value without renaming what it is.
 *
 * A scale reference steps along the scale, a custom length steps in its own
 * unit, and a gap nothing sets is authored fresh from what it measures. A
 * variable or any other expression has no step at all: moving it would mean
 * replacing the reference with a pixel count, which says the author wrote
 * something they did not. Those stay the rail's, where the value is read for
 * what it is.
 */
export function gapSteppable(authored: string | null): boolean {
	if (authored === null) return true;
	const parsed = takeApart(authored);
	if (parsed === null) return false;
	return /^\d+(?:\.\d+)?$/.test(parsed.value) || parsed.value === "px" || CUSTOM.test(parsed.value);
}

/**
 * How many of the value's own units a drag of `delta` document pixels is.
 *
 * A gap written on the scale moves in whole steps of that scale, because that
 * is the number the author wrote; one written in pixels moves in pixels. The
 * coarse modifier quantises to tens without going faster, so a held ⇧ lands on
 * round numbers rather than racing past them.
 */
export function gapDragUnits(authored: string | null, delta: number, step: number, coarse: boolean): number {
	const parsed = authored === null ? null : takeApart(authored);
	const scale = parsed !== null && /^\d+(?:\.\d+)?$/.test(parsed.value);
	const unit = scale ? Math.max(step, 1) : 1;
	const grain = coarse ? 10 : 1;
	return Math.round(delta / unit / grain) * grain;
}

/**
 * The value a drag has stepped to, in the spelling the author already used.
 *
 * The rail's own arithmetic, so a scrubbed field and a dragged band land on
 * the same string. A gap has no negative spelling, so a drag past zero stops
 * at zero rather than writing a class the compiler would refuse.
 */
export function steppedGap(authored: string | null, measured: number, units: number): string | undefined {
	if (!gapSteppable(authored)) return undefined;
	const parsed = authored === null ? null : takeApart(authored);
	const next = stepLength(
		"spacing",
		parsed === null
			? null
			: {
					family: "gap",
					kind: "spacing",
					value: parsed.value,
					negative: parsed.negative,
					important: false,
					token: "",
				},
		measured,
		units,
	);
	if (next === null) return undefined;
	return next.negative ? "0" : next.value;
}

/**
 * Whether this rung's class cell leaves a gap a drag could write.
 *
 * The ring's own law, asked about the gap family: the lane's refusal is the
 * whole answer, and a screen variant pinning the gap means a base class cannot
 * honestly beat it. A band no write would take is not drawn, so there is no
 * dead drag over a gap either.
 */
export function gapWritable(read: RungRead | undefined): boolean {
	if (read === undefined || read.name === undefined || ringBlocks(read.refusal)) return false;
	const literal = read.className === "" ? null : read.className;
	return screenConflict(literal, { token: "gap-1", scope: "" }) === undefined;
}

/**
 * What one gap gesture writes, as the source property path's own field.
 *
 * The rail's own compilation of the same request, so a dragged band and a
 * scrubbed field land on the same token: `gap-4` folds into `gap-x-8` and the
 * other axis keeps the value the shorthand lent it.
 */
export function gapField(axis: GapAxis, value: string, at: At): SourcePropertyValue {
	const row = rowFor(axis);
	if (row === undefined) return { kind: "remove" };
	const tokens = editsFor(row, { kind: "value", value }, at)
		.filter((edit) => !edit.remove)
		.map((edit) => edit.token);
	return tokens.length === 0 ? { kind: "remove" } : { kind: "binding", tokens };
}

/**
 * What a written gap value is worth in pixels, or nothing where only the
 * document could say.
 *
 * The band drawn mid-drag needs it — the space under the pointer has to be the
 * space the value makes. A percentage or an expression has no answer here, and
 * the band keeps the width it was grabbed at rather than inventing one.
 */
export function gapValuePixels(value: string, step: number): number | null {
	if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * step;
	if (value === "px") return 1;
	const custom = CUSTOM.exec(value);
	if (custom?.[2] === "px" && custom[1] !== undefined) return Number(custom[1]);
	return null;
}
