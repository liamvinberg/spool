import type { CompiledTheme, ThemeToken } from "../api";

/**
 * The compiled theme, as the rail's menus read it (#257).
 *
 * The daemon answers with the theme the frames are compiled against — this
 * project's colours, sizes, radii and breakpoints, each marked as the
 * project's own or as one of Tailwind's it left alone. This module is the
 * canvas's half: it turns those lists into what a menu offers, and it resolves
 * what a token means so a row can say `14px` beside `text-md`.
 *
 * Nothing here invents a value. A project with no theme read yet has no menu,
 * which is honest; a menu of Tailwind's defaults over a project that renamed
 * them would not be.
 */

/** Which of the theme's lists a row reads from. */
export type ThemeList = keyof Omit<CompiledTheme, "step">;

/** One thing a menu offers: the token it writes, and what that resolves to. */
export interface MenuOption {
	/** the whole token a row writes: `text-md`, `rounded-lg`, `bg-thread` */
	token: string;
	/** the theme's own name for it, which is what the menu lists: `md` */
	name: string;
	/** what it resolves to, faint beside it: `14px` */
	says: string;
	/** the project's own token, or one of Tailwind's under the `default` divider */
	from: "project" | "default";
}

/** One spacing step in pixels, which is what a number box counts in. */
export const STEP = 4;

export function stepOf(theme: CompiledTheme | null): number {
	return theme?.step ?? STEP;
}

/**
 * The colours every project has that are not theme values.
 *
 * `transparent`, `currentColor` and `inherit` are the utility's own words
 * rather than variables, so the theme never carries them and a colour menu that
 * left them out would be missing the most reachable answers in it. The write
 * lane knows the same three, which is what keeps `text-inherit` a colour on
 * both sides.
 */
export const KEYWORD_COLOURS: readonly { name: string; paint: string }[] = [
	{ name: "transparent", paint: "transparent" },
	{ name: "current", paint: "currentColor" },
	{ name: "inherit", paint: "inherit" },
];

/** What a theme value is worth in pixels, or nothing when it is not a length. */
export function pxOf(value: string): number | undefined {
	const found = /^(-?\d+(?:\.\d+)?)(px|rem)$/.exec(value.trim());
	if (found?.[1] === undefined) return undefined;
	return found[2] === "rem" ? Number(found[1]) * 16 : Number(found[1]);
}

/**
 * What the faint half of a row says for a theme value.
 *
 * Pixels, wherever the value is a length: a rail that reads `1.25rem` back to
 * somebody looking at a 20px line is making them do arithmetic to check their
 * own screen.
 */
export function saysOf(value: string): string {
	const px = pxOf(value);
	return px === undefined ? value : `${Number(px.toFixed(2))}px`;
}

export function listOf(theme: CompiledTheme | null, list: ThemeList): readonly ThemeToken[] {
	return theme === null ? [] : theme[list];
}

/**
 * A theme list as a menu: the project's tokens first, Tailwind's after them.
 *
 * The order is the daemon's, which is the order the answer to "what does this
 * project call its colours" has to come in. The `from` mark rides along so the
 * menu can draw its one divider without a second question.
 */
export function menuOf(theme: CompiledTheme | null, list: ThemeList, prefix: string): MenuOption[] {
	return listOf(theme, list).map((token) => ({
		token: `${prefix}-${token.name}`,
		name: token.name,
		says: saysOf(token.value),
		from: token.from,
	}));
}

/** The theme value one name stands for, or nothing when the theme does not have it. */
export function themeValue(theme: CompiledTheme | null, list: ThemeList, name: string): ThemeToken | undefined {
	return listOf(theme, list).find((token) => token.name === name);
}

/**
 * The colour a name paints, including the two words that are not theme values
 * and an arbitrary colour written straight into the class.
 */
export function paintOf(theme: CompiledTheme | null, name: string): string | undefined {
	const keyword = KEYWORD_COLOURS.find((colour) => colour.name === name);
	if (keyword !== undefined) return keyword.paint;
	const bracket = /^\[(.+)\]$/.exec(name);
	if (bracket?.[1] !== undefined) return arbitraryColour(bracket[1].replace(/_/g, " ")) ?? undefined;
	if (/^\(--[a-z0-9-]+\)$/.test(name)) return `var(${name.slice(1, -1)})`;
	return themeValue(theme, "colour", name)?.value;
}

/** A raw CSS colour a class may carry in brackets: `#ff0044`, `oklch(63% 0.2 25)`, `var(--x)`. */
export function arbitraryColour(text: string): string | null {
	const paint = text.trim();
	if (/^#[0-9a-fA-F]{3,8}$/.test(paint)) return paint;
	if (/^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|color-mix|var)\(.*\)$/.test(paint)) return paint;
	return null;
}

/**
 * A typed colour as the name half of a token: `#ff0044` becomes `[#ff0044]`.
 *
 * One reading of what counts as a colour, because a row that took a value its
 * own menu would not read back is a row you cannot undo by hand.
 */
export function arbitraryColourName(typed: string): string | null {
	const text = typed.trim();
	if (/^\[.+\]$/.test(text) || /^\(--[a-z0-9-]+\)$/.test(text)) return text;
	return arbitraryColour(text) === null ? null : `[${text.replace(/\s+/g, "_")}]`;
}

/** A paint under an alpha, which is what the swatch shows for `bg-thread/50`. */
export function paintWith(paint: string, alpha: number | null): string {
	if (alpha === null || paint === "transparent" || paint === "currentColor") return paint;
	return `color-mix(in oklab, ${paint} ${alpha}%, transparent)`;
}

/**
 * Whether a name is one the theme knows, which is how a colour token is told
 * from a utility that merely starts the same way — `bg-thread` is a colour and
 * `bg-linear-to-r` is a gradient, and only the theme can say which.
 */
export function knowsColour(theme: CompiledTheme | null, name: string): boolean {
	return paintOf(theme, name) !== undefined;
}
