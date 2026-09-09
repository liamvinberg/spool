import { screenConflict } from "../../daemon/class-write";
import { gapOf, stepLength, writtenLength } from "../../properties/families";
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
 * like it moves. Everywhere else, whether a wrapped line, distributed space, a
 * margin, a transform or a gap too thin to hit, the rail keeps the property and
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
	/** `direction: rtl`, which turns a row's flow around without renaming the axis */
	rtl: boolean;
	/**
	 * The element's own `style` attribute holds a gap.
	 *
	 * An inline declaration beats every class this cell could write, so a band
	 * over it would offer a drag the page would ignore. Only the document can
	 * see it, and only #304's inline members can edit it, so until then the
	 * rail keeps that gap and the canvas draws nothing.
	 */
	inline: boolean;
	/** the resolved `column-gap`, as the document computes it: `16px`, `normal` */
	columnGap: string;
	rowGap: string;
	/**
	 * A text node, generated content or a transformed ancestor.
	 *
	 * Any of them means the boxes are not the whole story: an anonymous flex
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

/**
 * Every gap the held container offers a pointer, as one answer.
 *
 * The axis a drag writes, the way its flow runs, the value the class cell owns
 * and the bands themselves travel together because none of them means anything
 * without the rest: an axis with no owned value has no drag, and a band with no
 * axis has nothing to write.
 */
export interface GapTargets {
	axis: GapAxis | null;
	sign: 1 | -1;
	/** what the class cell authors on that axis, where it is the declaration in use */
	authored: string | null;
	bands: readonly GapBand[];
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
 * end each starts from. Anything but flex has no single answer, since a grid's
 * tracks are two gaps at once, and a container written down the page reads
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
 * the gap and nothing else. One thing that is not true of the pair, whether a
 * margin, a transform, a child skipped over, a distributed layout or a wrapped
 * line, takes the whole container's handles away rather than leaving one band
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
 * Which way the pointer has to move to make this gap bigger.
 *
 * A gap grows along the flow, and the flow runs backwards in a reversed row
 * and in a right-to-left one, and forwards again when it is both. Following
 * the flow rather than the screen is what makes the drag do what it looks
 * like it does wherever the layout reads from.
 */
export function gapDragSign(reading: GapReading): 1 | -1 {
	const reverse = reading.direction.endsWith("-reverse");
	if (gapAxisOf(reading) === "row-gap") return reverse ? -1 : 1;
	return reverse !== reading.rtl ? -1 : 1;
}

/**
 * What this element's own class cell authors on that axis, base scope only.
 *
 * The rail's own reading, where `gap-4` is both axes and `gap-x-6` is one of
 * them, so the field and the band always say the same thing. A screen variant is
 * another scope's value and is not what an unqualified drag would write.
 */
export function authoredGap(className: string, axis: GapAxis): string | null {
	const gap = gapOf(scopedClass(className, BASE));
	return axis === "column-gap" ? gap.x : gap.y;
}

/**
 * The value this element's class cell authors on that axis, when that is the
 * declaration the layout is actually using.
 *
 * The band is drawn over a measured gap, and a measured gap is not proof of
 * who wrote it: a stylesheet rule, a parent's declaration or an inline style
 * all show the same space. Dragging one of those would author a pixel count
 * beside a declaration that still wins, which is a handle that does nothing
 * and a value nobody wrote. So the class cell has to say a value, that value
 * has to be what the document measures, and nothing inline may be holding the
 * property. Anything else is the rail's, where the value is read for what it
 * is rather than offered as a drag.
 */
export function ownedGap(reading: GapReading, axis: GapAxis, className: string, step: number): string | null {
	if (reading.inline) return null;
	const authored = authoredGap(className, axis);
	if (authored === null || !gapSteppable(authored)) return null;
	const wrote = gapValuePixels(authored, step);
	const measured = gapPixels(reading, axis);
	if (wrote === null || measured === null || Math.abs(wrote - measured) > GAP_TOLERANCE_PX) return null;
	return authored;
}

/**
 * What the ring draws over a container's gaps, as one thing.
 *
 * The bands, the axis they write and the one the pointer is holding are never
 * separately true: an axis with no bands draws nothing, and a held band with
 * no reading has nothing to say. They ride together so a caller cannot pass
 * three of the four.
 */
export interface GapHandles {
	bands: readonly GapBand[];
	/** which gap one drag would write: nothing where the layout names none */
	axis: GapAxis | null;
	/** the band the pointer is holding, which stays drawn while the layout moves */
	held: number | null;
	/** what the held band reads, which is the value the drag is making */
	says: string | null;
}

/** Where the value a click opens instead of a drag stands, in screen pixels. */
export interface GapAnchor {
	left: number;
	top: number;
}

/**
 * One gap drag, as the numbers it decides from.
 *
 * The canvas holds the pick and the session; everything a sample, a readout
 * and a completion actually read is here, so all three are decisions over data
 * rather than handlers reaching into a component.
 */
export interface GapDrag {
	axis: GapAxis;
	/** which adjacent pair the pointer grabbed, for the whole of one drag */
	index: number;
	/** the band as it stood when it was grabbed */
	band: GapBand;
	/** which way along the axis the flow makes the gap bigger */
	sign: 1 | -1;
	from: { x: number; y: number };
	/** what the class cell owned on this axis when the read opened */
	authored: string;
	/** what the gap measured then */
	measured: number;
	/** how many of the value's own units the pointer has moved it */
	units: number;
	/** the value the last sample made, or nothing where none has moved it */
	live: string | null;
}

/**
 * What one sample of a live drag comes to, or nothing where it moves it nowhere.
 *
 * The pointer's travel is measured along the axis and against the flow, taken
 * back into the document's own pixels, and read as units of whatever the value
 * is already written in. A press that has not yet passed the threshold is
 * still a click, and a sample that lands on the value already showing is not a
 * sample at all.
 */
export function gapSample(
	drag: GapDrag,
	at: { x: number; y: number },
	coarse: boolean,
	zoom: number,
	step: number,
	/** how far a press must travel before it counts as a drag, which the canvas owns */
	threshold: number,
): { units: number; live: string } | null {
	const travelled = drag.axis === "column-gap" ? at.x - drag.from.x : at.y - drag.from.y;
	const moved = (drag.sign * travelled) / (zoom === 0 ? 1 : zoom);
	if (drag.live === null && Math.abs(moved) < threshold) return null;
	const units = gapDragUnits(drag.authored, moved, step, coarse);
	const live = steppedGap(drag.authored, drag.measured, units);
	if (live === undefined || (live === drag.live && units === drag.units)) return null;
	return { units, live };
}

/**
 * The band a live drag draws, and what it reads.
 *
 * The band is the space itself, so it has to be the size the value makes; a
 * value only the document could resolve leaves it the size it was grabbed at
 * rather than guessing one.
 */
export function gapPaint(drag: GapDrag, step: number): { band: GapBand; says: string } {
	const px = drag.live === null ? null : gapValuePixels(drag.live, step);
	const grown = px === null ? 0 : px - drag.measured;
	return {
		band:
			drag.axis === "column-gap"
				? { ...drag.band, w: Math.max(drag.band.w + grown, 0) }
				: { ...drag.band, h: Math.max(drag.band.h + grown, 0) },
		says: px === null ? (drag.live ?? "") : `${Number(px.toFixed(2))}px`,
	};
}

/**
 * Whether this drag has anything to save.
 *
 * A drag that never moved a step writes nothing: the source already says this,
 * and a save nobody asked for is still a save.
 */
export function gapMoved(drag: GapDrag): boolean {
	return drag.units !== 0 && drag.live !== null && drag.live !== drag.authored;
}

/** Whether this value is a bare reference to the project's spacing scale. */
export function gapOnScale(value: string): boolean {
	return writtenLength(value)?.scale === true;
}

/**
 * Whether a drag can move this value without renaming what it is.
 *
 * A scale reference steps along the scale and a custom length steps in its own
 * unit. A variable or any other expression has no step at all: moving it would
 * mean replacing the reference with a pixel count, which says the author wrote
 * something they did not. Those stay the rail's, where the value is read for
 * what it is.
 *
 * A gap the cell authors nothing for is not asked about here at all. `ownedGap`
 * has already refused it, because a value nobody wrote is a value no drag may
 * invent.
 */
export function gapSteppable(authored: string): boolean {
	const written = writtenLength(authored);
	if (written === null) return false;
	return written.scale || written.value === "px" || written.custom !== null;
}

/**
 * How many of the value's own units a drag of `delta` document pixels is.
 *
 * A gap written on the scale moves in whole steps of that scale, because that
 * is the number the author wrote; one written in pixels moves in pixels. The
 * coarse modifier quantises to tens without going faster, so a held ⇧ lands on
 * round numbers rather than racing past them.
 */
export function gapDragUnits(authored: string, delta: number, step: number, coarse: boolean): number {
	const unit = gapOnScale(authored) ? Math.max(step, 1) : 1;
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
export function steppedGap(authored: string, measured: number, units: number): string | undefined {
	const written = gapSteppable(authored) ? writtenLength(authored) : null;
	if (written === null) return undefined;
	const next = stepLength(
		"spacing",
		{ family: "gap", kind: "spacing", value: written.value, negative: written.negative, important: false, token: "" },
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
 * The band drawn mid-drag needs it: the space under the pointer has to be the
 * space the value makes. A percentage or an expression has no answer here, and
 * the band keeps the width it was grabbed at rather than inventing one.
 */
export function gapValuePixels(value: string, step: number): number | null {
	const written = writtenLength(value);
	if (written === null) return null;
	if (written.scale) return Number(written.value) * step;
	if (written.value === "px") return 1;
	if (written.custom?.unit === "px") return Number(written.custom.number);
	return null;
}
