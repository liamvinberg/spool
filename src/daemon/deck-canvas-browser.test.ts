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
it("trades a loose frame into the talk and takes a slide out on a deck page, each one undo", {
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
	writeDesignFile(project.root, "frames/talk/b/notes.md", "What b's place says.\n");
	const notesOf = (folder: string) => {
		try {
			return readFileSync(join(project.root, "design", "frames", "talk", folder, "notes.md"), "utf8");
		} catch {
			return null;
		}
	};
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

	/** hold the frame whose middle is at `from` and let go with its middle at `to`, in page pixels */
	const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
		const start = await pagePointOf(page, from);
		const end = await pagePointOf(page, to);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(end.x, end.y, { steps: 12 });
		await page.locator("[data-deck-landing]").waitFor();
		const answered = page.waitForResponse((response) => response.url().endsWith("/deck"));
		await page.mouse.up();
		await answered;
		// and its undo entry is in
		await page.locator("[data-deck-band]:not([data-deck-sending])").waitFor();
	};

	// the loose frame, onto the middle of the second slide: they trade, and the place's notes stay with the place
	await drag({ x: 640, y: 1360 + 360 }, { x: 1440 + 640, y: 360 });
	await expect.poll(slides).toEqual(["a", "x"]);
	expect(notesOf("x")).toBe("What b's place says.\n");
	await page.locator('[data-frame-label="talk/x"] [data-slide-number="2"]').waitFor();
	// a slide's size is the talk's: no resize handles on it
	expect(await page.locator("[data-handle]").count()).toBe(0);

	// the first slide, dragged down off the band into the empty cell beside b: it leaves the talk
	await drag({ x: 640, y: 360 }, { x: 1440 + 640, y: 1360 + 360 });
	await expect.poll(slides).toEqual(["x"]);
	await page.locator('[data-frame-label="talk/x"] [data-slide-number="1"]').waitFor();

	await page.keyboard.press("Control+z");
	await expect.poll(slides).toEqual(["a", "x"]);
	await page.locator('[data-frame-label="talk/a"] [data-slide-number="1"]').waitFor();
	await page.keyboard.press("Control+z");
	await expect.poll(slides).toEqual(["a", "b"]);
	await expect.poll(() => notesOf("b")).toBe("What b's place says.\n");
});
