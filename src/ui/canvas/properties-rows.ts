import type { PatchRefusal } from "../../daemon/hand-write";
import type { CompiledTheme } from "../api";
import {
	borderWidthsOf,
	borderWidthToken,
	type Corner,
	colourOf,
	colourToken,
	cornersOf,
	describe,
	FILTER_SET,
	type Gradient,
	gapOf,
	gradientOf,
	gradientShapeToken,
	insetOf,
	isGradientToken,
	type Kind,
	knockedOut,
	LENGTHS,
	lengthOf,
	NUMERIC_SET,
	radiusToken,
	SIZE_MODES,
	type Side,
	type SizeMode,
	SNAP_SET,
	scaleValue,
	sidesOf,
	sizeModeOf,
	type ToggleSet,
	themeOf,
	toggledOf,
	WORDS,
	type Word,
	wordOf,
} from "./properties-families";
import {
	arbitraryColourName,
	KEYWORD_COLOURS,
	type MenuOption,
	menuOf,
	saysOf,
	stepOf,
	type ThemeList,
} from "./properties-theme";

/**
 * Every row the rail draws, the primitive it uses and the rule it writes by
 * (#257).
 *
 * The inventory is the ticket's own: about 130 Tailwind class families, each
 * mapped to one primitive and one rule. A length is a number box, a word list
 * is a select, two or three words that are pictures are an icon pair, align
 * and justify together are the nine-dot grid, a yes-or-no is a chip, a colour
 * is a swatch with a name and an alpha, and what only reads is a plain value
 * with where it comes from. Nothing is left without one: a row with no control
 * reads as a bug, and a row that refuses with its reason teaches you the shape
 * of your own code.
 *
 * The rule is what the row does to the literal, and it is always the same
 * shape: a token, under a scope, handed to the write lane. The lane owns the
 * spelling that comes back — the fewest tokens, the logical sides kept, the
 * zero that drops at the base and overrides under a scope — so a row never
 * assembles a className itself.
 */

export type Section = "position" | "size" | "layout" | "appearance" | "fill" | "stroke" | "text" | "source";

/** The seven controls, and the reading that has none. */
export type Primitive = "number" | "select" | "icons" | "place" | "chip" | "colour" | "toggles" | "gradient" | "read";

/** What one row reads off the literal and writes back to it. */
export type Rule =
	| { kind: "length"; family: string; unit: Kind }
	| { kind: "word"; word: Word }
	| { kind: "colour"; prefix: string }
	| { kind: "theme"; list: ThemeList; prefix: string }
	| { kind: "radius"; corner: Corner | "all" }
	| { kind: "border-width"; edge: Side | "all" }
	| { kind: "toggles"; set: ToggleSet }
	| { kind: "gradient" }
	| { kind: "size-mode"; axis: "w" | "h" }
	| { kind: "read"; of: "className" | "where" };

/**
 * Whether a row takes a value typed straight in, and how it spells one.
 *
 * An arbitrary value is available wherever the compiler accepts one:
 * `bg-[#ff0044]`, `text-[15px]`, `rounded-[13px]`, `leading-[19px]`,
 * `border-[1.5px]`. A word from an enum and a chip in a toggle set have no
 * such spelling — there is no bracket form of `items-center` — so those refuse
 * with `no utility`, which is the same sentence the compiler gate gives.
 */
export type Arbitrary = { ok: true; spell: (typed: string) => string | null } | { ok: false; reason: string };

export const NO_UTILITY: Arbitrary = { ok: false, reason: "no utility" };

export interface Row {
	/** the CSS name on the left of the row */
	property: string;
	section: Section;
	primitive: Primitive;
	rule: Rule;
	arbitrary: Arbitrary;
}

/* ---------- the arbitrary spellings ---------- */

/** A bracketed value on a family: `w-[347px]`, `text-[15px]`, `leading-[19px]`. */
function bracketed(prefix: string): Arbitrary {
	return {
		ok: true,
		spell: (typed) => {
			const text = typed.trim().replace(/\s+/g, "_");
			if (text === "") return null;
			if (/^\[.+\]$/.test(text)) return `${prefix}-${text}`;
			const negative = text.startsWith("-");
			const rest = negative ? text.slice(1) : text;
			if (!/^[\w.%#(),/-]+$/.test(rest)) return null;
			return `${negative ? "-" : ""}${prefix}-[${rest}]`;
		},
	};
}

/** A colour typed straight in, which is the same field the menu lists names in. */
function arbitraryColourOn(prefix: string): Arbitrary {
	return {
		ok: true,
		spell: (typed) => {
			const name = arbitraryColourName(typed);
			return name === null ? null : `${prefix}-${name}`;
		},
	};
}

/* ---------- the lengths: every numeric family, one number box each ---------- */

/** Where each numeric family is drawn, and what the row is called. */
const LENGTH_ROWS: Readonly<Record<string, { property: string; section: Section }>> = {
	top: { property: "top", section: "position" },
	right: { property: "right", section: "position" },
	bottom: { property: "bottom", section: "position" },
	left: { property: "left", section: "position" },
	inset: { property: "inset", section: "position" },
	"inset-x": { property: "inset-inline", section: "position" },
	"inset-y": { property: "inset-block", section: "position" },
	start: { property: "inset-inline-start", section: "position" },
	end: { property: "inset-inline-end", section: "position" },
	z: { property: "z-index", section: "position" },
	w: { property: "width", section: "size" },
	h: { property: "height", section: "size" },
	size: { property: "width and height", section: "size" },
	"min-w": { property: "min-width", section: "size" },
	"max-w": { property: "max-width", section: "size" },
	"min-h": { property: "min-height", section: "size" },
	"max-h": { property: "max-height", section: "size" },
	basis: { property: "flex-basis", section: "size" },
	p: { property: "padding", section: "layout" },
	px: { property: "padding-inline", section: "layout" },
	py: { property: "padding-block", section: "layout" },
	pt: { property: "padding-top", section: "layout" },
	pr: { property: "padding-right", section: "layout" },
	pb: { property: "padding-bottom", section: "layout" },
	pl: { property: "padding-left", section: "layout" },
	ps: { property: "padding-inline-start", section: "layout" },
	pe: { property: "padding-inline-end", section: "layout" },
	m: { property: "margin", section: "layout" },
	mx: { property: "margin-inline", section: "layout" },
	my: { property: "margin-block", section: "layout" },
	mt: { property: "margin-top", section: "layout" },
	mr: { property: "margin-right", section: "layout" },
	mb: { property: "margin-bottom", section: "layout" },
	ml: { property: "margin-left", section: "layout" },
	ms: { property: "margin-inline-start", section: "layout" },
	me: { property: "margin-inline-end", section: "layout" },
	gap: { property: "gap", section: "layout" },
	"gap-x": { property: "column-gap", section: "layout" },
	"gap-y": { property: "row-gap", section: "layout" },
	"space-x": { property: "column-gap, between children", section: "layout" },
	"space-y": { property: "row-gap, between children", section: "layout" },
	"grid-cols": { property: "grid-template-columns", section: "layout" },
	"grid-rows": { property: "grid-template-rows", section: "layout" },
	"col-span": { property: "grid-column", section: "layout" },
	"row-span": { property: "grid-row", section: "layout" },
	"col-start": { property: "grid-column-start", section: "layout" },
	"row-start": { property: "grid-row-start", section: "layout" },
	columns: { property: "columns", section: "layout" },
	order: { property: "order", section: "layout" },
	opacity: { property: "opacity", section: "appearance" },
	scale: { property: "scale", section: "appearance" },
	"scale-x": { property: "scale-x", section: "appearance" },
	"scale-y": { property: "scale-y", section: "appearance" },
	rotate: { property: "rotate", section: "appearance" },
	"rotate-x": { property: "rotate-x", section: "appearance" },
	"rotate-y": { property: "rotate-y", section: "appearance" },
	skew: { property: "skew", section: "appearance" },
	"skew-x": { property: "skew-x", section: "appearance" },
	"skew-y": { property: "skew-y", section: "appearance" },
	translate: { property: "translate", section: "appearance" },
	"translate-x": { property: "translate-x", section: "appearance" },
	"translate-y": { property: "translate-y", section: "appearance" },
	brightness: { property: "brightness", section: "appearance" },
	contrast: { property: "contrast", section: "appearance" },
	saturate: { property: "saturate", section: "appearance" },
	"hue-rotate": { property: "hue-rotate", section: "appearance" },
	duration: { property: "transition-duration", section: "appearance" },
	delay: { property: "transition-delay", section: "appearance" },
	border: { property: "border-width", section: "stroke" },
	"border-t": { property: "border-top-width", section: "stroke" },
	"border-r": { property: "border-right-width", section: "stroke" },
	"border-b": { property: "border-bottom-width", section: "stroke" },
	"border-l": { property: "border-left-width", section: "stroke" },
	"border-x": { property: "border-inline-width", section: "stroke" },
	"border-y": { property: "border-block-width", section: "stroke" },
	"border-s": { property: "border-inline-start-width", section: "stroke" },
	"border-e": { property: "border-inline-end-width", section: "stroke" },
	outline: { property: "outline-width", section: "stroke" },
	"outline-offset": { property: "outline-offset", section: "stroke" },
	ring: { property: "ring-width", section: "stroke" },
	"ring-offset": { property: "ring-offset-width", section: "stroke" },
	stroke: { property: "stroke-width", section: "stroke" },
	indent: { property: "text-indent", section: "text" },
	decoration: { property: "text-decoration-thickness", section: "text" },
	"underline-offset": { property: "text-underline-offset", section: "text" },
	"line-clamp": { property: "-webkit-line-clamp", section: "text" },
};

/** The border widths fold to edges, so their rows carry the fold's own rule. */
const BORDER_EDGES: Readonly<Record<string, Side | "all">> = {
	border: "all",
	"border-t": "t",
	"border-r": "r",
	"border-b": "b",
	"border-l": "l",
	"border-s": "l",
	"border-e": "r",
};

function lengthRows(): Row[] {
	return Object.entries(LENGTH_ROWS).map(([family, where]) => {
		const edge = BORDER_EDGES[family];
		return {
			property: where.property,
			section: where.section,
			primitive: "number",
			rule:
				edge === undefined
					? { kind: "length", family, unit: LENGTHS[family] ?? "spacing" }
					: { kind: "border-width", edge },
			arbitrary: bracketed(family),
		};
	});
}

/* ---------- the words: a select, an icon pair, or the nine-dot grid ---------- */

/** Which control each word family uses, and where the rail draws it. */
const WORD_ROWS: Readonly<Record<Word, { primitive: Primitive; section: Section }>> = {
	display: { primitive: "select", section: "layout" },
	direction: { primitive: "icons", section: "layout" },
	wrap: { primitive: "chip", section: "layout" },
	align: { primitive: "place", section: "layout" },
	justify: { primitive: "place", section: "layout" },
	self: { primitive: "select", section: "layout" },
	position: { primitive: "select", section: "position" },
	overflow: { primitive: "select", section: "layout" },
	"overflow-x": { primitive: "select", section: "layout" },
	"overflow-y": { primitive: "select", section: "layout" },
	"text-align": { primitive: "icons", section: "text" },
	"text-transform": { primitive: "select", section: "text" },
	"text-decoration": { primitive: "select", section: "text" },
	"font-style": { primitive: "select", section: "text" },
	"white-space": { primitive: "select", section: "text" },
	"object-fit": { primitive: "select", section: "appearance" },
	flex: { primitive: "select", section: "size" },
	truncate: { primitive: "select", section: "text" },
};

function wordRows(): Row[] {
	return (Object.keys(WORDS) as Word[]).map((word) => ({
		property: WORDS[word].property,
		section: WORD_ROWS[word].section,
		primitive: WORD_ROWS[word].primitive,
		rule: { kind: "word", word },
		// a word is a word: there is no bracket spelling of `items-center`
		arbitrary: NO_UTILITY,
	}));
}

/* ---------- the colours: swatch, name, alpha ---------- */

const COLOUR_ROWS: readonly { prefix: string; property: string; section: Section }[] = [
	{ prefix: "bg", property: "background-color", section: "fill" },
	{ prefix: "text", property: "color", section: "text" },
	{ prefix: "border", property: "border-color", section: "stroke" },
	{ prefix: "border-t", property: "border-top-color", section: "stroke" },
	{ prefix: "border-r", property: "border-right-color", section: "stroke" },
	{ prefix: "border-b", property: "border-bottom-color", section: "stroke" },
	{ prefix: "border-l", property: "border-left-color", section: "stroke" },
	{ prefix: "border-x", property: "border-inline-color", section: "stroke" },
	{ prefix: "border-y", property: "border-block-color", section: "stroke" },
	{ prefix: "border-s", property: "border-inline-start-color", section: "stroke" },
	{ prefix: "border-e", property: "border-inline-end-color", section: "stroke" },
	{ prefix: "outline", property: "outline-color", section: "stroke" },
	{ prefix: "ring", property: "ring-color", section: "stroke" },
	{ prefix: "divide", property: "border-color, between children", section: "layout" },
	{ prefix: "decoration", property: "text-decoration-color", section: "text" },
	{ prefix: "placeholder", property: "placeholder color", section: "text" },
	{ prefix: "caret", property: "caret-color", section: "text" },
	{ prefix: "accent", property: "accent-color", section: "appearance" },
	{ prefix: "shadow", property: "box-shadow color", section: "appearance" },
	{ prefix: "fill", property: "fill", section: "fill" },
	{ prefix: "stroke", property: "stroke", section: "stroke" },
];

function colourRows(): Row[] {
	return COLOUR_ROWS.map((row) => ({
		property: row.property,
		section: row.section,
		primitive: "colour",
		rule: { kind: "colour", prefix: row.prefix },
		arbitrary: arbitraryColourOn(row.prefix),
	}));
}

/* ---------- the named tokens: chosen from the compiled theme ---------- */

const THEME_ROWS: readonly { list: ThemeList; prefix: string; property: string; section: Section }[] = [
	{ list: "font", prefix: "font", property: "font-family", section: "text" },
	{ list: "text", prefix: "text", property: "font-size", section: "text" },
	{ list: "weight", prefix: "font", property: "font-weight", section: "text" },
	{ list: "leading", prefix: "leading", property: "line-height", section: "text" },
	{ list: "tracking", prefix: "tracking", property: "letter-spacing", section: "text" },
	{ list: "shadow", prefix: "shadow", property: "box-shadow", section: "appearance" },
	{ list: "ease", prefix: "ease", property: "transition-timing-function", section: "appearance" },
];

function themeRows(): Row[] {
	return THEME_ROWS.map((row) => ({
		property: row.property,
		section: row.section,
		primitive: "select",
		rule: { kind: "theme", list: row.list, prefix: row.prefix },
		arbitrary: bracketed(row.prefix),
	}));
}

/* ---------- the folds, the sets, the gradient and what only reads ---------- */

const CORNER_ROWS: readonly { corner: Corner | "all"; property: string }[] = [
	{ corner: "all", property: "border-radius" },
	{ corner: "tl", property: "border-top-left-radius" },
	{ corner: "tr", property: "border-top-right-radius" },
	{ corner: "br", property: "border-bottom-right-radius" },
	{ corner: "bl", property: "border-bottom-left-radius" },
];

function otherRows(): Row[] {
	return [
		...CORNER_ROWS.map(
			(row): Row => ({
				property: row.property,
				section: "appearance",
				primitive: "select",
				rule: { kind: "radius", corner: row.corner },
				arbitrary: bracketed(row.corner === "all" ? "rounded" : `rounded-${row.corner}`),
			}),
		),
		...([NUMERIC_SET, FILTER_SET, SNAP_SET] as const).map(
			(set): Row => ({
				property: set.property,
				section: set === NUMERIC_SET ? "text" : set === FILTER_SET ? "appearance" : "layout",
				primitive: "toggles",
				rule: { kind: "toggles", set },
				// a chip is on or off: `blur-[3px]` is a class, but not one this row
				// can hold, so the row says so rather than pretending to take it
				arbitrary: NO_UTILITY,
			}),
		),
		{
			property: "background-image",
			section: "fill",
			primitive: "gradient",
			rule: { kind: "gradient" },
			arbitrary: NO_UTILITY,
		},
		...(["w", "h"] as const).map(
			(axis): Row => ({
				property: axis === "w" ? "width mode" : "height mode",
				section: "size",
				primitive: "select",
				rule: { kind: "size-mode", axis },
				arbitrary: NO_UTILITY,
			}),
		),
		{
			property: "className",
			section: "source",
			primitive: "read",
			rule: { kind: "read", of: "className" },
			arbitrary: NO_UTILITY,
		},
		{
			property: "written in",
			section: "source",
			primitive: "read",
			rule: { kind: "read", of: "where" },
			arbitrary: NO_UTILITY,
		},
	];
}

/** Every row, in Figma's section order, which is the order the rail draws them. */
export const ROWS: readonly Row[] = [...lengthRows(), ...wordRows(), ...colourRows(), ...themeRows(), ...otherRows()];

const BY_PROPERTY = new Map(ROWS.map((row) => [row.property, row]));

export function rowFor(property: string): Row | undefined {
	return BY_PROPERTY.get(property);
}

export const SECTIONS: readonly Section[] = [
	"position",
	"size",
	"layout",
	"appearance",
	"fill",
	"stroke",
	"text",
	"source",
];

export function rowsIn(section: Section): readonly Row[] {
	return ROWS.filter((row) => row.section === section);
}

/* ---------- what a row reads ---------- */

/** What the row shows: the token it found, its value, and the faint half. */
export interface Reading {
	/** the bare token under this scope, or null when nothing sets the property */
	token: string | null;
	/** the value half as written: `4`, `md`, `thread/50` */
	value: string | null;
	/** what it resolves to: `16px`, `14px`, `#F5391A` */
	says: string | null;
	/** for a colour row, the paint the swatch shows */
	paint?: string | null;
	/** for a toggle set, the chips that are on */
	on?: ReadonlySet<string>;
	/** for the gradient row, what the stops spell */
	gradient?: Gradient | null;
	/** for a size row, which of the three modes the axis is in */
	mode?: SizeMode;
}

/**
 * One row read off the tokens under the live scope.
 *
 * `scoped` is the literal's tokens under one variant chain with the prefixes
 * taken off, which is the same thing the write lane reads when it plans a
 * write — so what a row shows and what a write starts from are one reading.
 */
export function readRow(row: Row, scoped: string, theme: CompiledTheme | null): Reading {
	const step = stepOf(theme);
	switch (row.rule.kind) {
		case "length": {
			const held = lengthOf(scoped, row.rule.family);
			if (held === null) return { token: null, value: null, says: null };
			return {
				token: held.token,
				value: `${held.negative ? "-" : ""}${held.value}`,
				says: describe(held.kind, held.value, held.negative, step),
			};
		}
		case "border-width": {
			const edges = borderWidthsOf(scoped);
			const width = row.rule.edge === "all" ? edges.t : edges[row.rule.edge];
			if (width === null) return { token: null, value: null, says: null };
			return {
				token: borderWidthToken(row.rule.edge, width),
				value: width,
				says: describe("px", width, false, step),
			};
		}
		case "word": {
			const token = wordOf(scoped, row.rule.word);
			const option = WORDS[row.rule.word].options.find((candidate) => candidate.token === token);
			return { token, value: token, says: option?.says ?? WORDS[row.rule.word].fallback };
		}
		case "colour": {
			const colour = colourOf(scoped, row.rule.prefix, theme);
			return {
				token: colour.token,
				value:
					colour.name === null
						? null
						: colourToken(row.rule.prefix, colour.name, colour.alpha).slice(row.rule.prefix.length + 1),
				says: colour.paint,
				paint: colour.paint,
			};
		}
		case "theme": {
			const held = themeOf(scoped, row.rule.list, row.rule.prefix, theme);
			if (held === null) return { token: null, value: null, says: null };
			return { token: held.token, value: held.name, says: saysOf(held.value) };
		}
		case "radius": {
			const corners = cornersOf(scoped, theme);
			const name = row.rule.corner === "all" ? corners.tl : corners[row.rule.corner];
			if (name === null) return { token: null, value: null, says: null };
			const value = /^\[(.+)\]$/.exec(name)?.[1];
			return {
				token: radiusToken(row.rule.corner, name),
				value: name,
				says: value ?? saysOf(theme?.radius.find((token) => token.name === name)?.value ?? name),
			};
		}
		case "toggles": {
			const on = toggledOf(scoped, row.rule.set);
			return { token: null, value: on.size === 0 ? null : [...on].join(" "), says: null, on };
		}
		case "gradient": {
			const gradient = gradientOf(scoped, theme);
			return {
				token: gradient?.token ?? null,
				value: gradient === null ? null : gradient.shape,
				says: gradient === null ? "none" : gradient.shape,
				gradient,
			};
		}
		case "size-mode": {
			const mode = sizeModeOf(scoped, row.rule.axis);
			return { token: null, value: mode, says: SIZE_MODES.find((entry) => entry.mode === mode)?.says ?? mode, mode };
		}
		case "read":
			return { token: null, value: null, says: null };
	}
}

/**
 * What a menu row offers, which for a themed row is the compiled theme's own
 * list, and for a colour is that list plus the two words no theme carries.
 *
 * `transparent` and `current` are the utility's own words rather than theme
 * values, and `rounded-none` and `rounded-full` are the same: a menu built from
 * the theme alone would be missing the most reachable answers in it.
 */
export function optionsFor(row: Row, theme: CompiledTheme | null): MenuOption[] {
	switch (row.rule.kind) {
		case "theme":
			return menuOf(theme, row.rule.list, row.rule.prefix);
		case "colour": {
			const prefix = row.rule.prefix;
			return [
				...menuOf(theme, "colour", prefix),
				...KEYWORD_COLOURS.map(
					(colour): MenuOption => ({
						token: `${prefix}-${colour.name}`,
						name: colour.name,
						says: colour.paint,
						from: "default",
					}),
				),
			];
		}
		case "radius": {
			const prefix = row.rule.corner === "all" ? "rounded" : `rounded-${row.rule.corner}`;
			const keyword = (name: string, says: string): MenuOption => ({
				token: `${prefix}-${name}`,
				name,
				says,
				from: "default" as const,
			});
			return [keyword("none", "0"), ...menuOf(theme, "radius", prefix), keyword("full", "9999px")];
		}
		case "word":
			return WORDS[row.rule.word].options.map((option) => ({
				token: option.token,
				name: option.token,
				says: option.says,
				from: "default" as const,
			}));
		case "size-mode":
			return SIZE_MODES.map((entry) => ({
				token: entry.mode,
				name: entry.mode,
				says: entry.says,
				from: "default" as const,
			}));
		default:
			return [];
	}
}

/* ---------- what a row writes ---------- */

/** One token, and whether the row is putting it on or taking its family off. */
export interface RowEdit {
	token: string;
	remove?: true;
}

/** What a row is being set to; `null` takes the property away. */
export type RowValue =
	| { kind: "value"; value: string }
	| { kind: "colour"; name: string; alpha: number | null }
	| { kind: "toggle"; token: string; on: boolean }
	| { kind: "gradient"; gradient: Gradient | null }
	| { kind: "mode"; mode: SizeMode; measured: number }
	| null;

/** Where the write is happening: the tokens under the scope, and the theme. */
export interface At {
	scoped: string;
	theme: CompiledTheme | null;
}

/**
 * The edits one row's change comes to.
 *
 * Always tokens, never a rewritten literal: the lane folds `pt-4` back into
 * `p-4 pt-2` where that is the shortest true spelling, drops a base zero and
 * writes a scoped one, and keeps the logical sides a file was written with. A
 * row that means several tokens at once — a gradient, an exclusive chip —
 * hands over several, and they are applied in order against one literal.
 */
export function editsFor(row: Row, value: RowValue, at: At): RowEdit[] {
	const rule = row.rule;
	if (rule.kind === "read") return [];
	if (rule.kind === "toggles") {
		if (value === null) {
			return [...toggledOf(at.scoped, rule.set)].map((token) => ({ token, remove: true as const }));
		}
		if (value.kind !== "toggle") return [];
		if (!value.on) return [{ token: value.token, remove: true }];
		return [
			...knockedOut(rule.set, value.token).map((token) => ({ token, remove: true as const })),
			{ token: value.token },
		];
	}
	if (rule.kind === "gradient") {
		const gone = at.scoped
			.split(/\s+/)
			.filter((token) => token !== "" && isGradientToken(token, at.theme))
			.map((token) => ({ token, remove: true as const }));
		if (value === null || value.kind !== "gradient" || value.gradient === null) return gone;
		const gradient = value.gradient;
		const stops: RowEdit[] = [];
		for (const stop of gradient.stops) {
			if (stop.colour?.name != null)
				stops.push({ token: colourToken(stop.at, stop.colour.name, stop.colour.alpha) });
			if (stop.position !== null && stop.colour !== null) stops.push({ token: `${stop.at}-${stop.position}` });
		}
		return [...gone, { token: gradientShapeToken(gradient.shape, gradient.direction) }, ...stops];
	}
	if (rule.kind === "size-mode") {
		if (value === null) return [{ token: `${rule.axis}-0`, remove: true }];
		if (value.kind !== "mode") return [];
		if (value.mode === "hug") return [{ token: `${rule.axis}-0`, remove: true }];
		if (value.mode === "fill") return [{ token: `${rule.axis}-full` }];
		return [{ token: `${rule.axis}-${scaleValue(value.measured, stepOf(at.theme))}` }];
	}
	if (rule.kind === "colour") {
		if (value === null) return [{ token: removalToken(row, at), remove: true }];
		if (value.kind !== "colour") return [];
		return [{ token: colourToken(rule.prefix, value.name, value.alpha) }];
	}
	if (value === null) return [{ token: removalToken(row, at), remove: true }];
	if (value.kind !== "value") return [];
	switch (rule.kind) {
		case "length": {
			const negative = value.value.startsWith("-");
			return [{ token: `${negative ? "-" : ""}${rule.family}-${negative ? value.value.slice(1) : value.value}` }];
		}
		case "border-width":
			return [{ token: borderWidthToken(rule.edge, value.value) }];
		case "word":
			return [{ token: value.value }];
		case "theme":
			return [{ token: `${rule.prefix}-${value.value}` }];
		case "radius":
			return [{ token: radiusToken(rule.corner, value.value) }];
	}
}

/**
 * A token of this row's family, for the removal the lane reads a family off.
 *
 * `remove` takes away whatever the family sets under the scope, and it needs
 * one token to know which family that is. Anything of the family will do, so
 * this is the cheapest true one — a zero, a keyword, or whatever the row is
 * already wearing.
 */
export function removalToken(row: Row, at: At): string {
	const rule = row.rule;
	switch (rule.kind) {
		case "length":
			return `${rule.family}-0`;
		case "border-width":
			return borderWidthToken(rule.edge, "0");
		case "word":
			return readRow(row, at.scoped, at.theme).token ?? WORDS[rule.word].options[0]?.token ?? "";
		case "colour": {
			const held = readRow(row, at.scoped, at.theme).token;
			return held ?? `${rule.prefix}-current`;
		}
		case "theme": {
			const held = readRow(row, at.scoped, at.theme).token;
			const first = at.theme?.[rule.list][0]?.name;
			return held ?? `${rule.prefix}-${first ?? "none"}`;
		}
		case "radius":
			return radiusToken(rule.corner, "none");
		case "size-mode":
			return `${rule.axis}-0`;
		case "toggles":
			return rule.set.reset;
		case "gradient":
			return "bg-linear-to-r";
		case "read":
			return "";
	}
}

/** An arbitrary value typed into the row's own control, or why the row has none. */
export function unlinkTo(row: Row, typed: string): { ok: true; token: string } | { ok: false; reason: string } {
	if (!row.arbitrary.ok) return { ok: false, reason: row.arbitrary.reason };
	const token = row.arbitrary.spell(typed);
	return token === null ? { ok: false, reason: `no utility ${typed.trim()}` } : { ok: true, token };
}

/* ---------- the refusals, per element rather than per property ---------- */

export type Verdict = { ok: true; scope?: string } | { ok: false; reason: string };

/** What the canvas knows about the element a row is being drawn for. */
export interface RowElement {
	tag: string;
	/** the whole literal, every scope of it */
	className: string;
	/** the write lane's own answer, when it has one about this element */
	refusal?: PatchRefusal;
	/** the element sits inside a map: one literal, every rendered row */
	mapped?: boolean;
}

/** The tags that are inline until a class says otherwise. */
const INLINE_TAGS = new Set([
	"span",
	"a",
	"em",
	"strong",
	"b",
	"i",
	"u",
	"s",
	"small",
	"code",
	"kbd",
	"samp",
	"var",
	"abbr",
	"cite",
	"mark",
	"q",
	"sub",
	"sup",
	"time",
	"label",
	"bdi",
	"bdo",
]);

/**
 * What the element lays out as: the display token when it wears one, and the
 * tag's own default when it does not.
 *
 * It is a reading rather than a measurement on purpose. The refusals that turn
 * on it — a size on an inline element, padding on one — are about what the
 * file says, which is the only thing the rail edits.
 */
export function displayOf(element: RowElement, scoped: string): string {
	const token = wordOf(scoped, "display") ?? wordOf(element.className, "display");
	if (token !== null) return WORDS.display.options.find((option) => option.token === token)?.says ?? token;
	return INLINE_TAGS.has(element.tag.toLowerCase()) ? "inline" : "block";
}

/**
 * Whether this row may be written, and why not when it may not.
 *
 * The refusals are per element rather than per property: a className that is an
 * expression, a component defined in another file, an inline element with no
 * box to pad. A mapped element writes and says what it is writing to, which is
 * every row the map renders rather than the one under the pointer.
 */
export function verdictFor(row: Row, element: RowElement, scoped: string): Verdict {
	if (element.refusal !== undefined) return { ok: false, reason: element.refusal.says };
	if (row.rule.kind === "read") return { ok: true };
	const display = displayOf(element, scoped);
	const inline = display === "inline";
	// a width on an inline element is the text's to decide, but `flex-1` and
	// `flex-basis` are the parent's layout blockifying it, so those still write
	const length = row.rule.kind === "length" ? row.rule.family : null;
	if (inline && (row.rule.kind === "size-mode" || (length !== null && SIZE_FAMILIES.has(length)))) {
		return { ok: false, reason: "inline, the text decides" };
	}
	if (inline && length !== null && SPACING_FAMILIES.has(length)) {
		return { ok: false, reason: "inline, padding has no box" };
	}
	if (
		row.rule.kind === "length" &&
		(row.rule.family === "h" || row.rule.family === "min-h" || row.rule.family === "max-h") &&
		wordOf(scoped, "flex") === "flex-1"
	) {
		return { ok: false, reason: "flex-1, layout decides" };
	}
	// one literal, every rendered row: the write lands, and the row says so
	return element.mapped === true ? { ok: true, scope: "one row of many" } : { ok: true };
}

const SIZE_FAMILIES = new Set(["w", "h", "size", "min-w", "max-w", "min-h", "max-h"]);
const SPACING_FAMILIES = new Set(["p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe"]);

/* ---------- the folds a row group reads together ---------- */

/**
 * Padding and margin as four sides, the gap as two axes, the inset as four:
 * what a folded row group reads, re-exported here so a row and its fold come
 * from one place.
 */
export { gapOf, insetOf, sidesOf };
