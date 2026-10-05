import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DesignFrame } from "../../daemon/design-projection";
import type { PresenceState } from "../../team-sync-protocol";
import { testBrowser } from "../../test-browser";
import type { ViewerConfig, ViewerProject } from "./source";

/**
 * The read-only canvas on a phone, as Spool Cloud serves it: the package's own
 * build at an iPhone's size, touch first, with the notch and home bar's safe
 * areas the phone reports. A shared link plays its prototype full screen and
 * says once how to keep it; a team canvas is a navigator, its frames played
 * from their covers and left by a pull from the right edge.
 */

const APP = "https://cloud.test";
const FRAMES = "https://frames.test/f/grant/";
const PATH = "/devosurf/checkout";
const PHONE = { width: 393, height: 852 };
const INSETS = { top: 62, bottom: 34 };
const now = Math.floor(Date.now() / 1000);

/** A project the size of spool’s own: 105 pages nested five deep, each with a few frames, one of them desktop-sized. */
function bigCanvas(): ViewerProject["canvas"] {
	const pages: string[] = [];
	for (let a = 0; a < 5; a++)
		for (let b = 0; b < 5; b++) {
			const top = `area-${a}`;
			const chain = [top, `${top}/part-${b}`, `${top}/part-${b}/deep`, `${top}/part-${b}/deep/deeper`];
			chain.push(`${chain[3]}/deepest`);
			for (const page of chain) if (!pages.includes(page)) pages.push(page);
		}
	const frames: DesignFrame[] = [
		{ name: "home", x: 0, y: 0, w: 390, h: 844 },
		{ name: "menu", x: 500, y: 0, w: 390, h: 844 },
		{ name: "dashboard", x: 1000, y: 0, w: 1440, h: 900 },
	];
	for (const page of pages)
		for (let n = 0; n < 4; n++) frames.push({ name: `${page}/screen-${n}`, page, x: n * 500, y: 0, w: 390, h: 844 });
	return { pages, places: {}, order: {}, frames };
}

const member: ViewerProject = {
	team: { address: "devosurf", name: "Devosurf", logo: null },
	project: "checkout",
	account: "vic@devosurf.com",
	canvas: bigCanvas(),
	frames: FRAMES,
	live: "/api/live",
	presence: "/api/presence",
	role: "viewer",
	covers: { home: "/covers/home" },
	recent: [
		{ frame: "menu", by: "jonas", at: now - 120 },
		{ frame: "area-3/part-2/deep/screen-1", by: "mira", at: now - 7200 },
		{ frame: "home", by: "ana", at: now - 3 * 86400 },
	],
};

const outsider: ViewerProject = {
	team: { address: "devosurf", name: "Devosurf", logo: null },
	project: "checkout",
	account: null,
	canvas: {
		pages: ["shop"],
		places: {},
		order: { frames: { shop: ["cart", "pay", "admin"] } },
		frames: [
			{ name: "shop/pay", page: "shop", x: 500, y: 0, w: 390, h: 844 },
			{ name: "shop/cart", page: "shop", x: 0, y: 0, w: 390, h: 844 },
			{ name: "shop/admin", page: "shop", x: 1000, y: 0, w: 1440, h: 900 },
		],
	},
	frames: FRAMES,
	shared: { by: "ana", pages: ["shop"], updated: now - 150 },
};

/**
 * A frame document as the frames' origin serves it: its name, the safe areas it pads itself by, and links that
 * walk to the next screen and to a desktop one.
 */
function frameDocument(frame: string): string {
	const next = frame === "shop/cart" ? "shop/pay" : frame === "home" ? "menu" : "home";
	return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<div id="pad" style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
<h1>${frame}</h1><button id="walk">Go to ${next}</button><button id="wide">Go to admin</button></div>
<script>
const FRAME = ${JSON.stringify(frame)};
const go = (target) => parent.postMessage({ spool: "go", frame: FRAME, target, session: { scenario: "default", state: {}, stack: [FRAME] }, id: 3 }, "*");
document.getElementById("walk").addEventListener("click", () => go(${JSON.stringify(next)}));
document.getElementById("wide").addEventListener("click", () => go("shop/admin"));
</script></body></html>`;
}

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-viewer-phone-"));
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

interface Opened {
	page: Page;
	requests: { method: string; url: string }[];
	live: () => Promise<WebSocketRoute>;
	presence: () => Promise<WebSocketRoute>;
	/** What the phone has said of where its person is. */
	said: PresenceState[];
}

/** The canvas on an iPhone-sized touch screen, with its safe areas, at `path` under the page's configuration. */
async function onPhone(
	path: string,
	{ as, config, storage }: { as: ViewerProject; config: ViewerConfig; storage?: Record<string, string> },
): Promise<Opened> {
	const browser = await testBrowser();
	const context = await browser.newContext({
		viewport: PHONE,
		screen: PHONE,
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 3,
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send(
		"Emulation.setSafeAreaInsetsOverride" as never,
		{ insets: { ...INSETS, left: 0, right: 0 } } as never,
	);
	const requests: { method: string; url: string }[] = [];
	page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
	let socket: WebSocketRoute | undefined;
	await page.routeWebSocket(`${APP.replace("https", "wss")}/api/live`, (route) => {
		socket = route;
		route.send(JSON.stringify({ type: "head", head: 1 }));
	});
	let presence: WebSocketRoute | undefined;
	const said: PresenceState[] = [];
	await page.routeWebSocket(`${APP.replace("https", "wss")}/api/presence`, (route) => {
		presence = route;
		route.onMessage((message) => {
			if (message !== "ping") said.push((JSON.parse(String(message)) as { state: PresenceState }).state);
		});
	});
	if (storage !== undefined)
		await page.addInitScript((values) => {
			for (const [key, value] of Object.entries(values)) window.localStorage.setItem(key, value);
		}, storage);
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.origin === APP && url.pathname === "/api/canvas") return route.fulfill({ json: as });
		if (url.origin === APP && url.pathname.startsWith("/covers/"))
			return route.fulfill({
				body: readFileSync(join(process.cwd(), "src/ui/agent-app-assets/claude.png")),
				contentType: "image/png",
			});
		if (url.href.startsWith(FRAMES))
			return route.fulfill({
				contentType: "text/html",
				body: frameDocument(decodeURIComponent(url.pathname.slice(new URL(FRAMES).pathname.length))),
			});
		if (url.origin === APP && !url.pathname.startsWith("/api/"))
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${entry.css.map((css) => `<link rel="stylesheet" href="/_viewer/${css}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
<script id="spool-viewer" type="application/json">${JSON.stringify(config)}</script>
<div id="root"></div></body></html>`,
			});
		return route.abort();
	});
	await page.goto(`${APP}${path}`);
	return {
		page,
		requests,
		live: async () => {
			await expect.poll(() => socket !== undefined).toBe(true);
			return socket as WebSocketRoute;
		},
		presence: async () => {
			await expect.poll(() => presence !== undefined).toBe(true);
			return presence as WebSocketRoute;
		},
		said,
	};
}

const LINK: ViewerConfig = { api: "/api/canvas", path: "", app: true };
const CANVAS: ViewerConfig = { api: "/api/canvas", path: PATH };

/** The played frame's box on screen, and the window it is in. */
const played = (page: Page) =>
	page.locator("[data-phone-frame]").evaluate((el) => {
		const box = el.getBoundingClientRect();
		return {
			position: getComputedStyle(el).position,
			box: { x: box.x, y: box.y, w: Math.round(box.width), h: Math.round(box.height) },
			window: { w: window.innerWidth, h: window.innerHeight },
		};
	});

/** A pull from the right edge of the screen toward the middle, as a thumb makes it. */
async function pullFromRightEdge(page: Page, far: number) {
	const y = PHONE.height / 2;
	await page.mouse.move(PHONE.width - 6, y);
	await page.mouse.down();
	await page.mouse.move(PHONE.width - 6 - far, y, { steps: 8 });
	await page.mouse.up();
}

describe("a shared link on a phone", () => {
	it("plays its first screen in a fixed full-height frame that pads itself by the safe areas", {
		timeout: 60_000,
	}, async () => {
		const { page, requests } = await onPhone("/", {
			as: outsider,
			config: LINK,
			storage: { "spool-link:told": "1" },
		});
		const frame = page.frameLocator("[data-phone-frame]");
		await expect.poll(() => frame.locator("h1").textContent()).toBe("shop/cart");
		expect(await played(page)).toEqual({
			position: "fixed",
			box: { x: 0, y: 0, w: PHONE.width, h: PHONE.height },
			window: { w: PHONE.width, h: PHONE.height },
		});
		// the frame is told the real notch and home bar, and pads itself by them
		expect(
			await frame
				.locator("#pad")
				.evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).paddingBottom]),
		).toEqual([`${INSETS.top}px`, `${INSETS.bottom}px`]);
		// no canvas, no chrome: only the prototype
		expect(await page.getByRole("navigation", { name: "Pages" }).count()).toBe(0);
		expect(await page.locator("[data-phone-edge], [data-first-open]").count()).toBe(0);

		// a walk goes where the frame leads, and the URL follows it
		await frame.locator("#walk").click();
		await expect.poll(() => frame.locator("h1").textContent()).toBe("shop/pay");
		expect(new URL(page.url()).searchParams.get("frame")).toBe("shop/pay");
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("says once in the phone's browser who shared it and how to keep it, never in the way", {
		timeout: 60_000,
	}, async () => {
		const { page } = await onPhone("/", { as: outsider, config: LINK });
		const card = page.getByRole("dialog", { name: "checkout, shared with you" });
		await card.waitFor();
		expect(await card.textContent()).toContain("ana shared this · updated 2 min ago");
		expect(await card.textContent()).toContain("Add to Home Screen");
		// the prototype runs and takes touches above it
		const frame = page.frameLocator("[data-phone-frame]");
		await frame.locator("#walk").click();
		await expect.poll(() => frame.locator("h1").textContent()).toBe("shop/pay");
		await card.getByRole("button", { name: "Open it here" }).click();
		expect(await card.count()).toBe(0);
		// once: opened again, it stays away
		await page.reload();
		await expect.poll(() => frame.locator("h1").textContent()).toBe("shop/pay");
		expect(await page.locator("[data-first-open]").count()).toBe(0);
	});

	it("has no card where the page is no app to keep", { timeout: 60_000 }, async () => {
		const { page } = await onPhone("/shared/people", {
			as: outsider,
			config: { api: "/api/canvas", path: "/shared/people" },
		});
		await expect.poll(() => page.frameLocator("[data-phone-frame]").locator("h1").textContent()).toBe("shop/cart");
		expect(await page.locator("[data-first-open]").count()).toBe(0);
	});

	it("plays a desktop frame whole and small upright, and at the screen's size turned", {
		timeout: 60_000,
	}, async () => {
		const { page } = await onPhone("/?frame=shop%2Fadmin", {
			as: outsider,
			config: LINK,
			storage: { "spool-link:told": "1" },
		});
		await page.locator("[data-phone-turn]").waitFor();
		expect(await page.locator("[data-phone-turn]").textContent()).toBe("1440 × 900 · turn the phone");
		const upright = await page.locator("[data-phone-frame]").boundingBox();
		expect(upright?.width).toBeCloseTo(PHONE.width, 0);
		expect(upright?.y).toBeGreaterThanOrEqual(INSETS.top);
		await page.setViewportSize({ width: PHONE.height, height: PHONE.width });
		await expect.poll(() => page.locator("[data-phone-turn]").count()).toBe(0);
		const turned = await page.locator("[data-phone-frame]").boundingBox();
		expect(turned?.height).toBeCloseTo(PHONE.width, 0);
		expect(turned?.width).toBeCloseTo((1440 * PHONE.width) / 900, 0);
		// the share has no navigator to go back to: turning upright again keeps playing it
		await page.setViewportSize(PHONE);
		await page.locator("[data-phone-turn]").waitFor();
	});
});

describe("a team canvas on a phone", () => {
	it("is a navigator: recent, the pages a level at a time, and find, on a 105-page project", {
		timeout: 60_000,
	}, async () => {
		const { page, requests } = await onPhone(PATH, { as: member, config: CANVAS });
		const pages = page.getByRole("navigation", { name: "Pages" });
		await pages.waitFor();
		// no spatial canvas
		expect(await page.locator("[data-canvas-camera], [data-viewer-field]").count()).toBe(0);

		// recent: the frames saved to last, who saved each and when
		const recent = pages.getByRole("button", { name: /^Play / });
		expect(await recent.nth(0).textContent()).toContain("menujonas · 2 min ago");
		expect(await recent.nth(1).textContent()).toContain("screen-1mira · 2 hours ago · area-3/part-2/deep");

		// the top level: its pages with how many frames each holds, and its own frames as covers
		const area = pages.getByRole("button", { name: "area-3", exact: true });
		expect(await area.textContent()).toContain("84");
		expect(await page.locator("[data-navigator-cover] img").count()).toBeGreaterThan(0);

		// a level at a time, with breadcrumbs back up
		await area.click();
		await pages.getByRole("button", { name: "part-2", exact: true }).click();
		await pages.getByRole("button", { name: "deep", exact: true }).click();
		const where = page.getByRole("navigation", { name: "Where" });
		expect(await where.textContent()).toBe("checkout/area-3/part-2/deep");
		expect(new URL(page.url()).pathname).toBe(`${PATH}/area-3/part-2/deep`);
		expect(await pages.getByRole("button", { name: /^Play screen-/ }).count()).toBe(4);
		expect(await pages.getByText("recent").count()).toBe(0);
		await where.getByRole("button", { name: "area-3" }).click();
		expect(await where.textContent()).toBe("checkout/area-3");
		await page.goBack();
		expect(await where.textContent()).toBe("checkout/area-3/part-2/deep");

		// find, over page and frame names
		await page.getByRole("searchbox", { name: "Find a page or a frame" }).fill("deepest");
		expect(await pages.getByRole("button", { name: /deepest$/ }).count()).toBe(8);
		await page.getByRole("searchbox", { name: "Find a page or a frame" }).fill("dashb");
		await pages.getByRole("button", { name: "Play dashboard" }).waitFor();
		await page.getByRole("searchbox", { name: "Find a page or a frame" }).fill("no such thing");
		await pages.getByText("nothing matches no such thing").waitFor();
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("plays a frame from its cover full screen, and a pull from the right edge leaves", {
		timeout: 60_000,
	}, async () => {
		const { page } = await onPhone(PATH, { as: member, config: CANVAS });
		await page.getByRole("button", { name: "Play home" }).last().click();
		const frame = page.frameLocator("[data-phone-frame]");
		await expect.poll(() => frame.locator("h1").textContent()).toBe("home");
		expect(new URL(page.url()).searchParams.get("frame")).toBe("home");
		expect((await played(page)).box).toEqual({ x: 0, y: 0, w: PHONE.width, h: PHONE.height });
		expect(await frame.locator("#pad").evaluate((el) => getComputedStyle(el).paddingTop)).toBe(`${INSETS.top}px`);

		// a walk inside is the frame's
		await frame.locator("#walk").click();
		await expect.poll(() => frame.locator("h1").textContent()).toBe("menu");

		// a short pull springs back; a long one leaves
		await pullFromRightEdge(page, 30);
		expect(await page.locator("[data-phone-play]").count()).toBe(1);
		await pullFromRightEdge(page, 160);
		await expect.poll(() => page.locator("[data-phone-play]").count()).toBe(0);
		expect(new URL(page.url()).searchParams.get("frame")).toBeNull();
	});

	it("plays a desktop frame turned, and leaves it when the phone turns upright", { timeout: 60_000 }, async () => {
		const { page } = await onPhone(PATH, { as: member, config: CANVAS });
		await page.getByRole("button", { name: "Play dashboard" }).click();
		await page.locator("[data-phone-turn]").waitFor();
		expect(await page.locator("[data-phone-turn]").textContent()).toBe("1440 × 900 · turn the phone");
		await page.setViewportSize({ width: PHONE.height, height: PHONE.width });
		await expect.poll(() => page.locator("[data-phone-turn]").count()).toBe(0);
		expect((await page.locator("[data-phone-frame]").boundingBox())?.height).toBeCloseTo(PHONE.width, 0);
		await page.setViewportSize(PHONE);
		await expect.poll(() => page.locator("[data-phone-play]").count()).toBe(0);
	});

	it("tells a teammate's save as a toast that shows it", { timeout: 60_000 }, async () => {
		const { page, live } = await onPhone(PATH, { as: member, config: CANVAS });
		const socket = await live();
		socket.send(JSON.stringify({ type: "saved", head: 2, by: "jonas", changed: ["menu"], touched: ["menu"] }));
		const toast = page.getByRole("status");
		await expect.poll(() => toast.textContent()).toBe("jonas saved menushow");
		await toast.getByRole("button", { name: "show" }).click();
		await expect.poll(() => page.frameLocator("[data-phone-frame]").locator("h1").textContent()).toBe("menu");
	});

	it("shows who is in each part, and is seen on the level it is on and inside the frame it plays", {
		timeout: 60_000,
	}, async () => {
		const { page, presence, said, requests } = await onPhone(PATH, { as: member, config: CANVAS });
		const pages = page.getByRole("navigation", { name: "Pages" });
		await pages.waitFor();
		const room = await presence();
		const hear = (name: string, state: Partial<PresenceState>) =>
			room.send(
				JSON.stringify({
					type: "presence",
					person: { accountId: `${name}-id`, name, color: "#4cc495" },
					state: { page: "", pointer: null, pressed: false, dragging: [], inside: null, view: null, ...state },
					still: 0,
				}),
			);
		hear("ana", { page: "area-3/part-2/deep", pointer: { x: 10, y: 10 } });
		hear("mira", { inside: "home" });
		const part = (where: string) => page.locator(`${where} [data-presence-part]`);

		// everyone at the top, and each where they are: ana under area-3, mira inside home
		await expect.poll(() => part("header").getAttribute("data-presence-part")).toBe("ana mira");
		const area = pages.getByRole("button", { name: "area-3", exact: true });
		await expect.poll(() => area.locator("[data-presence-part]").getAttribute("data-presence-part")).toBe("ana");
		expect(
			await pages.getByRole("button", { name: "area-1", exact: true }).locator("[data-presence-part]").count(),
		).toBe(0);
		await expect.poll(() => part('[data-navigator-cover="home"]').getAttribute("data-presence-part")).toBe("mira");

		// a level down, ana is in part-2; this phone is seen on the level it opened
		await area.click();
		await expect
			.poll(() =>
				pages
					.getByRole("button", { name: "part-2", exact: true })
					.locator("[data-presence-part]")
					.getAttribute("data-presence-part"),
			)
			.toBe("ana");
		await expect
			.poll(() => said.at(-1))
			.toEqual({
				page: "area-3",
				pointer: null,
				pressed: false,
				dragging: [],
				inside: null,
				view: null,
			});
		await page.getByRole("navigation", { name: "Where" }).getByRole("button", { name: "checkout" }).click();
		await pages.getByRole("button", { name: "Play home" }).last().click();
		await page.locator("[data-phone-frame]").waitFor();
		await expect.poll(() => said.at(-1)?.inside).toBe("home");

		// gone, she leaves the parts she was in
		room.send(
			JSON.stringify({
				type: "presence",
				person: { accountId: "ana-id", name: "ana", color: "#4cc495" },
				state: null,
				still: 0,
			}),
		);
		await expect.poll(() => part("header").getAttribute("data-presence-part")).toBe("mira");
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});
});
