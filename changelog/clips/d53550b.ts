import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, the agent's trail: the top right names the frame the agent is writing, and following it walks the canvas there */
const frame = (title: string, line: string, bg: string, ink: string) => `export default function Screen() {
	return (
		<div style={{ display: "grid", alignContent: "center", gap: 12, height: "100%", padding: 32, background: "${bg}", color: "${ink}", fontFamily: "system-ui" }}>
			<h1 style={{ margin: 0, fontSize: 34 }}>${title}</h1>
			<p style={{ margin: 0, fontSize: 18, opacity: 0.75 }}>${line}</p>
			<div style={{ height: 48, borderRadius: 12, background: "${ink}", opacity: 0.9 }} />
		</div>
	);
}
`;
const box = (at: number) => JSON.stringify({ x: 80 + at * 440, y: 80, w: 390, h: 520 });

export default {
	files: {
		"design/frames/home/frame.json": box(0),
		"design/frames/home/frame.tsx": frame("Kaffe", "Fresh beans every Friday", "#efe6da", "#5a3a22"),
	},
	viewport: { w: 960, h: 600 },
	agent: {
		steps: [
			{ wait: 500 },
			{
				write: "design/frames/cart/frame.tsx",
				json: box(3),
				content: frame("Varukorg", "Two bags, 418 kr", "#f3e3d3", "#7a3416"),
				ms: 1800,
			},
			{ wait: 300 },
			{
				write: "design/frames/pay/frame.tsx",
				json: box(4),
				content: frame("Betala", "Swish or card", "#f6ebe0", "#7a3416"),
				ms: 1600,
			},
			{ wait: 300 },
			{
				write: "design/frames/done/frame.tsx",
				json: box(5),
				content: frame("Klart", "Your order is on its way", "#e3efe2", "#24502b"),
				ms: 1600,
			},
			{ say: "Added cart, pay and done." },
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
		await page.locator("[data-agent-rail] textarea").fill("add the checkout: cart, pay, done");
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
			{ click: '[data-agent-trail-row="cart"]', ms: 500 },
			{ wait: 1400 },
		]);
	},
} satisfies Clip;
