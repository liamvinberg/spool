import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, the agent's trail: the top right names the frame the agent is writing, and following it walks the canvas there */
const lope = (screen: string, next: string) => `import { ui } from "spool";
import { Lope } from "shared/kit/lope/lope";

export default function Frame() {
	return <Lope screen="${screen}" onNext={(patch) => ui.go("${next}", patch)} />;
}
`;
const departures = `import { ui } from "spool";
import { Headway } from "shared/kit/headway/headway";

export default function Frame() {
	return <Headway screen="departures" onGo={() => undefined} />;
}
`;
// phones at their real size; the run's three sit off to the right, so following the trail walks the canvas there
const box = (at: number) => JSON.stringify({ x: 80 + at * 470, y: 80, w: 390, h: 844 });

export default {
	kit: ["headway", "lope"],
	files: {
		"design/frames/departures/frame.json": box(0),
		"design/frames/departures/frame.tsx": departures,
	},
	viewport: { w: 960, h: 600 },
	agent: {
		steps: [
			{ wait: 500 },
			{ write: "design/frames/start/frame.tsx", json: box(2), content: lope("start", "run"), ms: 1800 },
			{ wait: 300 },
			{ write: "design/frames/run/frame.tsx", json: box(3), content: lope("run", "done"), ms: 1600 },
			{ wait: 300 },
			{ write: "design/frames/done/frame.tsx", json: box(4), content: lope("done", "start"), ms: 1600 },
			{ say: "Added start, run and done." },
		],
	},
	// the window as someone has it while they ask: both sides shut by hand, the Agent pane open on the prompt
	prepare: async ({ page }) => {
		const shut = async (side: string) => {
			const close = page.locator(`[aria-label="Close the ${side} side"]`);
			if (await close.isVisible()) await close.click();
			await page.waitForTimeout(300);
		};
		await shut("right");
		await shut("left");
		await page.locator('[data-rail-icon="agent"]').click();
		await page.locator('[data-pane-tab="agent"]').click();
		await page.locator("[data-agent-rail] textarea").fill("add the run: start, run, done");
		await page.waitForTimeout(1500);
	},
	live: async ({ page, walk }) => {
		await walk([
			{ wait: 500 },
			{ click: "[data-agent-rail] textarea", ms: 500 },
			{ press: "Enter" },
			{ click: '[aria-label="Close the right side"]', ms: 500 },
			// off the corner, so the trail is seen coming up
			{ move: { x: 640, y: 260 }, ms: 500 },
		]);
		await page.locator('[data-agent-trail-button="writing"]').waitFor({ timeout: 15_000 });
		await walk([{ wait: 500 }, { click: '[data-agent-trail-button="writing"]', ms: 600 }]);
		await page.locator('[data-agent-trail-button="done"]').waitFor({ timeout: 30_000 });
		await walk([
			{ wait: 900 },
			{ click: '[data-agent-trail-button="done"]', ms: 400 },
			{ wait: 600 },
			{ click: '[data-agent-trail-row="start"]', ms: 500 },
			{ wait: 1400 },
		]);
	},
} satisfies Clip;
