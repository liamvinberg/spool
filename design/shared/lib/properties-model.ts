/**
 * The properties surface's model: what an element is made of in source, what
 * the hands may write back, and why not.
 *
 * One rule decides what writes: **numbers and words write, tokens wait.** A
 * number on the scale (`h-11`, `p-4`, `opacity-50`, `border-2`) and a word
 * from an enum (`flex`, `items-center`, `absolute`, `text-right`) are each one
 * token on a literal className, and swapping one token is the single-token
 * splice the spikes proved (#13, #14). A named token (`bg-thread`, `text-base`,
 * `rounded-md`, `font-medium`) is a value that lives in tokens.css, and editing
 * those is the designers-as-users fog on the map, so they read and do not
 * write in v1. Text writes when it is typed in the file (#202). Everything
 * else is a typed refusal, and the surface says why rather than hiding the row.
 *
 * The cart in `spool-properties-cart.tsx` renders straight out of this table,
 * so an edit is real: the token changes, the element re-lays, the box is
 * measured again. The scale is the pinned Tailwind v4 scale at 4px a step.
 */

export type Display = "flex" | "block" | "inline";

export interface SourceElement {
	id: string;
	/** what the surface calls it, which is the element's own word, never its tag */
	name: string;
	tag: string;
	/** the stamped line in frames/app/cart/frame.tsx */
	line: number;
	parent: string | null;
	display: Display;
	/** the literal, or null when the element carries no className at all */
	className: string | null;
	/** set when className is an expression; the text is what the file says */
	computed?: string;
	/** a component instance: the stamp points at the definition site */
	shared?: { file: string; line: number; frames: number };
	/** a mapped row: one source element, this many rendered */
	mapped?: number;
	text?: { literal: string } | { expr: string };
}

export const FILE = "frames/app/cart/frame.tsx";

/**
 * kaffe's cart, as the file stamps it. Three things are deliberately in here to
 * make the refusals real: a shared component instance, a mapped row, and one
 * className that is an expression.
 */
export const ELEMENTS: readonly SourceElement[] = [
	{
		id: "screen",
		name: "cart",
		tag: "div",
		line: 14,
		parent: null,
		display: "flex",
		className: "flex h-full w-full flex-col bg-bg",
	},
	{
		id: "header",
		name: "header",
		tag: "div",
		line: 16,
		parent: "screen",
		display: "flex",
		className: "flex h-12 shrink-0 items-center gap-3 border-b border-border px-4",
	},
	{
		id: "back",
		name: "back",
		tag: "IconButton",
		line: 17,
		parent: "header",
		display: "flex",
		className: null,
		shared: { file: "shared/ui/icon-button.tsx", line: 9, frames: 4 },
	},
	{
		id: "title",
		name: "title",
		tag: "span",
		line: 18,
		parent: "header",
		display: "inline",
		className: "font-medium text-base leading-base",
		text: { literal: "Din beställning" },
	},
	{
		id: "promo",
		name: "promo",
		tag: "div",
		line: 20,
		parent: "screen",
		display: "flex",
		className: "mx-4 mt-3 flex h-16 shrink-0 items-end rounded-lg bg-linear-to-br from-thread via-thread/70 to-raised p-3",
	},
	{
		id: "promo-label",
		name: "label",
		tag: "span",
		line: 21,
		parent: "promo",
		display: "inline",
		className: "font-medium text-sm text-on-thread leading-sm",
		text: { literal: "Kanelbulle på köpet över 120 kr" },
	},
	{
		id: "items",
		name: "items",
		tag: "div",
		line: 24,
		parent: "screen",
		display: "flex",
		className: "flex min-h-0 flex-1 flex-col gap-2 ps-4 pe-4 pt-3",
	},
	{
		id: "row",
		name: "row",
		tag: "div",
		line: 27,
		parent: "items",
		display: "flex",
		className: "flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5",
		mapped: 3,
	},
	{
		id: "name",
		name: "name",
		tag: "span",
		line: 30,
		parent: "row",
		display: "inline",
		className: "text-base leading-base",
		mapped: 3,
		text: { expr: "{item.label}" },
	},
	{
		id: "price",
		name: "price",
		tag: "span",
		line: 33,
		parent: "row",
		display: "inline",
		className: null,
		computed: 'cn("ml-auto font-mono text-sm leading-sm", item.sale ? "text-thread" : "text-muted")',
		mapped: 3,
		text: { expr: "{item.price}" },
	},
	{
		id: "footer",
		name: "footer",
		tag: "div",
		line: 39,
		parent: "screen",
		display: "flex",
		className: "flex shrink-0 flex-col gap-3 p-4",
	},
	{
		id: "total",
		name: "total",
		tag: "div",
		line: 40,
		parent: "footer",
		display: "flex",
		className: "flex items-baseline justify-between",
	},
	{
		id: "total-label",
		name: "label",
		tag: "span",
		line: 41,
		parent: "total",
		display: "inline",
		className: "text-base text-muted leading-base",
		text: { literal: "Totalt" },
	},
	{
		id: "total-sum",
		name: "sum",
		tag: "span",
		line: 42,
		parent: "total",
		display: "inline",
		className: "font-mono text-md leading-md tabular-nums",
		text: { literal: "126 kr" },
	},
	{
		id: "pay",
		name: "pay",
		tag: "button",
		line: 44,
		parent: "footer",
		display: "flex",
		className: "flex h-11 items-center justify-center rounded-md bg-thread transition-colors duration-150 hover:bg-thread/90 active:scale-[0.99] disabled:opacity-50",
	},
	{
		id: "pay-label",
		name: "label",
		tag: "span",
		line: 45,
		parent: "pay",
		display: "inline",
		className: "font-medium text-base text-on-thread leading-base",
		text: { literal: "Betala" },
	},
];

const BY_ID = new Map(ELEMENTS.map((element) => [element.id, element]));

export function elementOf(id: string): SourceElement | undefined {
	return BY_ID.get(id);
}

/** root first, the element last */
export function chainOf(id: string): readonly SourceElement[] {
	const chain: SourceElement[] = [];
	let cursor = elementOf(id);
	while (cursor !== undefined) {
		chain.unshift(cursor);
		cursor = cursor.parent === null ? undefined : elementOf(cursor.parent);
	}
	return chain;
}

export function childrenOf(id: string): readonly SourceElement[] {
	return ELEMENTS.filter((element) => element.parent === id);
}

/* ---------- numbers: one scale token on the literal ---------- */

export const STEP = 4;

/** every numeric family the surface writes, longest first so `px` wins over `p` and `gap-x` over `gap` */
const NUMERIC = [
	"space-y",
	"space-x",
	"gap-x",
	"gap-y",
	"gap",
	"px",
	"py",
	"pt",
	"pr",
	"pb",
	"pl",
	"ps",
	"pe",
	"p",
	"mx",
	"my",
	"mt",
	"mr",
	"mb",
	"ml",
	"ms",
	"me",
	"m",
	"min-w",
	"max-w",
	"min-h",
	"max-h",
	"w",
	"h",
	"top",
	"right",
	"bottom",
	"left",
	"inset-x",
	"inset-y",
	"inset",
	"opacity",
	"border",
	"grid-cols",
] as const;

export type Numeric = (typeof NUMERIC)[number];

export function numericOf(token: string): Numeric | null {
	for (const family of NUMERIC) {
		if (token.startsWith(`${family}-`) && token.length > family.length + 1) {
			// `border-border` is a colour, `border-2` a width: a width is a number or a bracket
			if (family === "border" && !/^border-(\d|\[)/.test(token)) return null;
			return family;
		}
	}
	return null;
}

export function tokens(className: string | null): string[] {
	return className === null ? [] : className.split(/\s+/).filter(Boolean);
}

/** the token on this family, `p-4`, or null when nothing sets it */
export function tokenOf(className: string | null, family: Numeric): string | null {
	return tokens(className).find((token) => numericOf(token) === family) ?? null;
}

/** the value half of a token: `p-4` is `4`, `w-[347px]` is `[347px]` */
export function valueOf(token: string): string {
	const family = numericOf(token);
	return family === null ? token : token.slice(family.length + 1);
}

/** what a scale value measures, or null when it is not a length: `full`, `auto` */
export function valuePx(value: string): number | null {
	const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(value);
	if (arbitrary?.[1] !== undefined) return Number(arbitrary[1]);
	if (value === "px") return 1;
	if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * STEP;
	return null;
}

/**
 * The spike's policy, not its capability (#13): a whole step gets the bare
 * class because it is what the author would have written; anything else stays
 * absolute, because the drag meant pixels.
 */
export function pxValue(px: number): string {
	const rounded = Math.max(0, Math.round(px));
	return rounded % STEP === 0 ? String(rounded / STEP) : `[${rounded}px]`;
}

/** replace the family's token in place, append when absent, drop on null */
export function withToken(className: string | null, family: Numeric, value: string | null): string {
	const list = tokens(className);
	const index = list.findIndex((token) => numericOf(token) === family);
	const next = value === null ? null : `${family}-${value}`;
	if (index === -1) return next === null ? list.join(" ") : [...list, next].join(" ");
	if (next === null) return list.filter((_, at) => at !== index).join(" ");
	return list.map((token, at) => (at === index ? next : token)).join(" ");
}

/** what a typed value becomes on the class: a scale number stays, pixels become the policy's token */
export function parse(typed: string): string | null {
	const text = typed.trim();
	if (text === "") return null;
	if (/^\[\d+(?:\.\d+)?px\]$/.test(text)) return text;
	const px = /^(\d+(?:\.\d+)?)px$/.exec(text);
	if (px?.[1] !== undefined) return pxValue(Number(px[1]));
	if (/^\d+(?:\.\d+)?$/.test(text)) return text;
	if (text === "full" || text === "auto" || text === "px" || text === "screen") return text;
	return null;
}

/** a step up or down on the arrow keys: one scale unit, 4px */
export function nudge(token: string | null, measured: number, direction: 1 | -1): string {
	const current = token === null ? measured : (valuePx(valueOf(token)) ?? measured);
	return pxValue(current + direction * STEP);
}

/* ---------- padding and gap: sides that fold and unfold ---------- */

export type Side = "t" | "r" | "b" | "l";

/**
 * Each side's value, read through p, px/py and the four sides, in that order
 * of specificity. The logical spellings read too: `ps-4` is the left side and
 * `pe-4` the right in this left-to-right document.
 */
export function paddingOf(className: string | null): Record<Side, string | null> {
	const all = tokenOf(className, "p");
	const x = tokenOf(className, "px");
	const y = tokenOf(className, "py");
	const side = (family: Numeric, logical: Numeric | null, axis: string | null): string | null => {
		const own = tokenOf(className, family) ?? (logical === null ? null : tokenOf(className, logical));
		return own !== null ? valueOf(own) : axis !== null ? valueOf(axis) : all !== null ? valueOf(all) : null;
	};
	return { t: side("pt", null, y), r: side("pr", "pe", x), b: side("pb", null, y), l: side("pl", "ps", x) };
}

/** a literal written in logical terms keeps them on the way back */
export function paddingIsLogical(className: string | null): boolean {
	return tokenOf(className, "ps") !== null || tokenOf(className, "pe") !== null;
}

/**
 * Write four sides back as the fewest tokens that say them: `p-4` when all
 * agree, `px-4 py-2` when opposite sides do, the sides themselves otherwise.
 * That is the spacing spike's shorthand split (`gap-4` into `gap-x gap-y`),
 * run in both directions.
 */
export function withPadding(className: string | null, sides: Record<Side, string | null>): string {
	const logical = paddingIsLogical(className);
	let next = className;
	for (const family of ["p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe"] as const) next = withToken(next, family, null);
	const { t, r, b, l } = sides;
	if (t === r && r === b && b === l) return withToken(next, "p", t);
	// three agree: the whole plus the one exception, `p-4 pt-2`, which sorts after it in the compiled order
	for (const [key, family] of [
		["t", "pt"],
		["r", logical ? "pe" : "pr"],
		["b", "pb"],
		["l", logical ? "ps" : "pl"],
	] as const) {
		const own = sides[key];
		const others = (["t", "r", "b", "l"] as const).filter((side) => side !== key).map((side) => sides[side]);
		const rest = others[0];
		if (rest !== null && rest !== undefined && others.every((value) => value === rest) && own !== rest) {
			next = withToken(next, "p", rest);
			return withToken(next, family, own ?? "0");
		}
	}
	if (t === b && l === r) {
		next = withToken(next, "px", l);
		return withToken(next, "py", t);
	}
	next = withToken(next, "pt", t);
	next = withToken(next, logical ? "pe" : "pr", r);
	next = withToken(next, "pb", b);
	return withToken(next, logical ? "ps" : "pl", l);
}

export function gapOf(className: string | null): { x: string | null; y: string | null } {
	const both = tokenOf(className, "gap");
	const x = tokenOf(className, "gap-x");
	const y = tokenOf(className, "gap-y");
	return {
		x: x !== null ? valueOf(x) : both !== null ? valueOf(both) : null,
		y: y !== null ? valueOf(y) : both !== null ? valueOf(both) : null,
	};
}

export function withGap(className: string | null, gap: { x: string | null; y: string | null }): string {
	let next = className;
	for (const family of ["gap", "gap-x", "gap-y"] as const) next = withToken(next, family, null);
	if (gap.x === gap.y) return withToken(next, "gap", gap.x);
	next = withToken(next, "gap-x", gap.x);
	return withToken(next, "gap-y", gap.y);
}

/* ---------- words: one enum token on the literal ---------- */

export type Word = "display" | "direction" | "wrap" | "align" | "justify" | "position" | "overflow" | "textAlign";

export interface WordFamily {
	/** token → what the surface calls it; the order is the control's order */
	options: readonly { token: string; says: string }[];
	/** what the property is when nothing sets it */
	fallback: string;
}

export const WORDS: Record<Word, WordFamily> = {
	display: {
		options: [
			{ token: "flex", says: "flex" },
			{ token: "grid", says: "grid" },
			{ token: "block", says: "block" },
			{ token: "inline-flex", says: "inline-flex" },
			{ token: "inline-block", says: "inline-block" },
			{ token: "hidden", says: "none" },
		],
		fallback: "inline",
	},
	direction: {
		options: [
			{ token: "flex-row", says: "row" },
			{ token: "flex-col", says: "column" },
		],
		fallback: "row",
	},
	wrap: {
		options: [
			{ token: "flex-wrap", says: "wrap" },
			{ token: "flex-nowrap", says: "nowrap" },
		],
		fallback: "nowrap",
	},
	align: {
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
	position: {
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
		options: [
			{ token: "overflow-visible", says: "visible" },
			{ token: "overflow-hidden", says: "hidden" },
			{ token: "overflow-auto", says: "auto" },
			{ token: "overflow-scroll", says: "scroll" },
		],
		fallback: "visible",
	},
	textAlign: {
		options: [
			{ token: "text-left", says: "left" },
			{ token: "text-center", says: "center" },
			{ token: "text-right", says: "right" },
		],
		fallback: "left",
	},
};

export function wordOf(className: string | null, word: Word): string | null {
	const list = tokens(className);
	return WORDS[word].options.find((option) => list.includes(option.token))?.token ?? null;
}

export function withWord(className: string | null, word: Word, token: string | null): string {
	const known = new Set(WORDS[word].options.map((option) => option.token));
	const list = tokens(className);
	const index = list.findIndex((candidate) => known.has(candidate));
	if (index === -1) return token === null ? list.join(" ") : [...list, token].join(" ");
	if (token === null) return list.filter((_, at) => at !== index).join(" ");
	return list.map((candidate, at) => (at === index ? token : candidate)).join(" ");
}

/* ---------- tokens: what the literal names and does not write ---------- */

export const COLORS: Record<string, string> = {
	bg: "#0E0E0E",
	canvas: "#161616",
	surface: "#1C1C1C",
	raised: "#282828",
	border: "#262626",
	"border-raised": "#363636",
	text: "#F0EFED",
	muted: "#8E8C88",
	thread: "#F5391A",
	"on-thread": "#FFFFFF",
};

const TEXT_SIZE: Record<string, { size: string; leading: string }> = {
	"text-2xs": { size: "10px", leading: "12px" },
	"text-xs": { size: "11px", leading: "16px" },
	"text-sm": { size: "12px", leading: "18px" },
	"text-base": { size: "13px", leading: "20px" },
	"text-md": { size: "14px", leading: "22px" },
	"text-lg": { size: "18px", leading: "26px" },
};

const LEADING: Record<string, string> = {
	"leading-xs": "16px",
	"leading-sm": "18px",
	"leading-base": "20px",
	"leading-md": "22px",
	"leading-lg": "26px",
};

const RADIUS: Record<string, string> = {
	"rounded-xs": "4px",
	"rounded-sm": "6px",
	"rounded-md": "8px",
	"rounded-lg": "12px",
	"rounded-full": "9999px",
};

/** a named token the element wears, its value, and where the value comes from */
export interface Named {
	token: string | null;
	value: string;
	/** the token's own name, or what else decided the value */
	from: string;
}

function named(list: readonly string[], table: Record<string, string>, fallback: string, inherits: string): Named {
	const token = list.find((candidate) => candidate in table) ?? null;
	return token === null
		? { token: null, value: fallback, from: inherits }
		: { token, value: table[token] ?? "", from: token };
}

/** the static half of a cn() call, so the tokens can still be read off it */
export function staticTokens(element: SourceElement, className: string | null): string[] {
	if (element.computed === undefined) return tokens(className);
	const literal = /cn\("([^"]*)"/.exec(element.computed);
	return tokens(literal?.[1] ?? "");
}

export function colorOf(list: readonly string[], prefix: "text" | "bg" | "border"): Named {
	const token = list.find((candidate) => candidate.startsWith(`${prefix}-`) && candidate.slice(prefix.length + 1) in COLORS) ?? null;
	if (token === null) {
		if (prefix === "text") return { token: null, value: COLORS.text ?? "", from: "inherited" };
		if (prefix === "border") return { token: null, value: COLORS.border ?? "", from: "tokens.css" };
		return { token: null, value: "", from: "none" };
	}
	return { token, value: COLORS[token.slice(prefix.length + 1)] ?? "", from: token };
}

export interface Type {
	family: Named;
	size: Named;
	weight: Named;
	leading: Named;
	tracking: Named;
}

export function typeOf(list: readonly string[]): Type {
	const mono = list.includes("font-mono");
	const size = list.find((candidate) => candidate in TEXT_SIZE) ?? null;
	const sizeRow = size === null ? undefined : TEXT_SIZE[size];
	const leading = named(list, LEADING, sizeRow?.leading ?? "20px", size === null ? "inherited" : `${size} sets it`);
	const weight = list.includes("font-semibold")
		? { token: "font-semibold", value: "600", from: "font-semibold" }
		: list.includes("font-medium")
			? { token: "font-medium", value: "500", from: "font-medium" }
			: { token: null, value: "400", from: "inherited" };
	const tracking = list.includes("tracking-tight")
		? { token: "tracking-tight", value: "-0.01em", from: "tracking-tight" }
		: { token: null, value: "0", from: "inherited" };
	return {
		family: mono
			? { token: "font-mono", value: "Fragment Mono", from: "font-mono" }
			: { token: null, value: "Familjen Grotesk", from: "inherited" },
		size: size === null ? { token: null, value: "13px", from: "inherited" } : { token: size, value: sizeRow?.size ?? "", from: size },
		weight,
		leading,
		tracking,
	};
}

export function radiusOf(list: readonly string[]): Named {
	return named(list, RADIUS, "0", "none");
}

export function shadowOf(list: readonly string[]): Named {
	const token = list.find((candidate) => candidate === "shadow" || candidate.startsWith("shadow-")) ?? null;
	return token === null ? { token: null, value: "none", from: "none" } : { token, value: token, from: token };
}

/* ---------- what the hands may write ---------- */

export type Verdict = { ok: true; scope?: string } | { ok: false; reason: string };

/** the refusals every axis shares, said once */
export function literalVerdict(element: SourceElement): Verdict {
	if (element.shared !== undefined) {
		return {
			ok: false,
			reason: `defined in ${element.shared.file}:${element.shared.line}, rendered by ${element.shared.frames} frames`,
		};
	}
	if (element.computed !== undefined) return { ok: false, reason: "className is an expression" };
	return element.mapped === undefined ? { ok: true } : { ok: true, scope: `all ${element.mapped} rows` };
}

export function sizeVerdict(element: SourceElement, axis: "w" | "h"): Verdict {
	const literal = literalVerdict(element);
	if (!literal.ok) return literal;
	if (element.id === "screen") return { ok: true, scope: "frame.json" };
	if (element.display === "inline") return { ok: false, reason: "inline, the text decides" };
	if (axis === "h" && element.className?.includes("flex-1")) return { ok: false, reason: "flex-1, layout decides" };
	return literal;
}

export function spacingVerdict(element: SourceElement): Verdict {
	const literal = literalVerdict(element);
	if (!literal.ok) return literal;
	if (element.display === "inline") return { ok: false, reason: "inline, padding has no box" };
	return literal;
}

/** every word is writable on a literal */
export function wordVerdict(element: SourceElement): Verdict {
	return literalVerdict(element);
}

/** a named token reads and waits; the reason is the map's, not the element's */
export const TOKEN_WAITS = "tokens read only in v1";

export function textVerdict(element: SourceElement): Verdict {
	if (element.text === undefined) return { ok: false, reason: "no text of its own" };
	if (element.shared !== undefined) return { ok: false, reason: `a prop of ${element.shared.file}` };
	if ("expr" in element.text) {
		return {
			ok: false,
			reason: element.mapped === undefined ? "an expression" : `mapped from ITEMS, ${element.text.expr}`,
		};
	}
	return element.mapped === undefined ? { ok: true } : { ok: true, scope: `all ${element.mapped} rows` };
}

/* ---------- size modes: hug, fill, fixed, the HTML way ---------- */

export type SizeMode = "hug" | "fill" | "fixed";

export function sizeModeOf(className: string | null, axis: "w" | "h"): SizeMode {
	const token = tokenOf(className, axis);
	if (token === null) return className?.includes("flex-1") === true && axis === "h" ? "fill" : "hug";
	const value = valueOf(token);
	if (value === "full" || value === "screen") return "fill";
	return "fixed";
}

/** mode back to the class: hug drops the token, fill writes `full`, fixed pins the measured box */
export function withSizeMode(className: string | null, axis: "w" | "h", mode: SizeMode, measured: number): string {
	if (mode === "hug") return withToken(className, axis, null);
	if (mode === "fill") return withToken(className, axis, "full");
	return withToken(className, axis, pxValue(measured));
}
