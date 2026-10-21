import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testBrowser } from "../../test-browser";
import type { PictureReport } from "../canvas/picture-layer";
import { buildEntry } from "./build-entry";
import type { ViewerProject } from "./source";

/**
 * A big project on the read-only canvas, as Spool Cloud serves it: forty frames, every other one with a cover. The
 * covers are drawn by the picture layer with nothing on the page for them, the rest stand as placeholders, and
 * documents are made only for frames drawn large enough to read near the view, a couple at a time. A save leaves a
 * cover stale until spool.page says a new one landed. A host whose assets are on another origin, or a browser
 * that can't draw on the GPU, still shows every picture.
 */

const APP = "https://cloud.test";
const ASSETS = "https://assets.test";
const FRAMES = "https://frames.test/f/grant/";
const PATH = "/devosurf/big";
const COLUMNS = 8;
const ROWS = 5;

const names = Array.from({ length: COLUMNS * ROWS }, (_, i) => `f${i}`);
const covered = names.filter((_, i) => i % 2 === 0);
const uncovered = names.filter((_, i) => i % 2 === 1);

const project: ViewerProject = {
	team: { address: "devosurf", name: "Devosurf", logo: null },
	project: "big",
	account: "vic@devosurf.com",
	canvas: {
		pages: [],
		places: {},
		order: {},
		frames: names.map((name, i) => ({
			name,
			x: (i % COLUMNS) * 1000,
			y: Math.floor(i / COLUMNS) * 1000,
			w: 800,
			h: 600,
		})),
	},
	frames: FRAMES,
	covers: Object.fromEntries(covered.map((name) => [name, `/covers/${name}`])),
	live: "/api/live",
	role: "viewer",
};

/**
 * A frame document that reports loaded a little after it opens, so documents booting can be seen, and answers the
 * canvas's call to arrive as the frame shim does.
 */
function frameDocument(frame: string): string {
	return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<h1>${frame}</h1>
<script>
const FRAME = ${JSON.stringify(frame)};
setTimeout(() => parent.postMessage({ spool: "loaded", frame: FRAME }, "*"), 400);
addEventListener("message", (event) => {
	if (event.data?.spool === "arrive") parent.postMessage({ spool: "arrived", frame: FRAME }, "*");
});
</script></body></html>`;
}

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-viewer-pictures-"));
	const { build } = await import("vite");
	await build({
		configFile: join(process.cwd(), "vite.viewer.config.ts"),
		logLevel: "silent",
		build: { outDir: built, emptyOutDir: true },
	});
	entry = buildEntry(JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")), "index.html");
}, 120_000);

afterAll(() => rmSync(built, { recursive: true, force: true }));

/**
 * The canvas, with its assets from `assets` (the page's own origin, or another one as a link share's host may
 * serve them) and, with `gl` false, a browser with no WebGL2.
 */
async function open({ assets = APP, gl = true }: { assets?: string; gl?: boolean } = {}) {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	if (!gl)
		await page.addInitScript(() => {
			const get = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
				return kind === "webgl2" ? null : (get as (...args: unknown[]) => unknown).call(this, kind, ...rest);
			} as typeof get;
		});
	// every document's phase as it changes, so how many booted at once, and whether a placeholder said one was on
	// its way, can be told afterwards
	await page.addInitScript(() => {
		const seen = { booting: 0, loading: false };
		(window as unknown as { __seen: typeof seen }).__seen = seen;
		new MutationObserver(() => {
			const booting = document.querySelectorAll('iframe[data-viewer-phase="booting"]').length;
			seen.booting = Math.max(seen.booting, booting);
			seen.loading ||= document.querySelector("[data-viewer-placeholder] [data-viewer-loading]") !== null;
		}).observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["data-viewer-phase"],
		});
	});
	let reading = project;
	let socket: WebSocketRoute | undefined;
	await page.routeWebSocket(`${APP.replace("https", "wss")}/api/live?covered=1`, (route) => {
		socket = route;
		route.send(JSON.stringify({ type: "head", head: 1 }));
	});
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === assets && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({
				body: readFileSync(file),
				contentType: type,
				headers: { "access-control-allow-origin": "*" },
			});
		}
		if (url.origin === APP && url.pathname === "/api/canvas") return route.fulfill({ json: reading });
		if (url.origin === APP && url.pathname.startsWith("/covers/"))
			return route.fulfill({
				body: readFileSync(join(process.cwd(), "src/ui/agent-app-assets/claude.png")),
				contentType: "image/png",
			});
		if (url.origin === APP && url.pathname === PATH)
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><head>${entry.css.map((css) => `<link rel="stylesheet" href="${assets}/_viewer/${css}">`).join("")}
<script type="module" src="${assets}/_viewer/${entry.file}"></script></head><body>
<script id="spool-viewer" type="application/json">${JSON.stringify({ api: "/api/canvas", path: PATH })}</script>
<div id="root"></div></body></html>`,
			});
		if (url.href.startsWith(FRAMES))
			return route.fulfill({
				contentType: "text/html",
				body: frameDocument(decodeURIComponent(url.pathname.slice(new URL(FRAMES).pathname.length))),
			});
		return route.abort();
	});
	await page.goto(`${APP}${PATH}`);
	await page.locator("[data-viewer-field]").waitFor();
	return {
		page,
		live: async () => {
			await expect.poll(() => socket !== undefined, { timeout: 20_000 }).toBe(true);
			return socket as WebSocketRoute;
		},
		serve: (next: ViewerProject) => {
			reading = next;
		},
	};
}

/** What the picture layer drew last, as it reports it. */
const pictures = (page: Page) =>
	page.evaluate(() => {
		const canvas = document.querySelector("[data-picture-layer]") as
			| (HTMLCanvasElement & { spoolPictures?: () => PictureReport })
			| null;
		return canvas?.spoolPictures?.() ?? null;
	});
/** The frames the picture layer drew with their pictures in, by name. */
const drawn = async (page: Page) =>
	((await pictures(page))?.drawn ?? [])
		.filter((each) => each.texture !== null)
		.map((each) => each.name)
		.sort();
/** The most documents seen booting at once, and whether a placeholder ever said one was on its way. */
const seen = (page: Page) =>
	page.evaluate(() => (window as unknown as { __seen: { booting: number; loading: boolean } }).__seen);
const iframes = (page: Page) =>
	page.locator("iframe").evaluateAll((all) => all.map((each) => (each as HTMLIFrameElement).title).sort());
const zoomIn = async (page: Page, times: number) => {
	for (let i = 0; i < times; i++) await page.getByRole("button", { name: "Zoom in" }).click();
};

describe("a big project on the read-only canvas", () => {
	it("draws every cover on the picture layer with no shell, and the rest as named placeholders", {
		timeout: 60_000,
	}, async () => {
		const { page } = await open();
		await expect.poll(() => drawn(page), { timeout: 20_000 }).toEqual([...covered].sort());
		// fitted, nothing is readable: no document anywhere
		expect(await iframes(page)).toEqual([]);
		expect(
			await page
				.locator("[data-viewer-frame]")
				.evaluateAll((all) => all.map((each) => (each as HTMLElement).dataset.viewerFrame).sort()),
		).toEqual([...uncovered].sort());
		expect(await page.locator('[data-viewer-frame="f1"] [data-viewer-placeholder]').textContent()).toBe("f1");
		expect(await page.locator("[data-viewer-cover]").count()).toBe(0);
	});

	it("makes documents only for readable frames near the view, a couple at a time, and lets them go out of reach", {
		timeout: 60_000,
	}, async () => {
		const { page } = await open();
		await expect.poll(() => drawn(page), { timeout: 20_000 }).not.toEqual([]);
		// fitted at about 12%, in to about 92%: an 800px frame draws past the readable 400
		await zoomIn(page, 3);
		// a placeholder whose document is on its way says so
		await expect.poll(() => seen(page).then((seen) => seen.loading), { timeout: 20_000 }).toBe(true);
		// the two frames there: one covered, one not
		await expect.poll(() => page.locator('iframe[data-viewer-phase="arrived"]').count(), { timeout: 20_000 }).toBe(2);
		expect(await iframes(page)).toEqual(["f19", "f20"]);
		// a frame shown live has taken itself off the layer
		await expect
			.poll(async () => (await pictures(page))?.claimed.sort(), { timeout: 20_000 })
			.toEqual(["f19", "f20"]);
		// out to where a whole row reads: more frames want documents than may boot at once
		await page.getByRole("button", { name: "Zoom out" }).click();
		await expect.poll(() => page.locator("[data-viewer-zoom]").textContent(), { timeout: 20_000 }).toBe("46%");
		// one notch of ⌘-scroll, about 46% to 60%: an 800px frame draws 480
		await page.locator("[data-viewer-field]").evaluate((field) => {
			const box = field.getBoundingClientRect();
			field.dispatchEvent(
				new WheelEvent("wheel", {
					bubbles: true,
					cancelable: true,
					clientX: box.left + box.width / 2,
					clientY: box.top + box.height / 2,
					deltaY: -24,
					ctrlKey: true,
				}),
			);
		});
		await expect.poll(() => page.locator("[data-viewer-zoom]").textContent(), { timeout: 20_000 }).toBe("60%");
		await expect
			.poll(() => page.locator('iframe[data-viewer-phase="arrived"]').count(), { timeout: 20_000 })
			.toBeGreaterThan(2);
		expect((await seen(page)).booting).toBeLessThanOrEqual(2);
		// out again: too small to read, every document goes
		await page.getByRole("button", { name: "fit" }).click();
		await expect.poll(() => iframes(page), { timeout: 20_000 }).toEqual([]);
	});

	it("shows a frame whose cover a save left stale live, until spool.page says its new cover landed", {
		timeout: 60_000,
	}, async () => {
		const { page, live, serve } = await open();
		await expect.poll(() => drawn(page), { timeout: 20_000 }).toContain("f2");
		const socket = await live();
		socket.send(JSON.stringify({ type: "saved", head: 2, by: "ana", changed: ["f2"], touched: ["f2"] }));
		// too small to read, but its picture is of the frame before the save
		await expect.poll(() => iframes(page), { timeout: 20_000 }).toEqual(["f2"]);
		await page.locator('[data-viewer-frame="f2"][data-viewer-shown]').waitFor();
		serve({ ...project, covers: { ...project.covers, f2: "/covers/f2-new" } });
		socket.send(JSON.stringify({ type: "covered", frames: ["f2"] }));
		await expect.poll(() => iframes(page), { timeout: 20_000 }).toEqual([]);
		await expect
			.poll(async () => (await pictures(page))?.drawn.find((each) => each.name === "f2")?.still)
			.toBe("/covers/f2-new");
	});

	it("draws the pictures where the canvas's assets are on another origin", { timeout: 60_000 }, async () => {
		const { page } = await open({ assets: ASSETS });
		await expect.poll(() => drawn(page), { timeout: 20_000 }).toEqual([...covered].sort());
	});

	it("shows covers as images where the browser has no WebGL2", { timeout: 60_000 }, async () => {
		const { page } = await open({ gl: false });
		await expect
			.poll(() =>
				page
					.locator("[data-viewer-cover]")
					.evaluateAll((all) =>
						all.map((each) => (each.closest("[data-viewer-frame]") as HTMLElement).dataset.viewerFrame).sort(),
					),
			)
			.toEqual([...covered].sort());
		expect(await page.locator("[data-viewer-placeholder]").count()).toBe(uncovered.length);
	});

	it("hands the pictures to images while the GPU context is lost, and back once it returns", {
		timeout: 60_000,
	}, async () => {
		const { page } = await open();
		await expect.poll(() => drawn(page), { timeout: 20_000 }).toEqual([...covered].sort());
		await page.evaluate(() => {
			const canvas = document.querySelector("[data-picture-layer]") as HTMLCanvasElement;
			const lose = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context");
			(window as unknown as { __lose: unknown }).__lose = lose;
			lose?.loseContext();
		});
		await expect.poll(() => page.locator("[data-viewer-cover]").count(), { timeout: 20_000 }).toBe(covered.length);
		await page.evaluate(() =>
			(window as unknown as { __lose: { restoreContext: () => void } }).__lose.restoreContext(),
		);
		await expect.poll(() => page.locator("[data-viewer-cover]").count(), { timeout: 20_000 }).toBe(0);
		await expect.poll(() => drawn(page), { timeout: 20_000 }).toEqual([...covered].sort());
	});
});
