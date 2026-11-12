import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../../test-browser";
import { builtUi, serveProject, writeDesignFile } from "../../test-helpers";
import {
	explainFrame,
	picturesOf,
	pixelsOf,
	recordScreen,
	stretched,
	stripes,
	watchPictures,
} from "./stage-browser.test-helpers";

/**
 * Present on one display (spool#298): the slide grows from its card until it fills spool's window, made full screen,
 * and flies home to it at the end. Read off the frames the browser composited, by where each slide's colour stands.
 */

type Rgb = readonly [number, number, number];

const ONE: Rgb = [29, 53, 87];
const PICTURE: Rgb = [231, 111, 81];
const TWO: Rgb = [42, 157, 143];
const THREE: Rgb = [233, 196, 106];

const W = 1280;
const H = 720;

/**
 * A small talk: a first slide that boots slowly, for its picture comes slowly, one of two beats, which has no picture
 * to fly as but the live slide, and a live one.
 */
function writeTalk(root: string): void {
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	const hex = (colour: Rgb) => `#${colour.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
	writeDesignFile(root, "frames/talk/deck.json", json({ version: 1, w: W, h: H, slides: ["one", "two", "three"] }));
	const slide = (name: string, index: number, source: string) => {
		writeDesignFile(root, `frames/talk/${name}/frame.tsx`, source);
		writeDesignFile(root, `frames/talk/${name}/frame.json`, json({ x: index * 1440, y: 0, w: W, h: H }));
	};
	writeFileSync(join(root, "design/frames/talk/picture.png"), stripes(600, 400, [...PICTURE], [...PICTURE]));
	slide(
		"one",
		0,
		`import picture from "../picture.png";

export default function Slide() {
	return (
		<div style={{ position: "absolute", inset: 0, background: "${hex(ONE)}" }}>
			<img src={picture} alt="" style={{ position: "absolute", left: 340, top: 160, width: 600, height: 400 }} />
		</div>
	);
}
`,
	);
	slide(
		"two",
		1,
		`import { ui } from "spool";

export default function Slide() {
	ui.beats(["said", "shown"]);
	return <div style={{ position: "absolute", inset: 0, background: "${hex(TWO)}" }} />;
}
`,
	);
	slide(
		"three",
		2,
		`import { ui } from "spool";

export default function Slide() {
	ui.live();
	return <div style={{ position: "absolute", inset: 0, background: "${hex(THREE)}" }} />;
}
`,
	);
}

/** Within `slack` of each other, channel by channel. */
const near = (a: Rgb | undefined, b: Rgb, slack = 6) =>
	a?.every((channel, at) => Math.abs(channel - (b[at] ?? 0)) <= slack) === true;

/** Every other pixel of the window, to find a colour by. */
const GRID = Array.from({ length: (W / 2) * (H / 2) }, (_, at) => ({
	x: (at % (W / 2)) * 2,
	y: Math.floor(at / (W / 2)) * 2,
}));

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Where a colour stands on a frame as a body: the box around the rows and columns it fills a few pixels of, so a
 * stray pixel of it in an icon's edge is not counted; null when it is nowhere.
 */
function boxOf(png: Buffer, colour: Rgb): Box | null {
	const rows = new Map<number, number>();
	const columns = new Map<number, number>();
	pixelsOf(png, GRID).forEach((seen, at) => {
		if (!near(seen, colour)) return;
		const { x, y } = GRID[at] ?? { x: 0, y: 0 };
		rows.set(y, (rows.get(y) ?? 0) + 1);
		columns.set(x, (columns.get(x) ?? 0) + 1);
	});
	// the longest run of rows, and of columns, a few pixels of it fill
	const body = (counts: Map<number, number>): [number, number] | null => {
		const filled = [...counts].filter(([, count]) => count >= 4).map(([at]) => at);
		filled.sort((a, b) => a - b);
		let best: [number, number] | null = null;
		let from = 0;
		for (let at = 0; at < filled.length; at++) {
			if (at > 0 && (filled[at] ?? 0) - (filled[at - 1] ?? 0) > 4) from = at;
			const run: [number, number] = [filled[from] ?? 0, filled[at] ?? 0];
			if (best === null || run[1] - run[0] > best[1] - best[0]) best = run;
		}
		return best;
	};
	const ys = body(rows);
	const xs = body(columns);
	if (ys === null || xs === null) return null;
	return { x: xs[0], y: ys[0], w: xs[1] - xs[0] + 2, h: ys[1] - ys[0] + 2 };
}

/** The first slide, whole, in `box`: its ground about its picture, and the picture where the slide puts it. */
function oneIn(png: Buffer, box: Box): boolean {
	const at = (x: number, y: number) => ({
		x: Math.round(box.x + (x / W) * box.w),
		y: Math.round(box.y + (y / H) * box.h),
	});
	const [ground, picture] = pixelsOf(png, [at(160, 360), at(640, 360)]);
	return near(ground, ONE, 10) && near(picture, PICTURE, 10);
}

/** Which way a run of widths went, each time it turned: +1 growing, -1 shrinking. */
function turns(widths: readonly number[]): number[] {
	const way: number[] = [];
	for (let at = 1; at < widths.length; at++) {
		const step = (widths[at] ?? 0) - (widths[at - 1] ?? 0);
		if (Math.abs(step) <= 2) continue;
		const sign = Math.sign(step);
		if (way.at(-1) !== sign) way.push(sign);
	}
	return way;
}

const same = (a: Box | null, b: Box | null, slack = 4) =>
	a !== null &&
	b !== null &&
	Math.abs(a.x - b.x) <= slack &&
	Math.abs(a.y - b.y) <= slack &&
	Math.abs(a.w - b.w) <= slack &&
	Math.abs(a.h - b.h) <= slack;

const FULL: Box = { x: 0, y: 0, w: W, h: H };

/** Where the screen is read while the slides fill it, and what each slide puts there. */
const POINTS = [
	{ x: 160, y: 360 },
	{ x: 640, y: 360 },
	{ x: 640, y: 710 },
];
const LOOKS: Record<string, readonly Rgb[]> = {
	one: [ONE, PICTURE, ONE],
	two: [TWO, TWO, TWO],
	three: [THREE, THREE, THREE],
};

/** Whether each document in the window hides the pointer, as the stage's host asks of it. */
const cursors = (view: Page) =>
	Promise.all(
		view
			.frames()
			.map((frame) =>
				frame.evaluate(() => document.documentElement.dataset.spoolStageCursor ?? "shown").catch(() => "gone"),
			),
	);

/**
 * Full screen as a browser gives it, without a headless browser's own idea of the screen's size: asked for only in a
 * press the page has not spent on anything else, and left, each said to the page as the browser says it.
 */
async function fullScreenAsABrowserGivesIt(context: BrowserContext, { grows = false } = {}): Promise<void> {
	await context.addInitScript((grows) => {
		let full: Element | null = null;
		const asked: string[] = [];
		const said = () => document.dispatchEvent(new Event("fullscreenchange"));
		Object.defineProperty(window, "__fullScreen", { value: asked });
		Object.defineProperty(document, "fullscreenElement", { get: () => full });
		Element.prototype.requestFullscreen = function (this: Element) {
			if (!navigator.userActivation.isActive) return Promise.reject(new TypeError("no press"));
			asked.push("on");
			const enter = () => {
				full = this;
				said();
			};
			if (!grows) {
				enter();
				return Promise.resolve();
			}
			// a window that grows to cover the screen says it is full screen once the page has its new size
			return new Promise<void>((done) =>
				addEventListener(
					"resize",
					() => {
						enter();
						done();
					},
					{ once: true },
				),
			);
		};
		Document.prototype.exitFullscreen = () => {
			asked.push("off");
			full = null;
			said();
			return Promise.resolve();
		};
	}, grows);
}

/** What the page asked of full screen, in order: "on" and "off". */
const fullScreenAsked = (view: Page) =>
	view.evaluate(() => (window as unknown as { __fullScreen: string[] }).__fullScreen);

const phaseOf = (view: Page) =>
	view.evaluate(() => document.querySelector("[data-present-slides]")?.getAttribute("data-present-slides") ?? null);

it("presents on one display: the slide grows from its card into a full screen, turns round mid-flight either way, steps, and flies home, with no blank frame, no picture swapped back and no jump", {
	timeout: 240_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	writeTalk(project.root);
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.08 } } }),
	);
	const context = await browser.newContext({ viewport: { width: W, height: H } });
	await fullScreenAsABrowserGivesIt(context);
	// the first slide's picture comes to the window's stage only when the test lets it: the slide boots slowly there,
	// while the canvas has its own picture of it
	let release = () => {};
	const slow = new Promise<void>((done) => {
		release = done;
	});
	await context.route("**/asset/**", async (route) => {
		await slow;
		await route.continue();
	});
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	// the canvas draws the first slide's card
	await expect.poll(async () => boxOf(await view.screenshot(), PICTURE), { timeout: 30_000 }).not.toBeNull();
	const card = boxOf(await view.screenshot(), ONE);
	expect(card).not.toBeNull();
	if (card === null) return;

	const cards = { one: card, three: boxOf(await view.screenshot(), THREE) };

	const screen = await recordScreen(view);
	// ⇧⌘↵ presents from the first slide: it sets off as the canvas's picture of it, its live stage still waiting on
	// its picture; Esc on the way turns it round, and Present on the way home turns it round again
	await view.keyboard.press("ControlOrMeta+Shift+Enter");
	await expect.poll(() => phaseOf(view)).toBe("in");
	await view.waitForTimeout(120);
	await view.keyboard.press("Escape");
	await expect.poll(() => phaseOf(view)).toBe("home");
	// the window keeps the screen while the slide flies home: it lets go only once the slide is there
	expect(await fullScreenAsked(view)).toEqual(["on"]);
	await view.waitForTimeout(160);
	await view.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(() => phaseOf(view)).toBe("on");
	// the live slide is drawn at last, and takes over from the picture
	release();
	await expect
		.poll(() =>
			view.evaluate(() => (document.querySelector("[data-present-live]") as HTMLElement | null)?.style.opacity),
		)
		.toBe("1");
	await view.waitForTimeout(300);
	// → steps to the next slide, through its beats, and the next
	await view.keyboard.press("ArrowRight");
	await view.waitForTimeout(500);
	await view.keyboard.press("ArrowRight");
	await view.waitForTimeout(300);
	await view.keyboard.press("ArrowRight");
	// on a live slide the pointer is the slide's: nothing lies over it to take a click, and it hides with the bar
	await expect.poll(() => view.locator("[data-present-clear]").count()).toBe(0);
	expect(await cursors(view)).toContain("hidden");
	// and ← back to one that is not live, where a click is the next beat
	await view.keyboard.press("ArrowLeft");
	await view.locator("[data-present-clear]").waitFor();
	await view.waitForTimeout(300);
	// a hand that moves wakes the bar, and the pointer with it; the bar's End ends the talk: the slide flies home
	await view.mouse.move(600, 400);
	await view.mouse.move(640, 420);
	await view.locator('[data-present-bar="awake"]').waitFor();
	await expect.poll(() => cursors(view)).not.toContain("hidden");
	await view.getByRole("button", { name: "End" }).click();
	await view.locator("[data-present-slides]").waitFor({ state: "detached" });
	await view.waitForTimeout(300);
	const frames = await screen.stop();
	const ones = frames.map((png) => boxOf(png, ONE));
	const twos = frames.map((png) => boxOf(png, TWO));

	// the window asked for full screen in the press, kept it while the slide turned round on its way home, and left it
	// once the slide was home
	expect(await fullScreenAsked(view)).toEqual(["on", "off"]);

	// the way in, out and in again: from the frame it left its card until it filled the screen, every frame shows the
	// first slide whole, never blank and never another picture of it, and it moved one way at a time, turning only
	// when told: out, back, out
	const left = ones.findIndex((box) => !same(box, card));
	const filled = ones.findIndex((box) => same(box, FULL, 0));
	expect(left).toBeGreaterThan(-1);
	expect(filled).toBeGreaterThan(left);
	for (let at = left; at <= filled; at++) {
		const box = ones[at] ?? null;
		expect(box, `frame ${at}`).not.toBeNull();
		if (box !== null) expect(oneIn(frames[at] as Buffer, box), `frame ${at}`).toBe(true);
	}
	expect(turns(widthsOf(ones.slice(0, filled + 1)))).toEqual([1, -1, 1]);

	// filling the screen, the slides: the first whole until it is stepped from, the live slide taking over from its
	// picture in place, then one slide or two dissolving in every frame, nothing of the canvas and no blank between,
	// until the one the talk ended on sets off home
	const flewFrom = twos.findIndex((box, at) => at > filled && box !== null && box.w < W);
	expect(flewFrom).toBeGreaterThan(filled);
	const read = frames.slice(filled, flewFrom).map((png) => explainFrame(pixelsOf(png, POINTS), LOOKS));
	for (const [at, seen] of read.entries()) expect(seen, `frame ${filled + at}`).toBeDefined();
	const shown = read.map((seen) => (seen === undefined ? "" : seen.mix < 0.5 ? seen.from : seen.to));
	expect(shown.filter((name, at) => name !== shown[at - 1])).toEqual(["one", "two", "three", "two"]);

	// home: the second slide shrinks to its card in one go, and the card is there under it as it lets go, never a
	// frame without the slide or its card; the canvas is as it was
	for (const [at, box] of twos.slice(flewFrom).entries()) expect(box, `frame ${flewFrom + at}`).not.toBeNull();
	expect(turns(widthsOf(twos.slice(flewFrom)))).toEqual([-1]);
	expect(twos.at(-1)).toEqual(boxOf(await view.screenshot(), TWO));
	expect(boxOf(frames.at(-1) as Buffer, THREE)).toEqual(cards.three);
	await expect
		.poll(async () => {
			const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
				headers: { "X-Spool-Control": project.controlToken },
			});
			const body = (await response.json()) as { selection?: { frame: string }[] };
			return body.selection?.map((one) => one.frame);
		})
		.toEqual(["talk/two"]);

	// the slide held a moment is readied out of sight, and let go of, goes with it
	await view.locator('[data-present-slides="warm"]').waitFor({ state: "attached" });
	await view.keyboard.press("Escape");
	await view.locator("[data-present-slides]").waitFor({ state: "detached" });
	// held again, the stage is drawn under Present; a press still reaches Present, and sets off at once from what the
	// stage drew
	const home = twos.at(-1);
	if (home === null || home === undefined) return;
	await view.mouse.click(home.x + home.w / 2, home.y + home.h / 2);
	const present = view.getByRole("button", { name: "Present", exact: true });
	await expect
		.poll(() =>
			view.evaluate(
				() => (document.querySelector('[data-present-slides="warm"] iframe') as HTMLElement | null)?.style.opacity,
			),
		)
		.toBe("1");
	await present.click({ timeout: 5_000 });
	await expect.poll(() => phaseOf(view)).toBe("on");
	// a talk after the first turns round on its way home as the first did
	await view.keyboard.press("Escape");
	await expect.poll(() => phaseOf(view)).toBe("home");
	await view.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(() => phaseOf(view)).toBe("on");
	// a browser leaving full screen by itself, as Esc does where the page cannot hold it, ends the talk
	await view.evaluate(() => document.exitFullscreen());
	await view.locator("[data-present-slides]").waitFor({ state: "detached" });
});

const widthsOf = (boxes: readonly (Box | null)[]) => boxes.map((box) => box?.w ?? 0);

it("with two displays in a browser, the caret's Full screen opens the room's window in the press, fills the page with the slides, and is made full screen by a click", {
	timeout: 120_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	writeTalk(project.root);
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.08 } } }),
	);
	const context = await browser.newContext({ viewport: { width: W, height: H } });
	await fullScreenAsABrowserGivesIt(context);
	await context.addInitScript(() => Object.defineProperty(window.screen, "isExtended", { value: true }));
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });

	// the press opens the room's window, and the slides fill the page: the press is spent on the window
	const room = context.waitForEvent("page");
	await view.getByRole("button", { name: "Ways to present" }).click();
	await view.getByRole("menuitemradio", { name: /Full screen/ }).click();
	await room;
	await expect.poll(() => phaseOf(view)).toBe("on");
	expect(await fullScreenAsked(view)).toEqual([]);
	// a click on the slides makes the window full screen, and does nothing else: the first slide is still up
	await view.mouse.click(W / 2, H / 2);
	expect(await fullScreenAsked(view)).toEqual(["on"]);
	await view.waitForTimeout(400);
	const [ground] = pixelsOf(await view.screenshot(), [{ x: 160, y: 360 }]);
	expect(near(ground, ONE, 10)).toBe(true);
	// and the next click is the talk's
	await view.mouse.click(W / 2, H / 2);
	await expect.poll(async () => near(pixelsOf(await view.screenshot(), [{ x: 160, y: 360 }])[0], TWO, 10)).toBe(true);
});

it("waits on its card while the window grows to cover the screen, and sets off once it has", {
	timeout: 120_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	writeTalk(project.root);
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.08 } } }),
	);
	const screen = { width: W + 160, height: H + 90 };
	const context = await browser.newContext({ viewport: { width: W, height: H }, screen });
	await fullScreenAsABrowserGivesIt(context, { grows: true });
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });

	// a window changing size draws nothing: a slide that set off under it would show up half way there
	await view.keyboard.press("ControlOrMeta+Shift+Enter");
	await expect.poll(() => phaseOf(view)).toBe("waiting");
	await view.waitForTimeout(400);
	expect(await phaseOf(view)).toBe("waiting");
	await view.setViewportSize(screen);
	await expect.poll(() => phaseOf(view)).toMatch(/^(in|on)$/);
});

it("hands over from a slide's picture to the live slide at rest, so it never shows twice, and never leaves the picture stretched over it", {
	timeout: 120_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { deck: true } });
	// a slide whose box rises into place as it starts, as every slide of a new presentation does
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	const hex = (colour: Rgb) => `#${colour.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
	writeDesignFile(project.root, "frames/talk/deck.json", json({ version: 1, w: W, h: H, slides: ["rise", "two"] }));
	writeDesignFile(
		project.root,
		"frames/talk/rise/frame.tsx",
		`export default function Slide() {
	return (
		<div style={{ position: "absolute", inset: 0, background: "${hex(ONE)}" }}>
			<style>{"@keyframes rise { from { opacity: 0; transform: translateY(80px) } }"}</style>
			<div style={{ position: "absolute", left: 340, top: 160, width: 600, height: 400, background: "${hex(PICTURE)}", animation: "rise 900ms ease-out both" }} />
		</div>
	);
}
`,
	);
	writeDesignFile(project.root, "frames/talk/rise/frame.json", json({ x: 0, y: 0, w: W, h: H }));
	writeDesignFile(
		project.root,
		"frames/talk/two/frame.tsx",
		`export default function Slide() {
	return <div style={{ position: "absolute", inset: 0, background: "${hex(TWO)}" }} />;
}
`,
	);
	writeDesignFile(project.root, "frames/talk/two/frame.json", json({ x: 1440, y: 0, w: W, h: H }));
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ activePage: "talk", pageCameras: { talk: { x: 40, y: 120, k: 0.08 } } }),
	);
	const context = await browser.newContext({ viewport: { width: W, height: H } });
	await fullScreenAsABrowserGivesIt(context);
	await watchPictures(context);
	const view = await context.newPage();
	await view.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await view.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	await expect.poll(async () => boxOf(await view.screenshot(), PICTURE), { timeout: 30_000 }).not.toBeNull();

	// presented cold, nothing readied: the slide flies as its picture, and the live slide takes over in place
	const screen = await recordScreen(view);
	await view.keyboard.press("ControlOrMeta+Shift+Enter");
	await expect.poll(() => phaseOf(view)).toBe("on");
	await expect
		.poll(() =>
			view.evaluate(() => (document.querySelector("[data-present-live]") as HTMLElement | null)?.style.opacity),
		)
		.toBe("1");
	await view.waitForTimeout(400);
	const frames = await screen.stop();

	// from the frame it fills the screen, the slide stands whole and at rest in every frame: its box in place and
	// solid, never risen half way under its picture nor dimmed as one hands over to the other
	const filled = frames.findIndex((png) => same(boxOf(png, ONE), FULL, 0));
	expect(filled).toBeGreaterThan(-1);
	const points = [
		{ x: 160, y: 360 },
		{ x: 640, y: 170 },
		{ x: 640, y: 360 },
	];
	for (const [at, png] of frames.slice(filled).entries()) {
		const [ground, top, middle] = pixelsOf(png, points);
		expect(
			[ground, top, middle].map((seen, which) => near(seen, which === 0 ? ONE : PICTURE, 10)),
			`frame ${filled + at}`,
		).toEqual([true, true, true]);
	}
	// the picture is the canvas's, made for a card: from the frame the slide fills the screen it stands for the slide
	// only until the live slide is drawn, and goes then, not once an entrance the live slide has played
	const read = await picturesOf(view);
	expect(read.drawn).not.toBeNull();
	expect(stretched(read)).toEqual([]);
});
