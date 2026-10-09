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
 * The agent's companion on the canvas while it changes a frame, end to end (#214, #366).
 *
 * Four seams meet here and each is unit-tested on its own: the daemon's witness says the
 * frame changed and which lines, the transcript folds that into where the agent is, the
 * frame's shim turns the write's range into a box, and the layer puts the square on it.
 * What only a browser can say is that they are one chain — that a write the agent lands
 * really does bring its square to the block it changed, on the frame showing it, without
 * anybody clicking anything.
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

/** the two numbers of a CSS `translate(xpx, ypx)` */
const numbersIn = (transform: string | null): [number, number] => {
	const [x, y] = (transform ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
	return [x ?? Number.NaN, y ?? Number.NaN];
};
const OLD = '<p id="hours">open until six</p>';
const NEW = '<p id="hours">closed sundays</p>';

it("brings the square to the block a write changed, on the frame showing it", { timeout: 180_000 }, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();

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

	// the fixture agent is the agent this machine has, so the `which` behind the wall has
	// to say so too: left to the runner's own PATH the rail draws the install wall, whose
	// composer is dead, and nothing below can be typed into (#201)
	const project = await serveProject({
		uiDir,
		agentExecutor: executor,
		agentLook: () => true,
	});
	root = project.root;
	writeFrame(project.root, "home", BEFORE);
	// wide enough to hold a document at rest: below LIVE_MIN_CSS_PX a frame is a stored
	// photograph, and nothing located can be drawn on one
	writeDesignFile(project.root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	// the agent alone at 420, the width these layouts are read at
	await seedAgentWidth(page, 420);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const hours = page.frameLocator('iframe[title="home"]').locator("#hours");
	const says = () => hours.textContent().catch(() => null);

	// the frame is live before anybody types: the design it is about to change is on screen
	await expect.poll(says, { timeout: 30_000 }).toBe("open until six");

	// properties have the panel until the agent's glyph in the strip is pressed
	await page.locator('[data-rail-icon="agent"]').click();
	const field = page.locator("[data-agent-rail] textarea");
	await field.fill(PROMPT);
	await field.press("Enter");

	// the companion: the agent is at this frame, and the canvas says so on it
	const square = page.locator('[data-agent-companion="main"][data-frame="home"]');
	await expect.poll(() => square.count(), { timeout: 30_000 }).toBe(1);

	// and the ring: the block that changed, measured by the document showing it, with the
	// square hopped to its corner. Nothing here computed a box from the file
	const ring = page.locator("[data-companion-ring]");
	await ring.waitFor({ state: "attached", timeout: 30_000 });
	const ringed = await ring.boundingBox();
	const changed = await hours.boundingBox();
	expect(ringed).not.toBeNull();
	expect(changed).not.toBeNull();
	const middle = (box: { y: number; height: number } | null) => (box?.y ?? 0) + (box?.height ?? 0) / 2;
	// the ring is on the paragraph the write rewrote, and not on the heading above it.
	// Its centre rather than its edges, because it is drawn out of the square at 96%
	expect(Math.abs(middle(ringed) - middle(changed))).toBeLessThan(3);
	const centre = (box: { x: number; width: number } | null) => (box?.x ?? 0) + (box?.width ?? 0) / 2;
	expect(Math.abs(centre(ringed) - centre(changed))).toBeLessThan(3);
	// and it is the block's own size, give or take the stand-off and the 96% it grows from
	expect(Math.abs((ringed?.width ?? 0) - (changed?.width ?? 0))).toBeLessThan(0.06 * (changed?.width ?? 0));
	expect(ringed?.height ?? 0).toBeLessThan((changed?.height ?? 0) + 8);
	await expect.poll(() => square.getAttribute("data-act")).toBe("edit");

	// the square is fixed to its frame: the camera moving moves both by the same amount,
	// on the same frame it moves, once whatever it was doing has settled
	const bead = square.locator(":scope > div").last();
	const at = () => bead.evaluate((element) => (element as HTMLElement).style.transform);
	const iframe = () => page.locator('iframe[title="home"]').boundingBox();
	await page.waitForTimeout(2000);
	const was = await at();
	const stood = await iframe();
	await page.mouse.move(700, 450);
	await page.mouse.wheel(120, 80);
	await expect.poll(async () => (await iframe())?.x).not.toBe(stood?.x);
	const moved = await iframe();
	const [wasX, wasY] = numbersIn(was);
	const [nowX, nowY] = numbersIn(await at());
	expect(nowX - wasX).toBeCloseTo((moved?.x ?? 0) - (stood?.x ?? 0), 0);
	expect(nowY - wasY).toBeCloseTo((moved?.y ?? 0) - (stood?.y ?? 0), 0);

	// the frame really did take the write, so the mark is about something that happened
	expect(await says()).toBe("closed sundays");
});
