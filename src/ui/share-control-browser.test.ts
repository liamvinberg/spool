import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi } from "../test-helpers";

let script = "";
let styles: string[] = [];

beforeAll(async () => {
	const bundle = await build({
		stdin: {
			contents: `
				import { createElement, useState } from "react";
				import { createRoot } from "react-dom/client";
				import { ShareControl, openShare } from "./src/ui/share-control";
				const pages = [];
				for (let a = 0; a < 6; a++) {
					pages.push("area" + a);
					for (let b = 0; b < 4; b++) {
						pages.push("area" + a + "/part" + b);
						for (let c = 0; c < 3; c++) pages.push("area" + a + "/part" + b + "/leaf" + c);
					}
				}
				const frames = new Map(pages.map((page) => [page, 2]));
				const state = window.shareState ?? "ready";
				const made = [];
				const source = {
					read: async () => ({ state: "ready", shares: made, manage: true }),
					change: async (id, change) => {
						window.changed = change;
						return null;
					},
					stop: async () => null,
					create: async (request) => {
						window.created = request;
						const share = { id: "s" + (made.length + 1), kind: request.kind, pages: request.pages, people: request.people ?? [], by: "liam@x.se", at: Date.now() / 1000, opens: 0, link: "https://k7qm2xpa.onspool.page" };
						made.push(share);
						return { share };
					},
				};
				function App() {
					const [home, setHome] = useState(false);
					window.goHome = () => setHome(true);
					const shares = state === "signed-out" ? { state: "signed-out" } : { state: "ready", shares: made, manage: true };
					return createElement("header", { style: { display: "flex", justifyContent: "flex-end", height: "44px", paddingRight: "16px" } },
						createElement(ShareControl, {
							source: home ? null : source,
							shares,
							context: home ? undefined : () => ({ page: "area2/part1", pages, frames, walks: [], frame: window.shareFrame ?? null }),
							onSignIn: () => { window.signedIn = true; },
						}),
					);
				}
				window.openShare = openShare;
				createRoot(document.getElementById("root")).render(createElement(App));
			`,
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		outfile: "share.js",
		format: "iife",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	const assets = join(await builtUi(), "assets");
	styles = readdirSync(assets)
		.filter((name) => name.endsWith(".css"))
		.map((file) => readFileSync(join(assets, file), "utf8"));
	for (const file of bundle.outputFiles) {
		if (file.path.endsWith(".css")) styles.push(file.text);
		else script = file.text;
	}
});

const pages: Page[] = [];
afterAll(async () => {
	for (const page of pages) await page.close();
});

async function open(state: "ready" | "signed-out" = "ready", frame: string | null = null): Promise<Page> {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, reducedMotion: "reduce" });
	pages.push(page);
	await page.setContent(`<style>body { margin: 0; }</style><div id="root"></div>`);
	for (const style of styles) await page.addStyleTag({ content: style });
	await page.evaluate(
		([shareState, shareFrame]) => {
			Object.assign(window, { shareState, shareFrame });
		},
		[state, frame] as const,
	);
	await page.addScriptTag({ content: script });
	await page.getByRole("button", { name: "Share" }).waitFor();
	return page;
}

it("shares the page you're on with a link, and hands it to a phone as a QR code", { timeout: 60_000 }, async () => {
	const page = await open();
	await page.getByRole("button", { name: "Share" }).click();
	const popover = page.getByRole("dialog", { name: "Share" });
	await popover.getByText("Shares part1, the page you’re on").waitFor();
	await popover.getByText("1 page · 2 frames").waitFor();
	await popover.getByRole("button", { name: "Share", exact: true }).click();
	await popover.locator('[data-qr="https://k7qm2xpa.onspool.page"] svg').waitFor();
	await popover.getByText("k7qm2xpa.onspool.page").waitFor();
	expect(await page.evaluate(() => (window as unknown as { created: unknown }).created)).toEqual({
		kind: "link",
		pages: ["area2/part1"],
	});
	// back, the share made stands under the form
	await popover.getByRole("button", { name: "Back" }).click();
	await popover.getByRole("menuitem", { name: /anyone with the link/u }).waitFor();
});

it("opens the link on the frame held, and emails the people it names unless told not to", {
	timeout: 60_000,
}, async () => {
	const page = await open("ready", "area2/part1/hero");
	await page.getByRole("button", { name: "Share" }).click();
	const popover = page.getByRole("dialog", { name: "Share" });
	const start = popover.getByRole("checkbox", { name: "Start on hero" });
	expect(await start.isChecked()).toBe(true);
	await popover.getByText("Named people").click();
	await popover.getByLabel("Email addresses").fill("kim@client.com");
	const notify = popover.getByRole("checkbox", { name: "Email them a link to it" });
	expect(await notify.isChecked()).toBe(true);
	await popover.getByRole("button", { name: "Share", exact: true }).click();
	expect(await page.evaluate(() => (window as unknown as { created: unknown }).created)).toEqual({
		kind: "people",
		pages: ["area2/part1"],
		people: ["kim@client.com"],
		notify: true,
		start: "area2/part1/hero",
	});
	// someone added later is emailed too
	await popover.getByLabel("Add someone by email").fill("ola@client.com");
	await popover.getByLabel("Add someone by email").press("Enter");
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { changed: unknown }).changed))
		.toEqual({ add: ["ola@client.com"], notify: true });

	// unticked, the link opens on the canvas and nobody is emailed
	await popover.getByRole("button", { name: "Back" }).click();
	await popover.getByText("Named people").click();
	await popover.getByLabel("Email addresses").fill("ola@client.com");
	await popover.getByText("Start on hero").click();
	await popover.getByText("Email them a link to it").click();
	await popover.getByRole("button", { name: "Share", exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { created: unknown }).created))
		.toEqual({ kind: "people", pages: ["area2/part1"], people: ["ola@client.com"], notify: false });

	// a frame on a page left out of the share is no start
	const other = await open("ready", "area4/hero");
	await other.getByRole("button", { name: "Share" }).click();
	await other.getByRole("dialog", { name: "Share" }).getByText("Shares part1, the page you’re on").waitFor();
	expect(await other.getByText("Start on hero").count()).toBe(0);
});

it("picks pages from a tree that keeps one size however many there are", { timeout: 60_000 }, async () => {
	const page = await open();
	await page.getByRole("button", { name: "Share" }).click();
	const popover = page.getByRole("dialog", { name: "Share" });
	await popover.getByRole("button", { name: "Add pages" }).click();
	const tree = popover.getByRole("tree", { name: "Pages" });
	// the page you're on stands open in the tree, chosen without the pages under it
	await tree.locator('[data-share-page="area2/part1"] [data-tick="some"]').waitFor();
	await tree.locator('[data-share-page="area2/part1/leaf0"]').waitFor({ state: "detached" });
	const before = await popover.boundingBox();
	// a folder takes its whole subtree, and its parent says it is part chosen
	await tree.locator('[data-share-page="area3"]').click();
	await popover.getByText("18 pages · 36 frames").waitFor();
	await tree.getByRole("button", { name: "Expand area1" }).click();
	await tree.locator('[data-share-page="area1/part0"]').waitFor();
	const after = await popover.boundingBox();
	expect(after?.height).toBe(before?.height);
	expect((after?.y ?? 0) + (after?.height ?? 0)).toBeLessThanOrEqual(700);
	expect(await tree.evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
	// finding goes across folders and says where each match lives
	await popover.getByLabel("Find a page").fill("leaf2");
	await popover.getByText("24 found · 18 pages · 36 frames").waitFor();
	await tree.locator('[data-share-page="area0/part0/leaf2"]').getByText("area0/part0").waitFor();
	await tree.locator('[data-share-page="area0/part0/leaf2"]').click();
	await popover.getByText("19 pages · 38 frames").waitFor();
});

it("opens on a page a right-click names, and to signing in while signed out", { timeout: 60_000 }, async () => {
	const page = await open();
	await page.evaluate(() => (window as unknown as { openShare: (page: string) => void }).openShare("area4"));
	await page.getByRole("dialog", { name: "Share" }).getByText("Shares area4, the page you’re on").waitFor();
	await page.keyboard.press("Escape");
	await page.getByRole("dialog", { name: "Share" }).waitFor({ state: "detached" });

	const out = await open("signed-out");
	await out.getByRole("button", { name: "Share" }).click();
	await out.getByRole("dialog", { name: "Share" }).getByRole("button", { name: "Sign in" }).click();
	expect(await out.evaluate(() => (window as unknown as { signedIn?: boolean }).signedIn)).toBe(true);
});

it("stands in the bar on Home too, where it rests, so nothing beside it moves", { timeout: 60_000 }, async () => {
	const page = await open();
	const share = page.locator('[data-bar-end="share"]');
	const before = await share.boundingBox();
	await page.evaluate(() => (window as unknown as { goHome: () => void }).goHome());
	await expect.poll(() => share.isDisabled()).toBe(true);
	expect(await share.boundingBox()).toEqual(before);
});
