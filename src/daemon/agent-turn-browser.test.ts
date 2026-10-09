import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	fixtureAgentExecutor,
	seedAgentWidth,
	serveProject,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";

/**
 * A turn's grid and its companion in a real browser (#365, #366): what only a page can
 * say once the transcript, the rail and the canvas are wired together. The grid stands two
 * across while the turn runs and three once it is over; a companion left alone dims after
 * about two seconds; and a frame the turn deleted comes back from the rail's Put back.
 *
 * The agent is a fixture that does on disk what it says it did, in the order a real one
 * does it: the file first, then the result.
 */

const HOME = `export default function Home() {
	return <main><h1 id="title">kaffe</h1></main>;
}
`;
const CART = `export default function Cart() {
	return <main><h1>cart</h1></main>;
}
`;
const PROMPT = "make a cart and drop home";

it("runs a turn's grid two across, then three, dims an idle companion and puts a frame back", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();

	let root = "";
	/** the turn's last beat, held until the test has read what it needs mid-turn */
	let finish: (() => void) | null = null;
	const { executor } = fixtureAgentExecutor((proc, line) => {
		if (!line.includes(PROMPT)) return;
		const say = (content: unknown[], id: string) =>
			proc.emit(
				JSON.stringify({
					type: "assistant",
					message: { model: "claude-opus-5", id, type: "message", role: "assistant", content },
					session_id: "s",
					parent_tool_use_id: null,
				}),
			);
		const result = (id: string) =>
			proc.emit(
				JSON.stringify({
					type: "user",
					message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content: "ok" }] },
					session_id: "s",
					parent_tool_use_id: null,
				}),
			);
		proc.emit(
			JSON.stringify({
				type: "system",
				subtype: "init",
				cwd: root,
				session_id: "s",
				model: "claude-opus-5",
				tools: [],
			}),
		);
		const cartPath = join(root, "design/frames/cart/frame.tsx");
		say(
			[{ type: "tool_use", id: "toolu_write", name: "Write", input: { file_path: cartPath, content: CART } }],
			"msg_1",
		);
		setTimeout(() => {
			writeFrame(root, "cart", CART);
			writeDesignFile(root, "frames/cart/frame.json", '{ "x": 900, "y": 0, "w": 800, "h": 600 }\n');
			result("toolu_write");
			// then nothing for a while: the companion stands idle at the frame it wrote
			setTimeout(() => {
				say(
					[{ type: "tool_use", id: "toolu_rm", name: "Bash", input: { command: "rm -rf design/frames/home" } }],
					"msg_2",
				);
				rmSync(join(root, "design/frames/home"), { recursive: true });
				result("toolu_rm");
				finish = () => {
					say([{ type: "text", text: "Made the cart and dropped home." }], "msg_3");
					proc.emit(JSON.stringify({ type: "result", subtype: "success", result: "done", num_turns: 1 }));
				};
			}, 3500);
		}, 800);
	});

	const project = await serveProject({ uiDir, agentExecutor: executor, agentLook: () => true });
	root = project.root;
	writeFrame(project.root, "home", HOME);
	writeDesignFile(project.root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 40, y: 40, k: 0.5 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await seedAgentWidth(page, 420);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('iframe[title="home"]').waitFor({ timeout: 30_000 });

	await page.locator('[data-pane-toggle="agent"]').click();
	const field = page.locator("[data-agent-rail] textarea");
	await field.fill(PROMPT);
	await field.press("Enter");

	// the companion at the frame it wrote, full strength, then dimmed once left alone
	const square = page.locator('[data-agent-companion="main"][data-frame="cart"] [data-companion-square]');
	await square.waitFor({ state: "attached", timeout: 30_000 });
	const opacity = () => square.evaluate((element) => (element as HTMLElement).style.opacity).catch(() => null);
	await expect.poll(opacity, { timeout: 10_000 }).toBe("1");
	const idleFrom = Date.now();
	await expect.poll(opacity, { timeout: 10_000, interval: 100 }).toBe("0.45");
	// about two seconds, not at once
	expect(Date.now() - idleFrom).toBeGreaterThan(1200);

	// while the turn runs the grid is two across
	const grid = page.locator("[data-agent-rail] [data-agent-turn] [data-agent-tiles]").last();
	await page.locator('[data-agent-rail] [data-agent-tile="home"]').waitFor({ timeout: 30_000 });
	expect(await grid.getAttribute("class")).toContain("grid-cols-2");

	await expect.poll(() => finish !== null, { timeout: 10_000 }).toBe(true);
	(finish as (() => void) | null)?.();
	await page.locator('[data-agent-rail] [data-agent-turn="over"]').waitFor({ timeout: 30_000 });
	await expect.poll(() => grid.getAttribute("class")).toContain("grid-cols-3");

	// the frame the turn deleted comes back from the rail
	expect(existsSync(join(root, "design/frames/home/frame.tsx"))).toBe(false);
	await page.locator('[data-agent-rail] [data-agent-put-back="home"]').click();
	await expect.poll(() => existsSync(join(root, "design/frames/home/frame.tsx")), { timeout: 10_000 }).toBe(true);
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toBe(HOME);
	await page.locator('iframe[title="home"]').waitFor({ timeout: 30_000 });
});
