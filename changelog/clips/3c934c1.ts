import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.54.0, play fits the window: a phone taller than the window plays whole, shrunk, and the bar's middle switches to responsive and back */
const tern = (screen: string) => `import { ui } from "spool";
import { Tern } from "shared/kit/tern/tern";

export default function Frame() {
	return <Tern screen="${screen}" onGo={(to, patch) => ui.go(\`tern-\${to}\`, patch)} />;
}
`;

export default {
	kit: ["tern"],
	files: {
		"design/frames/tern-flight/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/tern-flight/frame.tsx": tern("flight"),
		"design/frames/tern-seat/frame.json": JSON.stringify({ x: 550, y: 80, w: 390, h: 844 }),
		"design/frames/tern-seat/frame.tsx": tern("seat"),
	},
	// a window shorter than the phone, so playing it is the case the change is for
	viewport: { w: 960, h: 600 },
	live: async ({ context, walk, film }) => {
		await walk([
			{ wait: 500 },
			{ move: { selector: '[aria-label="clip canvas"] >> text=tern-flight', dy: 120 }, ms: 700 },
			{ wait: 300 },
		]);
		const opened = context.waitForEvent("page");
		await walk([{ click: '[aria-label="Play tern-flight"]', ms: 500 }]);
		const played = await opened;
		await played.locator("iframe").first().waitFor({ timeout: 30_000 });
		await film(played);
		const fit = ".spool-bar-fit button";
		await played.locator(fit).waitFor({ timeout: 30_000 });
		await walk(
			[
				{ wait: 1400 },
				{ move: fit, ms: 700 },
				{ wait: 900 },
				{ click: fit, ms: 200 },
				{ wait: 1800 },
				{ click: fit, ms: 200 },
				{ wait: 1500 },
			],
			played,
		);
	},
} satisfies Clip;
