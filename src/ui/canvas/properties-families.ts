import { anatomyOf, splitClass } from "../../daemon/class-write";
import type { CompiledTheme } from "../api";
import { knowsColour, paintOf, paintWith, type ThemeList, themeValue } from "./properties-theme";

/**
 * What a Tailwind token is made of, family by family (#257).
 *
 * One rule decides what writes: **numbers and words write, tokens wait.** A
 * number on the scale (`h-11`, `p-4`, `opacity-50`) and a word from an enum
 * (`flex`, `items-center`, `absolute`) are each one token on a literal, and a
 * named token (`bg-thread`, `text-base`, `rounded-md`) is chosen from the
 * compiled theme and written as a token — editing the token's own definition
 * is a separate effort and stays out.
 *
 * This module is the reading half and the shape of the write. It never
 * rewrites a literal: the write lane (`daemon/class-write.ts`) owns that,
 * because the fewest-tokens spelling, the logical round-trip and the zero that
 * drops at the base but overrides under a scope are one set of rules and there
 * is one place for them. A row here says which token it means, and the lane
 * says what the literal looks like afterwards.
 *
 * Two readings the inventory found wrong are fixed by where the values come
 * from: menus read the compiled theme rather than Tailwind's defaults, and the
 * folds read logical spellings (`ps-`, `inset-x-`, `border-s-`, `rounded-ss-`)
 * as the sides they resolve to.
 */

/* ---------- lengths: a sign, a fraction, a unit ---------- */

export type Kind = "spacing" | "count" | "percent" | "deg" | "ms" | "px";

/** Every numeric family a row writes, and what its value measures. */
export const LENGTHS: Readonly<Record<string, Kind>> = {
	p: "spacing",
	px: "spacing",
	py: "spacing",
	pt: "spacing",
	pr: "spacing",
	pb: "spacing",
	pl: "spacing",
	ps: "spacing",
	pe: "spacing",
	m: "spacing",
	mx: "spacing",
	my: "spacing",
	mt: "spacing",
	mr: "spacing",
	mb: "spacing",
	ml: "spacing",
	ms: "spacing",
	me: "spacing",
	gap: "spacing",
	"gap-x": "spacing",
	"gap-y": "spacing",
	"space-x": "spacing",
	"space-y": "spacing",
	w: "spacing",
	h: "spacing",
	size: "spacing",
	"min-w": "spacing",
	"max-w": "spacing",
	"min-h": "spacing",
	"max-h": "spacing",
	top: "spacing",
	right: "spacing",
	bottom: "spacing",
	left: "spacing",
	inset: "spacing",
	"inset-x": "spacing",
	"inset-y": "spacing",
	start: "spacing",
	end: "spacing",
	translate: "spacing",
	"translate-x": "spacing",
	"translate-y": "spacing",
	indent: "spacing",
	basis: "spacing",
	z: "count",
	order: "count",
	"grid-cols": "count",
	"grid-rows": "count",
	"col-span": "count",
	"row-span": "count",
	"col-start": "count",
	"row-start": "count",
	columns: "count",
	"line-clamp": "count",
	opacity: "percent",
	scale: "percent",
	"scale-x": "percent",
	"scale-y": "percent",
	brightness: "percent",
	contrast: "percent",
	saturate: "percent",
	rotate: "deg",
	"rotate-x": "deg",
	"rotate-y": "deg",
	skew: "deg",
	"skew-x": "deg",
	"skew-y": "deg",
	"hue-rotate": "deg",
	duration: "ms",
	delay: "ms",
	border: "px",
	"border-t": "px",
	"border-r": "px",
	"border-b": "px",
	"border-l": "px",
	"border-x": "px",
	"border-y": "px",
	"border-s": "px",
	"border-e": "px",
	outline: "px",
	"outline-offset": "px",
	ring: "px",
	"ring-offset": "px",
	decoration: "px",
	"underline-offset": "px",
	stroke: "px",
};

/** Longest first, so `gap-x` beats `gap` and `border-t` beats `border`. */
const LENGTH_FAMILIES = Object.keys(LENGTHS).sort((a, b) => b.length - a.length);

/** The words a length takes besides a number. */
const LENGTH_WORDS: Readonly<Record<Kind, readonly string[]>> = {
	spacing: [
		"px",
		"full",
		"auto",
		"screen",
		"min",
		"max",
		"fit",
		"dvh",
		"svh",
		"lvh",
		"dvw",
		"svw",
		"lvw",
		"none",
		"3xs",
		"2xs",
		"xs",
		"sm",
		"md",
		"lg",
		"xl",
		"2xl",
		"3xl",
		"4xl",
		"5xl",
		"6xl",
		"7xl",
		"prose",
	],
	count: ["auto", "none", "full", "first", "last"],
	percent: [],
	deg: ["none"],
	ms: ["initial"],
	px: ["none"],
};

export interface Length {
	family: string;
	kind: Kind;
	/** what is written after `family-`: `4`, `1/2`, `[347px]`, `full` */
	value: string;
	negative: boolean;
	important: boolean;
	/** the token as the literal spells it, with its variants taken off */
	token: string;
}

function valueFits(kind: Kind, value: string): boolean {
	if (/^\[.+\]$/.test(value) || /^\(--.+\)$/.test(value)) return true;
	if (/^\d+(?:\.\d+)?$/.test(value)) return true;
	if (kind === "spacing" && /^\d+\/\d+$/.test(value)) return true;
	return LENGTH_WORDS[kind].includes(value);
}

/** Which length family a bare token belongs to, and its value; null when it is none. */
export function lengthOfToken(base: string): { family: string; kind: Kind; value: string } | null {
	for (const family of LENGTH_FAMILIES) {
		if (!base.startsWith(`${family}-`)) continue;
		const value = base.slice(family.length + 1);
		const kind = LENGTHS[family] ?? "spacing";
		if (value === "" || !valueFits(kind, value)) continue;
		return { family, kind, value };
	}
	return null;
}

/** The token this family wears among the given (already scoped) tokens. */
export function lengthOf(scoped: string, family: string): Length | null {
	for (const token of splitClass(scoped)) {
		const anatomy = anatomyOf(token);
		const found = lengthOfToken(anatomy.base);
		if (found === null || found.family !== family) continue;
		return { ...found, negative: anatomy.negative, important: anatomy.important, token };
	}
	return null;
}

/**
 * The pixel value a row shows faint beside the token: `16px`, `-8px`, `50%`,
 * `12deg`, `150ms`, `10`. The scale is the compiled theme's, so a project that
 * set `--spacing` to something other than 4px reads in its own units.
 */
export function describe(kind: Kind, value: string | null, negative = false, step = 4): string | null {
	if (value === null) return null;
	const sign = negative ? "-" : "";
	const bracket = /^\[(.+)\]$/.exec(value);
	if (bracket?.[1] !== undefined) return `${sign}${bracket[1].replace(/_/g, " ")}`;
	if (value.startsWith("(")) return `${sign}var${value}`;
	const fraction = /^(\d+)\/(\d+)$/.exec(value);
	if (fraction?.[1] !== undefined && fraction[2] !== undefined) {
		const percent = (Number(fraction[1]) / Number(fraction[2])) * 100;
		return `${sign}${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
	}
	if (!/^\d+(?:\.\d+)?$/.test(value)) return value === "px" && kind === "spacing" ? `${sign}1px` : value;
	const count = Number(value);
	switch (kind) {
		case "spacing":
			return `${sign}${Number((count * step).toFixed(2))}px`;
		case "count":
			return `${sign}${count}`;
		case "percent":
			return `${sign}${count}%`;
		case "deg":
			return `${sign}${count}deg`;
		case "ms":
			return `${count}ms`;
		case "px":
			return `${count}px`;
	}
}

/** What a length is worth for the scrub and the arrows; null when it is not a measure. */
export function lengthPx(kind: Kind, value: string | null, step = 4): number | null {
	if (value === null) return null;
	const bracket = /^\[(\d+(?:\.\d+)?)(?:px|deg|ms|%)?\]$/.exec(value);
	if (bracket?.[1] !== undefined) return Number(bracket[1]);
	if (kind === "spacing") {
		if (value === "px") return 1;
		return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * step : null;
	}
	return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

/**
 * The spike's policy (#13): a whole step gets the bare class, because it is
 * what the author would have written; anything else stays absolute, because
 * the drag meant pixels.
 */
export function scaleValue(px: number, step = 4): string {
	const rounded = Math.max(0, Math.round(px));
	return rounded % step === 0 ? String(rounded / step) : `[${rounded}px]`;
}

const FRACTIONS: readonly (readonly [number, string])[] = [
	[50, "1/2"],
	[33.33, "1/3"],
	[66.67, "2/3"],
	[25, "1/4"],
	[75, "3/4"],
	[20, "1/5"],
	[40, "2/5"],
	[60, "3/5"],
	[80, "4/5"],
	[16.67, "1/6"],
	[83.33, "5/6"],
];

/**
 * What a typed value becomes on the class (P6): a sign is kept, a fraction
 * stays a fraction, a unit decides the bracket. `-4` is `-mt-4`, `50%` is
 * `w-1/2`, `347px` is `w-[347px]`, `12deg` is `rotate-12`, `.3s` is
 * `duration-300`, `10` on z-index is `z-10`.
 */
export function parseTyped(kind: Kind, typed: string, step = 4): { value: string; negative: boolean } | null {
	let text = typed.trim().replace(/\s+/g, "_");
	if (text === "") return null;
	let negative = false;
	if (text.startsWith("-")) {
		negative = true;
		text = text.slice(1);
	}
	if (/^\[.+\]$/.test(text) || /^\(--[a-z0-9-]+\)$/.test(text)) return { value: text, negative };
	const number = /^(\d+(?:\.\d+)?|\.\d+)(px|%|deg|rad|turn|ms|s|rem|em|vh|vw)?$/.exec(text);
	if (number?.[1] !== undefined) {
		const count = Number(number[1]);
		const unit = number[2];
		switch (kind) {
			case "spacing": {
				if (unit === undefined) return { value: number[1], negative };
				if (unit === "px") return { value: scaleValue(count, step), negative };
				if (unit === "%") {
					const fraction = FRACTIONS.find(([percent]) => Math.abs(percent - count) < 0.01);
					return { value: fraction === undefined ? `[${count}%]` : fraction[1], negative };
				}
				if (unit === "rem") return { value: scaleValue(count * 16, step), negative };
				return { value: `[${count}${unit}]`, negative };
			}
			case "count":
				return unit === undefined ? { value: String(Math.round(count)), negative } : null;
			case "percent":
				return unit === undefined || unit === "%"
					? { value: String(count), negative }
					: { value: `[${count}${unit}]`, negative };
			case "deg":
				return unit === undefined || unit === "deg"
					? { value: String(count), negative }
					: { value: `[${count}${unit}]`, negative };
			case "ms":
				if (unit === undefined || unit === "ms") return { value: String(Math.round(count)), negative: false };
				if (unit === "s") return { value: String(Math.round(count * 1000)), negative: false };
				return null;
			case "px":
				if (unit === undefined || unit === "px") {
					// `border-1.5` is a class Tailwind refuses, so a fraction brackets
					return Number.isInteger(count)
						? { value: String(count), negative: false }
						: { value: `[${count}px]`, negative: false };
				}
				return { value: `[${count}${unit}]`, negative: false };
		}
	}
	if (kind === "spacing" && /^\d+\/\d+$/.test(text)) return { value: text, negative };
	return LENGTH_WORDS[kind].includes(text) ? { value: text, negative: false } : null;
}

/**
 * One step for the arrows and the label's scrub: a scale unit on a measure,
 * one on a count, five on a percent, fifty on a duration.
 */
export function stepLength(
	kind: Kind,
	current: Length | null,
	measured: number,
	units: number,
	step = 4,
): { value: string; negative: boolean } {
	const held = current === null ? null : lengthPx(kind, current.value, step);
	const now = held === null ? measured : current?.negative === true ? -held : held;
	switch (kind) {
		case "spacing": {
			const next = now + units * step;
			return { value: scaleValue(Math.abs(next), step), negative: next < 0 };
		}
		case "count":
		case "deg": {
			const next = Math.round(now + units);
			return { value: String(Math.abs(next)), negative: next < 0 };
		}
		case "percent": {
			return { value: String(Math.max(0, Math.round(now + units * 5))), negative: false };
		}
		case "ms": {
			return { value: String(Math.max(0, Math.round(now + units * 50))), negative: false };
		}
		case "px": {
			return { value: String(Math.max(0, Math.round(now + units))), negative: false };
		}
	}
}

/** A length as the token a `set-class` op carries: `-mt-2`, `w-[347px]`. */
export function lengthToken(family: string, value: { value: string; negative: boolean }): string {
	return `${value.negative ? "-" : ""}${family}-${value.value}`;
}

/* ---------- the folds: sides, corners and edges, read ---------- */

export type Side = "t" | "r" | "b" | "l";
export type Corner = "tl" | "tr" | "br" | "bl";

const SIDE_KEYS: Readonly<Record<string, readonly Side[]>> = {
	"": ["t", "r", "b", "l"],
	x: ["r", "l"],
	y: ["t", "b"],
	t: ["t"],
	r: ["r"],
	b: ["b"],
	l: ["l"],
	s: ["l"],
	e: ["r"],
};

function signed(length: Length | null): string | null {
	return length === null ? null : `${length.negative ? "-" : ""}${length.value}`;
}

/**
 * Each side of a spacing fold, read through the whole, the axes, the sides and
 * the logical spellings, in that order of specificity. `ps-4` is the left side
 * of a left-to-right document, and reading it as one is what lets the row show
 * a value instead of an empty field.
 */
export function sidesOf(scoped: string, prefix: "p" | "m"): Record<Side, string | null> {
	const all = lengthOf(scoped, prefix);
	const x = lengthOf(scoped, `${prefix}x`);
	const y = lengthOf(scoped, `${prefix}y`);
	const side = (own: string, logical: string | null, axis: Length | null): string | null =>
		signed(lengthOf(scoped, own) ?? (logical === null ? null : lengthOf(scoped, logical)) ?? axis ?? all);
	return {
		t: side(`${prefix}t`, null, y),
		r: side(`${prefix}r`, `${prefix}e`, x),
		b: side(`${prefix}b`, null, y),
		l: side(`${prefix}l`, `${prefix}s`, x),
	};
}

/** The gap on each axis, read through `gap` and its two halves. */
export function gapOf(scoped: string): { x: string | null; y: string | null } {
	const both = lengthOf(scoped, "gap");
	return {
		x: signed(lengthOf(scoped, "gap-x") ?? both),
		y: signed(lengthOf(scoped, "gap-y") ?? both),
	};
}

/** Each inset, read through `inset`, its axes and the logical `start`/`end`. */
export function insetOf(scoped: string): Record<Side, string | null> {
	const all = lengthOf(scoped, "inset");
	const x = lengthOf(scoped, "inset-x");
	const y = lengthOf(scoped, "inset-y");
	return {
		t: signed(lengthOf(scoped, "top") ?? y ?? all),
		r: signed(lengthOf(scoped, "right") ?? lengthOf(scoped, "end") ?? x ?? all),
		b: signed(lengthOf(scoped, "bottom") ?? y ?? all),
		l: signed(lengthOf(scoped, "left") ?? lengthOf(scoped, "start") ?? x ?? all),
	};
}

const RADIUS_CORNERS: Readonly<Record<string, readonly Corner[]>> = {
	"": ["tl", "tr", "br", "bl"],
	t: ["tl", "tr"],
	r: ["tr", "br"],
	b: ["br", "bl"],
	l: ["tl", "bl"],
	s: ["tl", "bl"],
	e: ["tr", "br"],
	tl: ["tl"],
	tr: ["tr"],
	br: ["br"],
	bl: ["bl"],
	ss: ["tl"],
	se: ["tr"],
	ee: ["br"],
	es: ["bl"],
};

function radiusNameOk(theme: CompiledTheme | null, name: string): boolean {
	if (name === "none" || name === "full") return true;
	if (/^\[.+\]$/.test(name) || /^\(--.+\)$/.test(name)) return true;
	return themeValue(theme, "radius", name) !== undefined;
}

/**
 * `rounded-md rounded-tl-none` as four corners; a corner nothing sets is null.
 *
 * Which half of `rounded-<a>-<b>` is the side is a question only the theme can
 * answer — `rounded-ss-lg` is a logical corner and `rounded-2xl` is a name with
 * a dash in it — so the theme is what tells them apart.
 */
export function cornersOf(scoped: string, theme: CompiledTheme | null): Record<Corner, string | null> {
	const corners: Record<Corner, string | null> = { tl: null, tr: null, br: null, bl: null };
	for (const token of splitClass(scoped)) {
		const base = anatomyOf(token).base;
		if (!base.startsWith("rounded")) continue;
		if (base === "rounded") {
			for (const corner of RADIUS_CORNERS[""] ?? []) corners[corner] = "sm";
			continue;
		}
		const rest = base.slice("rounded-".length);
		if (radiusNameOk(theme, rest)) {
			for (const corner of RADIUS_CORNERS[""] ?? []) corners[corner] = rest;
			continue;
		}
		const dash = rest.indexOf("-");
		if (dash === -1) continue;
		const targets = RADIUS_CORNERS[rest.slice(0, dash)];
		const name = rest.slice(dash + 1);
		if (targets === undefined || !radiusNameOk(theme, name)) continue;
		for (const corner of targets) corners[corner] = name;
	}
	return corners;
}

/** The radius token one corner writes: `rounded-tl-lg`, `rounded-none`. */
export function radiusToken(corner: Corner | "all", name: string, logical = false): string {
	if (corner === "all") return `rounded-${name}`;
	const side = logical ? ({ tl: "ss", tr: "se", br: "ee", bl: "es" } as const)[corner] : corner;
	return `rounded-${side}-${name}`;
}

/** `border border-b-2 border-x-0` as four widths; an edge nothing sets is null. */
export function borderWidthsOf(scoped: string): Record<Side, string | null> {
	const edges: Record<Side, string | null> = { t: null, r: null, b: null, l: null };
	for (const token of splitClass(scoped)) {
		const base = anatomyOf(token).base;
		if (base === "border") {
			for (const edge of SIDE_KEYS[""] ?? []) edges[edge] = "1";
			continue;
		}
		const match = /^border(?:-([xytrbl]|s|e))?(?:-(\d+|px|\[.+\]))?$/.exec(base);
		if (match === null || (match[1] === undefined && match[2] === undefined)) continue;
		for (const edge of SIDE_KEYS[match[1] ?? ""] ?? []) edges[edge] = match[2] ?? "1";
	}
	return edges;
}

/** The width token one edge writes: `border-2`, `border-t`, `border-[1.5px]`. */
export function borderWidthToken(edge: Side | "all", width: string, logical = false): string {
	const side = edge === "all" ? "" : logical ? ({ t: "t", r: "e", b: "b", l: "s" } as const)[edge] : edge;
	return `border${side === "" ? "" : `-${side}`}${width === "1" ? "" : `-${width}`}`;
}

/* ---------- colours, with an alpha ---------- */

export interface Colour {
	/** the token as worn, or null when nothing under this scope sets it */
	token: string | null;
	name: string | null;
	/** percent, or null when opaque */
	alpha: number | null;
	paint: string | null;
}

/**
 * `bg-thread/50` or `bg-[#ff0044]/50` taken apart; null when the token is not
 * a colour on this prefix. The theme decides what a name is, so `bg-linear-to-r`
 * is never mistaken for one.
 */
export function colourOfToken(
	base: string,
	prefix: string,
	theme: CompiledTheme | null,
): { name: string; alpha: number | null; paint: string } | null {
	if (!base.startsWith(`${prefix}-`)) return null;
	const rest = base.slice(prefix.length + 1);
	let slash = -1;
	let depth = 0;
	for (let at = 0; at < rest.length; at += 1) {
		const char = rest[at];
		if (char === "[" || char === "(") depth += 1;
		if (char === "]" || char === ")") depth -= 1;
		if (char === "/" && depth === 0) {
			slash = at;
			break;
		}
	}
	const name = slash === -1 ? rest : rest.slice(0, slash);
	const paint = paintOf(theme, name);
	if (paint === undefined) return null;
	if (slash === -1) return { name, alpha: null, paint };
	const raw = rest.slice(slash + 1);
	const plain = /^(\d+(?:\.\d+)?)$/.exec(raw);
	const bracket = /^\[(\d+(?:\.\d+)?)%?\]$/.exec(raw);
	const alpha = plain?.[1] ?? bracket?.[1];
	return alpha === undefined ? null : { name, alpha: Number(alpha), paint };
}

/** The colour this prefix wears among the scoped tokens. */
export function colourOf(scoped: string, prefix: string, theme: CompiledTheme | null): Colour {
	for (const token of splitClass(scoped)) {
		const found = colourOfToken(anatomyOf(token).base, prefix, theme);
		if (found === null) continue;
		return { token, name: found.name, alpha: found.alpha, paint: paintWith(found.paint, found.alpha) };
	}
	return { token: null, name: null, alpha: null, paint: null };
}

/** The token a colour row writes: `bg-thread`, `bg-thread/50`, `bg-[#ff0044]`. */
export function colourToken(prefix: string, name: string, alpha: number | null): string {
	if (alpha === null || alpha >= 100) return `${prefix}-${name}`;
	return Number.isInteger(alpha) ? `${prefix}-${name}/${alpha}` : `${prefix}-${name}/[${alpha}%]`;
}

/** Each edge's border colour, read through the whole, the axes and the sides. */
export function borderColoursOf(scoped: string, theme: CompiledTheme | null): Record<Side, Colour> {
	const none: Colour = { token: null, name: null, alpha: null, paint: null };
	const edges: Record<Side, Colour> = { t: none, r: none, b: none, l: none };
	for (const token of splitClass(scoped)) {
		const base = anatomyOf(token).base;
		for (const side of ["", "x", "y", "t", "r", "b", "l", "s", "e"]) {
			const prefix = side === "" ? "border" : `border-${side}`;
			const found = colourOfToken(base, prefix, theme);
			if (found === null) continue;
			const colour: Colour = {
				token,
				name: found.name,
				alpha: found.alpha,
				paint: paintWith(found.paint, found.alpha),
			};
			for (const edge of SIDE_KEYS[side] ?? []) edges[edge] = colour;
		}
	}
	return edges;
}

/* ---------- gradients: one gesture, several tokens ---------- */

export type GradientShape = "linear" | "radial" | "conic";

export interface Stop {
	at: "from" | "via" | "to";
	colour: Colour | null;
	/** `10%`, or null when the browser spaces it */
	position: string | null;
}

export interface Gradient {
	shape: GradientShape;
	/** `to-r` or an angle `45`; null when the shape has no direction token */
	direction: string | null;
	stops: readonly Stop[];
	/** the shape token, to light it on the source line */
	token: string;
}

export const DIRECTIONS: readonly { value: string; says: string }[] = [
	{ value: "to-t", says: "to top" },
	{ value: "to-tr", says: "to top right" },
	{ value: "to-r", says: "to right" },
	{ value: "to-br", says: "to bottom right" },
	{ value: "to-b", says: "to bottom" },
	{ value: "to-bl", says: "to bottom left" },
	{ value: "to-l", says: "to left" },
	{ value: "to-tl", says: "to top left" },
];

const STOPS = ["from", "via", "to"] as const;

function shapeOfToken(base: string): { shape: GradientShape; direction: string | null } | null {
	const linear = /^bg-(?:linear|gradient)-(.+)$/.exec(base);
	if (linear?.[1] !== undefined) return { shape: "linear", direction: linear[1] };
	if (base === "bg-linear" || base === "bg-gradient") return { shape: "linear", direction: null };
	for (const shape of ["radial", "conic"] as const) {
		if (base === `bg-${shape}`) return { shape, direction: null };
		if (base.startsWith(`bg-${shape}-`)) return { shape, direction: base.slice(`bg-${shape}-`.length) };
	}
	return null;
}

/** The gradient the scoped tokens spell, or null when there is no shape token. */
export function gradientOf(scoped: string, theme: CompiledTheme | null): Gradient | null {
	let shape: { shape: GradientShape; direction: string | null; token: string } | null = null;
	const stops: Record<"from" | "via" | "to", Stop> = {
		from: { at: "from", colour: null, position: null },
		via: { at: "via", colour: null, position: null },
		to: { at: "to", colour: null, position: null },
	};
	for (const token of splitClass(scoped)) {
		const base = anatomyOf(token).base;
		const found = shapeOfToken(base);
		if (found !== null) {
			shape = { ...found, token };
			continue;
		}
		for (const at of STOPS) {
			if (!base.startsWith(`${at}-`)) continue;
			const rest = base.slice(at.length + 1);
			if (/^\d+(?:\.\d+)?%$/.test(rest)) {
				stops[at] = { ...stops[at], position: rest };
				continue;
			}
			const colour = colourOfToken(base, at, theme);
			if (colour === null) continue;
			stops[at] = {
				...stops[at],
				colour: {
					token,
					name: colour.name,
					alpha: colour.alpha,
					paint: paintWith(colour.paint, colour.alpha),
				},
			};
		}
	}
	if (shape === null) return null;
	return { shape: shape.shape, direction: shape.direction, stops: STOPS.map((at) => stops[at]), token: shape.token };
}

/** True while this bare token is part of a gradient, which is what `none` drops. */
export function isGradientToken(base: string, theme: CompiledTheme | null): boolean {
	if (shapeOfToken(base) !== null) return true;
	return STOPS.some((at) => {
		if (!base.startsWith(`${at}-`)) return false;
		const rest = base.slice(at.length + 1);
		return /^\d+(?:\.\d+)?%$/.test(rest) || colourOfToken(base, at, theme) !== null;
	});
}

/** The shape token a gradient writes: `bg-linear-to-r`, `bg-radial`, `bg-conic-45`. */
export function gradientShapeToken(shape: GradientShape, direction: string | null): string {
	if (shape === "linear") return `bg-linear-${direction ?? "to-r"}`;
	return direction === null ? `bg-${shape}` : `bg-${shape}-${direction}`;
}

/** The CSS a gradient paints, for the swatch beside the row. */
export function gradientCss(gradient: Gradient): string {
	const stops = gradient.stops
		.filter((stop) => stop.colour !== null)
		.map((stop) => `${stop.colour?.paint ?? "transparent"}${stop.position === null ? "" : ` ${stop.position}`}`)
		.join(", ");
	if (gradient.shape === "radial") {
		const at =
			gradient.direction === null ? "" : `${gradient.direction.replace(/^\[|\]$/g, "").replace(/_/g, " ")}, `;
		return `radial-gradient(${at}${stops})`;
	}
	if (gradient.shape === "conic") {
		return `conic-gradient(${gradient.direction === null ? "" : `from ${gradient.direction}deg, `}${stops})`;
	}
	const direction = gradient.direction ?? "to-r";
	const angle = /^\d+$/.test(direction)
		? `${direction}deg`
		: (DIRECTIONS.find((candidate) => candidate.value === direction)?.says ?? "to right");
	return `linear-gradient(${angle}, ${stops})`;
}

/* ---------- toggle sets: several tokens of one property, on at once ---------- */

export interface ToggleSet {
	/** the CSS property, which is the row's label */
	property: string;
	/** each inner list is exclusive; the lists are independent */
	groups: readonly (readonly string[])[];
	/** the token that resets the whole set */
	reset: string;
}

export const NUMERIC_SET: ToggleSet = {
	property: "font-variant-numeric",
	groups: [
		["ordinal"],
		["slashed-zero"],
		["lining-nums", "oldstyle-nums"],
		["proportional-nums", "tabular-nums"],
		["diagonal-fractions", "stacked-fractions"],
	],
	reset: "normal-nums",
};

export const FILTER_SET: ToggleSet = {
	property: "filter",
	groups: [["grayscale"], ["invert"], ["sepia"], ["blur-xs", "blur-sm", "blur-md", "blur-lg", "blur-xl"]],
	reset: "filter-none",
};

export const SNAP_SET: ToggleSet = {
	property: "scroll-snap-type",
	groups: [
		["snap-x", "snap-y", "snap-both"],
		["snap-mandatory", "snap-proximity"],
	],
	reset: "snap-none",
};

export const TOGGLE_SETS: readonly ToggleSet[] = [NUMERIC_SET, FILTER_SET, SNAP_SET];

/** Which of a set's tokens the scoped literal is wearing. */
export function toggledOf(scoped: string, set: ToggleSet): ReadonlySet<string> {
	const all = new Set(set.groups.flat());
	return new Set(
		splitClass(scoped)
			.map((token) => anatomyOf(token).base)
			.filter((base) => all.has(base)),
	);
}

/** The tokens turning one on knocks out: its own exclusive group, and the reset. */
export function knockedOut(set: ToggleSet, token: string): string[] {
	const group = set.groups.find((members) => members.includes(token)) ?? [];
	return [...group.filter((member) => member !== token), set.reset];
}

/* ---------- words: one enum token on the literal ---------- */

export type Word =
	| "display"
	| "direction"
	| "wrap"
	| "align"
	| "justify"
	| "self"
	| "position"
	| "overflow"
	| "overflow-x"
	| "overflow-y"
	| "text-align"
	| "text-transform"
	| "text-decoration"
	| "font-style"
	| "white-space"
	| "object-fit"
	| "flex"
	| "truncate";

export interface WordFamily {
	/** the CSS property the row is named after */
	property: string;
	/** token → what the row says it means; the order is the control's order */
	options: readonly { token: string; says: string }[];
	/** what the property is when nothing sets it */
	fallback: string;
}

export const WORDS: Readonly<Record<Word, WordFamily>> = {
	display: {
		property: "display",
		options: [
			{ token: "flex", says: "flex" },
			{ token: "grid", says: "grid" },
			{ token: "block", says: "block" },
			{ token: "inline-flex", says: "inline-flex" },
			{ token: "inline-block", says: "inline-block" },
			{ token: "inline", says: "inline" },
			{ token: "contents", says: "contents" },
			{ token: "hidden", says: "none" },
		],
		fallback: "inline",
	},
	direction: {
		property: "flex-direction",
		options: [
			{ token: "flex-row", says: "row" },
			{ token: "flex-col", says: "column" },
			{ token: "flex-row-reverse", says: "row-reverse" },
			{ token: "flex-col-reverse", says: "column-reverse" },
		],
		fallback: "row",
	},
	wrap: {
		property: "flex-wrap",
		options: [
			{ token: "flex-wrap", says: "wrap" },
			{ token: "flex-nowrap", says: "nowrap" },
		],
		fallback: "nowrap",
	},
	align: {
		property: "align-items",
		options: [
			{ token: "items-start", says: "start" },
			{ token: "items-center", says: "center" },
			{ token: "items-end", says: "end" },
			{ token: "items-baseline", says: "baseline" },
			{ token: "items-stretch", says: "stretch" },
		],
		fallback: "stretch",
	},
	justify: {
		property: "justify-content",
		options: [
			{ token: "justify-start", says: "start" },
			{ token: "justify-center", says: "center" },
			{ token: "justify-end", says: "end" },
			{ token: "justify-between", says: "between" },
			{ token: "justify-around", says: "around" },
			{ token: "justify-evenly", says: "evenly" },
		],
		fallback: "start",
	},
	self: {
		property: "align-self",
		options: [
			{ token: "self-auto", says: "auto" },
			{ token: "self-start", says: "start" },
			{ token: "self-center", says: "center" },
			{ token: "self-end", says: "end" },
			{ token: "self-stretch", says: "stretch" },
		],
		fallback: "auto",
	},
	position: {
		property: "position",
		options: [
			{ token: "static", says: "static" },
			{ token: "relative", says: "relative" },
			{ token: "absolute", says: "absolute" },
			{ token: "fixed", says: "fixed" },
			{ token: "sticky", says: "sticky" },
		],
		fallback: "static",
	},
	overflow: {
		property: "overflow",
		options: [
			{ token: "overflow-visible", says: "visible" },
			{ token: "overflow-hidden", says: "hidden" },
			{ token: "overflow-auto", says: "auto" },
			{ token: "overflow-scroll", says: "scroll" },
			{ token: "overflow-clip", says: "clip" },
		],
		fallback: "visible",
	},
	"overflow-x": {
		property: "overflow-x",
		options: [
			{ token: "overflow-x-visible", says: "visible" },
			{ token: "overflow-x-hidden", says: "hidden" },
			{ token: "overflow-x-auto", says: "auto" },
			{ token: "overflow-x-scroll", says: "scroll" },
		],
		fallback: "visible",
	},
	"overflow-y": {
		property: "overflow-y",
		options: [
			{ token: "overflow-y-visible", says: "visible" },
			{ token: "overflow-y-hidden", says: "hidden" },
			{ token: "overflow-y-auto", says: "auto" },
			{ token: "overflow-y-scroll", says: "scroll" },
		],
		fallback: "visible",
	},
	"text-align": {
		property: "text-align",
		options: [
			{ token: "text-left", says: "left" },
			{ token: "text-center", says: "center" },
			{ token: "text-right", says: "right" },
			{ token: "text-justify", says: "justify" },
		],
		fallback: "left",
	},
	"text-transform": {
		property: "text-transform",
		options: [
			{ token: "uppercase", says: "uppercase" },
			{ token: "lowercase", says: "lowercase" },
			{ token: "capitalize", says: "capitalize" },
			{ token: "normal-case", says: "none" },
		],
		fallback: "none",
	},
	"text-decoration": {
		property: "text-decoration-line",
		options: [
			{ token: "underline", says: "underline" },
			{ token: "line-through", says: "line-through" },
			{ token: "overline", says: "overline" },
			{ token: "no-underline", says: "none" },
		],
		fallback: "none",
	},
	"font-style": {
		property: "font-style",
		options: [
			{ token: "italic", says: "italic" },
			{ token: "not-italic", says: "normal" },
		],
		fallback: "normal",
	},
	"white-space": {
		property: "white-space",
		options: [
			{ token: "whitespace-normal", says: "normal" },
			{ token: "whitespace-nowrap", says: "nowrap" },
			{ token: "whitespace-pre", says: "pre" },
			{ token: "whitespace-pre-line", says: "pre-line" },
			{ token: "whitespace-pre-wrap", says: "pre-wrap" },
		],
		fallback: "normal",
	},
	"object-fit": {
		property: "object-fit",
		options: [
			{ token: "object-contain", says: "contain" },
			{ token: "object-cover", says: "cover" },
			{ token: "object-fill", says: "fill" },
			{ token: "object-none", says: "none" },
		],
		fallback: "fill",
	},
	flex: {
		property: "flex",
		options: [
			{ token: "flex-1", says: "1" },
			{ token: "flex-auto", says: "auto" },
			{ token: "flex-initial", says: "initial" },
			{ token: "flex-none", says: "none" },
		],
		fallback: "0 1 auto",
	},
	truncate: {
		property: "text-overflow",
		options: [
			{ token: "truncate", says: "ellipsis, one line" },
			{ token: "text-ellipsis", says: "ellipsis" },
			{ token: "text-clip", says: "clip" },
		],
		fallback: "clip",
	},
};

/** The token this word family wears, or null when nothing under the scope sets it. */
export function wordOf(scoped: string, word: Word): string | null {
	const known = new Set(WORDS[word].options.map((option) => option.token));
	return splitClass(scoped).find((token) => known.has(anatomyOf(token).base)) ?? null;
}

/* ---------- size: hug, fill, fixed, the HTML way ---------- */

export type SizeMode = "hug" | "fill" | "fixed";

export const SIZE_MODES: readonly { mode: SizeMode; says: string }[] = [
	{ mode: "hug", says: "hug" },
	{ mode: "fill", says: "fill" },
	{ mode: "fixed", says: "fixed" },
];

/**
 * Which of the three an axis is in: hug is no token at all, fill is `w-full`,
 * and anything else is a fixed length. A height with no token under a `flex-1`
 * is filling too, because that is what the layout is doing to it.
 */
export function sizeModeOf(scoped: string, axis: "w" | "h"): SizeMode {
	const own = lengthOf(scoped, axis) ?? lengthOf(scoped, "size");
	if (own === null) return axis === "h" && wordOf(scoped, "flex") === "flex-1" ? "fill" : "hug";
	return own.value === "full" || own.value === "screen" ? "fill" : "fixed";
}

/* ---------- named tokens: chosen from the compiled theme ---------- */

/** The theme token this row wears: `text-md` off the `text` list, and so on. */
export function themeOf(
	scoped: string,
	list: ThemeList,
	prefix: string,
	theme: CompiledTheme | null,
): { token: string; name: string; value: string } | null {
	for (const token of splitClass(scoped)) {
		const base = anatomyOf(token).base;
		if (!base.startsWith(`${prefix}-`)) continue;
		const name = base.slice(prefix.length + 1);
		// a colour is never a size, and `text-` is both: the colour list decides
		if (list !== "colour" && knowsColour(theme, name)) continue;
		const held = themeValue(theme, list, name);
		if (held !== undefined) return { token: base, name, value: held.value };
		const bracket = /^\[(.+)\]$/.exec(name);
		if (bracket?.[1] !== undefined) return { token: base, name, value: bracket[1].replace(/_/g, " ") };
	}
	return null;
}
