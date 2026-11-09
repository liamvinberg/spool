import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";
import { hookToken } from "../../src/outside/install";

/**
 * 0.54.0, agents in your terminal: Claude Code at work in a terminal off screen shows on the canvas,
 * its line at the top right and its hand on the frames it reads and writes, and once done what it said and changed
 */
const lope = (screen: string, next: string) => `import { ui } from "spool";
import { Lope } from "shared/kit/lope/lope";

export default function Frame() {
	return <Lope screen="${screen}" onNext={(patch) => ui.go("${next}", patch)} />;
}
`;
// phones at their real size; done is written to the right of the two there are
const box = (at: number) => JSON.stringify({ x: 80 + at * 470, y: 80, w: 390, h: 844 });

const TASKS = ["Read the run screen", "Write the done screen", "Walk the run to done"];

export default {
	kit: ["lope"],
	files: {
		"design/frames/start/frame.json": box(0),
		"design/frames/start/frame.tsx": lope("start", "run"),
		"design/frames/run/frame.json": box(1),
		"design/frames/run/frame.tsx": lope("run", "start"),
	},
	viewport: { w: 960, h: 600 },
	// the canvas alone, moved left so the frame the agent writes lands in view
	prepare: async ({ page }) => {
		const shut = async (side: string) => {
			const close = page.locator(`[aria-label="Close the ${side} side"]`);
			if (await close.isVisible()) await close.click();
			await page.waitForTimeout(300);
		};
		await shut("right");
		await shut("left");
		// fitted to the two there are, then moved left by half a frame's step, so the three sit centred once done is in
		await page.mouse.move(480, 340);
		await page.keyboard.press("Shift+1");
		await page.waitForTimeout(800);
		const label = (name: string) =>
			page.locator('[aria-label="clip canvas"]').getByText(name, { exact: true }).first();
		const x = async (name: string) => (await label(name).boundingBox())?.x ?? 0;
		const target = (await x("start")) - ((await x("run")) - (await x("start"))) / 2;
		for (let i = 0; i < 60 && (await x("start")) > target; i++) {
			await page.mouse.wheel(4, 0);
			await page.waitForTimeout(20);
		}
		// the pointer off the frames, so none stands hovered as filming starts
		await page.mouse.move(880, 480);
		await page.waitForTimeout(1200);
	},
	// what Claude Code's hooks would tell spool, one event at a time, while it works on the project's files
	live: async ({ page, port, root, walk }) => {
		const token = hookToken(join(dirname(root), "state"));
		const frame = (name: string) => join(root, "design/frames", name, "frame.tsx");
		const hook = async (event: string, more: Record<string, unknown> = {}) => {
			const response = await fetch(`http://127.0.0.1:${port}/api/hook/claude`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-spool-hook": token, "x-spool-term": "ghostty" },
				body: JSON.stringify({ session_id: "clip", cwd: root, hook_event_name: event, ...more }),
			});
			if (response.status !== 204) throw new Error(`hook ${event}: ${response.status}`);
		};
		const tool = async (name: string, input: Record<string, unknown>, ms: number, act?: () => void) => {
			await hook("PreToolUse", { tool_name: name, tool_input: input });
			await page.waitForTimeout(ms);
			act?.();
			await hook("PostToolUse", { tool_name: name, tool_input: input });
		};
		const todos = (done: number) =>
			tool(
				"TodoWrite",
				{
					todos: TASKS.map((content, at) => ({
						content,
						status: at < done ? "completed" : at === done ? "in_progress" : "pending",
					})),
				},
				80,
			);

		await walk([{ wait: 700 }]);
		await hook("UserPromptSubmit", { prompt: "add a done screen after the run" });
		await page.waitForTimeout(900);
		await todos(0);
		await page.waitForTimeout(300);
		await tool("Read", { file_path: frame("run") }, 1100);
		await todos(1);
		await page.waitForTimeout(300);
		await tool("Write", { file_path: frame("done") }, 1400, () => {
			mkdirSync(join(root, "design/frames/done"), { recursive: true });
			writeFileSync(join(root, "design/frames/done/frame.json"), box(2));
			writeFileSync(frame("done"), lope("done", "start"));
		});
		await page.waitForTimeout(800);
		await todos(2);
		await tool("Edit", { file_path: frame("run") }, 1000, () => writeFileSync(frame("run"), lope("run", "done")));
		await todos(3);
		await page.waitForTimeout(300);
		await hook("Stop", {
			last_assistant_message: "Added **done** after the run, and Finish on the run now walks to it.",
		});
		await page.locator('[data-outside-state="done"]').waitFor({ timeout: 10_000 });
		await walk([
			{ wait: 600 },
			{ click: '[data-outside-state="done"] button', ms: 700 },
			{ wait: 1500 },
			{ move: '[data-outside-changed="done"]', ms: 500 },
			{ wait: 1600 },
		]);
	},
} satisfies Clip;
