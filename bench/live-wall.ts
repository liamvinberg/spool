import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";
import { type Browser, type CDPSession, chromium, type Frame, type Page } from "playwright-core";
import {
	type BenchState,
	type Camera,
	collector,
	copyProject,
	DEFAULT_ZOOM,
	type FrameBox,
	freePort,
	median,
	namedPage,
	oneMinuteLoad,
	planCamera,
	prepareCurrentCovers,
	quantile,
	settleOnFrames,
	startDaemon,
	VIEWPORT,
	WHEEL_INTERVAL_MS,
	waitForMountedFramesLoaded,
	writeCamera,
} from "./harness.ts";

/**
 * How live the wall of frames is, and what it costs (spool#218, row "wall").
 *
 * A page of animated frames at the working zoom where the canvas holds the
 * most live documents: just past the size a frame has to be drawn at to go
 * live (`LIVE_MIN_CSS_PX`, 400 CSS px on its larger edge, src/cover.ts), so
 * the ring around the viewport admits as many as it ever will. Measured at
 * Retina density (deviceScaleFactor 2), headed:
 *
 *   - the canvas page's own animation frame intervals, 5 s at rest and then
 *     5 s of wheel pan (paced as `driveRoundTripWheel` paces it);
 *   - in every live frame's document, the animation frames in which its code
 *     got a rAF callback, counted by wrapping the rAF the frame shim installs
 *     (frame-shim/freeze.ts), so a frame the canvas holds still counts nothing;
 *   - the browser's renderer and GPU memory with the wall live, against the
 *     same page a hair below the live zoom, where every frame is a still;
 *   - how many renderer processes the frame documents take: the browser's
 *     renderers with the wall live less those with every frame a still (a
 *     busy loop per frame, the pid whose cpu jumps, misattributed on a loaded
 *     machine);
 *   - every live <canvas>'s backing store against the device pixels it is
 *     drawn over: nothing scales a frame's devicePixelRatio by the zoom.
 *
 * Then the same on the `dither` page (12 frames of 30 fps 2D canvas), under
 * keys prefixed `dither_`. Two knobs check that the frame rates measure what
 * spool does to the frames and not the bench: `--rest-after 65000` leaves the
 * wall alone past the minute after which the canvas holds every unattended
 * frame (#172) before the rest window, and `--no-freeze` sets the canvas's
 * bench hook (`__spoolBench.freeze`, ui/canvas/lifecycle.ts) so nothing is
 * ever held.
 *
 *   pnpm build
 *   flock /tmp/spool-loop-218.lock xvfb-run -a -s "-screen 0 1920x1080x24" \
 *     node bench/live-wall.ts --project ~/dev/scratch/spool-bench --out wall.json
 *
 * Run with node's own type stripping, not tsx: see bench/harness.ts.
 */

interface Options {
	project: string;
	out: string;
	pages: string[];
	freeze: boolean;
	restAfterMs: number;
}

function parseArgs(argv: string[]): Options {
	let project = "";
	let out = "";
	let pages = ["burn050", "dither"];
	let freeze = true;
	let restAfterMs = 0;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else if (arg === "--pages" && next !== undefined) {
			pages = next.split(",");
			i++;
		} else if (arg === "--rest-after" && next !== undefined) {
			restAfterMs = Number(next);
			i++;
		} else if (arg === "--no-freeze") {
			freeze = false;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	if (project === "") throw new Error("--project <spool-bench> is required");
	if (out === "") throw new Error("--out <file> is required");
	return { project, out, pages, freeze, restAfterMs };
}

/** The drawn size a frame's larger edge needs to go live: `LIVE_MIN_CSS_PX`, src/cover.ts. */
const LIVE_MIN_CSS_PX = 400;
/** How far past that threshold the working zoom sits, so rounding never leaves a frame a still. */
const LIVE_HEADROOM = 1.02;
/** The stills baseline's zoom, as a share of the threshold: every frame a picture, the layout all but the same. */
const STILL_SHARE = 0.97;
const DEVICE_SCALE = 2;
const REST_MS = 5000;
const PAN_MS = 5000;
const PAN_STEP_PX = 10;
/** The pan's legs, each a sixth of it: out, back past home, and home, about 500 CSS px either way. */
const PAN_LEGS = [1, -1, -1, 1, 1, -1];
/** A live frame at or above this share of the display's rate runs at the rate it was written for. */
const FULL_RATE_SHARE = 0.9;
/** An interval past this many display intervals is a dropped canvas frame. */
const DROPPED_FACTOR = 1.5;

/**
 * Installed in every document. In a frame document it wraps the rAF the frame
 * shim installs over the native one (frame-shim/freeze.ts) and stamps, on the
 * epoch clock every document shares, each animation frame in which frame code
 * got a callback: one stamp per distinct rAF timestamp, so two loops in one
 * document, or one slow callback, are still one animation frame. The shim's own native rAF, taken before it gates, stays
 * unwrapped, so its settle and its thaws are not counted as the frame running.
 */
function frameRafCounter(): void {
	if (window === window.top) return;
	const stamps: number[] = [];
	const probe = { stamps, wrapped: "never" };
	(globalThis as unknown as { __wallRaf: typeof probe }).__wallRaf = probe;
	// every callback of one animation frame is handed the same timestamp
	let lastTime = Number.NaN;
	const counting =
		(gated: typeof requestAnimationFrame) =>
		(callback: FrameRequestCallback): number =>
			gated.call(window, (time: number) => {
				if (time !== lastTime) {
					lastTime = time;
					stamps.push(performance.timeOrigin + performance.now());
				}
				callback(time);
			});
	let current = window.requestAnimationFrame;
	if (!String(current).includes("[native code]")) {
		// the shim got here first
		current = counting(current);
		probe.wrapped = "at start";
	}
	Object.defineProperty(window, "requestAnimationFrame", {
		configurable: true,
		get: () => current,
		set: (gated: typeof requestAnimationFrame) => {
			current = counting(gated);
			probe.wrapped = "on set";
		},
	});
}

const epochNow = (page: Page): Promise<number> => page.evaluate(() => performance.timeOrigin + performance.now());

/** The canvas page's animation frame intervals between two epoch stamps. */
async function canvasIntervals(page: Page, from: number, to: number): Promise<number[]> {
	const raf = await page.evaluate(
		([a, b]) => {
			const state = (globalThis as unknown as { __bench: BenchState }).__bench;
			const origin = performance.timeOrigin;
			return state.raf.filter((s) => s.t + origin >= a && s.t + origin <= b).map((s) => s.d);
		},
		[from, to] as const,
	);
	return raf.sort((a, b) => a - b);
}

interface LiveFrame {
	frame: Frame;
	title: string;
	/** The iframe's drawn width over its laid-out width: the zoom it is shown at. */
	scale: number;
	onScreen: boolean;
}

/** Every iframe on the canvas that holds a frame document, with how it is drawn. */
async function liveFrames(page: Page): Promise<LiveFrame[]> {
	const found: LiveFrame[] = [];
	for (const frame of page.frames()) {
		if (frame === page.mainFrame() || !frame.url().includes("run.spool.localhost")) continue;
		const element = await frame.frameElement().catch(() => undefined);
		if (element === undefined) continue;
		const drawn = await element.evaluate((el) => {
			const iframe = el as HTMLIFrameElement;
			const rect = iframe.getBoundingClientRect();
			return {
				title: iframe.title,
				scale: iframe.offsetWidth > 0 ? rect.width / iframe.offsetWidth : 0,
				onScreen: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
			};
		});
		found.push({ frame, ...drawn });
	}
	return found;
}

interface RateWindow {
	fps: number[];
	fullRate: number;
	/** The median rate of the live frames on screen: Chromium stops an off-screen cross-origin frame's rAF itself. */
	onScreenMedian: number;
}

async function frameRates(
	frames: readonly LiveFrame[],
	from: number,
	to: number,
	display: number,
): Promise<RateWindow> {
	const fps: number[] = [];
	const how: string[] = [];
	for (const live of frames) {
		how.push(
			await live.frame
				.evaluate(
					() => (globalThis as unknown as { __wallRaf?: { wrapped: string } }).__wallRaf?.wrapped ?? "absent",
				)
				.catch(() => "gone"),
		);
		const count = await live.frame
			.evaluate(
				([a, b]) =>
					(globalThis as unknown as { __wallRaf?: { stamps: number[] } }).__wallRaf?.stamps.filter(
						(t) => t >= a && t <= b,
					).length ?? Number.NaN,
				[from, to] as const,
			)
			.catch(() => 0);
		fps.push(count / ((to - from) / 1000));
	}
	process.stderr.write(
		`bench: rAF counters ${JSON.stringify(Object.fromEntries(how.map((h) => [h, how.filter((x) => x === h).length])))}\n`,
	);
	return {
		fps,
		fullRate: fps.filter((rate) => rate >= display * FULL_RATE_SHARE).length,
		onScreenMedian: median(fps.filter((_, index) => frames[index]?.onScreen === true)),
	};
}

interface Memory {
	rssMb: number;
	privateMb: number;
	renderers: number;
}

const privateKb = (pid: number): number => {
	if (platform() !== "linux") return Number.NaN;
	try {
		const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
		let kb = 0;
		for (const match of rollup.matchAll(/^Private_(?:Clean|Dirty):\s+(\d+) kB/gm)) kb += Number(match[1]);
		return kb;
	} catch {
		return Number.NaN;
	}
};

/** Renderer and GPU processes, resident (as frame-cost.ts reads it) and private. */
async function memory(session: CDPSession): Promise<Memory> {
	const { processInfo } = await session.send("SystemInfo.getProcessInfo");
	const pids = processInfo.filter((info) => info.type === "renderer" || info.type === "GPU").map((info) => info.id);
	let rssKb = 0;
	const out = execFileSync("ps", ["-o", "rss=", "-p", pids.join(",")], { encoding: "utf8" });
	for (const line of out.split("\n")) {
		const kb = Number(line.trim());
		if (line.trim() !== "" && Number.isFinite(kb)) rssKb += kb;
	}
	return {
		rssMb: rssKb / 1024,
		privateMb: pids.reduce((sum, pid) => sum + privateKb(pid), 0) / 1024,
		renderers: processInfo.filter((info) => info.type === "renderer").length,
	};
}

/** Three readings a second apart, their medians: one GC landing on a reading is not the wall's cost. */
async function settledMemory(page: Page, session: CDPSession): Promise<Memory> {
	const readings: Memory[] = [];
	for (let i = 0; i < 3; i++) {
		if (i > 0) await page.waitForTimeout(1000);
		readings.push(await memory(session));
	}
	return {
		rssMb: median(readings.map((r) => r.rssMb)),
		privateMb: median(readings.map((r) => r.privateMb)),
		renderers: median(readings.map((r) => r.renderers)),
	};
}

/** Every live canvas's backing store over the device pixels its box is drawn over. */
async function pixelRatio(frames: readonly LiveFrame[]): Promise<{ ratio: number; canvases: number; dpr: number }> {
	let backing = 0;
	let shown = 0;
	let canvases = 0;
	let dpr = Number.NaN;
	for (const live of frames) {
		const inside = await live.frame
			.evaluate(() => ({
				dpr: devicePixelRatio,
				canvases: [...document.querySelectorAll("canvas")].map((c) => ({
					backing: c.width * c.height,
					css: c.clientWidth * c.clientHeight,
				})),
			}))
			.catch(() => ({ dpr: Number.NaN, canvases: [] }));
		dpr = inside.dpr;
		for (const canvas of inside.canvases) {
			if (canvas.css === 0) continue;
			canvases++;
			backing += canvas.backing;
			shown += canvas.css * (live.scale * DEVICE_SCALE) ** 2;
		}
	}
	return { ratio: shown > 0 ? backing / shown : Number.NaN, canvases, dpr };
}

function centred(camera: Camera, k: number): Camera {
	const cx = (VIEWPORT.width / 2 - camera.x) / camera.k;
	const cy = (VIEWPORT.height / 2 - camera.y) / camera.k;
	return { x: VIEWPORT.width / 2 - cx * k, y: VIEWPORT.height / 2 - cy * k, k };
}

interface WallResult {
	metrics: Record<string, number>;
	detail: Record<string, unknown>;
}

async function openCanvas(
	freeze: boolean,
	url: string,
): Promise<{ browser: Browser; page: Page; session: CDPSession; openedAt: number }> {
	// Emulating the scale through the context reaches the canvas page but not its
	// out-of-process frames, which then report a devicePixelRatio of 1: forcing it
	// on the browser gives every document the Retina screen's
	const browser = await chromium.launch({
		channel: "chromium",
		headless: false,
		args: [`--force-device-scale-factor=${DEVICE_SCALE}`],
	});
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE });
	if (!freeze) {
		await context.addInitScript(() => {
			(globalThis as unknown as { __spoolBench: unknown }).__spoolBench = { freeze: false };
		});
	}
	await context.addInitScript(collector);
	await context.addInitScript(frameRafCounter);
	const page = await context.newPage();
	page.on("pageerror", (error) => process.stderr.write(`bench: page error ${String(error).slice(0, 200)}\n`));
	const session = await browser.newBrowserCDPSession();
	const openedAt = Date.now();
	await page.goto(url, { waitUntil: "domcontentloaded" });
	await settleOnFrames(page, 1500, 90_000);
	await waitForMountedFramesLoaded(page, 60_000);
	return { browser, page, session, openedAt };
}

async function measureWall(
	root: string,
	url: string,
	pageName: string,
	freeze: boolean,
	restAfterMs: number,
): Promise<WallResult> {
	const boxes: FrameBox[] = namedPage(root, pageName).frames;
	const edge = Math.max(...boxes.map((box) => Math.max(box.w, box.h)));
	const k = (LIVE_MIN_CSS_PX / edge) * LIVE_HEADROOM;
	// the middle of the page, so the ring around the viewport lies across as much of the wall as it can
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.w));
	const bottom = Math.max(...boxes.map((box) => box.y + box.h));
	const camera: Camera = {
		x: VIEWPORT.width / 2 - ((left + right) / 2) * k,
		y: VIEWPORT.height / 2 - ((top + bottom) / 2) * k,
		k,
	};

	// the same page with every frame a still: the memory floor and the display's own rate
	writeCamera(root, centred(camera, k * (STILL_SHARE / LIVE_HEADROOM)), pageName);
	const still = await openCanvas(freeze, url);
	let stillMemory: Memory;
	let displayFps: number;
	let stillLive: number;
	try {
		stillLive = (await liveFrames(still.page)).length;
		await still.page.waitForTimeout(2000);
		const from = await epochNow(still.page);
		await still.page.waitForTimeout(2000);
		const intervals = await canvasIntervals(still.page, from, await epochNow(still.page));
		displayFps = 1000 / quantile(intervals, 0.5);
		stillMemory = await settledMemory(still.page, still.session);
	} finally {
		await still.browser.close();
	}
	process.stderr.write(
		`bench: ${pageName} stills at k=${(camera.k * (STILL_SHARE / LIVE_HEADROOM)).toFixed(3)}: ${stillLive} live, display ${displayFps.toFixed(1)} fps, ${stillMemory.rssMb.toFixed(0)} MB\n`,
	);

	writeCamera(root, camera, pageName);
	const wall = await openCanvas(freeze, url);
	try {
		const { page, session } = wall;
		const frames = await liveFrames(page);
		const readyMs = Date.now() - wall.openedAt;
		const displayInterval = 1000 / displayFps;
		const dropped = (intervals: number[]): number =>
			intervals.filter((d) => d > displayInterval * DROPPED_FACTOR).length;

		// at rest: nothing touched, the pointer off the frames
		await page.waitForTimeout(500 + restAfterMs);
		const restFrom = await epochNow(page);
		await page.waitForTimeout(REST_MS);
		const restTo = await epochNow(page);
		const liveMemory = await settledMemory(page, session);

		// The pan: a wheel step every display frame, swept back and forth across
		// the wall and home again, so the frames it measures stay the ones in view.
		// Sent the way a hand sends them, on the clock and not waiting for the
		// canvas to take each one: a canvas the wall holds back would otherwise
		// stretch five seconds of pan into however long it takes to draw them.
		await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
		await page.waitForTimeout(300);
		const input = await page.context().newCDPSession(page);
		const steps = Math.round(PAN_MS / WHEEL_INTERVAL_MS);
		const legs = PAN_LEGS.length;
		const sent: Promise<unknown>[] = [];
		const panFrom = await epochNow(page);
		const started = performance.now();
		for (let step = 0; step < steps; step++) {
			const direction = PAN_LEGS[Math.min(legs - 1, Math.floor((step * legs) / steps))] as number;
			sent.push(
				input.send("Input.dispatchMouseEvent", {
					type: "mouseWheel",
					x: VIEWPORT.width / 2,
					y: VIEWPORT.height / 2,
					deltaX: direction * PAN_STEP_PX,
					deltaY: direction * PAN_STEP_PX,
				}),
			);
			const delay = started + (step + 1) * WHEEL_INTERVAL_MS - performance.now();
			if (delay > 0) await new Promise((wait) => setTimeout(wait, delay));
		}
		const panTo = await epochNow(page);
		await Promise.all(sent);
		const panTakenMs = performance.now() - started;
		await input.detach();
		const detachedByPan = frames.filter((f) => f.frame.isDetached()).length;

		const restCanvas = await canvasIntervals(page, restFrom, restTo);
		const panCanvas = await canvasIntervals(page, panFrom, panTo);
		const rest = await frameRates(frames, restFrom, restTo, displayFps);
		const pan = await frameRates(frames, panFrom, panTo, displayFps);

		// the camera is home; a frame the sweep remounted is a new Frame
		await page.waitForTimeout(1000);
		const after = await liveFrames(page);
		const pixels = await pixelRatio(after);
		const live = frames.length;

		return {
			metrics: {
				zoom: camera.k,
				live_frames_count: live,
				on_screen_live_count: frames.filter((f) => f.onScreen).length,
				display_fps: displayFps,
				rest_canvas_p95_ms: quantile(restCanvas, 0.95),
				rest_canvas_dropped_count: dropped(restCanvas),
				rest_frames_full_rate_count: rest.fullRate,
				rest_frame_raf_median_fps: rest.onScreenMedian,
				pan_canvas_p95_ms: quantile(panCanvas, 0.95),
				pan_canvas_dropped_count: dropped(panCanvas),
				pan_frames_full_rate_count: pan.fullRate,
				pan_frame_raf_median_fps: pan.onScreenMedian,
				mem_per_live_mb: live > 0 ? (liveMemory.rssMb - stillMemory.rssMb) / live : Number.NaN,
				mem_per_live_private_mb: live > 0 ? (liveMemory.privateMb - stillMemory.privateMb) / live : Number.NaN,
				frame_renderer_count: liveMemory.renderers - stillMemory.renderers,
				pixel_ratio: pixels.ratio,
			},
			detail: {
				page: pageName,
				frames: boxes.length,
				camera,
				readyMs,
				stillLive,
				stillMemory,
				liveMemory,
				canvases: pixels.canvases,
				frameDpr: pixels.dpr,
				restFps: Object.fromEntries(frames.map((f, i) => [f.title, rest.fps[i]])),
				panFps: Object.fromEntries(frames.map((f, i) => [f.title, pan.fps[i]])),
				panTakenMs,
				detachedByPan,
				insertions: await page.evaluate(
					([from]) => {
						const state = (globalThis as unknown as { __bench: BenchState }).__bench;
						return state.inserted.map(
							(s) => `${s.frame.split("/").pop()}@${Math.round(s.t + performance.timeOrigin - from)}`,
						);
					},
					[restFrom] as const,
				),
				detachedByEnd: frames.filter((f) => f.frame.isDetached()).length,
				restCanvasFrames: restCanvas.length,
				panCanvasFrames: panCanvas.length,
			},
		};
	} finally {
		await wall.browser.close();
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const load = oneMinuteLoad();
	const { root, name, spoolDir } = copyProject(options.project);
	const daemon = await startDaemon(spoolDir, root, await freePort());
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	try {
		const first = namedPage(root, options.pages[0] as string).frames;
		writeCamera(root, planCamera(first, VIEWPORT.width, VIEWPORT.height, DEFAULT_ZOOM), first[0]?.page);
		const coverBrowser = await chromium.launch({ channel: "chromium", headless: false });
		try {
			await prepareCurrentCovers(coverBrowser, daemon, url, root, first);
		} finally {
			await coverBrowser.close();
		}
		const metrics: Record<string, number> = {};
		const detail: Record<string, unknown> = {};
		for (const [index, pageName] of options.pages.entries()) {
			const prefix = index === 0 ? "" : `${pageName}_`;
			const result = await measureWall(root, url, pageName, options.freeze, options.restAfterMs);
			for (const [key, value] of Object.entries(result.metrics)) metrics[`${prefix}${key}`] = value;
			detail[pageName] = result.detail;
			process.stderr.write(`bench: ${pageName} ${JSON.stringify(result.metrics)}\n`);
		}
		const report = {
			metrics,
			load,
			loadAfter: oneMinuteLoad(),
			freeze: options.freeze,
			restAfterMs: options.restAfterMs,
			detail,
		};
		writeFileSync(options.out, `${JSON.stringify(report, null, "\t")}\n`);
		process.stdout.write(`${JSON.stringify(metrics, null, "\t")}\n`);
	} finally {
		daemon.stop();
	}
}

await main();
