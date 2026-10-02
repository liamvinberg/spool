import { deflateSync } from "node:zlib";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import type { PictureReport } from "../ui/canvas/picture-layer";
import { writeCover } from "./thumbs";

/**
 * The picture layer (#81) in a real browser: frames standing as their
 * pictures are drawn by WebGL and hold no DOM shell, a frame with no still
 * keeps its placeholder shell, a frame that becomes a document is handed to
 * its shell and back, a changed still lets its old texture go, the camera's
 * motion paints once a frame, and a lost context comes back without anything
 * else noticing. What the GPU drew is read two ways: the layer's own report
 * of what it was given, and the pixels on screen.
 */

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The still the daemon's photo booth makes of a frame: a read that finds the
 * frame without one asks for it, and the next reads see it land.
 */
async function boothStill(
	project: { url: string; name: string; controlToken: string },
	frame: string,
): Promise<{ hash: string }> {
	const read = async () => {
		const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const { frames } = (await res.json()) as { frames: { name: string; cover?: { hash: string } }[] };
		return frames.find((entry) => entry.name === frame)?.cover;
	};
	await expect.poll(read, { timeout: 60_000 }).toBeDefined();
	const still = await read();
	if (still === undefined) throw new Error(`no still for "${frame}"`);
	return still;
}

/**
 * A solid-colour RGB PNG, the shape a still arrives in; with `right`, the
 * columns from the middle on are that colour instead, an edge any softer
 * texture of the still would smear.
 */
function solidPng(
	width: number,
	height: number,
	[r, g, b]: readonly [number, number, number],
	right: readonly [number, number, number] = [r, g, b],
): Uint8Array<ArrayBuffer> {
	const chunk = (type: string, data: Buffer) => {
		const header = Buffer.alloc(8);
		header.writeUInt32BE(data.length, 0);
		header.write(type, 4);
		const checksum = Buffer.alloc(4);
		checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
		return Buffer.concat([header, data, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	const row = Buffer.alloc(width * 3 + 1);
	for (let x = 0; x < width; x += 1) row.set(x < width / 2 ? [r, g, b] : right, 1 + x * 3);
	const rows = Buffer.concat(Array.from({ length: height }, () => row));
	return new Uint8Array(
		Buffer.concat([
			Buffer.from("89504e470d0a1a0a", "hex"),
			chunk("IHDR", header),
			chunk("IDAT", deflateSync(rows)),
			chunk("IEND", Buffer.alloc(0)),
		]),
	);
}

const FRAMES = [
	{ name: "red", x: 0, y: 0, color: [230, 40, 40] },
	{ name: "green", x: 340, y: 0, color: [40, 200, 70] },
	{ name: "blue", x: 0, y: 240, color: [40, 80, 230] },
] as const;
const W = 300;
const H = 200;
/** Each frame draws 150 CSS px wide here, a picture below the 400 px readable threshold. */
const CAMERA = { x: 40, y: 40, k: 0.5 };

/**
 * A frame beyond the screen, to the right: its square loads with the rest of
 * the page, and it is never drawn.
 */
const FAR = { name: "far", x: 4000, y: 0, color: [230, 210, 40] } as const;

async function pictureCanvas(options: { plain?: boolean; far?: boolean } = {}) {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	for (const frame of options.far === true ? [...FRAMES, FAR] : FRAMES) {
		// the document is its still's colour too, so a picture the photo booth
		// takes of it on its own is the same picture
		const [r, g, b] = frame.color;
		writeFrame(
			project.root,
			frame.name,
			`export default function Frame() { return <main style={{ position: "fixed", inset: 0, background: "rgb(${r}, ${g}, ${b})" }} />; }`,
		);
		writeDesignFile(
			project.root,
			`frames/${frame.name}/frame.json`,
			`${JSON.stringify({ x: frame.x, y: frame.y, w: W, h: H })}\n`,
		);
		writeCover(project.root, frame.name, Buffer.from(solidPng(800, 533, frame.color)));
	}
	if (options.plain === true) {
		// a document that throws gives the photo booth nothing to keep
		writeFrame(project.root, "plain", 'export default function Frame() { throw new Error("nothing to picture"); }');
		writeDesignFile(project.root, "frames/plain/frame.json", `${JSON.stringify({ x: 340, y: 240, w: W, h: H })}\n`);
	}
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: CAMERA })}\n`);
	const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	// settled: every picture drawn as its size wants, and no document borrowed
	// to photograph one, three looks in a row
	let calm = 0;
	await expect
		.poll(
			async () => {
				const now = await report(page);
				const borrowed = await page.locator("iframe").count();
				calm = now?.complete === true && now.drawn.length === 3 && borrowed === 0 ? calm + 1 : 0;
				return calm >= 3;
			},
			{ timeout: 60_000, interval: 200 },
		)
		.toBe(true);
	return { page, project };
}

function report(page: Page): Promise<PictureReport | null> {
	return page.evaluate(() => {
		const canvas = document.querySelector("[data-picture-layer]") as
			| (HTMLCanvasElement & { spoolPictures?: () => PictureReport })
			| null;
		return canvas?.spoolPictures?.() ?? null;
	});
}

/** The canvas's top left on the page, which every box in the report is measured from. */
function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
	return page.locator("[data-picture-layer]").evaluate((canvas) => {
		const box = canvas.getBoundingClientRect();
		return { x: box.left, y: box.top };
	});
}

/** The composited colour at each page point, read off a real screenshot. */
async function pixels(page: Page, points: { x: number; y: number }[]): Promise<number[][]> {
	const shot = (await page.screenshot()).toString("base64");
	return page.evaluate(
		async ({ shot, points }) => {
			const image = new Image();
			image.src = `data:image/png;base64,${shot}`;
			await image.decode();
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (context === null) throw new Error("no 2d context");
			context.drawImage(image, 0, 0);
			const scale = image.width / innerWidth;
			return points.map(({ x, y }) => [
				...context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data.slice(0, 3),
			]);
		},
		{ shot, points },
	);
}

const near = (actual: number[] | undefined, expected: readonly number[], slack = 4) =>
	actual !== undefined && expected.every((channel, i) => Math.abs((actual[i] ?? -999) - channel) <= slack);

it("draws every picture on the GPU, where its shell stood, and keeps none in the DOM", {
	timeout: 180_000,
}, async () => {
	const { page } = await pictureCanvas();
	const drawn = (await report(page))?.drawn ?? [];
	expect(drawn.map((each) => each.name).sort()).toEqual(["blue", "green", "red"]);
	for (const frame of FRAMES) {
		const picture = drawn.find((each) => each.name === frame.name);
		// the frame's box on screen, to the pixel the DOM shell would stand on
		expect(picture?.box).toEqual({
			x: CAMERA.x + frame.x * CAMERA.k,
			y: CAMERA.y + frame.y * CAMERA.k,
			w: W * CAMERA.k,
			h: H * CAMERA.k,
		});
		// contained at the top left, like the image element: 800 x 533 in a 3:2 box
		expect(picture?.picture?.w).toBeCloseTo(150, 5);
		expect(picture?.picture?.h).toBeCloseTo(99.9375, 5);
		expect(picture?.natural).toEqual({ width: 800, height: 533 });
		// 150 device px is past the 64 px square: the still halved twice streams in
		expect(picture?.texture).toEqual({ kind: "halving", width: 200, height: 133 });
	}
	// no shell, no still, no document: the field holds only the labels
	expect(await page.locator("[data-frame-cover]").count()).toBe(0);
	expect(await page.locator("iframe").count()).toBe(0);
	expect(await page.locator("[data-frame-label]").count()).toBe(3);

	const origin = await canvasOrigin(page);
	const at = (frame: (typeof FRAMES)[number], dx: number, dy: number) => ({
		x: origin.x + CAMERA.x + frame.x * CAMERA.k + dx,
		y: origin.y + CAMERA.y + frame.y * CAMERA.k + dy,
	});
	const canvasColour = await page
		.locator('[role="application"]')
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	const background = (/(\d+), (\d+), (\d+)/.exec(canvasColour) ?? []).slice(1).map(Number);
	const centres = await pixels(
		page,
		FRAMES.map((frame) => at(frame, 75, 50)),
	);
	FRAMES.forEach((frame, i) => {
		expect(near(centres[i], frame.color), `${frame.name} at its centre: ${centres[i]}`).toBe(true);
	});
	// the shell's rounded corner, 12 px on screen: its very corner is the canvas
	const [corner, inside] = await pixels(page, [at(FRAMES[0], 0.5, 0.5), at(FRAMES[0], 12, 12)]);
	expect(near(corner, background, 6), `the corner shows the canvas: ${corner}`).toBe(true);
	expect(near(inside, FRAMES[0].color), `inside the corner is the picture: ${inside}`).toBe(true);
});

it("hands a selected frame to its shell, and takes it back as a picture", { timeout: 180_000 }, async () => {
	const { page } = await pictureCanvas();
	const origin = await canvasOrigin(page);
	// a press lands on the frame by where it is in the world, picture or not
	await page.mouse.click(origin.x + CAMERA.x + 75, origin.y + CAMERA.y + 50);
	await page.locator('iframe[title="red"]').waitFor({ state: "attached", timeout: 30_000 });
	await expect.poll(async () => (await report(page))?.claimed, { timeout: 30_000 }).toEqual(["red"]);
	expect((await report(page))?.drawn.map((each) => each.name).sort()).toEqual(["blue", "green"]);
	const [shown] = await pixels(page, [{ x: origin.x + CAMERA.x + 75, y: origin.y + CAMERA.y + 50 }]);
	expect(near(shown, FRAMES[0].color), `the shell shows the same picture: ${shown}`).toBe(true);

	await page.keyboard.press("Escape");
	await expect.poll(() => page.locator('iframe[title="red"]').count(), { timeout: 30_000 }).toBe(0);
	await expect.poll(async () => (await report(page))?.claimed, { timeout: 10_000 }).toEqual([]);
	expect((await report(page))?.drawn.map((each) => each.name).sort()).toEqual(["blue", "green", "red"]);
});

it("keeps the canvas working through a lost context and draws again when it comes back", {
	timeout: 180_000,
}, async () => {
	const { page } = await pictureCanvas();
	// the handle is kept: a lost context hands out no extensions to restore it with
	await page.locator("[data-picture-layer]").evaluate((canvas) => {
		const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
		const extension = gl?.getExtension("WEBGL_lose_context");
		if (extension == null) throw new Error("no WEBGL_lose_context");
		Reflect.set(window, "__lose", extension);
		extension.loseContext();
	});
	await expect.poll(async () => (await report(page))?.lost, { timeout: 10_000 }).toBe(true);

	// nothing else noticed: a press still finds the frame by its place in the world
	const origin = await canvasOrigin(page);
	await page.mouse.click(origin.x + CAMERA.x + 340 * CAMERA.k + 75, origin.y + CAMERA.y + 50);
	await expect
		.poll(() => page.locator('[role="treeitem"][aria-selected="true"]').innerText(), { timeout: 10_000 })
		.toContain("green");
	await page.keyboard.press("Escape");

	await page.evaluate(() => (Reflect.get(window, "__lose") as WEBGL_lose_context | undefined)?.restoreContext());
	await expect
		.poll(
			async () => {
				const back = await report(page);
				return back?.lost === false && back.complete && back.drawn.length + back.claimed.length === 3;
			},
			{ timeout: 30_000 },
		)
		.toBe(true);
	const centres = await pixels(page, [{ x: origin.x + CAMERA.x + 75, y: origin.y + CAMERA.y + 50 }]);
	expect(near(centres[0], FRAMES[0].color), `the picture is back: ${centres[0]}`).toBe(true);
});

it("draws the still itself at 100% on a 2x screen, as sharp as the image element did", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	// 360 CSS px on its long side at k = 1: still a picture, under the 400 px
	// readable threshold, and drawn 720 device px wide from the 800 px still
	// the photo booth takes of it. White on its left half and black on its
	// right, an edge that falls on the still's 400th column: a JPEG block
	// boundary, so the still holds it as hard as the document does.
	writeFrame(
		project.root,
		"card",
		'export default function Frame() { return <main style={{ position: "fixed", inset: 0, background: "linear-gradient(to right, #fff 50%, #000 50%)" }} />; }',
	);
	writeDesignFile(project.root, "frames/card/frame.json", '{ "x": 0, "y": 0, "w": 360, "h": 360 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 40, y: 40, k: 1 } })}\n`);
	const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	// the still itself, never a halving of it, at the frame's place and size
	const still = await boothStill(project, "card");
	const card = async () => (await report(page))?.drawn.find((picture) => picture.name === "card") ?? null;
	await expect
		.poll(
			async () => {
				const drawn = await card();
				return drawn?.still === `/covers/${project.name}/card/${still.hash}` ? drawn.texture : null;
			},
			{ timeout: 60_000 },
		)
		.toEqual({ kind: "halving", width: 800, height: 800 });
	const picture = await card();
	expect(picture?.natural).toEqual({ width: 800, height: 800 });
	expect(picture?.box).toEqual({ x: 40, y: 40, w: 360, h: 360 });
	expect(picture?.picture).toEqual({ w: 360, h: 360 });
	expect(await page.locator('[data-frame-cover="card"]').count()).toBe(0);

	// The white half ends at the still's middle column, 180 CSS px into the
	// frame. Drawn from the still itself the edge stays within a device pixel
	// or two; the square or a halving would smear it across several.
	const origin = await canvasOrigin(page);
	const edge = origin.x + 40 + 180;
	const [white, black] = await pixels(page, [
		{ x: edge - 1.5, y: origin.y + 220 },
		{ x: edge + 1, y: origin.y + 220 },
	]);
	expect(white?.[0], "a device pixel or so left of the edge is the white half").toBeGreaterThan(235);
	expect(black?.[0], "a device pixel right of it is the black half").toBeLessThan(20);
});

it("keeps a frame with no still in its placeholder shell, beside the pictures", { timeout: 180_000 }, async () => {
	const { page } = await pictureCanvas({ plain: true });
	const placeholder = page.locator('[data-frame-cover="plain"]');
	await placeholder.waitFor({ timeout: 30_000 });
	const now = await report(page);
	// the layer draws the three with stills, and leaves the fourth to its shell
	expect(now?.drawn.map((each) => each.name).sort()).toEqual(["blue", "green", "red"]);
	expect(await placeholder.locator("img").count()).toBe(0);
	expect(await placeholder.innerText()).toContain("plain");
	const origin = await canvasOrigin(page);
	const box = await placeholder.boundingBox();
	expect(box).toEqual({
		x: origin.x + CAMERA.x + 340 * CAMERA.k,
		y: origin.y + CAMERA.y + 240 * CAMERA.k,
		width: W * CAMERA.k,
		height: H * CAMERA.k,
	});
	// on screen it is the shell's surface, between pictures the GPU drew
	const surface = (
		/(\d+), (\d+), (\d+)/.exec(
			await placeholder
				.locator("div")
				.first()
				.evaluate((element) => getComputedStyle(element).backgroundColor),
		) ?? []
	)
		.slice(1)
		.map(Number);
	const [plain, red] = await pixels(page, [
		{ x: origin.x + CAMERA.x + 340 * CAMERA.k + 20, y: origin.y + CAMERA.y + 240 * CAMERA.k + 20 },
		{ x: origin.x + CAMERA.x + 75, y: origin.y + CAMERA.y + 50 },
	]);
	expect(near(plain, surface), `the placeholder shows its surface: ${plain}`).toBe(true);
	expect(near(red, FRAMES[0].color), `the picture beside it is drawn: ${red}`).toBe(true);
});

it("lets a changed still's old texture go: at once off screen, and on screen once the new one is drawn", {
	timeout: 240_000,
}, async () => {
	const { page, project } = await pictureCanvas({ far: true });
	const stillOf = async (name: string) =>
		(await report(page))?.stills.find((each) => each.name === name)?.still ?? null;
	const held = async () => (await report(page))?.held ?? [];
	// the photo booth pictures each new frame on its own: wait for it to finish
	let last = "";
	let quiet = 0;
	await expect
		.poll(
			async () => {
				const now = JSON.stringify((await report(page))?.stills.map((each) => each.still));
				quiet = now === last ? quiet + 1 : 0;
				last = now;
				return quiet >= 6;
			},
			{ timeout: 90_000, interval: 500 },
		)
		.toBe(true);
	// a frame whose document changes colour gets a new still from the booth
	const recolour = (name: string, [r, g, b]: readonly [number, number, number]) =>
		writeFrame(
			project.root,
			name,
			`export default function Frame() { return <main style={{ position: "fixed", inset: 0, background: "rgb(${r}, ${g}, ${b})" }} />; }`,
		);

	// off screen: the far frame's square is on the GPU, and goes the moment its still changes
	const farBefore = await stillOf(FAR.name);
	await expect.poll(held, { timeout: 30_000 }).toContain(farBefore);
	recolour(FAR.name, [140, 40, 200]);
	await expect.poll(() => stillOf(FAR.name), { timeout: 60_000 }).not.toBe(farBefore);
	expect(await held()).not.toContain(farBefore);

	// on screen: the old still stands in until the new one is drawn, then goes
	const redBefore = await stillOf("red");
	recolour("red", [40, 200, 200]);
	await expect.poll(() => stillOf("red"), { timeout: 60_000 }).not.toBe(redBefore);
	const redAfter = await stillOf("red");
	await expect
		.poll(
			async () => {
				const red = (await report(page))?.drawn.find((each) => each.name === "red");
				return red?.still === redAfter && red.texture?.kind === "halving";
			},
			{ timeout: 30_000 },
		)
		.toBe(true);
	await expect.poll(held, { timeout: 10_000 }).not.toContain(redBefore);
});

it("paints once a frame while the camera moves, with stills still landing", { timeout: 180_000 }, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	// a page of small frames, every one on screen, whose squares land while the camera pans
	for (let i = 0; i < 60; i += 1) {
		const name = `tile-${String(i).padStart(2, "0")}`;
		const shade = 40 + ((i * 37) % 180);
		writeFrame(project.root, name, "export default function Frame() { return <main />; }");
		writeDesignFile(
			project.root,
			`frames/${name}/frame.json`,
			`${JSON.stringify({ x: (i % 10) * 110, y: Math.floor(i / 10) * 90, w: 100, h: 75 })}\n`,
		);
		writeCover(project.root, name, Buffer.from(solidPng(400, 300, [shade, 120, 255 - shade])));
	}
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 20, y: 20, k: 0.8 } })}\n`);
	const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect.poll(async () => (await report(page))?.draws ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);

	// a sample every animation frame: how many times the layer has painted, the
	// camera it drew, and what is out
	await page.evaluate(() => {
		const canvas = document.querySelector("[data-picture-layer]") as HTMLCanvasElement & {
			spoolPictures: () => PictureReport;
		};
		const samples: { draws: number; out: number; camera: string }[] = [];
		Reflect.set(window, "__samples", samples);
		const tick = () => {
			const now = canvas.spoolPictures();
			samples.push({ draws: now.draws, out: now.pending.out, camera: JSON.stringify(now.camera) });
			if (Reflect.get(window, "__sampling") !== false) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const origin = await canvasOrigin(page);
	await page.mouse.move(origin.x + 500, origin.y + 300);
	for (let i = 0; i < 60; i += 1) {
		await page.mouse.wheel(i % 20 < 10 ? 8 : -8, 0);
		await page.waitForTimeout(16);
	}
	await page.evaluate(() => Reflect.set(window, "__sampling", false));
	const samples = (await page.evaluate(() => Reflect.get(window, "__samples"))) as {
		draws: number;
		out: number;
		camera: string;
	}[];
	// the frames the camera moved in, from the first to the last
	const moved = samples.flatMap((sample, i) => (i > 0 && sample.camera !== samples[i - 1]?.camera ? [i] : []));
	const first = moved[0] ?? 0;
	const last = moved.at(-1) ?? 0;
	const during = samples.slice(first, last + 1);
	// the pan met loads coming back, or it proves nothing
	const landings = during.filter((sample, i) => i > 0 && sample.out < (during[i - 1]?.out ?? 0)).length;
	expect(landings, "stills landed while the camera moved").toBeGreaterThan(0);
	const most = Math.max(...during.slice(1).map((sample, i) => sample.draws - (during[i]?.draws ?? 0)));
	expect(most, "paints in one animation frame of the pan").toBeLessThanOrEqual(1);
});

it("loses its context when the canvas goes, rather than leaving it for the collector", {
	timeout: 180_000,
}, async () => {
	const { page } = await pictureCanvas();
	await page.locator("[data-picture-layer]").evaluate((canvas) => Reflect.set(window, "__canvas", canvas));
	await page.getByTitle("Home").click();
	await expect.poll(() => page.locator("[data-picture-layer]").count(), { timeout: 10_000 }).toBe(0);
	expect(
		await page.evaluate(() =>
			(Reflect.get(window, "__canvas") as HTMLCanvasElement).getContext("webgl2")?.isContextLost(),
		),
	).toBe(true);
});
