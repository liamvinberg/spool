import { readFileSync } from "node:fs";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, Figma files: a .fig dropped on Home becomes a project, and the agent rebuilds its frames from what spool read */
const fig = readFileSync(new URL("../../src/fixtures/import/reading-list.fig", import.meta.url)).toString("base64");

/** the two frames the file holds, as the agent writes them from imports/reading-list/ */
const card = (lines: string) => `export default function Frame() {
	return (
		<div style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16, padding: "16px 32px", background: "#f3f4f6", fontFamily: "Inter, system-ui" }}>
${lines}
		</div>
	);
}
`;
const button = `			<a href="#saved" style={{ display: "flex", justifyContent: "center", padding: "20px 16px", borderRadius: 8, background: "#2457e6", color: "#fff", fontSize: 16, textDecoration: "none" }}>Keep reading</a>`;
const text = (words: string) =>
	`			<p style={{ margin: 0, fontSize: 16, lineHeight: "19px", color: "#151515" }}>${words}</p>`;

/** a file being dragged in from the Finder: its icon and name, carried under the hand */
const HELD = `<div style="display:grid;justify-items:center;gap:6px;margin:6px 0 0 -30px;opacity:.92">
	<div style="width:52px;height:64px;border-radius:6px;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45);display:grid;place-items:center">
		<svg width="22" height="33" viewBox="0 0 38 57"><path fill="#f24e1e" d="M19 0H9.5a9.5 9.5 0 0 0 0 19H19z"/><path fill="#ff7262" d="M19 0h9.5a9.5 9.5 0 0 1 0 19H19z"/><path fill="#a259ff" d="M19 19H9.5a9.5 9.5 0 0 0 0 19H19z"/><circle cx="28.5" cy="28.5" r="9.5" fill="#1abcfe"/><path fill="#0acf83" d="M9.5 38H19v9.5A9.5 9.5 0 1 1 9.5 38z"/></svg>
	</div>
	<div style="padding:2px 6px;border-radius:4px;background:#2563eb;color:#fff;font:500 11px system-ui;white-space:nowrap">Reading list.fig</div>
</div>`;

export default {
	files: {
		"design/frames/home/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 520 }),
		"design/frames/home/frame.tsx": `export default function Home() {
	return <div style={{ height: "100%", background: "#efe6da" }} />;
}
`,
	},
	viewport: { w: 1120, h: 700 },
	agent: {
		steps: [
			{ wait: 200 },
			{ say: "Two frames in the file. I'll rebuild both, the button walking to Saved." },
			{
				write: "design/frames/reading-list/frame.tsx",
				json: JSON.stringify({ x: 140, y: 40, w: 320, h: 170 }),
				content: card(`${button}\n${text("A longer story about making time for the books you want to read")}`),
				ms: 1000,
			},
			{ wait: 300 },
			{
				write: "design/frames/saved/frame.tsx",
				json: JSON.stringify({ x: 140, y: 270, w: 320, h: 150 }),
				content: card(`${text("Saved to your reading list")}\n${button}`),
				ms: 1600,
			},
			{ say: "Rebuilt Reading list and Saved from the Figma file." },
		],
	},
	prepare: async ({ page, walk }) => {
		// the left side shut by hand, as the new project's canvas will keep it, so its frames have room beside the agent
		const left = page.locator('[aria-label="Close the left side"]');
		if (await left.isVisible()) await left.click();
		await page.locator("text=Home").first().click();
		await page.waitForTimeout(1500);
		await walk([{ move: { x: -30, y: 380 }, ms: 50 }]);
		await page.waitForTimeout(1500);
	},
	live: async ({ page, walk }) => {
		const drag = (type: string, x: number, y: number) =>
			page.evaluate(
				async ({ type, x, y, fig }) => {
					const bytes = Uint8Array.from(atob(fig), (c) => c.charCodeAt(0));
					const data = new DataTransfer();
					data.items.add(new File([bytes], "Reading list.fig", { type: "" }));
					const at = document.elementFromPoint(x, y) ?? document.body;
					at.dispatchEvent(
						new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: data }),
					);
				},
				{ type, x, y, fig },
			);
		await page.evaluate((held) => {
			const element = document.createElement("div");
			element.dataset.clipHeld = "";
			// it starts where the hand waits, outside the window
			element.style.cssText =
				"position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;transform:translate(-30px,380px)";
			element.innerHTML = held;
			document.documentElement.append(element);
		}, HELD);
		await walk([{ wait: 300 }, { move: { x: 180, y: 360 }, ms: 500 }]);
		await drag("dragenter", 180, 360);
		await walk([{ move: { x: 560, y: 350 }, ms: 900 }, { wait: 500 }]);
		await drag("dragover", 560, 350);
		await page.evaluate(() => document.querySelector("[data-clip-held]")?.remove());
		await drag("drop", 560, 350);
		await page.locator('[data-agent-trail-button="done"]').waitFor({ timeout: 30_000 });
		await walk([{ wait: 2000 }]);
	},
} satisfies Clip;
