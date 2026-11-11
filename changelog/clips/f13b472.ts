import type { Page } from "playwright-core";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.55.0, play at any size: a played phone frame's edge pulls it out until it holds on a tablet, and the size list lays it out on a desktop */
const ore = (screen: string, next: string) => `import { ui } from "spool";
import { Ore } from "shared/kit/ore/ore";

export default function Frame() {
	return <Ore screen="${screen}" onNext={() => ui.go("ore-${next}")} />;
}
`;
const screens = ["pick", "limits", "shipped"];

/** the played tab, which Play opens beside the canvas */
let played: Page;

export default {
	kit: ["ore"],
	files: Object.fromEntries(
		screens.flatMap((screen, at) => [
			[`design/frames/ore-${screen}/frame.json`, JSON.stringify({ x: 80 + at * 440, y: 80, w: 390, h: 844 })],
			[`design/frames/ore-${screen}/frame.tsx`, ore(screen, screens[(at + 1) % screens.length] as string)],
		]),
	),
	// small enough that the m1 fits the window and its margin on its screen
	viewport: { w: 1120, h: 700 },
	// Play opens the frame in a tab of its own, so the take starts there, on the phone at the size it was drawn
	prepare: async ({ page, context, film, hurry }) => {
		await page.locator('[aria-label="clip canvas"] >> text=ore-pick').first().hover();
		const opened = context.waitForEvent("page");
		await page.locator('[aria-label="Play ore-pick"]').click();
		played = await opened;
		await hurry(played.waitForLoadState());
		await played.waitForTimeout(2500);
		await film(played);
	},
	live: async ({ walk }) => {
		const box = await played.locator("iframe").first().boundingBox();
		if (box === null) throw new Error("the played frame is not on screen");
		const edge = { x: Math.round(box.x + box.width + 2), y: Math.round(box.y + box.height / 2) };
		// the frame plays scaled to fit the window's height, and widens on both sides: a tablet's 834 is this far out
		const toTablet = Math.round(((834 - 390) / 2) * (box.height / 844));
		await walk(
			[
				{ wait: 600 },
				// near the edge its grip shows; pulled, the frame widens on both sides and holds on a tablet
				{ move: edge, ms: 800 },
				{ wait: 300 },
				{ drag: edge, by: { dx: toTablet + 1, dy: 0 }, ms: 2000 },
				{ wait: 1000 },
				// the size on the bar is a list: resting on a row lays the frame out at it, a click keeps it
				{ click: ".spool-size-readout", ms: 700 },
				{ wait: 500 },
				{ move: ".spool-size-row >> text=Laptop", ms: 500 },
				{ wait: 1100 },
				{ move: ".spool-size-row >> text=Desktop", ms: 300 },
				{ wait: 900 },
				{ click: ".spool-size-row >> text=Desktop", ms: 150 },
				{ wait: 1200 },
				{ move: { x: 1100, y: 600 }, ms: 700 },
				{ wait: 600 },
			],
			played,
		);
	},
} satisfies Clip;
