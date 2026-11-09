import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.50.0, knobs: a frame's own values in the properties rail, tuned by hand while it runs */
export default {
	kit: ["ore"],
	files: {
		"design/frames/ore-pick/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/ore-pick/frame.tsx": `import { Ore } from "shared/kit/ore/ore";

export default function Frame() {
	return <Ore screen="pick" onNext={() => {}} />;
}
`,
	},
	viewport: { w: 1120, h: 700 },
	steps: [
		{ wait: 600 },
		{ click: { selector: '[aria-label="clip canvas"] >> text=ore-pick', dy: 140 } },
		{ wait: 2000 },
		{ click: "text=radius" },
		{ wait: 500 },
		{ drag: ".cursor-nwse-resize", by: { dx: -24, dy: -24 }, ms: 900 },
		{ wait: 250 },
		{ drag: ".cursor-nwse-resize", by: { dx: 16, dy: 16 }, ms: 1100 },
		{ wait: 400 },
		{ click: "text=accent" },
		{ wait: 400 },
		{ click: '[aria-label="#d9a441"]' },
		{ wait: 800 },
		{ click: '[aria-label="#8a6cf0"]' },
		{ wait: 1300 },
	],
} satisfies Clip;
