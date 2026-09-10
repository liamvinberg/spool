import { useEffect, useState } from "react";
import { screenConflict } from "../../daemon/class-write";
import { lengthOf, lengthPx, scaleValue } from "../../properties/families";
import { stepOf } from "../../properties/theme";
import type { CompiledTheme, RungRead } from "../api";
import { fetchTheme, readRungs } from "../api";
import { BASE, scopedClass } from "./properties-scope";
import type { PropertyValue } from "./property-controls";
import type { SnapTrial, SnapWear } from "./protocol";

/**
 * Resize by handle (#259), as decisions over data.
 *
 * The one canvas gesture that is genuinely better than a field: nudging a size
 * by feel is what a number box is bad at. A drag becomes a class edit when the
 * stamped host element has a literal or absent `className` and nothing else
 * pinning the dragged axis — which is checkable before the file is touched, so
 * the ring knows whether a handle is live before you grab it. There is never a
 * dead drag: a handle no write would take is simply not drawn.
 *
 * The decisions are pure over the read the lane already answers with (#256's
 * `RungRead`) and the numbers the pointer made; `useRing` is the one round
 * trip they need, which is that read and the step the theme resolves.
 */

/** -1 grabs the top or left side, 1 the bottom or right, 0 leaves the axis alone. */
export type Sign = -1 | 0 | 1;

/** Which of the ring's handles a write would take, known before the grab. */
export interface LiveHandles {
	w: boolean;
	h: boolean;
	rotate: boolean;
}

export const NO_HANDLES: LiveHandles = { w: false, h: false, rotate: false };

export interface Size {
	w: number;
	h: number;
}

/**
 * Which handles the file leaves live on this rung.
 *
 * The rung's own refusal is the whole answer for all three — a computed
 * `className`, an inline style, spread props with no literal, a definition in
 * `shared/ui/*`, a stamp that hits nothing: none of them leaves an axis a
 * write could take. Past that the question is per axis, because a screen
 * variant pins one family at a time and a base class cannot honestly beat it.
 *
 * A rotation already worn takes the size handles off. The box the canvas has
 * is the document's own `getBoundingClientRect`, which for a rotated element
 * is the box around it rather than the box it is, so a drag would write a
 * width nobody asked for. The rail's number boxes still reach both axes.
 */
export function handlesFor(read: RungRead | undefined): LiveHandles {
	if (read === undefined || read.name === undefined || ringBlocks(read.refusal)) return NO_HANDLES;
	const literal = read.className === "" ? null : read.className;
	// asked of the lane's own rule rather than re-derived here: a token of the
	// family stands in for the write, so the ring greys for exactly the reason
	// the write would have refused
	const free = (token: string): boolean => screenConflict(literal, { token, scope: "" }) === undefined;
	const turned = rotationOf(read.className) !== 0;
	return { w: !turned && free("w-1"), h: !turned && free("h-1"), rotate: free("rotate-1") };
}

/**
 * Whether this rung's refusal is one the ring must respect.
 *
 * All but one of them are: an expression, an inline style, spread props with
 * no literal, a stamp that hits nothing: none of them leaves an axis a write
 * could take. `shared-definition` is the exception, and the reason is #303's: a
 * class cell several uses share is exactly what a hand edits, so a ring that
 * greyed for it would refuse the ordinary case.
 */
export function ringBlocks(refusal: RungRead["refusal"]): boolean {
	return refusal !== undefined && refusal.code !== "shared-definition";
}

/** The degrees the base scope already carries, which a rotate drag starts from. */
export function rotationOf(className: string): number {
	const worn = lengthOf(scopedClass(className, BASE), "rotate");
	if (worn === null) return 0;
	const deg = lengthPx("deg", worn.value);
	return deg === null ? 0 : worn.negative ? -deg : deg;
}

/**
 * The box the ring draws mid-drag, in the element's own frame-local pixels.
 *
 * It keeps the corner layout gave it and changes only its size, including on a
 * north or west grab. Anchoring the far edge would read better under the
 * pointer and would be a promise the write cannot keep: an element owns no x
 * or y, so what lands is this size wherever the flow puts it. The ring shows
 * that rather than a position it would then jump out of.
 */
export function draggedRect(
	rect: { x: number; y: number; w: number; h: number },
	live: Size,
): { x: number; y: number; w: number; h: number } {
	return { x: rect.x, y: rect.y, w: live.w, h: live.h };
}

/**
 * The angle a rotate drag is at: whole degrees, wrapped to (-180, 180], and
 * snapped to 15° while shift is held.
 */
export function draggedAngle(base: number, from: number, to: number, snap: boolean): number {
	const turned = base + ((to - from) * 180) / Math.PI;
	const whole = snap ? Math.round(turned / 15) * 15 : Math.round(turned);
	return ((((whole + 180) % 360) + 360) % 360) - 180;
}

/** The token a rotate drag is showing, or nothing where it is back at rest. */
export function rotateTokens(deg: number): string[] {
	return deg === 0 ? [] : [`${deg < 0 ? "-" : ""}rotate-${Math.abs(deg)}`];
}

/**
 * What the ring needs before a grab: which handles the file leaves live, and
 * the step a whole class is measured in.
 *
 * Asked per held rung and again whenever that frame's document reloads, since
 * the literal it answers about is one of that document's own inputs. Nothing
 * until the read lands, which is a ring with no handles rather than one
 * offering a drag the file would refuse.
 */
export function useRing(
	project: string,
	held: { frame: string; source: string } | null,
	revision: number,
): {
	live: LiveHandles;
	step: number;
	rotation: number;
	className: string;
	read: RungRead | undefined;
	theme: CompiledTheme | null;
} {
	const [read, setRead] = useState<RungRead | undefined>(undefined);
	const [theme, setTheme] = useState<CompiledTheme | null>(null);
	const asked = held === null ? "" : `${revision}\n${held.frame}\n${held.source}`;
	useEffect(() => {
		const [, frame, source] = asked.split("\n");
		// the previous rung's answer is not this one's: a ring wearing it would
		// offer a handle this element may not have, which is the dead drag
		setRead(undefined);
		if (frame === undefined || source === undefined) return;
		let live = true;
		void readRungs(project, frame, [source]).then((rungs) => {
			if (live) setRead(rungs?.[0]);
		});
		return () => {
			live = false;
		};
	}, [project, asked]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is not read in here, it is the trigger — a document that reloaded may have reloaded because tokens.css changed
	useEffect(() => {
		let live = true;
		void fetchTheme(project).then((answered) => {
			if (live && answered !== undefined) setTheme(answered);
		});
		return () => {
			live = false;
		};
	}, [project, revision]);
	return {
		live: handlesFor(read),
		step: stepOf(theme),
		rotation: read === undefined ? 0 : rotationOf(read.className),
		/** the literal a drag reads its authored units out of */
		className: read?.className ?? "",
		// the read itself and the theme behind it, which a second gesture on the
		// same rung asks its own questions of (#306)
		read,
		theme,
	};
}

/* ---------- the approved handle set, and the box it drags to ---------- */

/** The eight targets the approved outline wears, clockwise from the top left. */
export type Edge = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const EDGES: readonly Edge[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The smaller dimension a box needs before it wears any handle at all. */
export const SMALL_TARGET_PX = 24;

/** The length a side needs before it wears an edge strip of its own. */
export const EDGE_TARGET_PX = 72;

/** Which axes a target moves: -1 the near side, 1 the far side, 0 not at all. */
export function edgeSigns(edge: Edge): { sx: Sign; sy: Sign } {
	return {
		sx: edge.includes("w") ? -1 : edge.includes("e") ? 1 : 0,
		sy: edge.includes("n") ? -1 : edge.includes("s") ? 1 : 0,
	};
}

/**
 * Which of the eight targets the ring draws, at this size on this file.
 *
 * The approved outline's own rule (`editing-interface` at 48a07fb): a box
 * under 24px on its smaller dimension wears nothing, because handles that
 * overlap each other are handles nobody can hit; a side under 72px wears no
 * strip, because a strip that short is a corner with worse aim. The corners
 * survive both, which is how a small box is resized at all.
 *
 * The one exception is the target already being dragged. A box shrinking under
 * the pointer must not drop the handle the pointer is holding.
 */
export function drawnHandles(ring: Size, live: LiveHandles, active: Edge | null): Edge[] {
	return EDGES.filter((edge) => {
		if (edge === active) return true;
		const { sx, sy } = edgeSigns(edge);
		if (!(sx !== 0 && live.w) && !(sy !== 0 && live.h)) return false;
		if (Math.min(ring.w, ring.h) < SMALL_TARGET_PX) return false;
		if (edge.length === 2) return true;
		return (sy === 0 ? ring.h : ring.w) >= EDGE_TARGET_PX;
	});
}

/** What the drag is measured against: the element's own limits, in its own pixels. */
export interface SizeLimits {
	minW: number;
	minH: number;
	/** no maximum is `null`: the engine set none, which is not a number */
	maxW: number | null;
	maxH: number | null;
}

/** The modifiers a resize gesture opens with, which fix what it may write. */
export interface ResizeModifiers {
	/** ⌥ on an already free-positioned element: grow from the centre. */
	center: boolean;
	/** ⇧: keep the proportions the box started at. */
	proportional: boolean;
}

const MIN_SIZE = 0.01;
const MAX_SIZE = Number.MAX_SAFE_INTEGER;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

function bounds(min: number, max: number | null): { min: number; max: number } {
	const lower = clamp(finite(min, MIN_SIZE), MIN_SIZE, MAX_SIZE);
	// CSS gives the minimum precedence when a minimum and a maximum contradict
	const upper = Math.max(lower, max === null ? MAX_SIZE : clamp(finite(max, MAX_SIZE), MIN_SIZE, MAX_SIZE));
	return { min: lower, max: upper };
}

/**
 * The box a handle has dragged to, and how far the element's near edges moved
 * with it, which is the approved playground's own geometry, unchanged.
 *
 * Everything is relative to the gesture's original border box in the
 * document's own pixels, so the canvas divides the pointer by its zoom before
 * asking. The shift is the answer to "where did the top left go", which only
 * an already free-positioned element can honestly write.
 */
export function resizedBox(
	start: Size,
	edge: Edge,
	dx: number,
	dy: number,
	modifiers: ResizeModifiers,
	limits: SizeLimits,
): { w: number; h: number; shiftX: number; shiftY: number } {
	const originalWidth = clamp(finite(start.w, 1), MIN_SIZE, MAX_SIZE);
	const originalHeight = clamp(finite(start.h, 1), MIN_SIZE, MAX_SIZE);
	const { sx, sy } = edgeSigns(edge);
	const multiplier = modifiers.center ? 2 : 1;
	const changeWidth = sx * clamp(finite(dx, 0), -MAX_SIZE, MAX_SIZE) * multiplier;
	const changeHeight = sy * clamp(finite(dy, 0), -MAX_SIZE, MAX_SIZE) * multiplier;
	const widthBounds = bounds(limits.minW, limits.maxW);
	const heightBounds = bounds(limits.minH, limits.maxH);
	let w = originalWidth + changeWidth;
	let h = originalHeight + changeHeight;
	if (modifiers.proportional) {
		const relativeWidth = changeWidth / originalWidth;
		const relativeHeight = changeHeight / originalHeight;
		const dominant = Math.abs(relativeWidth) >= Math.abs(relativeHeight) ? relativeWidth : relativeHeight;
		const minimumScale = Math.max(widthBounds.min / originalWidth, heightBounds.min / originalHeight);
		const maximumScale = Math.min(widthBounds.max / originalWidth, heightBounds.max / originalHeight);
		// where no shared scale satisfies both axes, the dimension limits win
		const scale = minimumScale <= maximumScale ? clamp(1 + dominant, minimumScale, maximumScale) : 1 + dominant;
		w = originalWidth * scale;
		h = originalHeight * scale;
	}
	w = clamp(w, widthBounds.min, widthBounds.max);
	h = clamp(h, heightBounds.min, heightBounds.max);
	const { x: shiftX, y: shiftY } = placementShift({ w: originalWidth, h: originalHeight }, edge, modifiers, {
		w,
		h,
	});
	return { w, h, shiftX, shiftY };
}

/**
 * Where the element's top left went, for a box of this size.
 *
 * Said once rather than twice: a size a snap corrected (#311) is the same box
 * this drag would have made by hand, so it moves the placement by the same
 * rule. A near-edge grab holds the far edge still, ⌥ holds the centre, and
 * anything else leaves the corner where layout put it.
 */
export function placementShift(
	start: Size,
	edge: Edge,
	modifiers: ResizeModifiers,
	size: Size,
): { x: number; y: number } {
	const { sx, sy } = edgeSigns(edge);
	return {
		x:
			modifiers.center || (modifiers.proportional && sx === 0)
				? (start.w - size.w) / 2
				: sx < 0
					? start.w - size.w
					: 0,
		y:
			modifiers.center || (modifiers.proportional && sy === 0)
				? (start.h - size.h) / 2
				: sy < 0
					? start.h - size.h
					: 0,
	};
}

/**
 * The size this drag can actually write, which is the only size it may snap to.
 *
 * A drag writing whole pixels writes whole pixels, and a relative unit is
 * written to three places; a stop those cannot spell is a stop out of reach,
 * and `snapResize` drops it rather than drawing a guide over a size nobody got.
 */
export function writableSize(value: number, extra: number, write: SizeWrite): number {
	const authored = value - extra;
	if (write.unit === "px") return Math.round(authored) + extra;
	return Number((authored / write.per).toFixed(3)) * write.per + extra;
}

/**
 * What a turn writes: the signed token it is at, or the token it started in
 * taken off where the drag brought it back to rest. A removal has to name the
 * token it is taking off, since the literal is edited rather than replaced.
 */
export function turnValue(deg: number, worn: number): PropertyValue {
	const [token] = rotateTokens(deg);
	return token === undefined ? { kind: "remove", tokens: rotateTokens(worn) } : { kind: "binding", tokens: [token] };
}

/** Everything one resize gesture may write, and nothing else. */
export type ResizeProperty = "width" | "height" | "left" | "top";

/**
 * How a drag may spell one of them, given what the file already says.
 *
 * A size is an authored value in an authored unit, and the box it happens to
 * be is a different question (#305). So a drag writes in the family the author
 * used: pixels where the file says pixels or says nothing, the same relative
 * unit where it says one, and nothing at all where the authored form is not a
 * length a pointer can move. `w-full` and `w-1/2` are the layout's answer
 * rather than a number, and rewriting either as pixels would throw away what
 * the file meant.
 */
export type SizeSpelling =
	| { kind: "pixels" }
	/** `per` is what one of that unit measures on this element, in document pixels */
	| { kind: "unit"; unit: string; per: number }
	| { kind: "refused"; says: string };

/** What one property's value is written in, once the spelling is settled. */
export interface SizeWrite {
	unit: string;
	per: number;
}

const RELATIVE_UNITS = ["rem", "em"];

/**
 * The spelling this element's own literal leaves open for one family.
 *
 * Nothing authored is pixels: there is no unit to keep, and the drag means the
 * box it is making. A bare step or an authored `px` is pixels too. A `rem` or
 * `em` is kept, measured against what that unit is worth on this element. Every
 * other authored form refuses by name.
 */
export function authoredSpelling(
	className: string,
	family: string,
	units: Readonly<Record<string, number>>,
): SizeSpelling {
	const worn = lengthOf(scopedClass(className, BASE), family);
	if (worn === null) return { kind: "pixels" };
	const refused = (says: string): SizeSpelling => ({ kind: "refused", says });
	const bracket = /^\[(.+)\]$/.exec(worn.value);
	if (bracket === null) {
		// a bare step, and `px`, which is Tailwind's own name for one pixel
		if (worn.value === "px" || /^\d+(?:\.\d+)?$/.test(worn.value)) return { kind: "pixels" };
		return refused(`${family}-${worn.value} is what the layout decides, not a length a drag can move`);
	}
	const unit = /^-?[\d.]+([a-z%]+)$/i.exec(bracket[1] ?? "")?.[1];
	if (unit === undefined) return refused(`${worn.token} is not a length a drag can move`);
	if (unit === "px") return { kind: "pixels" };
	const per = units[unit];
	if (!RELATIVE_UNITS.includes(unit) || per === undefined || per <= 0) {
		return refused(`${worn.token} is written in ${unit}, which this drag cannot measure`);
	}
	return { kind: "unit", unit, per };
}

/**
 * What each of them is spelled in, and which number it takes.
 *
 * One table rather than a lookup and a ternary that have to agree: the family
 * a token wears and the pixel it is measured from are the same fact about the
 * property, said once.
 */
export const RESIZE_PROPERTIES: Readonly<
	Record<ResizeProperty, { family: string; px(box: Size, shift: { x: number; y: number }, offset: Offset): number }>
> = {
	width: { family: "w", px: (box) => box.w },
	height: { family: "h", px: (box) => box.h },
	left: { family: "left", px: (_box, shift, offset) => offset.left + shift.x },
	top: { family: "top", px: (_box, shift, offset) => offset.top + shift.y },
};

/** Where an already free-positioned element is placed, in the document's own pixels. */
export interface Offset {
	left: number;
	top: number;
}

/**
 * One length as a token, in the unit the author used.
 *
 * Pixels fold onto the project's scale where they sit on a whole step, because
 * that is byte-identical to what the frame's author would have written; a
 * relative unit stays itself, to three places, because rewriting it as pixels
 * would be a different promise about what the size follows.
 */
function scaledToken(family: string, px: number, step: number, write: SizeWrite): string {
	if (write.unit === "px") {
		const rounded = Math.round(px);
		return `${rounded < 0 ? "-" : ""}${family}-${scaleValue(Math.abs(rounded), step)}`;
	}
	const value = Number((px / write.per).toFixed(3));
	return `${value < 0 ? "-" : ""}${family}-[${Math.abs(value)}${write.unit}]`;
}

/**
 * What one resize gesture writes, property by property.
 *
 * The properties are fixed when the gesture opens, because the gesture is
 * about exactly those fields; the values are whatever the pointer last made. A size lands on the scale where it sits on a whole step and stays
 * absolute pixels where it does not, because the drag meant pixels and a bare class
 * silently rescales if `--spacing` moves.
 */
export function resizeFields(
	properties: readonly ResizeProperty[],
	live: Size,
	shift: { x: number; y: number },
	offset: Offset,
	step: number,
	writes: Readonly<Record<ResizeProperty, SizeWrite>>,
): { property: ResizeProperty; value: PropertyValue }[] {
	return properties.map((property) => {
		const { family, px } = RESIZE_PROPERTIES[property];
		const token = scaledToken(family, px(live, shift, offset), step, writes[property]);
		return { property, value: { kind: "binding", tokens: [token] } };
	});
}

/**
 * The inline style one sample wears (#316).
 *
 * Preview is the DOM: every sample of a live drag puts the values the release
 * would write straight on the element, and nothing leaves the canvas for it.
 * The numbers are the ones `resizeFields` spells, read through the same table,
 * so what the pointer shows and what the file gets cannot drift apart; the
 * properties are CSS's own names for them.
 */
export function resizeStyle(held: ResizeMeasurement): Record<string, string> {
	const style: Record<string, string> = {};
	for (const property of held.properties) {
		const px = RESIZE_PROPERTIES[property].px(held.live, held.shift, held.offset);
		style[property] = `${Number(px.toFixed(2))}px`;
	}
	return style;
}

/**
 * What the document said about the element a drag grabbed, and where the drag
 * has taken it since.
 *
 * One shape rather than eight fields, because none of them is knowable before
 * the reply and all of them are knowable after it. The properties are the ones
 * this gesture may write, in write order.
 */
export interface ResizeMeasurement {
	modifiers: ResizeModifiers;
	properties: readonly ResizeProperty[];
	/** the unit each of them is written in, taken from what the file already says */
	writes: Record<ResizeProperty, SizeWrite>;
	start: Size;
	/** what a `content-box` element adds on top of the width that is written */
	extra: Size;
	offset: { left: number; top: number };
	limits: SizeLimits;
	/** the size the pointer asked for, which every sample's snap begins from */
	raw: Size;
	live: Size;
	shift: { x: number; y: number };
}

/* ---------- what a snapping sample asks the document (#311) ---------- */

/**
 * The values one sample would write, which is the box the document tries on
 * to answer for it.
 */
export function wearOf(held: ResizeMeasurement, size: Size, edge: Edge): SnapWear {
	const shift = placementShift(held.start, edge, held.modifiers, size);
	const has = (property: ResizeProperty) => held.properties.includes(property);
	return {
		w: has("width") ? size.w - held.extra.w : null,
		h: has("height") ? size.h - held.extra.h : null,
		left: has("left") ? held.offset.left + shift.x : null,
		top: has("top") ? held.offset.top + shift.y : null,
	};
}

/** The pointer's own size, and the same one written pixel further along. */
export function snapTrial(held: ResizeMeasurement, edge: Edge, sx: Sign, sy: Sign): SnapTrial {
	return {
		wear: wearOf(held, held.raw, edge),
		probe: wearOf(held, { w: held.raw.w + (sx === 0 ? 0 : 1), h: held.raw.h + (sy === 0 ? 0 : 1) }, edge),
		sx,
		sy,
	};
}

/** The sizes this drag can spell, which are the only ones it may snap to. */
export function quantizerFor(held: ResizeMeasurement): { w(value: number): number; h(value: number): number } {
	return {
		w: (value) => (held.properties.includes("width") ? writableSize(value, held.extra.w, held.writes.width) : value),
		h: (value) =>
			held.properties.includes("height") ? writableSize(value, held.extra.h, held.writes.height) : value,
	};
}
