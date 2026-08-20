/**
 * The properties surface's model: what an element is made of in source, what
 * the hands may write back, and why not.
 *
 * Every rule here is a spike verdict, not a guess. Resize writes the axis token
 * of a literal className (#13); spacing is a single-token splice on the owner,
 * with `gap` on the parent and mapped rows edited as one (#14); text edits in
 * place when the text is written in the file (#202). Everything that is not one
 * of those is a typed refusal, and the surface names it rather than hiding the
 * field.
 *
 * The cart in `spool-properties-cart.tsx` renders straight out of this table,
 * so an edit is real: the token changes, the element re-lays, the box is
 * measured again. Tokens are the pinned Tailwind v4 scale at 4px a step.
 */

export type Vocab = "tailwind" | "css";

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
		name: "screen",
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
		className: "flex h-12 shrink-0 items-center gap-3 px-4",
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
		id: "items",
		name: "items",
		tag: "div",
		line: 21,
		parent: "screen",
		display: "flex",
		className: "flex min-h-0 flex-1 flex-col gap-2 px-4 pt-2",
	},
	{
		id: "row",
		name: "row",
		tag: "div",
		line: 24,
		parent: "items",
		display: "flex",
		className: "flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5",
		mapped: 3,
	},
	{
		id: "name",
		name: "name",
		tag: "span",
		line: 27,
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
		line: 30,
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
		line: 36,
		parent: "screen",
		display: "flex",
		className: "flex shrink-0 flex-col gap-3 p-4",
	},
	{
		id: "total",
		name: "total",
		tag: "div",
		line: 37,
		parent: "footer",
		display: "flex",
		className: "flex items-baseline justify-between",
	},
	{
		id: "total-label",
		name: "label",
		tag: "span",
		line: 38,
		parent: "total",
		display: "inline",
		className: "text-base text-muted leading-base",
		text: { literal: "Totalt" },
	},
	{
		id: "total-sum",
		name: "sum",
		tag: "span",
		line: 39,
		parent: "total",
		display: "inline",
		className: "font-mono text-md leading-md",
		text: { literal: "126 kr" },
	},
	{
		id: "pay",
		name: "pay",
		tag: "button",
		line: 41,
		parent: "footer",
		display: "flex",
		className: "flex h-11 items-center justify-center rounded-md bg-thread",
	},
	{
		id: "pay-label",
		name: "label",
		tag: "span",
		line: 42,
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

/* ---------- the class literal, token by token ---------- */

export const STEP = 4;

/** every family the surface knows how to splice, longest first so `px` wins over `p` */
const FAMILIES = [
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
	"p",
	"mx",
	"my",
	"mt",
	"mr",
	"mb",
	"ml",
	"m",
	"w",
	"h",
] as const;

export type Family = (typeof FAMILIES)[number];

export function familyOf(token: string): Family | null {
	for (const family of FAMILIES) {
		if (token.startsWith(`${family}-`) && token.length > family.length + 1) return family;
	}
	return null;
}

/** the token on this family, `p-4`, or null when nothing sets it */
export function tokenOf(className: string | null, family: Family): string | null {
	if (className === null) return null;
	return className.split(/\s+/).find((token) => familyOf(token) === family) ?? null;
}

/** the value half of a token: `p-4` is `4`, `w-[347px]` is `[347px]` */
export function valueOf(token: string): string {
	const family = familyOf(token);
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
export function withToken(className: string | null, family: Family, value: string | null): string {
	const tokens = className === null ? [] : className.split(/\s+/).filter(Boolean);
	const index = tokens.findIndex((token) => familyOf(token) === family);
	const next = value === null ? null : `${family}-${value}`;
	if (index === -1) return next === null ? tokens.join(" ") : [...tokens, next].join(" ");
	if (next === null) return tokens.filter((_, at) => at !== index).join(" ");
	return tokens.map((token, at) => (at === index ? next : token)).join(" ");
}

/* ---------- what the hands may write ---------- */

export type Verdict = { ok: true; scope?: string } | { ok: false; reason: string };

/** the refusals every axis shares, said once */
function literalVerdict(element: SourceElement): Verdict {
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
	if (element.id === "screen") return { ok: false, reason: "the frame's size, in frame.json" };
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

/* ---------- the long tail: what the element computes to ---------- */

export interface TailRow {
	/** the CSS property, which is how the long tail is always named */
	prop: string;
	css: string;
	/** the class token that produces it, or what else does */
	from: string;
	/** the token's own value, for the Tailwind vocabulary */
	tw: string | null;
}

const TEXT_SIZE: Record<string, [string, string]> = {
	"text-2xs": ["10px", "12px"],
	"text-xs": ["11px", "16px"],
	"text-sm": ["12px", "18px"],
	"text-base": ["13px", "20px"],
	"text-md": ["14px", "22px"],
	"text-lg": ["18px", "26px"],
};

const COLORS: Record<string, string> = {
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

const RADIUS: Record<string, string> = {
	"rounded-xs": "4px",
	"rounded-sm": "6px",
	"rounded-md": "8px",
	"rounded-lg": "12px",
};

/**
 * Every property the element computes to, in stylesheet order, with where each
 * one comes from. Built from the literal when there is one and from what the
 * frame inherits when there is not, so a read-only row is still true.
 */
export function tailOf(element: SourceElement): readonly TailRow[] {
	const tokens = (element.className ?? expressionTokens(element.computed)).split(/\s+/).filter(Boolean);
	const has = (token: string) => tokens.includes(token);
	const find = (prefix: string) => tokens.find((token) => token.startsWith(prefix));
	const rows: TailRow[] = [];
	const row = (prop: string, css: string, from: string, tw: string | null = null) => rows.push({ prop, css, from, tw });

	// layout
	row("display", element.display === "inline" ? "inline" : element.display, has("flex") ? "flex" : "preflight", has("flex") ? "flex" : null);
	if (has("flex")) {
		row("flex-direction", has("flex-col") ? "column" : "row", has("flex-col") ? "flex-col" : "default", has("flex-col") ? "flex-col" : null);
		const align = has("items-center") ? "center" : has("items-baseline") ? "baseline" : "stretch";
		row("align-items", align, align === "stretch" ? "default" : `items-${align}`, align === "stretch" ? null : `items-${align}`);
		const justify = has("justify-center") ? "center" : has("justify-between") ? "space-between" : "flex-start";
		row("justify-content", justify, justify === "flex-start" ? "default" : has("justify-center") ? "justify-center" : "justify-between", justify === "flex-start" ? null : has("justify-center") ? "justify-center" : "justify-between");
	}
	if (has("flex-1")) row("flex", "1 1 0%", "flex-1", "flex-1");
	if (has("shrink-0")) row("flex-shrink", "0", "shrink-0", "shrink-0");
	if (has("min-h-0")) row("min-height", "0px", "min-h-0", "min-h-0");

	// typography, which every element has even when nothing sets it
	const mono = has("font-mono");
	row("font-family", mono ? "Fragment Mono" : "Familjen Grotesk", mono ? "font-mono" : "inherited from screen", mono ? "font-mono" : null);
	const size = find("text-") !== undefined ? tokens.find((token) => token in TEXT_SIZE) : undefined;
	const [fontSize, lineHeight] = size === undefined ? ["13px", "20px"] : (TEXT_SIZE[size] ?? ["13px", "20px"]);
	row("font-size", fontSize, size ?? "inherited from screen", size ?? null);
	const leading = find("leading-");
	row("line-height", lineHeight, leading ?? "inherited from screen", leading ?? null);
	const weight = has("font-medium") ? "500" : has("font-semibold") ? "600" : "400";
	row("font-weight", weight, weight === "400" ? "inherited from screen" : has("font-medium") ? "font-medium" : "font-semibold", weight === "400" ? null : has("font-medium") ? "font-medium" : "font-semibold");

	// colour
	const textColor = tokens.find((token) => token.startsWith("text-") && token.slice(5) in COLORS);
	row("color", textColor === undefined ? "#F0EFED" : (COLORS[textColor.slice(5)] ?? ""), textColor ?? "inherited from screen", textColor ?? null);
	const bg = tokens.find((token) => token.startsWith("bg-"));
	if (bg !== undefined) row("background-color", COLORS[bg.slice(3)] ?? bg, bg, bg);
	if (has("border")) {
		row("border-width", "1px", "border", "border");
		const borderColor = tokens.find((token) => token.startsWith("border-") && token.slice(7) in COLORS);
		row("border-color", borderColor === undefined ? "#262626" : (COLORS[borderColor.slice(7)] ?? ""), borderColor ?? "tokens.css", borderColor ?? null);
	}
	const radius = tokens.find((token) => token in RADIUS);
	if (radius !== undefined) row("border-radius", RADIUS[radius] ?? "", radius, radius);

	if (element.computed !== undefined) {
		row("color", "#8E8C88 or #F5391A", "item.sale ? text-thread : text-muted", null);
	}
	return rows;
}

/** the static half of a cn() call, so the tail can still be read off it */
function expressionTokens(computed: string | undefined): string {
	if (computed === undefined) return "";
	const literal = /cn\("([^"]*)"/.exec(computed);
	return literal?.[1] ?? "";
}

/* ---------- the vocabulary ---------- */

export interface Shown {
	/** what the field's label says */
	label: string;
	/** what the field holds */
	value: string;
	/** the unit the field implies, drawn faint after the value; Tailwind has none */
	unit: string | null;
}

const CSS_NAMES: Record<Family, string> = {
	w: "width",
	h: "height",
	p: "padding",
	px: "padding-x",
	py: "padding-y",
	pt: "padding-top",
	pr: "padding-right",
	pb: "padding-bottom",
	pl: "padding-left",
	gap: "gap",
	"gap-x": "column-gap",
	"gap-y": "row-gap",
	m: "margin",
	mx: "margin-x",
	my: "margin-y",
	mt: "margin-top",
	mr: "margin-right",
	mb: "margin-bottom",
	ml: "margin-left",
	"space-y": "row-gap",
	"space-x": "column-gap",
};

/**
 * One family, said in one vocabulary. Tailwind shows the token's own value and
 * the label is the class prefix; CSS shows pixels under the property's name and
 * the token is something the source line knows. `measured` stands in when the
 * class says nothing numeric, which is what a `full` or an absent token is.
 */
export function show(vocab: Vocab, family: Family, token: string | null, measured: number): Shown {
	if (vocab === "tailwind") {
		// nothing on the class: the measured box says what the layout decided, faintly
		const unit = token === null && measured > 0 ? `${Math.round(measured)}px` : null;
		return { label: family, value: token === null ? "–" : valueOf(token), unit };
	}
	const px = token === null ? null : valuePx(valueOf(token));
	return { label: CSS_NAMES[family], value: String(px ?? Math.round(measured)), unit: "px" };
}

/** what a typed value becomes on the class, in either vocabulary; null when it is not a value */
export function parse(vocab: Vocab, typed: string): string | null {
	const text = typed.trim();
	if (text === "") return null;
	if (vocab === "css") {
		const px = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(text);
		return px?.[1] === undefined ? null : pxValue(Number(px[1]));
	}
	if (/^\[\d+(?:\.\d+)?px\]$/.test(text)) return text;
	const px = /^(\d+(?:\.\d+)?)px$/.exec(text);
	if (px?.[1] !== undefined) return pxValue(Number(px[1]));
	if (/^\d+(?:\.\d+)?$/.test(text)) return text;
	if (text === "full" || text === "auto" || text === "px") return text;
	return null;
}

/** a step up or down on the arrow keys: a scale unit in Tailwind, a pixel in CSS */
export function nudge(vocab: Vocab, token: string | null, measured: number, direction: 1 | -1): string {
	const current = token === null ? measured : (valuePx(valueOf(token)) ?? measured);
	const step = vocab === "tailwind" ? STEP : 1;
	return pxValue(current + direction * step);
}
