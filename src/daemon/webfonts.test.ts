import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createWebfonts,
	remoteImports,
	repointFontUrls,
	spliceImports,
	WEBFONT_PATH,
	webfontKey,
	webfontType,
} from "./webfonts";

const temps: string[] = [];
function cacheDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "spool-webfonts-"));
	temps.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const GOOGLE = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap";

describe("remoteImports", () => {
	it("keeps a URL whole through the semicolons inside a weight list", () => {
		expect(remoteImports(`@import url("${GOOGLE}");`)).toEqual([GOOGLE]);
	});

	it("reads every spelling @import allows", () => {
		const css = [
			`@import url("https://a.test/a.css");`,
			`@import url('https://b.test/b.css');`,
			`@import url(https://c.test/c.css);`,
			`@import "https://d.test/d.css";`,
			`@import url("https://e.test/e.css") screen and (min-width: 0);`,
		].join("\n");
		expect(remoteImports(css)).toEqual([
			"https://a.test/a.css",
			"https://b.test/b.css",
			"https://c.test/c.css",
			"https://d.test/d.css",
			"https://e.test/e.css",
		]);
	});

	it("leaves relative imports to the document that already resolves them", () => {
		expect(remoteImports(`@import url("./local.css");`)).toEqual([]);
	});

	it("names each URL once however often it is imported", () => {
		expect(remoteImports(`@import url("https://a.test/a.css");\n@import url("https://a.test/a.css");`)).toEqual([
			"https://a.test/a.css",
		]);
	});
});

describe("spliceImports", () => {
	it("puts the fetched stylesheet where the import stood", () => {
		const css = `/* head */\n@import url("${GOOGLE}");\nbody { margin: 0 }`;
		const out = spliceImports(css, new Map([[GOOGLE, "@font-face{font-family:X}"]]));
		expect(out).toBe(`/* head */\n@font-face{font-family:X}\nbody { margin: 0 }`);
	});

	it("leaves an import nobody fetched alone, so the browser still resolves it", () => {
		const css = `@import url("${GOOGLE}");`;
		expect(spliceImports(css, new Map())).toBe(css);
	});
});

describe("repointFontUrls", () => {
	it("moves font files to this daemon and remembers the one URL each key names", () => {
		const css = `@font-face{font-family:X;src:url(https://fonts.gstatic.com/s/x/v1/a.woff2) format('woff2')}`;
		const { css: out, sources } = repointFontUrls(css);
		const key = webfontKey("https://fonts.gstatic.com/s/x/v1/a.woff2");
		expect(out).toContain(`url(${WEBFONT_PATH}${key})`);
		expect(sources.get(key)).toBe("https://fonts.gstatic.com/s/x/v1/a.woff2");
	});

	it("leaves remote URLs that are not font files where they are", () => {
		const css = `.hero{background:url(https://cdn.test/photo.png)}`;
		expect(repointFontUrls(css).css).toBe(css);
	});

	it("keys by URL, so the same file resolves to one cache entry", () => {
		const css = `a{src:url(https://f.test/a.woff2)}b{src:url(https://f.test/a.woff2)}`;
		expect(repointFontUrls(css).sources.size).toBe(1);
	});
});

describe("webfontType", () => {
	it("reads the extension, and calls anything else woff2", () => {
		expect(webfontType("https://f.test/a.woff2")).toBe("font/woff2");
		expect(webfontType("https://f.test/a.woff")).toBe("font/woff");
		expect(webfontType("https://f.test/a.ttf?v=2")).toBe("font/ttf");
		expect(webfontType("https://f.test/opaque")).toBe("font/woff2");
	});
});

const SHEET = `@font-face{font-family:'Caveat';src:url(https://fonts.gstatic.com/s/caveat/a.woff2) format('woff2')}`;

function fakeFetch(routes: Record<string, string | Uint8Array>, log: string[] = []) {
	return async (input: string | URL | Request): Promise<Response> => {
		const url = String(input);
		log.push(url);
		const body = routes[url];
		if (body === undefined) return new Response("nope", { status: 404 });
		return new Response(typeof body === "string" ? body : body.slice().buffer, { status: 200 });
	};
}

describe("createWebfonts", () => {
	it("resolves imports and re-points the font files it finds", async () => {
		const fonts = createWebfonts({ cacheDir: cacheDir(), fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }) });
		const out = await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(out).toContain("font-family:'Caveat'");
		expect(out).toContain(WEBFONT_PATH);
		expect(out).not.toContain("@import");
	});

	it("serves a font file only under the key a resolved stylesheet named", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fonts = createWebfonts({
			cacheDir: cacheDir(),
			fetch: fakeFetch({ "https://sheet.test/a.css": SHEET, "https://fonts.gstatic.com/s/caveat/a.woff2": bytes }),
		});
		expect(await fonts.read(webfontKey("https://fonts.gstatic.com/s/caveat/a.woff2"))).toBeUndefined();
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		const file = await fonts.read(webfontKey("https://fonts.gstatic.com/s/caveat/a.woff2"));
		expect(file?.type).toBe("font/woff2");
		expect([...(file?.bytes ?? [])]).toEqual([1, 2, 3, 4]);
		expect(await fonts.read("not-a-key")).toBeUndefined();
	});

	it("hands back the project's own CSS when the network has nothing to give", async () => {
		const css = `@import url("https://sheet.test/a.css");`;
		const fonts = createWebfonts({ cacheDir: cacheDir(), fetch: fakeFetch({}) });
		expect(await fonts.resolve(css)).toBe(css);
		expect(fonts.revision()).toBe(0);
	});

	it("stops asking a network that already refused, until the cooldown lapses", async () => {
		const log: string[] = [];
		let clock = 0;
		const css = `@import url("https://sheet.test/a.css");`;
		const fonts = createWebfonts({ cacheDir: cacheDir(), fetch: fakeFetch({}, log), now: () => clock });
		await fonts.resolve(css);
		await fonts.resolve(css);
		expect(log.length).toBe(1);
		clock += 60_001;
		await fonts.resolve(css);
		expect(log.length).toBe(2);
	});

	it("bumps its revision once a resolve lands, so stale documents retire", async () => {
		const fonts = createWebfonts({ cacheDir: cacheDir(), fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }) });
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(fonts.revision()).toBe(1);
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(fonts.revision()).toBe(1);
	});

	it("passes an undefined stylesheet straight through", async () => {
		const fonts = createWebfonts({ cacheDir: cacheDir(), fetch: fakeFetch({}) });
		expect(await fonts.resolve(undefined)).toBeUndefined();
	});

	it("reuses the disk cache, so a second run resolves offline", async () => {
		const dir = cacheDir();
		const css = `@import url("https://sheet.test/a.css");`;
		const online = createWebfonts({ cacheDir: dir, fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }) });
		const first = await online.resolve(css);
		const offline = createWebfonts({ cacheDir: dir, fetch: fakeFetch({}) });
		expect(await offline.resolve(css)).toBe(first);
	});

	it("fetches one font file once, however many frames ask at the same moment", async () => {
		const log: string[] = [];
		const fonts = createWebfonts({
			cacheDir: cacheDir(),
			fetch: fakeFetch(
				{ "https://sheet.test/a.css": SHEET, "https://fonts.gstatic.com/s/caveat/a.woff2": new Uint8Array([7]) },
				log,
			),
		});
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		const key = webfontKey("https://fonts.gstatic.com/s/caveat/a.woff2");
		await Promise.all([fonts.read(key), fonts.read(key), fonts.read(key)]);
		expect(log.filter((url) => url.endsWith(".woff2")).length).toBe(1);
	});

	it("treats a truncated cache file as no cache at all", async () => {
		const dir = cacheDir();
		const css = `@import url("https://sheet.test/a.css");`;
		const online = createWebfonts({ cacheDir: dir, fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }) });
		await online.resolve(css);
		const sheet = join(dir, "sheets", `${createHash("sha256").update(css).digest("hex")}.css`);
		expect(readFileSync(sheet, "utf8")).toContain("Caveat");
		writeFileSync(sheet, "");
		const reread = createWebfonts({ cacheDir: dir, fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }) });
		expect(await reread.resolve(css)).toContain("Caveat");
	});
});
