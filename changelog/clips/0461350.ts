import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, finder on the path: the magnifier at the end of the page path opens the finder, which finds a frame by the words on it */
const dill = (screen: string, next: string) => `import { ui } from "spool";
import { Dill } from "shared/kit/dill/dill";

export default function Frame() {
	return <Dill screen="${screen}" onNext={() => ui.go("${next}")} />;
}
`;
const sway = (screen: string, next: string) => `import { ui } from "spool";
import { Sway } from "shared/kit/sway/sway";

export default function Frame() {
	return <Sway screen="${screen}" onNext={(patch) => ui.go("${next}", patch)} />;
}
`;
const tern = (screen: string) => `import { ui } from "spool";
import { Tern } from "shared/kit/tern/tern";

export default function Frame() {
	return <Tern screen="${screen}" onGo={(to, patch) => ui.go(\`tern-\${to}\`, patch)} />;
}
`;

/** a page of three phone frames, side by side at their real size */
const screens: [path: string, at: number, source: string][] = [
	["cooking/dill-recipe", 0, dill("recipe", "dill-step")],
	["cooking/dill-step", 1, dill("step", "dill-done")],
	["cooking/dill-done", 2, dill("done", "dill-recipe")],
	["class/sway-class", 0, sway("class", "sway-play")],
	["class/sway-play", 1, sway("play", "sway-done")],
	["class/sway-done", 2, sway("done", "sway-class")],
	["check-in/tern-flight", 0, tern("flight")],
	["check-in/tern-seat", 1, tern("seat")],
	["check-in/tern-pass", 2, tern("pass")],
];

export default {
	kit: ["dill", "sway", "tern"],
	files: Object.fromEntries(
		screens.flatMap(([path, at, source]) => [
			[`design/frames/${path}/frame.json`, JSON.stringify({ x: 80 + at * 470, y: 80, w: 390, h: 844 })],
			[`design/frames/${path}/frame.tsx`, source],
		]),
	),
	viewport: { w: 900, h: 760 },
	steps: [
		{ wait: 1000 },
		{ click: '[data-page-row="check-in"]', ms: 500 },
		{ wait: 2200 },
		{ move: '[aria-label="Path"]', ms: 700 },
		{ wait: 500 },
		{ move: "[data-find-door]", ms: 500 },
		{ wait: 700 },
		{ click: "[data-find-door]", ms: 200 },
		{ wait: 1300 },
		{ type: "crispy", perKeyMs: 160 },
		{ wait: 1500 },
		{ press: "Enter" },
		{ wait: 2000 },
	],
} satisfies Clip;
