import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, BrowserContextOptions, Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { COVER_PNG, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { writeCover } from "./thumbs";

/**
 * A frame exported as one HTML file (spool#239), opened the way whoever it is
 * sent to opens it: from disk, with nothing on the network answering.
 */

async function exported(
	scope: "flow" | "one",
	query = "",
): Promise<{ file: string; html: string; again: (query: string) => Promise<string> }> {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	writeDesignFile(root, "shared/scenarios/default.json", JSON.stringify({ state: { guest: "Cata" } }));
	writeFileSync(join(root, "design", "shared", "cup.png"), COVER_PNG);
	writeFrame(
		root,
		"menu",
		`import { ui } from "spool";
import cup from "../../shared/cup.png";
export default function Menu() {
	return <main className="p-8"><style>{"#narrow { display: none } @media (max-width: 600px) { #narrow { display: block } }"}</style><img id="cup" src={cup} alt="" /><h1>Menu for {String(ui.state.guest)}</h1><p id="narrow">narrow</p><button data-go="cart">Order</button><a id="away" href="https://example.com/away">Away</a></main>;
}
`,
	);
	writeFrame(root, "cart", `export default function Cart() { return <h1 className="text-3xl">Your cart</h1>; }\n`);
	writeFrame(root, "aside", `export default function Aside() { return <h1>Aside</h1>; }\n`);
	writeCover(root, "menu", Buffer.from(COVER_PNG));
	const app = makeApp(spoolDir);
	const again = async (query: string) => {
		const res = await app.request(`/api/p/${name}/export/html?frame=menu&scope=${scope}${query}`);
		expect(res.status, await res.clone().text()).toBe(200);
		expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${name}-menu.html"`);
		return res.text();
	};

	const html = await again(query);
	const file = join(makeTempDir(), `${name}-menu.html`);
	writeFileSync(file, html);
	return { file, html, again };
}

/** A page that may read its own file and nothing else, but for the web modules it is given. */
async function offline(
	browser: Browser,
	file: string,
	javaScriptEnabled = true,
	web: Record<string, string> = {},
	options: BrowserContextOptions = {},
): Promise<Page> {
	const context = await browser.newContext({ javaScriptEnabled, ...options });
	const asked: string[] = [];
	await context.route("**/*", (route) => {
		const url = route.request().url();
		if (url === pathToFileURL(file).href) return route.continue();
		const module = web[url];
		if (module !== undefined) {
			return route.fulfill({
				body: module,
				contentType: "text/javascript",
				headers: { "access-control-allow-origin": "*" },
			});
		}
		asked.push(url);
		return route.abort();
	});
	const page = await context.newPage();
	await page.goto(pathToFileURL(file).href);
	return Object.assign(page, { asked });
}

it("opens from disk with the network off, and walks to the frames its start links to", async () => {
	const { file, html } = await exported("flow");
	expect(html).toContain('<meta name="generator" content="Spool">');
	const browser = await testBrowser();

	// the still, before any script has run
	const still = await offline(browser, file, false);
	await expect.poll(() => still.locator("#root img[src^='data:image/png']").count()).toBe(1);

	const page = await offline(browser, file);
	await expect.poll(() => page.locator("h1").textContent(), { timeout: 30_000 }).toBe("Menu for Cata");
	expect(await page.locator("#cup").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
	// the live frame took the still's place
	expect(await page.locator("#root img:not(#cup)").count()).toBe(0);
	await page.locator("button").click();
	await expect.poll(() => page.locator("h1").textContent(), { timeout: 30_000 }).toBe("Your cart");
	// the sheet that came with the frame applies to it
	expect(await page.locator("h1").evaluate((h1) => getComputedStyle(h1).fontSize)).toBe("30px");
	expect((page as Page & { asked: string[] }).asked).toEqual([]);
	expect(html).not.toContain("Aside");
}, 120_000);

it("leaves out the frames its start links to when only the frame is asked for", async () => {
	const { file, html } = await exported("one");
	expect(html).not.toContain("Your cart");
	const page = await offline(await testBrowser(), file);
	await expect.poll(() => page.locator("h1").textContent(), { timeout: 30_000 }).toBe("Menu for Cata");
	await page.locator("button").click();
	await page.waitForTimeout(300);
	expect(await page.locator("h1").textContent()).toBe("Menu for Cata");
}, 120_000);

it("lets a package the project maps to the web use the React the frames render with", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const counter = "https://cdn.spool.test/counter.js";
	writeDesignFile(root, "shared/importmap.json", JSON.stringify({ imports: { counter } }));
	writeFrame(
		root,
		"tally",
		`import { useCounter } from "counter";
export default function Tally() {
	const [count, add] = useCounter();
	return <button onClick={add}>Tapped {count}</button>;
}
`,
	);
	const res = await makeApp(spoolDir).request(`/api/p/${name}/export/html?frame=tally&scope=one`);
	expect(res.status, await res.clone().text()).toBe(200);
	const file = join(makeTempDir(), `${name}-tally.html`);
	writeFileSync(file, await res.text());

	const page = await offline(await testBrowser(), file, true, {
		[counter]: `import { useState } from "react";
export function useCounter() { const [n, set] = useState(0); return [n, () => set(n + 1)]; }
`,
	});
	await expect.poll(() => page.locator("button").textContent(), { timeout: 30_000 }).toBe("Tapped 0");
	await page.locator("button").click();
	await expect.poll(() => page.locator("button").textContent()).toBe("Tapped 1");
}, 120_000);

it("gives the frame the document it has on the canvas: its own scroll box scrolls, in the scheme its root sets", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	writeFrame(
		root,
		"long",
		`export default function Long() {
	return (
		<div id="scroller" style={{ height: "100%", overflowY: "auto", overscrollBehavior: "none" }}>
			<style>{":root { color-scheme: dark; }"}</style>
			<div style={{ height: 3000 }}>Long</div>
		</div>
	);
}
`,
	);
	const res = await makeApp(spoolDir).request(`/api/p/${name}/export/html?frame=long&scope=one`);
	expect(res.status, await res.clone().text()).toBe(200);
	const file = join(makeTempDir(), `${name}-long.html`);
	writeFileSync(file, await res.text());

	const page = await offline(await testBrowser(), file);
	const scroller = page.locator("#scroller");
	await expect.poll(() => scroller.count(), { timeout: 30_000 }).toBe(1);
	expect(await scroller.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
	await page.mouse.move(100, 100);
	await page.mouse.wheel(0, 600);
	await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(600);
}, 120_000);

it("opens in the player with the switch on: sizes the frame for real, walks, and steps aside on a touch screen", async () => {
	const { file, again } = await exported("flow", "&player=1");
	const browser = await testBrowser();
	const page = await offline(browser, file, true, {}, { viewport: { width: 1280, height: 900 } });
	const inner = page.frameLocator("#spool-player");
	await expect.poll(() => inner.locator("h1").textContent(), { timeout: 30_000 }).toBe("Menu for Cata");
	expect(await inner.locator("#cup").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

	// the bar a played tab wears: the frame's name and its size, with nothing that needs spool behind it
	expect(await page.locator(".spool-bar-name").textContent()).toBe("menu");
	const size = page.locator("button[aria-haspopup=menu]");
	await expect.poll(() => size.textContent()).toBe("1440 × 900 · 89%");
	for (const gone of ['[aria-label="Record"]', "#spool-close", ".spool-bar-copy", "[aria-label*=omment]"]) {
		expect(await page.locator(gone).count(), gone).toBe(0);
	}

	// a size from the list is the frame's own viewport, so its media queries answer to it
	const measured = () => inner.locator("main").evaluate(() => window.innerWidth);
	expect(await measured()).toBe(1440);
	expect(await inner.locator("#narrow").isVisible()).toBe(false);
	await size.click();
	await page.getByRole("menuitemcheckbox", { name: /Phone/ }).click();
	await expect.poll(measured, { timeout: 30_000 }).toBe(390);
	expect(await inner.locator("#narrow").isVisible()).toBe(true);

	// whatever was picked last, the file opens again As drawn: it remembers nothing for whoever opens it next
	await size.click();
	await page.getByRole("menuitemcheckbox", { name: /Window/ }).click();
	await expect.poll(measured, { timeout: 30_000 }).not.toBe(390);
	await page.goto(pathToFileURL(file).href);
	await expect.poll(() => inner.locator("h1").textContent(), { timeout: 30_000 }).toBe("Menu for Cata");
	await expect.poll(() => size.textContent()).toBe("1440 × 900 · 89%");
	expect(await measured()).toBe(1440);

	// a link out opens a tab of its own, and the frame stays where it is
	const away = page.context().waitForEvent("page");
	await inner.locator("#away").click();
	await away;
	await expect.poll(() => (page as Page & { asked: string[] }).asked).toEqual(["https://example.com/away"]);
	expect(await inner.locator("h1").textContent()).toBe("Menu for Cata");

	// the flow walks inside the player
	await inner.locator("button").click();
	await expect.poll(() => inner.locator("h1").textContent(), { timeout: 30_000 }).toBe("Your cart");
	await expect.poll(() => page.locator(".spool-bar-name").textContent()).toBe("cart");
	expect((page as Page & { asked: string[] }).asked).toEqual(["https://example.com/away"]);

	// on a touch screen there is nothing to pull: no bar, and the frame is the screen
	const phone = await offline(
		browser,
		file,
		true,
		{},
		{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
	);
	const touched = phone.frameLocator("#spool-player");
	await expect.poll(() => touched.locator("h1").textContent(), { timeout: 30_000 }).toBe("Menu for Cata");
	expect(await phone.locator(".spool-top").count()).toBe(0);
	expect(await touched.locator("main").evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([390, 844]);

	// without it, the file is the frame alone, as it always was
	const alone = await again("");
	expect(alone).not.toContain("__SPOOL_EXPORT__");
	expect(await again("&player=0")).toBe(alone);
}, 180_000);
