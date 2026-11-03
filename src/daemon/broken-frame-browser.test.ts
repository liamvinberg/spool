import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, fixtureAgentExecutor, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * A frame that stops compiling, as the canvas says it (#390): the photo booth
 * records why, the canvas draws the error over the frame's last picture and
 * marks its row, Ask agent to fix hands the error to a new thread, and the
 * mark goes the moment the frame is fixed.
 */

const GOOD = "export default function Frame() {\n\treturn <main>cart</main>;\n}\n";
const BAD =
	'import { PayButton } from "shared/ui/nowhere";\n\nexport default function Frame() {\n\treturn <PayButton />;\n}\n';

it("says a frame is broken, hands the error to the agent, and lets go once it is fixed", {
	timeout: 180_000,
}, async () => {
	const agent = fixtureAgentExecutor();
	const project = await serveProject({ uiDir: await builtUi(), agentExecutor: agent.executor, agentLook: () => true });
	const control = { "content-type": "application/json", "X-Spool-Control": project.controlToken };
	writeFrame(project.root, "cart", GOOD);
	writeDesignFile(project.root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 700 }\n');
	const state = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/state`, {
		method: "PUT",
		headers: control,
		body: JSON.stringify({ camera: { x: 40, y: 60, k: 1 } }),
	});
	expect(state.status).toBe(204);

	const page = await (await testBrowser()).newPage({ viewport: { width: 1440, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-frame-cover="cart"] img').waitFor({ state: "visible", timeout: 60_000 });

	writeFrame(project.root, "cart", BAD);
	const broken = page.locator('[data-broken-frame="cart"]');
	await broken.getByText("failed to compile").waitFor({ timeout: 60_000 });
	expect(await broken.textContent()).toContain("shared/ui/nowhere");
	// the last good picture stays under it
	expect(await page.locator('[data-frame-cover="cart"] img').isVisible()).toBe(true);

	const told = () => agent.spawned.flatMap((proc) => proc.inputs).join("\n");
	expect(told()).not.toContain("fails to compile");
	await broken.getByRole("button", { name: "Ask agent to fix" }).click();
	await expect
		.poll(told, { timeout: 30_000 })
		.toContain("The frame cart (design/frames/cart/frame.tsx) fails to compile");
	expect(told()).toContain("shared/ui/nowhere");

	writeFrame(project.root, "cart", GOOD);
	await expect.poll(() => broken.count(), { timeout: 60_000 }).toBe(0);
	expect(errors).toEqual([]);
});
