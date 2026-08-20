/**
 * The literal, read as a panel. Every token on a className is sorted into one
 * Tailwind family, given the CSS it stands for, and handed the one primitive
 * that edits it: a number field, a word menu, a token menu. No token is
 * translated into a friendlier word. The token is the label.
 *
 * `properties-model.ts` already owns the splice (`withToken`, `withWord`) and
 * the scale. This file owns what the model does not export: the type and
 * radius tables behind the token menus, the CSS each token means, and the
 * catalog the `+` offers.
 */

import { COLORS, type Numeric, numericOf, valueOf, valuePx, type Word, WORDS } from "../../../shared/lib/properties-model";

export type Group = "layout" | "sizing" | "spacing" | "typography" | "background" | "border" | "effects";

/** CSS order, top to bottom */
export const GROUPS: readonly Group[] = ["layout", "sizing", "spacing", "typography", "background", "border", "effects"];

export type Kind = "number" | "word" | "named" | "plain";

export interface Chip {
	token: string;
	group: Group;
	kind: Kind;
	/** what the splice replaces: a numeric family, a Word key, a picker name */
	family: string;
	/** the half a number field edits, `11` of `h-11` */
	value: string;
	/** the CSS the token means, faint beside it */
	css: string;
	/** the colour a swatch draws, when the token names one */
	swatch: string | null;
}

/* ---------- the tables the model keeps to itself ---------- */

export const TEXT_SIZE: Record<string, string> = {
	"text-2xs": "10px",
	"text-xs": "11px",
	"text-sm": "12px",
	"text-base": "13px",
	"text-md": "14px",
	"text-lg": "18px",
};

export const LEADING: Record<string, string> = {
	"leading-xs": "16px",
	"leading-sm": "18px",
	"leading-base": "20px",
	"leading-md": "22px",
	"leading-lg": "26px",
};

export const RADIUS: Record<string, string> = {
	"rounded-xs": "4px",
	"rounded-sm": "6px",
	"rounded-md": "8px",
	"rounded-lg": "12px",
	"rounded-full": "9999px",
};

export const WEIGHT: Record<string, string> = {
	"font-normal": "400",
	"font-medium": "500",
	"font-semibold": "600",
};

export const FAMILY: Record<string, string> = {
	"font-sans": "Familjen Grotesk",
	"font-mono": "Fragment Mono",
};

export const TRACKING: Record<string, string> = {
	"tracking-tight": "-0.01em",
	"tracking-normal": "0em",
};

/* ---------- pickers: a named token comes off a list, never off prose ---------- */

export type Picker = "font-family" | "font-weight" | "text-size" | "leading" | "tracking" | "text-color" | "bg-color" | "border-color" | "radius";

export interface Option {
	token: string;
	css: string;
	swatch: string | null;
}

function colorOptions(prefix: string): Option[] {
	return Object.entries(COLORS).map(([name, hex]) => ({ token: `${prefix}-${name}`, css: hex, swatch: hex }));
}

function tableOptions(table: Record<string, string>): Option[] {
	return Object.entries(table).map(([token, css]) => ({ token, css, swatch: null }));
}

export const PICKERS: Record<Picker, Option[]> = {
	"font-family": tableOptions(FAMILY),
	"font-weight": tableOptions(WEIGHT),
	"text-size": tableOptions(TEXT_SIZE),
	leading: tableOptions(LEADING),
	tracking: tableOptions(TRACKING),
	"text-color": colorOptions("text"),
	"bg-color": colorOptions("bg"),
	"border-color": colorOptions("border"),
	radius: tableOptions(RADIUS),
};

const PICKER_GROUP: Record<Picker, Group> = {
	"font-family": "typography",
	"font-weight": "typography",
	"text-size": "typography",
	leading: "typography",
	tracking: "typography",
	"text-color": "typography",
	"bg-color": "background",
	"border-color": "border",
	radius: "border",
};

export function pickerOf(token: string): Picker | null {
	if (token in FAMILY) return "font-family";
	if (token in WEIGHT) return "font-weight";
	if (token in TEXT_SIZE) return "text-size";
	if (token in LEADING) return "leading";
	if (token in TRACKING) return "tracking";
	if (token in RADIUS) return "radius";
	for (const [prefix, picker] of [
		["text", "text-color"],
		["bg", "bg-color"],
		["border", "border-color"],
	] as const) {
		if (token.startsWith(`${prefix}-`) && token.slice(prefix.length + 1) in COLORS) return picker;
	}
	return null;
}

/* ---------- words ---------- */

const WORD_OF_TOKEN = new Map<string, Word>();
for (const key of Object.keys(WORDS) as Word[]) {
	for (const option of WORDS[key].options) WORD_OF_TOKEN.set(option.token, key);
}

const WORD_GROUP: Record<Word, Group> = {
	display: "layout",
	direction: "layout",
	wrap: "layout",
	align: "layout",
	justify: "layout",
	position: "layout",
	overflow: "layout",
	textAlign: "typography",
};

/** the CSS a word token stands for, property and value */
const WORD_CSS: Record<string, readonly [string, string]> = {
	flex: ["display", "flex"],
	grid: ["display", "grid"],
	block: ["display", "block"],
	"inline-flex": ["display", "inline-flex"],
	"inline-block": ["display", "inline-block"],
	hidden: ["display", "none"],
	"flex-row": ["flex-direction", "row"],
	"flex-col": ["flex-direction", "column"],
	"flex-wrap": ["flex-wrap", "wrap"],
	"flex-nowrap": ["flex-wrap", "nowrap"],
	"items-start": ["align-items", "flex-start"],
	"items-center": ["align-items", "center"],
	"items-end": ["align-items", "flex-end"],
	"items-baseline": ["align-items", "baseline"],
	"items-stretch": ["align-items", "stretch"],
	"justify-start": ["justify-content", "flex-start"],
	"justify-center": ["justify-content", "center"],
	"justify-end": ["justify-content", "flex-end"],
	"justify-between": ["justify-content", "space-between"],
	"justify-around": ["justify-content", "space-around"],
	"justify-evenly": ["justify-content", "space-evenly"],
	static: ["position", "static"],
	relative: ["position", "relative"],
	absolute: ["position", "absolute"],
	fixed: ["position", "fixed"],
	sticky: ["position", "sticky"],
	"overflow-visible": ["overflow", "visible"],
	"overflow-hidden": ["overflow", "hidden"],
	"overflow-auto": ["overflow", "auto"],
	"overflow-scroll": ["overflow", "scroll"],
	"text-left": ["text-align", "left"],
	"text-center": ["text-align", "center"],
	"text-right": ["text-align", "right"],
};

/** the rest: real classes with no menu behind them, still shown, still removable */
const PLAIN_CSS: Record<string, readonly [string, string]> = {
	"flex-1": ["flex", "1 1 0%"],
	"flex-auto": ["flex", "1 1 auto"],
	"flex-none": ["flex", "none"],
	"shrink-0": ["flex-shrink", "0"],
	shrink: ["flex-shrink", "1"],
	"grow-0": ["flex-grow", "0"],
	grow: ["flex-grow", "1"],
	truncate: ["overflow", "hidden"],
	border: ["border-width", "1px"],
	uppercase: ["text-transform", "uppercase"],
};

const PLAIN_GROUP: Record<string, Group> = {
	border: "border",
	truncate: "typography",
	uppercase: "typography",
};

/** the declaration when it fits the rail, the value alone when it does not */
function says(prop: string, value: string): string {
	const full = `${prop}: ${value}`;
	return full.length <= 22 ? full : value;
}

/* ---------- numbers ---------- */

const NUMERIC_GROUP: Record<string, Group> = {
	w: "sizing",
	h: "sizing",
	"min-w": "sizing",
	"max-w": "sizing",
	"min-h": "sizing",
	"max-h": "sizing",
	opacity: "effects",
	border: "border",
	"grid-cols": "layout",
	top: "layout",
	right: "layout",
	bottom: "layout",
	left: "layout",
	inset: "layout",
};

function numberGroup(family: Numeric): Group {
	return NUMERIC_GROUP[family] ?? "spacing";
}

export function numberCss(family: string, value: string): string {
	if (family === "opacity") return `${value}%`;
	if (family === "grid-cols") return value;
	if (value === "full") return "100%";
	if (value === "auto") return "auto";
	if (value === "screen") return family === "w" ? "100vw" : "100vh";
	const px = valuePx(value);
	return px === null ? value : `${px}px`;
}

/** a step on the arrows: pixels on the scale, percent on opacity, one on a count */
export function step(family: string, value: string, measured: number | null, direction: 1 | -1, big: boolean): string {
	if (family === "opacity") {
		const current = Number.parseFloat(value);
		const next = (Number.isNaN(current) ? 100 : current) + direction * (big ? 10 : 5);
		return String(Math.min(100, Math.max(0, next)));
	}
	if (family === "border" || family === "grid-cols") {
		const current = Number.parseFloat(value);
		const next = (Number.isNaN(current) ? 1 : current) + direction;
		return String(Math.max(0, next));
	}
	const px = valuePx(value) ?? measured ?? 0;
	const next = Math.max(0, Math.round(px + direction * (big ? 40 : 4)));
	return next % 4 === 0 ? String(next / 4) : `[${next}px]`;
}

/* ---------- one token, read ---------- */

export function chipOf(token: string): Chip {
	const family = numericOf(token);
	if (family !== null) {
		const value = valueOf(token);
		return { token, group: numberGroup(family), kind: "number", family, value, css: numberCss(family, value), swatch: null };
	}
	const word = WORD_OF_TOKEN.get(token);
	if (word !== undefined) {
		const css = WORD_CSS[token];
		return {
			token,
			group: WORD_GROUP[word],
			kind: "word",
			family: word,
			value: "",
			css: css === undefined ? "" : says(css[0], css[1]),
			swatch: null,
		};
	}
	const picker = pickerOf(token);
	if (picker !== null) {
		const option = PICKERS[picker].find((candidate) => candidate.token === token);
		return {
			token,
			group: PICKER_GROUP[picker],
			kind: "named",
			family: picker,
			value: "",
			css: option?.css ?? "",
			swatch: option?.swatch ?? null,
		};
	}
	const plain = PLAIN_CSS[token];
	return {
		token,
		group: PLAIN_GROUP[token] ?? "layout",
		kind: "plain",
		family: token,
		value: "",
		css: plain === undefined ? "" : says(plain[0], plain[1]),
		swatch: null,
	};
}

export function chipsOf(className: string | null): Chip[] {
	return (className ?? "")
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => chipOf(token));
}

/** the literal's own order inside each family, families in CSS order */
export function byGroup(chips: readonly Chip[]): { group: Group; chips: Chip[] }[] {
	return GROUPS.map((group) => ({ group, chips: chips.filter((chip) => chip.group === group) })).filter((row) => row.chips.length > 0);
}

/* ---------- splicing a named token ---------- */

export function withNamed(className: string | null, picker: Picker, token: string | null): string {
	const list = (className ?? "").split(/\s+/).filter(Boolean);
	const index = list.findIndex((candidate) => pickerOf(candidate) === picker);
	if (index === -1) return token === null ? list.join(" ") : [...list, token].join(" ");
	if (token === null) return list.filter((_, at) => at !== index).join(" ");
	return list.map((candidate, at) => (at === index ? token : candidate)).join(" ");
}

export function withoutToken(className: string | null, token: string): string {
	const list = (className ?? "").split(/\s+/).filter(Boolean);
	const index = list.indexOf(token);
	return (index === -1 ? list : list.filter((_, at) => at !== index)).join(" ");
}

/** a raw token typed into the `+`: it lands only if this file can read it */
export function readable(token: string): boolean {
	if (!/^[a-z][a-z0-9-]*(-\[[^\s\]]+\])?$/.test(token)) return false;
	if (numericOf(token) !== null) return true;
	if (WORD_OF_TOKEN.has(token)) return true;
	if (pickerOf(token) !== null) return true;
	return token in PLAIN_CSS;
}

/* ---------- what the `+` offers ---------- */

export interface Candidate {
	token: string;
	group: Group;
	css: string;
	swatch: string | null;
	/** open the number field on the token the moment it lands */
	edit: boolean;
}

function candidate(token: string, edit = false): Candidate {
	const chip = chipOf(token);
	return { token, group: chip.group, css: chip.css, swatch: chip.swatch, edit };
}

const NUMBER_SEEDS: readonly (readonly [string, boolean])[] = [
	["w-full", false],
	["h-full", false],
	["w-40", true],
	["h-10", true],
	["min-h-0", false],
	["max-w-full", false],
	["p-4", true],
	["px-4", true],
	["py-4", true],
	["gap-2", true],
	["ml-auto", false],
	["mt-2", true],
	["border-2", true],
	["opacity-50", true],
	["top-0", true],
	["left-0", true],
];

export const CANDIDATES: readonly Candidate[] = [
	...(Object.keys(WORDS) as Word[]).flatMap((word) => WORDS[word].options.map((option) => candidate(option.token))),
	...NUMBER_SEEDS.map(([token, edit]) => candidate(token, edit)),
	...(["text-size", "font-weight", "font-family", "leading", "tracking", "radius", "text-color", "bg-color", "border-color"] as const).flatMap(
		(picker) => PICKERS[picker].map((option) => candidate(option.token)),
	),
	candidate("flex-1"),
	candidate("shrink-0"),
	candidate("truncate"),
	candidate("border"),
];
