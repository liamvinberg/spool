/**
 * The seven primitives the inventory (spool-cloud#19) found missing, as model:
 * what a token is made of once variants, signs and `!` are on it, and how each
 * family reads and writes through that.
 *
 * `properties-model.ts` is the base and stays the rule: numbers and words are
 * single-token splices on a literal className. This file widens what a token
 * can be (P1 a variant prefix, P2 an alpha suffix, P3 a gradient's several
 * tokens, P4 a set of them, P5 anything the compiler accepts, P6 a sign, a
 * fraction, a unit, P7 a corner or an edge) and keeps every write the same
 * shape: the fewest tokens that say it, spliced in place on the literal.
 *
 * Two readings the inventory found wrong are fixed here: menus read the
 * compiled theme (tokens.css first, Tailwind's defaults after it, marked), and
 * the folds read logical spellings (`ps-`, `inset-x-`, `border-s-`,
 * `rounded-ss-`) as the sides they resolve to.
 *
 * `cssOf` at the foot is the compiler gate made literal: a token compiles or it
 * does not, and a token that compiles carries its declarations, which is also
 * how the mock cart re-lays on classes the served stylesheet never saw.
 */

import { COLORS, pxValue, STEP, valuePx } from "./properties-model";
import { PALETTE, PALETTE_SINGLES } from "./properties-palette";

/* ---------- anatomy: `md:hover:-mt-2!` is four things ---------- */

export interface Anatomy {
	variants: readonly string[];
	negative: boolean;
	base: string;
	important: boolean;
}

export function anatomyOf(token: string): Anatomy {
	let rest = token;
	const important = rest.endsWith("!");
	if (important) rest = rest.slice(0, -1);
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const ch of rest) {
		if (ch === "[" || ch === "(") depth += 1;
		if (ch === "]" || ch === ")") depth -= 1;
		if (ch === ":" && depth === 0) {
			parts.push(current);
			current = "";
		} else current += ch;
	}
	let base = current;
	const negative = base.startsWith("-");
	if (negative) base = base.slice(1);
	return { variants: parts, negative, base, important };
}

export function compose(anatomy: Anatomy): string {
	return `${anatomy.variants.map((v) => `${v}:`).join("")}${anatomy.negative ? "-" : ""}${anatomy.base}${anatomy.important ? "!" : ""}`;
}

export function split(className: string | null): string[] {
	return className === null ? [] : className.split(/\s+/).filter(Boolean);
}

/* ---------- P1: variants, the scope every other write happens under ---------- */

export type VariantGroup = "state" | "screen" | "theme";

export interface Variant {
	prefix: string;
	group: VariantGroup;
	/** what the document needs for it to apply: a pseudo-class, a media query */
	when: string;
}

export const VARIANTS: readonly Variant[] = [
	{ prefix: "hover", group: "state", when: ":hover" },
	{ prefix: "focus", group: "state", when: ":focus" },
	{ prefix: "focus-visible", group: "state", when: ":focus-visible" },
	{ prefix: "active", group: "state", when: ":active" },
	{ prefix: "disabled", group: "state", when: ":disabled" },
	{ prefix: "sm", group: "screen", when: "@media (width >= 40rem)" },
	{ prefix: "md", group: "screen", when: "@media (width >= 48rem)" },
	{ prefix: "lg", group: "screen", when: "@media (width >= 64rem)" },
	{ prefix: "xl", group: "screen", when: "@media (width >= 80rem)" },
	{ prefix: "app", group: "screen", when: "@media (width >= 1280px)" },
	{ prefix: "dark", group: "theme", when: "@media (prefers-color-scheme: dark)" },
];

const VARIANT_BY_PREFIX = new Map(VARIANTS.map((variant) => [variant.prefix, variant]));

export function variantOf(prefix: string): Variant | undefined {
	return VARIANT_BY_PREFIX.get(prefix);
}

/** a scope is the variant chain a token sits under; `[]` is the base */
export type Scope = readonly string[];

export function sameScope(a: Scope, b: Scope): boolean {
	return a.length === b.length && a.every((prefix, index) => prefix === b[index]);
}

export function scopeKey(scope: Scope): string {
	return scope.length === 0 ? "base" : scope.map((prefix) => `${prefix}:`).join("");
}

/** every scope the literal carries, the base first, then in the variant table's order */
export function scopesOf(className: string | null): Scope[] {
	const seen: Scope[] = [[]];
	for (const token of split(className)) {
		const { variants } = anatomyOf(token);
		if (variants.length === 0 || seen.some((scope) => sameScope(scope, variants))) continue;
		seen.push(variants);
	}
	const rank = (scope: Scope) => scope.map((prefix) => VARIANTS.findIndex((v) => v.prefix === prefix)).reduce((a, b) => a * 100 + b, 0);
	return [seen[0] ?? [], ...seen.slice(1).sort((a, b) => rank(a) - rank(b))];
}

/** the base tokens that sit under this scope, as a className the base model can read */
export function inScope(className: string | null, scope: Scope): string {
	return split(className)
		.map(anatomyOf)
		.filter((anatomy) => sameScope(anatomy.variants, scope))
		.map((anatomy) => compose({ ...anatomy, variants: [] }))
		.join(" ");
}

/**
 * Run a base-model write under a scope: the tokens under it are handed over
 * as a plain className, the change is applied, and what comes back is laid
 * into the literal in the original order, prefixed again, with anything new
 * at the end. Tokens under other scopes are never touched.
 */
export function withScope(className: string | null, scope: Scope, change: (scoped: string) => string): string {
	const list = split(className);
	const next = split(change(inScope(className, scope)));
	const pending = [...next];
	const out: string[] = [];
	for (const token of list) {
		const anatomy = anatomyOf(token);
		if (!sameScope(anatomy.variants, scope)) {
			out.push(token);
			continue;
		}
		const bare = compose({ ...anatomy, variants: [] });
		const at = pending.indexOf(bare);
		if (at === -1) continue;
		pending.splice(at, 1);
		out.push(token);
	}
	for (const bare of pending) out.push(compose({ ...anatomyOf(bare), variants: scope }));
	return out.join(" ");
}

/* ---------- P6: lengths, with a sign, a fraction, a unit ---------- */

export type Kind = "spacing" | "count" | "percent" | "deg" | "ms" | "px";

/** every numeric family and what its value measures; looked up longest prefix first */
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

const LENGTH_FAMILIES = Object.keys(LENGTHS).sort((a, b) => b.length - a.length);

/** the value words a length accepts besides a number */
const LENGTH_WORDS: Readonly<Record<Kind, readonly string[]>> = {
	spacing: ["px", "full", "auto", "screen", "min", "max", "fit", "dvh", "svh", "lvh", "dvw", "svw", "lvw", "none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "prose", "3xs", "2xs"],
	count: ["auto", "none", "full", "first", "last"],
	percent: [],
	deg: ["none"],
	ms: ["initial"],
	px: ["none"],
};

export interface Length {
	family: string;
	kind: Kind;
	/** the written value after `family-`: `4`, `1/2`, `[347px]`, `full` */
	value: string;
	negative: boolean;
	important: boolean;
	token: string;
}

function valueFits(kind: Kind, value: string): boolean {
	if (value.startsWith("[") && value.endsWith("]")) return true;
	if (value.startsWith("(") && value.endsWith(")")) return true;
	if (/^\d+(?:\.\d+)?$/.test(value)) return true;
	if (kind === "spacing" && /^\d+\/\d+$/.test(value)) return true;
	return LENGTH_WORDS[kind].includes(value);
}

/** which length family a bare token belongs to, and its value; null when it is not a length */
export function lengthOfToken(base: string): { family: string; kind: Kind; value: string } | null {
	for (const family of LENGTH_FAMILIES) {
		if (!base.startsWith(`${family}-`)) continue;
		const value = base.slice(family.length + 1);
		const kind = LENGTHS[family] ?? "spacing";
		if (value === "") continue;
		if (!valueFits(kind, value)) continue;
		return { family, kind, value };
	}
	return null;
}

/** the token on this family among the given (already scoped) tokens */
export function lengthOf(scoped: string, family: string): Length | null {
	for (const token of split(scoped)) {
		const anatomy = anatomyOf(token);
		const found = lengthOfToken(anatomy.base);
		if (found === null || found.family !== family) continue;
		return { ...found, negative: anatomy.negative, important: anatomy.important, token };
	}
	return null;
}

/** what the faint readout says for a value: `16px`, `-8px`, `50%`, `12deg`, `150ms`, `10` */
export function describe(kind: Kind, value: string | null, negative = false): string | null {
	if (value === null) return null;
	const sign = negative ? "-" : "";
	const bracket = /^\[(.+)\]$/.exec(value);
	if (bracket?.[1] !== undefined) return `${sign}${bracket[1].replace(/_/g, " ")}`;
	if (value.startsWith("(")) return `${sign}var${value}`;
	const fraction = /^(\d+)\/(\d+)$/.exec(value);
	if (fraction?.[1] !== undefined && fraction[2] !== undefined) {
		const pct = (Number(fraction[1]) / Number(fraction[2])) * 100;
		return `${sign}${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
	}
	if (!/^\d+(?:\.\d+)?$/.test(value)) return value === "px" && kind === "spacing" ? `${sign}1px` : value;
	const n = Number(value);
	switch (kind) {
		case "spacing":
			return `${sign}${n * STEP}px`;
		case "count":
			return `${sign}${n}`;
		case "percent":
			return `${sign}${n}%`;
		case "deg":
			return `${sign}${n}deg`;
		case "ms":
			return `${n}ms`;
		case "px":
			return `${n}px`;
	}
}

/** what the length is in pixels, for the scrub and the arrows; null when it is not a measure */
export function lengthPx(kind: Kind, value: string | null): number | null {
	if (value === null) return null;
	if (kind === "spacing") return valuePx(value);
	const bracket = /^\[(\d+(?:\.\d+)?)(?:px|deg|ms|%)?\]$/.exec(value);
	if (bracket?.[1] !== undefined) return Number(bracket[1]);
	return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
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
 * What a typed value becomes on the class. A sign is kept, a fraction stays a
 * fraction, a unit decides the bracket: `-4` is `-mt-4`, `1/2` is `w-1/2`,
 * `50%` is `w-1/2`, `347px` is `w-[347px]`, `12deg` is `rotate-12`, `150ms`
 * is `duration-150`, `.3s` is `duration-300`, `10` on z-index is `z-10`.
 */
export function parseTyped(kind: Kind, typed: string): { value: string; negative: boolean } | null {
	let text = typed.trim().replace(/\s+/g, "_");
	if (text === "") return null;
	let negative = false;
	if (text.startsWith("-")) {
		negative = true;
		text = text.slice(1);
	}
	if (/^\[.+\]$/.test(text) || /^\(--[a-z0-9-]+\)$/.test(text)) return { value: text, negative };
	const number = /^(\d+(?:\.\d+)?)(px|%|deg|rad|turn|ms|s|rem|em|vh|vw)?$/.exec(text);
	if (number?.[1] !== undefined) {
		const n = Number(number[1]);
		const unit = number[2];
		switch (kind) {
			case "spacing": {
				if (unit === undefined || unit === "") return { value: number[1], negative };
				if (unit === "px") return { value: pxValue(n), negative };
				if (unit === "%") {
					const fraction = FRACTIONS.find(([pct]) => Math.abs(pct - n) < 0.01);
					return { value: fraction === undefined ? `[${n}%]` : fraction[1], negative };
				}
				if (unit === "rem") return { value: pxValue(n * 16), negative };
				return { value: `[${n}${unit}]`, negative };
			}
			case "count":
				return unit === undefined ? { value: String(Math.round(n)), negative } : null;
			case "percent":
				return unit === undefined || unit === "%" ? { value: String(n), negative } : { value: `[${n}${unit}]`, negative };
			case "deg":
				if (unit === undefined || unit === "deg") return { value: String(n), negative };
				return { value: `[${n}${unit}]`, negative };
			case "ms":
				if (unit === undefined || unit === "ms") return { value: String(Math.round(n)), negative: false };
				if (unit === "s") return { value: String(Math.round(n * 1000)), negative: false };
				return null;
			case "px":
				if (unit === undefined || unit === "px") return { value: String(n), negative: false };
				return { value: `[${n}${unit}]`, negative: false };
		}
	}
	const fraction = /^(\d+)\/(\d+)$/.exec(text);
	if (fraction !== null && kind === "spacing") return { value: text, negative };
	if (LENGTH_WORDS[kind].includes(text)) return { value: text, negative: false };
	return null;
}

/** a step for the arrows and the scrub: one scale unit on a measure, one on a count, five on a percent, fifty on a duration */
export function stepLength(kind: Kind, current: Length | null, measured: number, units: number): { value: string; negative: boolean } {
	const signed = current === null ? null : (lengthPx(kind, current.value) ?? null);
	const now = signed === null ? measured : current?.negative === true ? -signed : signed;
	switch (kind) {
		case "spacing": {
			const next = now + units * STEP;
			return { value: pxValue(Math.abs(next)), negative: next < 0 };
		}
		case "count": {
			const next = Math.round(now + units);
			return { value: String(Math.abs(next)), negative: next < 0 };
		}
		case "percent": {
			const next = Math.max(0, Math.round(now + units * 5));
			return { value: String(next), negative: false };
		}
		case "deg": {
			const next = Math.round(now + units);
			return { value: String(Math.abs(next)), negative: next < 0 };
		}
		case "ms": {
			const next = Math.max(0, Math.round(now + units * 50));
			return { value: String(next), negative: false };
		}
		case "px": {
			const next = Math.max(0, Math.round(now + units));
			return { value: String(next), negative: false };
		}
	}
}

/** swap the family's token in place, append when absent, drop on null; `!` survives the swap */
export function withLength(scoped: string, family: string, next: { value: string; negative: boolean } | null): string {
	const list = split(scoped);
	const at = list.findIndex((token) => {
		const found = lengthOfToken(anatomyOf(token).base);
		return found !== null && found.family === family;
	});
	if (at === -1) return next === null ? list.join(" ") : [...list, compose({ variants: [], negative: next.negative, base: `${family}-${next.value}`, important: false })].join(" ");
	if (next === null) return list.filter((_, index) => index !== at).join(" ");
	const was = anatomyOf(list[at] ?? "");
	return list.map((token, index) => (index === at ? compose({ variants: [], negative: next.negative, base: `${family}-${next.value}`, important: was.important }) : token)).join(" ");
}

/** three of four agree: the one that does not, and what the rest say */
export function oddOneOut<K extends string>(sides: Record<K, string | null>): { key: K; value: string | null; rest: string | null } | null {
	const entries = Object.entries(sides) as [K, string | null][];
	for (const [key, value] of entries) {
		const others = entries.filter(([other]) => other !== key).map(([, v]) => v);
		if (others.every((v) => v === others[0]) && others[0] !== value) return { key, value, rest: others[0] ?? null };
	}
	return null;
}

/* ---------- margin: the padding fold, with a sign ---------- */

export type MarginSide = "t" | "r" | "b" | "l";

function signed(length: Length | null): string | null {
	return length === null ? null : `${length.negative ? "-" : ""}${length.value}`;
}

/** each side's margin as a signed value, read through m, mx/my, ms/me and the four sides */
export function marginOf(scoped: string): Record<MarginSide, string | null> {
	const all = lengthOf(scoped, "m");
	const x = lengthOf(scoped, "mx");
	const y = lengthOf(scoped, "my");
	const side = (own: string, logical: string | null, axis: Length | null): string | null =>
		signed(lengthOf(scoped, own) ?? (logical === null ? null : lengthOf(scoped, logical)) ?? axis ?? all);
	return { t: side("mt", null, y), r: side("mr", "me", x), b: side("mb", null, y), l: side("ml", "ms", x) };
}

function unsign(value: string | null): { value: string; negative: boolean } | null {
	return value === null ? null : { value: value.replace(/^-/, ""), negative: value.startsWith("-") };
}

/** four margins back as the fewest tokens, the logical spelling kept when the literal had it */
export function withMargin(scoped: string, sides: Record<MarginSide, string | null>): string {
	const logical = lengthOf(scoped, "ms") !== null || lengthOf(scoped, "me") !== null;
	let next = scoped;
	for (const family of ["m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me"]) next = withLength(next, family, null);
	const { t, r, b, l } = sides;
	if (t === r && r === b && b === l) return withLength(next, "m", unsign(t));
	const odd = oddOneOut({ t, r, b, l });
	if (odd !== null && odd.rest !== null) {
		next = withLength(next, "m", unsign(odd.rest));
		const family = odd.key === "t" ? "mt" : odd.key === "b" ? "mb" : odd.key === "r" ? (logical ? "me" : "mr") : logical ? "ms" : "ml";
		return withLength(next, family, unsign(odd.value ?? "0"));
	}
	if (t === b && l === r) {
		next = withLength(next, "mx", unsign(l));
		return withLength(next, "my", unsign(t));
	}
	next = withLength(next, "mt", unsign(t));
	next = withLength(next, logical ? "me" : "mr", unsign(r));
	next = withLength(next, "mb", unsign(b));
	return withLength(next, logical ? "ms" : "ml", unsign(l));
}

/* ---------- P2: colours, with an alpha ---------- */

export interface ColourName {
	name: string;
	paint: string;
	from: "tokens.css" | "default";
}

export const COLOUR_NAMES: readonly ColourName[] = [
	...Object.entries(COLORS).map(([name, paint]) => ({ name, paint, from: "tokens.css" as const })),
	...PALETTE_SINGLES.map(([name, paint]) => ({ name, paint, from: "default" as const })),
	{ name: "transparent", paint: "transparent", from: "default" },
	{ name: "current", paint: "currentColor", from: "default" },
	...PALETTE.flatMap(({ hue, shades }) => shades.map(([shade, paint]) => ({ name: `${hue}-${shade}`, paint, from: "default" as const }))),
];

const COLOUR_BY_NAME = new Map(COLOUR_NAMES.map((colour) => [colour.name, colour]));

export interface Colour {
	/** the whole token as worn, or null when nothing sets it */
	token: string | null;
	name: string | null;
	/** percent, or null when opaque */
	alpha: number | null;
	paint: string;
	from: string;
}

/** `bg-thread/50` into its parts; null when the token is not a colour on this prefix */
export function colourOfToken(base: string, prefix: string): { name: string; alpha: number | null; paint: string; from: string } | null {
	if (!base.startsWith(`${prefix}-`)) return null;
	const rest = base.slice(prefix.length + 1);
	const slash = rest.indexOf("/");
	const name = slash === -1 ? rest : rest.slice(0, slash);
	const found = COLOUR_BY_NAME.get(name);
	if (found === undefined) return null;
	let alpha: number | null = null;
	if (slash !== -1) {
		const raw = rest.slice(slash + 1);
		const plain = /^(\d+(?:\.\d+)?)$/.exec(raw);
		const bracket = /^\[(\d+(?:\.\d+)?)%?\]$/.exec(raw);
		if (plain?.[1] !== undefined) alpha = Number(plain[1]);
		else if (bracket?.[1] !== undefined) alpha = Number(bracket[1]);
		else return null;
	}
	return { name, alpha, paint: found.paint, from: found.from };
}

export function paintWith(paint: string, alpha: number | null): string {
	if (alpha === null || paint === "transparent" || paint === "currentColor") return paint;
	return `color-mix(in oklab, ${paint} ${alpha}%, transparent)`;
}

export function colourOf(scoped: string, prefix: string, absent: { paint: string; from: string }): Colour {
	for (const token of split(scoped)) {
		const found = colourOfToken(anatomyOf(token).base, prefix);
		if (found === null) continue;
		return { token, name: found.name, alpha: found.alpha, paint: paintWith(found.paint, found.alpha), from: found.from };
	}
	return { token: null, name: null, alpha: null, paint: absent.paint, from: absent.from };
}

export function colourToken(prefix: string, name: string, alpha: number | null): string {
	if (alpha === null || alpha >= 100) return `${prefix}-${name}`;
	return Number.isInteger(alpha) ? `${prefix}-${name}/${alpha}` : `${prefix}-${name}/[${alpha}%]`;
}

export function withColour(scoped: string, prefix: string, name: string | null, alpha: number | null): string {
	const list = split(scoped);
	const at = list.findIndex((token) => colourOfToken(anatomyOf(token).base, prefix) !== null);
	const next = name === null ? null : colourToken(prefix, name, alpha);
	if (at === -1) return next === null ? list.join(" ") : [...list, next].join(" ");
	if (next === null) return list.filter((_, index) => index !== at).join(" ");
	return list.map((token, index) => (index === at ? next : token)).join(" ");
}

/* ---------- P3: gradients, one gesture and several tokens ---------- */

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

function shapeOfToken(base: string): { shape: GradientShape; direction: string | null } | null {
	const linear = /^bg-(?:linear|gradient)-(.+)$/.exec(base);
	if (linear?.[1] !== undefined) return { shape: "linear", direction: linear[1] };
	if (base === "bg-linear" || base === "bg-gradient") return { shape: "linear", direction: null };
	if (base === "bg-radial" || base.startsWith("bg-radial-")) return { shape: "radial", direction: base === "bg-radial" ? null : base.slice("bg-radial-".length) };
	if (base === "bg-conic" || base.startsWith("bg-conic-")) return { shape: "conic", direction: base === "bg-conic" ? null : base.slice("bg-conic-".length) };
	return null;
}

export function gradientOf(scoped: string): Gradient | null {
	const list = split(scoped);
	let shape: { shape: GradientShape; direction: string | null; token: string } | null = null;
	const stops: Record<"from" | "via" | "to", Stop> = {
		from: { at: "from", colour: null, position: null },
		via: { at: "via", colour: null, position: null },
		to: { at: "to", colour: null, position: null },
	};
	for (const token of list) {
		const base = anatomyOf(token).base;
		const found = shapeOfToken(base);
		if (found !== null) {
			shape = { ...found, token };
			continue;
		}
		for (const at of ["from", "via", "to"] as const) {
			if (!base.startsWith(`${at}-`)) continue;
			const rest = base.slice(at.length + 1);
			if (/^\d+(?:\.\d+)?%$/.test(rest)) {
				stops[at] = { ...stops[at], position: rest };
				continue;
			}
			const colour = colourOfToken(base, at);
			if (colour !== null) {
				stops[at] = { ...stops[at], colour: { token, name: colour.name, alpha: colour.alpha, paint: paintWith(colour.paint, colour.alpha), from: colour.from } };
			}
		}
	}
	if (shape === null) return null;
	const list3 = [stops.from, stops.via, stops.to];
	return { shape: shape.shape, direction: shape.direction, stops: list3, token: shape.token };
}

function isGradientToken(base: string): boolean {
	if (shapeOfToken(base) !== null) return true;
	for (const at of ["from", "via", "to"] as const) {
		if (!base.startsWith(`${at}-`)) continue;
		const rest = base.slice(at.length + 1);
		if (/^\d+(?:\.\d+)?%$/.test(rest) || colourOfToken(base, at) !== null) return true;
	}
	return false;
}

/** write the gradient back: the shape token, then from, via, to, each a colour and maybe a position */
export function withGradient(scoped: string, gradient: Gradient | null): string {
	const kept = split(scoped).filter((token) => !isGradientToken(anatomyOf(token).base));
	if (gradient === null) return kept.join(" ");
	const out = [...kept];
	const shapeToken =
		gradient.shape === "linear"
			? `bg-linear-${gradient.direction ?? "to-r"}`
			: gradient.direction === null
				? `bg-${gradient.shape}`
				: `bg-${gradient.shape}-${gradient.direction}`;
	out.push(shapeToken);
	for (const stop of gradient.stops) {
		if (stop.colour?.name !== undefined && stop.colour.name !== null) out.push(colourToken(stop.at, stop.colour.name, stop.colour.alpha));
		if (stop.position !== null && stop.colour !== null) out.push(`${stop.at}-${stop.position}`);
	}
	return out.join(" ");
}

/** the CSS the gradient paints, for the swatch on the panel and the mock's rule */
export function gradientCss(gradient: Gradient): string {
	const stops = gradient.stops
		.filter((stop) => stop.colour !== null)
		.map((stop) => `${stop.colour?.paint ?? "transparent"}${stop.position === null ? "" : ` ${stop.position}`}`)
		.join(", ");
	if (gradient.shape === "radial") return `radial-gradient(${gradient.direction === null ? "" : `${gradient.direction.replace(/^\[|\]$/g, "").replace(/_/g, " ")}, `}${stops})`;
	if (gradient.shape === "conic") return `conic-gradient(${gradient.direction === null ? "" : `from ${gradient.direction}deg, `}${stops})`;
	const direction = gradient.direction ?? "to-r";
	const angle = /^\d+$/.test(direction) ? `${direction}deg` : DIRECTIONS.find((d) => d.value === direction)?.says ?? "to right";
	return `linear-gradient(${angle}, ${stops})`;
}

/* ---------- P4: toggle sets, several tokens of one property on at once ---------- */

export interface ToggleSet {
	/** the CSS property, which is the row's label */
	property: string;
	/** each inner list is exclusive; lists are independent */
	groups: readonly (readonly string[])[];
	/** the token that resets the whole set, if the family has one */
	reset?: string;
}

export const NUMERIC_SET: ToggleSet = {
	property: "font-variant-numeric",
	groups: [["ordinal"], ["slashed-zero"], ["lining-nums", "oldstyle-nums"], ["proportional-nums", "tabular-nums"], ["diagonal-fractions", "stacked-fractions"]],
	reset: "normal-nums",
};

export const FILTER_SET: ToggleSet = {
	property: "filter",
	groups: [["grayscale"], ["invert"], ["sepia"], ["blur-xs", "blur-sm", "blur-md", "blur-lg", "blur-xl"]],
	reset: "filter-none",
};

export const SNAP_SET: ToggleSet = {
	property: "scroll-snap-type",
	groups: [["snap-x", "snap-y", "snap-both"], ["snap-mandatory", "snap-proximity"]],
	reset: "snap-none",
};

export function toggledOf(scoped: string, set: ToggleSet): ReadonlySet<string> {
	const all = new Set(set.groups.flat());
	return new Set(split(scoped).filter((token) => all.has(anatomyOf(token).base)).map((token) => anatomyOf(token).base));
}

/** turn one token on or off; on drops the others in its exclusive group, and the reset token goes either way */
export function withToggle(scoped: string, set: ToggleSet, token: string, on: boolean): string {
	const group = set.groups.find((members) => members.includes(token)) ?? [token];
	const list = split(scoped).filter((candidate) => {
		const base = anatomyOf(candidate).base;
		if (base === set.reset) return false;
		if (on) return !group.includes(base);
		return base !== token;
	});
	return (on ? [...list, token] : list).join(" ");
}

/* ---------- P7: corners on the radius, edges on the border ---------- */

export type Corner = "tl" | "tr" | "br" | "bl";
export type Edge = "t" | "r" | "b" | "l";

export interface RadiusName {
	/** the suffix after `rounded-`, or "" for the bare class */
	suffix: string;
	value: string;
	from: "tokens.css" | "default";
}

export const RADII: readonly RadiusName[] = [
	{ suffix: "none", value: "0", from: "default" },
	{ suffix: "xs", value: "4px", from: "tokens.css" },
	{ suffix: "sm", value: "6px", from: "tokens.css" },
	{ suffix: "md", value: "8px", from: "tokens.css" },
	{ suffix: "lg", value: "12px", from: "tokens.css" },
	{ suffix: "xl", value: "12px", from: "default" },
	{ suffix: "2xl", value: "16px", from: "default" },
	{ suffix: "3xl", value: "24px", from: "default" },
	{ suffix: "4xl", value: "32px", from: "default" },
	{ suffix: "full", value: "9999px", from: "default" },
];

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

function radiusSuffixOk(suffix: string): boolean {
	return RADII.some((radius) => radius.suffix === suffix) || /^\[.+\]$/.test(suffix) || /^\(--.+\)$/.test(suffix);
}

/** `rounded-md rounded-tl-none` into four corners; a corner nothing sets is null */
export function cornersOf(scoped: string): Record<Corner, string | null> {
	const corners: Record<Corner, string | null> = { tl: null, tr: null, br: null, bl: null };
	for (const token of split(scoped)) {
		const base = anatomyOf(token).base;
		if (base === "rounded") {
			for (const corner of RADIUS_CORNERS[""] ?? []) corners[corner] = "sm";
			continue;
		}
		if (!base.startsWith("rounded-")) continue;
		const rest = base.slice("rounded-".length);
		const dash = rest.indexOf("-");
		const side = dash === -1 ? "" : rest.slice(0, dash);
		const suffix = dash === -1 ? rest : rest.slice(dash + 1);
		const targets = RADIUS_CORNERS[side];
		if (targets === undefined || !radiusSuffixOk(suffix)) {
			// `rounded-xl` has no side: the whole word is the suffix
			if (dash !== -1 && radiusSuffixOk(rest)) for (const corner of RADIUS_CORNERS[""] ?? []) corners[corner] = rest;
			continue;
		}
		for (const corner of targets) corners[corner] = suffix;
	}
	return corners;
}

export function radiusValue(suffix: string | null): string {
	if (suffix === null) return "0";
	const named = RADII.find((radius) => radius.suffix === suffix);
	if (named !== undefined) return named.value;
	return describe("px", suffix) ?? suffix;
}

function isRadiusToken(base: string): boolean {
	if (base === "rounded") return true;
	if (!base.startsWith("rounded-")) return false;
	const rest = base.slice("rounded-".length);
	const dash = rest.indexOf("-");
	if (dash === -1) return radiusSuffixOk(rest);
	return (RADIUS_CORNERS[rest.slice(0, dash)] !== undefined && radiusSuffixOk(rest.slice(dash + 1))) || radiusSuffixOk(rest);
}

/** four corners back as the fewest tokens: one when all agree, two sides when pairs do, corners otherwise */
export function withCorners(scoped: string, corners: Record<Corner, string | null>): string {
	const kept = split(scoped).filter((token) => !isRadiusToken(anatomyOf(token).base));
	const logical = split(scoped).some((token) => /^rounded-(s|e|ss|se|ee|es)-/.test(anatomyOf(token).base));
	const { tl, tr, br, bl } = corners;
	const token = (side: string, suffix: string | null) => (suffix === null ? null : `rounded${side === "" ? "" : `-${side}`}-${suffix}`);
	const out: (string | null)[] = [];
	const odd = oddOneOut({ tl, tr, br, bl });
	if (tl === tr && tr === br && br === bl) out.push(token("", tl));
	else if (odd !== null) {
		// three agree: the whole plus the one exception, which sorts after it in the compiled order
		const corner = logical ? ({ tl: "ss", tr: "se", br: "ee", es: "es", bl: "es" } as Record<string, string>)[odd.key] ?? odd.key : odd.key;
		out.push(token("", odd.rest), token(corner, odd.value ?? "none"));
	} else if (tl === tr && br === bl) out.push(token("t", tl), token("b", br));
	else if (tl === bl && tr === br) out.push(token(logical ? "s" : "l", tl), token(logical ? "e" : "r", tr));
	else out.push(token(logical ? "ss" : "tl", tl), token(logical ? "se" : "tr", tr), token(logical ? "ee" : "br", br), token(logical ? "es" : "bl", bl));
	return [...kept, ...out.filter((candidate): candidate is string => candidate !== null)].join(" ");
}

const EDGE_SIDES: Readonly<Record<string, readonly Edge[]>> = {
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

/** `border border-b-2 border-x-0` into four widths in px; an edge nothing sets is null */
export function borderWidthsOf(scoped: string): Record<Edge, string | null> {
	const edges: Record<Edge, string | null> = { t: null, r: null, b: null, l: null };
	for (const token of split(scoped)) {
		const base = anatomyOf(token).base;
		if (base === "border") {
			for (const edge of EDGE_SIDES[""] ?? []) edges[edge] = "1";
			continue;
		}
		const match = /^border(?:-([xytrblse]))?(?:-(\d+|\[.+\]))?$/.exec(base);
		if (match === null) continue;
		const side = match[1] ?? "";
		const width = match[2] ?? "1";
		if (match[1] === undefined && match[2] === undefined) continue;
		for (const edge of EDGE_SIDES[side] ?? []) edges[edge] = width;
	}
	return edges;
}

function isBorderWidthToken(base: string): boolean {
	return base === "border" || /^border(?:-([xytrblse]))?(?:-(\d+|\[.+\]))?$/.test(base);
}

/** four widths back as the fewest tokens; `1` is the bare class, `0` drops the edge */
export function withBorderWidths(scoped: string, edges: Record<Edge, string | null>): string {
	const kept = split(scoped).filter((token) => !isBorderWidthToken(anatomyOf(token).base));
	const logical = split(scoped).some((token) => /^border-[se](?:-|$)/.test(anatomyOf(token).base));
	const norm = (value: string | null) => (value === null || value === "0" ? null : value);
	const t = norm(edges.t);
	const r = norm(edges.r);
	const b = norm(edges.b);
	const l = norm(edges.l);
	const token = (side: string, width: string | null) => (width === null ? null : `border${side === "" ? "" : `-${side}`}${width === "1" ? "" : `-${width}`}`);
	const out: (string | null)[] = [];
	const odd = oddOneOut({ t, r, b, l });
	if (t === r && r === b && b === l) out.push(token("", t));
	else if (odd !== null && odd.rest !== null) {
		const edge = logical ? ({ r: "e", l: "s" } as Record<string, string>)[odd.key] ?? odd.key : odd.key;
		out.push(token("", odd.rest), token(edge, odd.value ?? "0"));
	} else if (t === b && l === r) out.push(token("y", t), token("x", l));
	else out.push(token("t", t), token(logical ? "e" : "r", r), token("b", b), token(logical ? "s" : "l", l));
	return [...kept, ...out.filter((candidate): candidate is string => candidate !== null)].join(" ");
}

/** the colour on each edge: `border-border border-b-thread/50` */
export function borderColoursOf(scoped: string, absent: { paint: string; from: string }): Record<Edge, Colour> {
	const none: Colour = { token: null, name: null, alpha: null, paint: absent.paint, from: absent.from };
	const edges: Record<Edge, Colour> = { t: none, r: none, b: none, l: none };
	for (const token of split(scoped)) {
		const base = anatomyOf(token).base;
		for (const side of ["", "x", "y", "t", "r", "b", "l", "s", "e"]) {
			const prefix = side === "" ? "border" : `border-${side}`;
			const found = colourOfToken(base, prefix);
			if (found === null) continue;
			const colour: Colour = { token, name: found.name, alpha: found.alpha, paint: paintWith(found.paint, found.alpha), from: found.from };
			for (const edge of EDGE_SIDES[side] ?? []) edges[edge] = colour;
		}
	}
	return edges;
}

function isBorderColourToken(base: string): boolean {
	return ["", "x", "y", "t", "r", "b", "l", "s", "e"].some((side) => colourOfToken(base, side === "" ? "border" : `border-${side}`) !== null);
}

export function withBorderColours(scoped: string, edges: Record<Edge, { name: string; alpha: number | null } | null>): string {
	const kept = split(scoped).filter((token) => !isBorderColourToken(anatomyOf(token).base));
	const logical = split(scoped).some((token) => /^border-[se]-/.test(anatomyOf(token).base));
	const key = (edge: { name: string; alpha: number | null } | null) => (edge === null ? "" : `${edge.name}/${edge.alpha ?? ""}`);
	const token = (side: string, edge: { name: string; alpha: number | null } | null) =>
		edge === null ? null : colourToken(side === "" ? "border" : `border-${side}`, edge.name, edge.alpha);
	const { t, r, b, l } = edges;
	const out: (string | null)[] = [];
	if (key(t) === key(r) && key(r) === key(b) && key(b) === key(l)) out.push(token("", t));
	else if (key(t) === key(b) && key(l) === key(r)) out.push(token("y", t), token("x", l));
	else out.push(token("t", t), token(logical ? "e" : "r", r), token("b", b), token(logical ? "s" : "l", l));
	return [...kept, ...out.filter((candidate): candidate is string => candidate !== null)].join(" ");
}

/* ---------- the compiled theme: tokens.css first, Tailwind's defaults after, marked ---------- */

export interface ThemeOption {
	token: string;
	value: string;
	from: "tokens.css" | "default";
}

export const TEXT_SIZES: readonly ThemeOption[] = [
	{ token: "text-2xs", value: "10px", from: "tokens.css" },
	{ token: "text-xs", value: "11px", from: "tokens.css" },
	{ token: "text-sm", value: "12px", from: "tokens.css" },
	{ token: "text-base", value: "13px", from: "tokens.css" },
	{ token: "text-md", value: "14px", from: "tokens.css" },
	{ token: "text-lg", value: "18px", from: "tokens.css" },
	{ token: "text-xl", value: "20px", from: "default" },
	{ token: "text-2xl", value: "24px", from: "default" },
	{ token: "text-3xl", value: "30px", from: "default" },
	{ token: "text-4xl", value: "36px", from: "default" },
	{ token: "text-5xl", value: "48px", from: "default" },
	{ token: "text-6xl", value: "60px", from: "default" },
];

export const WEIGHTS: readonly ThemeOption[] = [
	{ token: "font-regular", value: "400", from: "tokens.css" },
	{ token: "font-medium", value: "500", from: "tokens.css" },
	{ token: "font-semibold", value: "600", from: "tokens.css" },
	{ token: "font-thin", value: "100", from: "default" },
	{ token: "font-extralight", value: "200", from: "default" },
	{ token: "font-light", value: "300", from: "default" },
	{ token: "font-normal", value: "400", from: "default" },
	{ token: "font-bold", value: "700", from: "default" },
	{ token: "font-extrabold", value: "800", from: "default" },
	{ token: "font-black", value: "900", from: "default" },
];

export const FONTS: readonly ThemeOption[] = [
	{ token: "font-sans", value: "Familjen Grotesk", from: "tokens.css" },
	{ token: "font-mono", value: "Fragment Mono", from: "tokens.css" },
	{ token: "font-serif", value: "ui-serif", from: "default" },
];

export const LEADINGS: readonly ThemeOption[] = [
	{ token: "leading-xs", value: "16px", from: "tokens.css" },
	{ token: "leading-sm", value: "18px", from: "tokens.css" },
	{ token: "leading-base", value: "20px", from: "tokens.css" },
	{ token: "leading-md", value: "22px", from: "tokens.css" },
	{ token: "leading-lg", value: "26px", from: "tokens.css" },
	{ token: "leading-none", value: "1", from: "default" },
	{ token: "leading-tight", value: "1.25", from: "default" },
	{ token: "leading-snug", value: "1.375", from: "default" },
	{ token: "leading-normal", value: "1.5", from: "default" },
	{ token: "leading-relaxed", value: "1.625", from: "default" },
	{ token: "leading-loose", value: "2", from: "default" },
];

export const TRACKINGS: readonly ThemeOption[] = [
	{ token: "tracking-tight", value: "-0.01em", from: "tokens.css" },
	{ token: "tracking-normal", value: "0em", from: "tokens.css" },
	{ token: "tracking-tighter", value: "-0.05em", from: "default" },
	{ token: "tracking-wide", value: "0.025em", from: "default" },
	{ token: "tracking-wider", value: "0.05em", from: "default" },
	{ token: "tracking-widest", value: "0.1em", from: "default" },
];

export const SHADOWS: readonly ThemeOption[] = [
	{ token: "shadow-2xs", value: "0 1px rgb(0 0 0 / 0.05)", from: "default" },
	{ token: "shadow-xs", value: "0 1px 2px 0 rgb(0 0 0 / 0.05)", from: "default" },
	{ token: "shadow-sm", value: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", from: "default" },
	{ token: "shadow-md", value: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", from: "default" },
	{ token: "shadow-lg", value: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", from: "default" },
	{ token: "shadow-xl", value: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", from: "default" },
];

export const EASINGS: readonly ThemeOption[] = [
	{ token: "ease-linear", value: "linear", from: "default" },
	{ token: "ease-in", value: "cubic-bezier(0.4, 0, 1, 1)", from: "default" },
	{ token: "ease-out", value: "cubic-bezier(0, 0, 0.2, 1)", from: "default" },
	{ token: "ease-in-out", value: "cubic-bezier(0.4, 0, 0.2, 1)", from: "default" },
];

/** the option worn out of a theme list, reading the leading `leading-6` numerics too */
export function themeOf(scoped: string, options: readonly ThemeOption[]): ThemeOption | null {
	const set = new Map(options.map((option) => [option.token, option]));
	for (const token of split(scoped)) {
		const found = set.get(anatomyOf(token).base);
		if (found !== undefined) return found;
	}
	return null;
}

export function withTheme(scoped: string, options: readonly ThemeOption[], token: string | null): string {
	const set = new Set(options.map((option) => option.token));
	const list = split(scoped);
	const at = list.findIndex((candidate) => set.has(anatomyOf(candidate).base));
	if (at === -1) return token === null ? list.join(" ") : [...list, token].join(" ");
	if (token === null) return list.filter((_, index) => index !== at).join(" ");
	return list.map((candidate, index) => (index === at ? token : candidate)).join(" ");
}

/* ---------- P5: the compiler as the gate, and as the mock's stylesheet ---------- */

export type Compiled = { ok: true; css: string } | { ok: false; reason: string };

const STATIC: Readonly<Record<string, string>> = {
	flex: "display: flex",
	grid: "display: grid",
	block: "display: block",
	inline: "display: inline",
	"inline-flex": "display: inline-flex",
	"inline-block": "display: inline-block",
	"inline-grid": "display: inline-grid",
	contents: "display: contents",
	hidden: "display: none",
	"flex-row": "flex-direction: row",
	"flex-col": "flex-direction: column",
	"flex-row-reverse": "flex-direction: row-reverse",
	"flex-col-reverse": "flex-direction: column-reverse",
	"flex-wrap": "flex-wrap: wrap",
	"flex-nowrap": "flex-wrap: nowrap",
	"flex-1": "flex: 1",
	"flex-auto": "flex: auto",
	"flex-none": "flex: none",
	grow: "flex-grow: 1",
	"grow-0": "flex-grow: 0",
	shrink: "flex-shrink: 1",
	"shrink-0": "flex-shrink: 0",
	"items-start": "align-items: flex-start",
	"items-center": "align-items: center",
	"items-end": "align-items: flex-end",
	"items-baseline": "align-items: baseline",
	"items-stretch": "align-items: stretch",
	"justify-start": "justify-content: flex-start",
	"justify-center": "justify-content: center",
	"justify-end": "justify-content: flex-end",
	"justify-between": "justify-content: space-between",
	"justify-around": "justify-content: space-around",
	"justify-evenly": "justify-content: space-evenly",
	"self-start": "align-self: flex-start",
	"self-center": "align-self: center",
	"self-end": "align-self: flex-end",
	"self-stretch": "align-self: stretch",
	"self-auto": "align-self: auto",
	"content-start": "align-content: flex-start",
	"content-center": "align-content: center",
	"content-end": "align-content: flex-end",
	"content-between": "align-content: space-between",
	static: "position: static",
	relative: "position: relative",
	absolute: "position: absolute",
	fixed: "position: fixed",
	sticky: "position: sticky",
	"overflow-visible": "overflow: visible",
	"overflow-hidden": "overflow: hidden",
	"overflow-auto": "overflow: auto",
	"overflow-scroll": "overflow: scroll",
	"overflow-x-auto": "overflow-x: auto",
	"overflow-y-auto": "overflow-y: auto",
	"overflow-x-hidden": "overflow-x: hidden",
	"overflow-y-hidden": "overflow-y: hidden",
	"text-left": "text-align: left",
	"text-center": "text-align: center",
	"text-right": "text-align: right",
	"text-justify": "text-align: justify",
	truncate: "overflow: hidden; text-overflow: ellipsis; white-space: nowrap",
	"text-ellipsis": "text-overflow: ellipsis",
	"whitespace-nowrap": "white-space: nowrap",
	"whitespace-pre": "white-space: pre",
	"whitespace-normal": "white-space: normal",
	"break-words": "overflow-wrap: break-word",
	"break-all": "word-break: break-all",
	italic: "font-style: italic",
	"not-italic": "font-style: normal",
	uppercase: "text-transform: uppercase",
	lowercase: "text-transform: lowercase",
	capitalize: "text-transform: capitalize",
	"normal-case": "text-transform: none",
	underline: "text-decoration-line: underline",
	"line-through": "text-decoration-line: line-through",
	"no-underline": "text-decoration-line: none",
	antialiased: "-webkit-font-smoothing: antialiased",
	"sr-only": "position: absolute; width: 1px; height: 1px; overflow: hidden",
	border: "border-width: 1px",
	rounded: "border-radius: var(--radius-sm)",
	shadow: "box-shadow: var(--shadow-sm)",
	"shadow-none": "box-shadow: none",
	ring: "box-shadow: 0 0 0 1px currentColor",
	transition: "transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter; transition-duration: 150ms",
	"transition-all": "transition-property: all; transition-duration: 150ms",
	"transition-colors": "transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke; transition-duration: 150ms",
	"transition-opacity": "transition-property: opacity; transition-duration: 150ms",
	"transition-transform": "transition-property: transform, translate, scale, rotate; transition-duration: 150ms",
	"transition-none": "transition-property: none",
	"animate-spin": "animation: spin 1s linear infinite",
	"animate-pulse": "animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
	"animate-ping": "animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
	"animate-bounce": "animation: bounce 1s infinite",
	"pointer-events-none": "pointer-events: none",
	"pointer-events-auto": "pointer-events: auto",
	"select-none": "user-select: none",
	"select-text": "user-select: text",
	"select-all": "user-select: all",
	"cursor-pointer": "cursor: pointer",
	"cursor-default": "cursor: default",
	"cursor-not-allowed": "cursor: not-allowed",
	"cursor-grab": "cursor: grab",
	"cursor-text": "cursor: text",
	"outline-none": "outline: 2px solid transparent; outline-offset: 2px",
	"appearance-none": "appearance: none",
	isolate: "isolation: isolate",
	visible: "visibility: visible",
	invisible: "visibility: hidden",
	"object-cover": "object-fit: cover",
	"object-contain": "object-fit: contain",
	"bg-transparent": "background-color: transparent",
	"bg-none": "background-image: none",
	"snap-none": "scroll-snap-type: none",
	"snap-x": "scroll-snap-type: x var(--tw-scroll-snap-strictness)",
	"snap-y": "scroll-snap-type: y var(--tw-scroll-snap-strictness)",
	"snap-both": "scroll-snap-type: both var(--tw-scroll-snap-strictness)",
	"snap-mandatory": "--tw-scroll-snap-strictness: mandatory",
	"snap-proximity": "--tw-scroll-snap-strictness: proximity",
	"normal-nums": "font-variant-numeric: normal",
	ordinal: "font-variant-numeric: ordinal",
	"slashed-zero": "font-variant-numeric: slashed-zero",
	"lining-nums": "font-variant-numeric: lining-nums",
	"oldstyle-nums": "font-variant-numeric: oldstyle-nums",
	"proportional-nums": "font-variant-numeric: proportional-nums",
	"tabular-nums": "font-variant-numeric: tabular-nums",
	"diagonal-fractions": "font-variant-numeric: diagonal-fractions",
	"stacked-fractions": "font-variant-numeric: stacked-fractions",
	grayscale: "filter: grayscale(100%)",
	"grayscale-0": "filter: grayscale(0)",
	invert: "filter: invert(100%)",
	sepia: "filter: sepia(100%)",
	"filter-none": "filter: none",
	"blur-xs": "filter: blur(4px)",
	"blur-sm": "filter: blur(8px)",
	"blur-md": "filter: blur(12px)",
	"blur-lg": "filter: blur(16px)",
	"blur-xl": "filter: blur(24px)",
	"blur-none": "filter: none",
	"backdrop-blur-sm": "backdrop-filter: blur(8px)",
	"backdrop-blur-md": "backdrop-filter: blur(12px)",
	"divide-y": "border-top-width: 1px",
	"divide-x": "border-left-width: 1px",
	"list-none": "list-style-type: none",
	"list-disc": "list-style-type: disc",
	"aspect-square": "aspect-ratio: 1 / 1",
	"aspect-video": "aspect-ratio: 16 / 9",
	"aspect-auto": "aspect-ratio: auto",
	"box-border": "box-sizing: border-box",
	"box-content": "box-sizing: content-box",
	"inset-0": "inset: 0",
	"size-full": "width: 100%; height: 100%",
	"resize-none": "resize: none",
	"will-change-transform": "will-change: transform",
	"scroll-smooth": "scroll-behavior: smooth",
	"text-wrap": "text-wrap: wrap",
	"text-nowrap": "text-wrap: nowrap",
	"text-balance": "text-wrap: balance",
	"text-pretty": "text-wrap: pretty",
	"font-sans": "font-family: var(--font-sans)",
	"font-mono": "font-family: var(--font-mono)",
	"font-serif": "font-family: ui-serif, Georgia, serif",
};

const LENGTH_PROPERTY: Readonly<Record<string, string | readonly string[]>> = {
	p: "padding",
	px: "padding-inline",
	py: "padding-block",
	pt: "padding-top",
	pr: "padding-right",
	pb: "padding-bottom",
	pl: "padding-left",
	ps: "padding-inline-start",
	pe: "padding-inline-end",
	m: "margin",
	mx: "margin-inline",
	my: "margin-block",
	mt: "margin-top",
	mr: "margin-right",
	mb: "margin-bottom",
	ml: "margin-left",
	ms: "margin-inline-start",
	me: "margin-inline-end",
	gap: "gap",
	"gap-x": "column-gap",
	"gap-y": "row-gap",
	w: "width",
	h: "height",
	size: ["width", "height"],
	"min-w": "min-width",
	"max-w": "max-width",
	"min-h": "min-height",
	"max-h": "max-height",
	top: "top",
	right: "right",
	bottom: "bottom",
	left: "left",
	inset: "inset",
	"inset-x": "inset-inline",
	"inset-y": "inset-block",
	start: "inset-inline-start",
	end: "inset-inline-end",
	"translate-x": "--tw-translate-x",
	"translate-y": "--tw-translate-y",
	translate: ["--tw-translate-x", "--tw-translate-y"],
	indent: "text-indent",
	basis: "flex-basis",
	z: "z-index",
	order: "order",
	"grid-cols": "grid-template-columns",
	"grid-rows": "grid-template-rows",
	"col-span": "grid-column",
	"row-span": "grid-row",
	"col-start": "grid-column-start",
	"row-start": "grid-row-start",
	columns: "columns",
	"line-clamp": "-webkit-line-clamp",
	opacity: "opacity",
	scale: "scale",
	"scale-x": "--tw-scale-x",
	"scale-y": "--tw-scale-y",
	brightness: "filter",
	contrast: "filter",
	saturate: "filter",
	rotate: "rotate",
	"rotate-x": "--tw-rotate-x",
	"rotate-y": "--tw-rotate-y",
	skew: "transform",
	"skew-x": "--tw-skew-x",
	"skew-y": "--tw-skew-y",
	"hue-rotate": "filter",
	duration: "transition-duration",
	delay: "transition-delay",
	border: "border-width",
	"border-t": "border-top-width",
	"border-r": "border-right-width",
	"border-b": "border-bottom-width",
	"border-l": "border-left-width",
	"border-x": "border-inline-width",
	"border-y": "border-block-width",
	"border-s": "border-inline-start-width",
	"border-e": "border-inline-end-width",
	outline: "outline-width",
	"outline-offset": "outline-offset",
	ring: "--tw-ring-width",
	"ring-offset": "--tw-ring-offset-width",
	decoration: "text-decoration-thickness",
	"underline-offset": "text-underline-offset",
	stroke: "stroke-width",
};

/** a length value as CSS: the scale in rem-free px for this project, words as their keywords */
function lengthCss(family: string, kind: Kind, value: string, negative: boolean): string | null {
	const sign = negative ? "-" : "";
	const bracket = /^\[(.+)\]$/.exec(value);
	if (bracket?.[1] !== undefined) return `${sign}${bracket[1].replace(/_/g, " ")}`;
	if (value.startsWith("(")) return `${sign}var${value}`;
	const fraction = /^(\d+)\/(\d+)$/.exec(value);
	if (fraction?.[1] !== undefined && fraction[2] !== undefined) return `${sign}${(Number(fraction[1]) / Number(fraction[2])) * 100}%`;
	if (/^\d+(?:\.\d+)?$/.test(value)) {
		const n = Number(value);
		switch (kind) {
			case "spacing":
				return `${sign}${n * STEP}px`;
			case "count":
				if (family === "grid-cols" || family === "grid-rows") return `repeat(${n}, minmax(0, 1fr))`;
				if (family === "col-span" || family === "row-span") return `span ${n} / span ${n}`;
				return `${sign}${n}`;
			case "percent":
				if (family === "opacity") return `${n}%`;
				if (family === "brightness" || family === "contrast" || family === "saturate") return `${family}(${n}%)`;
				return `${sign}${n}%`;
			case "deg":
				if (family === "hue-rotate") return `hue-rotate(${sign}${n}deg)`;
				if (family === "skew") return `skew(${sign}${n}deg)`;
				return `${sign}${n}deg`;
			case "ms":
				return `${n}ms`;
			case "px":
				return `${n}px`;
		}
	}
	const words: Record<string, string> = {
		px: "1px",
		full: family === "rounded" ? "9999px" : "100%",
		auto: "auto",
		screen: family === "h" || family === "min-h" || family === "max-h" ? "100vh" : "100vw",
		min: "min-content",
		max: "max-content",
		fit: "fit-content",
		none: "none",
		first: "-9999",
		last: "9999",
		dvh: "100dvh",
		svh: "100svh",
		lvh: "100lvh",
		dvw: "100dvw",
		svw: "100svw",
		lvw: "100lvw",
		xs: "20rem",
		sm: "24rem",
		md: "28rem",
		lg: "32rem",
		xl: "36rem",
		"2xl": "42rem",
		"3xl": "48rem",
		"4xl": "56rem",
		"5xl": "64rem",
		"6xl": "72rem",
		"7xl": "80rem",
		"2xs": "18rem",
		"3xs": "16rem",
		prose: "65ch",
		initial: "initial",
	};
	const word = words[value];
	return word === undefined ? null : word;
}

const COLOUR_PROPERTY: Readonly<Record<string, string>> = {
	bg: "background-color",
	text: "color",
	border: "border-color",
	"border-t": "border-top-color",
	"border-r": "border-right-color",
	"border-b": "border-bottom-color",
	"border-l": "border-left-color",
	"border-x": "border-inline-color",
	"border-y": "border-block-color",
	"border-s": "border-inline-start-color",
	"border-e": "border-inline-end-color",
	outline: "outline-color",
	ring: "--tw-ring-color",
	decoration: "text-decoration-color",
	accent: "accent-color",
	caret: "caret-color",
	fill: "fill",
	stroke: "stroke",
	divide: "border-color",
	placeholder: "color",
	shadow: "--tw-shadow-color",
	from: "--tw-gradient-from",
	via: "--tw-gradient-via",
	to: "--tw-gradient-to",
};

const COLOUR_PREFIXES = Object.keys(COLOUR_PROPERTY).sort((a, b) => b.length - a.length);

const THEME_PROPERTY: readonly { options: readonly ThemeOption[]; property: string; css: (option: ThemeOption) => string }[] = [
	{ options: TEXT_SIZES, property: "font-size", css: (o) => `font-size: ${o.value}` },
	{ options: WEIGHTS, property: "font-weight", css: (o) => `font-weight: ${o.value}` },
	{ options: LEADINGS, property: "line-height", css: (o) => `line-height: ${o.value}` },
	{ options: TRACKINGS, property: "letter-spacing", css: (o) => `letter-spacing: ${o.value}` },
	{ options: SHADOWS, property: "box-shadow", css: (o) => `box-shadow: ${o.value}` },
	{ options: EASINGS, property: "transition-timing-function", css: (o) => `transition-timing-function: ${o.value}` },
];

/**
 * Does this token compile, and to what. This is the gate the raw field stands
 * behind: a token lands only when the compiler has a utility for it, and the
 * greyed candidate carries the reason when it does not. It is also how the
 * mock cart learns classes the served stylesheet never saw.
 */
export function compiles(token: string): Compiled {
	if (token === "" || /\s/.test(token)) return { ok: false, reason: "one class at a time" };
	const anatomy = anatomyOf(token);
	for (const prefix of anatomy.variants) {
		if (variantOf(prefix) === undefined && !/^(group-|peer-|has-|aria-|data-|\[)/.test(prefix)) return { ok: false, reason: `no variant ${prefix}:` };
	}
	const base = anatomy.base;
	if (base === "") return { ok: false, reason: "a variant needs a class after it" };
	const arbitrary = /^\[([a-z-]+):(.+)\]$/.exec(base);
	if (arbitrary?.[1] !== undefined && arbitrary[2] !== undefined) {
		return { ok: true, css: `${arbitrary[1]}: ${arbitrary[2].replace(/_/g, " ")}` };
	}
	if (/^\[.*\]$/.test(base)) return { ok: false, reason: "an arbitrary property is [property:value]" };
	if (/^(bg|list-image)-\[url\(/.test(base)) return { ok: false, reason: "an image is an import, not a class" };
	const fixed = STATIC[base];
	if (fixed !== undefined) return { ok: true, css: anatomy.negative ? `/* ${base} takes no sign */` : fixed };
	// gradients
	const shape = shapeOfToken(base);
	if (shape !== null) return { ok: true, css: "background-image: linear-gradient(var(--tw-gradient-stops))" };
	for (const at of ["from", "via", "to"] as const) {
		if (base.startsWith(`${at}-`) && /^\d+(?:\.\d+)?%$/.test(base.slice(at.length + 1))) return { ok: true, css: `--tw-gradient-${at}-position: ${base.slice(at.length + 1)}` };
	}
	// colours
	for (const prefix of COLOUR_PREFIXES) {
		const colour = colourOfToken(base, prefix);
		if (colour === null) continue;
		const property = COLOUR_PROPERTY[prefix] ?? "color";
		return { ok: true, css: `${property}: ${paintWith(colour.paint, colour.alpha)}` };
	}
	// radius
	if (isRadiusToken(base)) {
		const corners = cornersOf(base);
		const css = (["tl", "tr", "br", "bl"] as const)
			.filter((corner) => corners[corner] !== null)
			.map((corner) => `border-${corner === "tl" ? "top-left" : corner === "tr" ? "top-right" : corner === "br" ? "bottom-right" : "bottom-left"}-radius: ${radiusValue(corners[corner])}`)
			.join("; ");
		return { ok: true, css };
	}
	// theme menus
	for (const { options, css } of THEME_PROPERTY) {
		const option = options.find((candidate) => candidate.token === base);
		if (option !== undefined) return { ok: true, css: css(option) };
	}
	if (/^leading-\d+$/.test(base)) return { ok: true, css: `line-height: ${Number(base.slice("leading-".length)) * STEP}px` };
	if (/^text-\[.+\]$/.test(base)) return { ok: true, css: `font-size: ${base.slice(6, -1).replace(/_/g, " ")}` };
	if (/^font-\[.+\]$/.test(base)) return { ok: true, css: `font-family: ${base.slice(6, -1).replace(/_/g, " ")}` };
	if (/^content-\[.+\]$/.test(base)) return { ok: true, css: `content: ${base.slice(9, -1).replace(/_/g, " ")}` };
	if (/^font-features-\[.+\]$/.test(base)) return { ok: true, css: `font-feature-settings: ${base.slice(15, -1).replace(/_/g, " ")}` };
	// lengths
	const length = lengthOfToken(base);
	if (length !== null) {
		const target = LENGTH_PROPERTY[length.family];
		const value = lengthCss(length.family, length.kind, length.value, anatomy.negative);
		if (target === undefined || value === null) return { ok: false, reason: `${length.family}- takes ${length.kind === "spacing" ? "a length" : `a ${length.kind === "count" ? "number" : length.kind}`}` };
		const targets = typeof target === "string" ? [target] : target;
		return { ok: true, css: targets.map((property) => `${property}: ${value}`).join("; ") };
	}
	// a family with a value that did not fit
	for (const family of LENGTH_FAMILIES) {
		if (base.startsWith(`${family}-`)) {
			const kind = LENGTHS[family] ?? "spacing";
			return { ok: false, reason: `${family}- takes ${kind === "spacing" ? "a length" : kind === "count" ? "a number" : `a ${kind}`}` };
		}
	}
	for (const prefix of COLOUR_PREFIXES) {
		if (base.startsWith(`${prefix}-`)) return { ok: false, reason: `no colour ${base.slice(prefix.length + 1)}` };
	}
	return { ok: false, reason: `no utility ${base}` };
}

/* ---------- the mock's stylesheet: rules for what the panel wrote ---------- */

function escapeClass(token: string): string {
	return token.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * One rule per token that compiles, selected by the class itself and wrapped
 * in the variant's pseudo or media query, so the cart wears a `hover:bg-red-500/50`
 * the moment it is written. Gradients compose from the whole literal, so those
 * get one rule per element on the element's own hook.
 */
export function stylesheetFor(elements: readonly { hook: string; className: string }[]): string {
	const rules: string[] = [];
	const seen = new Set<string>();
	for (const { hook, className } of elements) {
		for (const scope of scopesOf(className)) {
			const scoped = inScope(className, scope);
			const gradient = gradientOf(scoped);
			if (gradient !== null) {
				const wrapped = wrap(`${hook}${pseudoOf(scope)}`, `background-image: ${gradientCss(gradient)}`, scope);
				rules.push(wrapped);
			}
		}
		for (const token of split(className)) {
			if (seen.has(token)) continue;
			seen.add(token);
			const anatomy = anatomyOf(token);
			if (shapeOfToken(anatomy.base) !== null) continue;
			const compiled = compiles(token);
			if (!compiled.ok || compiled.css.startsWith("/*")) continue;
			const declarations = anatomy.important ? compiled.css.split("; ").map((d) => `${d} !important`).join("; ") : compiled.css;
			rules.push(wrap(`.${escapeClass(token)}${pseudoOf(anatomy.variants)}`, declarations, anatomy.variants));
		}
	}
	return rules.join("\n");
}

function pseudoOf(scope: Scope): string {
	return scope
		.map((prefix) => variantOf(prefix)?.when ?? "")
		.filter((when) => when.startsWith(":"))
		.join("");
}

function wrap(selector: string, declarations: string, scope: Scope): string {
	let rule = `${selector} { ${declarations}; }`;
	for (const prefix of [...scope].reverse()) {
		const when = variantOf(prefix)?.when;
		if (when !== undefined && when.startsWith("@")) rule = `${when} { ${rule} }`;
	}
	return rule;
}
