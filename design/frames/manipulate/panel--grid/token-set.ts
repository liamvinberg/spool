/**
 * The project's token set, as a thing you can pick from.
 *
 * `properties-model.ts` keeps its colour, size, leading and radius tables
 * private and reads them one element at a time, which is enough to show a
 * token and refuse it. A picker needs the whole list, so the values from
 * `shared/tokens.css` are laid out here as option lists: one list per CSS
 * property, each option a token and what it computes to. Picking one is the
 * same single-token splice a number or a word is.
 */

import { COLORS, tokens } from "../../../shared/lib/properties-model";

export interface Choice {
	/** the class the element wears for this property, or null when it wears none */
	token: string | null;
	/** what the row reads: the tailwind class, or the css keyword for the absent state */
	name: string;
	/** what it computes to */
	value: string;
	/** set on colours */
	swatch?: string;
}

const COLOR_NAMES = Object.keys(COLORS);

export function colorChoices(prefix: "bg" | "text" | "border", absent: string, absentValue: string): readonly Choice[] {
	return [
		{ token: null, name: absent, value: absentValue },
		...COLOR_NAMES.map((name) => {
			const hex = COLORS[name] ?? "";
			return { token: `${prefix}-${name}`, name: `${prefix}-${name}`, value: hex, swatch: hex };
		}),
	];
}

export const FONT_SIZE: readonly Choice[] = [
	{ token: null, name: "inherit", value: "13px" },
	{ token: "text-2xs", name: "text-2xs", value: "10px" },
	{ token: "text-xs", name: "text-xs", value: "11px" },
	{ token: "text-sm", name: "text-sm", value: "12px" },
	{ token: "text-base", name: "text-base", value: "13px" },
	{ token: "text-md", name: "text-md", value: "14px" },
	{ token: "text-lg", name: "text-lg", value: "18px" },
];

/** what a size token leaves the line-height at when no leading token argues */
const PAIRED_LEADING: Record<string, string> = {
	"text-2xs": "12px",
	"text-xs": "16px",
	"text-sm": "18px",
	"text-base": "20px",
	"text-md": "22px",
	"text-lg": "26px",
};

export const LINE_HEIGHT: readonly Choice[] = [
	{ token: null, name: "inherit", value: "20px" },
	{ token: "leading-xs", name: "leading-xs", value: "16px" },
	{ token: "leading-sm", name: "leading-sm", value: "18px" },
	{ token: "leading-base", name: "leading-base", value: "20px" },
	{ token: "leading-md", name: "leading-md", value: "22px" },
	{ token: "leading-lg", name: "leading-lg", value: "26px" },
];

export const FONT_WEIGHT: readonly Choice[] = [
	{ token: null, name: "font-normal", value: "400" },
	{ token: "font-medium", name: "font-medium", value: "500" },
	{ token: "font-semibold", name: "font-semibold", value: "600" },
];

export const FONT_FAMILY: readonly Choice[] = [
	{ token: null, name: "font-sans", value: "Familjen Grotesk" },
	{ token: "font-mono", name: "font-mono", value: "Fragment Mono" },
];

export const LETTER_SPACING: readonly Choice[] = [
	{ token: null, name: "tracking-normal", value: "0em" },
	{ token: "tracking-tight", name: "tracking-tight", value: "-0.01em" },
];

export const RADIUS: readonly Choice[] = [
	{ token: null, name: "rounded-none", value: "0" },
	{ token: "rounded-xs", name: "rounded-xs", value: "4px" },
	{ token: "rounded-sm", name: "rounded-sm", value: "6px" },
	{ token: "rounded-md", name: "rounded-md", value: "8px" },
	{ token: "rounded-lg", name: "rounded-lg", value: "12px" },
	{ token: "rounded-full", name: "rounded-full", value: "9999px" },
];

/** the option the element currently wears, the absent one when it wears none */
export function chosen(list: readonly string[], options: readonly Choice[]): Choice {
	const worn = options.find((option) => option.token !== null && list.includes(option.token));
	return worn ?? options[0] ?? { token: null, name: "", value: "" };
}

/** what line-height computes to when no leading token sets it: the size token decides */
export function leadingFallback(list: readonly string[]): string {
	const size = list.find((candidate) => candidate in PAIRED_LEADING);
	return size === undefined ? "20px" : (PAIRED_LEADING[size] ?? "20px");
}

/**
 * One token out, one token in, everything else where it was: the same splice
 * `withToken` and `withWord` do, over a named set instead of a family prefix.
 */
export function withChoice(className: string | null, options: readonly Choice[], token: string | null): string {
	const known = new Set(options.map((option) => option.token).filter((candidate): candidate is string => candidate !== null));
	const list = tokens(className);
	const at = list.findIndex((candidate) => known.has(candidate));
	if (at === -1) return token === null ? list.join(" ") : [...list, token].join(" ");
	if (token === null) return list.filter((_, index) => index !== at).join(" ");
	return list.map((candidate, index) => (index === at ? token : candidate)).join(" ");
}
