import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, type CDPSession, chromium, type Page } from "playwright-core";
import {
	type BenchState,
	collector,
	copyProject,
	DEFAULT_ZOOM,
	densestPage,
	driveRoundTripWheel,
	framesOnCanvas,
	freePort,
	type GestureStats,
	mountedCount,
	ms,
	namedPage,
	now,
	PAN_EVENTS,
	PAN_STEP_PX,
	planCamera,
	prepareCurrentCovers,
	quantile,
	quiet,
	RARE_INTERVAL_MS,
	read,
	type Stamped,
	settle,
	startDaemon,
	VIEWPORT,
	windowStats,
	writeCamera,
	ZOOM_EVENTS,
	ZOOM_STEP_PX,
} from "./harness.ts";

/**
 * The canvas benchmark (#82). Drives a real spool canvas through the gestures
 * the performance map names and reports where each bar breaks.
 *
 * The pressure axis is Chromium's CPU throttling rate, not the host machine's
 * power state: a rate reproduces on any machine, and turns "it felt slow once"
 * into a headroom number, the multiplier at which a bar first misses.
 *
 * Wheel input is paced at 60 events per second. A burst can make a browser
 * benchmark measure its driver instead of a trackpad gesture. The report keeps
 * p95, worst, and intervals above the #132 rare-interval threshold separate.
 *
 * #132's 20 balanced pairs put readable minus picture p95 at -0.050 ms,
 * with a paired bootstrap interval of -0.105 to +0.010 ms. The old 5 to 8 ms
 * penalty is absent. Rare intervals above 12 ms remain separate: 0/20 picture
 * runs and 4/20 readable runs untraced, then 2/50 and 4/50 in a separate traced
 * sample. Only selected readable pairs 3, 11, 17, and 33 support the scoped
 * child-renderer/GPU raster synchronization attribution. Count and full
 * area were confounded, and viewport area was observed only at the endpoints,
 * so the evidence supports no scaling or knee claim. #140 owns the
 * equal-geometry animation question.
 *
 * The rate is applied to every frame as well as the page. In a real browser the
 * frames do not share the page's renderer, so throttling the page alone would
 * model a slow canvas driving fast frames, which is not a machine anyone owns.
 * They do share one renderer with *each other*: `bench/frame-cost.ts` (#85) read
 * Chromium's own process list and found every count from 1 to 80 mounted frames
 * adding exactly one renderer process. `chromium-headless-shell` instead puts
 * the frames in the page's own renderer, which is why the two modes disagree so
 * sharply; headed is the one to believe.
 *
 * The run never touches the project it measures. `design/` is copied to a
 * temporary root with its own daemon, spool dir and port, so the source canvas
 * keeps its camera, its stills and its uncommitted work.
 *
 *   pnpm build && node bench/canvas.ts --project <spool-bench>
 *   node bench/canvas.ts --project <spool-bench> --zoom 0.16 --headed
 *   node bench/canvas.ts --project <path> --throttle 1,2,4,6 --headed --out run.json
 *
 * The default measures entry into a readable document. The 0.16 command keeps
 * the historical cold overview-entry route visible.
 *
 * Run it with node's own type stripping, not tsx: the collector below is
 * serialized into the page by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

interface Options {
	project: string;
	throttle: number[];
	headed: boolean;
	zoom: number;
	out: string | undefined;
	/** Which page to measure; the densest one when unnamed. */
	page: string | undefined;
}

/** Generated frames draw 540 CSS px wide here, above the 400 px readable threshold. */
const CANVAS_ZOOM = 0.45;

function parseArgs(argv: string[]): Options {
	let project = "";
	let throttle = [1, 2, 4, 6];
	let headed = false;
	let zoom = CANVAS_ZOOM;
	let out: string | undefined;
	let page: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--throttle" && next !== undefined) {
			throttle = next.split(",").map((rate) => Number(rate.trim()));
			i++;
		} else if (arg === "--zoom" && next !== undefined) {
			zoom = Number(next);
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else if (arg === "--page" && next !== undefined) {
			page = next;
			i++;
		} else if (arg === "--headed") {
			headed = true;
		} else if (arg === "--headless") {
			headed = false;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	if (project === "") throw new Error("--project <path to a spool project root> is required");
	if (throttle.some((rate) => !Number.isFinite(rate) || rate < 1)) throw new Error("--throttle takes rates >= 1");
	if (!Number.isFinite(zoom) || zoom <= 0) throw new Error("--zoom takes a positive scale");
	return { project, throttle, headed, zoom, out, page };
}

/** Wait until every document mounted now has completed its latest boot. */
async function waitForMountedFramesLoaded(page: Page, timeoutMs: number): Promise<void> {
	const pending = async (): Promise<string[]> =>
		page.evaluate(() => {
			const state = (globalThis as unknown as { __bench: BenchState }).__bench;
			const latest = (stamps: Stamped[]): Map<string, number> => {
				const byFrame = new Map<string, number>();
				for (const stamp of stamps) {
					byFrame.set(stamp.frame, Math.max(byFrame.get(stamp.frame) ?? -Infinity, stamp.t));
				}
				return byFrame;
			};
			const inserted = latest(state.inserted);
			const loaded = latest(state.loaded);
			const mounted = new Set([...document.querySelectorAll("iframe")].map((frame) => frame.title));
			return [...mounted].filter((name) => {
				const insertedAt = inserted.get(name);
				return insertedAt === undefined || (loaded.get(name) ?? -Infinity) < insertedAt;
			});
		});

	const deadline = Date.now() + timeoutMs;
	let names = await pending();
	while (names.length > 0 && Date.now() < deadline) {
		await page.waitForTimeout(150);
		names = await pending();
	}
	if (names.length === 0) return;
	const sample = names.slice(0, 6).join(", ");
	throw new Error(
		`${names.length} mounted documents did not report loaded after their latest insertion within ${timeoutMs / 1000} s` +
			` (${sample}${names.length > 6 ? ", …" : ""})`,
	);
}

const ENTER_TIMEOUT_MS = 8000; // 20x the bar: past this it did not happen at all

interface RunResult {
	rate: number;
	refreshMs: number;
	idleMounted: number;
	/** Mounted frames that accepted a CDP session, and so were throttled by name. */
	throttledFrames: number;
	pan: GestureStats;
	zoom: GestureStats;
	arrivalP50: number;
	arrivalWorst: number;
	arrivals: number;
	enterMs: number;
	reloadMs: number;
}

/**
 * Throttling the page target reaches the canvas UI's renderer and nothing else,
 * and the frames are not in it — so a page-only throttle models a slow canvas
 * driving fast frames, which is not a machine anyone owns. Every frame is named
 * explicitly; the ones already covered by the page session reject it.
 *
 * The count this returns is **not** a count of frames in their own process, and
 * an earlier version of this file said it was. `newCDPSession` attaches to a
 * frame whether or not Chromium gave it a process, so the 35 it reports at 35
 * mounted frames says only that all 35 were throttled. For process structure,
 * `bench/frame-cost.ts` reads `SystemInfo.getProcessInfo` directly, and finds
 * all mounted frames sharing a single renderer.
 */
async function throttleEveryFrame(context: BrowserContext, page: Page, rate: number): Promise<number> {
	let throttled = 0;
	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		try {
			const session = await context.newCDPSession(frame);
			await session.send("Emulation.setCPUThrottlingRate", { rate });
			throttled++;
		} catch {
			// already covered by the page session
		}
	}
	return throttled;
}

async function measure(
	page: Page,
	context: BrowserContext,
	cdp: CDPSession,
	rate: number,
	url: string,
): Promise<RunResult> {
	await cdp.send("Emulation.setCPUThrottlingRate", { rate });
	// frames mounted mid-run are throttled as they attach; the sweep after the
	// canvas settles catches the ones whose process was not ready in time
	page.on("frameattached", (frame) => {
		void context
			.newCDPSession(frame)
			.then((session) => session.send("Emulation.setCPUThrottlingRate", { rate }))
			.catch(() => undefined);
	});

	// --- reload: navigation to a canvas that has stopped changing ------------
	const reloadStart = Date.now();
	await page.goto(url, { waitUntil: "domcontentloaded" });
	const settled = await settle(page, 1000, 30_000);
	const reloadMs = settled.stableAt - reloadStart;
	const borrowedAfterReload = await quiet(page, 120_000);
	if (borrowedAfterReload !== 0) throw new Error(`${borrowedAfterReload} picture errands remained after reload`);
	const idleMounted = await mountedCount(page);
	// A canvas showing nothing is fast at everything, and every bar below would
	// report a pass over an empty screen. The camera is planned over real frames,
	// so this only happens when the canvas opened somewhere else — the warm
	// pass's own persisted state landing after the planned camera was written.
	// Loud, because the numbers would otherwise look like good news.
	//
	// Frames, not documents: a valid readable canvas can hold documents or
	// stills, and an empty one makes every row look fast.
	const framesShown = await framesOnCanvas(page);
	if (framesShown === 0) {
		throw new Error(
			"the canvas settled with no frames on screen — the planned camera did not take, so this run would measure an empty screen",
		);
	}
	const throttledFrames = await throttleEveryFrame(context, page, rate);
	await waitForMountedFramesLoaded(page, 120_000);

	const state0 = await read(page);
	process.stderr.write(
		`bench:   settled ${idleMounted} documents, ${framesShown} frames on the page (${throttledFrames} throttled by name), ${state0.raf.length} animation frames sampled\n`,
	);
	// the display's own cadence, measured rather than assumed: the p95 bar is
	// "within one refresh plus slack", and a 120 Hz panel is not a 60 Hz one
	const idle = state0.raf
		.slice(-90)
		.map((sample) => sample.d)
		.sort((a, b) => a - b);
	const refreshMs = quantile(idle, 0.5);

	const size = page.viewportSize() ?? VIEWPORT;
	const cx = Math.round(size.width / 2);
	const cy = Math.round(size.height / 2);

	// Both gestures are round trips — out and back — so every rate starts its
	// double-click from the camera it started the run with, and one rate's
	// drift cannot become the next measurement's starting position.

	// --- pan -----------------------------------------------------------------
	await page.mouse.move(cx, cy);
	await page.waitForTimeout(400);
	const panFrom = await now(page);
	await driveRoundTripWheel(page, PAN_EVENTS, PAN_STEP_PX, PAN_STEP_PX);
	const panTo = await now(page);

	await page.waitForTimeout(800);

	// --- zoom ----------------------------------------------------------------
	// ZOOM_STEP_PX is trackpad-sized: the canvas zooms by exp(-px * 0.011) per
	// event, so a mouse-notch-sized step compounds to hundreds of times over a
	// gesture and lands somewhere no person would ever be.
	await page.keyboard.down("Control");
	const zoomFrom = await now(page);
	await driveRoundTripWheel(page, ZOOM_EVENTS, 0, -ZOOM_STEP_PX);
	const zoomTo = await now(page);
	await page.keyboard.up("Control");

	await settle(page, 800, 20_000);

	// --- double-click into the frame nearest the middle ----------------------
	// Nothing the canvas is doing on its own may still be in flight. Readable
	// documents remain mounted; only hidden picture errands have to finish.
	const borrowedBeforeEntry = await quiet(page, 120_000);
	if (borrowedBeforeEntry !== 0) throw new Error(`${borrowedBeforeEntry} picture errands remained before entry`);
	await waitForMountedFramesLoaded(page, 120_000);

	// The frame showing the most of itself. A readable frame draws its document;
	// the rest draw stills. A partly-offscreen frame's centre can sit outside the
	// window.
	const target = await page.evaluate(() => {
		let best: { x: number; y: number; area: number } | null = null;
		for (const frame of document.querySelectorAll("[data-frame-cover], iframe")) {
			const box = frame.getBoundingClientRect();
			const left = Math.max(0, box.left);
			const top = Math.max(0, box.top);
			const right = Math.min(innerWidth, box.right);
			const bottom = Math.min(innerHeight, box.bottom);
			const area = Math.max(0, right - left) * Math.max(0, bottom - top);
			if (area < 2500) continue;
			if (best === null || area > best.area) best = { x: (left + right) / 2, y: (top + bottom) / 2, area };
		}
		return best;
	});

	// clickable = the entered document owns pointer input
	const clickable = () =>
		page.waitForFunction(
			() =>
				[...document.querySelectorAll("iframe")].some(
					(frame) => getComputedStyle(frame).pointerEvents === "auto" && frame.style.visibility !== "hidden",
				),
			undefined,
			{ timeout: ENTER_TIMEOUT_MS },
		);

	// A timeout is not a measurement. Under throttling the two clicks can drift
	// far enough apart that the browser never calls them a double-click, and
	// recording the wait as if it were the answer would put a 20-second entry in
	// the baseline that no person ever experienced. Try twice, then say so.
	let enterMs = Number.NaN;
	for (let attempt = 0; target !== null && attempt < 2 && !Number.isFinite(enterMs); attempt++) {
		if (attempt > 0) {
			await page.keyboard.press("Escape");
			await page.waitForTimeout(600);
		}
		const enterStart = Date.now();
		await page.mouse.dblclick(Math.round(target.x), Math.round(target.y));
		const reached = await clickable().then(
			() => true,
			() => false,
		);
		if (reached) enterMs = Date.now() - enterStart;
	}

	const state = await read(page);
	const pan = windowStats(state, panFrom, panTo);
	const zoom = windowStats(state, zoomFrom, zoomTo);

	// --- arrival: a mounted document to its own loaded report -----------------
	const firstInsert = new Map<string, number>();
	for (const entry of state.inserted) if (!firstInsert.has(entry.frame)) firstInsert.set(entry.frame, entry.t);
	const arrivals: number[] = [];
	const seen = new Set<string>();
	for (const entry of state.loaded) {
		const inserted = firstInsert.get(entry.frame);
		if (inserted === undefined || seen.has(entry.frame)) continue;
		seen.add(entry.frame);
		if (entry.t >= inserted) arrivals.push(entry.t - inserted);
	}
	arrivals.sort((a, b) => a - b);

	return {
		rate,
		refreshMs,
		idleMounted,
		throttledFrames,
		pan,
		zoom,
		arrivalP50: quantile(arrivals, 0.5),
		arrivalWorst: arrivals.at(-1) ?? Number.NaN,
		arrivals: arrivals.length,
		enterMs,
		reloadMs,
	};
}

function table(results: RunResult[], zoom: number): string {
	const entryScope = zoom === CANVAS_ZOOM ? `readable at k=${zoom}` : `k=${zoom}`;
	const rows = [
		`| bar | ${results.map((r) => `${r.rate}x`).join(" | ")} |`,
		`|---|${results.map(() => "---|").join("")}`,
		`| refresh interval (idle p50) | ${results.map((r) => ms(r.refreshMs)).join(" | ")} |`,
		`| pan p50 / p95 / worst | ${results.map((r) => `${ms(r.pan.p50)} / ${ms(r.pan.p95)} / ${ms(r.pan.worst)}`).join(" | ")} |`,
		`| pan intervals > ${RARE_INTERVAL_MS} ms | ${results.map((r) => `${r.pan.rareIntervals} / ${r.pan.frames}`).join(" | ")} |`,
		`| pan long-animation frames | ${results.map((r) => `${r.pan.loafs} (worst block ${ms(r.pan.loafWorstBlocking)})`).join(" | ")} |`,
		`| zoom p50 / p95 / worst | ${results.map((r) => `${ms(r.zoom.p50)} / ${ms(r.zoom.p95)} / ${ms(r.zoom.worst)}`).join(" | ")} |`,
		`| zoom intervals > ${RARE_INTERVAL_MS} ms | ${results.map((r) => `${r.zoom.rareIntervals} / ${r.zoom.frames}`).join(" | ")} |`,
		`| zoom long-animation frames | ${results.map((r) => `${r.zoom.loafs} (worst block ${ms(r.zoom.loafWorstBlocking)})`).join(" | ")} |`,
		`| frame arrival p50 / worst | ${results.map((r) => `${ms(r.arrivalP50)} / ${ms(r.arrivalWorst)}`).join(" | ")} |`,
		`| double-click to clickable (${entryScope}) | ${results.map((r) => (Number.isFinite(r.enterMs) ? ms(r.enterMs) : "never")).join(" | ")} |`,
		`| reload to settled | ${results.map((r) => ms(r.reloadMs)).join(" | ")} |`,
		`| documents mounted (idle / peak) | ${results.map((r) => `${r.idleMounted} / ${Math.max(r.pan.mountedPeak, r.zoom.mountedPeak)}`).join(" | ")} |`,
		`| of those, throttled by name | ${results.map((r) => String(r.throttledFrames)).join(" | ")} |`,
	];
	return rows.join("\n");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = copyProject(options.project);
	const { page: canvasPage, frames: boxes } =
		options.page === undefined ? densestPage(root) : namedPage(root, options.page);
	// a camera planned over nothing is a run that measures an empty canvas and
	// reports it as fast, which is the one failure this whole ticket exists to avoid
	if (boxes.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const camera = planCamera(boxes, VIEWPORT.width, VIEWPORT.height, options.zoom);
	// rewritten before every run: the canvas persists its camera on settle, so
	// each rate would otherwise start where the last one's gestures left off
	const resetCamera = (): void => writeCamera(root, camera, canvasPage);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	process.stderr.write(
		`bench: ${url} (copy of ${options.project}, page "${canvasPage === "" ? "root" : canvasPage}", ${boxes.length} frames, k=${options.zoom})\n`,
	);

	let browser: Browser | undefined;
	const results: RunResult[] = [];
	try {
		browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		writeCamera(root, planCamera(boxes, VIEWPORT.width, VIEWPORT.height, DEFAULT_ZOOM), canvasPage);
		await prepareCurrentCovers(browser, url, root, boxes);
		resetCamera();

		// One discarded pass first. A fresh daemon compiles every frame it is
		// asked for, and a first-ever boot measures the toolchain rather than the
		// canvas — arrivals came out at 4.2 s cold against 0.2 s warm.
		process.stderr.write("bench: warming the daemon\n");
		resetCamera();
		const warm = await browser.newContext({ viewport: VIEWPORT });
		const warmPage = await warm.newPage();
		await warmPage.goto(url, { waitUntil: "domcontentloaded" });
		await settle(warmPage, 1500, 60_000);
		await warm.close();
		// The canvas persists its own camera through the daemon on settle, so a
		// save in flight when the context closed can land *after* the planned
		// camera is written and quietly reopen the next run somewhere empty.
		await new Promise((wait) => setTimeout(wait, 1500));

		for (const rate of options.throttle) {
			resetCamera();
			const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
			await context.addInitScript(collector);
			const page = await context.newPage();
			// a canvas that threw is not a canvas that was fast: never report over a broken run
			page.on("pageerror", (error) => process.stderr.write(`bench: page error — ${String(error).slice(0, 200)}\n`));
			const cdp = await context.newCDPSession(page);
			process.stderr.write(`bench: throttle ${rate}x\n`);
			results.push(await measure(page, context, cdp, rate, url));
			await context.close();
		}
	} finally {
		await browser?.close();
		daemon.stop();
	}

	const report = table(results, options.zoom);
	process.stdout.write(`${report}\n`);
	if (options.out !== undefined) {
		writeFileSync(
			options.out,
			`${JSON.stringify({ project: options.project, headed: options.headed, results }, null, 2)}\n`,
		);
		process.stderr.write(`bench: wrote ${options.out}\n`);
	}
}

await main();
