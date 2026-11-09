import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.51.0, pages as lists: a page of pages is a list you walk into, and the path walks you back */
const pages: Record<string, { component: string; screens: string[]; prop: string }> = {
	ore: { component: "Ore", screens: ["pick", "limits", "shipped"], prop: "onNext" },
	kin: { component: "Kin", screens: ["amount", "confirm", "sent"], prop: "onNext" },
	headway: { component: "Headway", screens: ["departures", "trip", "ticket"], prop: "onGo" },
	dill: { component: "Dill", screens: ["recipe", "step", "done"], prop: "onNext" },
};

const frame = (
	product: string,
	component: string,
	screen: string,
	next: string,
	prop: string,
) => `import { ui } from "spool";
import { ${component} } from "shared/kit/${product}/${product}";

export default function Frame() {
	return <${component} screen="${screen}" ${prop}={() => ui.go("${next}")} />;
}
`;

export default {
	kit: Object.keys(pages),
	files: {
		// each page's screens in walk order, so its row's still is its first screen
		"design/canvas.json": JSON.stringify({
			format: 2,
			history: true,
			order: {
				pages: Object.keys(pages),
				frames: Object.fromEntries(Object.entries(pages).map(([product, { screens }]) => [product, screens])),
			},
		}),
		...Object.fromEntries(
			Object.entries(pages).flatMap(([product, { component, screens, prop }]) =>
				screens.flatMap((screen, at) => [
					[
						`design/frames/${product}/${screen}/frame.json`,
						JSON.stringify({ x: 80 + at * 440, y: 80, w: 390, h: 844 }),
					],
					[
						`design/frames/${product}/${screen}/frame.tsx`,
						frame(product, component, screen, screens[(at + 1) % screens.length] as string, prop),
					],
				]),
			),
		),
	},
	// narrow enough that the window folds its rails away and the list fills the clip
	viewport: { w: 800, h: 500 },
	steps: [
		{ wait: 1200 },
		{ move: '[data-page-row="kin"]', ms: 700 },
		{ wait: 400 },
		{ move: '[data-page-row="ore"]', ms: 500 },
		{ wait: 300 },
		{ press: " " },
		{ wait: 1600 },
		{ press: "Escape" },
		{ wait: 300 },
		{ click: '[data-page-row="ore"]', ms: 300 },
		{ wait: 2800 },
		{ move: '[aria-label="Path"]', ms: 700 },
		{ wait: 400 },
		{ click: '[data-path-kind="crumb"]', ms: 300 },
		{ wait: 1300 },
		// the clip ends a beat after the last input, so the hand settles back on the page it left
		{ move: '[data-page-row="ore"]', ms: 800 },
		{ wait: 700 },
	],
} satisfies Clip;
