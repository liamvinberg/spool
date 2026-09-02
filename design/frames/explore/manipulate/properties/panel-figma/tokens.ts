/**
 * The named tokens this panel writes, and the splice that writes them.
 *
 * `properties-model.ts` keeps its type and radius tables private and exports
 * only COLORS, so the tables are restated here from design/shared/tokens.css,
 * names and values verbatim. A named token is picked from this set and lands on
 * the literal the same way a number or a word does: one token swapped in place.
 */
import { COLORS, pxValue, STEP, tokens, valuePx } from "shared/lib/spool/properties-model";

export interface Choice {
	token: string;
	/** what the token is worth in tokens.css */
	value: string;
	/** a colour to paint, when the token names one */
	swatch?: string;
}

const COLOR_ORDER = [
	"bg",
	"canvas",
	"surface",
	"raised",
	"border",
	"border-raised",
	"text",
	"muted",
	"thread",
	"on-thread",
] as const;

export function colorChoices(prefix: "bg" | "text" | "border"): Choice[] {
	return COLOR_ORDER.map((name) => {
		const hex = COLORS[name] ?? "";
		return { token: `${prefix}-${name}`, value: hex, swatch: hex };
	});
}

export const BG = colorChoices("bg");
export const TEXT_COLOR = colorChoices("text");
export const BORDER_COLOR = colorChoices("border");

export const FAMILIES: readonly Choice[] = [
	{ token: "font-sans", value: "Familjen Grotesk" },
	{ token: "font-mono", value: "Fragment Mono" },
];

export const TEXT_SIZES: readonly Choice[] = [
	{ token: "text-2xs", value: "10px" },
	{ token: "text-xs", value: "11px" },
	{ token: "text-sm", value: "12px" },
	{ token: "text-base", value: "13px" },
	{ token: "text-md", value: "14px" },
	{ token: "text-lg", value: "18px" },
];

export const WEIGHTS: readonly Choice[] = [
	{ token: "font-normal", value: "400" },
	{ token: "font-medium", value: "500" },
	{ token: "font-semibold", value: "600" },
];

export const LEADINGS: readonly Choice[] = [
	{ token: "leading-xs", value: "16px" },
	{ token: "leading-sm", value: "18px" },
	{ token: "leading-base", value: "20px" },
	{ token: "leading-md", value: "22px" },
	{ token: "leading-lg", value: "26px" },
];

export const TRACKINGS: readonly Choice[] = [
	{ token: "tracking-tight", value: "-0.01em" },
	{ token: "tracking-normal", value: "0em" },
];

export const RADII: readonly Choice[] = [
	{ token: "rounded-xs", value: "4px" },
	{ token: "rounded-sm", value: "6px" },
	{ token: "rounded-md", value: "8px" },
	{ token: "rounded-lg", value: "12px" },
	{ token: "rounded-full", value: "9999px" },
];

/** the token this element wears out of a family, or null when it wears none */
export function namedOf(list: readonly string[], choices: readonly Choice[]): string | null {
	const set = new Set(choices.map((choice) => choice.token));
	return list.find((token) => set.has(token)) ?? null;
}

/** swap the family's token in place, append when absent, drop on null */
export function withNamed(className: string | null, choices: readonly Choice[], next: string | null): string {
	const set = new Set(choices.map((choice) => choice.token));
	const list = tokens(className);
	const index = list.findIndex((token) => set.has(token));
	if (index === -1) return next === null ? list.join(" ") : [...list, next].join(" ");
	if (next === null) return list.filter((_, at) => at !== index).join(" ");
	return list.map((token, at) => (at === index ? next : token)).join(" ");
}

/** a scale value stepped by whole units, 4px each: the arrow keys and the scrub share it */
export function stepValue(current: string | null, measured: number, units: number): string {
	const px = current === null ? measured : (valuePx(current) ?? measured);
	return pxValue(px + units * STEP);
}

export function pxOf(value: string | null): string | null {
	if (value === null) return null;
	const px = valuePx(value);
	return px === null ? null : `${px}px`;
}

/**
 * Tailwind compiles the utilities it can see in this folder's source, and a
 * class the panel builds at runtime (`p-6`, `bg-raised`) is in no source line.
 * Naming them here is what puts them in the document, so an edit re-lays the
 * mock instead of only reading back on the source line.
 */
export const WRITABLE =
	"bg-bg bg-canvas bg-surface bg-raised bg-border bg-border-raised bg-text bg-muted bg-thread bg-on-thread " +
	"text-bg text-canvas text-surface text-raised text-border text-border-raised text-text text-muted text-thread text-on-thread " +
	"border-bg border-canvas border-surface border-raised border-border border-border-raised border-text border-muted border-thread border-on-thread " +
	"font-sans font-mono font-normal font-medium font-semibold " +
	"text-2xs text-xs text-sm text-base text-md text-lg " +
	"leading-xs leading-sm leading-base leading-md leading-lg tracking-tight tracking-normal " +
	"rounded-xs rounded-sm rounded-md rounded-lg rounded-full " +
	"border-0 border border-2 border-4 border-8 " +
	"p-0 p-1 p-2 p-3 p-4 p-5 p-6 p-8 p-10 p-12 " +
	"px-0 px-1 px-2 px-3 px-4 px-5 px-6 px-8 py-0 py-1 py-2 py-3 py-4 py-5 py-6 py-8 " +
	"pt-0 pt-1 pt-2 pt-3 pt-4 pt-6 pr-0 pr-1 pr-2 pr-3 pr-4 pr-6 pb-0 pb-1 pb-2 pb-3 pb-4 pb-6 pl-0 pl-1 pl-2 pl-3 pl-4 pl-6 " +
	"gap-0 gap-1 gap-2 gap-3 gap-4 gap-5 gap-6 gap-8 gap-x-2 gap-x-3 gap-x-4 gap-y-2 gap-y-3 gap-y-4 " +
	"w-8 w-10 w-11 w-12 w-16 w-20 w-24 w-32 w-40 w-48 w-56 w-64 w-72 w-full w-auto " +
	"h-6 h-7 h-8 h-9 h-10 h-11 h-12 h-14 h-16 h-20 h-24 h-32 h-full h-auto " +
	"opacity-0 opacity-10 opacity-20 opacity-25 opacity-30 opacity-40 opacity-50 opacity-60 opacity-70 opacity-75 opacity-80 opacity-90 opacity-100 " +
	"flex grid block inline-flex inline-block hidden flex-row flex-col flex-wrap flex-nowrap " +
	"items-start items-center items-end items-baseline items-stretch " +
	"justify-start justify-center justify-end justify-between justify-around justify-evenly " +
	"static relative absolute fixed sticky overflow-visible overflow-hidden overflow-auto overflow-scroll " +
	"text-left text-center text-right top-0 top-2 top-4 right-0 right-2 right-4 bottom-0 bottom-2 bottom-4 left-0 left-2 left-4";
