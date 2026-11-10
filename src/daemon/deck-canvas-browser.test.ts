import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, pagePointOf, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const slide = (words: string) => `export default function Slide() {
	return <main style={{ width: "100%", height: "100%", background: "#111", color: "#eee" }}>${words}</main>;
}
`;

/**
 * spool#265's canvas flow, one walk: New presentation, a loose frame into the talk, a trade, one taken out, from the
 * canvas and from the Pages rail alike, each one undo, and a note written from Properties. On a deck page the canvas's
 * own snapping stands down and a frame let go sends the deck's change; a row let go in the rail sends the same one.
 */
it("walks a talk from New presentation through the canvas, the Pages rail and Properties, each change one undo", {
	timeout: 240_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	const file = (...path: string[]) => join(project.root, "design", "frames", "presentation", ...path);
	const read = (...path: string[]) => {
		try {
			return readFileSync(file(...path), "utf8");
		} catch {
			return null;
		}
	};
	const slides = () => (JSON.parse(read("deck.json") ?? "{}") as { slides?: string[] }).slides;
	// the camera the new page opens on, so its slides are where the drags below aim
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ pageCameras: { presentation: { x: 60, y: 200, k: 0.25 } } }),
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.getByRole("button", { name: "Pages options" }).click();
	await page.getByRole("menuitem", { name: "New presentation" }).click();

	// the starter, made whole, opened, and the agent asked what it is about
	await page.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	await expect.poll(slides).toEqual(["title", "statement", "live", "number", "close"]);
	await expect
		.poll(() => page.evaluate(() => document.activeElement?.getAttribute("placeholder")))
		.toBe("What's the talk about?");
	const said = read("statement", "notes.md");
	expect(said).not.toBeNull();

	// a frame written onto the page lands loose, under the talk's hairline
	writeFrame(project.root, "presentation/x", slide("x"));
	const rows = page.locator('[role="tree"] button[aria-label$=" frame"]');
	const names = () =>
		rows.evaluateAll((all) => all.map((row) => row.getAttribute("aria-label")?.replace(/ frame$/, "")));
	await expect.poll(names).toEqual(["title", "statement", "live", "number", "close", "x"]);
	await expect.poll(() => read("x", "frame.json")).not.toBeNull();

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
	/** carry the row named `name` in the Pages rail to `y` on the page, and let go */
	const carry = async (name: string, y: () => Promise<number>) => {
		const row = await page.getByRole("button", { name: `${name} frame` }).boundingBox();
		if (row === null) throw new Error(`no row ${name}`);
		await page.mouse.move(row.x + 60, row.y + row.height / 2);
		await page.mouse.down();
		const to = await y();
		// the rail's drag follows the pointer a frame at a time, so the pointer goes a step a frame
		for (let step = 1; step <= 12; step++) {
			await page.mouse.move(row.x + 60, row.y + row.height / 2 + ((to - row.y - row.height / 2) * step) / 12);
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
		}
		await page.locator("[data-insertion-line]").waitFor();
		const answered = page.waitForResponse((response) => response.url().endsWith("/deck"));
		await page.mouse.up();
		await answered;
	};
	const hairline = async () => {
		const line = await page.locator("[data-deck-hairline]").boundingBox();
		if (line === null) throw new Error("no hairline");
		return line;
	};

	// the loose frame, onto the middle of the second slide: they trade, and the place's notes stay with the place
	await drag({ x: 640, y: 1360 + 360 }, { x: 1440 + 640, y: 360 });
	await expect.poll(slides).toEqual(["title", "x", "live", "number", "close"]);
	expect(read("x", "notes.md")).toBe(said);
	await page.locator('[data-frame-label="presentation/x"] [data-slide-number="2"]').waitFor();
	// a slide's size is the talk's: no resize handles on it
	expect(await page.locator("[data-handle]").count()).toBe(0);

	// the first slide, dragged down off the band into the empty cell beside statement: it leaves the talk
	await drag({ x: 640, y: 360 }, { x: 1440 + 640, y: 1360 + 360 });
	await expect.poll(slides).toEqual(["x", "live", "number", "close"]);
	await expect.poll(names).toEqual(["x", "live", "number", "close", "statement", "title"]);

	// in the rail: a loose row carried over the hairline to the top of the talk joins it there
	await carry(
		"statement",
		async () => ((await page.getByRole("button", { name: "x frame" }).boundingBox())?.y ?? 0) + 3,
	);
	await expect.poll(slides).toEqual(["statement", "x", "live", "number", "close"]);
	// and a slide carried under the hairline leaves it
	await carry("close", async () => {
		const line = await hairline();
		return line.y + line.height - 2;
	});
	await expect.poll(slides).toEqual(["statement", "x", "live", "number"]);
	// its row stands among the loose frames as its cell does on the page, down each column in turn
	await expect.poll(names).toEqual(["statement", "x", "live", "number", "title", "close"]);

	await page.keyboard.press("Control+z");
	await expect.poll(slides).toEqual(["statement", "x", "live", "number", "close"]);
	await page.keyboard.press("Control+z");
	await expect.poll(slides).toEqual(["x", "live", "number", "close"]);

	// a slide's notes in Properties: one field a beat, named by the beat, written when it is left, one undo
	await page.getByRole("button", { name: "number frame" }).click();
	await page.getByRole("tab", { name: "Properties" }).click();
	await expect.poll(() => page.locator("[data-deck-size]").textContent()).toContain("all slides");
	const meaning = page.getByLabel("Notes for number, meaning");
	await expect.poll(() => meaning.inputValue()).toBe("Then what it means.");
	await meaning.fill("Let it sit.");
	const wrote = page.waitForResponse((response) => response.url().endsWith("/deck"));
	await page.getByLabel("Notes for number, number").focus();
	await wrote;
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nLet it sit.\n");
	await page.getByLabel("Notes for number, number").blur();
	await page.keyboard.press("Control+z");
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nThen what it means.\n");
});
