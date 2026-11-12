import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, fixtureAgentExecutor, pagePointOf, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const slide = (words: string) => `export default function Slide() {
	return <main style={{ width: "100%", height: "100%", background: "#111", color: "#eee" }}>${words}</main>;
}
`;

/**
 * spool#265's canvas flow, one walk: New presentation, a loose frame into the talk, a trade, one taken out, from the
 * canvas and from the Pages rail alike, each one undo, and a note written from Properties. On a deck page the canvas's
 * own snapping stands down and a frame let go sends the deck's change; a row let go in the rail sends the same one.
 * Then into a slide, the talk played there on its own keys, and out again: by esc, by a row pressed in the rail, and
 * by the end of a talk presented from there. Last, an ordinary New page opens its page too.
 */
it("walks a talk from New presentation through the canvas, the Pages rail and Properties, each change one undo", {
	timeout: 240_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	// an agent to ask, as a machine with none installed shows how to get one instead of the composer
	const project = await serveProject({
		uiDir,
		experiments: { deck: true },
		agentExecutor: fixtureAgentExecutor().executor,
		agentLook: () => true,
	});
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

	/**
	 * hold the frame whose middle is at `from` and let go with its middle at `to`, in page pixels; `meanwhile` runs
	 * after letting go and before the answer is waited for
	 */
	const drag = async (
		from: { x: number; y: number },
		to: { x: number; y: number },
		meanwhile?: () => Promise<void>,
	) => {
		const start = await pagePointOf(page, from);
		const end = await pagePointOf(page, to);
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(end.x, end.y, { steps: 12 });
		await page.locator("[data-deck-landing]").waitFor();
		const answered = page.waitForResponse((response) => response.url().endsWith("/deck"));
		await page.mouse.up();
		await meanwhile?.();
		await answered;
		// and its undo entry is in
		await page.locator("[data-deck-band]:not([data-deck-sending])").waitFor();
	};
	/** carry the row named `name` in the Pages rail to `y` on the page, and let go */
	const carry = async (name: string, y: () => Promise<number>) => {
		// where the row rests: the rail may still be scrolling to the row held
		const box = () => page.getByRole("button", { name: `${name} frame` }).boundingBox();
		let row = await box();
		for (let last = null as typeof row; row === null || row.y !== last?.y; ) {
			last = row;
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
			row = await box();
		}
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

	// the first slide, dragged down off the band into the empty cell beside statement: it leaves the talk. Undone
	// while its answer is still on the way, the undo waits for it and takes that drop, never the trade before it
	let answer = () => {};
	const held = new Promise<void>((done) => {
		answer = done;
	});
	await page.route("**/deck", async (route) => {
		await held;
		await route.continue();
	});
	await drag({ x: 640, y: 360 }, { x: 1440 + 640, y: 1360 + 360 }, async () => {
		await page.locator("[data-deck-band][data-deck-sending]").waitFor();
		await page.keyboard.press("Control+z");
		answer();
	});
	await page.unroute("**/deck");
	await expect.poll(slides).toEqual(["title", "x", "live", "number", "close"]);
	await page.keyboard.press("Control+Shift+z");
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

	// a slide's notes in Properties: one field a beat, named by the beat, written when it is left by any route, one undo
	const notesOf = async () => {
		await page.getByRole("button", { name: "number frame" }).click();
		await page.getByRole("tab", { name: "Properties" }).click();
		const meaning = page.getByLabel("Notes for number, meaning");
		await expect.poll(() => meaning.inputValue()).toBe("Then what it means.");
		return meaning;
	};
	await (await notesOf()).fill("Let it sit.");
	await expect.poll(() => page.locator("[data-deck-size]").textContent()).toContain("all slides");
	await page.getByLabel("Notes for number, number").focus();
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nLet it sit.\n");
	await page.getByLabel("Notes for number, number").blur();
	await page.keyboard.press("Control+z");
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nThen what it means.\n");
	// a press out on the canvas, which also lets go of the slide
	await (await notesOf()).fill("Let it rest.");
	const field = await pagePointOf(page, { x: 2000, y: -600 });
	await page.mouse.click(field.x, field.y);
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nLet it rest.\n");
	await page.keyboard.press("Control+z");
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nThen what it means.\n");
	// a press that moves no focus, as an accessibility press does
	await (await notesOf()).fill("Let it hang.");
	await page.locator("[data-deck-notes]").evaluate((notes) => (notes as HTMLElement).click());
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nLet it hang.\n");
	await page.getByLabel("Notes for number, meaning").blur();
	await page.keyboard.press("Control+z");
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nThen what it means.\n");
	// and going into a slide, as below
	await (await notesOf()).fill("Let it land.");

	// into a slide: a double-click flies in and the talk plays there, on the slide's last beat
	const camera = () =>
		page.locator("[data-canvas-camera]").evaluate((element) => {
			const at = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(
				(element as HTMLElement).style.transform,
			);
			return at === null ? null : { x: Number(at[1]), y: Number(at[2]), k: Number(at[3]) };
		});
	const before = await camera();
	const into = await pagePointOf(page, { x: 1440 + 640, y: 360 });
	await page.mouse.dblclick(into.x, into.y);
	await page.locator('[data-deck-stage="presentation/live"][data-deck-stage-shown]').waitFor();
	await expect.poll(() => read("number", "notes.md")).toBe("Say the number.\n\nLet it land.\n");
	await page.locator('[data-live-chip="presentation/live"]').waitFor();
	// Space is the talk's next beat, not the Hand: on from live to number, the camera and selection with it
	await page.keyboard.press("Space");
	await page.locator('[data-deck-stage="presentation/number"][data-deck-stage-shown]').waitFor();
	await expect
		.poll(() => page.getByRole("button", { name: "number frame" }).getAttribute("aria-pressed"))
		.toBe("true");

	// out from a slide the talk moved on to: the same zoom and height, across that slide, which stays selected
	await page.keyboard.press("Escape");
	// a flight lands on its camera exactly, and the zoom only reaches the one it left from as it lands
	await expect.poll(async () => (await camera())?.k).toBe(before?.k);
	const out = await camera();
	expect(out?.y).toBeCloseTo(before?.y ?? 0, 6);
	const width = await page.locator("[data-canvas-camera]").evaluate((element) => element.parentElement?.clientWidth);
	expect((out?.x ?? 0) + (2 * 1440 + 640) * (out?.k ?? 0)).toBeCloseTo((width ?? 0) / 2, 3);
	expect(await page.getByRole("button", { name: "number frame" }).getAttribute("aria-pressed")).toBe("true");

	// and out from the slide gone into: the very camera it came from
	const back = await pagePointOf(page, { x: 2 * 1440 + 640, y: 360 });
	await page.mouse.dblclick(back.x, back.y);
	await page.locator('[data-deck-stage="presentation/number"][data-deck-stage-shown]').waitFor();
	await page.keyboard.press("Escape");
	await expect.poll(camera).toEqual(out);

	// a key pressed on the way in moves the talk once it is there, as it would inside
	await page.mouse.dblclick(back.x, back.y);
	await page.keyboard.press("Shift+ArrowLeft");
	await page.locator('[data-deck-stage="presentation/live"][data-deck-stage-shown]').waitFor();
	await page.keyboard.press("Shift+ArrowRight");
	await page.locator('[data-deck-stage="presentation/number"][data-deck-stage-shown]').waitFor();
	await page.keyboard.press("Escape");
	await expect.poll(camera).toEqual(out);

	// inside, ? lists the keys over the canvas with no room's among them, and esc puts the list away, still inside
	await page.mouse.dblclick(back.x, back.y);
	await page.locator('[data-deck-stage="presentation/number"][data-deck-stage-shown]').waitFor();
	await page.keyboard.press("?");
	const keyList = page.getByRole("dialog", { name: "Presenting keys" });
	await keyList.waitFor();
	expect(await keyList.getByRole("heading", { level: 3 }).allTextContents()).toEqual(["move", "jump", "live slide"]);
	await page.keyboard.press("Escape");
	await keyList.waitFor({ state: "detached" });
	// there is no room to black: B does nothing, and the next key moves the talk on
	await page.keyboard.press("b");
	await page.keyboard.press("ArrowRight");
	await page.locator('[data-deck-stage="presentation/close"][data-deck-stage-shown]').waitFor();
	// a row pressed in Pages comes out of the slide first, then is selected
	await page.getByRole("button", { name: "x frame" }).click();
	await page.locator("[data-deck-stage-shown]").waitFor({ state: "detached" });
	await expect.poll(() => page.getByRole("button", { name: "x frame" }).getAttribute("aria-pressed")).toBe("true");
	await expect.poll(async () => (await camera())?.k).toBe(out?.k);

	// presented from inside a slide and ended on it, the canvas comes back to the camera from before going in
	const outside = await camera();
	const from = await pagePointOf(page, { x: 3 * 1440 + 640, y: 360 });
	await page.mouse.dblclick(from.x, from.y);
	await page.locator('[data-deck-stage="presentation/close"][data-deck-stage-shown]').waitFor();
	// on one display the slides fill the screen, and end with Esc
	const presenting = () =>
		page.evaluate(
			() => document.querySelector("[data-present-slides]")?.getAttribute("data-present-slides") ?? "warm",
		);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(presenting).toBe("on");
	await page.keyboard.press("Escape");
	await expect.poll(presenting).toBe("warm");
	await expect.poll(camera).toEqual(outside);
	expect(await page.getByRole("button", { name: "close frame" }).getAttribute("aria-pressed")).toBe("true");

	// zoomed out until the slides are too small for their verbs, the selected slide's label still names it
	await page.setViewportSize({ width: 480, height: 900 });
	await page.keyboard.press("Shift+1");
	const named = page.locator('[data-frame-label="presentation/close"][data-away] [data-slide-number] + span');
	await expect.poll(() => named.evaluate((name) => name.getBoundingClientRect().width)).toBeGreaterThan(8);

	// back to a full window, an ordinary New page opens the page it makes, as New presentation does (spool#278)
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.getByRole("button", { name: "New page", exact: true }).click();
	await page.keyboard.type("aside");
	await page.keyboard.press("Enter");
	await page.locator('[data-path-page="aside"][data-path-kind="here"]').waitFor();
});
