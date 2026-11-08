import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { COVER_PNG, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { writeCover } from "./thumbs";

/**
 * A frame exported as one HTML file (spool#239), opened the way whoever it is
 * sent to opens it: from disk, with nothing on the network answering.
 */

async function exported(scope: "flow" | "one"): Promise<{ file: string; html: string }> {
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
	return <main className="p-8"><img id="cup" src={cup} alt="" /><h1>Menu for {String(ui.state.guest)}</h1><button data-go="cart">Order</button></main>;
}
`,
	);
	writeFrame(root, "cart", `export default function Cart() { return <h1 className="text-3xl">Your cart</h1>; }\n`);
	writeFrame(root, "aside", `export default function Aside() { return <h1>Aside</h1>; }\n`);
	writeCover(root, "menu", Buffer.from(COVER_PNG));
	const app = makeApp(spoolDir);

	const res = await app.request(`/api/p/${name}/export/html?frame=menu&scope=${scope}`);
	expect(res.status, await res.clone().text()).toBe(200);
	expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${name}-menu.html"`);
	const html = await res.text();
	const file = join(makeTempDir(), `${name}-menu.html`);
	writeFileSync(file, html);
	return { file, html };
}

/** A page that may read its own file and nothing else, but for the web modules it is given. */
async function offline(
	browser: Browser,
	file: string,
	javaScriptEnabled = true,
	web: Record<string, string> = {},
): Promise<Page> {
	const context = await browser.newContext({ javaScriptEnabled });
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
