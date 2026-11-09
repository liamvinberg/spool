import { createHash } from "node:crypto";
import type { ReferenceCapture } from "../reference-wire";
import { lookupHost, type PublicFile, publicFetch, publicGet } from "./public-fetch";
import {
	absoluteCssUrls,
	absoluteUrl,
	asScripted,
	cssImports,
	facesShown,
	fontFaceSources,
	mapCssUrls,
	nestable,
	pinViewportHeights,
	underMedia,
	viewportHeightsInPixels,
} from "./reference-css";
import { referenceLiveHead, referenceLiveScript } from "./reference-live";

/**
 * A capture made into one page (spool#241): the site's markup and its own stylesheets, class names and all, every
 * image and font it names downloaded so the reference outlives the site. Whatever can't be had (a refused or failed
 * fetch, a file past the caps, a kind spool doesn't serve) keeps its address on the web and is counted, never fatal.
 */

/** One file off the web, for a reference: the seam a test serves fixtures through. */
export type ReferenceFetch = (
	url: string,
	options: { signal: AbortSignal; maxBytes: number; referer: string },
) => Promise<PublicFile | undefined>;

/** Chrome's own words, which is who asked for these files in the first place. */
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** The public web, through the guard every fetch the daemon makes for somebody else goes through. */
export function publicReferenceFetch(): ReferenceFetch {
	const fetch = publicFetch();
	return (url, { signal, maxBytes, referer }) =>
		publicGet(url, { fetch, lookup: lookupHost, signal, maxBytes, headers: { "user-agent": BROWSER_UA, referer } });
}

export interface ReferenceLimits {
	/** how many files one reference downloads */
	files: number;
	/** the largest one file may be */
	fileBytes: number;
	/** all of them together */
	totalBytes: number;
	/** how long the fetching may take, all of it */
	ms: number;
	/** how many fetches at once */
	parallel: number;
}

export const REFERENCE_LIMITS: ReferenceLimits = {
	files: 400,
	fileBytes: 8_000_000,
	totalBytes: 48_000_000,
	ms: 25_000,
	parallel: 8,
};

/** The page, and the files it names beside it as `assets/<name>`. */
export interface ReferencePage {
	html: string;
	assets: Map<string, Buffer>;
	/** how many files the page names that stayed on the web */
	missed: number;
	/** the videos it names, which play from the site: kept, they would weigh down every copy of the project */
	linked: number;
}

/** What a file is, read from its first bytes: a site's content type is often wrong and an extension often absent. */
export function sniffAsset(bytes: Buffer): string | undefined {
	const ascii = (at: number, text: string) => bytes.subarray(at, at + text.length).toString("latin1") === text;
	if (bytes[0] === 0x89 && ascii(1, "PNG")) return ".png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
	if (ascii(0, "GIF8")) return ".gif";
	if (ascii(0, "RIFF") && ascii(8, "WEBP")) return ".webp";
	if (ascii(4, "ftypavif") || ascii(4, "ftypavis")) return ".avif";
	if (ascii(0, "wOF2")) return ".woff2";
	if (ascii(0, "wOFF")) return ".woff";
	if (ascii(0, "OTTO")) return ".otf";
	if ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || ascii(0, "true")) return ".ttf";
	const head = bytes.subarray(0, 1024).toString("utf8").trimStart();
	if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return ".svg";
	return undefined;
}

/** an address that names a video by its extension, which is how a page's markup names its videos */
function isVideo(url: string): boolean {
	return /\.(?:mp4|m4v|webm|mov|m3u8)(?:[?#]|$)/i.test(url);
}

/** The capture as one page, its files fetched within the caps. */
export async function referencePage(
	capture: ReferenceCapture,
	deps: { fetch: ReferenceFetch; limits?: Partial<ReferenceLimits> },
): Promise<ReferencePage> {
	const limits = { ...REFERENCE_LIMITS, ...deps.limits };
	const signal = AbortSignal.timeout(limits.ms);
	const referer = capture.url;
	const get = (url: string, maxBytes: number) =>
		signal.aborted ? Promise.resolve(undefined) : deps.fetch(url, { signal, maxBytes, referer });

	const sheets = await Promise.all(
		capture.styles.map(async (style) => {
			if (style.kind === "text") return underMedia(await inlineImports(style.text, style.base, get, 0), style.media);
			const file = await get(style.href, limits.fileBytes);
			if (file === undefined) return "";
			const text = file.bytes.toString("utf8");
			return underMedia(await inlineImports(text, file.url, get, 0), style.media);
		}),
	);
	const css = sheets.filter((sheet) => sheet !== "").join("\n");

	const markup = cleanMarkup(capture.html);
	const pageBase = capture.url;
	const ownBody = /^\s*<body[\s>]/i.test(markup);
	// a whole page sent as the body's insides is marked on the body this page gives it
	const marked = capture.whole && !ownBody ? { "data-spool-reference": "" } : {};
	const htmlOpen = mapMarkupUrls(`<html${attributes(capture.htmlAttrs)}>`, pageBase, (url) => url);
	const body = mapMarkupUrls(
		ownBody ? markup : `<body${attributes({ ...capture.bodyAttrs, ...marked })}>${markup}</body>`,
		pageBase,
		(url) => url,
	);

	// what to fetch, in the order it matters: the markup's own images, the faces, then whatever else the sheets name
	// the faces the page never loaded stay on the web, as do the formats a face offers besides the one the browser takes
	const unused = new Set(capture.unusedFonts ?? []);
	const faces = fontFaceSources(css).filter((url) => !unused.has(url));
	const otherFaces = new Set(fontFaceUrls(css).filter((url) => !faces.includes(url)));
	const wanted = new Set<string>();
	for (const url of [...markupUrls(htmlOpen), ...markupUrls(body)]) wanted.add(url);
	for (const url of faces) wanted.add(url);
	for (const url of [...cssUrls(css), ...cssUrls(capture.animations)]) {
		if (!otherFaces.has(url)) wanted.add(url);
	}
	const web = [...wanted].filter((url) => /^https?:/i.test(url));
	const fetchable = web.filter((url) => !isVideo(url)).slice(0, limits.files);

	const local = new Map<string, string>();
	const assets = new Map<string, Buffer>();
	let total = 0;
	let next = 0;
	const worker = async () => {
		while (next < fetchable.length) {
			const url = fetchable[next++] ?? "";
			const file = await get(url, limits.fileBytes);
			if (file === undefined) continue;
			const extension = sniffAsset(file.bytes);
			if (extension === undefined || total + file.bytes.byteLength > limits.totalBytes) continue;
			total += file.bytes.byteLength;
			const name = `${createHash("sha256").update(file.bytes).digest("hex").slice(0, 16)}${extension}`;
			assets.set(name, file.bytes);
			local.set(url, `assets/${name}`);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, limits.parallel) }, worker));
	const linked = web.filter(isVideo).length;
	const missed = web.filter((url) => !local.has(url)).length - linked;

	const toLocal = (url: string) => local.get(url) ?? url;
	const pinned = (text: string) =>
		facesShown(asScripted(pinViewportHeights(mapCssUrls(text, toLocal), capture.viewport)));
	const page = [
		"<!doctype html>",
		mapMarkupUrls(htmlOpen, pageBase, toLocal, capture.viewport),
		"<head>",
		'<meta charset="utf-8">',
		referenceLiveHead(),
		`<title>${escapeText(capture.title)}</title>`,
		`<style data-spool="site">\n${pinned(css)}\n</style>`,
		capture.animations.trim() === ""
			? ""
			: `<style data-spool="animations">\n${pinned(capture.animations)}\n</style>`,
		`<style data-spool="reference">\n${referenceRules(capture)}\n</style>`,
		"</head>",
		mapMarkupUrls(body, pageBase, toLocal, capture.viewport).replace(
			/<\/body\s*>\s*$/i,
			() => `${referenceLiveScript()}</body>`,
		),
		"</html>",
		"",
	]
		.filter((line) => line !== "")
		.join("\n");
	return { html: page, assets, missed, linked };
}

type Get = (url: string, maxBytes: number) => Promise<PublicFile | undefined>;

/** A sheet with its @imports in place, as deep as three, every url() absolute against the sheet it was written in. */
async function inlineImports(css: string, base: string, get: Get, depth: number): Promise<string> {
	let out = absoluteCssUrls(nestable(css), base);
	if (depth >= 3) return out;
	for (const found of cssImports(css, base)) {
		const file = found.href === undefined ? undefined : await get(found.href, 4_000_000);
		const inlined =
			file === undefined
				? ""
				: underMedia(await inlineImports(file.bytes.toString("utf8"), file.url, get, depth + 1), found.condition);
		out = out.replace(absoluteCssUrls(found.rule, base), () => inlined);
	}
	return out;
}

/** Every url() inside an @font-face, whichever format it offers. */
function fontFaceUrls(css: string): string[] {
	return [...css.matchAll(/@font-face\s*\{([^}]*)\}/gi)].flatMap((face) => cssUrls(face[1] ?? ""));
}

function cssUrls(css: string): string[] {
	const found: string[] = [];
	mapCssUrls(css, (raw) => {
		found.push(raw);
		return raw;
	});
	return found;
}

/**
 * The markup without what can't or mustn't run in a reference: scripts, their fallbacks, and the page's own head.
 * Templates stay: the extension sends open shadow roots as declarative ones, and a web component (MDN's, a video
 * player's) draws nothing without its own.
 */
function cleanMarkup(html: string): string {
	return html
		.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
		.replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, "")
		.replace(/<(?:base|meta|link)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi, "");
}

const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)(\s*\/?)>/g;
const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi;

/**
 * Every resource address in the markup handed to `to`, made absolute against the page first: images and their
 * posters, the url()s of inline styles and <style> blocks. A link's href is a place, not a file, and is left alone.
 * With a viewport, inline styles also have their viewport heights pinned.
 */
function mapMarkupUrls(
	html: string,
	base: string,
	to: (absolute: string) => string,
	viewport?: { w: number; h: number },
): string {
	const resolve = (raw: string) => {
		const absolute = absoluteUrl(decodeEntities(raw.trim()), base);
		return absolute === undefined ? raw : escapeAttribute(to(absolute));
	};
	const tags = html.replace(TAG, (_whole, name: string, attrs: string, close: string) => {
		const tag = name.toLowerCase();
		// a <source> beside an <img> offers the browser other files; the <img> keeps the one it chose
		if (tag === "source" && /\ssrcset\s*=/i.test(attrs)) return "";
		const hasSrc = /\ssrc\s*=/i.test(attrs);
		const mapped = attrs.replace(
			ATTRIBUTE,
			(attr, space: string, rawName: string, equals?: string, double?: string, single?: string, bare?: string) => {
				const value = double ?? single ?? bare;
				const key = rawName.toLowerCase();
				if (value === undefined || equals === undefined) return attr;
				if (key.startsWith("on")) return "";
				if (key === "loading" || key === "sizes") return "";
				if (key === "srcset" && tag === "img") {
					// the image it showed is its src, once the extension has said so; with none, the largest it offered
					if (hasSrc) return "";
					const last = value.split(",").pop()?.trim().split(/\s+/)[0] ?? "";
					return `${space}src="${resolve(last)}"`;
				}
				const resource =
					key === "src" ||
					key === "poster" ||
					((key === "href" || key === "xlink:href") && (tag === "image" || tag === "use"));
				if (resource && !value.startsWith("#") && !/^data:/i.test(value)) {
					return `${space}${rawName}="${resolve(value)}"`;
				}
				if (key === "style") {
					return `${space}style="${escapeAttribute(inlineStyle(decodeEntities(value), (raw) => resolveCss(raw, base, to), viewport))}"`;
				}
				return attr;
			},
		);
		return `<${name}${mapped}${close}>`;
	});
	return tags.replace(STYLE_BLOCK, (_whole, open: string, css: string, end: string) => {
		const urls = mapCssUrls(css, (raw) => resolveCss(raw, base, to));
		return `${open}${viewport === undefined ? urls : asScripted(pinViewportHeights(urls, viewport))}${end}`;
	});
}

function resolveCss(raw: string, base: string, to: (absolute: string) => string): string {
	const absolute = absoluteUrl(raw, base);
	return absolute === undefined ? raw : to(absolute);
}

function inlineStyle(
	style: string,
	to: (raw: string) => string,
	viewport: { w: number; h: number } | undefined,
): string {
	const urls = mapCssUrls(style, to);
	return viewport === undefined ? urls : viewportHeightsInPixels(urls, viewport);
}

/** Every resource address left in markup already made absolute, for the fetch list. */
function markupUrls(html: string): string[] {
	const found: string[] = [];
	mapMarkupUrls(html, "https://invalid.invalid/", (absolute) => {
		found.push(absolute);
		return absolute;
	});
	return found;
}

/** Attributes of <html> or <body> as the page had them, minus anything that would run. */
function attributes(attrs: Record<string, string>): string {
	return Object.entries(attrs)
		.filter(([name]) => /^[a-zA-Z_:][\w:.-]*$/.test(name) && !name.toLowerCase().startsWith("on"))
		.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
		.join("");
}

/**
 * What makes a capture a reference at its own size: the page renders at the tab's width so its media queries
 * resolve as they did, the picked element pinned to the width it had, and the ancestors that held it on the page
 * flattened so it stands at the frame's top-left corner. A whole page is the page as it was.
 */
function referenceRules(capture: ReferenceCapture): string {
	const rules = [
		"html { overflow: hidden !important; scrollbar-width: none !important; }",
		// with no script to run, Chrome neither autoplays a video nor hides its controls: it stands still, as on a poster
		"video:not([controls])::-webkit-media-controls { display: none !important; }",
	];
	const backdrop = capture.backdrop?.trim();
	if (backdrop !== undefined && backdrop !== "" && !/[;{}<>]/.test(backdrop)) {
		rules.push(`html { background-color: ${backdrop} !important; }`);
	}
	if (capture.whole) return rules.join("\n");
	rules.push(
		`:where(body, body *):has([data-spool-reference]):not(table, thead, tbody, tfoot, tr) {
	display: block !important; position: static !important; inset: auto !important; float: none !important;
	margin: 0 !important; padding: 0 !important; border: 0 !important; transform: none !important;
	width: auto !important; min-width: 0 !important; max-width: none !important;
	height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important;
}`,
		`[data-spool-reference] {
	box-sizing: border-box !important; position: relative !important; inset: auto !important; float: none !important;
	margin: 0 !important; flex: none !important;
	width: ${round(capture.size.w)}px !important; min-width: 0 !important; max-width: none !important;
	min-height: ${round(capture.size.h)}px !important;
}`,
	);
	return rules.join("\n");
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function decodeEntities(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
