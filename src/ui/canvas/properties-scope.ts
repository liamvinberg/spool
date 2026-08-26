import { anatomyOf, composeToken, splitClass } from "../../daemon/class-write";
import type { CompiledTheme } from "../api";

/**
 * The scope the rail edits under (#256), read off an element's literal.
 *
 * A Tailwind literal is several literals in one: the tokens with no prefix are
 * the base, and every variant chain in front of a token — `hover:`, `md:`,
 * `md:dark:` — is its own set of values that only applies when the document
 * says so. The rail edits one of them at a time, which is what the scope bar
 * at the top of it is for, and everything the bar needs is a fact about the
 * literal rather than about any property in it. So it lives here and not in
 * the property model (#257): the shell can draw the bar before a single row
 * exists.
 *
 * The anatomy is the write lane's own (`daemon/class-write.ts`), so a chain the
 * bar shows is a chain a `set-class` op will accept, spelled the same way.
 */

export type VariantGroup = "state" | "screen" | "theme";

export interface Variant {
	prefix: string;
	group: VariantGroup;
	/** what the document needs for it to apply: a pseudo-class, a media query */
	when: string;
}

/**
 * The variants a scope may be opened on before the theme is read.
 *
 * Tailwind's own defaults, which is what every project has until its own
 * breakpoints arrive; `variantsOf` is what the bar actually offers once they
 * do (#257).
 */
export const VARIANTS: readonly Variant[] = [
	{ prefix: "hover", group: "state", when: ":hover" },
	{ prefix: "focus", group: "state", when: ":focus" },
	{ prefix: "focus-visible", group: "state", when: ":focus-visible" },
	{ prefix: "active", group: "state", when: ":active" },
	{ prefix: "disabled", group: "state", when: ":disabled" },
	{ prefix: "sm", group: "screen", when: "width >= 40rem" },
	{ prefix: "md", group: "screen", when: "width >= 48rem" },
	{ prefix: "lg", group: "screen", when: "width >= 64rem" },
	{ prefix: "xl", group: "screen", when: "width >= 80rem" },
	{ prefix: "dark", group: "theme", when: "prefers-color-scheme: dark" },
];

/** The states and the theme variant, which no project renames. */
const CONSTANT: readonly Variant[] = VARIANTS.filter((variant) => variant.group !== "screen");

/**
 * The variants this project has, its own breakpoints included.
 *
 * A project that renamed `md` to `app` has no `md:`, and a bar that offered one
 * would be offering a scope whose tokens the compiler drops on the floor. The
 * screens come from the compiled theme for exactly that reason; the states and
 * `dark:` are Tailwind's own and the same everywhere.
 */
export function variantsOf(theme: CompiledTheme | null): readonly Variant[] {
	if (theme === null) return VARIANTS;
	const screens = theme.screen.map(
		(token): Variant => ({
			prefix: token.name,
			group: "screen",
			when: `width >= ${token.value}`,
		}),
	);
	const states = CONSTANT.filter((variant) => variant.group === "state");
	const themes = CONSTANT.filter((variant) => variant.group === "theme");
	return [...states, ...screens, ...themes];
}

/** A variant chain; the empty one is the base. */
export type Scope = readonly string[];

export const BASE: Scope = [];

export function sameScope(a: Scope, b: Scope): boolean {
	return a.length === b.length && a.every((prefix, index) => prefix === b[index]);
}

/** How a scope is spelled in front of a token, and on the wire: `""`, `"hover:"`. */
export function scopeKey(scope: Scope): string {
	return scope.map((prefix) => `${prefix}:`).join("");
}

/** What the chip says. The base has no prefix to print, so it says what it is. */
export function scopeLabel(scope: Scope): string {
	return scope.length === 0 ? "base" : scopeKey(scope);
}

/** What a scope applies under, for the line beside the bar; nothing for a chain nobody knows. */
export function scopeWhen(scope: Scope): string | undefined {
	if (scope.length === 0) return undefined;
	const said = scope.map((prefix) => VARIANTS.find((variant) => variant.prefix === prefix)?.when);
	return said.every((when) => when !== undefined) ? said.join(" and ") : undefined;
}

/**
 * Every scope the literal carries, the base first and then in the variant
 * table's order.
 *
 * The base is always there, even in a literal made entirely of `hover:` tokens:
 * it is where a property with no variant is written, so it is never something
 * an element can fail to have.
 */
export function scopesOf(className: string): Scope[] {
	const seen: Scope[] = [BASE];
	for (const token of splitClass(className)) {
		const { variants } = anatomyOf(token);
		if (variants.length === 0 || seen.some((scope) => sameScope(scope, variants))) continue;
		seen.push(variants);
	}
	const rank = (scope: Scope): number =>
		scope
			.map((prefix) => VARIANTS.findIndex((variant) => variant.prefix === prefix))
			.reduce((held, index) => held * 100 + index, 0);
	return [BASE, ...seen.slice(1).sort((a, b) => rank(a) - rank(b))];
}

/** True while this token is one of the scope's own. */
export function underScope(token: string, scope: Scope): boolean {
	return sameScope(anatomyOf(token).variants, scope);
}

/** The tokens under one scope, as the literal spells them. */
export function tokensUnder(className: string, scope: Scope): string[] {
	return splitClass(className).filter((token) => underScope(token, scope));
}

/** A token with its variants taken off: what a `set-class` op carries. */
export function bareToken(token: string): string {
	return composeToken({ ...anatomyOf(token), variants: [] });
}

/**
 * How one token of the literal reads, which is three things at once.
 *
 * `spliced` is a token the hands put there rather than the file's author, and it
 * outranks everything else: what you changed has to be visible before anything
 * else about the line. The other two are the lens the scope bar is — the base is
 * every token's scope for this purpose, because at the base nothing is out of
 * view and so nothing should read as if it were.
 */
export type TokenState = "spliced" | "in-scope" | "out-of-scope";

export function tokenState(token: string, scope: Scope, original: ReadonlySet<string>): TokenState {
	if (!original.has(token)) return "spliced";
	return scope.length === 0 || underScope(token, scope) ? "in-scope" : "out-of-scope";
}

/**
 * The literal under one scope, with the prefixes taken off.
 *
 * This is what every row reads and what a write starts from: `hover:bg-thread`
 * under `hover:` is `bg-thread`, and the property model never has to know that
 * a variant was involved. The base is the tokens that carry no chain at all,
 * which is the same thing the write lane means by it.
 */
export function scopedClass(className: string, scope: Scope): string {
	return tokensUnder(className, scope).map(bareToken).join(" ");
}
