import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ReferenceCapture } from "../reference-wire";
import { COVER_PNG, makeApp, makeProject, makeTempDir, sseReader } from "../test-helpers";
import { asScripted, pinViewportHeights } from "./reference-css";
import { placeReference } from "./reference-frame";
import type { ReferenceFetch } from "./reference-page";
import { chooseReferenceProject } from "./reference-routes";

const EXTENSION = "chrome-extension://ajdldgfdhejgjjmmjcalpgffidppnoae";
const WOFF2 = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(60, 1)]);

/** The site, as the daemon's fetch reaches it: every address a fixture answers. */
function site(files: Record<string, { body: Buffer | string; type?: string }>): {
	fetch: ReferenceFetch;
	asked: string[];
} {
	const asked: string[] = [];
	const fetch: ReferenceFetch = async (url) => {
		asked.push(url);
		const file = files[url];
		if (file === undefined) return undefined;
		return { bytes: Buffer.from(file.body), url, type: file.type };
	};
	return { fetch, asked };
}

function capture(overrides: Partial<ReferenceCapture> = {}): ReferenceCapture {
	return {
		v: 1,
		url: "https://example.com/pricing",
		title: "Pricing",
		whole: false,
		label: "section.pricing",
		size: { w: 600, h: 300 },
		viewport: { w: 1280, h: 800 },
		html: '<main class="page"><section class="pricing" data-spool-reference=""><img src="https://cdn.example.com/hero.png" loading="lazy" onclick="steal()"><p style="background:url(&quot;/dot.png&quot;)">Plans</p><x-price><template shadowrootmode="open"><style>b { color: blue }</style><b>$12</b><slot></slot></template>a month</x-price></section></main>',
		htmlAttrs: { class: "dark", lang: "en" },
		bodyAttrs: { class: "site" },
		styles: [
			{ kind: "link", href: "https://cdn.example.com/site.css" },
			{ kind: "text", text: ".pricing { min-height: 50vh }", base: "https://example.com/pricing", media: "screen" },
			{
				kind: "text",
				text: "@font-face { font-family: Site; src: url(fonts/greek.woff2) }",
				base: "https://example.com/",
			},
		],
		animations: "",
		notes: ["a cross-origin iframe"],
		unusedFonts: ["https://example.com/fonts/greek.woff2"],
		...overrides,
	};
}

describe("the extension's door", () => {
	it("answers spool's extension alone, preflight and all, never a website or another extension", async () => {
		const app = makeApp(join(makeTempDir(), ".spool"));
		const post = (origin?: string) =>
			app.fetch("/api/references", {
				method: "POST",
				headers: { "content-type": "application/json", ...(origin === undefined ? {} : { origin }) },
				body: "{}",
			});

		const allowed = await post(EXTENSION);
		// through the door: the body is what is wrong now
		expect(allowed.status).toBe(400);
		expect(allowed.headers.get("access-control-allow-origin")).toBe(EXTENSION);
		expect(allowed.headers.get("vary")).toMatch(/origin/i);

		for (const origin of [
			"https://evil.example",
			"chrome-extension://abcdefghijklmnopabcdefghijklmnop",
			"null",
			undefined,
		]) {
			const refused = await post(origin);
			expect(refused.status).toBe(403);
			expect(refused.headers.get("access-control-allow-origin")).toBeNull();
		}
		// the control token opens the rest of /api, never this
		const tokened = await app.controlRequest("/api/references", { method: "POST", body: "{}" });
		expect(tokened.status).toBe(403);

		const preflight = await app.fetch("/api/references/open", {
			method: "OPTIONS",
			headers: {
				origin: EXTENSION,
				"access-control-request-method": "POST",
				"access-control-request-headers": "content-type",
			},
		});
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe(EXTENSION);
		expect(preflight.headers.get("access-control-allow-headers")).toBe("content-type");
		const webPreflight = await app.fetch("/api/references", {
			method: "OPTIONS",
			headers: { origin: "https://evil.example" },
		});
		expect(webPreflight.status).toBe(403);
	});
});

describe("a reference", () => {
	it("lands in references/ as a frame of the site's own css, its files the project's, its document compiled", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const { fetch, asked } = site({
			"https://cdn.example.com/site.css": {
				body: [
					'@import "theme.css" screen;',
					'@font-face { font-family: Site; src: url(fonts/site.woff2) format("woff2"), url(fonts/site.woff) format("woff"); }',
					".h-100vh { height: 100vh } .hero { background-image: url(img/bg.png) }",
				].join("\n"),
			},
			"https://cdn.example.com/theme.css": { body: ":root { --brand: #5e6ad2 }" },
			"https://cdn.example.com/fonts/site.woff2": { body: WOFF2 },
			"https://cdn.example.com/hero.png": { body: Buffer.from(COVER_PNG) },
			"https://cdn.example.com/img/bg.png": { body: Buffer.from(COVER_PNG) },
		});
		const app = makeApp(spoolDir, { referenceFetch: fetch });
		// its canvas is open on references/, looking at 2000,1000 to 5200,2800 of it
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request(`/api/p/${name}/events`, { signal: controller.signal }));
		const { view } = (await events.next()).data as { view: string };
		const told = await app.request(`/api/p/${name}/view`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				view,
				page: "references",
				frames: [],
				scheme: "light",
				camera: { x: -1000, y: -500, k: 0.5 },
				size: { w: 1600, h: 900 },
			}),
		});
		expect(told.status).toBe(204);

		const sent = await app.fetch("/api/references", {
			method: "POST",
			headers: { origin: EXTENSION, "content-type": "application/json" },
			body: JSON.stringify(capture()),
		});

		expect(sent.status).toBe(200);
		expect(await sent.json()).toEqual({ project: name, name, frame: "references/example-com-section-pricing" });
		const folder = join(root, "design", "frames", "references", "example-com-section-pricing");
		const page = readFileSync(join(folder, "page.html"), "utf8");
		const png = `assets/${createHash("sha256").update(COVER_PNG).digest("hex").slice(0, 16)}.png`;
		const woff2 = `assets/${createHash("sha256").update(WOFF2).digest("hex").slice(0, 16)}.woff2`;
		expect(existsSync(join(folder, png))).toBe(true);
		expect(existsSync(join(folder, woff2))).toBe(true);
		// the site's classes and selectors as written; its imports inlined under their media; heights as they were
		expect(page).toContain('<html class="dark" lang="en">');
		expect(page).toContain('<body class="site">');
		expect(page).toContain("@media screen {\n:root { --brand: #5e6ad2 }");
		expect(page).toContain(".h-100vh { height: 800px }");
		expect(page).toContain(".pricing { min-height: 400px }");
		// every file it could have is the project's own; the one it couldn't stays on the web
		expect(page).toContain(`url("${woff2}") format("woff2")`);
		expect(page).toContain(`url("${png}")`);
		expect(page).toContain(`<img src="${png}">`);
		expect(page).toContain('style="background:url(&quot;https://example.com/dot.png&quot;)"');
		// a face's other formats are never fetched, and nothing runs
		expect(asked).not.toContain("https://cdn.example.com/fonts/site.woff");
		// nor is a face the page never loaded, which stays on the web and isn't counted missing
		expect(asked).not.toContain("https://example.com/fonts/greek.woff2");
		expect(page).toContain('url("https://example.com/fonts/greek.woff2")');
		expect(page).not.toContain("onclick");
		// a video that showed no controls on the page shows none in the frame, where nothing runs to hide them
		expect(page).toContain("video:not([controls])::-webkit-media-controls { display: none !important; }");
		// a web component keeps its shadow root, declared, or it draws nothing
		expect(page).toContain(
			'<x-price><template shadowrootmode="open"><style>b { color: blue }</style><b>$12</b><slot></slot></template>a month</x-price>',
		);
		const tsx = readFileSync(join(folder, "frame.tsx"), "utf8");
		expect(tsx).toContain("Left out: a cross-origin iframe; 1 file the site would not give.");
		// in view, and the canvas is told it arrived
		expect(JSON.parse(readFileSync(join(folder, "frame.json"), "utf8"))).toEqual({
			x: 2080,
			y: 1080,
			w: 600,
			h: 300,
		});
		let arrived = await events.next();
		while (arrived.event !== "change" || (arrived.data as { kind: string }).kind !== "reference")
			arrived = await events.next();
		expect(arrived.data).toEqual({ kind: "reference", frame: "references/example-com-section-pricing" });

		const doc = await app.request(
			`/p/${name}/frames/${encodeURIComponent("references/example-com-section-pricing")}`,
		);
		expect(doc.status).toBe(200);
		const body = await doc.text();
		expect(body).toContain(`/asset/${createHash("sha256").update(WOFF2).digest("hex")}.woff2`);
		const font = await app.request(`/asset/${createHash("sha256").update(WOFF2).digest("hex")}.woff2`);
		expect(font.headers.get("content-type")).toBe("font/woff2");
		expect(font.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("says there is nowhere to land when no project is in spool", async () => {
		const app = makeApp(join(makeTempDir(), ".spool"), { referenceFetch: site({}).fetch });
		const sent = await app.fetch("/api/references", {
			method: "POST",
			headers: { origin: EXTENSION, "content-type": "application/json" },
			body: JSON.stringify(capture()),
		});
		expect(sent.status).toBe(409);
		expect(await sent.json()).toMatchObject({ error: "no-project" });
	});

	it("is opened on its canvas: in the Mac app's window when it follows the daemon, else by its address", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const open = () =>
			app.fetch("/api/references/open", {
				method: "POST",
				headers: { origin: EXTENSION, "content-type": "application/json" },
				body: JSON.stringify({ project: name, frame: "references/example-com-page" }),
			});

		expect(await (await open()).json()).toEqual({
			shown: false,
			url: `http://localhost:7766/p/${name}?frame=references%2Fexample-com-page`,
		});
		const desktop = new AbortController();
		const events = await app.controlRequest("/api/events", {
			headers: { "x-spool-window": "1" },
			signal: desktop.signal,
		});
		expect(events.status).toBe(200);
		expect(await (await open()).json()).toMatchObject({ shown: true });
		desktop.abort();
	});
});

describe("where a reference goes", () => {
	it("is the canvas open now, the one heard from last among several, else the one opened last", () => {
		const projects = [
			{ root: "/a", openedAt: "2026-11-08T10:00:00Z" },
			{ root: "/b", openedAt: "2026-11-08T09:00:00Z" },
			{ root: "/c", openedAt: "2026-11-08T08:00:00Z" },
		];
		expect(chooseReferenceProject(projects, new Map())).toBe("/a");
		expect(chooseReferenceProject(projects, new Map([["/c", 0]]))).toBe("/c");
		expect(
			chooseReferenceProject(
				projects,
				new Map([
					["/b", Date.parse("2026-11-08T11:00:00Z")],
					["/c", 0],
				]),
			),
		).toBe("/b");
		expect(chooseReferenceProject([], new Map())).toBeUndefined();
	});

	it("stands in the view, clear of what is there, near the view when it has no room, and beside the page with no camera", () => {
		const view = { x: 0, y: 0, w: 2000, h: 1200 };
		const field = [{ x: 80, y: 80, w: 600, h: 400 }];
		const placed = placeReference(field, view, { w: 500, h: 300 });
		expect(placed).toEqual({ x: 760, y: 80, w: 500, h: 300 });
		const crowded = [{ x: 0, y: 0, w: 2000, h: 1200 }];
		expect(placeReference(crowded, view, { w: 500, h: 300 })).toEqual({ x: 0, y: 1280, w: 500, h: 300 });
		// a frame far off on the page does not pull it there
		const far = [...crowded, { x: 20000, y: 0, w: 1000, h: 1000 }];
		expect(placeReference(far, view, { w: 500, h: 300 })).toEqual({ x: 0, y: 1280, w: 500, h: 300 });
		expect(placeReference(field, undefined, { w: 500, h: 300 })).toEqual({ x: 760, y: 80, w: 500, h: 300 });
		// a page taller than the view still starts in it
		expect(placeReference([], view, { w: 1440, h: 9000 })).toMatchObject({ x: 80, y: 80 });
	});

	it("keeps a class named for a height, and an image whose data reads like one, while the height itself is pinned", () => {
		const image = 'url(data:image/png;base64,iVBO/7vh+2svh) 0 0 / 100% 50vh, url("data:image/png;base64,Rw/1vh")';
		const css = `.h-100vh{height:100vh;background:${image}}@media (min-width:600px){.a:hover{margin-top:-10dvh;width:calc(100vw - 2vh)}}`;
		expect(pinViewportHeights(css, { w: 1000, h: 800 })).toBe(
			`.h-100vh{height:800px;background:${image.replace("50vh", "400px")}}@media (min-width:600px){.a:hover{margin-top:-80px;width:calc(100vw - 16px)}}`,
		);
	});

	it("answers a sheet's scripting queries as the scripted page did, though the frame runs none", () => {
		const css =
			"@media (scripting: none){.a{transform:none}}@media (min-width:1px) and (Scripting:enabled),(scripting){.b{x:y}}";
		expect(asScripted(css)).toBe(
			"@media (width < 0px){.a{transform:none}}@media (min-width:1px) and (width >= 0px),(width >= 0px){.b{x:y}}",
		);
	});
});
