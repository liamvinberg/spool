import { statSync } from "node:fs";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { anatomyOf, type ClassTheme } from "./class-write";
import { realDesignDir } from "./design-path";
import { designStylesheets, ROOT_CSS } from "./tailwind";

/**
 * The compiled theme, exposed to the canvas (#257).
 *
 * A properties menu that lists Tailwind's defaults while the project's
 * tokens.css says otherwise is lying: this project's `text-base` is 13px, its
 * `rounded-lg` is 12px, and `thread` is a colour Tailwind has never heard of.
 * So the menus read the theme the frames are actually compiled against — the
 * same stylesheets `buildFrameCss` reads, loaded through the same pinned
 * Tailwind — and the project's own tokens come first with Tailwind's under a
 * `default` divider.
 *
 * The compiler is also the gate on the rail's free class field: a token lands
 * only when Tailwind has a utility for it, and the CSS it compiles to is what
 * the field shows beside it. Reimplementing that gate in the canvas would be a
 * second opinion about the project's own theme, and the wrong one the moment a
 * project renames a breakpoint, so the answer comes from the compiler itself.
 */

/** One theme value, as a utility wears it: `thread`, `red-500`, `md`. */
export interface ThemeToken {
	name: string;
	/** what it resolves to: `#F5391A`, `14px`, `0.75rem` */
	value: string;
	/** the project's own, or one of Tailwind's that it left alone */
	from: "project" | "default";
}

/**
 * Every list a properties menu offers, plus the scale one number box steps by.
 *
 * The names are the utility's half of the variable — `--color-thread` is the
 * colour `thread`, which is `bg-thread` and `text-thread` — because that is
 * what a row writes and what a literal is read back against.
 */
export interface CompiledTheme {
	colour: ThemeToken[];
	text: ThemeToken[];
	weight: ThemeToken[];
	font: ThemeToken[];
	leading: ThemeToken[];
	tracking: ThemeToken[];
	radius: ThemeToken[];
	shadow: ThemeToken[];
	ease: ThemeToken[];
	/** the breakpoints, which are the screen variants a scope may be opened on */
	screen: ThemeToken[];
	/** one spacing step in px: `p-4` is four of these */
	step: number;
}

/** A candidate class put to the compiler: what it compiles to, or why it does not. */
export type CompiledClass = { ok: true; token: string; css: string } | { ok: false; token: string; reason: string };

/**
 * Tailwind's design system, as much of it as the theme read needs.
 *
 * `__unstable__loadDesignSystem` is the entry Tailwind's own IntelliSense uses
 * and the only one that answers for theme values nothing has used yet — the
 * built stylesheet carries a project token only once some utility asks for it,
 * which would leave a menu listing whatever the frame happened to wear. Spool
 * pins Tailwind to an exact version, so the shape below is a fact about the
 * install rather than a guess about the package.
 */
interface DesignSystem {
	theme: { entries(): Iterable<readonly [string, { value: string; options: number }]> };
	candidatesToCss(candidates: string[]): (string | null)[];
	parseVariant(variant: string): unknown;
}

/** Tailwind's ThemeOptions.DEFAULT: the value came from its own theme.css, untouched. */
const DEFAULT = 4;

interface Held {
	system: DesignSystem;
	/** the project stylesheets the load read, and their state when it did */
	stylesheets: string[];
	stamp: string;
}

const held = new Map<string, Held>();

/** What the project's stylesheets look like right now, so a changed tokens.css reloads. */
function stampOf(stylesheets: readonly string[]): string {
	return stylesheets
		.map((file) => {
			try {
				return `${file}:${statSync(file).mtimeMs}`;
			} catch {
				return `${file}:gone`;
			}
		})
		.join("\n");
}

async function designSystem(designDir: string): Promise<DesignSystem> {
	const standing = held.get(designDir);
	if (standing !== undefined && stampOf(standing.stylesheets) === standing.stamp) return standing.system;
	const sheets = designStylesheets(designDir);
	const loaded = (await __unstable__loadDesignSystem(ROOT_CSS, {
		base: sheets.base,
		loadStylesheet: sheets.loadStylesheet,
		loadModule: sheets.loadModule,
	})) as unknown as DesignSystem;
	const stylesheets = [...sheets.stylesheets];
	held.set(designDir, { system: loaded, stylesheets, stamp: stampOf(stylesheets) });
	return loaded;
}

/** The namespaces a menu is built from, longest first so `--font-weight-` beats `--font-`. */
const NAMESPACES: readonly { prefix: string; list: keyof Omit<CompiledTheme, "step"> }[] = [
	{ prefix: "--color-", list: "colour" },
	{ prefix: "--font-weight-", list: "weight" },
	{ prefix: "--font-", list: "font" },
	{ prefix: "--text-", list: "text" },
	{ prefix: "--leading-", list: "leading" },
	{ prefix: "--tracking-", list: "tracking" },
	{ prefix: "--radius-", list: "radius" },
	{ prefix: "--shadow-", list: "shadow" },
	{ prefix: "--ease-", list: "ease" },
	{ prefix: "--breakpoint-", list: "screen" },
];

/**
 * Namespaces that begin like one a menu offers and are not it.
 *
 * `--text-shadow-sm` is a shadow behind text, not a font size called
 * `shadow-sm`, and the rail has no row for it — so it is skipped rather than
 * listed under a heading it does not belong to.
 */
const NOT_A_MENU: readonly string[] = ["--text-shadow-"];

/**
 * A theme variable's list and name, or nothing when it is not one a menu offers.
 *
 * `--text-lg--line-height` is the size's paired leading rather than a size of
 * its own, and `--color-*` with no name at all is the namespace reset a project
 * writes to clear Tailwind's palette — Tailwind has already applied it by the
 * time the theme is read, so there is nothing here to carry.
 */
function placeOf(variable: string): { list: keyof Omit<CompiledTheme, "step">; name: string } | undefined {
	if (NOT_A_MENU.some((prefix) => variable.startsWith(prefix))) return undefined;
	for (const { prefix, list } of NAMESPACES) {
		if (!variable.startsWith(prefix)) continue;
		const name = variable.slice(prefix.length);
		if (name === "" || name.includes("--")) return undefined;
		return { list, name };
	}
	return undefined;
}

/** A CSS length as pixels, for the scale step; rem is the browser's 16. */
function pxOf(value: string): number | undefined {
	const found = /^(-?\d+(?:\.\d+)?)(px|rem)$/.exec(value.trim());
	if (found?.[1] === undefined) return undefined;
	return found[2] === "rem" ? Number(found[1]) * 16 : Number(found[1]);
}

/**
 * The project's theme, its own tokens first.
 *
 * Order is the answer to the menu's whole question — what does *this* project
 * call its colours — so the project's tokens lead every list and Tailwind's
 * defaults follow, each keeping the order the theme resolved them in.
 */
export async function readTheme(root: string): Promise<CompiledTheme> {
	const system = await designSystem(realDesignDir(root));
	const theme: CompiledTheme = {
		colour: [],
		text: [],
		weight: [],
		font: [],
		leading: [],
		tracking: [],
		radius: [],
		shadow: [],
		ease: [],
		screen: [],
		step: 4,
	};
	const defaults: Record<string, ThemeToken[]> = {};
	for (const [variable, entry] of system.theme.entries()) {
		if (variable === "--spacing") {
			theme.step = pxOf(entry.value) ?? theme.step;
			continue;
		}
		const place = placeOf(variable);
		if (place === undefined) continue;
		const from = (entry.options & DEFAULT) === DEFAULT ? "default" : "project";
		const token: ThemeToken = { name: place.name, value: entry.value, from };
		if (from === "project") {
			theme[place.list].push(token);
			continue;
		}
		const standing = defaults[place.list] ?? [];
		standing.push(token);
		defaults[place.list] = standing;
	}
	for (const [list, tokens] of Object.entries(defaults)) {
		theme[list as keyof Omit<CompiledTheme, "step">].push(...tokens);
	}
	return theme;
}

/**
 * The theme as the write lane needs it: which names each family has.
 *
 * The lane has to tell `text-md` the size from `text-muted` the colour before
 * it can decide what a write replaces, and only the project's own theme knows
 * which is which. A project that never opened its tokens.css gets Tailwind's
 * naming, which is what it is running anyway.
 */
export async function classThemeFor(root: string): Promise<ClassTheme | undefined> {
	try {
		return classThemeOf(await readTheme(root));
	} catch {
		// a tokens.css that will not compile is not a reason to refuse a write:
		// the lane falls back to Tailwind's own naming, as it did before
		return undefined;
	}
}

export function classThemeOf(theme: CompiledTheme): ClassTheme {
	const names = (list: readonly ThemeToken[]) => new Set(list.map((token) => token.name));
	return {
		colour: names(theme.colour),
		text: names(theme.text),
		weight: names(theme.weight),
		font: names(theme.font),
		leading: names(theme.leading),
		tracking: names(theme.tracking),
		shadow: names(theme.shadow),
		ease: names(theme.ease),
		radius: names(theme.radius),
	};
}

/**
 * What the compiler says about candidate classes, one answer each.
 *
 * The reason a class does not land is the useful half: an unknown variant is a
 * typo in the prefix, an unknown utility is a typo in the name, and an image is
 * neither — it is an import, which is a different act altogether.
 */
export async function compileClasses(root: string, tokens: readonly string[]): Promise<CompiledClass[]> {
	const system = await designSystem(realDesignDir(root));
	const asked = tokens.map((token) => token.trim());
	const css = system.candidatesToCss(asked);
	return asked.map((token, index) => {
		const spool = spoolRefusal(token);
		if (spool !== undefined) return { ok: false, token, reason: spool };
		const compiled = css[index];
		if (compiled !== null && compiled !== undefined) return { ok: true, token, css: compiled.trim() };
		return { ok: false, token, reason: refusalFor(system, token) };
	});
}

/**
 * Spool's own refusals, which come before the compiler's opinion.
 *
 * `bg-[url(cat.png)]` compiles perfectly well and paints nothing: a frame's
 * images are imports the bundler carries, so a raw url() in a class points at
 * a path the served document does not have. Tailwind cannot know that, and a
 * class that lands and does nothing is worse than one that says why.
 */
function spoolRefusal(token: string): string | undefined {
	if (token === "" || /\s/.test(token)) return "one class at a time";
	if (/-\[url\(/.test(token)) return "an image is an import, not a class";
	return undefined;
}

function refusalFor(system: DesignSystem, token: string): string {
	// the write lane's own reading of a token, so a refusal names the same base
	// and the same variants a write would have acted on
	const anatomy = anatomyOf(token);
	for (const variant of anatomy.variants) {
		if (system.parseVariant(variant) === null) return `no variant ${variant}:`;
	}
	if (anatomy.base === "") return "a variant needs a class after it";
	return `no utility ${anatomy.negative ? "-" : ""}${anatomy.base}`;
}
