import type { Buffer } from "node:buffer";
import { join, resolve } from "node:path";
import { kilobytes, LOCAL_FONT_BUDGET_BYTES } from "./assets";
import { designRelativePath } from "./design-boundary";

/**
 * The kinds a local face can be inlined as: `FONT_TYPES` in webfonts.ts minus `eot` and
 * `svg`, deliberately. This map doubles as the allowlist, and both copies of the
 * capture predicate accept only `data:font/(otf|ttf|woff2?)` — a face inlined
 * outside that set would render live and vanish from every still.
 */
const LOCAL_FONT_TYPES: Record<string, string> = {
	otf: "font/otf",
	ttf: "font/ttf",
	woff: "font/woff",
	woff2: "font/woff2",
};

const URL_RULE = () => /url\(\s*["']?([^"')\s]+)["']?\s*\)/gi;

/**
 * The faces a project ships itself, carried in the document (#101). `spool init`
 * has scaffolded `shared/assets/fonts/` since #80 and nothing has ever read it:
 * `repointFontUrls` only matches `https?://`, so a relative `url()` reached the
 * browser unrewritten and 404'd. Resolving it against the stylesheet's own
 * folder and inlining it composes with everything downstream for free — the
 * capture shim skips faces whose `src` is already `data:`, and both sanitizers
 * allowlist a bounded `data:font` URL.
 *
 * Every file it resolves comes back as a cache input, present or not: a face
 * that appears later has to reissue the documents that were compiled without it.
 * A compile hands its own reader, so a face is read once, with everything else
 * the document is made of.
 */
export function inlineLocalFonts(
	designDir: string,
	css: string | undefined,
	read: (file: string) => Buffer | undefined,
	resolvePath: (file: string, authored?: string) => string,
): { css: string | undefined; files: string[] } {
	if (css === undefined) return { css: undefined, files: [] };
	const sharedDir = join(designDir, "shared");
	const files: string[] = [];
	let spent = 0;
	const rewritten = css.replace(URL_RULE(), (whole, url: string) => {
		// A scheme or a root-absolute URL is the author's own reference — remote
		// faces, and the /vendor/webfont/ keys a resolve just wrote — and stays.
		if (url.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return whole;
		const path = url.split(/[?#]/)[0] ?? "";
		const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
		const type = extension === undefined ? undefined : LOCAL_FONT_TYPES[extension];
		if (type === undefined) return whole;
		const file = resolvePath(resolve(sharedDir, path), url);
		files.push(file);
		const bytes = read(file);
		// A face spool cannot read is left to the browser exactly as written.
		if (bytes === undefined) return whole;
		const data = `data:${type};base64,${bytes.toString("base64")}`;
		spent += data.length;
		if (spent > LOCAL_FONT_BUDGET_BYTES) {
			throw new Error(
				`design/${designRelativePath(designDir, file)} (${kilobytes(data.length)} inlined) puts shared/fonts.css over its ${kilobytes(LOCAL_FONT_BUDGET_BYTES)} local font budget`,
			);
		}
		return `url(${data})`;
	});
	return { css: rewritten, files };
}

export interface WebfontFile {
	bytes: Buffer;
	type: string;
}

export interface Webfonts {
	/**
	 * The project's fonts.css with remote imports spliced in and font files
	 * re-pointed here — or the CSS exactly as written, whenever the network
	 * had nothing to add.
	 */
	resolve(css: string | undefined): Promise<string | undefined>;
	/** One proxied font file, by the key a resolved stylesheet refers to. */
	read(key: string): Promise<WebfontFile | undefined>;
	/**
	 * Bumped whenever a resolve produced different CSS than it did before —
	 * folded into the document cache key so a machine that comes back online
	 * reissues documents instead of serving yesterday's unresolved sheet.
	 */
	revision(): number;
}

/** The no-network store: every project's CSS passes through as written. */
export function inertWebfonts(): Webfonts {
	return {
		resolve: (css) => Promise.resolve(css),
		read: () => Promise.resolve(undefined),
		revision: () => 0,
	};
}
