import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, pagePointOf, serveProject, writeDesignFile } from "../test-helpers";
import { pixelsOf, recordScreen } from "./deck/stage-browser.test-helpers";

type Rgb = readonly [number, number, number];

/** Each frame of the talk page, its colour, and where its sidecar puts it: three slides, two loose frames. */
const FRAMES: Record<string, { colour: Rgb; x: number; y: number }> = {
	a: { colour: [200, 60, 60], x: 0, y: 0 },
	b: { colour: [60, 160, 90], x: 1440, y: 0 },
	c: { colour: [60, 90, 200], x: 2880, y: 0 },
	x: { colour: [220, 190, 60], x: 0, y: 1360 },
	y: { colour: [150, 80, 170], x: 1440, y: 1360 },
};
const ZOOM = 0.16;

/** A box on screen, from its top left to its bottom right. */
interface Box {
	readonly from: { readonly x: number; readonly y: number };
	readonly to: { readonly x: number; readonly y: number };
}

/** What a drawn frame of the page shows, as the window samples it each frame. */
interface Sample {
	readonly t: number;
	/** each frame's label, by its folder: where it stands on screen */
	readonly labels: Record<string, readonly [number, number]>;
	/** the slides' numbers: which talk the preview shows */
	readonly numbers: string;
	readonly landing: boolean;
}

/**
 * spool#283: the deck holds still. A frame held on a deck page shows one preview while the hand is still or trembles
 * a few pixels, at most two per slide crossed at a steady pace, and pushes a loose frame down only once it is over
 * it; a drop and its undo each settle once, every frame going one way to its place; and no slide's picture blanks
 * on the way. Going into a slide and out again (spool#305) starts nothing of it under the flight and never loses its
 * picture. Every drawn frame is sampled in the window, and the screen is read from the browser's own frames.
 */
it("drags, drops, undoes and goes into a slide on a deck page without a preview flickering, a frame going back, a picture blanking or a slide starting under the flight", {
	timeout: 300_000,
}, async () => {
	const browser = await testBrowser();
	const project = await serveProject({ uiDir: await builtUi(), experiments: { deck: true } });
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	for (const [name, { colour, x, y }] of Object.entries(FRAMES)) {
		writeDesignFile(
			project.root,
			`frames/talk/${name}/frame.tsx`,
			`export default function Frame() {
	return <main style={{ width: "100%", height: "100%", background: "rgb(${colour.join(", ")})" }} />;
}
`,
		);
		writeDesignFile(project.root, `frames/talk/${name}/frame.json`, json({ x, y, w: 1280, h: 720 }));
	}
	writeDesignFile(
		project.root,
		"frames/talk/deck.json",
		json({ version: 1, w: 1280, h: 720, slides: ["a", "b", "c"] }),
	);
	// the camera the page opens on: the band from before the first slide to past the last, and the row under it
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ pageCameras: { talk: { x: 1500 * ZOOM, y: 500 * ZOOM, k: ZOOM } } }),
	);

	const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.getByRole("button", { name: /^talk, \d+ frames/ }).click();
	await page.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	const at = (world: { x: number; y: number }) => pagePointOf(page, world);
	const middle = (name: string) => {
		const frame = FRAMES[name];
		if (frame === undefined) throw new Error(`no frame ${name}`);
		return { x: frame.x + 640, y: frame.y + 360 };
	};
	/** a point inside each frame's picture, on screen, near its top left, where no frame carried below passes */
	const inside = async (name: string) => {
		const point = await at({ x: middle(name).x - 490, y: middle(name).y - 240 });
		return { x: Math.round(point.x), y: Math.round(point.y) };
	};
	const near = (colour: Rgb, want: Rgb) => colour.every((channel, i) => Math.abs(channel - (want[i] ?? 0)) <= 12);
	const shot = async () => page.screenshot();
	// every frame drawn in its colour before anything moves
	const points = await Promise.all(Object.keys(FRAMES).map(inside));
	await expect
		.poll(
			async () => {
				const colours = pixelsOf(await shot(), points);
				return Object.values(FRAMES).every((frame, i) => near(colours[i] as Rgb, frame.colour));
			},
			{ timeout: 60_000 },
		)
		.toBe(true);

	await page.evaluate(() => {
		const log: Sample[] = [];
		(window as unknown as { samples: Sample[] }).samples = log;
		const tick = (t: number) => {
			const labels: Record<string, [number, number]> = {};
			for (const label of document.querySelectorAll("[data-frame-label]")) {
				const box = label.getBoundingClientRect();
				labels[(label.getAttribute("data-frame-label") ?? "").replace(/^talk\//, "")] = [box.x, box.y];
			}
			const numbers = [...document.querySelectorAll("[data-slide-number]")]
				.map((number) => {
					const of = number.closest("[data-frame-label]")?.getAttribute("data-frame-label") ?? "";
					return `${of.replace(/^talk\//, "")}:${number.getAttribute("data-slide-number")}`;
				})
				.sort()
				.join(" ");
			log.push({ t, labels, numbers, landing: document.querySelector("[data-deck-landing]") !== null });
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const now = () => page.evaluate(() => performance.now());
	const samples = async (from: number, to = Number.POSITIVE_INFINITY) =>
		(await page.evaluate(() => (window as unknown as { samples: Sample[] }).samples)).filter(
			(sample) => sample.t >= from && sample.t <= to,
		);
	const frame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
	/** the pointer from where it is to `to`, a step a drawn frame */
	let pointer = { x: 0, y: 0 };
	const glide = async (to: { x: number; y: number }, steps: number) => {
		const from = pointer;
		for (let step = 1; step <= steps; step++) {
			pointer = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
			await page.mouse.move(pointer.x, pointer.y);
			await frame();
		}
	};
	const press = async (world: { x: number; y: number }) => {
		pointer = await at(world);
		await page.mouse.move(pointer.x, pointer.y);
		await page.mouse.down();
	};
	/** the previews shown in order, each told by the slides' numbers */
	const previews = (stretch: readonly Sample[]) =>
		stretch.map((sample) => sample.numbers).filter((numbers, i, all) => i === 0 || numbers !== all[i - 1]);
	/** each frame that turned back on its way, with where: one way to its place is all a settling frame may go */
	const turns = (stretch: readonly Sample[]) => {
		const back: string[] = [];
		for (const name of Object.keys(FRAMES)) {
			const track = stretch.map((sample) => sample.labels[name]).filter((point) => point !== undefined);
			for (const axis of [0, 1] as const) {
				let way = 0;
				for (let i = 1; i < track.length; i++) {
					const step = (track[i]?.[axis] ?? 0) - (track[i - 1]?.[axis] ?? 0);
					if (Math.abs(step) < 0.5) continue;
					if (way !== 0 && Math.sign(step) !== way) back.push(`${name} ${axis === 0 ? "x" : "y"} at ${i}`);
					way = Math.sign(step);
				}
			}
		}
		return back;
	};
	/** until every frame of the page has stood still for twenty drawn frames */
	const settled = async () => {
		let last = "";
		for (let still = 0; still < 20; ) {
			await frame();
			const latest = await page.evaluate(() =>
				JSON.stringify((window as unknown as { samples: Sample[] }).samples.at(-1)?.labels),
			);
			still = latest === last ? still + 1 : 0;
			last = latest;
		}
	};
	const screen = await recordScreen(page);
	const a = await inside("a");

	// x lifted and carried up into the band, its middle on the edge of b's left fifth, held still there, then trembling
	await press(middle("x"));
	await glide(await at({ x: 1440 + 256, y: 360 }), 30);
	await page.waitForTimeout(400);
	const trembling = await now();
	const rest = pointer;
	for (let i = 0; i < 30; i++) {
		pointer = { x: rest.x + (i % 2 === 0 ? 2 : -2), y: rest.y + ((i % 3) - 1) };
		await page.mouse.move(pointer.x, pointer.y);
		await frame();
	}
	expect(previews(await samples(trembling)), "a still or trembling hand changes the preview").toHaveLength(1);

	// on across b and c at a steady pace, into the end of the talk: at most two previews a slide crossed
	const crossing = await now();
	await glide(await at({ x: 4400, y: 360 }), 90);
	expect(previews(await samples(crossing)).length - 1).toBeLessThanOrEqual(2 * 2);

	// back onto c, off its middle, and let go: they trade, and from the release every frame goes one way to its place
	await glide(await at({ x: middle("c").x + 300, y: middle("c").y + 150 }), 30);
	await page.waitForTimeout(300);
	const answered = page.waitForResponse((response) => response.url().endsWith("/deck"));
	const dropped = await now();
	await page.mouse.up();
	await answered;
	await settled();
	const drop = await samples(dropped);
	expect(turns(drop), "a frame went back after the drop").toEqual([]);
	expect(drop.at(-1)?.numbers).toBe("a:1 b:2 x:3");
	expect(drop.slice(3).some((sample) => sample.landing)).toBe(false);

	// y carried toward c's cell, where c went: in the gap beside it c stays, and over it c makes room
	await press(middle("y"));
	const lifted = await now();
	await glide(await at({ x: 1300, y: middle("y").y }), 30);
	await page.waitForTimeout(500);
	const beside = await samples(lifted);
	const c = beside[0]?.labels.c;
	expect(
		beside.every((sample) => sample.labels.c?.[0] === c?.[0] && sample.labels.c?.[1] === c?.[1]),
		"a loose frame moved while the one held was not over it",
	).toBe(true);
	const over = await now();
	await glide(await at(middle("x")), 20);
	await page.waitForTimeout(600);
	expect((await samples(over)).at(-1)?.labels.c?.[1]).toBeGreaterThan(c?.[1] ?? 0);
	await glide(await at(middle("y")), 30);
	await page.waitForTimeout(300);
	await page.mouse.up();
	await settled();

	// the trade undone: once more, every frame one way to its place
	const undoing = await now();
	const undone = page.waitForResponse((response) => response.url().endsWith("/deck"));
	await page.keyboard.press("Control+z");
	await undone;
	await settled();
	const undo = await samples(undoing);
	expect(turns(undo), "a frame went back after the undo").toEqual([]);
	expect(undo.at(-1)?.numbers).toBe("a:1 b:2 c:3");

	// a never moved, and its picture never left the screen
	const frames = await screen.stop();
	expect(frames.length).toBeGreaterThan(100);
	const blank = frames.findIndex((png) => !near(pixelsOf(png, [a])[0] as Rgb, FRAMES.a?.colour ?? [0, 0, 0]));
	expect(blank, `a's picture was gone in frame ${blank} of ${frames.length}`).toBe(-1);
	// and every frame is drawn where it rests
	const colours = pixelsOf(await shot(), await Promise.all(Object.keys(FRAMES).map(inside)));
	expect(Object.values(FRAMES).every((frame, i) => near(colours[i] as Rgb, frame.colour))).toBe(true);

	// spool#305: into b by a person's double-click and out by esc. Nothing of b starts until the camera is there, since a
	// document starting under the flight holds the window's frames back (on a real GPU; this browser draws every frame of
	// a zoom too slowly to time one), and b is on screen at every step, its picture and then its stage.
	// how long the camera flies, in milliseconds, as the canvas reads it
	const fly = await page.evaluate(() => {
		const value = getComputedStyle(document.documentElement).getPropertyValue("--motion-deck-fly").trim();
		return Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
	});
	// when each document of the page started: an iframe added
	await page.evaluate(() => {
		const started: number[] = [];
		(window as unknown as { started: number[] }).started = started;
		new MutationObserver((changes) => {
			for (const change of changes)
				for (const node of change.addedNodes)
					if (node instanceof Element && (node.matches("iframe") || node.querySelector("iframe") !== null))
						started.push(performance.now());
		}).observe(document.body, { childList: true, subtree: true });
	});
	const started = () => page.evaluate(() => (window as unknown as { started: number[] }).started);
	/** where b stands on screen while it is gone into: its stage's place */
	const placeOfB = async (): Promise<Box> => {
		const stage = await page.locator('[data-deck-stage="talk/b"]').boundingBox();
		if (stage === null) throw new Error("b's stage is not on screen");
		return { from: { x: stage.x, y: stage.y }, to: { x: stage.x + stage.width, y: stage.y + stage.height } };
	};
	/**
	 * A point on b where it stood before a flight and where it stood after is on b at every step between, the camera's
	 * flight being a straight line: every frame recorded shows b's colour there.
	 */
	const stayedOnB = (frames: readonly Buffer[], one: Box, other: Box, what: string) => {
		const point = {
			x: Math.round((Math.max(one.from.x, other.from.x) + Math.min(one.to.x, other.to.x)) / 2),
			y: Math.round((Math.max(one.from.y, other.from.y) + Math.min(one.to.y, other.to.y)) / 2),
		};
		const lost = frames.findIndex((png) => !near(pixelsOf(png, [point])[0] as Rgb, FRAMES.b?.colour ?? [0, 0, 0]));
		expect(lost, `b's picture was gone in frame ${lost} of ${frames.length} ${what}`).toBe(-1);
	};
	/** where b stands on screen on the canvas */
	const onCanvas = async (): Promise<Box> => ({
		from: await at({ x: 1440, y: 0 }),
		to: await at({ x: 1440 + 1280, y: 720 }),
	});
	const out = await onCanvas();
	const middleOfB = { x: (out.from.x + out.to.x) / 2, y: (out.from.y + out.to.y) / 2 };
	const shown = page.locator('[data-deck-stage="talk/b"][data-deck-stage-shown]');
	const goingIn = await recordScreen(page);
	const clicked = await now();
	// the first click selects b, and the second, a moment later, goes in
	await page.mouse.click(middleOfB.x, middleOfB.y);
	await page.waitForTimeout(150);
	const flying = await now();
	await page.mouse.click(middleOfB.x, middleOfB.y, { clickCount: 2 });
	await shown.waitFor();
	const gone = await placeOfB();
	stayedOnB(await goingIn.stop(), out, gone, "going in");
	// the camera lands no sooner than a flight after the second click
	const early = (await started()).filter((t) => t >= clicked && t < flying + fly);
	expect(early, "a document started before the camera was on b").toEqual([]);
	const goingOut = await recordScreen(page);
	await page.keyboard.press("Escape");
	await page.locator("[data-deck-stage-shown]").waitFor({ state: "detached" });
	await page.waitForTimeout(300);
	stayedOnB(await goingOut.stop(), gone, await onCanvas(), "coming out");
	await page.close();
});
