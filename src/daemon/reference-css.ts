/**
 * The text work on a reference's styles and markup (spool#241), with no network and no disk: the url()s a sheet
 * names, its @imports, and the viewport heights it states. A reference keeps the site's own CSS and class names, so
 * none of this rewrites a selector: only urls and declaration values move.
 */

const URL_TOKEN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;

/** Every url() in a stylesheet, each replaced by what `to` answers for its address as written. */
export function mapCssUrls(css: string, to: (raw: string) => string): string {
	return css.replace(URL_TOKEN, (whole, double?: string, single?: string, bare?: string) => {
		const raw = (double ?? single ?? bare ?? "").trim();
		if (raw === "" || raw.startsWith("#") || /^data:/i.test(raw)) return whole;
		const next = to(raw);
		return next === raw ? whole : `url("${next.replaceAll('"', "%22")}")`;
	});
}

/** An address as written in a sheet, made absolute against the sheet's own; nothing for one that can't be. */
export function absoluteUrl(raw: string, base: string): string | undefined {
	try {
		const url = new URL(raw, base);
		return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
	} catch {
		return undefined;
	}
}

/** Every url() made absolute against the sheet's address, so the sheet reads the same wherever it lands. */
export function absoluteCssUrls(css: string, base: string): string {
	return mapCssUrls(css, (raw) => absoluteUrl(raw, base) ?? raw);
}

const IMPORT_RULE = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/gi;

/** One `@import` of a sheet: where it points, resolved, and the media (or layer, supports) it was under. */
export interface CssImport {
	rule: string;
	href: string | undefined;
	condition: string;
}

export function cssImports(css: string, base: string): CssImport[] {
	return [...css.matchAll(IMPORT_RULE)].map((match) => {
		const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
		return { rule: match[0], href: absoluteUrl(raw, base), condition: (match[6] ?? "").trim() };
	});
}

/** A sheet under a media list, as a link's `media` or an import's condition put it; as it was for none or `all`. */
export function underMedia(css: string, media: string | undefined): string {
	const condition = (media ?? "").trim();
	if (condition === "" || condition.toLowerCase() === "all") return css;
	// a layer() or supports() condition is not a media list, and a sheet under one is kept whole rather than guessed at
	if (/^(?:layer|supports)\b/i.test(condition)) return css;
	return `@media ${condition} {\n${css}\n}`;
}

/** A sheet without what may only open one: a nested @charset is an error, and an @import past the top is ignored. */
export function nestable(css: string): string {
	return css.replace(/@charset\s+"[^"]*"\s*;/gi, "");
}

/**
 * Each declaration of a sheet handed to `map`, and nothing else: selectors, at-rule preludes and nested rules are
 * passed over, strings and comments kept as they are. A class named `h-100vh` stays a class; `height: 100vh` moves.
 */
export function mapDeclarations(css: string, map: (declaration: string) => string): string {
	let out = "";
	let depth = 0;
	let segment = "";
	let at = 0;
	const flush = (end: string) => {
		// a segment closed by `{` is a selector or an at-rule's prelude, never a declaration
		out += depth > 0 && end !== "{" && segment.includes(":") ? map(segment) : segment;
		out += end;
		segment = "";
	};
	while (at < css.length) {
		const char = css[at] ?? "";
		if (char === "/" && css[at + 1] === "*") {
			const close = css.indexOf("*/", at + 2);
			const end = close === -1 ? css.length : close + 2;
			segment += css.slice(at, end);
			at = end;
			continue;
		}
		if (char === '"' || char === "'") {
			let end = at + 1;
			while (end < css.length && css[end] !== char) end += css[end] === "\\" ? 2 : 1;
			segment += css.slice(at, end + 1);
			at = end + 1;
			continue;
		}
		if (char === "{") {
			flush("{");
			depth += 1;
		} else if (char === "}") {
			flush("}");
			depth = Math.max(0, depth - 1);
		} else if (char === ";") {
			flush(";");
		} else {
			segment += char;
		}
		at += 1;
	}
	out += segment;
	return out;
}

/** The viewport-relative heights a value names (`vh`, `svh`, `dvh`, `vmin`…), in the pixels they were on the page. */
export function viewportHeightsInPixels(value: string, viewport: { w: number; h: number }): string {
	return value.replace(
		/(^|[\s:(,*/+]|[\s:(,]-)(\d*\.?\d+)(?:[sld])?(vh|vmin|vmax)(?![\w-])/gi,
		(_whole, before: string, number: string, unit: string) => {
			const per =
				unit.toLowerCase() === "vh"
					? viewport.h
					: unit.toLowerCase() === "vmin"
						? Math.min(viewport.w, viewport.h)
						: Math.max(viewport.w, viewport.h);
			return `${before}${round((Number(number) * per) / 100)}px`;
		},
	);
}

/** A whole sheet's viewport heights pinned, its selectors untouched: the frame is as tall as the capture, not a screen. */
export function pinViewportHeights(css: string, viewport: { w: number; h: number }): string {
	return mapDeclarations(css, (declaration) => viewportHeightsInPixels(declaration, viewport));
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** The url()s inside the `src` of each @font-face, the first the browser would take of each: woff2 before the rest. */
export function fontFaceSources(css: string): string[] {
	const found: string[] = [];
	for (const face of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
		const src = /(?:^|[;{\s])src\s*:\s*([^;]*)/i.exec(face[1] ?? "")?.[1] ?? "";
		const candidates = src.split(/,(?![^(]*\))/).flatMap((part) => {
			const url = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/i.exec(part);
			const raw = url?.[1] ?? url?.[2] ?? url?.[3];
			if (raw === undefined || /^data:/i.test(raw)) return [];
			const format = /format\(\s*["']?([\w-]+)/i.exec(part)?.[1]?.toLowerCase();
			return [{ raw, format }];
		});
		const usable = candidates.find(
			({ raw, format }) =>
				(format !== undefined && /^(?:woff2|woff|truetype|opentype)/.test(format)) ||
				(format === undefined && !/\.(?:eot|svg)(?:[?#]|$)/i.test(raw)),
		);
		if (usable !== undefined) found.push(usable.raw);
	}
	return found;
}
