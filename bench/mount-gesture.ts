import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import {
	copyProject,
	densestPage,
	type FrameBox,
	freePort,
	ms,
	planCamera,
	quantile,
	startDaemon,
	VIEWPORT,
	writeCamera,
} from "./harness.ts";

/**
 * The mount-during-gesture benchmark (#94, #112). Mounting a document while the
 * camera moves is claimed to cost the gesture nothing; #82 never tested it,
 * because it panned a canvas whose frames were already mounted. This measures
 * the untested case, and the parent-side work the claim does not cover — the
 * React commit that inserts an iframe, the layout it forces, a new compositor
 * surface arriving mid-gesture, and the discard at the other end.
 *
 * Three arms, and the first of them is the one #112 was waiting for:
 *
 *   canvas  the canvas's own refresh errands, through its own React tree, while
 *           the camera moves. The subject is copied without its stills, so
 *           every frame on the page owes a picture and the canvas borrows them
 *           three at a time for the whole run: real inserts, real commits, real
 *           discards, in the realm that pays for them. Independent variable:
 *           the in-flight cap.
 *
 *           It needs one hook the shipped canvas would not otherwise carry.
 *           `sweepLifecycle` reads `globalThis.__spoolBench` — `{ errands }`,
 *           the in-flight cap, unbounded at 0 or below — and the UI has to be
 *           rebuilt with it. Without the hook the arm throws rather than
 *           reporting a null run as a pass.
 *   jobs    the same pressure staged by hand: documents inserted into a fixed
 *           overlay above the transforming canvas rather than through React.
 *           This is the weaker arm and is kept only to be compared against the
 *           first — #94 rested its churn finding on it, and it produced no
 *           stable number across four runs.
 *   cost    one refresh job priced leg by leg — insert, loaded report,
 *           photograph, discard — so the cap has a duration behind it.
 *
 * Every gesture is run twice per configuration: hot, with mounting in flight,
 * and quiet, with the canvas settled and nothing mounting. The quiet run is the
 * control, and the hot-minus-quiet delta is the answer. A single hot number
 * cannot be read against #82's, because it is a different machine on a
 * different day against a matmannen that has grown since.
 *
 *   pnpm build && node bench/mount-gesture.ts --project ~/projects/matmannen-fc63dba --headed
 *   node bench/mount-gesture.ts --project <path> --caps 1,3,8,0 --arms jobs,cost
 *
 * Run it with node's own type stripping, not tsx: the page scripts below are
 * serialized into the browser by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

/** A cap of 0 on the command line means unbounded. */
type Arm = "canvas" | "jobs" | "cost";

interface Options {
	project: string;
	caps: number[];
	arms: Arm[];
	headed: boolean;
	/**
	 * Chromium's CPU throttling rate, applied to the canvas page and to every
	 * frame by name — #82's pressure axis. A cost that only appears on a slow
	 * machine is still a cost, and the model ships to every machine.
	 */
	throttle: number;
	out: string | undefined;
}

function parseArgs(argv: string[]): Options {
	let project = "";
	let caps = [1, 3, 8, 0];
	let arms: Arm[] = ["canvas", "jobs", "cost"];
	let headed = false;
	let throttle = 1;
	let out: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--caps" && next !== undefined) {
			caps = next.split(",").map((cap) => Number(cap.trim()));
			i++;
		} else if (arg === "--arms" && next !== undefined) {
			arms = next.split(",").map((arm) => arm.trim()) as Arm[];
			i++;
		} else if (arg === "--throttle" && next !== undefined) {
			throttle = Number(next);
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
	if (caps.some((cap) => !Number.isInteger(cap) || cap < 0))
		throw new Error("--caps takes integers >= 0 (0 = unbounded)");
	for (const arm of arms) {
		if (arm !== "canvas" && arm !== "jobs" && arm !== "cost") throw new Error(`unknown arm ${arm}`);
	}
	if (!Number.isFinite(throttle) || throttle < 1) throw new Error("--throttle takes a rate >= 1");
	return { project, caps, arms, headed, throttle, out };
}

interface Sample {
	t: number;
	d: number;
	mounted: number;
	/** Refresh jobs in flight at this animation frame — the jobs arm's independent variable, sampled. */
	jobs: number;
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

/** One refresh job's legs, in page time. NaN for a leg that never happened. */
interface JobLeg {
	frame: string;
	insert: number;
	loaded: number;
	asked: number;
	source: number;
	raster: number;
	discard: number;
	/** Bytes of the rasterized cover, the thing a real job would then persist. */
	bytes: number;
}

interface JobSpec {
	name: string;
	url: string;
	w: number;
	h: number;
}

interface BenchState {
	raf: Sample[];
	loaf: Loaf[];
	loaded: Stamped[];
	inserted: Stamped[];
	jobs: JobLeg[];
	jobStarts: number;
	jobFailures: number;
}

interface JobApi {
	/** Keep `cap` jobs in flight, cycling `specs`, until stop() resolves. 0 caps at specs.length. */
	start: (specs: JobSpec[], cap: number, photograph: boolean, settleMs: number, discard: boolean) => void;
	stop: () => Promise<void>;
	inFlight: () => number;
	/** One job, awaited, for pricing rather than pressure. */
	one: (spec: JobSpec, photograph: boolean, settleMs: number) => Promise<JobLeg>;
}

/**
 * Installed before any script runs, in the top document only: an init script
 * runs in every frame, and forty copies of a MutationObserver would be
 * measuring their own cost.
 *
 * It carries both the collector and the refresh-job runner, because the runner
 * has to live in the canvas's own document for its inserts to cost the canvas's
 * own main thread what a real refresh job would. A job driven from Node through
 * CDP would insert into some other realm and price nothing.
 */
function instrument(config: { captureIdle: number }): void {
	if (window !== window.top) return;
	const state = {
		raf: [],
		loaf: [],
		loaded: [],
		inserted: [],
		jobs: [],
		jobStarts: 0,
		jobFailures: 0,
	} as unknown as BenchState;
	(globalThis as unknown as { __bench: BenchState }).__bench = state;

	// hoisted so the animation-frame tick can sample it: a job outlives a gesture
	// window, so counting inserts inside the window would report zero pressure
	// over a canvas booting forty documents
	let inFlight = 0;

	let last = performance.now();
	const tick = (now: number): void => {
		state.raf.push({ t: now, d: now - last, mounted: document.querySelectorAll("iframe").length, jobs: inFlight });
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

	/** Frames still waiting on their own loaded report — the canvas's and the runner's alike. */
	const waitingLoaded = new Map<string, (at: number) => void>();
	/** Capture requests in flight, keyed by the id the reply has to carry back. */
	const waitingSource = new Map<string, (reply: Record<string, unknown>) => void>();

	window.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as Record<string, unknown> | null;
			if (data === null || typeof data !== "object") return;
			// The runtime asks for its session seed on boot and waits out a 250 ms
			// timeout when nobody answers. The canvas answers immediately, so a
			// runner whose jobs went unanswered would price a quarter second of
			// spool's own politeness into every job.
			if (data.spool === "session?") {
				(event.source as WindowProxy | null)?.postMessage({ spool: "session", record: null }, "*");
				return;
			}
			if (data.spool === "loaded" && typeof data.frame === "string") {
				const at = performance.now();
				state.loaded.push({ frame: data.frame, t: at });
				waitingLoaded.get(data.frame)?.(at);
				return;
			}
			if (data.spool === "capture-source" && typeof data.id === "string") {
				waitingSource.get(data.id)?.(data);
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

	// --- the refresh-job runner ---------------------------------------------
	const BOOTSTRAP = "spool-capture-bootstrap-v1";
	const RASTER = "spool-capture-raster-v1";
	const RESULT = "spool-capture-result-v1";
	const LOAD_TIMEOUT_MS = 20_000;
	const CAPTURE_TIMEOUT_MS = 8000;
	let requests = 0;

	/**
	 * Where a job's document sits while it runs. #87 has it mount "behind the
	 * frame's own picture", so it is on screen and composited — the expensive
	 * placement — but covered, so nothing about it is ever visible. Off to the
	 * side of the window would be the cheap answer to a question about cost.
	 *
	 * pointer-events stays off the whole stack, or the cover would eat the
	 * wheel events the gesture is made of.
	 */
	const stage = (): HTMLElement => {
		const existing = document.getElementById("bench-jobs");
		if (existing !== null) return existing;
		const el = document.createElement("div");
		el.id = "bench-jobs";
		el.style.cssText =
			"position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;overflow:hidden;";
		document.body.append(el);
		return el;
	};

	/** A job's slot: the document at authored size scaled down, under an opaque lid. */
	const openSlot = (spec: JobSpec, index: number): { slot: HTMLElement; el: HTMLIFrameElement } => {
		const scale = 0.16;
		const slot = document.createElement("div");
		const cols = 4;
		slot.style.cssText = `position:absolute;left:${(index % cols) * (spec.w * scale + 8)}px;top:${
			Math.floor(index / cols) * (spec.h * scale + 8)
		}px;width:${spec.w * scale}px;height:${spec.h * scale}px;overflow:hidden;`;
		const inner = document.createElement("div");
		inner.style.cssText = `position:absolute;left:0;top:0;width:${spec.w}px;height:${spec.h}px;transform:scale(${scale});transform-origin:0 0;`;
		const el = document.createElement("iframe");
		el.title = spec.name;
		el.setAttribute("sandbox", "allow-scripts");
		el.style.cssText = "display:block;width:100%;height:100%;border:0;background:#fff;";
		el.src = spec.url;
		inner.append(el);
		const lid = document.createElement("div");
		lid.style.cssText = "position:absolute;inset:0;background:#111;";
		slot.append(inner, lid);
		stage().append(slot);
		return { slot, el };
	};

	const raster = (id: string, source: Record<string, unknown>): Promise<{ url: string } | { error: string }> =>
		new Promise((done) => {
			const origin = (globalThis as unknown as { __SPOOL_CAPTURE_ORIGIN__?: string }).__SPOOL_CAPTURE_ORIGIN__;
			if (origin === undefined) {
				done({ error: "no capture origin on this document" });
				return;
			}
			const host = document.createElement("iframe");
			const channel = new MessageChannel();
			let settled = false;
			const finish = (result: { url: string } | { error: string }): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				channel.port1.onmessage = null;
				try {
					channel.port1.close();
					channel.port2.close();
				} catch {}
				host.remove();
				done(result);
			};
			const timer = setTimeout(() => finish({ error: "capture host timed out" }), CAPTURE_TIMEOUT_MS);
			host.setAttribute("sandbox", "allow-scripts allow-same-origin");
			host.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;pointer-events:none;";
			host.addEventListener("load", () => {
				const target = host.contentWindow;
				if (target === null) {
					finish({ error: "capture host unavailable" });
					return;
				}
				channel.port1.onmessage = (event: MessageEvent) => {
					const reply = event.data as Record<string, unknown> | null;
					if (reply === null || reply.spool !== RESULT || reply.id !== id) {
						finish({ error: "invalid capture host reply" });
						return;
					}
					if (typeof reply.url === "string") finish({ url: reply.url });
					else finish({ error: String(reply.error ?? "capture failed") });
				};
				channel.port1.start();
				target.postMessage({ spool: BOOTSTRAP, id }, new URL(origin).origin, [channel.port2]);
				channel.port1.postMessage({
					spool: RASTER,
					id,
					svg: source.svg,
					width: source.width,
					height: source.height,
					dpr: source.dpr,
					maxEdge: source.maxEdge,
				});
			});
			host.src = `${new URL(origin).origin}/capture`;
			document.body.append(host);
		});

	const requestId = (): string =>
		Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");

	/**
	 * `discard` false keeps the document in the DOM after the job frees its slot.
	 * It is the isolation the mount arm cannot give: that arm inserts 31 documents
	 * inside a zoom for nothing, this one costs the gesture real frames at a lower
	 * insert rate, and the difference between them is that a job tears its
	 * document down again. Keeping it turns the job into a pure insert.
	 */
	const runJob = async (
		spec: JobSpec,
		index: number,
		photograph: boolean,
		settleMs: number,
		discard: boolean,
	): Promise<JobLeg> => {
		const leg: JobLeg = {
			frame: spec.name,
			insert: performance.now(),
			loaded: Number.NaN,
			asked: Number.NaN,
			source: Number.NaN,
			raster: Number.NaN,
			discard: Number.NaN,
			bytes: Number.NaN,
		};
		state.jobStarts++;
		const { slot, el } = openSlot(spec, index);
		const loadedAt = await new Promise<number>((done) => {
			const timer = setTimeout(() => {
				waitingLoaded.delete(spec.name);
				done(Number.NaN);
			}, LOAD_TIMEOUT_MS);
			waitingLoaded.set(spec.name, (at) => {
				clearTimeout(timer);
				waitingLoaded.delete(spec.name);
				done(at);
			});
		});
		leg.loaded = loadedAt;
		if (!Number.isFinite(loadedAt)) state.jobFailures++;
		else if (photograph) {
			// the wait a real job would spend letting the frame finish arriving is
			// policy, not work; the caller owns it, so it never lands in a leg
			await new Promise((wait) => setTimeout(wait, config.captureIdle));
			const id = requestId();
			leg.asked = performance.now();
			const source = await new Promise<Record<string, unknown> | null>((done) => {
				const timer = setTimeout(() => {
					waitingSource.delete(id);
					done(null);
				}, CAPTURE_TIMEOUT_MS + settleMs);
				waitingSource.set(id, (reply) => {
					clearTimeout(timer);
					waitingSource.delete(id);
					done(reply);
				});
				el.contentWindow?.postMessage({ spool: "capture", id, maxEdge: 1200, settleMs }, "*");
			});
			leg.source = performance.now();
			if (source === null || typeof source.error === "string") state.jobFailures++;
			else {
				const shot = await raster(id, source);
				leg.raster = performance.now();
				if ("url" in shot) leg.bytes = shot.url.length;
				else state.jobFailures++;
			}
		}
		requests++;
		if (discard) {
			el.src = "about:blank";
			slot.remove();
		}
		leg.discard = performance.now();
		state.jobs.push(leg);
		return leg;
	};

	let running = false;
	let drained: (() => void) | null = null;

	const api: JobApi = {
		start(specs, cap, photograph, settleMs, discard) {
			if (specs.length === 0) return;
			running = true;
			const limit = cap > 0 ? Math.min(cap, specs.length) : specs.length;
			let cursor = 0;
			const pump = (): void => {
				while (running && inFlight < limit) {
					const spec = specs[cursor % specs.length];
					// kept documents pile up, so a slot index that reuses a freed slot
					// would stack them; cursor is monotonic and gives each its own
					const slotIndex = discard ? inFlight : cursor;
					cursor++;
					if (spec === undefined) return;
					inFlight++;
					void runJob(spec, slotIndex, photograph, settleMs, discard).then(() => {
						inFlight--;
						if (running) pump();
						else if (inFlight === 0) drained?.();
					});
				}
			};
			pump();
		},
		stop() {
			running = false;
			if (inFlight === 0) return Promise.resolve();
			return new Promise<void>((done) => {
				drained = () => {
					drained = null;
					done();
				};
			});
		},
		inFlight: () => inFlight,
		one: (spec, photograph, settleMs) => runJob(spec, 0, photograph, settleMs, true),
	};
	(globalThis as unknown as { __jobs: JobApi }).__jobs = api;
	// a runner that never ran is a run that measured nothing; the count is reported
	void requests;
}

// --- driving ---------------------------------------------------------------

interface GestureStats {
	p50: number;
	p95: number;
	worst: number;
	loafs: number;
	loafWorstBlocking: number;
	frames: number;
	/** Iframes inserted inside the window: the proof that mounting happened inside the gesture. */
	inserts: number;
	/** Refresh jobs in flight at the busiest animation frame of the window. */
	jobsPeak: number;
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
		inserts: state.inserted.filter((entry) => entry.t >= from && entry.t <= to).length,
		jobsPeak: inside.reduce((peak, sample) => Math.max(peak, sample.jobs), 0),
		wallMs: to - from,
	};
}

const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());
const read = (page: Page): Promise<BenchState> =>
	page.evaluate(() => (globalThis as unknown as { __bench: BenchState }).__bench);
const mountedCount = (page: Page): Promise<number> => page.evaluate(() => document.querySelectorAll("iframe").length);
/** Frames the canvas is drawing, mounted or not — a settled canvas holds no documents at all (#112). */
const framesOnCanvas = (page: Page): Promise<number> =>
	page.evaluate(() => document.querySelectorAll("[data-frame-cover]").length);

async function settle(page: Page, stableMs: number, timeoutMs: number): Promise<number> {
	const deadline = Date.now() + timeoutMs;
	let count = await mountedCount(page);
	let since = Date.now();
	while (Date.now() < deadline) {
		await page.waitForTimeout(150);
		const next = await mountedCount(page);
		if (next !== count) {
			count = next;
			since = Date.now();
		} else if (Date.now() - since >= stableMs) return count;
	}
	return count;
}

const PAN_EVENTS = 90;
const PAN_STEP_PX = 26;
/**
 * Trackpad-sized, and long on purpose: the canvas zooms by exp(-px * 0.011) per
 * event, so 30 one-way events of 1 px is ~1.4x — enough to carry the camera from
 * just under K_MIN_MOUNT to comfortably over it, while spanning several 300 ms
 * sweeps. A shorter, coarser gesture crosses the threshold on its last event and
 * the mounting it causes lands after the window closes, which reads as "mounting
 * costs nothing" for the wrong reason.
 */
const ZOOM_EVENTS = 60;
const ZOOM_STEP_PX = 1;

/** A round-trip pan: out and back, so the camera ends where it started. */
async function pan(page: Page, cx: number, cy: number): Promise<{ from: number; to: number }> {
	await page.mouse.move(cx, cy);
	await page.waitForTimeout(300);
	const from = await now(page);
	for (let i = 0; i < PAN_EVENTS; i++) {
		const away = i < PAN_EVENTS / 2 ? 1 : -1;
		await page.mouse.wheel(away * PAN_STEP_PX, away * PAN_STEP_PX);
	}
	return { from, to: await now(page) };
}

/**
 * Zoom in, and optionally back out. The mount arm wants the one-way version:
 * crossing K_MIN_MOUNT upward is what makes a whole screen of frames mountable
 * inside the gesture, and zooming back out would unmount them again before the
 * pan that follows can overlap the drain.
 */
async function zoom(page: Page, cx: number, cy: number, roundTrip: boolean): Promise<{ from: number; to: number }> {
	await page.mouse.move(cx, cy);
	await page.waitForTimeout(300);
	await page.keyboard.down("Control");
	const from = await now(page);
	const events = roundTrip ? ZOOM_EVENTS : Math.round(ZOOM_EVENTS / 2);
	for (let i = 0; i < events; i++) {
		const inward = roundTrip ? i < events / 2 : true;
		await page.mouse.wheel(0, (inward ? -1 : 1) * ZOOM_STEP_PX);
	}
	const to = await now(page);
	await page.keyboard.up("Control");
	return { from, to };
}

interface ArmRow {
	arm: string;
	label: string;
	rate: number;
	refreshMs: number;
	mountedAfter: number;
	hotZoom: GestureStats;
	hotPan: GestureStats;
	quietZoom: GestureStats;
	quietPan: GestureStats;
	jobStarts: number;
	jobFailures: number;
}

/** The display's own idle cadence, measured rather than assumed: the p95 bar is one refresh plus slack. */
function refreshInterval(state: BenchState): number {
	const idle = state.raf
		.slice(-90)
		.map((sample) => sample.d)
		.sort((a, b) => a - b);
	return quantile(idle, 0.5);
}

interface OpenOptions {
	hooks: { errands: number } | null;
	captureIdle: number;
	throttle: number;
}

/**
 * Throttling the page target reaches the canvas UI's renderer and nothing else,
 * and the frames are not in it (#82/#85) — so a page-only throttle would model a
 * slow canvas driving fast frames, which is not a machine anyone owns. Frames
 * are throttled as they attach, and swept again once the canvas has settled for
 * the ones whose process was not ready in time.
 */
async function throttleEveryFrame(context: BrowserContext, page: Page, rate: number): Promise<number> {
	if (rate === 1) return 0;
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

async function open(
	browser: Browser,
	url: string,
	options: OpenOptions,
): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	if (options.hooks !== null) {
		await context.addInitScript((hooks) => {
			(globalThis as unknown as { __spoolBench: unknown }).__spoolBench = hooks;
		}, options.hooks);
	}
	await context.addInitScript(instrument, { captureIdle: options.captureIdle });
	const page = await context.newPage();
	page.on("pageerror", (error) => process.stderr.write(`bench: page error — ${String(error).slice(0, 200)}\n`));
	if (options.throttle > 1) {
		const cdp = await context.newCDPSession(page);
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: options.throttle });
		page.on("frameattached", (frame) => {
			void context
				.newCDPSession(frame)
				.then((session) => session.send("Emulation.setCPUThrottlingRate", { rate: options.throttle }))
				.catch(() => undefined);
		});
	}
	await page.goto(url, { waitUntil: "domcontentloaded" });
	return { context, page };
}

/**
 * The canvas's own refresh errands, through its own React tree, while the camera
 * moves.
 *
 * The subject arrives without its stills, so every frame on the page owes a
 * picture and the canvas keeps `cap` of them borrowed for the whole run: a
 * document inserted, booted, photographed and discarded, over and over, in the
 * realm that pays for it. That is the arm #94 could not build, and the one its
 * churn finding needed — the overlay arm below stages the same pressure by
 * hand, outside React, and produced no stable number.
 *
 * Both gestures then run again over the same canvas once every frame has its
 * picture and nothing is borrowed any more. That is the control, and the
 * hot-minus-quiet delta is the answer.
 */
async function canvasArm(
	browser: Browser,
	url: string,
	resetCamera: () => void,
	cap: number,
	rate: number,
): Promise<ArmRow> {
	resetCamera();
	const label = cap > 0 ? `${cap} borrowed at once` : "unbounded";
	const { context, page } = await open(browser, url, { hooks: { errands: cap }, captureIdle: 0, throttle: rate });
	// errands start once the camera holds still, and keep coming while any frame
	// on the page is still owed a picture
	await page.waitForFunction(() => document.querySelectorAll("iframe").length > 0, undefined, { timeout: 60_000 });
	const before = await mountedCount(page);
	const state0 = await read(page);
	const refreshMs = refreshInterval(state0);

	const size = page.viewportSize() ?? VIEWPORT;
	const cx = Math.round(size.width / 2);
	const cy = Math.round(size.height / 2);

	const hotZoomWindow = await zoom(page, cx, cy, true);
	const hotPanWindow = await pan(page, cx, cy);

	// every frame photographed, nothing borrowed: the canvas at rest
	const mountedAfter = await settle(page, 2000, 180_000);
	await throttleEveryFrame(context, page, rate);
	const quietZoomWindow = await zoom(page, cx, cy, true);
	await page.waitForTimeout(600);
	const quietPanWindow = await pan(page, cx, cy);

	const state = await read(page);
	await context.close();
	const hotZoom = windowStats(state, hotZoomWindow.from, hotZoomWindow.to);
	const hotPan = windowStats(state, hotPanWindow.from, hotPanWindow.to);
	// A gesture over a canvas that borrowed nothing reads as "mounting is free"
	// for the one reason that proves nothing. This map has shipped that mistake
	// twice; the arm says so out loud rather than reporting a null run as a pass.
	if (hotZoom.inserts === 0 && hotPan.inserts === 0) {
		throw new Error(
			"no frame was borrowed inside either hot gesture — either the subject arrived with its stills or the #112 hook is missing from the built UI, and this row would report a null run as a pass",
		);
	}
	process.stderr.write(
		`bench:   canvas/${label}: ${before} borrowed at the start, ${mountedAfter} once every picture is taken; zoom ${
			hotZoom.inserts
		} inserts over ${ms(hotZoom.wallMs)} ms, pan ${hotPan.inserts} over ${ms(hotPan.wallMs)} ms\n`,
	);
	return {
		arm: "canvas",
		label,
		rate,
		refreshMs,
		mountedAfter,
		hotZoom,
		hotPan,
		quietZoom: windowStats(state, quietZoomWindow.from, quietZoomWindow.to),
		quietPan: windowStats(state, quietPanWindow.from, quietPanWindow.to),
		jobStarts: 0,
		jobFailures: 0,
	};
}

/**
 * The same pressure staged by hand: documents inserted into a fixed overlay
 * above the transforming canvas, booted, photographed and discarded under an
 * opaque lid, while the camera moves. Nothing the canvas shows changes. Kept
 * only to be read against the arm above — this is the path #94 measured, it is
 * not the canvas's own, and it never produced a stable number.
 */
async function jobsArm(
	browser: Browser,
	url: string,
	resetCamera: () => void,
	specs: JobSpec[],
	cap: number,
	photograph: boolean,
	discard: boolean,
	rate: number,
): Promise<ArmRow> {
	resetCamera();
	const label = `${cap > 0 ? cap : "unbounded"} in flight${photograph ? "" : ", no photograph"}${
		discard ? "" : ", kept not discarded"
	}`;
	const { context, page } = await open(browser, url, { hooks: null, captureIdle: 0, throttle: rate });
	// A settled canvas holds no documents at all now, so the thing to insist on
	// is that it is drawing frames: a run over an empty page would report a
	// perfectly smooth gesture over nothing.
	const mountedAfter = await settle(page, 1000, 40_000);
	if ((await framesOnCanvas(page)) === 0) {
		await context.close();
		throw new Error("the canvas settled with no frames on screen — this run would measure an empty screen");
	}
	await throttleEveryFrame(context, page, rate);
	const state0 = await read(page);
	const refreshMs = refreshInterval(state0);
	const size = page.viewportSize() ?? VIEWPORT;
	const cx = Math.round(size.width / 2);
	const cy = Math.round(size.height / 2);

	// quiet first: the control has to be taken on a canvas the jobs have not
	// yet touched, or it would carry their leftovers
	const quietZoomWindow = await zoom(page, cx, cy, true);
	await page.waitForTimeout(600);
	const quietPanWindow = await pan(page, cx, cy);
	await page.waitForTimeout(600);

	await page.evaluate(
		(input) =>
			(globalThis as unknown as { __jobs: JobApi }).__jobs.start(
				input.specs,
				input.cap,
				input.photograph,
				input.settleMs,
				input.discard,
			),
		{ specs, cap, photograph, settleMs: 900, discard },
	);
	// let the first wave reach flight, so the gesture opens with jobs already in it
	await page.waitForTimeout(1200);
	const hotZoomWindow = await zoom(page, cx, cy, true);
	await page.waitForTimeout(300);
	const hotPanWindow = await pan(page, cx, cy);
	await page.evaluate(() => (globalThis as unknown as { __jobs: JobApi }).__jobs.stop());

	const state = await read(page);
	await context.close();
	const hotZoom = windowStats(state, hotZoomWindow.from, hotZoomWindow.to);
	const hotPan = windowStats(state, hotPanWindow.from, hotPanWindow.to);
	process.stderr.write(
		`bench:   jobs/${label}: ${state.jobStarts} jobs started, ${state.jobFailures} failed; zoom ${
			hotZoom.inserts
		} inserts over ${ms(hotZoom.wallMs)} ms, pan ${hotPan.inserts} over ${ms(hotPan.wallMs)} ms\n`,
	);
	return {
		arm: "jobs",
		label,
		rate,
		refreshMs,
		mountedAfter,
		hotZoom,
		hotPan,
		quietZoom: windowStats(state, quietZoomWindow.from, quietZoomWindow.to),
		quietPan: windowStats(state, quietPanWindow.from, quietPanWindow.to),
		jobStarts: state.jobStarts,
		jobFailures: state.jobFailures,
	};
}

interface CostRow {
	label: string;
	n: number;
	insertToLoaded: number;
	askedToSource: number;
	sourceToRaster: number;
	discard: number;
	total: number;
	coverKb: number;
}

/** Price one refresh job, one at a time, on a settled canvas doing nothing else. */
async function costArm(
	browser: Browser,
	url: string,
	resetCamera: () => void,
	specs: JobSpec[],
	settleMs: number,
	photograph: boolean,
	rate: number,
): Promise<CostRow> {
	resetCamera();
	const { context, page } = await open(browser, url, { hooks: null, captureIdle: 0, throttle: rate });
	await settle(page, 1000, 40_000);
	if ((await framesOnCanvas(page)) === 0) {
		await context.close();
		throw new Error("the canvas settled with no frames on screen — this run would price a job on an empty screen");
	}
	await throttleEveryFrame(context, page, rate);
	const legs: JobLeg[] = [];
	for (const spec of specs) {
		legs.push(
			await page.evaluate(
				(input) =>
					(globalThis as unknown as { __jobs: JobApi }).__jobs.one(input.spec, input.photograph, input.settleMs),
				{ spec, photograph, settleMs },
			),
		);
		await page.waitForTimeout(400);
	}
	await context.close();

	const clean = legs.filter((leg) => Number.isFinite(leg.loaded) && (!photograph || Number.isFinite(leg.raster)));
	const median = (pick: (leg: JobLeg) => number): number =>
		quantile(
			clean
				.map(pick)
				.filter(Number.isFinite)
				.sort((a, b) => a - b),
			0.5,
		);
	const suffix = rate > 1 ? `, ${rate}x throttle` : "";
	const label = photograph
		? `photographed, ${settleMs} ms frame settle budget${suffix}`
		: `boot and discard, no photograph${suffix}`;
	process.stderr.write(`bench:   cost/${label}: ${clean.length}/${legs.length} complete\n`);
	return {
		label,
		n: clean.length,
		insertToLoaded: median((leg) => leg.loaded - leg.insert),
		askedToSource: median((leg) => leg.source - leg.asked),
		sourceToRaster: median((leg) => leg.raster - leg.source),
		discard: median((leg) => leg.discard - (Number.isFinite(leg.raster) ? leg.raster : leg.loaded)),
		total: median((leg) => leg.discard - leg.insert),
		coverKb: median((leg) => leg.bytes) / 1024,
	};
}

function gestureTable(rows: ArmRow[]): string {
	const cell = (stats: GestureStats): string =>
		`${ms(stats.p95)} / ${stats.loafs}${stats.loafs > 0 ? ` (${ms(stats.loafWorstBlocking)})` : ""}`;
	const lines = [
		"| arm | configuration | throttle | refresh | zoom hot p95 / loafs | zoom quiet | pan hot p95 / loafs | pan quiet | inserts in window (zoom / pan) | jobs in flight (zoom / pan peak) |",
		"|---|---|---|---|---|---|---|---|---|---|",
	];
	for (const row of rows) {
		lines.push(
			`| ${row.arm} | ${row.label} | ${row.rate}x | ${ms(row.refreshMs)} | ${cell(row.hotZoom)} | ${cell(
				row.quietZoom,
			)} | ${cell(row.hotPan)} | ${cell(row.quietPan)} | ${row.hotZoom.inserts} / ${row.hotPan.inserts} | ${
				row.hotZoom.jobsPeak
			} / ${row.hotPan.jobsPeak} |`,
		);
	}
	return lines.join("\n");
}

function costTable(rows: CostRow[]): string {
	const lines = [
		"| one refresh job | n | insert → loaded | ask → source | source → raster | discard | total | cover |",
		"|---|---|---|---|---|---|---|---|",
	];
	for (const row of rows) {
		lines.push(
			`| ${row.label} | ${row.n} | ${ms(row.insertToLoaded)} | ${ms(row.askedToSource)} | ${ms(
				row.sourceToRaster,
			)} | ${ms(row.discard)} | ${ms(row.total)} | ${Number.isFinite(row.coverKb) ? `${row.coverKb.toFixed(0)} KB` : "—"} |`,
		);
	}
	return lines.join("\n");
}

const frameUrl = (renderUrl: string, project: string, frame: string): string =>
	`${renderUrl}/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(frame)}`;

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = copyProject(options.project);
	const { page: canvasPage, frames: boxes } = densestPage(root);
	if (boxes.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	const specs: JobSpec[] = boxes.map((box: FrameBox) => ({
		name: box.name,
		url: frameUrl(daemon.renderUrl, name, box.name),
		w: box.w,
		h: box.h,
	}));

	// A job pointed at a 404 boots nothing, reports nothing, and costs the
	// gesture nothing — the exact shape of failure this map has already been
	// caught by twice. Ask once, out loud, before anything is measured.
	const probe = specs[0];
	if (probe !== undefined) {
		const response = await fetch(probe.url);
		if (!response.ok)
			throw new Error(`frame documents are not where this benchmark thinks: ${probe.url} → ${response.status}`);
	}

	const readable = planCamera(boxes, VIEWPORT.width, VIEWPORT.height, 0.16);
	process.stderr.write(
		`bench: ${url} (copy of ${options.project}, page "${canvasPage === "" ? "root" : canvasPage}", ${
			boxes.length
		} frames, arms ${options.arms.join(",")}, throttle ${options.throttle}x)\n`,
	);

	let browser: Browser | undefined;
	const rows: ArmRow[] = [];
	const costs: CostRow[] = [];
	try {
		browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		// one discarded pass: a fresh daemon compiles every frame it is asked for,
		// and a first-ever boot measures the toolchain rather than the canvas
		process.stderr.write("bench: warming the daemon\n");
		writeCamera(root, readable, canvasPage);
		const warm = await browser.newContext({ viewport: VIEWPORT });
		const warmPage = await warm.newPage();
		await warmPage.goto(url, { waitUntil: "domcontentloaded" });
		await settle(warmPage, 1500, 60_000);
		await warm.close();
		// the canvas persists its own camera on settle, and a save in flight when
		// the context closed can land after the planned one is written
		await new Promise((wait) => setTimeout(wait, 1500));

		const rate = options.throttle;
		const resetReadable = (): void => writeCamera(root, readable, canvasPage);
		if (options.arms.includes("jobs")) {
			process.stderr.write("bench: arm jobs — refresh jobs in flight behind the pictures\n");
			for (const cap of options.caps) {
				rows.push(await jobsArm(browser, url, resetReadable, specs, cap, true, true, rate));
			}
			// The same pressure with the photograph removed. A job is several costs
			// wearing one name, and a cap that has to hold for all of them is a
			// different number from one that only has to hold for the boot.
			for (const cap of options.caps) {
				rows.push(await jobsArm(browser, url, resetReadable, specs, cap, false, true, rate));
			}
			// And with the discard removed too, which leaves a pure insert. The mount
			// arm commits 31 documents inside a zoom for nothing while this arm costs
			// real frames at a third the rate, and tearing the document down again is
			// the one thing it does that the mount arm never does.
			for (const cap of options.caps) {
				rows.push(await jobsArm(browser, url, resetReadable, specs, cap, false, false, rate));
			}
		}
		if (options.arms.includes("cost")) {
			process.stderr.write("bench: arm cost — one refresh job, priced leg by leg\n");
			const sample = specs.slice(0, 8);
			costs.push(await costArm(browser, url, resetReadable, sample, 0, false, rate));
			costs.push(await costArm(browser, url, resetReadable, sample, 0, true, rate));
			costs.push(await costArm(browser, url, resetReadable, sample, 900, true, rate));
		}
		// Last, and it has to be: every frame owes a picture only if it has none,
		// so this arm takes the subject's stills away — and every arm above stands
		// on them.
		if (options.arms.includes("canvas")) {
			process.stderr.write("bench: arm canvas — the canvas's own errands through React while the camera moves\n");
			rmSync(join(root, "design", ".spool", "thumbs"), { recursive: true, force: true });
			for (const cap of options.caps) rows.push(await canvasArm(browser, url, resetReadable, cap, rate));
		}
	} finally {
		await browser?.close();
		daemon.stop();
	}

	const report = [rows.length > 0 ? gestureTable(rows) : "", costs.length > 0 ? costTable(costs) : ""]
		.filter((part) => part !== "")
		.join("\n\n");
	process.stdout.write(`${report}\n`);
	if (options.out !== undefined) {
		writeFileSync(
			options.out,
			`${JSON.stringify(
				{ project: options.project, headed: options.headed, throttle: options.throttle, rows, costs },
				null,
				2,
			)}\n`,
		);
		process.stderr.write(`bench: wrote ${options.out}\n`);
	}
}

await main();
