import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, pagePointOf, serveProject, writeDesignFile } from "../test-helpers";
import { SETTLE_MS } from "../ui/deck/inside-camera";
import { pixelsOf, recordScreen } from "./deck/stage-browser.test-helpers";

type Rgb = readonly [number, number, number];

/** A frame of the page: its colour, and where its sidecar puts it. */
interface Made {
	readonly colour: Rgb;
	readonly x: number;
	readonly y: number;
}

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
	/** the slides' numbers, as their labels have them: which talk the preview shows */
	readonly numbers: Record<string, number>;
	/** the camera's x and zoom */
	readonly camera: readonly [number, number];
}

const ZOOM = 0.16;
const STRIDE = 1440;
const near = (colour: Rgb, want: Rgb) => colour.every((channel, i) => Math.abs(channel - (want[i] ?? 0)) <= 12);

/**
 * A deck page of `frames`, `slides` its talk, opened at `camera` (page pixels and a zoom) in a window `width` wide, and
 * sampled every drawn frame.
 */
async function deckPage(
	frames: Record<string, Made>,
	slides: readonly string[],
	camera: { x: number; y: number },
	width: number,
) {
	const browser = await testBrowser();
	const project = await serveProject({ uiDir: await builtUi(), experiments: { deck: true } });
	const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
	for (const [name, { colour, x, y }] of Object.entries(frames)) {
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
	writeDesignFile(project.root, "frames/talk/deck.json", json({ version: 1, w: 1280, h: 720, slides }));
	writeDesignFile(
		project.root,
		".spool/state.json",
		JSON.stringify({ pageCameras: { talk: { x: camera.x * ZOOM, y: camera.y * ZOOM, k: ZOOM } } }),
	);
	const page: Page = await browser.newPage({ viewport: { width, height: 1000 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.getByRole("button", { name: /^talk, \d+ frames/ }).click();
	await page.locator("[data-deck-band]").waitFor({ timeout: 30_000 });
	const at = (world: { x: number; y: number }) => pagePointOf(page, world);
	const middle = (name: string) => {
		const frame = frames[name];
		if (frame === undefined) throw new Error(`no frame ${name}`);
		return { x: frame.x + 640, y: frame.y + 360 };
	};
	/** a point inside each frame's picture, on screen, near its top left */
	const inside = async (name: string) => {
		const point = await at({ x: middle(name).x - 490, y: middle(name).y - 240 });
		return { x: Math.round(point.x), y: Math.round(point.y) };
	};
	const shot = async () => page.screenshot();
	// the canvas, between the panes, in the window
	const view = await page.locator("[data-canvas-camera]").evaluate((field) => {
		const box = field.parentElement?.getBoundingClientRect();
		return { left: box?.left ?? 0, right: box?.right ?? 0 };
	});
	// every frame on the canvas drawn in its colour before anything moves
	const all = Object.keys(frames);
	const where = await Promise.all(all.map(inside));
	const shown = all.filter((_, i) => (where[i]?.x ?? 0) > view.left && (where[i]?.x ?? 0) + 200 < view.right);
	const points = where.filter((_, i) => shown.includes(all[i] ?? ""));
	await expect
		.poll(
			async () => {
				const colours = pixelsOf(await shot(), points);
				return shown.every((name, i) => near(colours[i] as Rgb, frames[name]?.colour ?? [0, 0, 0]));
			},
			{ timeout: 60_000 },
		)
		.toBe(true);

	await page.evaluate(() => {
		const log: Sample[] = [];
		(window as unknown as { samples: Sample[] }).samples = log;
		const tick = (t: number) => {
			const labels: Record<string, [number, number]> = {};
			const numbers: Record<string, number> = {};
			for (const label of document.querySelectorAll("[data-frame-label]")) {
				const box = label.getBoundingClientRect();
				const name = (label.getAttribute("data-frame-label") ?? "").replace(/^talk\//, "");
				labels[name] = [box.x, box.y];
				const number = label.querySelector("[data-slide-number]")?.getAttribute("data-slide-number");
				if (number != null) numbers[name] = Number(number);
			}
			const field = document.querySelector<HTMLElement>("[data-canvas-camera]")?.style.transform ?? "";
			const camera = /translate\(([-\d.e]+)px, [-\d.e]+px\) scale\(([-\d.e]+)\)/.exec(field);
			log.push({ t, labels, numbers, camera: [Number(camera?.[1]), Number(camera?.[2])] });
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
	let pointer = { x: 0, y: 0 };
	/** the pointer from where it is to `to`, a step a drawn frame */
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
	/** until every frame of the page has stood still for twenty drawn frames, as the samples have them */
	const settled = async () => {
		let last: string | undefined;
		for (let still = 0; still < 20; ) {
			await frame();
			// none sampled yet is nothing standing still
			const latest = await page.evaluate(() => {
				const labels = (window as unknown as { samples: Sample[] }).samples.at(-1)?.labels;
				return labels === undefined ? undefined : JSON.stringify(labels);
			});
			still = latest !== undefined && latest === last ? still + 1 : 0;
			last = latest;
		}
	};
	const talk = () =>
		(JSON.parse(readFileSync(join(project.root, "design/frames/talk/deck.json"), "utf8")) as { slides: string[] })
			.slides;
	return {
		page,
		view,
		at,
		middle,
		inside,
		shot,
		now,
		samples,
		frame,
		glide,
		press,
		settled,
		talk,
		pointer: () => pointer,
	};
}

/** Where one frame's label went, stretch by stretch: its x on screen at each sample that has it. */
const xs = (stretch: readonly Sample[], name: string) =>
	stretch.map((sample) => sample.labels[name]?.[0]).filter((x): x is number => x !== undefined);

/** Each time a track turns back on its way, after moving at least half a pixel a frame. */
const turnsOf = (track: readonly number[]) => {
	let way = 0;
	let turns = 0;
	for (let i = 1; i < track.length; i++) {
		const step = (track[i] ?? 0) - (track[i - 1] ?? 0);
		if (Math.abs(step) < 0.5) continue;
		if (way !== 0 && Math.sign(step) !== way) turns += 1;
		way = Math.sign(step);
	}
	return turns;
};

/** Samples a track holds within half a pixel for to count as at rest. */
const REST = 12;

/** Whether a track, once it has come to rest, stays there to its end: nothing set it going again. */
const staysAtRest = (track: readonly number[]) => {
	const still = (from: number, to: number) =>
		track.slice(from, to).every((later) => Math.abs(later - (track[from] ?? 0)) < 0.5);
	const rest = track.findIndex((_, i) => i + REST <= track.length && still(i, i + REST));
	return rest >= 0 && still(rest, track.length);
};

/**
 * How far a track that went out from where it started and came back took its first drawn frame back, as a share of the
 * way home. A spring turned round where it is covers under a third of it in the slowest frame it runs (its step is
 * at most 50 ms); a frame put back where it came from, or one that set off again from anywhere else, covers it all.
 */
const firstStepBack = (track: readonly number[]) => {
	const home = track[0] ?? 0;
	let far = 0;
	for (let i = 1; i < track.length; i++)
		if (Math.abs((track[i] ?? 0) - home) > Math.abs((track[far] ?? 0) - home)) far = i;
	const out = (track[far] ?? 0) - home;
	return ((track[far] ?? 0) - (track[far + 1] ?? 0)) / out;
};

/**
 * spool#299: a deck page makes room the Dock's way, and holds still doing it. Every drawn frame is sampled in the
 * window, and the screen is read from the browser's own frames: a neighbour starts making room at about a quarter
 * covered; a trembling hand moves nothing; a reversal turns a neighbour round mid-flight with no jump; a drop lands
 * once, and the daemon's answer moves nothing after; Esc puts everything back; a fling let go between two frames lands
 * where the hand let go; and no picture blinks on the way.
 */
it("makes room as a slide is carried along the talk, holding still under a still hand, and lands once", {
	timeout: 300_000,
}, async () => {
	const frames: Record<string, Made> = {
		a: { colour: [200, 60, 60], x: 0, y: 0 },
		b: { colour: [60, 160, 90], x: 1440, y: 0 },
		c: { colour: [60, 90, 200], x: 2880, y: 0 },
		x: { colour: [220, 190, 60], x: 0, y: 1360 },
	};
	const deck = await deckPage(frames, ["a", "b", "c"], { x: 1500, y: 500 }, 1800);
	const { page, at, middle, now, samples, glide, press, settled } = deck;
	const screen = await recordScreen(page);
	const stride = STRIDE * ZOOM;
	// where each frame rests, read once it has been sampled standing still: read sooner, a frame not sampled yet has
	// no place, and nothing would ever count as moving from it
	await settled();
	const rest = (await samples(0)).at(-1)?.labels ?? {};
	expect(Object.keys(rest).sort()).toEqual(Object.keys(frames).sort());
	const restOf = (name: string) => rest[name]?.[0] ?? Number.NaN;
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

	// a lifted and carried right a step of two pixels a frame: b starts to make room once a is about a quarter over it
	const carrying = await now();
	await press(middle("a"));
	// lifted at once, past the slop
	await glide({ x: deck.pointer().x + 4, y: deck.pointer().y }, 1);
	await glide(await at({ x: middle("a").x + 0.45 * STRIDE, y: 360 }), Math.round((0.45 * stride) / 2));
	const carried = await samples(carrying);
	// when the hand took a: a slide pressed and held still settles, its document starting, so what starts before the
	// lift is the press's and not the carry's, however long a busy machine takes between the two
	const lifted = carried.find((sample) => Math.abs((sample.labels.a?.[0] ?? 0) - restOf("a")) >= 0.5)?.t;
	expect(lifted, "a was never lifted").toBeDefined();
	const moved = carried.findIndex((sample) => Math.abs((sample.labels.b?.[0] ?? 0) - restOf("b")) >= 0.5);
	expect(moved, "b never made room").toBeGreaterThan(0);
	const covered = ((carried[moved]?.labels.a?.[0] ?? 0) - restOf("a")) / stride;
	expect(covered).toBeGreaterThan(0.2);
	expect(covered).toBeLessThan(0.34);

	// held on the boundary b crossed, trembling three pixels either way for two seconds: nothing moves
	await glide(await at({ x: middle("a").x + covered * STRIDE, y: 360 }), 20);
	await page.waitForTimeout(500);
	const trembling = await now();
	const still = deck.pointer();
	for (let i = 0; i < 120; i++) {
		const offset = { x: [3, -3, 0, 2, -2][i % 5] ?? 0, y: [1, -1, 0][i % 3] ?? 0 };
		await page.mouse.move(still.x + offset.x, still.y + offset.y);
		await deck.frame();
	}
	const trembled = await samples(trembling);
	for (const name of ["b", "c", "x"]) {
		const track = xs(trembled, name);
		expect(Math.max(...track) - Math.min(...track), `${name} moved under a trembling hand`).toBeLessThan(0.5);
	}

	// reversed while b is still on its way back: it turns round where it is, at the speed it has, with no jump
	await glide({ x: still.x - 0.5 * stride, y: still.y }, 30);
	await page.waitForTimeout(500);
	const reversing = await now();
	await glide({ x: still.x + 0.15 * stride, y: still.y }, 6);
	await glide({ x: still.x - 0.4 * stride, y: still.y }, 6);
	await page.waitForTimeout(600);
	const reversal = xs(await samples(reversing), "b");
	expect(turnsOf(reversal), "b did not turn round once").toBe(1);
	const back = firstStepBack(reversal);
	expect(back, "b jumped as it turned").toBeGreaterThan(0);
	expect(back, "b jumped as it turned").toBeLessThan(0.5);

	// across b and let go: a lands once, and nothing moves again when the daemon's answer arrives
	await glide(await at({ x: middle("b").x + 200, y: 360 }), 60);
	await page.waitForTimeout(300);
	const answered = page.waitForResponse((response) => response.url().endsWith("/deck"));
	const dropped = await now();
	const dropping = screen.mark();
	await page.mouse.up();
	await answered;
	await settled();
	const drop = await samples(dropped);
	// nothing of a started while it was in the hand, a document starting holding the window's frames back
	const started = await page.evaluate(() => (window as unknown as { started: number[] }).started);
	expect(started.filter((t) => t >= (lifted ?? carrying) && t < dropped)).toEqual([]);
	expect(drop.at(-1)?.numbers).toEqual({ b: 1, a: 2, c: 3 });
	expect(deck.talk()).toEqual(["b", "a", "c"]);
	for (const name of ["a", "b", "c", "x"]) {
		const track = xs(drop, name);
		// a lands with a little bounce, once; every other frame goes one way to its place
		expect(turnsOf(track), `${name} went back after the drop`).toBeLessThanOrEqual(name === "a" ? 1 : 0);
		// through the answer and the still frames after it
		expect(staysAtRest(track), `${name} moved again once it had come to rest`).toBe(true);
	}

	// c carried over b, now first, and Esc mid-drag: everything goes back to its place, and nothing is written
	const escaping = screen.mark();
	await press(middle("c"));
	await glide(await at({ x: 700, y: 360 }), 30);
	const writes: string[] = [];
	page.on("request", (request) => {
		if (request.url().endsWith("/deck")) writes.push(request.url());
	});
	await page.keyboard.press("Escape");
	await page.mouse.up();
	await settled();
	expect(writes).toEqual([]);
	expect(deck.talk()).toEqual(["b", "a", "c"]);
	expect((await samples(0)).at(-1)?.labels.c?.[0]).toBeCloseTo(restOf("c"), 0);

	// c lifted, then flung over a and let go before another frame is drawn: it lands where the hand let go
	await press(middle("c"));
	await glide(await at({ x: middle("c").x - 200, y: 360 }), 6);
	await page.evaluate(() => {
		const draw = window.requestAnimationFrame.bind(window);
		const waiting: FrameRequestCallback[] = [];
		let id = 1e6;
		window.requestAnimationFrame = (callback) => {
			waiting.push(callback);
			id += 1;
			return id;
		};
		(window as unknown as { resume: () => void }).resume = () => {
			window.requestAnimationFrame = draw;
			for (const callback of waiting.splice(0)) draw(callback);
		};
	});
	// the frame already asked for is drawn, and the next one waits
	await page.waitForTimeout(100);
	// over a, second now
	const flung = await at({ x: STRIDE + 640, y: 360 });
	await page.mouse.move(flung.x, flung.y);
	await page.mouse.up();
	await page.evaluate(() => (window as unknown as { resume: () => void }).resume());
	await expect.poll(() => deck.talk()).toEqual(["b", "c", "a"]);
	await settled();

	// no picture blinked: in every frame the browser drew, each frame's colour covers at least a third of what it does
	// at rest. A frame in the hand is drawn over the rest, so it is always to be seen: from the lift to the drop, the
	// frame held; from the drop, through the answer and until the next lift, every frame
	const recorded = await screen.stop();
	expect(recorded.length).toBeGreaterThan(100);
	const grid: { x: number; y: number }[] = [];
	for (let y = 2; y < 1000; y += 6) for (let x = 2; x < 1800; x += 6) grid.push({ x, y });
	const names = Object.keys(frames);
	const coverOf = (png: Buffer) => {
		const colours = pixelsOf(png, grid);
		return Object.values(frames).map((one) => colours.filter((colour) => near(colour, one.colour)).length);
	};
	const atRest = coverOf(await deck.shot());
	recorded.forEach((png, i) => {
		const seen = i < dropping ? ["a"] : i < escaping ? names : ["c"];
		const cover = coverOf(png);
		const gone = seen.filter((name) => (cover[names.indexOf(name)] ?? 0) < (atRest[names.indexOf(name)] ?? 0) / 3);
		expect(gone, `frame ${i} of ${recorded.length} lost a picture`).toEqual([]);
	});
	await page.close();
});

/**
 * spool#299: a long talk stays one line, and the band scrolls under a hand held near the window's side; the gap goes
 * with it, under the hand, and the band stops a little past its end.
 */
it("scrolls a long talk under a hand held at the window's side, keeping the gap under the hand", {
	timeout: 300_000,
}, async () => {
	const frames: Record<string, Made> = {};
	const slides: string[] = [];
	for (let i = 0; i < 16; i++) {
		const name = `s${i}`;
		frames[name] = { colour: [40 + i * 12, 200 - i * 8, 120], x: i * STRIDE, y: 0 };
		slides.push(name);
	}
	const deck = await deckPage(frames, slides, { x: 300, y: 500 }, 1400);
	const { page, view, middle, now, samples, glide, press, settled } = deck;

	// s1 carried to the canvas's right side and held there: the band scrolls under it
	await press(middle("s1"));
	await glide({ x: view.right - 20, y: deck.pointer().y }, 40);
	const scrolling = await now();
	// until the band stops: the camera where it was a second and a half ago, however few frames a busy machine draws
	await expect
		.poll(
			async () => {
				const recent = (await samples((await now()) - 1500)).map((sample) => sample.camera[0]);
				return recent.length > 1 && Math.max(...recent) - Math.min(...recent) < 0.5;
			},
			{ timeout: 120_000, interval: 500 },
		)
		.toBe(true);
	const held = await samples(scrolling);
	const cameras = held.map((sample) => sample.camera[0]);
	expect(cameras.at(-1) ?? 0, "the band never scrolled").toBeLessThan((cameras[0] ?? 0) - 1000);
	// the gap under the hand all the while: the slot the held slide shows as is the one its middle reads, a lead ahead
	for (const sample of held) {
		const [x, k] = sample.camera;
		const left = sample.labels.s1?.[0];
		const number = sample.numbers.s1;
		if (left === undefined || number === undefined) continue;
		const read = (left - view.left - x) / k / STRIDE + 0.3;
		expect(Math.abs(number - 1 - read), `the gap fell behind the hand at ${sample.t}`).toBeLessThan(1);
	}
	const answered = page.waitForResponse((response) => response.url().endsWith("/deck"));
	await page.mouse.up();
	await answered;
	await settled();
	expect(deck.talk().at(-1)).toBe("s1");
	await page.close();
});

/**
 * spool#305: into a slide by a person's double-click and out by esc. Nothing of it starts until the camera is there,
 * since a document starting under the flight holds the window's frames back (on a real GPU; this browser draws every
 * frame of a zoom too slowly to time one), and the slide is on screen at every step, its picture and then its stage.
 */
it("goes into a slide and out without starting it under the flight or losing its picture", {
	timeout: 300_000,
}, async () => {
	const frames: Record<string, Made> = {
		a: { colour: [200, 60, 60], x: 0, y: 0 },
		b: { colour: [60, 160, 90], x: 1440, y: 0 },
		c: { colour: [60, 90, 200], x: 2880, y: 0 },
		x: { colour: [220, 190, 60], x: 0, y: 1360 },
	};
	const { page, at, now } = await deckPage(frames, ["a", "b", "c"], { x: 1500, y: 500 }, 1800);
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
	const stayedOnB = (shots: readonly Buffer[], one: Box, other: Box, what: string) => {
		const point = {
			x: Math.round((Math.max(one.from.x, other.from.x) + Math.min(one.to.x, other.to.x)) / 2),
			y: Math.round((Math.max(one.from.y, other.from.y) + Math.min(one.to.y, other.to.y)) / 2),
		};
		const lost = shots.findIndex((png) => !near(pixelsOf(png, [point])[0] as Rgb, frames.b?.colour ?? [0, 0, 0]));
		expect(lost, `b's picture was gone in frame ${lost} of ${shots.length} ${what}`).toBe(-1);
	};
	/** where b stands on screen on the canvas */
	const onCanvas = async (): Promise<Box> => ({
		from: await at({ x: 1440, y: 0 }),
		to: await at({ x: 1440 + 1280, y: 720 }),
	});
	const out = await onCanvas();
	const middleOfB = { x: (out.from.x + out.to.x) / 2, y: (out.from.y + out.to.y) / 2 };
	const shown = page.locator('[data-deck-stage="talk/b"][data-deck-stage-shown]');
	// b held a moment starts its document, and let go stops it: held again, it starts afresh
	const documentOfB = page.locator('[data-frame-shell="talk/b"] iframe');
	await page.mouse.click(middleOfB.x, middleOfB.y);
	await documentOfB.waitFor();
	await page.keyboard.press("Escape");
	await documentOfB.waitFor({ state: "detached" });
	// when each press reached the page
	await page.evaluate(() => {
		const presses: number[] = [];
		(window as unknown as { presses: number[] }).presses = presses;
		window.addEventListener("pointerdown", () => presses.push(performance.now()), { capture: true });
	});
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
	// nothing starts from the first click until the camera lands, no sooner than a flight after the second. Only a
	// machine too busy to put the second click within a double-click of the first lets the selection settle between
	// the two, as it would under a person who held a slide that long, and that start is the selection's own
	const [first, second] = (await page.evaluate(() => (window as unknown as { presses: number[] }).presses)).filter(
		(t) => t >= clicked,
	);
	if (first === undefined || second === undefined) throw new Error("the clicks never reached the page");
	const settledBetween = (t: number) => second - first > SETTLE_MS && t >= first + SETTLE_MS && t < second;
	const early = (await started()).filter((t) => t >= clicked && t < flying + fly && !settledBetween(t));
	expect(early, "a document started before the camera was on b").toEqual([]);
	const goingOut = await recordScreen(page);
	await page.keyboard.press("Escape");
	await page.locator("[data-deck-stage-shown]").waitFor({ state: "detached" });
	await page.waitForTimeout(300);
	stayedOnB(await goingOut.stop(), gone, await onCanvas(), "coming out");
	await page.close();
});
