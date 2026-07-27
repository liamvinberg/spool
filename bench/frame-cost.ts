import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, type CDPSession, chromium, type Page } from "playwright-core";
import { copyProject, densestPage, type FrameBox, freePort, ms, quantile, startDaemon, VIEWPORT } from "./harness.ts";

/**
 * What one mounted frame costs (#85). `WARM_POOL_CAP = 24` exists on the belief
 * that mounting is expensive enough to be worth pre-paying for 24 frames nobody
 * is looking at. This prices both sides of that trade.
 *
 * It deliberately does not drive the canvas. `bench/canvas.ts` measures the
 * canvas whole, and #82 showed the wake queue dominates every number it takes —
 * three mounts per 300 ms swamps whatever one frame costs. To price one frame,
 * the count has to be the independent variable, so this mounts frame documents
 * into a bare host page and varies N directly. What it copies from the canvas is
 * exactly the mount, and nothing else:
 *
 *   - `sandbox="allow-scripts"`, so every frame gets its own opaque origin
 *   - served from `run.spool.localhost`, the untrusted virtual host, never the
 *     canvas's own — one host for all N, which is also one connection pool
 *   - the iframe laid out at the frame's authored size inside a `scale(k)`
 *     world, because that is how the canvas zooms (canvas.tsx: one transformed
 *     container, frames at full size within it), not a small iframe
 *   - `{spool:"freeze"}` for warm, the same message frame-shell.tsx posts
 *   - an immediate `{spool:"session"}` answer, because the boot's `import
 *     "spool"` holds the first render on a top-level await for it and a silent
 *     host costs every frame a fixed 250 ms timeout (frame-runtime.ts)
 *
 * Memory and cpu come from `SystemInfo.getProcessInfo`, which hands back real
 * pids and per-process cpu time, crossed with `ps` for resident size. Per-frame
 * JS heap is deliberately not summed: frames share renderers, and a per-frame
 * CDP session reports its whole isolate, so a sum would count the same megabytes
 * once per frame in the process.
 *
 *   pnpm build
 *   node bench/frame-cost.ts --project ~/projects/matmannen-fc63dba --headed --out cost.json
 *
 * Run it with node's own type stripping, not tsx — see bench/harness.ts.
 */

/** The readable zoom bench/canvas.ts measures at. */
const ZOOM = 0.16;
/**
 * The warm pool's cap, as it stood when this benchmark priced it. #112 deleted
 * the pool on the strength of these numbers; the count stays here as the size of
 * the thing that was being held, so a later run can say what came back.
 */
const POOL_CAP = 24;
/** How long each configuration sits untouched while its idle cost is sampled. */
const IDLE_MS = 6000;
/** How long a fresh browser is left alone before its floor is read. */
const SETTLE_MS = 2500;
/** A frame that has not reported loaded by here is not a measurement. */
const MOUNT_TIMEOUT_MS = 40_000;
/**
 * Stagger between insertions in a batch. Mounting N documents in one commit
 * measures a thundering herd against the daemon; this ticket wants steady-state
 * holding cost, so they arrive spread out and the reading starts once all are in.
 */
const MOUNT_STAGGER_MS = 50;
/** How many single mounts each arrival arm times. */
const ARRIVAL_SAMPLES = 10;

interface Options {
	project: string;
	counts: number[];
	headed: boolean;
	out: string | undefined;
}

function parseArgs(argv: string[]): Options {
	let project = "";
	let counts = [1, 5, 10, 25, 50, 80];
	let headed = false;
	let out: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--counts" && next !== undefined) {
			counts = next.split(",").map((count) => Number(count.trim()));
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
	if (counts.some((count) => !Number.isInteger(count) || count < 1)) throw new Error("--counts takes integers >= 1");
	return { project, counts, headed, out };
}

// --- the host page --------------------------------------------------------

/** Where the grid sits relative to the window. */
type Placement = "onscreen" | "offscreen";
/**
 * What is done to the frames once they have arrived. `frozen` is the shim's
 * cooperative freeze, the one warm frames get; `hidden` is
 * `content-visibility: hidden` on the slot, which #84 argued is strictly
 * stronger because it stops rAF, style, layout and paint at engine level.
 */
type Treatment = "live" | "frozen" | "hidden";

interface MountSpec {
	name: string;
	url: string;
	w: number;
	h: number;
}

interface RafStats {
	p50: number;
	p95: number;
	worst: number;
	samples: number;
	loafs: number;
	loafWorst: number;
}

interface HostApi {
	mount: (frames: MountSpec[], placement: Placement, treatment: Treatment, stagger: number) => Promise<void>;
	/** Insert one frame and resolve the milliseconds until it reports loaded. */
	mountOne: (frame: MountSpec, timeout: number) => Promise<number>;
	loadedCount: () => number;
	/** Mounted frames whose box actually intersects the window. */
	visibleCount: () => number;
	/** Toggle `content-visibility: hidden` on every mounted slot, in place. */
	hide: (on: boolean) => void;
	/** Drop every frame and forget every timing, for a second mount of the same documents. */
	reset: () => void;
	freeze: (on: boolean) => void;
	rafStats: () => RafStats;
	resetRaf: () => void;
}

/**
 * The host page, installed as an init script. It reproduces the canvas's mount —
 * a scaled world of authored-size sandboxed iframes, answering the session seed —
 * and nothing else: no React, no lifecycle sweep, no wake queue, no stills.
 * Anything this page costs that a mounted frame does not is a number this ticket
 * would otherwise report as the frame's.
 */
function host(): void {
	// ZOOM, restated: an init script is serialized without its module scope, so
	// nothing outside this function is in scope by the time it runs
	const scale = 0.16;
	const raf: number[] = [];
	const loaf: number[] = [];
	const loaded = new Set<string>();
	const waiting = new Map<string, (at: number) => void>();

	let last = performance.now();
	const tick = (now: number): void => {
		raf.push(now - last);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);

	if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				loaf.push((entry as PerformanceEntry & { blockingDuration?: number }).blockingDuration ?? 0);
			}
		}).observe({ type: "long-animation-frame", buffered: true });
	}

	window.addEventListener("message", (event: MessageEvent) => {
		const data = event.data as { spool?: unknown; frame?: unknown } | null;
		if (data === null || typeof data !== "object") return;
		// the canvas answers the seed request immediately and with null for any
		// boot that is not a walk arrival; a silent host would instead charge
		// every frame the runtime's 250 ms timeout
		if (data.spool === "session?") {
			(event.source as WindowProxy | null)?.postMessage({ spool: "session", record: null }, "*");
			return;
		}
		if (data.spool === "loaded" && typeof data.frame === "string") {
			loaded.add(data.frame);
			waiting.get(data.frame)?.(performance.now());
		}
	});

	const quant = (sorted: number[], q: number): number =>
		sorted.length === 0
			? Number.NaN
			: (sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? Number.NaN);
	const wait = (msec: number): Promise<void> => new Promise((done) => setTimeout(done, msec));

	const world = (): HTMLElement => {
		const existing = document.getElementById("world");
		if (existing !== null) return existing;
		document.body.style.cssText = "margin:0;overflow:hidden;background:#111;";
		const el = document.createElement("div");
		el.id = "world";
		// the canvas's own arrangement: one transformed container with frames at
		// authored size inside it, so each document lays out at the size it was
		// written for and the zoom is the compositor's business
		el.style.cssText = `position:absolute;top:0;left:0;transform:scale(${scale});transform-origin:0 0;`;
		document.body.append(el);
		return el;
	};

	/**
	 * A grid in world units. `offscreen` drops the whole grid below the window,
	 * which is the warm pool's actual configuration — and the only case Blink's
	 * offscreen render throttling applies to at all, since it requires a
	 * cross-origin frame.
	 *
	 * The scale is fixed at the canvas's own worst case rather than shrunk to fit,
	 * so a large count overflows the window exactly as the canvas's mounted set
	 * does (visible frames, plus a margin ring, plus the warm pool). `visibleCount`
	 * reports how much of each batch the window actually held.
	 */
	const place = (
		frame: MountSpec,
		index: number,
		placement: Placement,
		treatment: Treatment,
		cols: number,
		cell: { w: number; h: number },
	): void => {
		const slot = document.createElement("div");
		const top = (placement === "offscreen" ? innerHeight / scale + 400 : 0) + Math.floor(index / cols) * cell.h;
		slot.style.cssText = `position:absolute;left:${(index % cols) * cell.w}px;top:${top}px;width:${frame.w}px;height:${frame.h}px;overflow:hidden;background:#fff;`;
		if (treatment === "hidden") slot.style.contentVisibility = "hidden";
		const el = document.createElement("iframe");
		el.title = frame.name;
		el.setAttribute("sandbox", "allow-scripts");
		el.style.cssText = "display:block;width:100%;height:100%;border:0;background:#fff;";
		el.src = frame.url;
		slot.append(el);
		world().append(slot);
	};

	const grid = (frames: MountSpec[]): { cols: number; cell: { w: number; h: number } } => {
		const cols = Math.max(1, Math.ceil(Math.sqrt(frames.length)));
		const cell = { w: 0, h: 0 };
		for (const frame of frames) {
			cell.w = Math.max(cell.w, frame.w + 80);
			cell.h = Math.max(cell.h, frame.h + 80);
		}
		return { cols, cell };
	};

	const api: HostApi = {
		async mount(frames, placement, treatment, stagger) {
			const { cols, cell } = grid(frames);
			for (const [index, frame] of frames.entries()) {
				place(frame, index, placement, treatment, cols, cell);
				if (stagger > 0) await wait(stagger);
			}
		},
		mountOne(frame, timeout) {
			const { cols, cell } = grid([frame]);
			return new Promise<number>((done) => {
				const started = performance.now();
				const timer = setTimeout(() => {
					waiting.delete(frame.name);
					done(Number.NaN);
				}, timeout);
				waiting.set(frame.name, (at) => {
					clearTimeout(timer);
					waiting.delete(frame.name);
					done(at - started);
				});
				place(frame, 0, "onscreen", "live", cols, cell);
			});
		},
		loadedCount: () => loaded.size,
		visibleCount() {
			let count = 0;
			for (const el of document.querySelectorAll("iframe")) {
				const box = el.getBoundingClientRect();
				if (box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight) count++;
			}
			return count;
		},
		reset() {
			document.getElementById("world")?.remove();
			loaded.clear();
			waiting.clear();
		},
		freeze(on) {
			for (const el of document.querySelectorAll("iframe")) {
				el.contentWindow?.postMessage({ spool: "freeze", on }, "*");
			}
		},
		hide(on) {
			for (const el of document.querySelectorAll("iframe")) {
				const slot = el.parentElement;
				if (slot !== null) slot.style.contentVisibility = on ? "hidden" : "visible";
			}
		},
		rafStats() {
			const sorted = [...raf].sort((a, b) => a - b);
			return {
				p50: quant(sorted, 0.5),
				p95: quant(sorted, 0.95),
				worst: sorted.at(-1) ?? Number.NaN,
				samples: sorted.length,
				loafs: loaf.length,
				loafWorst: loaf.reduce((worst, blocking) => Math.max(worst, blocking), 0),
			};
		},
		resetRaf() {
			raf.length = 0;
			loaf.length = 0;
		},
	};
	(globalThis as unknown as { __host: HostApi }).__host = api;
}

// --- what the machine is spending ----------------------------------------

interface ProcessSample {
	/** Wall clock the sample was taken at, for turning cpu time into a rate. */
	at: number;
	renderers: number;
	/** Every Chromium process in the tree, browser and gpu included. */
	processes: number;
	rssMb: number;
	/** Seconds of cpu across every process, as Chromium accounts it. */
	cpuSeconds: number;
}

/**
 * Chromium's own process list, priced with the OS's resident sizes.
 *
 * RSS shares pages between processes, so a total over-counts what the machine
 * would get back. It is still the right instrument here: every figure this
 * reports is a difference between two totals taken the same way over the same
 * tree, and the shared pages sit on both sides of that subtraction.
 */
async function sampleProcesses(session: CDPSession): Promise<ProcessSample> {
	const { processInfo } = await session.send("SystemInfo.getProcessInfo");
	const at = Date.now();
	const pids = processInfo.map((info) => info.id);
	let rssKb = 0;
	if (pids.length > 0) {
		// one ps for the whole tree: a call per process would let the sample drift
		const out = execFileSync("ps", ["-o", "rss=", "-p", pids.join(",")], { encoding: "utf8" });
		for (const line of out.split("\n")) {
			const kb = Number(line.trim());
			if (Number.isFinite(kb)) rssKb += kb;
		}
	}
	return {
		at,
		renderers: processInfo.filter((info) => info.type === "renderer").length,
		processes: processInfo.length,
		rssMb: rssKb / 1024,
		cpuSeconds: processInfo.reduce((sum, info) => sum + info.cpuTime, 0),
	};
}

interface Reading {
	renderers: number;
	processes: number;
	rssMb: number;
	/** Percent of one core, across the whole browser, while nothing is happening. */
	idleCpuPercent: number;
	raf: RafStats;
}

/** One configuration, and what it cost over the floor of the browser that held it. */
interface Case {
	label: string;
	frames: number;
	placement: Placement;
	treatment: Treatment;
	/** Frames that reported loaded: a reading over fewer is not the reading asked for. */
	loaded: number;
	/** How many of them the window actually held. */
	visible: number;
	floor: Reading;
	held: Reading;
}

const mount = (page: Page, frames: MountSpec[], placement: Placement, treatment: Treatment): Promise<void> =>
	page.evaluate(
		(input) =>
			(globalThis as unknown as { __host: HostApi }).__host.mount(
				input.frames,
				input.placement,
				input.treatment,
				input.stagger,
			),
		{ frames, placement, treatment, stagger: MOUNT_STAGGER_MS },
	);

const mountOne = (page: Page, frame: MountSpec): Promise<number> =>
	page.evaluate(
		(input) => (globalThis as unknown as { __host: HostApi }).__host.mountOne(input.frame, input.timeout),
		{ frame, timeout: MOUNT_TIMEOUT_MS },
	);

const loadedCount = (page: Page): Promise<number> =>
	page.evaluate(() => (globalThis as unknown as { __host: HostApi }).__host.loadedCount());

const visibleCount = (page: Page): Promise<number> =>
	page.evaluate(() => (globalThis as unknown as { __host: HostApi }).__host.visibleCount());

const resetHost = (page: Page): Promise<void> =>
	page.evaluate(() => {
		(globalThis as unknown as { __host: HostApi }).__host.reset();
	});

const freezeAll = (page: Page, on: boolean): Promise<void> =>
	page.evaluate((flag) => {
		(globalThis as unknown as { __host: HostApi }).__host.freeze(flag);
	}, on);

const hideAll = (page: Page, on: boolean): Promise<void> =>
	page.evaluate((flag) => {
		(globalThis as unknown as { __host: HostApi }).__host.hide(flag);
	}, on);

const rafStats = (page: Page): Promise<RafStats> =>
	page.evaluate(() => (globalThis as unknown as { __host: HostApi }).__host.rafStats());

const resetRaf = (page: Page): Promise<void> =>
	page.evaluate(() => {
		(globalThis as unknown as { __host: HostApi }).__host.resetRaf();
	});

/** Mount a batch and hold until every frame has reported loaded. */
async function mountBatch(page: Page, frames: MountSpec[], placement: Placement, treatment: Treatment): Promise<void> {
	await mount(page, frames, placement, treatment);
	await page
		.waitForFunction(
			(want) => (globalThis as unknown as { __host: HostApi }).__host.loadedCount() >= want,
			frames.length,
			{ timeout: MOUNT_TIMEOUT_MS },
		)
		.catch(() => process.stderr.write("bench:   not every frame reported loaded\n"));
}

/** Sit still for `IDLE_MS` and price what the browser spends doing nothing. */
async function readIdle(page: Page, browserSession: CDPSession): Promise<Reading> {
	await resetRaf(page);
	const before = await sampleProcesses(browserSession);
	await page.waitForTimeout(IDLE_MS);
	const after = await sampleProcesses(browserSession);
	const raf = await rafStats(page);
	const wallSeconds = (after.at - before.at) / 1000;
	return {
		renderers: after.renderers,
		processes: after.processes,
		rssMb: after.rssMb,
		idleCpuPercent: ((after.cpuSeconds - before.cpuSeconds) / wallSeconds) * 100,
		raf,
	};
}

/**
 * The host page gets a server of its own rather than a `page.route` fulfilment.
 * Interception is not inert: with any route registered, playwright aborts the
 * navigation of a sandboxed opaque-origin subframe (`net::ERR_ABORTED`, no
 * frame ever boots), which would have made every frame in this benchmark cost
 * nothing at all. The daemon is not asked to grow a route that mounts arbitrary
 * frames just to serve a benchmark.
 */
async function startHostServer(port: number): Promise<{ url: string; stop: () => void }> {
	const server = createServer((_request, response) => {
		response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		response.end("<!doctype html><title>bench host</title>");
	});
	await new Promise<void>((done) => server.listen(port, "127.0.0.1", done));
	return { url: `http://127.0.0.1:${port}/`, stop: () => server.close() };
}

async function openHost(browser: Browser, hostUrl: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	await context.addInitScript(host);
	const page = await context.newPage();
	page.on("pageerror", (error) => process.stderr.write(`bench: host error — ${String(error).slice(0, 200)}\n`));
	await page.goto(hostUrl, { waitUntil: "domcontentloaded" });
	// a freshly launched browser is still finishing its own startup, and a floor
	// read taken into that charges the frames for it — one early run came out at
	// less cpu with a frame mounted than without
	await page.waitForTimeout(SETTLE_MS);
	return { context, page };
}

/**
 * One configuration, in a browser of its own.
 *
 * The relaunch is the point. Chromium does not hand back everything a closed
 * context held, so a sweep sharing one browser charges the 80-frame reading for
 * the 50-frame reading that ran before it, and the marginal curve bends upward
 * for a reason that has nothing to do with frames. Every case here is priced
 * against a floor taken seconds earlier in its own process tree.
 */
async function runCase(
	launch: () => Promise<Browser>,
	hostUrl: string,
	label: string,
	specs: MountSpec[],
	placement: Placement,
	treatment: Treatment,
): Promise<Case> {
	const browser = await launch();
	try {
		const browserSession = await browser.newBrowserCDPSession();
		const { page } = await openHost(browser, hostUrl);
		const floor = await readIdle(page, browserSession);
		await mountBatch(page, specs, placement, treatment);
		// frozen only after arrival, as the canvas does: a frame frozen mid-boot
		// never finishes arriving, and its cost is an unfinished frame's
		if (treatment === "frozen") {
			await freezeAll(page, true);
			await page.waitForTimeout(500);
		}
		const held = await readIdle(page, browserSession);
		const loaded = await loadedCount(page);
		const visible = await visibleCount(page);
		process.stderr.write(
			`bench:   ${label}: ${loaded}/${specs.length} loaded (${visible} in window), ${held.renderers} renderers, ${(
				held.rssMb - floor.rssMb
			).toFixed(0)} MB over floor, ${(held.idleCpuPercent - floor.idleCpuPercent).toFixed(1)}% cpu over floor\n`,
		);
		return { label, frames: specs.length, placement, treatment, loaded, visible, floor, held };
	} finally {
		await browser.close();
	}
}

/**
 * The same documents, in the same processes, priced under each treatment in turn.
 *
 * This is the instrument the freeze question needs. Comparing two separate runs
 * charges the difference to whatever else differed between two browsers — and
 * cpu over a few seconds is noisy enough that a fresh-browser comparison cannot
 * see a small saving at all. Here nothing changes between readings except the
 * treatment, and `live (unfrozen again)` is the control: if it does not come back
 * to where `live` was, the run drifted and the frozen figure means nothing.
 */
interface Transition {
	frames: number;
	loaded: number;
	visible: number;
	placement: Placement;
	steps: { label: string; reading: Reading }[];
}

async function runTransition(
	launch: () => Promise<Browser>,
	hostUrl: string,
	specs: MountSpec[],
	placement: Placement,
): Promise<Transition> {
	const browser = await launch();
	try {
		const browserSession = await browser.newBrowserCDPSession();
		const { page } = await openHost(browser, hostUrl);
		const steps: { label: string; reading: Reading }[] = [];
		steps.push({ label: "no frames", reading: await readIdle(page, browserSession) });
		await mountBatch(page, specs, placement, "live");
		steps.push({ label: "live", reading: await readIdle(page, browserSession) });
		await freezeAll(page, true);
		await page.waitForTimeout(500);
		steps.push({ label: "frozen (the shim's freeze)", reading: await readIdle(page, browserSession) });
		await freezeAll(page, false);
		await page.waitForTimeout(500);
		steps.push({ label: "live (unfrozen again)", reading: await readIdle(page, browserSession) });
		await hideAll(page, true);
		await page.waitForTimeout(500);
		steps.push({ label: "content-visibility: hidden", reading: await readIdle(page, browserSession) });
		const loaded = await loadedCount(page);
		const visible = await visibleCount(page);
		for (const step of steps) {
			process.stderr.write(
				`bench:   ${placement} ${step.label}: ${step.reading.rssMb.toFixed(0)} MB, ${step.reading.idleCpuPercent.toFixed(1)}% cpu\n`,
			);
		}
		return { frames: specs.length, loaded, visible, placement, steps };
	} finally {
		await browser.close();
	}
}

interface ArrivalRun {
	label: string;
	p50: number;
	worst: number;
	n: number;
}

/**
 * Time single mounts, one at a time, each waited out before the next begins.
 * That is the cost the warm pool is pre-paying to avoid: one frame, on demand,
 * with nothing else booting alongside it.
 */
async function arrivalArm(
	browser: Browser,
	hostUrl: string,
	label: string,
	specs: MountSpec[],
	remount: boolean,
): Promise<ArrivalRun> {
	const { context, page } = await openHost(browser, hostUrl);
	if (remount) {
		// serve every document once into this very context, then drop them: the
		// second mount is the one measured, with the daemon and the http cache warm
		for (const spec of specs) await mountOne(page, spec);
		await resetHost(page);
		await page.waitForTimeout(1500);
	}
	const arrivals: number[] = [];
	for (const spec of specs) {
		arrivals.push(await mountOne(page, spec));
		await resetHost(page);
	}
	await context.close();
	const clean = arrivals.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	process.stderr.write(`bench:   ${label}: p50 ${ms(quantile(clean, 0.5))} ms over ${clean.length}\n`);
	return { label, p50: quantile(clean, 0.5), worst: clean.at(-1) ?? Number.NaN, n: clean.length };
}

function frameUrl(renderUrl: string, project: string, frame: string): string {
	return `${renderUrl}/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(frame)}`;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = copyProject(options.project);
	const { frames: boxes } = densestPage(root);
	if (boxes.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const specs: MountSpec[] = boxes.map((box: FrameBox) => ({
		name: box.name,
		url: frameUrl(daemon.renderUrl, name, box.name),
		w: box.w,
		h: box.h,
	}));
	const counts = options.counts.filter((count) => count <= specs.length);
	const hostServer = await startHostServer(await freePort());
	process.stderr.write(
		`bench: ${daemon.renderUrl} (copy of ${options.project}, ${specs.length} frames, k=${ZOOM}, counts ${counts.join(",")})\n`,
	);
	const hostUrl = hostServer.url;

	const launch = (): Promise<Browser> =>
		chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});

	const cases: Case[] = [];
	const transitions: Transition[] = [];
	const arrivals: ArrivalRun[] = [];
	try {
		// Cold first, before anything else has warmed the daemon: this is the only
		// moment in the run that can see a frame the toolchain has never built.
		const sample = specs.slice(0, ARRIVAL_SAMPLES);
		const arrivalBrowser = await launch();
		try {
			arrivals.push(await arrivalArm(arrivalBrowser, hostUrl, "cold: never compiled, never fetched", sample, false));
			arrivals.push(
				await arrivalArm(arrivalBrowser, hostUrl, "compiled, fresh context (empty http cache)", sample, false),
			);
			arrivals.push(
				await arrivalArm(arrivalBrowser, hostUrl, "warm: same context, document served before", sample, true),
			);
		} finally {
			await arrivalBrowser.close();
		}

		// the scaling sweep: how the cost of the 25th, 50th and 80th frame compares
		// to the first. The grid is left at the canvas's own zoom rather than shrunk
		// to fit, so a large count overflows the window as the canvas's mounted set
		// does — `visible` records how much of each batch the window held.
		for (const count of counts) {
			process.stderr.write(`bench: ${count} live\n`);
			cases.push(await runCase(launch, hostUrl, `${count} live`, specs.slice(0, count), "onscreen", "live"));
		}

		// The arms, at the pool's own size: what holding 24 frames actually costs.
		// `live, offscreen` is the one that isolates Blink's own offscreen
		// throttling, which applies to cross-origin frames whether or not the shim
		// freezes them, from the freeze itself.
		const pool = specs.slice(0, POOL_CAP);
		const arms: { label: string; placement: Placement; treatment: Treatment }[] = [
			{ label: `${POOL_CAP} live, offscreen`, placement: "offscreen", treatment: "live" },
			{ label: `${POOL_CAP} frozen, offscreen (the warm pool)`, placement: "offscreen", treatment: "frozen" },
		];
		for (const arm of arms) {
			process.stderr.write(`bench: ${arm.label}\n`);
			cases.push(await runCase(launch, hostUrl, arm.label, pool, arm.placement, arm.treatment));
		}

		// and the paired comparison, where only the treatment moves
		process.stderr.write(`bench: ${POOL_CAP} frames through every treatment, on screen\n`);
		transitions.push(await runTransition(launch, hostUrl, pool, "onscreen"));
		process.stderr.write(`bench: ${POOL_CAP} frames through every treatment, offscreen\n`);
		transitions.push(await runTransition(launch, hostUrl, pool, "offscreen"));
	} finally {
		hostServer.stop();
		daemon.stop();
	}

	process.stdout.write(
		`${costTable(cases)}\n\n${marginalTable(cases, counts)}\n\n${transitionTable(transitions)}\n\n${arrivalTable(arrivals)}\n`,
	);
	if (options.out !== undefined) {
		writeFileSync(
			options.out,
			`${JSON.stringify(
				{ project: options.project, headed: options.headed, cases, transitions, arrivals },
				null,
				2,
			)}\n`,
		);
		process.stderr.write(`bench: wrote ${options.out}\n`);
	}
}

const rss = (c: Case): number => c.held.rssMb - c.floor.rssMb;
const cpu = (c: Case): number => c.held.idleCpuPercent - c.floor.idleCpuPercent;

function costTable(cases: Case[]): string {
	const rows = [
		"| configuration | frames | loaded | in window | renderers (floor → held) | MB over floor | MB/frame | idle cpu % over floor | cpu %/frame | host raf p50 / p95 / worst | loafs |",
		"|---|---|---|---|---|---|---|---|---|---|---|",
	];
	for (const c of cases) {
		rows.push(
			`| ${c.label} | ${c.frames} | ${c.loaded} | ${c.visible} | ${c.floor.renderers} → ${c.held.renderers} | ${rss(c).toFixed(0)} | ${(rss(c) / c.frames).toFixed(1)} | ${cpu(c).toFixed(1)} | ${(cpu(c) / c.frames).toFixed(2)} | ${ms(c.held.raf.p50)} / ${ms(c.held.raf.p95)} / ${ms(c.held.raf.worst)} | ${c.held.raf.loafs} (worst block ${ms(c.held.raf.loafWorst)}) |`,
		);
	}
	return rows.join("\n");
}

/** Linear, or a cliff: what each step of the sweep added, per frame added. */
function marginalTable(cases: Case[], counts: number[]): string {
	const sweep = counts
		.map((count) => cases.find((c) => c.frames === count && c.treatment === "live" && c.placement === "onscreen"))
		.filter((c): c is Case => c !== undefined);
	const rows = ["| step | frames added | MB per added frame | cpu % per added frame |", "|---|---|---|---|"];
	let previous: Case | undefined;
	for (const c of sweep) {
		const added = c.frames - (previous?.frames ?? 0);
		const memory = rss(c) - (previous === undefined ? 0 : rss(previous));
		const processor = cpu(c) - (previous === undefined ? 0 : cpu(previous));
		rows.push(
			`| ${previous === undefined ? 0 : previous.frames} → ${c.frames} | ${added} | ${(memory / added).toFixed(1)} | ${(
				processor / added
			).toFixed(2)} |`,
		);
		previous = c;
	}
	return rows.join("\n");
}

function transitionTable(transitions: Transition[]): string {
	const rows: string[] = [];
	for (const t of transitions) {
		rows.push(
			`**${t.frames} frames, ${t.placement}** (${t.loaded} loaded, ${t.visible} in window)`,
			"",
			"| treatment | rss MB | idle cpu % | cpu %/frame over no frames | host raf p50 / p95 / worst | loafs |",
			"|---|---|---|---|---|---|",
		);
		const base = t.steps[0]?.reading;
		for (const { label, reading } of t.steps) {
			const perFrame =
				base === undefined || reading === base
					? "—"
					: ((reading.idleCpuPercent - base.idleCpuPercent) / t.frames).toFixed(2);
			rows.push(
				`| ${label} | ${reading.rssMb.toFixed(0)} | ${reading.idleCpuPercent.toFixed(1)} | ${perFrame} | ${ms(reading.raf.p50)} / ${ms(reading.raf.p95)} / ${ms(reading.raf.worst)} | ${reading.raf.loafs} |`,
			);
		}
		rows.push("");
	}
	return rows.join("\n").trimEnd();
}

function arrivalTable(runs: ArrivalRun[]): string {
	const rows = ["| one mount, nothing else booting | insert to loaded p50 | worst | n |", "|---|---|---|---|"];
	for (const run of runs) rows.push(`| ${run.label} | ${ms(run.p50)} | ${ms(run.worst)} | ${run.n} |`);
	return rows.join("\n");
}

await main();
