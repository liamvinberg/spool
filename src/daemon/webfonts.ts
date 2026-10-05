import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { lookup as resolveHost } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { isIP, type LookupFunction } from "node:net";
import { join, resolve } from "node:path";
import { Agent } from "undici";
import { writeAtomic } from "../atomic-write";
import { publicResourceAddress } from "../publication/fetch";
import { kilobytes, LOCAL_FONT_BUDGET_BYTES } from "./assets";
import { designRelativePath, resolveDesignPath } from "./design-path";

/**
 * Remote webfonts, brought local (#80). A project writes `shared/fonts.css`
 * the way the web does — `@import` a foundry's stylesheet, let the browser
 * fetch the files — and for a live document that is exactly right. For a still
 * it is fatal: the canvas rasterizes a frame by serializing it into an SVG
 * `foreignObject`, which renders with every external resource blocked, so
 * every capture comes out in fallback system fonts and text rewraps under its
 * own headings. That is one wrong picture behind every thumbnail, every boot
 * cover, and every overview.
 *
 * Resolving those imports here — the `@font-face` rules spliced in, each font
 * file re-pointed at this daemon — gives the shim local URLs it can turn into
 * data URIs at capture time, and it costs nothing in the live document: the
 * browser still fetches only the subsets its text needs. The files are cached
 * on disk, so the second machine-start is offline-clean and the first frame
 * after a cold start pays one small fetch.
 *
 * Nothing here is load-bearing for rendering. Every failure path returns the
 * project's own CSS untouched, and the frame renders exactly as it does today.
 */

/** How long a foundry has to answer before the document goes out unresolved. */
const FETCH_TIMEOUT_MS = 5000;
/** After a failed resolve, how long before the next document tries again. */
const RETRY_COOLDOWN_MS = 60_000;
/** Recursion bound on stylesheets that themselves `@import` (Google's do not). */
const MAX_IMPORT_DEPTH = 3;
/** How many redirects one fetch follows, every hop checked like the first. */
const MAX_REDIRECTS = 4;

/**
 * Foundries serve by user agent: ask as a current Chrome and Google Fonts
 * answers with woff2 and unicode-range subsets, which is what the browser
 * asking through us would have got.
 */
const FONT_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** The unauthenticated render-host route a resolved stylesheet points at. */
export const WEBFONT_PATH = "/vendor/webfont/";

const FONT_TYPES: Record<string, string> = {
	woff2: "font/woff2",
	woff: "font/woff",
	ttf: "font/ttf",
	otf: "font/otf",
	eot: "application/vnd.ms-fontobject",
	svg: "image/svg+xml",
};

/**
 * `@import` in every spelling CSS allows: bare string or `url()`, either quote
 * or none, with whatever media query trails it. Quoted forms run to their own
 * quote, because a Google Fonts URL carries semicolons of its own inside the
 * weight list and stopping at the first one asks for a different typeface.
 */
const IMPORT_RULE = () => /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"'()\s;]+))\s*\)?[^;]*;/gi;

function importedUrl(match: RegExpMatchArray): string | undefined {
	const url = match[1] ?? match[2] ?? match[3];
	return url !== undefined && /^https?:\/\//i.test(url) ? url : undefined;
}

/** The `@import`ed stylesheets a CSS file reaches for over the network. */
export function remoteImports(css: string): string[] {
	const found: string[] = [];
	for (const match of css.matchAll(IMPORT_RULE())) {
		const url = importedUrl(match);
		if (url !== undefined && !found.includes(url)) found.push(url);
	}
	return found;
}

/**
 * The imported stylesheets, spliced in where they were named. An import that
 * did not resolve is left alone: the browser still fetches it itself, so a
 * half-resolved sheet is a worse still and never a worse frame.
 */
export function spliceImports(css: string, fetched: ReadonlyMap<string, string>): string {
	return css.replace(IMPORT_RULE(), (...rest) => {
		const match = rest.slice(0, 4) as unknown as RegExpMatchArray;
		const url = importedUrl(match);
		const body = url === undefined ? undefined : fetched.get(url);
		return body === undefined ? match[0] : body;
	});
}

/** The key a font URL is served under — content-addressed, so it is stable. */
export function webfontKey(url: string): string {
	return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

/**
 * Every remote font file re-pointed at this daemon. Returns the rewritten CSS
 * and the key→URL map the proxy route needs; a key is only ever fetchable
 * because some project's own stylesheet named its URL.
 */
export function repointFontUrls(css: string): { css: string; sources: Map<string, string> } {
	const sources = new Map<string, string>();
	const rewritten = css.replace(/url\(\s*["']?(https?:\/\/[^"')\s]+)["']?\s*\)/gi, (whole, url: string) => {
		// stylesheets reach for stylesheets too; only font payloads move
		if (!/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return whole;
		const key = webfontKey(url);
		sources.set(key, url);
		return `url(${WEBFONT_PATH}${key})`;
	});
	return { css: rewritten, sources };
}

/**
 * The kinds a local face can be inlined as: `FONT_TYPES` above minus `eot` and
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
	read: (file: string) => Buffer | undefined = readFace,
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
		const file = resolveDesignPath(designDir, resolve(sharedDir, path), url);
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

function readFace(file: string): Buffer | undefined {
	try {
		return readFileSync(file);
	} catch {
		return undefined;
	}
}

/** The media type a font URL's extension claims — woff2 when it claims nothing. */
export function webfontType(url: string): string {
	const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
	return (ext === undefined ? undefined : FONT_TYPES[ext]) ?? "font/woff2";
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

/** Every address a host name resolves to. */
export type HostLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

export interface WebfontsDeps {
	/** Where merged stylesheets and font files are cached between runs. */
	cacheDir: string;
	/** The network, asked only once a URL has passed `refusal`, never left to follow a redirect itself. */
	fetch?: typeof globalThis.fetch;
	lookup?: HostLookup;
	/** Where a refused URL is reported, with why. */
	log?: (line: string) => void;
	now?: () => number;
}

/**
 * The font fetch is https-only and public-only (DEV-175). It runs from Node,
 * past every policy a browser keeps, on a stylesheet a teammate may have
 * written: a URL that is not https, or whose host resolves to a loopback,
 * link-local, private or unique-local address, is refused, and so is every
 * redirect that leads to one. A relative `url()` is an asset and never comes
 * here.
 */
async function refusal(url: URL, lookup: HostLookup): Promise<string | undefined> {
	if (url.protocol !== "https:") return "not https";
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const family = isIP(hostname);
	// A host that does not resolve is the network's failure, not a refusal: the fetch reports it.
	const addresses = family === 0 ? await lookup(hostname).catch(() => []) : [{ address: hostname, family }];
	const local = addresses.find(({ address, family }) => !publicResourceAddress(address, family));
	return local === undefined ? undefined : `${hostname} resolves to the local address ${local.address}`;
}

/**
 * Node's own fetch, with the connection held to the same rule: a host that
 * resolved to a public address for the check and to a local one for the
 * connect (a rebinding DNS answer) is refused at the socket.
 */
function publicFetch(): typeof globalThis.fetch {
	const lookup: LookupFunction = (hostname, options, callback) => {
		dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
			if (error !== null) return callback(error, []);
			const local = addresses.find((entry) => !publicResourceAddress(entry.address, entry.family));
			if (local !== undefined)
				return callback(new Error(`${hostname} resolves to the local address ${local.address}`), []);
			if (options.all === true) return callback(null, addresses);
			const [first] = addresses;
			if (first === undefined) return callback(new Error(`${hostname} did not resolve`), []);
			callback(null, first.address, first.family);
		});
	};
	const dispatcher = new Agent({ connect: { lookup } });
	return (input, init) => fetch(input, { ...init, dispatcher } as RequestInit);
}

const lookupHost: HostLookup = (hostname) => resolveHost(hostname, { all: true });

export function createWebfonts({
	cacheDir,
	fetch = publicFetch(),
	lookup = lookupHost,
	log = (line) => console.error(`spool: ${line}`),
	now = Date.now,
}: WebfontsDeps): Webfonts {
	/** input CSS hash → resolved CSS, for the life of the process. */
	const resolved = new Map<string, string>();
	const resolving = new Map<string, Promise<string>>();
	/** key → the one URL a project's stylesheet named. */
	const sources = new Map<string, string>();
	const files = new Map<string, Promise<WebfontFile | undefined>>();
	const failedUntil = new Map<string, number>();
	/** URLs already reported refused, so a frame asking again does not say it twice. */
	const refused = new Set<string>();
	let revision = 0;

	async function get(url: string): Promise<Buffer | undefined> {
		try {
			const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
			let hop = new URL(url);
			for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
				const reason = await refusal(hop, lookup);
				if (reason !== undefined) {
					if (!refused.has(url)) {
						refused.add(url);
						const via = hop.href === url ? "" : ` (redirected to ${hop.href})`;
						log(`fonts.css: refused ${url}${via}: ${reason}`);
					}
					return undefined;
				}
				const response = await fetch(hop, { headers: { "user-agent": FONT_UA }, redirect: "manual", signal });
				const location = response.headers.get("location");
				if (response.status >= 300 && response.status < 400 && location !== null) {
					hop = new URL(location, hop);
					continue;
				}
				if (!response.ok) return undefined;
				return Buffer.from(await response.arrayBuffer());
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	/** The merged sheet for this input, from disk when a previous run fetched it. */
	async function merge(css: string, hash: string): Promise<string> {
		const cached = join(cacheDir, "sheets", `${hash}.css`);
		if (existsSync(cached)) {
			try {
				const held = readFileSync(cached, "utf8");
				// an empty file is a half-written cache, never a resolved sheet
				if (held !== "") return held;
			} catch {
				// an unreadable cache file is not worth a failed document
			}
		}
		let merged = css;
		for (let depth = 0; depth < MAX_IMPORT_DEPTH; depth++) {
			const imports = remoteImports(merged);
			if (imports.length === 0) break;
			const bodies = await Promise.all(imports.map((url) => get(url)));
			const fetched = new Map<string, string>();
			imports.forEach((url, i) => {
				const body = bodies[i];
				if (body !== undefined) fetched.set(url, body.toString("utf8"));
			});
			if (fetched.size === 0) throw new Error("no import resolved");
			merged = spliceImports(merged, fetched);
		}
		try {
			writeAtomic(cached, merged);
		} catch {
			// a read-only cache dir costs the next start a refetch, nothing more
		}
		return merged;
	}

	async function resolveOnce(css: string, hash: string): Promise<string> {
		const merged = await merge(css, hash);
		const { css: rewritten, sources: found } = repointFontUrls(merged);
		for (const [key, url] of found) sources.set(key, url);
		return rewritten;
	}

	async function resolveCss(css: string | undefined): Promise<string | undefined> {
		if (css === undefined) return undefined;
		const hash = createHash("sha256").update(css).digest("hex");
		const done = resolved.get(hash);
		if (done !== undefined) return done;
		// a resolve that already failed must not add its timeout to every
		// document the canvas asks for while the machine stays offline
		const cooling = failedUntil.get(hash);
		if (cooling !== undefined && now() < cooling) return css;
		let inFlight = resolving.get(hash);
		if (inFlight === undefined) {
			inFlight = resolveOnce(css, hash);
			resolving.set(hash, inFlight);
			inFlight.finally(() => resolving.delete(hash)).catch(() => {});
		}
		try {
			const out = await inFlight;
			if (resolved.get(hash) !== out) {
				resolved.set(hash, out);
				failedUntil.delete(hash);
				revision++;
			}
			return out;
		} catch {
			failedUntil.set(hash, now() + RETRY_COOLDOWN_MS);
			return css;
		}
	}

	async function readOnce(key: string, url: string): Promise<WebfontFile | undefined> {
		const type = webfontType(url);
		const cached = join(cacheDir, "files", key);
		if (existsSync(cached)) {
			try {
				return { bytes: readFileSync(cached), type };
			} catch {
				// fall through to a refetch
			}
		}
		const bytes = await get(url);
		if (bytes === undefined) return undefined;
		try {
			writeAtomic(cached, bytes);
		} catch {
			// serving the bytes matters; caching them is next time's saving
		}
		return { bytes, type };
	}

	async function read(key: string): Promise<WebfontFile | undefined> {
		const url = sources.get(key);
		if (url === undefined) return undefined;
		let inFlight = files.get(key);
		if (inFlight === undefined) {
			inFlight = readOnce(key, url);
			files.set(key, inFlight);
		}
		const file = await inFlight;
		// a miss is worth retrying; a hit stays in hand
		if (file === undefined) files.delete(key);
		return file;
	}

	return { resolve: resolveCss, read, revision: () => revision };
}

/** The no-network store: every project's CSS passes through as written. */
export function inertWebfonts(): Webfonts {
	return {
		resolve: (css) => Promise.resolve(css),
		read: () => Promise.resolve(undefined),
		revision: () => 0,
	};
}
