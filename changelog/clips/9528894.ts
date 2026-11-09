import type { Page } from "playwright-core";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, the Chrome extension: a piece of a website, picked in the browser, lands on the canvas as a reference */
const SITE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lope · Run the city</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap">
<style>
	* { box-sizing: border-box; }
	body { margin: 0; font-family: "Archivo", system-ui, sans-serif; background: #0b0b0c; color: #f4f3ef; -webkit-font-smoothing: antialiased; }
	a { color: inherit; text-decoration: none; }
	.num { font-weight: 900; font-style: italic; font-stretch: 72%; letter-spacing: -0.015em; line-height: 0.84; font-variant-numeric: tabular-nums; }
	.title { font-weight: 800; font-stretch: 88%; letter-spacing: -0.02em; }
	nav { display: flex; align-items: center; justify-content: space-between; padding: 22px 64px; }
	nav b { display: flex; align-items: center; gap: 9px; font-size: 26px; }
	nav b i { width: 10px; height: 10px; border-radius: 50%; background: #d4ff3f; }
	nav span { display: flex; align-items: center; gap: 30px; font-size: 15px; color: rgba(244,243,239,.56); }
	nav span a:last-child { padding: 9px 18px; border-radius: 999px; background: #222225; color: #f4f3ef; font-weight: 600; }
	header { display: flex; align-items: end; justify-content: space-between; padding: 34px 64px 40px; }
	h1 { margin: 0; font-size: 58px; line-height: .95; max-width: 560px; }
	header p { margin: 14px 0 0; font-size: 17px; color: rgba(244,243,239,.56); }
	header .big { font-size: 128px; color: #d4ff3f; text-align: right; }
	header .stat { text-align: right; }
	header .stat p { margin-top: 10px; font-size: 15px; }
	.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; padding: 6px 64px 64px; }
	.plan { border-radius: 28px; background: #161618; padding: 26px 28px; }
	.plan h2 { margin: 0; font-size: 22px; }
	.plan .price { margin: 16px 0 0; font-size: 64px; }
	.plan .price small { font: 500 15px "Archivo", system-ui, sans-serif; color: rgba(244,243,239,.56); }
	.plan ul { margin: 18px 0 22px; padding: 0; list-style: none; display: grid; gap: 9px; font-size: 15px; color: rgba(244,243,239,.75); }
	.plan li::before { content: ""; display: inline-block; width: 7px; height: 7px; margin: 0 10px 2px 0; border-radius: 50%; background: #d4ff3f; }
	.plan a { display: block; padding: 13px; border-radius: 999px; text-align: center; font-weight: 700; background: #222225; }
	.plan.featured { background: #d4ff3f; color: #0b0b0c; }
	.plan.featured .price small, .plan.featured ul { color: rgba(11,11,12,.62); }
	.plan.featured li::before { background: #0b0b0c; }
	.plan.featured a { background: #0b0b0c; color: #d4ff3f; }
</style>
</head>
<body>
	<nav><b class="title"><i></i>lope</b><span><a>Coaching</a><a>Routes</a><a>Clubs</a><a>Get the app</a></span></nav>
	<header>
		<div>
			<h1 class="title">Run the city. Lope keeps count.</h1>
			<p>Set a goal, hear every kilometre, keep every route.</p>
		</div>
		<div class="stat"><div class="big num">5.00</div><p>kilometres, this morning</p></div>
	</header>
	<section class="plans">
		<article class="plan"><h2 class="title">Free</h2><div class="price num">$0<small> / month</small></div><ul><li>Live pace and distance</li><li>Saved routes</li><li>Weekly summary</li></ul><a href="#">Download</a></article>
		<article class="plan featured"><h2 class="title">Pro</h2><div class="price num">$6<small> / month</small></div><ul><li>A coach in your ear every km</li><li>Training plans to 42.2 km</li><li>Splits and heart rate</li></ul><a href="#">Start 30 days free</a></article>
		<article class="plan"><h2 class="title">Club</h2><div class="price num">$4<small> / runner</small></div><ul><li>Shared routes and goals</li><li>Club leaderboard</li><li>Billed to the club</li></ul><a href="#">Start a club</a></article>
	</section>
</body>
</html>`;

let site: Page;

export default {
	// the project the reference is for: Lope's run, its pricing still to design
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
	// the website in its own tab, the canvas open behind it on an empty project
	prepare: async ({ context, film }) => {
		// served by the browser itself under a site's own name, which the reference is named after
		await context.route("https://lope.run/**", (route) => route.fulfill({ contentType: "text/html", body: SITE }));
		site = await context.newPage();
		await site.goto("https://lope.run/");
		await site.waitForTimeout(800);
		await film(site);
	},
	live: async ({ page, extension, walk, film }) => {
		await walk([{ wait: 400 }, { move: { x: 900, y: 120 }, ms: 500 }, { wait: 200 }], site);
		// the toolbar icon, which a headless window has no toolbar to press
		await extension?.evaluate(async () => {
			const { chrome } = globalThis as unknown as {
				chrome: {
					tabs: { query(filter: object): Promise<{ id?: number; url?: string }[]> };
					scripting: { executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown> };
				};
			};
			const tab = (await chrome.tabs.query({})).find((one) => one.url?.startsWith("https://lope.run"));
			if (tab?.id !== undefined)
				await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
		});
		await walk(
			[
				{ wait: 900 },
				{ move: ".plan.featured .price", ms: 800 },
				{ wait: 200 },
				// the card's own padding above its name, so the picker holds the whole card, and the receipt comes up by the hand
				{ move: { selector: ".plan.featured h2", dy: -20 }, ms: 500 },
				{ wait: 800 },
				{ click: { selector: ".plan.featured h2", dy: -20 }, ms: 200 },
			],
			site,
		);
		await site.locator("spool-picker >> text=Open in spool").waitFor({ timeout: 20_000 });
		await walk([{ wait: 500 }, { click: "spool-picker >> text=Open in spool", ms: 350 }], site);
		await site.waitForTimeout(500);
		await film(page);
		// the canvas goes to the reference once spool has opened it
		await page
			.locator('[data-page-row], [aria-label="Path"]')
			.getByText("references")
			.first()
			.waitFor({ timeout: 20_000 });
		await page.locator("iframe").last().waitFor({ timeout: 20_000 });
		await walk([{ wait: 2000 }], page);
	},
} satisfies Clip;
