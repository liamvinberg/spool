import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createTlsServer } from "node:tls";
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

/** A route answers its body, or redirects when it names `{ to }`. */
function fakeFetch(routes: Record<string, string | Uint8Array | { to: string }>, log: string[] = []) {
	return async (input: string | URL | Request): Promise<Response> => {
		const url = String(input);
		log.push(url);
		const body = routes[url];
		if (body === undefined) return new Response("nope", { status: 404 });
		if (typeof body === "object" && "to" in body) {
			return new Response(null, { status: 302, headers: { location: body.to } });
		}
		return new Response(typeof body === "string" ? body : body.slice().buffer, { status: 200 });
	};
}

/** Every host on the public internet, unless named here. */
function lookupOf(local: Record<string, string> = {}) {
	return async (hostname: string) => {
		const address = local[hostname] ?? "203.0.114.7";
		return [{ address, family: isIP(address) }];
	};
}
const publicLookup = lookupOf();

describe("createWebfonts", () => {
	it("resolves imports and re-points the font files it finds", async () => {
		const fonts = createWebfonts({
			lookup: publicLookup,
			cacheDir: cacheDir(),
			fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }),
		});
		const out = await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(out).toContain("font-family:'Caveat'");
		expect(out).toContain(WEBFONT_PATH);
		expect(out).not.toContain("@import");
	});

	it("serves a font file only under the key a resolved stylesheet named", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fonts = createWebfonts({
			lookup: publicLookup,
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
		const fonts = createWebfonts({ lookup: publicLookup, cacheDir: cacheDir(), fetch: fakeFetch({}) });
		expect(await fonts.resolve(css)).toBe(css);
		expect(fonts.revision()).toBe(0);
	});

	it("stops asking a network that already refused, until the cooldown lapses", async () => {
		const log: string[] = [];
		let clock = 0;
		const css = `@import url("https://sheet.test/a.css");`;
		const fonts = createWebfonts({
			lookup: publicLookup,
			cacheDir: cacheDir(),
			fetch: fakeFetch({}, log),
			now: () => clock,
		});
		await fonts.resolve(css);
		await fonts.resolve(css);
		expect(log.length).toBe(1);
		clock += 60_001;
		await fonts.resolve(css);
		expect(log.length).toBe(2);
	});

	it("bumps its revision once a resolve lands, so stale documents retire", async () => {
		const fonts = createWebfonts({
			lookup: publicLookup,
			cacheDir: cacheDir(),
			fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }),
		});
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(fonts.revision()).toBe(1);
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(fonts.revision()).toBe(1);
	});

	it("passes an undefined stylesheet straight through", async () => {
		const fonts = createWebfonts({ lookup: publicLookup, cacheDir: cacheDir(), fetch: fakeFetch({}) });
		expect(await fonts.resolve(undefined)).toBeUndefined();
	});

	it("reuses the disk cache, so a second run resolves offline", async () => {
		const dir = cacheDir();
		const css = `@import url("https://sheet.test/a.css");`;
		const online = createWebfonts({
			lookup: publicLookup,
			cacheDir: dir,
			fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }),
		});
		const first = await online.resolve(css);
		const offline = createWebfonts({ lookup: publicLookup, cacheDir: dir, fetch: fakeFetch({}) });
		expect(await offline.resolve(css)).toBe(first);
	});

	it("fetches one font file once, however many frames ask at the same moment", async () => {
		const log: string[] = [];
		const fonts = createWebfonts({
			lookup: publicLookup,
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
		const online = createWebfonts({
			lookup: publicLookup,
			cacheDir: dir,
			fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }),
		});
		await online.resolve(css);
		const sheet = join(dir, "sheets", `${createHash("sha256").update(css).digest("hex")}.css`);
		expect(readFileSync(sheet, "utf8")).toContain("Caveat");
		writeFileSync(sheet, "");
		const reread = createWebfonts({
			lookup: publicLookup,
			cacheDir: dir,
			fetch: fakeFetch({ "https://sheet.test/a.css": SHEET }),
		});
		expect(await reread.resolve(css)).toContain("Caveat");
	});
});

describe("the font fetch is https-only and public-only", () => {
	function refusing(routes: Parameters<typeof fakeFetch>[0], local: Record<string, string> = {}) {
		const fetched: string[] = [];
		const logged: string[] = [];
		const fonts = createWebfonts({
			cacheDir: cacheDir(),
			fetch: fakeFetch(routes, fetched),
			lookup: lookupOf(local),
			log: (line) => logged.push(line),
		});
		return { fonts, fetched, logged };
	}

	it("refuses a plain-http stylesheet, fetches nothing and says why", async () => {
		const css = `@import url("http://fonts.example/a.css");`;
		const { fonts, fetched, logged } = refusing({ "http://fonts.example/a.css": SHEET });
		expect(await fonts.resolve(css)).toBe(css);
		expect(fetched).toEqual([]);
		expect(logged).toEqual(["fonts.css: refused http://fonts.example/a.css: not https"]);
	});

	it("refuses loopback, written as an address or as a name", async () => {
		const { fonts, fetched, logged } = refusing({}, { localhost: "127.0.0.1" });
		await fonts.resolve(`@import url("https://127.0.0.1:3000/a.css");`);
		await fonts.resolve(`@import url("https://[::1]/b.css");`);
		await fonts.resolve(`@import url("https://localhost/c.css");`);
		expect(fetched).toEqual([]);
		expect(logged).toEqual([
			"fonts.css: refused https://127.0.0.1:3000/a.css: 127.0.0.1 resolves to the local address 127.0.0.1",
			"fonts.css: refused https://[::1]/b.css: ::1 resolves to the local address ::1",
			"fonts.css: refused https://localhost/c.css: localhost resolves to the local address 127.0.0.1",
		]);
	});

	it("refuses a host that resolves to a private, link-local or unique-local address", async () => {
		const local = { "lan.example": "192.168.1.20", "meta.example": "169.254.169.254", "v6.example": "fd00::7" };
		const { fonts, fetched, logged } = refusing({}, local);
		for (const host of Object.keys(local)) await fonts.resolve(`@import url("https://${host}/a.css");`);
		expect(fetched).toEqual([]);
		expect(logged).toEqual([
			"fonts.css: refused https://lan.example/a.css: lan.example resolves to the local address 192.168.1.20",
			"fonts.css: refused https://meta.example/a.css: meta.example resolves to the local address 169.254.169.254",
			"fonts.css: refused https://v6.example/a.css: v6.example resolves to the local address fd00::7",
		]);
	});

	it("follows a redirect only as far as the first hop that is not public https", async () => {
		const { fonts, fetched, logged } = refusing(
			{
				"https://sheet.test/a.css": { to: "https://hop.test/b.css" },
				"https://hop.test/b.css": { to: "https://lan.example/c.css" },
				"https://lan.example/c.css": SHEET,
			},
			{ "lan.example": "10.1.2.3" },
		);
		const css = `@import url("https://sheet.test/a.css");`;
		expect(await fonts.resolve(css)).toBe(css);
		expect(fetched).toEqual(["https://sheet.test/a.css", "https://hop.test/b.css"]);
		expect(logged).toEqual([
			"fonts.css: refused https://sheet.test/a.css (redirected to https://lan.example/c.css): lan.example resolves to the local address 10.1.2.3",
		]);
	});

	it("refuses a redirect down to plain http", async () => {
		const { fonts, fetched, logged } = refusing({ "https://sheet.test/a.css": { to: "http://sheet.test/a.css" } });
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		expect(fetched).toEqual(["https://sheet.test/a.css"]);
		expect(logged).toEqual([
			"fonts.css: refused https://sheet.test/a.css (redirected to http://sheet.test/a.css): not https",
		]);
	});

	it("refuses a font file on a local host, once however often a frame asks", async () => {
		const sheet = `@font-face{font-family:X;src:url(https://lan.example/x.woff2) format('woff2')}`;
		const { fonts, fetched, logged } = refusing(
			{ "https://sheet.test/a.css": sheet, "https://lan.example/x.woff2": new Uint8Array([1]) },
			{ "lan.example": "172.16.0.9" },
		);
		await fonts.resolve(`@import url("https://sheet.test/a.css");`);
		const key = webfontKey("https://lan.example/x.woff2");
		expect(await fonts.read(key)).toBeUndefined();
		expect(await fonts.read(key)).toBeUndefined();
		expect(fetched).toEqual(["https://sheet.test/a.css"]);
		expect(logged).toEqual([
			"fonts.css: refused https://lan.example/x.woff2: lan.example resolves to the local address 172.16.0.9",
		]);
	});

	it("still brings a public https font home through a redirect", async () => {
		const { fonts, logged } = refusing({
			"https://sheet.test/a.css": { to: "https://cdn.test/a.css" },
			"https://cdn.test/a.css": SHEET,
			"https://fonts.gstatic.com/s/caveat/a.woff2": new Uint8Array([9]),
		});
		expect(await fonts.resolve(`@import url("https://sheet.test/a.css");`)).toContain("font-family:'Caveat'");
		const file = await fonts.read(webfontKey("https://fonts.gstatic.com/s/caveat/a.woff2"));
		expect([...(file?.bytes ?? [])]).toEqual([9]);
		expect(logged).toEqual([]);
	});

	it("never reaches a loopback server, over http or https", async () => {
		let arrived = 0;
		const http = createServer((_request, response) => {
			arrived++;
			response.end(SHEET);
		});
		const tls = createTlsServer(() => {});
		tls.on("connection", () => arrived++);
		const port = (server: { address(): unknown }) => (server.address() as { port: number }).port;
		await Promise.all([
			new Promise<void>((done) => http.listen(0, "127.0.0.1", done)),
			new Promise<void>((done) => tls.listen(0, "127.0.0.1", done)),
		]);
		try {
			const logged: string[] = [];
			// the network itself: a host that answered public for the check and local
			// for the connect is still stopped at the socket
			const fonts = createWebfonts({ cacheDir: cacheDir(), lookup: publicLookup, log: (line) => logged.push(line) });
			await fonts.resolve(`@import url("http://127.0.0.1:${port(http)}/a.css");`);
			await fonts.resolve(`@import url("https://localhost:${port(tls)}/a.css");`);
			expect(arrived).toBe(0);
			expect(logged).toEqual([`fonts.css: refused http://127.0.0.1:${port(http)}/a.css: not https`]);
		} finally {
			http.close();
			tls.close();
		}
	});
});
