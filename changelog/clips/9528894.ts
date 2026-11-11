import type { Page } from "playwright-core";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, the Chrome extension: a piece of a real website, picked in the browser, lands on the canvas as a reference */
const SITE = "https://stripe.com/";
const CARD = ".modular-solutions-bento__card-payments";

let site: Page;

export default {
	// the project the reference is for: Lope's run, its checkout still to design
	kit: ["lope"],
	files: {
		"design/frames/start/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/start/frame.tsx": `import { ui } from "spool";
import { Lope } from "shared/kit/lope/lope";

export default function Frame() {
	return <Lope screen="start" onNext={(patch) => ui.go("run", patch)} />;
}
`,
	},
	viewport: { w: 1120, h: 700 },
	extension: true,
	// stripe.com in its own tab, live off the web, the canvas open behind it on an empty project
	prepare: async ({ context, film }) => {
		site = await context.newPage();
		await site.goto(SITE);
		// its cookie notice and announcement bar, answered before filming as a visitor would have
		await site.getByTestId("reject-button").click({ timeout: 15_000 });
		await site
			.getByRole("button", { name: "Dismiss announcement" })
			.click({ timeout: 5_000 })
			.catch(() => {});
		// down and back once, so the images further down have loaded by the time the take gets there
		await site.mouse.wheel(0, 900);
		await site.waitForTimeout(1500);
		await site.evaluate(() => scrollTo(0, 0));
		await site.waitForTimeout(1500);
		await film(site);
	},
	live: async ({ page, extension, walk, film, hurry }) => {
		// a beat on the page everyone knows, then down to its payments card, scrolled as the page itself scrolls
		await walk([{ wait: 1000 }], site);
		await site.evaluate((card) => {
			const top = document.querySelector(card)?.getBoundingClientRect().top ?? 0;
			scrollBy({ top: top - 60, behavior: "smooth" });
		}, CARD);
		await site.waitForTimeout(900);
		// the toolbar icon, which a headless window has no toolbar to press
		await hurry(
			extension?.evaluate(async () => {
				const { chrome } = globalThis as unknown as {
					chrome: {
						tabs: { query(filter: object): Promise<{ id?: number; url?: string }[]> };
						scripting: {
							executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown>;
						};
					};
				};
				const tab = (await chrome.tabs.query({})).find((one) => one.url?.startsWith("https://stripe.com"));
				if (tab?.id !== undefined)
					await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
			}) ?? Promise.resolve(),
		);
		await walk(
			[
				{ wait: 300 },
				// the card's title: the card is one button, so the picker holds all of it
				{ move: `${CARD} h3`, ms: 700 },
				{ wait: 700 },
				{ click: `${CARD} h3`, ms: 150 },
			],
			site,
		);
		// the send, which takes a few seconds on a page this rich
		await hurry(site.locator("spool-picker >> text=Open in spool").waitFor({ timeout: 30_000 }));
		await walk([{ wait: 300 }, { click: "spool-picker >> text=Open in spool", ms: 350 }], site);
		// spool opens the reference in its own tab behind this one; the take cuts to it once it has drawn
		await hurry(
			(async () => {
				await page
					.locator('[data-page-row], [aria-label="Path"]')
					.getByText("references")
					.first()
					.waitFor({ timeout: 20_000 });
				await page.locator("iframe").last().waitFor({ timeout: 20_000 });
				await page.waitForTimeout(1200);
			})(),
		);
		await film(page);
		await walk([{ wait: 2000 }], page);
	},
} satisfies Clip;
