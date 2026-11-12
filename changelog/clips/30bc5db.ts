import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.56.0, decks: Present plays the talk full screen, the slide growing from its card, and End flies it back */
const ore = (screen: string) => `import { Ore } from "shared/kit/ore/ore";

export default function Frame() {
	return <Ore screen="${screen}" onNext={() => {}} />;
}
`;

export default {
	kit: ["ore"],
	settings: { "experimental.deck": true },
	files: {
		"design/frames/ore/pick/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/ore/pick/frame.tsx": ore("pick"),
	},
	viewport: { w: 1280, h: 800 },
	prepare: async ({ page, walk }) => {
		// the new talk, made before filming starts: New presentation, the agent's side shut again so the slides have room
		await walk([
			{ click: '[data-side-close="right"]', ms: 50 },
			{ click: { selector: '[aria-label="Pages tree"]', dy: 200 }, button: "right", ms: 50 },
			{ click: "text=New presentation", ms: 50 },
			{ wait: 2500 },
			{ click: '[data-side-close="right"]', ms: 50 },
			{ move: { x: 760, y: 620 }, ms: 50 },
			{ wait: 1500 },
		]);
		// a page cannot take the screen without a press of its own, and a filmed window has no screen to take: the
		// slides fill the window instead, as they fill the screen
		await page.evaluate(() =>
			Object.defineProperty(document.documentElement, "requestFullscreen", { value: undefined, configurable: true }),
		);
	},
	live: async ({ walk }) => {
		await walk([
			{ wait: 700 },
			{ click: "[data-present-split] >> text=Present", ms: 700 },
			{ wait: 2000 },
			{ press: "ArrowRight" },
			{ wait: 1500 },
			{ press: "ArrowRight" },
			{ wait: 1500 },
			{ move: '[aria-label="The talk"] >> text=End', ms: 700 },
			{ wait: 600 },
			{ click: '[aria-label="The talk"] >> text=End', ms: 200 },
			{ wait: 1600 },
		]);
	},
} satisfies Clip;
