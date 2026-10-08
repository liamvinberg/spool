import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PresenceState } from "../../team-sync-protocol";
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
	live: "/api/live",
	presence: "/api/presence",
	role: "viewer",
};
/** The same project as an editor sees it, with a cover a member's daemon sent for home. */
const editor: ViewerProject = {
	...project,
	role: "editor",
	covers: { home: "/covers/home" },
	download: "https://spool.test/Spool.dmg",
};
/** The same project as an outsider sees it: the one page shared with them, as it last settled, and one line. */
const outsider: ViewerProject = {
	team: { address: "devosurf", name: "Devosurf", logo: null },
	project: "checkout",
	account: "kim@client.com",
	canvas: {
		pages: ["shop"],
		places: { shop: { x: 3000, y: 0 } },
		order: {},
		frames: [{ name: "shop/cart", page: "shop", x: 0, y: 0, w: 390, h: 844 }],
	},
	frames: FRAMES,
	shared: { by: "ana", pages: ["shop"], updated: Math.floor(Date.now() / 1000) - 150 },
};
/** The project's shares, as spool.page lists them for an editor (with their links) or a viewer (without). */
const SHARES = [
	{
		id: "people-share",
		kind: "people",
		pages: ["shop"],
		people: ["kim@client.com", "ola.n@client.com"],
		by: "ana@devosurf.com",
		at: Math.floor(Date.now() / 1000) - 3 * 86400,
		opens: 14,
		link: "https://cloud.test/shared/people-share",
	},
	{
		id: "link-share",
		kind: "link",
		pages: ["home", "shop"],
		people: [],
		by: "ben@devosurf.com",
		at: Math.floor(Date.now() / 1000) - 8 * 86400,
		opens: 41,
		link: "https://s1.onspool.test/",
	},
];

/** A frame document as the frame's own origin serves it: its name, and a link that walks. */
function frameDocument(frame: string, version = ""): string {
	const target = frame === "home" ? "menu" : "home";
	return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<h1>${frame}${version}</h1><button id="walk">Go to ${target}</button>
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

interface Opened {
	page: Page;
	requests: { method: string; url: string }[];
	/** The project's live address, once the canvas has connected to it. */
	live: () => Promise<WebSocketRoute>;
	/** The project's presence, once the canvas has joined it, and what the canvas has said there. */
	presence: () => Promise<WebSocketRoute>;
	said: PresenceState[];
	/** Whether the canvas ever connected to presence. */
	joined: () => boolean;
	/** Change what the canvas reads next, and what the frames' origin serves. */
	serve: (next: { project?: ViewerProject; version?: string }) => void;
}

async function open(
	path = PATH,
	{
		as = project,
		spool = false,
		session,
		ready = true,
	}: { as?: ViewerProject; spool?: boolean; session?: Record<string, string>; ready?: boolean } = {},
): Promise<Opened> {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	const requests: { method: string; url: string }[] = [];
	page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
	let reading = as;
	let version = "";
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
			if (message === "ping") return;
			said.push((JSON.parse(String(message)) as { state: PresenceState }).state);
		});
	});
	if (session !== undefined)
		await page.addInitScript((values) => {
			for (const [key, value] of Object.entries(values)) window.sessionStorage.setItem(key, value);
		}, session);
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.origin === APP && url.pathname === "/api/canvas") return route.fulfill({ json: reading });
		if (url.origin === APP && url.pathname === "/api/shares")
			return route.fulfill({
				json: {
					shares: SHARES.map(({ link, ...share }) => (reading.role === "viewer" ? share : { ...share, link })),
				},
			});
		if (url.origin === APP && url.pathname.startsWith("/api/shares/")) return route.fulfill({ status: 204 });
		if (url.origin === APP && url.pathname.startsWith("/covers/"))
			return route.fulfill({
				body: readFileSync(join(process.cwd(), "src/ui/agent-app-assets/claude.png")),
				contentType: "image/png",
			});
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
				body: frameDocument(decodeURIComponent(url.pathname.slice(new URL(FRAMES).pathname.length)), version),
			});
		// spool on this Mac, which only answers when the test says it is open
		if (url.href === "http://127.0.0.1:7766/api/health" && spool)
			return route.fulfill({
				json: { name: "spool", version: "0.0.0-test" },
				headers: { "access-control-allow-origin": APP },
			});
		if (url.origin === "http://127.0.0.1:7766" && spool)
			return route.fulfill({ contentType: "text/html", body: "<h1>spool on this Mac</h1>" });
		return route.abort();
	});
	await page.goto(`${APP}${path}`);
	if (ready) await page.getByRole("navigation", { name: "Pages" }).waitFor();
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
		joined: () => presence !== undefined,
		serve: (next) => {
			if (next.project !== undefined) reading = next.project;
			if (next.version !== undefined) version = next.version;
		},
	};
}

const cameraOf = (page: Page) =>
	page.locator("[data-canvas-camera]").evaluate((el) => (el as HTMLElement).style.transform);

describe("the read-only canvas", () => {
	it("shows the pages and live frames with no tool, pane, agent or selection", { timeout: 60_000 }, async () => {
		const { page, requests } = await open();
		await expect.poll(() => page.frameLocator('iframe[title="home"]').locator("h1").textContent()).toBe("home");
		await page.frameLocator('iframe[title="menu"]').locator("h1").waitFor();
		expect(await page.getByText("checkout", { exact: true }).count()).toBeGreaterThan(0);
		expect(await page.getByText("view only").count()).toBe(1);
		for (const name of [/select/i, /edit/i, /hand/i, /agent/i, /new page/i, /rename/i, /share/i, /delete/i, /trash/i])
			expect(await page.getByRole("button", { name }).count(), String(name)).toBe(0);
		expect(await page.locator("[data-canvas-tools], [data-pane-window], textarea, input").count()).toBe(0);
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

	it("shows a teammate's save in place, with the changed mark and a short toast", { timeout: 60_000 }, async () => {
		const { page, live, serve, requests } = await open();
		const menu = page.frameLocator('iframe[title="menu"]');
		await expect.poll(() => menu.locator("h1").textContent()).toBe("menu");
		const socket = await live();

		// ana saves menu, and a new frame beside it; home renders something menu's save changed too
		serve({
			version: " v2",
			project: {
				...project,
				canvas: {
					...project.canvas,
					frames: [...project.canvas.frames, { name: "about", x: 0, y: 700, w: 800, h: 600 }],
				},
			},
		});
		socket.send(
			JSON.stringify({
				type: "saved",
				head: 2,
				by: "ana",
				changed: ["menu", "about"],
				touched: ["menu", "home", "about"],
			}),
		);
		await expect.poll(() => menu.locator("h1").textContent()).toBe("menu v2");
		await expect.poll(() => page.frameLocator('iframe[title="home"]').locator("h1").textContent()).toBe("home v2");
		await page.getByRole("status").getByText("ana saved menu and about").waitFor();
		// the mark on the frame's label and on its row in the rail: changed for menu, new for about
		await page.locator('[data-viewer-frame="about"]').waitFor();
		const rail = page.getByRole("navigation", { name: "Pages" });
		expect(await rail.getByRole("button", { name: "menu frame" }).locator(".animate-unseen-in").count()).toBe(1);
		expect(await rail.getByRole("button", { name: "about frame" }).locator(".animate-unseen-in").count()).toBe(1);
		expect(await rail.getByRole("button", { name: "home frame" }).locator(".animate-unseen-in").count()).toBe(0);
		// the document was made again where it stands: one of it, never a blank one in between
		expect(await page.locator('iframe[title="menu"]').count()).toBe(1);
		await page.getByRole("status").waitFor({ state: "detached", timeout: 10_000 });

		// played, it has been seen
		await page.locator('[data-viewer-frame="menu"]').click();
		await page.locator("[data-viewer-player]").waitFor();
		await page.keyboard.press("Escape");
		await page.locator("[data-viewer-player]").waitFor({ state: "detached" });
		expect(await rail.getByRole("button", { name: "menu frame" }).locator(".animate-unseen-in").count()).toBe(0);
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("never moves anyone mid-flow: the screen on show stays, and the next one is the new version", {
		timeout: 60_000,
	}, async () => {
		const { page, live, serve } = await open(`${PATH}?frame=home`);
		const player = page.locator("[data-viewer-player]");
		await player.waitFor();
		const home = player.frameLocator('iframe[title="home"]');
		await expect.poll(() => home.locator("h1").textContent()).toBe("home");
		const socket = await live();

		// ana saves home and menu, and moves home off the canvas altogether
		serve({
			version: " v2",
			project: { ...project, canvas: { ...project.canvas, frames: project.canvas.frames.slice(1) } },
		});
		socket.send(
			JSON.stringify({ type: "saved", head: 2, by: "ana", changed: ["home", "menu"], touched: ["home", "menu"] }),
		);
		await page.getByRole("status").getByText("ana saved home and menu").waitFor();
		await page.waitForTimeout(500);
		expect(await home.locator("h1").textContent()).toBe("home");
		expect(new URL(page.url()).searchParams.get("frame")).toBe("home");

		await home.getByRole("button", { name: "Go to menu" }).click();
		await expect.poll(() => player.frameLocator('iframe[title="menu"]').locator("h1").textContent()).toBe("menu v2");
	});

	it("offers Open in spool to editors only, and shows covers until a frame draws", { timeout: 60_000 }, async () => {
		const viewer = await open(PATH, { spool: true });
		await viewer.page.waitForTimeout(300);
		expect(await viewer.page.getByRole("button", { name: "Open in spool" }).count()).toBe(0);

		const { page, requests } = await open(PATH, { as: editor });
		await expect
			.poll(() => page.locator('[data-viewer-frame="home"] [data-viewer-cover]').getAttribute("src"))
			.toBe("/covers/home");
		expect(await page.getByText("view only").count()).toBe(0);
		// spool is shut on this Mac: there is nothing to hand over to, so nothing offers it
		await page.waitForTimeout(300);
		expect(await page.getByRole("button", { name: "Open in spool" }).count()).toBe(0);
		expect(new URL(page.url()).origin).toBe(APP);
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("stays in the browser for an editor whose spool answers, and hands over only when asked", {
		timeout: 60_000,
	}, async () => {
		const { page } = await open(`${PATH}/shop`, { as: editor, spool: true });
		await page.getByRole("button", { name: "Open in spool" }).waitFor();
		expect(new URL(page.url()).origin).toBe(APP);
		await page.getByRole("button", { name: "Open in spool" }).click();
		await page.waitForURL("http://127.0.0.1:7766/?open=devosurf%2Fcheckout");
		await page.getByText("spool on this Mac").waitFor();
	});

	it("shows an outsider only the pages shared with them, one line, and nobody", { timeout: 60_000 }, async () => {
		const opened = await open(PATH, { as: outsider });
		const { page, requests } = opened;
		// no root page of their own: the canvas opens on the page shared with them
		await expect
			.poll(() => page.frameLocator('iframe[title="shop/cart"]').locator("h1").textContent())
			.toBe("shop/cart");
		await page.getByText("ana shared shop with you · updated 2 min ago").waitFor();
		const rail = page.getByRole("navigation", { name: "Pages" });
		expect(await rail.getByRole("button", { name: "shop" }).count()).toBe(1);
		for (const other of ["home", "menu"]) expect(await page.getByText(other, { exact: true }).count(), other).toBe(0);
		expect(await page.getByText("view only").count()).toBe(0);
		for (const name of [/open in spool/i, /^shared/i])
			expect(await page.getByRole("button", { name }).count()).toBe(0);

		// a walk off the shared pages goes where it leads, and that screen says it isn't shared
		await page.locator('[data-viewer-frame="shop/cart"]').click();
		const player = page.locator("[data-viewer-player]");
		await player.frameLocator('iframe[title="shop/cart"]').getByRole("button", { name: "Go to home" }).click();
		await expect.poll(() => new URL(page.url()).searchParams.get("frame")).toBe("home");
		expect(await player.locator('iframe[title="home"]').getAttribute("src")).toBe(`${FRAMES}home?play`);
		// nothing listens to the project's saves for them, nobody is on their canvas, and nothing they do sends anything
		expect(requests.some((request) => request.url.includes("/api/live"))).toBe(false);
		expect(opened.joined()).toBe(false);
		expect(await page.locator("[data-presence-faces], [data-presence-layer]").count()).toBe(0);
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("shows teammates as the Mac's canvas does, and says where this viewer is for them to see", {
		timeout: 60_000,
	}, async () => {
		const { page, presence, said, requests } = await open();
		await page.frameLocator('iframe[title="home"]').locator("h1").waitFor();
		const room = await presence();
		const ana = { accountId: "ana-id", name: "ana", color: "#eaa94a" };
		const state = (more: Partial<PresenceState> = {}): PresenceState => ({
			page: "",
			pointer: { x: 400, y: 300 },
			pressed: false,
			dragging: [],
			inside: null,
			view: { x: 0, y: 0, w: 1700, h: 600 },
			...more,
		});
		const hear = (more: Partial<PresenceState> | null) =>
			room.send(
				JSON.stringify({ type: "presence", person: ana, state: more === null ? null : state(more), still: 0 }),
			);

		// her pointer and name over home, in her colour, and her face at the top right
		hear({});
		const cursor = page.locator('[data-presence-cursor="ana-id"]');
		await cursor.waitFor({ state: "attached" });
		const home = await page.locator('[data-viewer-frame="home"]').boundingBox();
		const pointer = await cursor.locator("div").first().boundingBox();
		if (home === null || pointer === null) throw new Error("nothing on screen");
		expect(pointer.x).toBeGreaterThan(home.x);
		expect(pointer.x).toBeLessThan(home.x + home.width);
		await page.locator('[data-presence-pill="ana-id"][data-presence-said]').waitFor();
		expect(await page.locator('[data-presence-face="ana-id"]').count()).toBe(1);
		// inside menu live, her name docks on its
		hear({ inside: "menu" });
		await page.locator('[data-presence-docked="menu"]').waitFor();

		// where this viewer's pointer is, in the canvas's world, and the page they're on
		const field = await page.locator("[data-viewer-field]").boundingBox();
		if (field === null) throw new Error("no field");
		await page.mouse.move(field.x + 300, field.y + 200);
		await expect.poll(() => said.at(-1)?.pointer).not.toBeNull();
		expect(said.at(-1)).toMatchObject({ page: "", pressed: false, dragging: [], inside: null });
		expect(said.at(-1)?.view?.w).toBeGreaterThan(0);
		// a frame played is the frame they're inside
		await page.locator('[data-viewer-frame="home"]').click();
		await expect.poll(() => said.at(-1)?.inside).toBe("home");
		await page.getByRole("button", { name: "Back to the canvas" }).click();
		await expect.poll(() => said.at(-1)?.inside).toBeNull();

		// a face pressed follows her: her page, her view, until esc
		await page.locator('[data-presence-face="ana-id"]').click();
		await page.locator('[data-presence-following="ana-id"]').waitFor();
		hear({ page: "shop", inside: null, view: { x: 0, y: 0, w: 390, h: 844 } });
		await expect.poll(() => new URL(page.url()).pathname).toBe(`${PATH}/shop`);
		await page.keyboard.press("Escape");
		await page.locator("[data-presence-following]").waitFor({ state: "detached" });
		expect(new URL(page.url()).pathname).toBe(`${PATH}/shop`);

		// gone, she fades from the canvas and the faces
		hear(null);
		await page.locator('[data-presence-face="ana-id"]').waitFor({ state: "detached" });
		await page.locator('[data-presence-cursor="ana-id"]').waitFor({ state: "detached" });
		// presence is said over the socket alone: nothing is ever posted
		expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
	});

	it("lists the project's shares for members, which editors open, change and stop and viewers only read", {
		timeout: 60_000,
	}, async () => {
		const viewer = await open(PATH, { as: { ...project, shares: "/api/shares" } });
		await viewer.page.getByRole("button", { name: /^Shared/u }).click();
		const read = viewer.page.getByRole("dialog", { name: "Shared" });
		await read.getByText("kim and ola").waitFor();
		await read.getByText("anyone with the link").waitFor();
		for (const button of await read.getByRole("button").all()) expect(await button.isDisabled()).toBe(true);
		expect(await read.getByText(/Copy link|Stop sharing/u).count()).toBe(0);
		expect(viewer.requests.filter((request) => request.method !== "GET")).toEqual([]);

		const { page, requests } = await open(PATH, { as: { ...editor, shares: "/api/shares" } });
		await page.getByRole("button", { name: /^Shared/u }).click();
		const shared = page.getByRole("dialog", { name: "Shared" });
		await shared.getByRole("button", { name: /kim and ola/u }).click();
		await shared.getByText("ola.n@client.com").waitFor();
		await shared.getByText("ana · 3 days ago · 14 opens").waitFor();
		await shared.getByRole("button", { name: "Copy link" }).waitFor();
		await shared.getByRole("button", { name: "Remove ola.n@client.com" }).click();
		await shared.getByLabel("Add someone by email").fill("sam@client.com");
		await shared.getByLabel("Add someone by email").press("Enter");
		await shared.getByRole("button", { name: "Stop sharing" }).click();
		const writes = () => requests.filter((request) => request.method !== "GET");
		await expect.poll(() => writes().length).toBe(3);
		expect(writes()).toEqual([
			{ method: "PATCH", url: `${APP}/api/shares/people-share` },
			{ method: "PATCH", url: `${APP}/api/shares/people-share` },
			{ method: "DELETE", url: `${APP}/api/shares/people-share` },
		]);
	});
});
