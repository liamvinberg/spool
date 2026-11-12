import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.56.0, decks: a slide picked up lifts, and the slides around it move apart to open a gap where it will land */
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
	steps: [
		{ wait: 900 },
		{ click: '[data-side-close="right"]' },
		{ wait: 500 },
		{ click: { selector: '[aria-label="Pages tree"]', dy: 200 }, button: "right" },
		{ wait: 500 },
		{ click: "text=New presentation" },
		{ wait: 3000 },
		{ click: '[data-side-close="right"]' },
		{ wait: 1200 },
		{
			drag: { selector: '[data-frame-label="presentation/number"]', dy: 66 },
			by: { dx: -380, dy: -8 },
			ms: 2400,
		},
		{ wait: 2000 },
	],
} satisfies Clip;
