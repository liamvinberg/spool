import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Comment } from "../../team-sync-protocol";
import { testBrowser } from "../../test-browser";
import { buildEntry } from "./build-entry";
import type { ViewerProject } from "./source";

/**
 * Comments on the browser canvas at spool.page (spool#173), driven in the package's own viewer build as Spool Cloud
 * serves it: a member takes the Comment tool with C (or holds it), places a pin on a frame or the field, writes in
 * the Mac's composer and sends it to spool.page over HTTP, and hears comments, replies and reads on the presence
 * socket. The Comments panel lists them and flies to a pin; a comment's link opens the canvas on it.
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
	comments: "/api/comments",
	people: "/api/people",
	me: "vic",
	role: "viewer",
};

const VIC = { accountId: "vic", name: "Vic", color: "#7aa2f7" };
const BEN = { accountId: "ben", name: "Ben", color: "#e0af68" };

/** A comment as spool.page sends it. */
function comment(id: string, more: Partial<Comment> = {}): Comment {
	return {
		id,
		audience: "team",
		page: "",
		frame: "home",
		at: { x: 100, y: 80 },
		element: null,
		revision: null,
		still: false,
		author: BEN,
		agent: false,
		body: `words of ${id}`,
		created: Date.now() - 60_000,
		edited: null,
		resolved: null,
		standing: "placed",
		replies: [],
		...more,
	};
}

/** A frame document as the frames' origin serves it, whose shim answers a pick with the heading under the point. */
function frameDocument(frame: string): string {
	return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<main><h1>${frame}</h1></main>
<script>
const FRAME = ${JSON.stringify(frame)};
parent.postMessage({ spool: "loaded", frame: FRAME }, "*");
addEventListener("message", (event) => {
	if (event.data?.spool !== "pick") return;
	parent.postMessage({ spool: "picked", frame: FRAME, id: event.data.id, chain: [
		{ selector: "main", tag: "main", outerHtml: "<main>…</main>", rect: { x: 0, y: 0, w: 800, h: 600 }, radius: 0, source: "frames/" + FRAME + "/frame.tsx:2:10", generated: false },
		{ selector: "main > h1", tag: "h1", outerHtml: "<h1>" + FRAME + "</h1>", rect: { x: 0, y: 0, w: 800, h: 40 }, radius: 0, source: "frames/" + FRAME + "/frame.tsx:2:16", generated: false },
	] }, "*");
});
</script></body></html>`;
}

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = mkdtempSync(join(tmpdir(), "spool-viewer-comments-"));
	const { build } = await import("vite");
	await build({
		configFile: join(process.cwd(), "vite.viewer.config.ts"),
		logLevel: "silent",
		build: { outDir: built, emptyOutDir: true },
	});
	entry = buildEntry(JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")), "index.html");
}, 120_000);

afterAll(() => rmSync(built, { recursive: true, force: true }));

interface Written {
	method: string;
	path: string;
	body: unknown;
}

interface Opened {
	page: Page;
	/** What the canvas wrote to spool.page's comments API. */
	written: Written[];
	/** The presence socket, once the canvas has joined it. */
	presence: () => Promise<WebSocketRoute>;
	/** Tell the canvas something on its presence socket. */
	tell: (message: Record<string, unknown>) => Promise<void>;
}

async function open(path = PATH, comments: Comment[] = [], answer?: (written: Written) => Response | null) {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	const written: Written[] = [];
	await page.routeWebSocket(`${APP.replace("https", "wss")}/api/live`, (route) => {
		route.send(JSON.stringify({ type: "head", head: 1 }));
	});
	let presence: WebSocketRoute | undefined;
	await page.routeWebSocket(`${APP.replace("https", "wss")}/api/presence`, (route) => {
		presence = route;
		route.onMessage(() => {});
		// a member's browser is sent every comment it may read as it joins, with when it last read each
		route.send(JSON.stringify({ type: "comments", comments, first: true, last: true, reads: {} }));
	});
	let posted = 0;
	await page.route("**/*", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.origin === APP && url.pathname === "/api/canvas") return route.fulfill({ json: project });
		if (url.origin === APP && url.pathname === "/api/people")
			return route.fulfill({
				json: {
					members: [
						{ ...VIC, email: "vic@devosurf.com", role: "viewer", you: true },
						{ ...BEN, you: false },
					],
				},
			});
		if (url.origin === APP && url.pathname.startsWith("/api/comments")) {
			const body: unknown = request.postData() === null ? null : JSON.parse(request.postData() ?? "null");
			const write = { method: request.method(), path: url.pathname, body };
			written.push(write);
			const given = answer?.(write);
			if (given !== undefined && given !== null)
				return route.fulfill({ status: given.status, json: await given.json() });
			return route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: { id: `new${++posted}` } });
		}
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
	const joined = async () => {
		await expect.poll(() => presence !== undefined).toBe(true);
		if (presence === undefined) throw new Error("no presence socket");
		return presence;
	};
	return {
		page,
		written,
		presence: joined,
		tell: async (message) => (await joined()).send(JSON.stringify(message)),
	} satisfies Opened;
}

/** The point a posted comment stands at. */
function pointIn(body: unknown): { x: number; y: number } {
	const at = typeof body === "object" && body !== null && "at" in body ? body.at : null;
	if (typeof at !== "object" || at === null || !("x" in at) || !("y" in at)) throw new Error("no point");
	const { x, y } = at;
	if (typeof x !== "number" || typeof y !== "number") throw new Error("no point");
	return { x, y };
}

/** The tool whose button is pressed. */
const toolIn = (page: Page) =>
	page.locator('[aria-label="canvas tools"] [aria-pressed="true"]').getAttribute("aria-label");

/** A point on a frame on screen, by the frame's own pixels. */
async function onFrame(page: Page, frame: string, at: { x: number; y: number }) {
	const box = await page.locator(`[data-viewer-frame="${frame}"]`).boundingBox();
	if (box === null) throw new Error(`${frame} is not on screen`);
	const k = box.width / 800;
	return { x: box.x + at.x * k, y: box.y + at.y * k };
}

it("takes the Comment tool with C, borrows it while C is held, and leaves it on V and Esc", {
	timeout: 60_000,
}, async () => {
	const { page } = await open();
	await page.locator('[aria-label="canvas tools"]').waitFor();
	expect(await toolIn(page)).toBe("pointer");
	await page.keyboard.press("c");
	expect(await toolIn(page)).toBe("comment");
	await page.keyboard.press("v");
	expect(await toolIn(page)).toBe("pointer");
	await page.keyboard.press("c");
	await page.keyboard.press("Escape");
	expect(await toolIn(page)).toBe("pointer");

	// held, it is borrowed and handed back when let go
	await page.keyboard.down("c");
	expect(await toolIn(page)).toBe("comment");
	await page.waitForTimeout(350);
	await page.keyboard.up("c");
	expect(await toolIn(page)).toBe("pointer");

	// the buttons do the same
	await page.getByRole("button", { name: "comment", exact: true }).click();
	expect(await toolIn(page)).toBe("comment");
	await page.getByRole("button", { name: "pointer", exact: true }).click();
	expect(await toolIn(page)).toBe("pointer");
});

it("places a pin on a frame with what is under it, hands back the Pointer, and posts it on Enter", {
	timeout: 60_000,
}, async () => {
	const { page, written, tell } = await open();
	await page.frameLocator('iframe[title="home"]').locator("h1").waitFor();
	await page.keyboard.press("c");
	const on = await onFrame(page, "home", { x: 120, y: 20 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.waitFor();
	expect(await composer.textContent()).toContain("on home");
	expect(await toolIn(page)).toBe("pointer");
	// the frame says what is under the pin
	await expect.poll(() => composer.locator("[data-comment-element]").textContent()).toBe("h1");
	await composer.locator("textarea").fill("Make @Ben the heading smaller");
	await composer.locator("textarea").press("Enter");

	await expect.poll(() => written.length).toBe(1);
	const [sent] = written;
	expect(sent?.method).toBe("POST");
	expect(sent?.path).toBe("/api/comments");
	expect(sent?.body).toMatchObject({
		page: "",
		frame: "home",
		element: {
			selector: "main > h1",
			outerHtml: "<h1>home</h1>",
			source: "frames/home/frame.tsx:2:16",
			generated: false,
		},
		body: "Make @Ben the heading smaller",
		mentions: ["ben"],
	});
	const at = pointIn(sent?.body);
	expect(at.x).toBeCloseTo(120, 0);
	expect(at.y).toBeCloseTo(20, 0);

	// the composer gives way to the card of the comment just made, as the socket says it
	await composer.waitFor({ state: "detached" });
	await tell({
		type: "comment-added",
		comment: comment("new1", { author: VIC, at, body: "Make @Ben the heading smaller", mentions: [BEN] }),
	});
	const card = page.locator('[data-comment-card="new1"]');
	await card.waitFor();
	expect(await card.locator("[data-comment-mention]").textContent()).toBe("@Ben");
	const pin = await page.locator('[data-comment-pin="new1"]').boundingBox();
	expect(pin?.x).toBeCloseTo(on.x, 0);
	expect((pin?.y ?? 0) + (pin?.height ?? 0)).toBeCloseTo(on.y, 0);
});

it("places a pin on the field, and a click away puts the composer down before anything plays", {
	timeout: 60_000,
}, async () => {
	const { page } = await open();
	await page.keyboard.press("c");
	const home = await page.locator('[data-viewer-frame="home"]').boundingBox();
	if (home === null) throw new Error("no home");
	await page.mouse.click(home.x + home.width / 2, home.y + home.height + 40);
	const composer = page.locator("[data-comment-composer]");
	await composer.waitFor();
	expect(await composer.textContent()).toContain("on the field");
	await page.mouse.click(home.x + 40, home.y + 40);
	await composer.waitFor({ state: "detached" });
	expect(await page.locator("[data-viewer-player]").count()).toBe(0);
});

it("shows a teammate's comments live, reads one when it opens, and replies", { timeout: 60_000 }, async () => {
	const { page, written, tell } = await open(PATH, [comment("c1")]);
	const pin = page.locator('[data-comment-pin="c1"]');
	await pin.waitFor();
	expect(await pin.getAttribute("data-unread")).toBe("");
	const button = page.locator("[data-comments-button]");
	expect(await button.locator("[data-comments-count]").textContent()).toBe("1");
	expect(await button.getAttribute("data-unread")).toBe("");

	await pin.click();
	const card = page.locator('[data-comment-card="c1"]');
	await card.waitFor();
	await expect.poll(() => written.map((one) => `${one.method} ${one.path}`)).toContain("POST /api/comments/c1/read");
	await tell({ type: "comment-seen", comment: "c1", read: Date.now() });
	await expect.poll(() => pin.getAttribute("data-unread")).toBeNull();
	await expect.poll(() => button.getAttribute("data-unread")).toBeNull();

	await card.locator('textarea[aria-label="Reply"]').fill("On it.");
	await card.locator('textarea[aria-label="Reply"]').press("Enter");
	await expect
		.poll(() => written.find((one) => one.path === "/api/comments/c1/replies")?.body)
		.toEqual({ body: "On it.", mentions: [] });
	await tell({
		type: "comment-replied",
		comment: "c1",
		reply: { id: "r1", author: VIC, agent: false, body: "On it.", created: Date.now(), edited: null, draftFor: null },
	});
	await expect.poll(() => card.locator("[data-comment-body]").allTextContents()).toEqual(["words of c1", "On it."]);

	// a teammate's new comment arrives as a pin, and Shift+C puts every pin away and back
	await tell({ type: "comment-added", comment: comment("c2", { frame: "menu" }) });
	await page.locator('[data-comment-pin="c2"]').waitFor();
	await page.keyboard.press("Escape");
	await card.waitFor({ state: "detached" });
	await page.keyboard.press("Shift+C");
	await expect.poll(() => page.locator("[data-comment-pin]").count()).toBe(0);
	await page.keyboard.press("Shift+C");
	await expect.poll(() => page.locator("[data-comment-pin]").count()).toBe(2);
});

it("says a refusal in the composer's words, and offline while the socket is down", { timeout: 60_000 }, async () => {
	const { page, presence } = await open(PATH, [], () =>
		Response.json({ error: "rate_limited", retryAfter: 12 }, { status: 429 }),
	);
	await page.keyboard.press("c");
	const on = await onFrame(page, "home", { x: 50, y: 300 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.locator("textarea").fill("Too many?");
	await composer.locator("textarea").press("Enter");
	await expect
		.poll(() => composer.locator("[data-comment-refusal]").textContent())
		.toMatch(/more comments than spool\.page takes.*\(in 12 seconds\)$/u);
	await (await presence()).close();
	await composer.locator("[data-comment-offline]").waitFor();
	expect(await composer.locator("[data-comment-offline]").textContent()).toContain("until you're connected again");
});

it("lists comments in the panel, and a row flies to its pin on its own page", { timeout: 60_000 }, async () => {
	const { page } = await open(PATH, [comment("c1"), comment("c3", { page: "shop", frame: "shop/cart" })]);
	const panel = page.locator("[data-comments-panel]");
	expect(await panel.getAttribute("data-comments-panel")).toBe("closed");
	// the button counts the whole project's, as the list does: the other page's comment too, and its unread
	const button = page.locator("[data-comments-button]");
	await expect.poll(() => button.locator("[data-comments-count]").textContent()).toBe("2");
	await page.locator("[data-comments-button]").click();
	await expect.poll(() => panel.getAttribute("data-comments-panel")).toBe("open");
	// the whole project, so the other page's comment is listed too
	await panel.getByText("root page", { exact: true }).first().click();
	await panel.getByRole("menuitemcheckbox", { name: /Whole project/ }).click();
	await panel.getByText("words of c3").click();
	await expect.poll(() => new URL(page.url()).pathname).toBe(`${PATH}/shop`);
	await page.locator('[data-comment-card="c3"]').waitFor();
	// its + takes the Comment tool
	await panel.getByRole("button", { name: "New comment (C)" }).click();
	expect(await toolIn(page)).toBe("comment");
	await page.getByRole("button", { name: "Close comments" }).click();
	await expect.poll(() => panel.getAttribute("data-comments-panel")).toBe("closed");
});

it("opens on the comment a link names, on its page, and takes the link off the address", {
	timeout: 60_000,
}, async () => {
	const { page } = await open(`${PATH}?comment=c3`, [
		comment("c1"),
		comment("c3", { page: "shop", frame: "shop/cart", at: { x: 40, y: 60 } }),
	]);
	await page.locator('[data-comment-card="c3"]').waitFor();
	expect(new URL(page.url()).pathname).toBe(`${PATH}/shop`);
	expect(new URL(page.url()).search).toBe("");
	// its pin is in the middle of the view
	const pin = await page.locator('[data-comment-pin="c3"]').boundingBox();
	const field = await page.locator("[data-viewer-field]").boundingBox();
	if (pin === null || field === null) throw new Error("not on screen");
	await expect
		.poll(async () => (await page.locator('[data-comment-pin="c3"]').boundingBox())?.x ?? 0)
		.toBeCloseTo(field.x + field.width / 2, -1);

	// a link to a comment that is gone says so
	const gone = await open(`${PATH}?comment=nope`, [comment("c1")]);
	await gone.page.getByText("That comment isn’t here anymore").waitFor();
	expect(new URL(gone.page.url()).search).toBe("");
});
