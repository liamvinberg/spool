import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { fixtureAgentExecutor, makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * What the canvas draws while the agent works a frame, end to end (#214).
 *
 * Four seams meet here and each is unit-tested on its own: the transcript carries the
 * write out, the daemon turns its strings into a line range, the frame's shim turns the
 * range into a box, and the layer draws on it. What only a browser can say is that they
 * are one chain — that a write the agent lands really does become a mark on the block it
 * changed, on the frame showing it, without anybody clicking anything.
 *
 * The agent here is a fixture that writes the file itself and then says it did, which is
 * the whole of what the real one does that this cares about: the pixels change because
 * the disk changed, and the wire is how the canvas learns which lines.
 */

const BEFORE = `export default function Home() {
	return (
		<main>
			<h1>kaffe</h1>
			<p id="hours">open until six</p>
		</main>
	);
}
`;

const PROMPT = "close on sundays";

/** the two numbers of an SVG `translate(x y)` */
const numbersIn = (transform: string | null): [number, number] => {
	const [x, y] = (transform ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
	return [x ?? Number.NaN, y ?? Number.NaN];
};
const OLD = '<p id="hours">open until six</p>';
const NEW = '<p id="hours">closed sundays</p>';

it("marks the block a write changed, on the frame showing it", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");

	let root = "";
	const id = "toolu_hand_1";
	/**
	 * The turn, at something like the pace of a real one.
	 *
	 * The beats matter and the wall-clock between them does not: a turn that opened, wrote
	 * and ended inside one animation frame would leave the canvas nothing to draw and
	 * prove nothing about a rail nobody can watch. So the call opens, the write lands, and
	 * only then does the turn end — which is the order every capture in `fixtures/` has.
	 */
	const { executor } = fixtureAgentExecutor((proc, line) => {
		// the turn, and not the probes the rail opens with: a login check spawns the same
		// binary, and a frame rewritten before anybody typed proves nothing
		if (!line.includes(PROMPT)) return;
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
		proc.emit(
			JSON.stringify({
				type: "assistant",
				message: {
					model: "claude-opus-5",
					id: "msg_1",
					type: "message",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id,
							name: "Edit",
							input: {
								file_path: join(root, "design/frames/home/frame.tsx"),
								old_string: OLD,
								new_string: NEW,
							},
						},
					],
				},
				session_id: "s",
				parent_tool_use_id: null,
			}),
		);
		setTimeout(() => {
			// the agent's own act, in the order the real one performs it: the file first,
			// because a plate is a fact about the pixels and they change when the disk does
			writeFrame(root, "home", BEFORE.replace(OLD, NEW));
			proc.emit(
				JSON.stringify({
					type: "user",
					message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content: "ok" }] },
					session_id: "s",
					parent_tool_use_id: null,
				}),
			);
		}, 1200);
	});

	const project = await serveProject({ uiDir, agentExecutor: executor });
	root = project.root;
	writeFrame(project.root, "home", BEFORE);
	// wide enough to hold a document at rest: below LIVE_MIN_CSS_PX a frame is a stored
	// photograph, and nothing located can be drawn on one
	writeDesignFile(project.root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const hours = page.frameLocator('iframe[title="home"]').locator("#hours");
	const says = () => hours.textContent().catch(() => null);
	const count = (selector: string) => page.locator(selector).count();

	// the frame is live before anybody types: the design it is about to change is on screen
	await expect.poll(says, { timeout: 30_000 }).toBe("open until six");

	const expand = page.getByRole("button", { name: "Expand agent" });
	if ((await expand.count()) > 0) await expand.click();
	const field = page.locator("[data-agent-rail] textarea");
	await field.fill(PROMPT);
	await field.press("Enter");

	// the presence: the agent is at this frame, and the canvas says so beside it
	await expect.poll(() => count('[data-hand-node="home"]'), { timeout: 30_000 }).toBe(1);

	// and the mark: the block that changed, plated, with its height on the wall. Both
	// are the document's own measurement of where those lines render, which is the whole
	// point — nothing here computed a box from the file
	const plate = page.locator('[data-hand-plate="home"]');
	await expect.poll(() => count('[data-hand-plate="home"]'), { timeout: 30_000 }).toBe(1);
	await expect.poll(() => count('[data-hand-lane="home"]')).toBe(1);

	const marked = await plate.boundingBox();
	const changed = await hours.boundingBox();
	expect(marked).not.toBeNull();
	expect(changed).not.toBeNull();
	const middle = (box: { y: number; height: number } | null) => (box?.y ?? 0) + (box?.height ?? 0) / 2;
	// the plate is on the paragraph the write rewrote, and not on the heading above it.
	// Its centre rather than its edges, because it is measured mid-gesture: a plate opens
	// from the block's own centre, so that is the point the whole 860ms agrees on
	expect(Math.abs(middle(marked) - middle(changed))).toBeLessThan(2);
	expect(Math.abs((marked?.x ?? 0) - (changed?.x ?? 0))).toBeLessThan(2);
	expect(Math.abs((marked?.width ?? 0) - (changed?.width ?? 0))).toBeLessThan(2);
	// and it is the block's own height, somewhere between the third it opens from and all
	// of it — never the heading's, and never the whole page's
	expect(marked?.height ?? 0).toBeGreaterThan(0.3 * (changed?.height ?? 0));
	expect(marked?.height ?? 0).toBeLessThan((changed?.height ?? 0) + 2);

	// the presence is fixed to the frame: the camera moving moves both by the same amount,
	// on the same frame it moves. Nothing here may ease into place — the thread's shape is
	// the one thing that eases, and where the frame is must never be inside it
	const wall = () => page.locator("[data-hand-wall]").getAttribute("transform");
	const iframe = () => page.locator('iframe[title="home"]').boundingBox();
	const walled = await wall();
	const stood = await iframe();
	await page.mouse.move(700, 450);
	await page.mouse.wheel(120, 80);
	await expect.poll(async () => (await iframe())?.x).not.toBe(stood?.x);
	const moved = await iframe();
	const [wasX, wasY] = numbersIn(walled);
	const [nowX, nowY] = numbersIn(await wall());
	expect(nowX - wasX).toBeCloseTo((moved?.x ?? 0) - (stood?.x ?? 0), 0);
	expect(nowY - wasY).toBeCloseTo((moved?.y ?? 0) - (stood?.y ?? 0), 0);

	// the frame really did take the write, so the mark is about something that happened
	expect(await says()).toBe("closed sundays");
});
