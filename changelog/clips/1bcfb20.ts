import type { Page } from "playwright-core";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.57.0, export: a frame saved as HTML with its player, then opened and pulled wider by its edge */
const ADDRESS = "https://dill.example/dill-recipe.html";

export default {
	kit: ["dill"],
	files: {
		"design/frames/recipe/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/recipe/frame.tsx": `import { Dill } from "shared/kit/dill/dill";

export default function Frame() {
	return <Dill screen="recipe" onNext={() => {}} />;
}
`,
	},
	viewport: { w: 1120, h: 700 },
	// the recipe drawn on the canvas before filming starts
	prepare: async ({ page }) => {
		await page.frameLocator("iframe").first().locator("img").first().waitFor({ timeout: 30_000 });
		await page.waitForTimeout(1500);
	},
	live: async ({ page, context, walk, film, hurry }) => {
		// the file the export builds, heard as the daemon hands it over, so the take can open what was saved
		const built = page.waitForResponse((res) => res.url().includes("/export/html"), { timeout: 60_000 });
		await walk([
			{ click: { selector: '[aria-label="clip canvas"] >> text=recipe', dy: 160 }, button: "right", ms: 600 },
			{ wait: 350 },
			{ click: "text=Export…", ms: 400 },
			{ wait: 300 },
			{ click: '[aria-label="Export format"] >> text=html', ms: 400 },
			{ wait: 700 },
			{ click: '[role="menuitem"] >> text=Export', ms: 450 },
		]);
		// the build, until the menu says it downloaded
		const [html] = await hurry(
			Promise.all([built.then((res) => res.body()), page.getByText("Downloaded").waitFor({ timeout: 60_000 })]),
		);
		await walk([{ wait: 500 }]);

		// the downloaded file, opened as whoever it was sent to opens it
		const file: Page = await context.newPage();
		await file.route(ADDRESS, (route) => route.fulfill({ body: html, contentType: "text/html" }));
		await hurry(
			(async () => {
				await file.goto(ADDRESS);
				await file.frameLocator("#spool-player").locator("img").first().waitFor({ timeout: 30_000 });
				await file.waitForTimeout(1200);
			})(),
		);
		await film(file);
		const box = await file.locator("#spool-player").boundingBox();
		if (box === null) throw new Error("the player's frame is not on screen");
		const right = { x: Math.round(box.x + box.width + 3), y: Math.round(box.y + box.height / 2) };
		await walk(
			[
				// pulled wider by its edge, the recipe lays out at the size it is given
				{ move: right, ms: 500 },
				{ drag: right, by: { dx: 150, dy: 0 }, ms: 1200 },
				{ wait: 1400 },
			],
			file,
		);
	},
} satisfies Clip;
