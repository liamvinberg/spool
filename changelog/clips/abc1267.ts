import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.55.0, decks: New presentation makes a talk of five slides, and a double click steps through it on the canvas */
const ore = (screen: string, next: string) => `import { ui } from "spool";
import { Ore } from "shared/kit/ore/ore";

export default function Frame() {
	return <Ore screen="${screen}" onNext={() => ui.go("${next}")} />;
}
`;
const screens = ["pick", "limits", "shipped"];

export default {
	kit: ["ore"],
	settings: { "experimental.deck": true },
	files: Object.fromEntries(
		screens.flatMap((screen, at) => [
			[`design/frames/ore/${screen}/frame.json`, JSON.stringify({ x: 80 + at * 440, y: 80, w: 390, h: 844 })],
			[`design/frames/ore/${screen}/frame.tsx`, ore(screen, screens[(at + 1) % screens.length] as string)],
		]),
	),
	steps: [
		{ wait: 900 },
		{ click: { selector: '[aria-label="Pages tree"]', dy: 200 }, button: "right" },
		{ wait: 500 },
		{ click: "text=New presentation" },
		{ wait: 2600 },
		{ click: '[data-frame-shell="presentation/title"]', double: true },
		{ wait: 1800 },
		{ press: "ArrowRight" },
		{ wait: 1300 },
		{ press: "ArrowRight" },
		{ wait: 1500 },
		{ press: "ArrowRight" },
		{ wait: 1300 },
		{ press: "Escape" },
		{ wait: 1400 },
	],
} satisfies Clip;
