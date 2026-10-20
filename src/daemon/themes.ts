import { posix, relative, resolve, sep } from "node:path";
import { designRelativePath } from "./design-boundary";

/**
 * A frame's own look (DEV-284). A stylesheet that imports `tailwindcss`, the
 * standard Tailwind v4 entry form, is a theme: a frame whose imports reach one
 * compiles against it instead of shared/tokens.css, and carries its fonts
 * instead of shared/fonts.css. Every other stylesheet stays plain component CSS.
 */

const TAILWIND_ENTRY = /@import\s+(?:url\(\s*)?["']tailwindcss["']/i;

/** Whether a stylesheet's text makes it a theme: an `@import "tailwindcss"` outside its comments. */
export function isThemeStylesheet(css: string): boolean {
	return TAILWIND_ENTRY.test(css.replace(/\/\*[\s\S]*?\*\//g, ""));
}

/**
 * The one theme a frame's source closure reaches, or none. Two different
 * themes are a frame that cannot choose its look, and fail its compile.
 */
export function frameTheme(designDir: string, sources: { file: string; text: string }[]): string | undefined {
	const themes = [
		...new Set(
			sources.filter(({ file, text }) => file.endsWith(".css") && isThemeStylesheet(text)).map((s) => s.file),
		),
	];
	if (themes.length > 1) {
		const named = themes.map((file) => `design/${designRelativePath(designDir, file)}`);
		throw new Error(
			`this frame reaches two themes, ${named.join(" and ")} — a frame imports one theme; shared components use token names and wear the theme of the frame that uses them`,
		);
	}
	return themes[0];
}

// A quoted url is taken whole, so a url() inside a data URI is never a token of its own.
const URL_TOKEN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s]+))\s*\)/gi;

/**
 * A theme stylesheet's relative `url()`s, rewritten to resolve from shared/ as
 * fonts.css's do: Tailwind inlines every stylesheet a theme imports into one,
 * so a path written from its own folder would no longer resolve. The fonts it
 * names are then carried by the same rules as fonts.css's.
 */
export function rebaseThemeUrls(css: string, file: string, sharedDir: string): string {
	return css.replace(URL_TOKEN, (whole, double?: string, single?: string, bare?: string) => {
		const quote = double !== undefined ? '"' : single !== undefined ? "'" : "";
		const url = (double ?? single ?? bare ?? "").trim();
		if (url.startsWith("/") || url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return whole;
		const rebased = relative(sharedDir, resolve(file, "..", url))
			.split(sep)
			.join(posix.sep);
		return `url(${quote}${rebased}${quote})`;
	});
}
