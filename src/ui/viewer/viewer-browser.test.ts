import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testBrowser } from "../../test-browser";
import type { ViewerProject } from "./source";

/**
 * The read-only canvas as Spool Cloud serves it: the package's own build, a
 * page that names where the project is read from, and every frame's document
 * on an origin of its own. What a person looking at it can reach is the whole
 * test: their own camera, the pages, a frame played and walked, and never a
 * tool, a selection or a request that changes anything.
 */

const APP = "https://cloud.test";
const FRAMES = "https://frames.test/f/grant/";
const PATH = "/devosurf/checkout";

const project: ViewerProject = {
	team: { address: "devosurf", name: "Devosurf", logo: null },
	project: "checkout",
	account: "vic@devosurf.com",
	canvas: {
		pages: ["shop"],
		places: { shop: { x: 3000, y: 0 } },
		order: {},
		frames: [
			{ name: "home", x: 0, y: 0, w: 800, h: 600 },
			{ name: "menu", x: 900, y: 0, w: 800, h: 600 },
			{ name: "shop/cart", page: "shop", x: 0, y: 0, w: 390, h: 844 },
		],
	},
	frames: FRAMES,
};

/** A frame document as the frame's own origin serves it: its name, and a link that walks. */
function frameDocument(frame: string): string {
	const target = frame === "home" ? "menu" : "home";
	return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<h1>${frame}</h1><button id="walk">Go to ${target}</button>
<script>
const FRAME = ${JSON.stringify(frame)};
parent.postMessage({ spool: "loaded", frame: FRAME }, "*");
document.getElementById("walk").addEventListener("click", () => {
	parent.postMessage({ spool: "go", frame: FRAME, target: ${JSON.stringify(target)}, session: { scenario: "default", state: { from: FRAME }, stack: [FRAME] }, id: 7 }, "*");
});
</script></body></html>`;
}

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-viewer-"));
	const { build } = await import("vite");
	await build({
		configFile: join(process.cwd(), "vite.viewer.config.ts"),
		logLevel: "silent",
		build: { outDir: built, emptyOutDir: true },
	});
	const manifest = JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")) as Record<
		string,
		{ file: string; css?: string[] }
	>;
	const index = manifest["index.html"];
	if (index === undefined) throw new Error("the viewer build has no entry");
	entry = { file: index.file, css: index.css ?? [] };
}, 120_000);

afterAll(() => rmSync(built, { recursive: true, force: true }));

async function open(path = PATH): Promise<{ page: Page; requests: { method: string; url: string }[] }> {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	const requests: { method: string; url: string }[] = [];
	page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.origin === APP && url.pathname === "/api/canvas") return route.fulfill({ json: project });
		if (url.origin === APP && (url.pathname === PATH || url.pathname.startsWith(`${PATH}/`)))
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><head>${entry.css.map((css) => `<link rel="stylesheet" href="/_viewer/${css}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
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
	await page.goto(`${APP}${path}`);
	await page.getByRole("navigation", { name: "Pages" }).waitFor();
	return { page, requests };
}

const cameraOf = (page: Page) =>
	page.locator("[data-canvas-camera]").evaluate((el) => (el as HTMLElement).style.transform);

describe("the read-only canvas", () => {
	it("shows the pages and live frames with no tool, dock, agent or selection", { timeout: 60_000 }, async () => {
		const { page, requests } = await open();
		await expect.poll(() => page.frameLocator('iframe[title="home"]').locator("h1").textContent()).toBe("home");
		await page.frameLocator('iframe[title="menu"]').locator("h1").waitFor();
		expect(await page.getByText("checkout", { exact: true }).count()).toBeGreaterThan(0);
		expect(await page.getByText("view only").count()).toBe(1);
		for (const name of [/select/i, /edit/i, /hand/i, /agent/i, /new page/i, /rename/i, /share/i, /delete/i, /trash/i])
			expect(await page.getByRole("button", { name }).count(), String(name)).toBe(0);
		expect(await page.locator("[data-canvas-tools], [data-dock], textarea, input").count()).toBe(0);
		expect(await page.locator("body > #root > div").evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");

		// a frame dragged moves the camera, never the frame
		const before = await cameraOf(page);
		const home = page.locator('[data-viewer-frame="home"]');
		const at = await home.boundingBox();
		if (at === null) throw new Error("home is not on screen");
		await page.mouse.move(at.x + 40, at.y + 40);
		await page.mouse.down();
		await page.mouse.move(at.x + 140, at.y + 90, { steps: 5 });
		await page.mouse.up();
		expect(await cameraOf(page)).not.toBe(before);
		expect(await home.evaluate((el) => [el.style.left, el.style.top])).toEqual(["0px", "0px"]);
		expect(await page.locator("[data-viewer-player]").count()).toBe(0);
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("pans with scroll and zooms around the pointer with ⌘ or ctrl held", { timeout: 60_000 }, async () => {
		const { page } = await open();
		const zoom = page.locator("[data-viewer-zoom]");
		await expect.poll(() => zoom.textContent()).toMatch(/%$/);
		const fitted = await zoom.textContent();
		const before = await cameraOf(page);
		await page.mouse.move(640, 400);
		await page.mouse.wheel(120, 80);
		await expect.poll(() => cameraOf(page)).not.toBe(before);
		expect(await zoom.textContent()).toBe(fitted);
		await page.keyboard.down("Control");
		await page.mouse.wheel(0, -200);
		await page.keyboard.up("Control");
		await expect.poll(() => zoom.textContent()).not.toBe(fitted);
		await page.getByRole("button", { name: "fit", exact: true }).click();
		await expect.poll(() => zoom.textContent()).toBe(fitted);
	});

	it("grows a frame into the player, walks it, and closes back to the canvas", { timeout: 60_000 }, async () => {
		const { page, requests } = await open();
		await page.frameLocator('iframe[title="home"]').locator("h1").waitFor();
		await page.locator('[data-viewer-frame="home"]').click();
		const player = page.locator("[data-viewer-player]");
		await player.waitFor();
		await expect.poll(() => page.locator("#spool-switcher").textContent()).toContain("home");
		expect(new URL(page.url()).searchParams.get("frame")).toBe("home");
		expect(await player.locator(".spool-top").evaluate((el) => el.getBoundingClientRect().height)).toBe(30);

		await player.frameLocator('iframe[title="home"]').getByRole("button", { name: "Go to menu" }).click();
		await expect.poll(() => page.locator("#spool-switcher").textContent()).toContain("menu");
		await player.frameLocator('iframe[title="menu"]').locator("h1").waitFor();
		expect(new URL(page.url()).searchParams.get("frame")).toBe("menu");

		await page.getByRole("button", { name: "Back to the canvas" }).click();
		await player.waitFor({ state: "detached" });
		expect(new URL(page.url()).searchParams.get("frame")).toBeNull();
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("follows the page and the played frame in the URL", { timeout: 60_000 }, async () => {
		const { page } = await open();
		await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: "shop" }).click();
		await expect.poll(() => new URL(page.url()).pathname).toBe(`${PATH}/shop`);
		await page.frameLocator('iframe[title="shop/cart"]').locator("h1").waitFor();
		expect(await page.locator('[data-viewer-frame="home"]').count()).toBe(0);

		const played = await open(`${PATH}/shop?frame=shop%2Fcart`);
		await played.page.locator("[data-viewer-player]").waitFor();
		await expect.poll(() => played.page.locator("#spool-switcher").textContent()).toContain("shop/cart");
		await played.page.keyboard.press("Escape");
		await played.page.locator("[data-viewer-player]").waitFor({ state: "detached" });
		expect(new URL(played.page.url()).pathname).toBe(`${PATH}/shop`);
	});
});
