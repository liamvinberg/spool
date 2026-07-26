import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, type CDPSession, chromium, type Page } from "playwright-core";
import {
	copyProject,
	DEFAULT_ZOOM,
	densestPage,
	freePort,
	ms,
	planCamera,
	quantile,
	startDaemon,
	VIEWPORT,
	writeCamera,
} from "./harness.ts";

/**
 * The canvas benchmark (#82). Drives a real spool canvas through the gestures
 * the performance map names and reports where each bar breaks.
 *
 * The pressure axis is Chromium's CPU throttling rate, not the host machine's
 * power state: a rate reproduces on any machine, and turns "it felt slow once"
 * into a headroom number, the multiplier at which a bar first misses.
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
 *   pnpm build && node bench/canvas.ts --project ~/projects/matmannen
 *   node bench/canvas.ts --project <path> --throttle 1,2,4,6 --headed --out run.json
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
}

function parseArgs(argv: string[]): Options {
	let project = "";
	let throttle = [1, 2, 4, 6];
	let headed = false;
	let zoom = DEFAULT_ZOOM;
	let out: string | undefined;
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
	return { project, throttle, headed, zoom, out };
}

interface Sample {
	t: number;
	d: number;
	mounted: number;
}

interface Loaf {
	t: number;
	duration: number;
	blocking: number;
}

interface Stamped {
	frame: string;
	t: number;
}

interface BenchState {
	raf: Sample[];
	loaf: Loaf[];
	loaded: Stamped[];
	inserted: Stamped[];
}

/**
 * Installed before any script runs, in the top document only: an init script
 * runs in every frame, and 88 copies of a MutationObserver would be measuring
 * their own cost. Every number the report quotes is read from here.
 */
function collector(): void {
	if (window !== window.top) return;
	const state = { raf: [], loaf: [], loaded: [], inserted: [] } as unknown as BenchState;
	(globalThis as unknown as { __bench: BenchState }).__bench = state;

	let last = performance.now();
	const tick = (now: number): void => {
		state.raf.push({ t: now, d: now - last, mounted: document.querySelectorAll("iframe").length });
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);

	if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const loaf = entry as PerformanceEntry & { blockingDuration?: number };
				state.loaf.push({ t: entry.startTime, duration: entry.duration, blocking: loaf.blockingDuration ?? 0 });
			}
		}).observe({ type: "long-animation-frame", buffered: true });
	}

	// a frame's own arrival report: the canvas reads it too, this only listens
	window.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as { spool?: unknown; frame?: unknown } | null;
			if (data === null || typeof data !== "object") return;
			if (data.spool === "loaded" && typeof data.frame === "string") {
				state.loaded.push({ frame: data.frame, t: performance.now() });
			}
		},
		true,
	);

	const noteIframe = (node: Node): void => {
		if (node instanceof HTMLIFrameElement) state.inserted.push({ frame: node.title, t: performance.now() });
		else if (node instanceof HTMLElement) {
			for (const nested of node.querySelectorAll("iframe")) {
				state.inserted.push({ frame: nested.title, t: performance.now() });
			}
		}
	};
	// document, not documentElement: an init script runs before <html> exists
	new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) noteIframe(node);
	}).observe(document, { childList: true, subtree: true });
}

interface GestureStats {
	p50: number;
	p95: number;
	worst: number;
	loafs: number;
	loafWorstBlocking: number;
	frames: number;
	mountedPeak: number;
	wallMs: number;
}

function windowStats(state: BenchState, from: number, to: number): GestureStats {
	const inside = state.raf.filter((sample) => sample.t >= from && sample.t <= to);
	const deltas = inside.map((sample) => sample.d).sort((a, b) => a - b);
	const loafs = state.loaf.filter((entry) => entry.t >= from && entry.t <= to);
	return {
		p50: quantile(deltas, 0.5),
		p95: quantile(deltas, 0.95),
		worst: deltas.at(-1) ?? Number.NaN,
		loafs: loafs.length,
		loafWorstBlocking: loafs.reduce((worst, entry) => Math.max(worst, entry.blocking), 0),
		frames: deltas.length,
		mountedPeak: inside.reduce((peak, sample) => Math.max(peak, sample.mounted), 0),
		wallMs: to - from,
	};
}

const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());
const read = (page: Page): Promise<BenchState> =>
	page.evaluate(() => (globalThis as unknown as { __bench: BenchState }).__bench);
const mountedCount = (page: Page): Promise<number> => page.evaluate(() => document.querySelectorAll("iframe").length);

/**
 * Hold until the canvas stops mounting: the count unchanged across `stableMs`.
 * Reports when it stopped changing, not when the waiting ended, so "looks
 * complete" is not inflated by the window that proves it.
 */
async function settle(page: Page, stableMs: number, timeoutMs: number): Promise<{ count: number; stableAt: number }> {
	const deadline = Date.now() + timeoutMs;
	let count = await mountedCount(page);
	let since = Date.now();
	while (Date.now() < deadline) {
		await page.waitForTimeout(150);
		const next = await mountedCount(page);
		if (next !== count) {
			count = next;
			since = Date.now();
		} else if (Date.now() - since >= stableMs) return { count, stableAt: since };
	}
	return { count, stableAt: since };
}

const PAN_EVENTS = 90;
const PAN_STEP_PX = 26;
const ZOOM_EVENTS = 60;
const ZOOM_STEP_PX = 4; // ~3.7x in and back out across the gesture
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
	const idleMounted = settled.count;
	const reloadMs = settled.stableAt - reloadStart;
	const throttledFrames = await throttleEveryFrame(context, page, rate);

	const state0 = await read(page);
	process.stderr.write(
		`bench:   settled ${idleMounted} mounted (${throttledFrames} throttled by name), ${state0.raf.length} animation frames sampled\n`,
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
	for (let i = 0; i < PAN_EVENTS; i++) {
		const away = i < PAN_EVENTS / 2 ? 1 : -1;
		await page.mouse.wheel(away * PAN_STEP_PX, away * PAN_STEP_PX);
	}
	const panTo = await now(page);

	await page.waitForTimeout(800);

	// --- zoom ----------------------------------------------------------------
	// ZOOM_STEP_PX is trackpad-sized: the canvas zooms by exp(-px * 0.011) per
	// event, so a mouse-notch-sized step compounds to hundreds of times over a
	// gesture and lands somewhere no person would ever be.
	await page.keyboard.down("Control");
	const zoomFrom = await now(page);
	for (let i = 0; i < ZOOM_EVENTS; i++) {
		await page.mouse.wheel(0, (i < ZOOM_EVENTS / 2 ? -1 : 1) * ZOOM_STEP_PX);
	}
	const zoomTo = await now(page);
	await page.keyboard.up("Control");

	await settle(page, 800, 20_000);

	// --- double-click into the frame nearest the middle ----------------------
	// the frame showing the most of itself: a partly-offscreen frame's centre can
	// sit outside the window, and a double-click there enters nothing
	const target = await page.evaluate(() => {
		let best: { x: number; y: number; area: number } | null = null;
		for (const frame of document.querySelectorAll("iframe")) {
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

function table(results: RunResult[]): string {
	const rows = [
		`| bar | ${results.map((r) => `${r.rate}x`).join(" | ")} |`,
		`|---|${results.map(() => "---|").join("")}`,
		`| refresh interval (idle p50) | ${results.map((r) => ms(r.refreshMs)).join(" | ")} |`,
		`| pan p50 / p95 / worst | ${results.map((r) => `${ms(r.pan.p50)} / ${ms(r.pan.p95)} / ${ms(r.pan.worst)}`).join(" | ")} |`,
		`| pan long-animation frames | ${results.map((r) => `${r.pan.loafs} (worst block ${ms(r.pan.loafWorstBlocking)})`).join(" | ")} |`,
		`| zoom p50 / p95 / worst | ${results.map((r) => `${ms(r.zoom.p50)} / ${ms(r.zoom.p95)} / ${ms(r.zoom.worst)}`).join(" | ")} |`,
		`| zoom long-animation frames | ${results.map((r) => `${r.zoom.loafs} (worst block ${ms(r.zoom.loafWorstBlocking)})`).join(" | ")} |`,
		`| frame arrival p50 / worst | ${results.map((r) => `${ms(r.arrivalP50)} / ${ms(r.arrivalWorst)}`).join(" | ")} |`,
		`| double-click to clickable | ${results.map((r) => (Number.isFinite(r.enterMs) ? ms(r.enterMs) : "never")).join(" | ")} |`,
		`| reload to settled | ${results.map((r) => ms(r.reloadMs)).join(" | ")} |`,
		`| documents mounted (idle / peak) | ${results.map((r) => `${r.idleMounted} / ${Math.max(r.pan.mountedPeak, r.zoom.mountedPeak)}`).join(" | ")} |`,
		`| of those, throttled by name | ${results.map((r) => String(r.throttledFrames)).join(" | ")} |`,
	];
	return rows.join("\n");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = copyProject(options.project);
	const boxes = densestPage(root);
	// a camera planned over nothing is a run that measures an empty canvas and
	// reports it as fast, which is the one failure this whole ticket exists to avoid
	if (boxes.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const camera = planCamera(boxes, VIEWPORT.width, VIEWPORT.height, options.zoom);
	// rewritten before every run: the canvas persists its camera on settle, so
	// each rate would otherwise start where the last one's gestures left off
	const resetCamera = (): void => writeCamera(root, camera);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	process.stderr.write(`bench: ${url} (copy of ${options.project}, ${boxes.length} frames, k=${options.zoom})\n`);

	let browser: Browser | undefined;
	const results: RunResult[] = [];
	try {
		browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
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

	const report = table(results);
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
