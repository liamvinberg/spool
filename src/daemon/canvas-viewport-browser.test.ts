import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

// The camera is the only thing that may move the canvas. The viewport box holds
// a frame layer thousands of pixels tall, so were it a scroll container the
// browser would scroll it on its own to reveal whatever a frame document
// focuses — stranding the canvas chrome and offsetting every pointer
// coordinate from the camera's by that scroll.

const plain = (label: string) => `export default function Frame() {
	return <div>${label}</div>;
}
`;

// what an agent writes all the time: a search field that takes focus on mount
const autoFocused = `export default function Frame() {
	return (
		<div>
			<input autoFocus placeholder="search" />
		</div>
	);
}
`;

it("never scrolls the canvas viewport when a frame below the fold takes focus", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "at-camera", plain("at camera"));
	writeDesignFile(project.root, "frames/at-camera/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	// mounted, because the lifecycle warms past the fold, but not on screen
	writeFrame(project.root, "below-fold", autoFocused);
	writeDesignFile(project.root, "frames/below-fold/frame.json", '{ "x": 0, "y": 1000, "w": 800, "h": 700 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const viewport = page.locator('[role="application"]');
	const tools = page.getByRole("toolbar", { name: "canvas tools" });
	const toolsTop = async () => (await tools.boundingBox())?.y ?? Number.NaN;
	const scroll = () => viewport.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
	/** Settled once the off-screen document has really taken the focus. */
	const focused = (placeholder: string) =>
		expect
			.poll(() =>
				page
					.frameLocator('iframe[title="below-fold"]')
					.getByPlaceholder(placeholder)
					.evaluate((el) => el.ownerDocument.activeElement === el),
			)
			.toBe(true);

	await focused("search");
	const resting = await toolsTop();
	// the frame layer really does overflow: without that this proves nothing
	expect(await viewport.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	expect(await scroll()).toEqual({ top: 0, left: 0 });

	// a tab out of the canvas lands inside a frame document, the same reveal
	await viewport.press("Tab");
	expect(await scroll()).toEqual({ top: 0, left: 0 });

	// and the agent keeps editing: every rewrite remounts and refocuses
	writeFrame(project.root, "below-fold", autoFocused.replace("search", "search again"));
	await focused("search again");
	expect(await scroll()).toEqual({ top: 0, left: 0 });
	expect(await toolsTop()).toBe(resting);
});
