import { anatomyOf, splitClass } from "../../daemon/class-write";
import type { MeasuredBox, SpacingReading } from "./protocol";

/**
 * The measurement overlay's arithmetic (#261): a distance broken into the
 * things that made it, each named with the class that produced it and the
 * element that owns it.
 *
 * A number alone sends you hunting. `16px gap-4 on div` does not, and that is
 * the whole point of the overlay — it teaches **what to edit**, not only how
 * far apart two things are. So the decomposition follows ownership rather than
 * proximity:
 *
 * - a `gap-4` is named on the **parent**, because that is where it is written
 * - a `space-y-*` produces a child's margin and likewise resolves to the parent
 * - a margin is named on the element that carries it
 * - whatever is left over is **residual** rather than pinned on a class that
 *   did not cause it
 *
 * Attribution is by pixel match against the live class literal, which settles
 * two things static reading cannot: which of `m-2 mr-6` produced this side,
 * and whether the base token or the `md:` one is the live one. A distance a
 * stylesheet produced matches nothing and says so — shown, never attributed.
 *
 * The reading itself comes from the frame (`daemon/document.ts`), which is the
 * only place computed styles live. Nothing here does I/O, and every rule in
 * the list above is reachable from a table.
 */

export interface SpacingOwner {
	selector: string;
	tag: string;
	/**
	 * The owner is the pair's parent rather than one of the pair.
	 *
	 * Two rows of a list and the list itself are all `div` often enough that
	 * the tag alone would leave the reader hunting again, which is the one
	 * thing this overlay exists to stop.
	 */
	parent?: true;
}

export interface SpacingPart {
	kind: "gap" | "margin" | "residual";
	px: number;
	/** the class that produced it, where one on the owner does */
	token?: string;
	/** the element the class is written on */
	owner?: SpacingOwner;
	/** the part is real and no class on its owner says so — a stylesheet did */
	unclassed?: true;
	/**
	 * An adjoining margin that block flow collapsed away.
	 *
	 * It contributes nothing, and it is still listed: the class is there in the
	 * file, and someone who edits it and sees no movement has learned the wrong
	 * thing about their own code.
	 */
	collapsed?: true;
}

export interface Spacing {
	axis: "x" | "y";
	/** frame-local, the two facing edges and the line the bar is drawn on */
	from: number;
	to: number;
	at: number;
	distance: number;
	parts: SpacingPart[];
}

/** Displays where `gap` is a used value rather than a computed one nobody honours. */
const LAID_OUT = /flex|grid/;

/**
 * A box whose block margins do not collapse with its neighbour's: inline-level
 * and table boxes are the exceptions CSS names beside floats and out-of-flow
 * boxes, which the reading already reports as `loose`. A bare `inline` box goes
 * further — its block margins do not lay out at all, so they are not part of
 * any distance and are never attributed.
 */
const SEPARATE = /^(inline|table)/;

/** Subpixel layout, so a match is a match within a tenth. */
const NEAR = 0.1;

/**
 * The token families that can produce one physical margin, most specific
 * first: the first family holding a token worth the measured pixels wins,
 * which is the order Tailwind's own stylesheet resolves them in.
 */
function marginFamilies(side: Side, rtl: boolean): readonly string[] {
	switch (side) {
		case "top":
			return ["mt", "my", "m"];
		case "bottom":
			return ["mb", "my", "m"];
		case "left":
			return [rtl ? "me" : "ms", "ml", "mx", "m"];
		case "right":
			return [rtl ? "ms" : "me", "mr", "mx", "m"];
	}
}

type Side = "top" | "right" | "bottom" | "left";

export function decompose(reading: SpacingReading): Spacing {
	const { axis, first, second, parent, step, root } = reading;
	const distance = reading.to - reading.from;
	const parts: SpacingPart[] = [];
	const flat = axis === "x";
	const owns = { selector: parent.selector, tag: parent.tag, parent: true } as const;

	// the gap is the parent's, always — it is written there and nowhere else
	const gap = LAID_OUT.test(parent.display) ? (flat ? parent.gapX : parent.gapY) : 0;
	if (gap !== 0) {
		const token = tokenFor(parent.className, flat ? ["gap-x", "gap"] : ["gap-y", "gap"], gap, step, root);
		parts.push(part("gap", gap, token, owns));
	}

	// the two facing margins, each on the box that carries it
	const near: Side = flat ? "right" : "bottom";
	const far: Side = flat ? "left" : "top";
	const held = [
		{ box: first, side: near, px: marginOf(first, near, flat) },
		{ box: second, side: far, px: marginOf(second, far, flat) },
	] as const;
	// adjoining block margins collapse to one: the largest positive plus the
	// most negative, which is the CSS rule verbatim
	const collapses = !flat && !LAID_OUT.test(parent.display) && !apart(first) && !apart(second);
	const kept = collapses ? survivor(held[0].px, held[1].px) : null;
	for (const [index, margin] of held.entries()) {
		if (margin.px === 0) continue;
		const token = tokenFor(margin.box.className, marginFamilies(margin.side, margin.box.rtl), margin.px, step, root);
		// a margin with no token of its own may be the parent's `space-*`,
		// which writes the child's margin and is edited on the parent
		const spaced =
			token === undefined
				? tokenFor(parent.className, [flat ? "space-x" : "space-y"], margin.px, step, root)
				: undefined;
		const owner = spaced === undefined ? { selector: margin.box.selector, tag: margin.box.tag } : owns;
		const gone = kept !== null && kept !== index;
		const found = part("margin", gone ? 0 : margin.px, token ?? spaced, owner);
		parts.push(gone ? { ...found, px: margin.px, collapsed: true } : found);
	}

	const attributed = parts.reduce((total, found) => total + (found.collapsed === true ? 0 : found.px), 0);
	const residual = distance - attributed;
	if (Math.abs(residual) >= 0.5 || parts.length === 0) parts.push({ kind: "residual", px: residual });
	return { axis, from: reading.from, to: reading.to, at: reading.at, distance, parts };
}

/** A bare inline box lays out no block margin, so none of one is in a distance. */
function marginOf(box: MeasuredBox, side: Side, flat: boolean): number {
	return !flat && box.display === "inline" ? 0 : box.margins[side];
}

/** Whether this box's block margins stand apart from its neighbour's. */
function apart(box: MeasuredBox): boolean {
	return box.loose || SEPARATE.test(box.display);
}

function part(kind: "gap" | "margin", px: number, token: string | undefined, owner: SpacingOwner): SpacingPart {
	return token === undefined ? { kind, px, owner, unclassed: true } : { kind, px, token, owner };
}

/** Which of two adjoining block margins survives the collapse — 0 or 1. */
function survivor(a: number, b: number): 0 | 1 {
	const collapsed = Math.max(0, a, b) + Math.min(0, a, b);
	return collapsed === a ? 0 : 1;
}

/**
 * The token on this literal that is worth these pixels, or nothing.
 *
 * Families are tried most specific first, because that is the order the
 * stylesheet resolves them in: with `m-2 mr-6` on one element, six is the right
 * margin and two is not. Within a family a bare token beats a variant one of
 * the same worth — the bare one says this number at every width, and the
 * variant only says it under its own condition.
 */
function tokenFor(
	className: string,
	families: readonly string[],
	px: number,
	step: number,
	root: number,
): string | undefined {
	const tokens = splitClass(className).map((token) => ({ token, anatomy: anatomyOf(token) }));
	for (const family of families) {
		const matches = tokens.filter(({ anatomy }) => {
			const value = familyValue(anatomy.base, family);
			if (value === undefined) return false;
			const worth = valuePx(value, step, root);
			return worth !== undefined && Math.abs((anatomy.negative ? -worth : worth) - px) <= NEAR;
		});
		const best = matches.find(({ anatomy }) => anatomy.variants.length === 0) ?? matches[0];
		if (best !== undefined) return best.token;
	}
	return undefined;
}

/** `gap-4` under the family `gap` is `4`; `gap-x-4` under it is nothing. */
function familyValue(base: string, family: string): string | undefined {
	return base.startsWith(`${family}-`) ? base.slice(family.length + 1) : undefined;
}

/** What a spacing value is worth in pixels, or nothing when it cannot be known. */
function valuePx(value: string, step: number, root: number): number | undefined {
	if (value === "px") return 1;
	if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * step;
	const arbitrary = /^\[(.+)]$/.exec(value);
	return arbitrary?.[1] === undefined ? undefined : arbitraryPx(arbitrary[1], root);
}

/**
 * An arbitrary length in pixels — `gap-[15px]`, `mt-[1rem]`. Those two units
 * only: `em` and `%` depend on the element and the parent box, and a guess
 * there would name the wrong class.
 */
export function arbitraryPx(text: string, root: number): number | undefined {
	const [, amount, unit] = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem)$/.exec(text.trim()) ?? [];
	if (amount === undefined) return undefined;
	return unit === "rem" ? Number(amount) * root : Number(amount);
}

/** The box of the pair the pointer named, which is the one the overlay outlines. */
export function measuredTarget(reading: SpacingReading, held: string): MeasuredBox {
	return reading.first.selector === held ? reading.second : reading.first;
}
