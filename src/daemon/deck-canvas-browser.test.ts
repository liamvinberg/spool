import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, pagePointOf, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const slide = (words: string) => `export default function Slide() {
	return <main style={{ width: "100%", height: "100%", background: "#111", color: "#eee" }}>${words}</main>;
}
`;

// spool#265: on a deck page the canvas's own snapping stands down, and a frame let go sends the deck's change
it("trades a loose frame into the talk on a deck page, and undoes it on the one stack", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	const places = { a: { x: 0, y: 0 }, b: { x: 1440, y: 0 }, x: { x: 0, y: 1360 } };
	for (const [folder, at] of Object.entries(places)) {
		writeFrame(project.root, `talk/${folder}`, slide(folder));
		writeDesignFile(project.root, `frames/talk/${folder}/frame.json`, JSON.stringify({ ...at, w: 1280, h: 720 }));
	}
	const deckFile = join(project.root, "design", "frames", "talk", "deck.json");
	writeDesignFile(
		project.root,
		"frames/talk/deck.json",
		JSON.stringify({ version: 1, w: 1280, h: 720, slides: ["a", "b"] }),
	);
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 60, y: 200, k: 0.25 } } }),
	);
	const slides = () => (JSON.parse(readFileSync(deckFile, "utf8")) as { slides: string[] }).slides;

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	await expect.poll(() => page.locator('[data-slide-number="2"]').textContent()).toBe("2");

	// the loose frame's middle, held over the middle of the second slide
	const from = await pagePointOf(page, { x: 640, y: 1360 + 360 });
	const to = await pagePointOf(page, { x: 1440 + 640, y: 360 });
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 12 });
	await page.locator("[data-deck-landing]").waitFor();
	await page.mouse.up();
	await expect.poll(slides).toEqual(["a", "x"]);
	// the answer is in once the frame's label numbers it, and with it the undo entry
	await page.locator('[data-frame-label="talk/x"] [data-slide-number="2"]').waitFor();
	// a slide's size is the talk's: no resize handles on it
	expect(await page.locator("[data-handle]").count()).toBe(0);

	await page.keyboard.press("Control+z");
	await expect.poll(slides).toEqual(["a", "b"]);
});
