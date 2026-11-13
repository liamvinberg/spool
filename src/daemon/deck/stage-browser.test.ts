import type { Frame, Page } from "playwright-core";
import { expect, it } from "vitest";
import type { StageSession } from "../../deck/stage-session";
import type { SlideReadiness, StageShown } from "../../deck/stage-wire";
import { testBrowser } from "../../test-browser";
import { serveProject, writeDesignFile } from "../../test-helpers";
import {
	GL_COLOUR,
	HARD_TALK,
	readScreen,
	recordScreen,
	serveHardTalkFiles,
	writeHardTalk,
} from "./stage-browser.test-helpers";

/**
 * The stage (spool#265, spool#269) over the hard talk, in a real browser at its plain play address: what only a browser
 * shows. The room's screen is read off every frame the browser composites, and each must be one slide whole or two
 * dissolving: never a blank, an unstyled slide, a missing picture, an error or a broken slide's own drawing. Each slide
 * notes, before its first frame is painted, whether its words were set in their own face and its picture had come.
 */

const talk = HARD_TALK.map((name) => `talk/${name}`);

/** What the stage says to its host, document by document, read off the private port as the host reads it. */
async function tapStage(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const heard: unknown[][] = [];
		(window as unknown as { __stage: unknown[][] }).__stage = heard;
		addEventListener(
			"message",
			(event) => {
				if ((event.data as { spool?: unknown } | null)?.spool !== "stage-connect") return;
				const said: unknown[] = [];
				heard.push(said);
				event.ports[0]?.addEventListener("message", (message) => said.push(message.data));
			},
			true,
		);
	});
}

type Said =
	| { spool: "stage-shown"; shown: StageShown }
	| { spool: "stage-slides"; slides: SlideReadiness[] }
	| { spool: "stage-session"; session: StageSession };

const said = (page: Page) =>
	page.evaluate(() => ((window as unknown as { __stage?: unknown[][] }).__stage ?? []) as Said[][]);
const shownBy = (messages: Said[] | undefined) =>
	(messages ?? []).flatMap((message) => (message.spool === "stage-shown" ? [message.shown] : []));
const sessionBy = (messages: Said[] | undefined) =>
	(messages ?? []).flatMap((message) => (message.spool === "stage-session" ? [message.session] : [])).at(-1);
const slidesBy = (messages: Said[] | undefined) =>
	(messages ?? []).flatMap((message) => (message.spool === "stage-slides" ? [message.slides] : [])).at(-1) ?? [];

/** The next command's outcome, from the newest document. */
async function nextShown(page: Page, act: () => Promise<void>): Promise<StageShown> {
	const before = shownBy((await said(page)).at(-1)).length;
	await act();
	let shown: StageShown | undefined;
	await expect
		.poll(
			async () => {
				shown = shownBy((await said(page)).at(-1))[before];
				return shown !== undefined;
			},
			{ timeout: 15_000 },
		)
		.toBe(true);
	if (shown === undefined) throw new Error("the stage said nothing");
	return shown;
}

/** Waits for the newest document to say a slide is in the state given. */
async function slideIs(page: Page, frame: string, status: SlideReadiness["status"]): Promise<SlideReadiness> {
	let found: SlideReadiness | undefined;
	await expect
		.poll(
			async () => {
				found = slidesBy((await said(page)).at(-1)).find((slide) => slide.frame === frame);
				return found?.status;
			},
			{ timeout: 30_000 },
		)
		.toBe(status);
	if (found === undefined) throw new Error(`no word of ${frame}`);
	return found;
}

/** The slides seen whole, in the order they were first seen. */
const wholeSlides = (read: readonly { from: string; to: string; mix: number }[]) => [
	...new Set(
		read
			.filter(({ from, to, mix }) => from === to || mix < 0.01 || mix > 0.99)
			.map(({ from, to, mix }) => (mix > 0.5 ? to : from)),
	),
];

/** The first pixel a WebGL slide put on ahead holds as it waits out of sight; null while it is not waiting. */
const waitingPixel = (page: Page, frame: string) =>
	stageFrame(page).evaluate((frame) => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			`[data-spool-stage-waiting][data-spool-stage-slide="${frame}"] canvas`,
		);
		const gl = canvas?.getContext("webgl");
		if (gl === null || gl === undefined) return null;
		const pixel = new Uint8Array(4);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return [...pixel];
	}, frame);

function stageFrame(page: Page): Frame {
	const frames = page.frames().filter((frame) => frame !== page.mainFrame());
	const frame = frames.at(-1);
	if (frame === undefined) throw new Error("no stage document");
	return frame;
}

interface Probe {
	name: string;
	width: number;
	image?: boolean;
}

/** The slide on screen was laid out, the moment it went on, as it is once every font is in, its picture there. */
async function cameWhole(page: Page, name: string): Promise<void> {
	const frame = stageFrame(page);
	await frame.waitForFunction(() => document.fonts.status === "loaded");
	const probe = await frame.evaluate((name) => {
		const probes = (window as unknown as { __probes?: Probe[] }).__probes ?? [];
		return probes.filter((entry) => entry.name === name).at(-1);
	}, name);
	expect(probe, `${name} noted nothing as it went on`).toBeDefined();
	const now = await frame.evaluate(
		(name) => document.querySelector<HTMLElement>(`[data-spool-stage-shown] [data-probe="${name}"]`)?.offsetWidth,
		name,
	);
	expect(probe?.width, `${name} went on in another face than its own`).toBe(now);
	if (probe?.image !== undefined) expect(probe.image, `${name} went on before its picture`).toBe(true);
}

async function openTalk(wait: (path: string) => Promise<unknown>) {
	const browser = await testBrowser();
	const project = await serveProject({ experiments: { deck: true } });
	writeHardTalk(project.root);
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	await serveHardTalkFiles(context, wait);
	const page = await context.newPage();
	await tapStage(page);
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?deck=talk`);
	// from the stage's own black on: the new tab's first paints are the browser's
	const screen = await recordScreen(page);
	await expect
		.poll(async () => shownBy((await said(page)).at(-1)).at(0)?.at, { timeout: 30_000 })
		.toEqual({
			slide: 0,
			beat: 0,
		});
	return { project, page, screen };
}

const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("plays the hard talk end to end: each step ready before its key and on in a frame, every frame a whole slide", {
	timeout: 240_000,
}, async () => {
	// a slow network: the talk's face takes most of a second, and each of its pictures longer
	const { page, screen } = await openTalk((path) => after(path.endsWith(".png") ? 2500 : 700));
	await cameWhole(page, "title");

	const steps: { slide: number; beat: number; broken?: true; probe?: string }[] = [
		{ slide: 1, beat: 0, probe: "photo" },
		{ slide: 2, beat: 0, probe: "words" },
		{ slide: 2, beat: 1 },
		{ slide: 2, beat: 2 },
		{ slide: 3, beat: 0 },
		{ slide: 4, beat: 0 },
		{ slide: 5, beat: 0 },
		// throws as it mounts, after drawing
		{ slide: 6, beat: 0, broken: true },
		{ slide: 7, beat: 0 },
		// throws on this beat, over its WebGL canvas
		{ slide: 7, beat: 1, broken: true },
		// never compiled
		{ slide: 8, beat: 0, broken: true },
		{ slide: 9, beat: 0, probe: "end" },
	];
	for (const step of steps) {
		const frame = talk[step.slide] ?? "";
		// the presenter waits for the slide to be ready, as the presenter view will show it; it gets there on its own
		if (step.beat === 0) await slideIs(page, frame, frame === "talk/no-compile" ? "broken" : "ready");
		// the WebGL slide is put on out of sight before its key, its first frame drawn there
		if (frame === "talk/gl") await expect.poll(() => waitingPixel(page, frame)).toEqual([...GL_COLOUR, 255]);
		const shown = await nextShown(page, () => page.keyboard.press("ArrowRight"));
		expect(shown.at).toEqual({ slide: step.slide, beat: step.beat });
		if (step.broken === undefined) {
			expect(shown, `${frame} beat ${step.beat}`).toMatchObject({ ready: true, held: false });
			expect(shown.frames, `${frame} beat ${step.beat} took ${shown.frames} frames`).toBeLessThanOrEqual(1);
		} else {
			expect(shown.held, `${frame} beat ${step.beat} was put on screen`).toBe(true);
		}
		if (step.probe !== undefined) await cameWhole(page, step.probe);
		if (frame === "talk/live") {
			// a live slide takes a click, what it writes to `ui.state` is the talk's, and the keys go on from inside it
			await stageFrame(page).locator("[data-spool-stage-shown] #more").click();
			await expect.poll(async () => sessionBy((await said(page)).at(-1))?.state).toEqual({ count: 1 });
		}
	}
	await after(1000);
	const read = readScreen(await screen.stop());

	// every slide that can show was seen whole, in the talk's order, and nothing else was
	expect(wholeSlides(read)).toEqual(["title", "photo", "words", "gl", "live", "tall", "beat-throws", "end"]);
	// a canvas sized by what it measures only ever measured its own size, waiting out of sight as on screen: never the
	// size the styles of the slide on screen would lay it out at
	const sizes = await stageFrame(page).evaluate(() => (window as unknown as { __glSizes?: string[] }).__glSizes ?? []);
	expect(new Set(sizes)).toEqual(new Set(["640x360"]));
	// each broken slide is named, and the one that broke on screen kept its picture, its WebGL canvas included
	const slides = slidesBy((await said(page)).at(-1));
	expect(slides.find((slide) => slide.frame === "talk/mount-throws")).toMatchObject({
		status: "broken",
		when: "mount",
	});
	expect(slides.find((slide) => slide.frame === "talk/beat-throws")).toMatchObject({
		status: "broken",
		when: "later",
		kept: "picture",
	});
	expect(slides.find((slide) => slide.frame === "talk/no-compile")).toMatchObject({
		status: "broken",
		when: "compile",
	});
});

it("holds the picture on screen through a jump to a slide that is not ready, and puts it on whole once it is", {
	timeout: 180_000,
}, async () => {
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const { page, screen } = await openTalk((path) => (path.endsWith("/end.png") ? held : Promise.resolve()));
	await slideIs(page, "talk/photo", "ready");

	// the last slide, by its number: its picture has not come
	await page.keyboard.press("1");
	await page.keyboard.press("0");
	await page.keyboard.press("Enter");
	await after(1500);
	expect(shownBy((await said(page)).at(-1))).toHaveLength(1);
	const waiting = screen.mark();

	const shown = await nextShown(page, async () => release());
	expect(shown).toMatchObject({ at: { slide: 9, beat: 0 }, ready: false, held: false });
	await cameWhole(page, "end");
	await after(1000);
	const frames = await screen.stop();
	const before = readScreen(frames.slice(0, waiting));
	expect(wholeSlides(before)).toEqual(["title"]);
	expect(wholeSlides(readScreen(frames))).toEqual(["title", "end"]);
});

it("takes a saved change without leaving the slide and beat, and keeps the picture while the change will not build", {
	timeout: 180_000,
}, async () => {
	const { project, page, screen } = await openTalk(() => Promise.resolve());
	for (const at of [
		{ slide: 1, beat: 0 },
		{ slide: 2, beat: 0 },
		{ slide: 2, beat: 1 },
	]) {
		if (at.beat === 0) await slideIs(page, talk[at.slide] ?? "", "ready");
		expect((await nextShown(page, () => page.keyboard.press("ArrowRight"))).at).toEqual(at);
	}
	const words = (text: string) => `import "./slide.css";
import { ui } from "spool";
import { useProbe } from "shared/probe";

export default function Slide() {
	const beat = ui.beats(["one", "two", "three"]);
	const probe = useProbe<HTMLSpanElement>("words");
	return (
		<div className="ground">
			<span ref={probe} className="words">${text} {beat.name}</span>
		</div>
	);
}
`;
	const documents = async () => (await said(page)).length;
	const onScreen = () =>
		stageFrame(page).evaluate(() => document.querySelector("[data-spool-stage-shown] [data-probe]")?.textContent);

	// a new build comes up behind the room's screen and takes it on the same beat
	writeDesignFile(project.root, "frames/talk/words/frame.tsx", words("Step"));
	await expect.poll(documents, { timeout: 30_000 }).toBe(2);
	await expect
		.poll(async () => shownBy((await said(page)).at(-1)).at(0)?.at, { timeout: 30_000 })
		.toEqual({ slide: 2, beat: 1 });
	await expect.poll(onScreen, { timeout: 10_000 }).toBe("Step two");
	await expect.poll(() => page.locator("iframe").count()).toBe(1);

	// a save that does not compile leaves the room on what it had
	writeDesignFile(
		project.root,
		"frames/talk/words/frame.tsx",
		"export default function Slide() {\n\treturn <div\n}\n",
	);
	await expect.poll(documents, { timeout: 30_000 }).toBe(3);
	await expect
		.poll(async () => shownBy((await said(page)).at(-1)).at(0), { timeout: 30_000 })
		.toMatchObject({ at: { slide: 2 }, held: true });
	expect(slidesBy((await said(page)).at(-1)).find((slide) => slide.frame === "talk/words")).toMatchObject({
		status: "broken",
		when: "compile",
	});
	// the next key moves the talk on in the new build, and the old picture goes
	expect((await nextShown(page, () => page.keyboard.press("ArrowRight"))).at).toEqual({ slide: 3, beat: 0 });
	await expect.poll(() => page.locator("iframe").count()).toBe(1);
	await after(1000);
	expect(wholeSlides(readScreen(await screen.stop()))).toEqual(["title", "photo", "words", "gl"]);
});
