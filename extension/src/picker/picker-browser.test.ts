import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { testBrowser } from "../../../src/test-browser";
import { buildExtension } from "../../build";
import type { Ask, SendAnswer } from "../messages";

/**
 * The built picker on a page, its service worker played by a stub: what a person does with it reaches spool as a
 * capture, and spool's answer comes back as the receipt. Loading the whole unpacked extension needs full Chromium,
 * which CI does not install; the service worker's side was proven by hand.
 */

let out: string;
let picker: string;

beforeAll(async () => {
	out = mkdtempSync(join(tmpdir(), "spool-extension-"));
	await buildExtension({ out });
	picker = readFileSync(join(out, "picker.js"), "utf8");
}, 120_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

const SITE = `<!doctype html><html><head><style>
	body { margin: 0; font: 16px sans-serif }
	.pricing { margin: 160px 40px; height: 300px; background: #eee }
</style></head><body>
	<a id="away" href="/elsewhere"><section class="pricing"><h2>Plans</h2></section></a>
</body></html>`;

it("picks, sends to spool and shows the receipt; spool away, says so and tries again", {
	timeout: 60_000,
}, async () => {
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
	await page.route("http://tidemark.test/**", (route) =>
		route.fulfill({ contentType: "text/html", body: route.request().url().endsWith("/") ? SITE : "elsewhere" }),
	);
	await page.goto("http://tidemark.test/");
	// the service worker, as the picker sees it: it records each ask and answers with what the case sets
	await page.evaluate(() => {
		const w = window as unknown as { asks: Ask[]; answer: SendAnswer; chrome: unknown };
		w.asks = [];
		w.answer = { ok: true, sent: { project: "tidemark", name: "Tidemark", frame: "references/pricing" } };
		w.chrome = {
			runtime: {
				sendMessage: async (ask: Ask) => {
					w.asks.push(ask);
					return ask.type === "spool:send" ? w.answer : { ok: true, opened: { shown: true, url: "" } };
				},
			},
			dom: { openOrClosedShadowRoot: () => null },
		};
	});
	const asks = () => page.evaluate(() => (window as unknown as { asks: Ask[] }).asks);
	const tab = page.locator("spool-picker [data-spool-tab]");

	await page.mouse.move(20, 20);
	await page.addScriptTag({ content: picker });
	await expect.poll(() => tab.textContent()).toContain("Point at anything and click to send it to spool.");

	// resting on the section, the tab names it and unfolds
	await page.mouse.move(300, 300, { steps: 3 });
	await expect.poll(() => tab.textContent()).toBe("section.pricing1120 × 300Whole page⌘↵Send to spool↵");

	// a click picks: the link under it is not followed, and spool's answer is the receipt
	await page.mouse.click(300, 300);
	await expect.poll(() => tab.textContent()).toBe("In references/ on TidemarkOpen in spool");
	expect(page.url()).toBe("http://tidemark.test/");
	const [sent] = await asks();
	expect(sent).toMatchObject({ type: "spool:send", capture: { label: "section.pricing", whole: false } });
	expect(sent?.type === "spool:send" && sent.capture.html).toContain('<section class="pricing" data-spool-reference');

	// ↑ walks out past body to the whole page; spool isn't there; it opens; Try again sends it
	await page.evaluate(() => {
		(window as unknown as { answer: SendAnswer }).answer = { ok: false, offline: true };
	});
	for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowUp");
	await expect.poll(() => tab.textContent()).toBe("tidemark.test · whole page1200 × 800Send whole page↵");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => tab.textContent())
		.toBe("spool isn't running on this Mac. Open it, then try again.Try again");
	await page.evaluate(() => {
		(window as unknown as { answer: SendAnswer }).answer = {
			ok: true,
			sent: { project: "tidemark", name: "Tidemark", frame: "references/tidemark-test" },
		};
	});
	await tab.getByText("Try again", { exact: true }).click();
	await expect.poll(() => tab.textContent()).toBe("In references/ on TidemarkOpen in spool");
	expect((await asks()).map((a) => a.type === "spool:send" && a.capture.whole)).toEqual([false, true, true]);

	// Open in spool asks for that frame
	await tab.getByText("Open in spool", { exact: true }).click();
	await expect.poll(() => tab.textContent()).toBe("Opening spool");
	expect((await asks()).at(-1)).toEqual({
		type: "spool:open",
		open: { project: "tidemark", frame: "references/tidemark-test" },
	});

	// closed, the page is the page's again
	await page.keyboard.press("Escape");
	await page.mouse.click(300, 300);
	await expect.poll(() => page.url()).toBe("http://tidemark.test/elsewhere");
});
