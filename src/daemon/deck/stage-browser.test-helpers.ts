import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deflateSync, inflateSync } from "node:zlib";
import type { BrowserContext, Page } from "playwright-core";
import { writeDesignFile } from "../../test-helpers";

/**
 * The hard talk (spool#265): a deck built to catch a stage that is late or shows an error. Its pictures and the
 * document's face come slowly from `/fixture/`, and a slide's own stylesheet carries another face inline; it holds a
 * large picture, a WebGL canvas, a live slide, a slide of another shape, and three broken slides: one that throws as
 * it mounts, one that throws on its second beat (over a WebGL canvas), and one that does not compile. Every slide that
 * shows has a ground of its own, from its own stylesheet, so a frame with no slide styled in it reads as the stage's.
 *
 * As each slide is put on screen it notes, before the browser paints, whether the face its words are set in is loaded
 * and whether its picture has come: a slide swapped in before its font or its picture was ready says so.
 */

/** The talk, in order, as its frames are named. */
export const HARD_TALK = [
	"title",
	"photo",
	"words",
	"gl",
	"live",
	"tall",
	"mount-throws",
	"beat-throws",
	"no-compile",
	"end",
] as const;

/** Each slide's ground, as the screen shows it. */
export const GROUNDS: Record<string, [number, number, number]> = {
	title: [29, 53, 87],
	photo: [42, 157, 143],
	words: [233, 196, 106],
	gl: [38, 70, 83],
	live: [138, 177, 125],
	tall: [244, 162, 97],
	"beat-throws": [109, 89, 122],
	end: [181, 101, 118],
};

/** What the WebGL slides clear their canvases to. */
export const GL_COLOUR: [number, number, number] = [231, 111, 81];
export const BROKEN_GL_COLOUR: [number, number, number] = [0, 255, 136];

type Rgb = readonly [number, number, number];

/** The stage's ground, around the talk and beside a slide of another shape: never the pure black of B. */
export const GROUND: Rgb = [10, 10, 11];

/** Every colour is the stage's ground: no slide is on the screen, and it is not blacked out. */
export const onGround = (colours: readonly Rgb[]) =>
	colours.every((colour) => colour.every((channel, at) => Math.abs(channel - (GROUND[at] ?? 0)) <= 2));

/** Every colour is pure black, as B draws it. */
export const blackedOut = (colours: readonly Rgb[]) =>
	colours.every((colour) => colour.every((channel) => channel <= 2));

/**
 * Where the room's screen is read, at the talk's size: low on the ground every slide has; where the pictures are, inside
 * one band of their stripes; and beside the slide of another shape, where it leaves the ground.
 */
export const SCREEN_POINTS = [
	{ x: 640, y: 710 },
	{ x: 642, y: 450 },
	{ x: 40, y: 360 },
] as const;

/** What each slide that ever shows puts at each of `SCREEN_POINTS`, whole. */
export function slideLooks(): Record<string, readonly Rgb[]> {
	const looks: Record<string, Rgb[]> = {};
	for (const [name, ground] of Object.entries(GROUNDS)) looks[name] = [ground, ground, ground];
	const set = (name: string, point: number, colour: Rgb) => {
		const look = looks[name];
		if (look !== undefined) look[point] = colour;
	};
	set("photo", 1, [20, 20, 20]);
	set("gl", 1, GL_COLOUR);
	set("beat-throws", 1, BROKEN_GL_COLOUR);
	set("end", 1, [255, 214, 10]);
	set("tall", 2, GROUND);
	return looks;
}

const require = createRequire(import.meta.url);
const font = (path: string) => readFileSync(require.resolve(path));

const hex = ([r, g, b]: [number, number, number]) =>
	`#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;

const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;

/** A slide of the hard talk: its frame, its sidecar at its slot, and its own stylesheet. */
function slide(root: string, name: string, index: number, source: string, css = "", size = { w: 1280, h: 720 }) {
	writeDesignFile(root, `frames/talk/${name}/frame.tsx`, source);
	writeDesignFile(root, `frames/talk/${name}/frame.json`, json({ x: index * 1440, y: 0, ...size }));
	if (css !== "") writeDesignFile(root, `frames/talk/${name}/slide.css`, css);
}

const ground = (name: string) =>
	`.ground { background: ${hex(GROUNDS[name] ?? [0, 0, 0])}; width: 100%; height: 100%; }\n`;

const PROBE = `import { useLayoutEffect, useRef } from "react";

/**
 * What a slide looked like the moment it was put on screen, before the browser painted it: how wide its words were laid
 * out, and whether its picture had come. The element is marked, so its width can be read again once every font is in.
 */
export function useProbe<T extends HTMLElement>(name: string) {
	const ref = useRef<T>(null);
	useLayoutEffect(() => {
		const element = ref.current;
		if (element === null) return;
		element.dataset.probe = name;
		const image = element.querySelector("img");
		((window as unknown as { __probes?: unknown[] }).__probes ??= []).push({
			name,
			width: element.offsetWidth,
			image: image === null ? undefined : image.complete && image.naturalWidth > 0,
		});
	}, [name]);
	return ref;
}

/** A canvas cleared to one colour by WebGL, drawn once a frame for as long as it stands. */
export function useGl(colour: [number, number, number]) {
	const ref = useRef<HTMLCanvasElement>(null);
	useLayoutEffect(() => {
		const canvas = ref.current;
		const gl = canvas?.getContext("webgl");
		if (canvas === null || gl === null || gl === undefined) return;
		let frame = 0;
		const draw = () => {
			gl.clearColor(colour[0] / 255, colour[1] / 255, colour[2] / 255, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
			frame = requestAnimationFrame(draw);
		};
		draw();
		return () => cancelAnimationFrame(frame);
	}, [colour]);
	return ref;
}
`;

/** Writes the hard talk into a project's design/: the page `talk`. */
export function writeHardTalk(root: string): void {
	writeDesignFile(root, "shared/probe.ts", PROBE);
	writeDesignFile(
		root,
		"shared/fonts.css",
		'@font-face { font-family: "Hard Display"; src: url("/fixture/display.woff2") format("woff2"); font-weight: 100 900; }\n',
	);
	writeDesignFile(root, "frames/talk/deck.json", json({ version: 1, w: 1280, h: 720, slides: HARD_TALK }));
	const text = (name: string, family: string, words: string) => `import "./slide.css";
import { useProbe } from "shared/probe";

export default function Slide() {
	const probe = useProbe<HTMLSpanElement>(${JSON.stringify(name)});
	return (
		<div className="ground">
			<span ref={probe} className="words" style={{ fontFamily: ${JSON.stringify(family)} }}>${words}</span>
		</div>
	);
}
`;
	const wordsCss =
		".words { position: absolute; left: 80px; top: 280px; font-size: 96px; color: #fff; white-space: nowrap; }\n";
	slide(root, "title", 0, text("title", '"Hard Display", serif', "The hard talk"), ground("title") + wordsCss);
	slide(
		root,
		"photo",
		1,
		`import "./slide.css";
import { useProbe } from "shared/probe";

export default function Slide() {
	const probe = useProbe<HTMLDivElement>("photo");
	return (
		<div className="ground" ref={probe}>
			<img className="photo" src="/fixture/photo.png" alt="" />
		</div>
	);
}
`,
		`${ground("photo")}.photo { position: absolute; left: 140px; top: 60px; width: 1000px; height: 600px; display: block; }\n`,
	);
	slide(
		root,
		"words",
		2,
		`import "./slide.css";
import { ui } from "spool";
import { useProbe } from "shared/probe";

export default function Slide() {
	const beat = ui.beats(["one", "two", "three"]);
	const probe = useProbe<HTMLSpanElement>("words");
	return (
		<div className="ground">
			<span ref={probe} className="words">Beat {beat.name}</span>
		</div>
	);
}
`,
		// a slide's own face rides in its stylesheet, as a theme's inlined fonts do
		`@font-face { font-family: "Hard Body"; src: url("data:font/woff2;base64,${font("@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2").toString("base64")}") format("woff2"); }\n${ground("words")}${wordsCss.replace("#fff", "#111")}.words { font-family: "Hard Body", serif; }\n`,
	);
	slide(
		root,
		"gl",
		3,
		`import "./slide.css";
import { useGl } from "shared/probe";

export default function Slide() {
	const canvas = useGl(${JSON.stringify(GL_COLOUR)});
	return (
		<div className="ground">
			<canvas ref={canvas} className="gl" width={640} height={360} />
		</div>
	);
}
`,
		`${ground("gl")}.gl { position: absolute; left: 320px; top: 180px; width: 640px; height: 360px; }\n`,
	);
	slide(
		root,
		"live",
		4,
		`import "./slide.css";
import { ui } from "spool";

export default function Slide() {
	ui.live();
	ui.use();
	const count = (ui.state.count as number | undefined) ?? 0;
	return (
		<div className="ground">
			<button type="button" id="more" onClick={() => (ui.state.count = count + 1)}>{\`count \${count}\`}</button>
			<input id="field" defaultValue="" />
		</div>
	);
}
`,
		`${ground("live")}#more { position: absolute; left: 80px; top: 80px; font-size: 48px; } #field { position: absolute; left: 80px; top: 240px; font-size: 32px; }\n`,
	);
	slide(
		root,
		"tall",
		5,
		`import "./slide.css";

export default function Slide() {
	return <div className="ground" />;
}
`,
		ground("tall"),
		{ w: 600, h: 800 },
	);
	// it draws, and then throws as it mounts: what it drew is in the document for a moment, and must never be seen
	slide(
		root,
		"mount-throws",
		6,
		`import { useEffect } from "react";

export default function Slide() {
	useEffect(() => {
		throw new Error("this slide throws as it mounts");
	}, []);
	return <div style={{ position: "absolute", inset: 0, background: "#fff" }}>about to throw</div>;
}
`,
	);
	slide(
		root,
		"beat-throws",
		7,
		`import "./slide.css";
import { ui } from "spool";
import { useGl } from "shared/probe";

export default function Slide() {
	const beat = ui.beats(["fine", "boom"]);
	const canvas = useGl(${JSON.stringify(BROKEN_GL_COLOUR)});
	if (beat.name === "boom") throw new Error("this slide throws on its second beat");
	return (
		<div className="ground">
			<canvas ref={canvas} className="gl" width={640} height={360} />
		</div>
	);
}
`,
		`${ground("beat-throws")}.gl { position: absolute; left: 320px; top: 180px; width: 640px; height: 360px; }\n`,
	);
	slide(
		root,
		"no-compile",
		8,
		`export default function Slide() {
	return <div className="ground">this never compiles</div
}
`,
	);
	slide(
		root,
		"end",
		9,
		`import "./slide.css";
import { useProbe } from "shared/probe";

export default function Slide() {
	const probe = useProbe<HTMLDivElement>("end");
	return (
		<div className="ground" ref={probe}>
			<img className="photo" src="/fixture/end.png" alt="" />
		</div>
	);
}
`,
		`${ground("end")}.photo { position: absolute; left: 340px; top: 160px; width: 600px; height: 400px; display: block; }\n`,
	);
}

/** The files the hard talk asks `/fixture/` for, each answered once `wait` for its path has passed. */
export async function serveHardTalkFiles(
	context: BrowserContext,
	wait: (path: string) => Promise<unknown>,
): Promise<void> {
	const files: Record<string, { body: Buffer; type: string }> = {
		"/fixture/display.woff2": {
			body: font("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2"),
			type: "font/woff2",
		},
		"/fixture/photo.png": { body: stripes(2400, 1440, [250, 250, 250], [20, 20, 20]), type: "image/png" },
		"/fixture/end.png": { body: stripes(1800, 1200, [255, 214, 10], [0, 53, 102]), type: "image/png" },
	};
	await context.route("**/fixture/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		const file = files[path];
		if (file === undefined) return route.fulfill({ status: 404, body: "" });
		await wait(path);
		await route.fulfill({
			status: 200,
			body: file.body,
			headers: { "content-type": file.type, "access-control-allow-origin": "*", "cache-control": "max-age=3600" },
		});
	});
}

/** A large PNG of bands in two colours, slow to decode. */
export function stripes(w: number, h: number, a: number[], b: number[]): Buffer {
	const rows = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) {
		const row = y * (w * 3 + 1);
		for (let x = 0; x < w; x++) {
			const colour = (Math.floor(x / 37) + Math.floor(y / 53)) % 2 === 0 ? a : b;
			rows[row + 1 + x * 3] = colour[0] ?? 0;
			rows[row + 2 + x * 3] = colour[1] ?? 0;
			rows[row + 3 + x * 3] = colour[2] ?? 0;
		}
	}
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length, 0);
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const checksum = Buffer.alloc(4);
		checksum.writeUInt32BE(crc32(body), 0);
		return Buffer.concat([length, body, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(w, 0);
	header.writeUInt32BE(h, 4);
	header[8] = 8;
	header[9] = 2;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** The colour at each point of a PNG (8-bit RGB or RGBA, not interlaced), as the screencast sends its frames. */
export function pixelsOf(png: Buffer, points: readonly { x: number; y: number }[]): Rgb[] {
	let at = 8;
	let w = 0;
	let channels = 0;
	const data: Buffer[] = [];
	while (at < png.length) {
		const length = png.readUInt32BE(at);
		const type = png.toString("ascii", at + 4, at + 8);
		const body = png.subarray(at + 8, at + 8 + length);
		if (type === "IHDR") {
			w = body.readUInt32BE(0);
			channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
			if (body[8] !== 8 || channels === 0 || body[12] !== 0) throw new Error("not an 8-bit RGB(A) PNG");
		}
		if (type === "IDAT") data.push(body);
		at += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(data));
	const stride = w * channels;
	const last = points.reduce((most, point) => Math.max(most, point.y), 0);
	let previous = Buffer.alloc(stride);
	const rows = new Map<number, Buffer>();
	for (let y = 0; y <= last; y++) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const row = Buffer.alloc(stride);
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? (row[i - channels] ?? 0) : 0;
			const b = previous[i] ?? 0;
			const c = i >= channels ? (previous[i - channels] ?? 0) : 0;
			const x = line[i] ?? 0;
			let value = x;
			if (filter === 1) value = x + a;
			else if (filter === 2) value = x + b;
			else if (filter === 3) value = x + ((a + b) >> 1);
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
			}
			row[i] = value & 255;
		}
		rows.set(y, row);
		previous = row;
	}
	return points.map(({ x, y }) => {
		const row = rows.get(y) ?? Buffer.alloc(0);
		return [row[x * channels] ?? 0, row[x * channels + 1] ?? 0, row[x * channels + 2] ?? 0];
	});
}

/**
 * The slides a frame of the room's screen shows: one whole, or two dissolving into each other, every point the same
 * mix of the two. Undefined when it is neither (a blank, an unstyled slide, a missing picture, something else drawn).
 */
export function explainFrame(
	colours: readonly Rgb[],
	looks: Record<string, readonly Rgb[]>,
): { from: string; to: string; mix: number } | undefined {
	const SLACK = 6;
	const names = Object.keys(looks);
	let best: { from: string; to: string; mix: number; off: number } | undefined;
	for (const from of names) {
		for (const to of names) {
			const a = looks[from] ?? [];
			const b = looks[to] ?? [];
			// the mix that fits best over every point and channel at once
			let top = 0;
			let bottom = 0;
			colours.forEach((colour, point) => {
				for (let channel = 0; channel < 3; channel++) {
					const span = (b[point]?.[channel] ?? 0) - (a[point]?.[channel] ?? 0);
					top += ((colour[channel] ?? 0) - (a[point]?.[channel] ?? 0)) * span;
					bottom += span * span;
				}
			});
			const mix = bottom === 0 ? 0 : Math.min(1, Math.max(0, top / bottom));
			let off = 0;
			colours.forEach((colour, point) => {
				for (let channel = 0; channel < 3; channel++) {
					const want = (a[point]?.[channel] ?? 0) * (1 - mix) + (b[point]?.[channel] ?? 0) * mix;
					off = Math.max(off, Math.abs((colour[channel] ?? 0) - want));
				}
			});
			if (best === undefined || off < best.off) best = { from, to, mix, off };
		}
	}
	return best !== undefined && best.off <= SLACK ? { from: best.from, to: best.to, mix: best.mix } : undefined;
}

/** Every frame the browser composites for the page, from now until `stop`. */
export async function recordScreen(page: Page) {
	const cdp = await page.context().newCDPSession(page);
	const frames: { png: Buffer; at: number }[] = [];
	cdp.on("Page.screencastFrame", (frame) => {
		frames.push({ png: Buffer.from(frame.data, "base64"), at: frame.metadata.timestamp ?? frames.length });
		void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
	});
	await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
	return {
		/** how many frames are in so far, to read a stretch of them later */
		mark: () => frames.length,
		/** the frames in the order they were composited, which is not always the order they come in */
		async stop() {
			await cdp.send("Page.stopScreencast");
			return frames.sort((a, b) => a.at - b.at).map((frame) => frame.png);
		},
	};
}

/**
 * What the frames showed, in order, each as the slide or two it is (of `looks`); the ground before the first picture, when
 * the talk has not started. Fails on the first frame that is none of that.
 */
export function readScreen(
	frames: readonly Buffer[],
	looks: Record<string, readonly Rgb[]> = slideLooks(),
): { from: string; to: string; mix: number }[] {
	const read: { from: string; to: string; mix: number }[] = [];
	frames.forEach((png, index) => {
		const colours = pixelsOf(png, SCREEN_POINTS);
		if (read.length === 0 && onGround(colours)) return;
		const seen = explainFrame(colours, looks);
		if (seen === undefined) {
			throw new Error(`frame ${index} of ${frames.length} is no slide: ${JSON.stringify(colours)}`);
		}
		read.push(seen);
	});
	return read;
}

/** One frame of a window, as `watchPictures` reads it. */
export interface PictureFrame {
	readonly t: number;
	/** the slide stands where it ends up: the slides fill the screen, or the presenter view is drawn around it */
	readonly landed: boolean;
	/** each picture of a slide one can see in it: how wide it is drawn, in device pixels, and how wide it was made */
	readonly pictures: readonly { readonly drawn: number; readonly made: number }[];
	/** the presenter view's own words, while it is open */
	readonly presenter: string | null;
}

/**
 * Every frame of every page of the context, from its first: the pictures of a slide standing in for it (a cover in the
 * layer it flies in, or over the presenter view), and when the stage that draws the slide itself first said it showed
 * one. The presenter view's next pane is not that stage, nor is a slide on the canvas.
 */
export async function watchPictures(context: BrowserContext): Promise<void> {
	await context.addInitScript(() => {
		const frames: unknown[] = [];
		let drawn: number | null = null;
		Object.defineProperty(window, "__pictures", { value: { frames, drawn: () => drawn } });
		addEventListener(
			"message",
			(event) => {
				if ((event.data as { spool?: unknown } | null)?.spool !== "stage-connect") return;
				const frame = [...document.querySelectorAll("iframe")].find((one) => one.contentWindow === event.source);
				if (frame === undefined || !frame.closest("[data-deck-slide], [data-present-live]")) return;
				event.ports[0]?.addEventListener("message", (message) => {
					if ((message.data as { spool?: unknown } | null)?.spool === "stage-shown") drawn ??= performance.now();
				});
			},
			true,
		);
		const seen = (element: Element): number => {
			let opacity = 1;
			for (let at: Element | null = element; at !== null; at = at.parentElement) {
				opacity *= Number(getComputedStyle(at).opacity);
			}
			return opacity;
		};
		const tick = () => {
			const pictures: { drawn: number; made: number }[] = [];
			for (const img of document.querySelectorAll<HTMLImageElement>(
				"[data-present-flyer] img, [data-deck-travel] img",
			)) {
				// the live slide stands over the picture it flies with
				const live = img.closest("[data-present-flyer]")?.querySelector("[data-present-live]");
				const shows = seen(img) * (live ? 1 - seen(live) : 1);
				if (shows < 0.01) continue;
				pictures.push({ drawn: img.getBoundingClientRect().width * devicePixelRatio, made: img.naturalWidth });
			}
			const presenter = document.querySelector<HTMLElement>("[data-deck-presenter]");
			frames.push({
				t: performance.now(),
				landed:
					document.querySelector('[data-present-slides="on"]') !== null ||
					(presenter !== null && presenter.style.opacity !== "0"),
				pictures,
				presenter: presenter?.textContent ?? null,
			});
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

/** The frames `watchPictures` read in a page, and when its slide's own stage first showed one. */
export const picturesOf = (page: Page) =>
	page.evaluate(() => {
		const read = (window as unknown as { __pictures: { frames: PictureFrame[]; drawn: () => number | null } })
			.__pictures;
		return { frames: read.frames, drawn: read.drawn() };
	});

/**
 * The frames, once the slide has landed and a frame has passed since its stage drew it, where a picture smaller than
 * it is drawn still stands for it: a thumbnail stretched over a slide that is there to be seen sharp (spool#316).
 */
export function stretched({ frames, drawn }: { frames: readonly PictureFrame[]; drawn: number | null }): number[] {
	if (drawn === null) return [];
	const next = frames.findIndex((frame) => frame.t > drawn);
	if (next < 0) return [];
	return frames.flatMap((frame, at) =>
		at > next && frame.landed && frame.pictures.some((picture) => picture.made < picture.drawn - 1) ? [at] : [],
	);
}

/**
 * The frames where a picture stands drawn bigger than it was made, from the first frame on: a slide flown as its opening
 * still, made at the size a talk draws it, is sharp the whole way (spool#319).
 */
export function everStretched({ frames }: { frames: readonly PictureFrame[] }): number[] {
	return frames.flatMap((frame, at) =>
		frame.pictures.some((picture) => picture.made < picture.drawn - 1) ? [at] : [],
	);
}

/** A frame's cover as a served project lists it: its address, and its opening still's when it is a slide with one. */
export async function coverOf(
	project: { url: string; name: string; controlToken: string },
	frame: string,
): Promise<{ hash: string; opening?: string } | undefined> {
	const res = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, {
		headers: { "X-Spool-Control": project.controlToken },
	});
	const { frames } = (await res.json()) as { frames: { name: string; cover?: { hash: string; opening?: string } }[] };
	return frames.find((one) => one.name === frame)?.cover;
}
