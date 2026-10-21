import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { DesignFrame } from "../../daemon/design-projection";
import { testBrowser } from "../../test-browser";
import { buildEntry } from "./build-entry";
import type { ViewerProject } from "./source";

/**
 * An outsider spots what's new in a whole-project share (spool#184): a page or frame that wasn't in the share when
 * this browser last opened it wears the unseen mark in the rail and on its frame, until they open it. Kept in the
 * browser alone, per share; the first open marks nothing. Driven in the package's own viewer build, with spool.page's
 * answers stood in for and changed between loads as a settle changes them.
 */

const APP = "https://spool.test";
const FRAMES = "https://frames.spool.test/f/";

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-viewer-unseen-"));
	const { build } = await import("vite");
	await build({
		configFile: join(process.cwd(), "vite.viewer.config.ts"),
		logLevel: "silent",
		build: { outDir: built, emptyOutDir: true },
	});
	entry = buildEntry(JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")), "index.html");
}, 120_000);

afterAll(() => rmSync(built, { recursive: true, force: true }));

/** A frame on a page, placed apart from the others. */
function frame(name: string, x = 0): DesignFrame {
	const slash = name.lastIndexOf("/");
	return { name, x, y: 0, w: 800, h: 600, ...(slash === -1 ? {} : { page: name.slice(0, slash) }) };
}

/** A whole-project share's canvas as it settled: its pages and frames, and who shared it. */
function shared(frames: DesignFrame[], share?: string): ViewerProject {
	const pages = [...new Set(frames.flatMap((each) => (each.page === undefined ? [] : [each.page])))].sort();
	return {
		team: { address: "kaffe", name: "kaffe", logo: null },
		project: "checkout",
		account: "jonas",
		canvas: { pages, places: {}, order: {}, frames },
		frames: FRAMES,
		shared: { by: "bo", pages: ["", ...pages], updated: null, whole: true },
		...(share === undefined
			? {}
			: {
					outsider: {
						share: { id: share, kind: "people" as const, who: ["jonas"] },
						me: { id: "jonas", name: "Jonas" },
						comments: `/_spool/${share}/comments`,
						socket: `/_spool/${share}/comments/socket`,
					},
				}),
	};
}

/**
 * One browser holding shares at `/kaffe/<path>`, each answered from `canvases[<path>]` as it stands at each load.
 * The comments sockets open and say nothing.
 */
async function browse(canvases: Record<string, ViewerProject>) {
	const browser = await testBrowser();
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	const page = await context.newPage();
	await page.routeWebSocket(/\/comments\/socket/, (route) =>
		route.send(JSON.stringify({ type: "comments", comments: [], first: true, last: true, reads: {} })),
	);
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		const api = /^\/_spool\/([^/]+)\/canvas$/.exec(url.pathname);
		if (url.origin === APP && api !== null) return route.fulfill({ json: canvases[api[1] ?? ""] });
		const html = /^\/kaffe\/([^/]+)/.exec(url.pathname);
		if (url.origin === APP && html !== null)
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><head>${entry.css.map((css) => `<link rel="stylesheet" href="/_viewer/${css}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
<script id="spool-viewer" type="application/json">${JSON.stringify({ api: `/_spool/${html[1]}/canvas`, path: `/kaffe/${html[1]}` })}</script>
<div id="root"></div></body></html>`,
			});
		if (url.href.startsWith(FRAMES))
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><body><h1>${decodeURIComponent(url.pathname.slice(3))}</h1><script>parent.postMessage({ spool: "loaded", frame: ${JSON.stringify(decodeURIComponent(url.pathname.slice(3)))} }, "*")</script></body></html>`,
			});
		if (url.origin === APP) return route.fulfill({ json: {} });
		return route.abort();
	});
	return {
		page,
		go: async (share: string) => {
			await page.goto(`${APP}/kaffe/${share}`);
			await page.getByRole("navigation", { name: "Pages" }).waitFor();
		},
	};
}

/** The rail's rows wearing the unseen mark, by their buttons' names. */
async function marked(page: Page): Promise<string[]> {
	return page
		.getByRole("navigation", { name: "Pages" })
		.locator("[data-unseen] > button")
		.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
}

it("marks nothing on a share's first open, then marks what a settle added at the next load until it is opened", {
	timeout: 60_000,
}, async () => {
	const canvases = { north: shared([frame("home")], "s-north") };
	const { page, go } = await browse(canvases);
	await go("north");
	await page.locator('[data-viewer-frame="home"]').waitFor();
	expect(await marked(page)).toEqual([]);

	// a page and a frame are added and settle; the open canvas doesn't change under them
	canvases.north = shared([frame("home"), frame("menu", 900), frame("later/one")], "s-north");
	await page.waitForTimeout(200);
	expect(await marked(page)).toEqual([]);

	await go("north");
	await page.locator('[data-viewer-frame="menu"]').waitFor();
	expect(await marked(page)).toEqual(["menu frame", "later"]);
	// on the frame as on its row
	expect(await page.locator('[data-frame-label="menu"]').locator(".animate-unseen-in").count()).toBe(1);
	expect(await page.locator('[data-frame-label="home"]').locator(".animate-unseen-in").count()).toBe(0);

	// opening the page clears its mark; its own frame stays marked until it is played
	await page.getByRole("button", { name: "later", exact: true }).click();
	await page.locator('[data-viewer-frame="later/one"]').waitFor();
	expect(await marked(page)).toEqual(["menu frame", "one frame"]);
	for (const each of ["later/one", "menu"]) {
		await page
			.getByRole("navigation", { name: "Pages" })
			.getByRole("button", { name: `Play ${each.split("/").pop()}` })
			.click({ force: true });
		await page.locator("[data-viewer-player]").waitFor();
		await page.keyboard.press("Escape");
		await page.locator("[data-viewer-player]").waitFor({ state: "detached" });
	}
	expect(await marked(page)).toEqual([]);

	// and a reload keeps them cleared
	await go("north");
	await page.locator('[data-viewer-frame="home"]').waitFor();
	expect(await marked(page)).toEqual([]);
});

it("keeps a mark through a load that didn't open it, and drops one whose page went", {
	timeout: 60_000,
}, async () => {
	const canvases = { north: shared([frame("home")], "s-north") };
	const { page, go } = await browse(canvases);
	await go("north");
	canvases.north = shared([frame("home"), frame("menu", 900), frame("later/one")], "s-north");
	await go("north");
	await page.locator('[data-viewer-frame="menu"]').waitFor();
	expect(await marked(page)).toEqual(["menu frame", "later"]);

	canvases.north = shared([frame("home"), frame("menu", 900)], "s-north");
	await go("north");
	await page.locator('[data-viewer-frame="menu"]').waitFor();
	expect(await marked(page)).toEqual(["menu frame"]);
});

it("keeps each share's seen record its own in one browser, a link share without comments among them", {
	timeout: 60_000,
}, async () => {
	const canvases = {
		north: shared([frame("home")], "s-north"),
		// a solo project's link share: no outsider part, known by its canvas's address alone
		south: shared([frame("home")]),
	};
	const { page, go } = await browse(canvases);
	await go("north");
	await page.locator('[data-viewer-frame="home"]').waitFor();

	// south's first open marks nothing, whatever north was
	canvases.south = shared([frame("home"), frame("menu", 900)]);
	await go("south");
	await page.locator('[data-viewer-frame="menu"]').waitFor();
	expect(await marked(page)).toEqual([]);

	// north never saw menu: it is new to north
	canvases.north = shared([frame("home"), frame("menu", 900)], "s-north");
	await go("north");
	await page.locator('[data-viewer-frame="menu"]').waitFor();
	expect(await marked(page)).toEqual(["menu frame"]);

	// south's added frame is south's alone
	canvases.south = shared([frame("home"), frame("menu", 900), frame("about", 1800)]);
	await go("south");
	await page.locator('[data-viewer-frame="about"]').waitFor();
	expect(await marked(page)).toEqual(["about frame"]);
});
