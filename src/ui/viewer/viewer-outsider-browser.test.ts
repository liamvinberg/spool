import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { beforeAll, expect, it } from "vitest";
import type { Comment } from "../../team-sync-protocol";
import { testBrowser } from "../../test-browser";
import { builtViewer } from "../../test-helpers";
import { buildEntry } from "./build-entry";
import type { ViewerProject } from "./source";

/**
 * Comments by outsiders on shares (spool#174), driven in the package's own viewer build as Spool Cloud serves it.
 * Signed out on a link share, the frames open with no pins and no count, and the Comment tool, C, the Comments button,
 * the rail's Sign in and a one-time tip all open one sign-in dialog: an email code, then the name step, on the link's
 * own host. Signed in, their share's comments arrive on a socket of their own, pins ripple in, what they reached for
 * carries on, and the rail's foot names them. Their composer picks nothing, shows no element's tag and mentions no
 * one. A member picks a share in the composer, and reads every audience: a share's tag, its ending, a draft to send.
 */

const APP = "https://northwind.onspool.test";
const FRAMES = "https://northwind.onspool.test/f/";
const WSS = APP.replace("https", "wss");

const project: ViewerProject = {
	team: { address: "kaffe", name: "kaffe", logo: null },
	project: "checkout",
	account: null,
	canvas: {
		pages: [],
		places: {},
		order: {},
		frames: [{ name: "home", x: 0, y: 0, w: 800, h: 600 }],
	},
	frames: FRAMES,
	shared: { by: "bo", pages: [""], updated: null },
	outsider: {
		share: { id: "s-north", kind: "link", who: [] },
		me: null,
		comments: "/_spool/comments",
		socket: "/_spool/comments/socket",
		signIn: {
			code: "/_spool/sign-in/code",
			resend: "/_spool/sign-in/code/resend",
			verify: "/_spool/sign-in/code/verify",
			name: "/_spool/sign-in/name",
			exchange: "/_spool/sign-in/exchange",
			signOut: "/_spool/sign-out",
			google: "https://spool.test/sign-in/google?link=northwind",
			origin: "https://spool.test",
		},
	},
};

const BO = { accountId: "bo", name: "Bo", color: "#e0af68" };
const JONAS = { accountId: "jonas", name: "Jonas Ek", color: "#7aa2f7" };

function comment(id: string, more: Partial<Comment> = {}): Comment {
	return {
		id,
		audience: { share: "s-north" },
		page: "",
		frame: "home",
		at: { x: 100, y: 80 },
		element: null,
		revision: null,
		still: false,
		author: BO,
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

function frameDocument(frame: string): string {
	return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<main><h1>${frame}</h1></main>
<script>
const FRAME = ${JSON.stringify(frame)};
parent.postMessage({ spool: "loaded", frame: FRAME }, "*");
addEventListener("message", (event) => {
	if (event.data?.spool !== "pick") return;
	parent.postMessage({ spool: "picked", frame: FRAME, id: event.data.id, chain: [
		{ selector: "main > h1", tag: "h1", outerHtml: "<h1>" + FRAME + "</h1>", rect: { x: 0, y: 0, w: 800, h: 40 }, radius: 0, source: "frames/" + FRAME + "/frame.tsx:2:16", generated: false },
	] }, "*");
});
</script></body></html>`;
}

let built: string;
let entry: { file: string; css: string[] };

beforeAll(async () => {
	built = await builtViewer();
	entry = buildEntry(JSON.parse(readFileSync(join(built, "manifest.json"), "utf8")), "index.html");
}, 120_000);

interface Written {
	method: string;
	path: string;
	body: unknown;
}

/** The canvas at the link's host (or a member's), with spool.page's answers stood in for. */
async function open(
	shape: Partial<ViewerProject> = {},
	comments: Comment[] = [],
	options: { socket?: string; shares?: unknown; tipSeen?: boolean } = {},
) {
	const browser = await testBrowser();
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	if (options.tipSeen === true)
		await context.addInitScript(() => window.localStorage.setItem("spool-comments-tip:s-north", "1"));
	const page = await context.newPage();
	const written: Written[] = [];
	let socket: WebSocketRoute | undefined;
	let connections = 0;
	const said: string[] = [];
	// asked a tick at a time, as every presence socket is (#107)
	await page.routeWebSocket(`${WSS}${options.socket ?? "/_spool/comments/socket"}?ticks=1`, (route) => {
		socket = route;
		connections += 1;
		route.onMessage((message) => said.push(String(message)));
		route.send(JSON.stringify({ type: "comments", comments, first: true, last: true, reads: {} }));
	});
	await page.route("**/*", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin === APP && url.pathname.startsWith("/_viewer/")) {
			const file = join(built, url.pathname.slice("/_viewer/".length));
			const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "font/woff2";
			return route.fulfill({ body: readFileSync(file), contentType: type });
		}
		if (url.origin === APP && url.pathname === "/_spool/canvas")
			return route.fulfill({ json: "canvas" in shape ? shape : { ...project, ...shape } });
		if (url.origin === APP && url.pathname === "/api/shares")
			return route.fulfill({ json: options.shares ?? { shares: [] } });
		if (url.origin === APP && url.pathname === "/api/people")
			return route.fulfill({ json: { members: [{ ...BO, you: true }] } });
		if (url.origin === APP && (url.pathname.startsWith("/_spool/") || url.pathname.startsWith("/api/comments"))) {
			// as spool.page's comments APIs are: every write but a delete is JSON
			const json = request.headers()["content-type"]?.startsWith("application/json") === true;
			if (request.method() !== "GET" && request.method() !== "DELETE" && !json)
				return route.fulfill({ status: 415, json: { error: "json_required" } });
			const body: unknown = request.postData() === null ? null : JSON.parse(request.postData() ?? "null");
			written.push({ method: request.method(), path: url.pathname, body });
			if (url.pathname === "/_spool/sign-in/code") return route.fulfill({ status: 202, json: { mailbox: "x" } });
			if (url.pathname === "/_spool/sign-in/code/verify")
				return route.fulfill({
					json: { step: "name", name: "Jonas", fallback: "jonas", color: "#7aa2f7" },
				});
			if (url.pathname === "/_spool/sign-in/name" || url.pathname === "/_spool/sign-in/exchange")
				return route.fulfill({ json: { me: { id: "jonas", name: "Jonas Ek" } } });
			return route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: { id: "new1" } });
		}
		if (url.origin === APP && (url.pathname === "/" || url.pathname === "/devosurf/checkout"))
			return route.fulfill({
				contentType: "text/html",
				body: `<!doctype html><html><head>${entry.css.map((css) => `<link rel="stylesheet" href="/_viewer/${css}">`).join("")}
<script type="module" src="/_viewer/${entry.file}"></script></head><body>
<script id="spool-viewer" type="application/json">${JSON.stringify({ api: "/_spool/canvas", path: url.pathname === "/" ? "" : url.pathname })}</script>
<div id="root"></div></body></html>`,
			});
		if (url.href.startsWith(FRAMES))
			return route.fulfill({
				contentType: "text/html",
				body: frameDocument(decodeURIComponent(url.pathname.slice(new URL(FRAMES).pathname.length))),
			});
		return route.abort();
	});
	return {
		page,
		written,
		said,
		socket: () => socket,
		connections: () => connections,
		go: async (path = "/") => {
			await page.goto(`${APP}${path}`);
			await page.getByRole("navigation", { name: "Pages" }).waitFor();
		},
	};
}

const toolIn = (page: Page) =>
	page.locator('[aria-label="canvas tools"] [aria-pressed="true"]').getAttribute("aria-label");

async function onFrame(page: Page, frame: string, at: { x: number; y: number }) {
	const box = await page.locator(`[data-viewer-frame="${frame}"]`).boundingBox();
	if (box === null) throw new Error(`${frame} is not on screen`);
	const k = box.width / 800;
	return { x: box.x + at.x * k, y: box.y + at.y * k };
}

it("signed out on a link share: frames, no pins and no count, and everything asks to sign in first", {
	timeout: 60_000,
}, async () => {
	const opened = await open({}, [comment("c1")]);
	const { page } = opened;
	await opened.go();
	await page.frameLocator('iframe[title="home"]').locator("h1").waitFor();
	// the one-time tip, over the tools
	const tip = page.locator("[data-comments-tip]");
	await tip.waitFor();
	expect(await tip.textContent()).toContain("bo's team talks about these screens in comments.");
	expect(await page.locator("[data-comment-pin]").count()).toBe(0);
	expect(await page.locator("[data-comments-count]").count()).toBe(0);
	expect(opened.socket()).toBeUndefined();
	expect(await page.locator("[data-viewer-sign-in]").count()).toBe(0);
	// the rail's foot
	expect(await page.getByText("not signed in").count()).toBe(1);
	// the tip is said once: the next visit has none, whether or not it was answered
	await page.reload();
	await page.getByRole("navigation", { name: "Pages" }).waitFor();
	await page.locator('[aria-label="canvas tools"]').waitFor();
	expect(await page.locator("[data-comments-tip]").count()).toBe(0);

	// the Comments button, the rail's Sign in, C and the Comment tool all open the one dialog
	for (const ask of [
		() => page.locator("[data-comments-button]").click(),
		() => page.getByRole("button", { name: "Sign in", exact: true }).click(),
		() => page.keyboard.press("c"),
		() => page.getByRole("button", { name: "comment", exact: true }).click(),
	]) {
		await ask();
		const dialog = page.locator("[data-viewer-sign-in]");
		await dialog.waitFor();
		expect(await dialog.textContent()).toContain("Sign in to see comments");
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "detached" });
	}
});

it("says at its foot who shared the whole project with them, by the project's name (spool#182)", {
	timeout: 60_000,
}, async () => {
	const opened = await open({ shared: { by: "bo", pages: ["", "menu"], updated: null, whole: true } });
	await opened.go();
	const line = opened.page.locator("[data-viewer-shared]");
	await line.getByText("Shared by bo").waitFor();
	expect(await line.getAttribute("title")).toBe("bo shared checkout with you");
});

it("signs in on the link's host by an email code and the name step, then the pins ripple in and the tool carries on", {
	timeout: 60_000,
}, async () => {
	const opened = await open(
		{},
		[comment("c1"), comment("c2", { author: JONAS, outsider: true, at: { x: 400, y: 300 } })],
		{
			tipSeen: true,
		},
	);
	const { page, written } = opened;
	await opened.go();
	await page.keyboard.press("c");
	const dialog = page.locator("[data-viewer-sign-in]");
	await dialog.waitFor();
	expect(await toolIn(page)).toBe("pointer");
	await page.getByRole("textbox", { name: "Email" }).fill("jonas@northwind.example");
	await page.getByRole("button", { name: "Email me a code" }).click();
	await page.locator('[data-viewer-sign-in="code"]').waitFor();
	expect(await dialog.textContent()).toContain("Enter the code sent to jonas@northwind.example.");
	await page.getByRole("textbox", { name: "Code" }).fill("482913");
	await page.locator('[data-viewer-sign-in="name"]').waitFor();
	expect(await page.getByRole("textbox", { name: "Name" }).inputValue()).toBe("Jonas");
	await page.getByRole("textbox", { name: "Name" }).fill("Jonas Ek");
	await page.getByRole("button", { name: "Continue" }).click();
	await dialog.waitFor({ state: "detached" });
	expect(written.map((one) => [one.path, one.body])).toEqual([
		["/_spool/sign-in/code", { email: "jonas@northwind.example" }],
		["/_spool/sign-in/code/verify", { code: "482913" }],
		["/_spool/sign-in/name", { name: "Jonas Ek" }],
	]);

	// the share's comments, on a socket of the outsider's own that says nothing
	await page.locator('[data-comment-pin="c1"]').waitFor();
	expect(await page.locator('[data-comment-pin="c2"]').getAttribute("data-outsider")).toBe("");
	expect(await page.locator('[data-comment-pin="c1"]').getAttribute("data-outsider")).toBeNull();
	expect(await page.locator("[data-comments-count]").textContent()).toBe("2");
	expect(await toolIn(page)).toBe("comment");
	expect(await page.locator("[data-viewer-signed-in]").textContent()).toBe("Jonas Ek");
	expect(opened.said).toEqual([]);

	// a card they open is read, and they resolve it, each a write the link's host takes
	await page.keyboard.press("Escape");
	await page.locator('[data-comment-pin="c1"]').click();
	const card = page.locator('[data-comment-card="c1"]');
	await card.waitFor();
	await card.getByRole("button", { name: "Resolve" }).click();
	await expect
		.poll(() => written.slice(3).map((one) => `${one.method} ${one.path}`))
		.toEqual(["POST /_spool/comments/c1/read", "POST /_spool/comments/c1/resolve"]);
	expect(await card.locator("[data-comment-refusal]").count()).toBe(0);
});

it("forgets what it read when spool.page signs them out and asks them in again, or says they were blocked", {
	timeout: 60_000,
}, async () => {
	const { outsider } = project;
	if (outsider === undefined) throw new Error("no outsider");
	const signedIn = { ...project, outsider: { ...outsider, me: { id: "jonas", name: "Jonas Ek" } } };
	for (const reason of ["signed out", "blocked"]) {
		const opened = await open(signedIn, [comment("c1")], { tipSeen: true });
		const { page } = opened;
		await opened.go();
		await page.locator('[data-comment-pin="c1"]').waitFor();
		await opened.socket()?.close({ code: 4401, reason });
		await expect.poll(() => page.locator("[data-comment-pin]").count()).toBe(0);
		if (reason === "blocked") {
			await page.getByText("The team has blocked you from commenting on this share.").waitFor();
			expect(await page.locator("[data-viewer-sign-in]").count()).toBe(0);
		} else await page.locator("[data-viewer-sign-in]").waitFor();
		expect(await page.getByText("not signed in").count()).toBe(1);
		// never opened again, which spool.page would only refuse
		await page.waitForTimeout(1500);
		expect(opened.connections()).toBe(1);
	}
});

it("signs an outsider out of the link's host from the rail, their comments gone at once", {
	timeout: 60_000,
}, async () => {
	const { outsider } = project;
	if (outsider === undefined) throw new Error("no outsider");
	const signedIn = { ...project, outsider: { ...outsider, me: { id: "jonas", name: "Jonas Ek" } } };
	const opened = await open(signedIn, [comment("c1")], { tipSeen: true });
	const { page, written } = opened;
	await opened.go();
	await page.locator('[data-comment-pin="c1"]').waitFor();
	await page.getByRole("button", { name: "Sign out" }).click();
	await expect.poll(() => written.map((one) => `${one.method} ${one.path}`)).toContain("POST /_spool/sign-out");
	await expect.poll(() => page.locator("[data-comment-pin]").count()).toBe(0);
	expect(await page.getByText("not signed in").count()).toBe(1);
	// they asked to go, so nothing asks them back in
	expect(await page.locator("[data-viewer-sign-in]").count()).toBe(0);
	expect(opened.connections()).toBe(1);
});

it("asks a signed-out outsider to sign in when an email's link names a comment, then opens it", {
	timeout: 60_000,
}, async () => {
	const opened = await open({}, [comment("c1")], { tipSeen: true });
	const { page } = opened;
	await opened.go("/?comment=c1");
	const dialog = page.locator("[data-viewer-sign-in]");
	await dialog.waitFor();
	await page.getByRole("textbox", { name: "Email" }).fill("jonas@northwind.example");
	await page.getByRole("button", { name: "Email me a code" }).click();
	await page.getByRole("textbox", { name: "Code" }).fill("482913");
	await page.getByRole("button", { name: "Continue" }).click();
	await dialog.waitFor({ state: "detached" });
	await page.locator('[data-comment-card="c1"]').waitFor();
});

it("signs in by Google's popup only with the code it hands back, by message or by the host's channel, or cancels", {
	timeout: 60_000,
}, async () => {
	const opened = await open({}, [comment("c1")], { tipSeen: true });
	const { page, written } = opened;
	// the popup, as the page sees it: Google's pages are out of reach, so it only ever closes
	await page.addInitScript(() => {
		const opened: string[] = [];
		Object.assign(window, { openedPopups: opened });
		window.open = (url?: string | URL) => {
			opened.push(String(url));
			return { closed: true, close() {} } as unknown as Window;
		};
	});
	await opened.go();
	await page.keyboard.press("c");
	const dialog = page.locator("[data-viewer-sign-in]");
	await dialog.waitFor();
	// cancelled, it asks for nothing and can start again
	await page.getByRole("button", { name: "Continue with Google" }).click();
	await page.locator("[data-viewer-sign-in-google]").waitFor();
	// and nothing asks for the code with the verifier alone
	await page.waitForTimeout(1_800);
	expect(written).toEqual([]);
	await page.locator("[data-viewer-sign-in-google]").getByRole("button", { name: "Cancel" }).click();
	expect(await page.locator("[data-viewer-sign-in-error]").textContent()).toBe(
		"Google's sign-in was cancelled. Try again.",
	);
	// the popup cut off from this page goes on to this host, whose page hands the code back on its channel
	await page.getByRole("button", { name: "Continue with Google" }).click();
	const popups = await page.evaluate(() => (window as unknown as { openedPopups: string[] }).openedPopups);
	expect(popups.at(-1)).toMatch(/^https:\/\/spool\.test\/sign-in\/google\?link=northwind&challenge=[\w-]{43}$/u);
	const code = "c".repeat(43);
	await page.evaluate((handed) => {
		const channel = new BroadcastChannel("spool-sign-in");
		channel.postMessage({ type: "spool-signed-in", code: handed });
		channel.close();
	}, code);
	await dialog.waitFor({ state: "detached" });
	expect(written).toHaveLength(1);
	expect(written[0]).toMatchObject({
		path: "/_spool/sign-in/exchange",
		body: { code, verifier: expect.stringMatching(/^[\w-]{64}$/u) },
	});
	expect(await page.locator("[data-viewer-signed-in]").textContent()).toBe("Jonas Ek");
});

it("gives a signed-in outsider a composer with no picker, no element's tag and no mentions", {
	timeout: 60_000,
}, async () => {
	const opened = await open(
		{
			outsider: {
				share: { id: "s-ines", kind: "people", who: ["ines"] },
				me: { id: "ines", name: "Ines" },
				comments: "/api/comments",
				socket: "/api/shares/s-ines/comments/socket",
			},
		},
		[],
		{ socket: "/api/shares/s-ines/comments/socket" },
	);
	const { page, written } = opened;
	await opened.go();
	await page.frameLocator('iframe[title="home"]').locator("h1").waitFor();
	expect(await page.locator("[data-viewer-signed-in]").textContent()).toBe("Ines");
	await page.keyboard.press("c");
	const on = await onFrame(page, "home", { x: 120, y: 20 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.waitFor();
	await page.waitForTimeout(700);
	expect(await composer.locator("[data-comment-element]").count()).toBe(0);
	expect(await composer.locator("[data-comment-audience-picker]").count()).toBe(0);
	expect(await composer.locator("[data-comment-audience-note]").textContent()).toBe(
		"The kaffe team and ines read it.",
	);
	await composer.locator("textarea").fill("Bigger @");
	expect(await page.locator("[data-comment-mentions]").count()).toBe(0);
	await composer.locator("textarea").press("Enter");
	await expect.poll(() => written.length).toBe(1);
	expect(written[0]).toMatchObject({
		method: "POST",
		path: "/api/comments",
		body: { body: "Bigger @", mentions: [] },
	});
	expect(written[0]?.body).not.toHaveProperty("audience");
});

/** A member's canvas, with the project's shares. */
const { shared: _shared, outsider: _outsider, ...base } = project;
const member: ViewerProject = {
	...base,
	account: "bo@kaffe.example",
	presence: "/api/presence",
	comments: "/api/comments",
	people: "/api/people",
	shares: "/api/shares",
	me: "bo",
	role: "editor",
};

it("lets a member pick a share of the page, and reads every audience: its tag, its end, a draft to send", {
	timeout: 60_000,
}, async () => {
	const shares = {
		shares: [
			{ id: "s-north", kind: "link", pages: [""], people: [], by: "bo@kaffe.example", at: 1, opens: 0 },
			{ id: "s-plans", kind: "people", pages: ["plans"], people: ["ola@x.example"], by: "bo", at: 1, opens: 0 },
		],
	};
	const opened = await open(
		member,
		[
			comment("c1", {
				share: { kind: "link", who: [], by: "bo" },
				replies: [
					{
						id: "r1",
						author: BO,
						agent: true,
						body: "Fixed it",
						created: Date.now(),
						edited: null,
						draftFor: "bo",
					},
				],
			}),
			comment("c2", {
				at: { x: 500, y: 400 },
				audience: { share: "s-gone" },
				share: { kind: "people", who: ["ines"], by: "bo", ended: true },
			}),
		],
		{ socket: "/api/presence", shares },
	);
	const { page, written } = opened;
	await opened.go("/devosurf/checkout");
	await page.frameLocator('iframe[title="home"]').locator("h1").waitFor();

	// a share's comment: its tag, who reads the reply, and the draft its person sends
	await page.locator('[data-comment-pin="c1"]').click();
	const card = page.locator('[data-comment-card="c1"]');
	await card.waitFor();
	expect(await card.locator('[data-comment-audience="link"]').textContent()).toBe("Link share");
	expect(await card.locator("textarea").getAttribute("placeholder")).toBe("Reply to Link share");
	expect(await card.locator("[data-comment-audience-note]").textContent()).toBe(
		"Everyone signed in through the link reads replies.",
	);
	await card.locator("[data-comment-draft]").waitFor();
	await card.getByRole("button", { name: "Send", exact: true }).click();
	await expect.poll(() => written.length).toBe(1);
	expect(written[0]).toMatchObject({ method: "POST", path: "/api/comments/c1/replies/r1/send" });
	await page.keyboard.press("Escape");

	// an ended share's comment says so, and takes no reply
	await page.locator('[data-comment-pin="c2"]').click();
	const ended = page.locator('[data-comment-card="c2"]');
	await ended.waitFor();
	expect(await ended.locator("[data-comment-share-ended]").count()).toBe(2);
	expect(await ended.locator("textarea").count()).toBe(0);
	await page.keyboard.press("Escape");

	// the composer offers the shares of this page alone, and sends the one picked
	await page.keyboard.press("c");
	const on = await onFrame(page, "home", { x: 120, y: 20 });
	await page.mouse.click(on.x, on.y);
	const composer = page.locator("[data-comment-composer]");
	await composer.waitFor();
	await composer.locator("[data-comment-audience-picker]").click();
	expect(await page.getByRole("menuitemcheckbox").allTextContents()).toEqual([
		expect.stringContaining("Team"),
		expect.stringContaining("Link share"),
	]);
	await page.getByRole("menuitemcheckbox", { name: /Link share/u }).click();
	expect(await composer.locator("[data-comment-audience-note]").textContent()).toBe(
		"Everyone signed in through the link reads this and its replies.",
	);
	await composer.locator("textarea").fill("For the client");
	await composer.locator("textarea").press("Enter");
	await expect.poll(() => written.length).toBe(2);
	expect(written[1]).toMatchObject({ path: "/api/comments", body: { audience: { share: "s-north" } } });

	// the Comments list says who reads each, as its card does
	await page.keyboard.press("Escape");
	await page.locator("[data-comments-button]").click();
	const row = page.locator('[data-comment-row="c1"]');
	await row.waitFor();
	expect(await row.locator("[data-comment-audience]").getAttribute("data-comment-audience")).toBe("link");
	expect(await row.locator("[data-comment-audience]").textContent()).toBe("Link share");
});
