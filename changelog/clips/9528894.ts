import type { Page } from "playwright-core";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, the Chrome extension: a piece of a website, picked in the browser, lands on the canvas as a reference */
const SITE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Northbound Coffee</title>
<style>
	* { box-sizing: border-box; }
	body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f6f1ea; color: #2a1d14; }
	nav { display: flex; align-items: center; justify-content: space-between; padding: 22px 64px; }
	nav b { font-size: 19px; letter-spacing: -0.02em; }
	nav span { display: flex; gap: 28px; font-size: 15px; color: #6d5a4a; }
	header { padding: 36px 64px 30px; }
	h1 { margin: 0; font-size: 46px; letter-spacing: -0.03em; line-height: 1.05; max-width: 640px; }
	header p { margin: 14px 0 0; font-size: 18px; color: #6d5a4a; }
	.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 10px 64px 64px; }
	.plan { border-radius: 18px; background: #fff; padding: 28px; box-shadow: 0 1px 0 rgba(42,29,20,.06); }
	.plan h2 { margin: 0; font-size: 17px; color: #6d5a4a; font-weight: 500; }
	.plan .price { margin: 10px 0 4px; font-size: 40px; font-weight: 650; letter-spacing: -0.03em; }
	.plan .price small { font-size: 16px; font-weight: 400; color: #8a7666; }
	.plan ul { margin: 18px 0 24px; padding: 0; list-style: none; display: grid; gap: 9px; font-size: 15px; }
	.plan li::before { content: "✓"; margin-right: 9px; color: #c0622f; }
	.plan a { display: block; padding: 13px; border-radius: 11px; text-align: center; text-decoration: none; font-weight: 600; background: #f1e6da; color: #2a1d14; }
	.plan.featured { background: #2a1d14; color: #f6f1ea; }
	.plan.featured h2, .plan.featured .price small { color: #cdb9a6; }
	.plan.featured a { background: #c0622f; color: #fff; }
</style>
</head>
<body>
	<nav><b>Northbound</b><span><a>Coffee</a><a>Subscribe</a><a>Cafés</a></span></nav>
	<header>
		<h1>Fresh roasts at your door, every other Friday</h1>
		<p>Pick a plan. Skip, pause or swap beans whenever you like.</p>
	</header>
	<section class="plans">
		<article class="plan"><h2>Taster</h2><div class="price">149 kr<small> / delivery</small></div><ul><li>250 g, one origin</li><li>Whole bean or ground</li><li>Pause any time</li></ul><a href="#">Start tasting</a></article>
		<article class="plan featured"><h2>Regular</h2><div class="price">279 kr<small> / delivery</small></div><ul><li>500 g, two origins</li><li>Roasted the day before</li><li>Free shipping</li></ul><a href="#">Choose Regular</a></article>
		<article class="plan"><h2>Office</h2><div class="price">649 kr<small> / delivery</small></div><ul><li>2 kg for the team</li><li>Brew guide included</li><li>Invoice monthly</li></ul><a href="#">Talk to us</a></article>
	</section>
</body>
</html>`;

let site: Page;

export default {
	// the project the reference is for: a coffee shop's landing, still bare
	files: {
		"design/frames/landing/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 620 }),
		"design/frames/landing/frame.tsx": `export default function Landing() {
	return (
		<div style={{ height: "100%", padding: 28, background: "#fbf8f4", fontFamily: "system-ui", color: "#2a1d14" }}>
			<b>Kaffe</b>
			<h1 style={{ fontSize: 32, letterSpacing: "-0.03em", margin: "48px 0 12px" }}>Beans for the week</h1>
			<p style={{ color: "#6d5a4a", margin: 0 }}>Plans coming soon</p>
		</div>
	);
}
`,
	},
	viewport: { w: 1120, h: 700 },
	extension: true,
	// the website in its own tab, the canvas open behind it on an empty project
	prepare: async ({ context, film }) => {
		// served by the browser itself under a site's own name, which the reference is named after
		await context.route("https://northbound.coffee/**", (route) =>
			route.fulfill({ contentType: "text/html", body: SITE }),
		);
		site = await context.newPage();
		await site.goto("https://northbound.coffee/");
		await site.waitForTimeout(800);
		await film(site);
	},
	live: async ({ page, extension, walk, film }) => {
		await walk([{ wait: 600 }, { move: { x: 900, y: 120 }, ms: 600 }, { wait: 300 }], site);
		// the toolbar icon, which a headless window has no toolbar to press
		await extension?.evaluate(async () => {
			const { chrome } = globalThis as unknown as {
				chrome: {
					tabs: { query(filter: object): Promise<{ id?: number; url?: string }[]> };
					scripting: { executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown> };
				};
			};
			const tab = (await chrome.tabs.query({})).find((one) => one.url?.startsWith("https://northbound.coffee"));
			if (tab?.id !== undefined)
				await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
		});
		await walk(
			[
				{ wait: 1200 },
				{ move: ".plan.featured .price", ms: 900 },
				{ wait: 300 },
				// the card's own padding above its name, so the picker holds the whole card, and the receipt comes up by the hand
				{ move: { selector: ".plan.featured h2", dy: -20 }, ms: 500 },
				{ wait: 1000 },
				{ click: { selector: ".plan.featured h2", dy: -20 }, ms: 200 },
			],
			site,
		);
		await site.locator("spool-picker >> text=Open in spool").waitFor({ timeout: 20_000 });
		await walk([{ wait: 700 }, { click: "spool-picker >> text=Open in spool", ms: 350 }], site);
		await site.waitForTimeout(500);
		await film(page);
		// the canvas goes to the reference once spool has opened it
		await page
			.locator('[data-page-row], [aria-label="Path"]')
			.getByText("references")
			.first()
			.waitFor({ timeout: 20_000 });
		await page.locator("iframe").last().waitFor({ timeout: 20_000 });
		await walk([{ wait: 2200 }], page);
	},
} satisfies Clip;
