import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type BrowserContext, type CDPSession, chromium, type Page } from "playwright-core";
import {
	copyProject,
	DEFAULT_ZOOM,
	type FrameBox,
	freePort,
	mountedCount,
	ms,
	namedPage,
	planCamera,
	prepareCurrentCovers,
	quantile,
	quiet,
	startDaemon,
	VIEWPORT,
	writeCamera,
} from "./harness.ts";

/**
 * Do readable, live-animated frames degrade canvas pan/zoom, and where does the
 * time go (issue: dither-attribution).
 *
 * Two arms at equal geometry: `animated` is a real project's "dither" page
 * as-is — 12 frames each running a 30fps 2D-canvas dithering rAF loop
 * (design/shared/ui/dither-specimen.tsx). `static` is the same project with
 * that loop and its dot-plate.tsx twin patched to paint their first frame and
 * never re-queue rAF again — same DOM, same layout, same first paint, the
 * *only* difference is whether the animation keeps running. Comparing the two
 * isolates "live animation" from every other confound canvas.ts's gesture
 * bench (#82) already covers (frame count, size, throttle).
 *
 * The attribution question needs per-process CPU, not just frame-interval
 * stats: `SystemInfo.getProcessInfo` (browser-level CDP) reports cpu time per
 * pid but never which site a renderer pid is hosting (`bench/frame-cost.ts`
 * only ever counted or summed processes, never attributed a specific one).
 * This resolves that by causing a known, deliberate ~250ms synchronous
 * busy-loop through a CDP session scoped to a known target — the canvas's own
 * page, then a mounted frame — and reading back which pid's cpu jumped by
 * about that much. Whichever renderer lights up is that target's renderer,
 * unambiguously, because Playwright's `newCDPSession(pageOrFrame)` already
 * guarantees which process a session talks to; the busy loop just makes that
 * process's identity legible in `getProcessInfo`'s otherwise anonymous pid
 * list. Validated empirically before use: two independent trials each showed
 * exactly one renderer jumping by ~250-265ms against a <2ms background on
 * every other process.
 *
 * A Chrome trace (raw CDP `Tracing.start`/`.end`, not Playwright's own zipped
 * format) is captured over the pan gesture per arm, with the four categories
 * the ticket names. `RunTask` is not among the events those categories carry
 * (that lives under the base `disabled-by-default-devtools.timeline`, not
 * requested); main-thread busy time is instead computed by flattening each
 * renderer's own complete ('X'-phase) events on its `CrRendererMain` thread
 * into non-overlapping wall-clock spans, so nested durations are not double
 * counted. The per-name totals reported alongside it are inclusive sums
 * (a name's total includes time spent in anything it called), the standard
 * caveat for any trace summary that is not doing full bottom-up self-time.
 *
 *   pnpm build && node bench/dither-attribution.ts
 *   node bench/dither-attribution.ts --project <path> --out <dir> --runs 3
 *
 * Run with node's own type stripping, not tsx — see bench/harness.ts.
 */

interface Options {
	project: string;
	out: string;
}

/**
 * `--runs` is deliberately not a knob: the ticket asks for exactly 3 clean
 * repetitions per arm in this alternating order (plus one dedicated trace run
 * each, appended after), and `main` below hardcodes that sequence rather than
 * generalizing a pattern nobody asked for.
 */
function parseArgs(argv: string[]): Options {
	let project = "/Users/liamvinberg/projects/liamvinberg.com";
	let out =
		"/private/tmp/claude-501/-Users-liamvinberg-projects-spool/62545b71-e1f3-415f-b05b-28bc7f02dd1b/scratchpad/dither-attribution";
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	return { project, out };
}

/** Drawn width lands at 416 CSS px — inside the ticket's 410-430 px window, just above the 400 px live threshold. */
const K = 0.52;
const PAGE_NAME = "dither";
/** A frame confirmed live at K, used for the paint-behavior screenshot/hash check. */
const SAMPLE_FRAME = "dither-atkinson";

// --- static-arm patch ------------------------------------------------------

function patchFile(path: string, replacements: readonly (readonly [string, string])[]): void {
	let content = readFileSync(path, "utf8");
	for (const [find, replace] of replacements) {
		if (!content.includes(find)) {
			throw new Error(`patchFile: expected source not found in ${path}:\n${find}`);
		}
		content = content.replace(find, replace);
	}
	writeFileSync(path, content);
}

const PAINTED_FLAG_COMMENT =
	"\t\t// bench/dither-attribution.ts (static arm): paint once, then stop\n" +
	"\t\t// re-queuing rAF entirely — the two arms differ only in whether the\n" +
	"\t\t// loop keeps going, not in what the first painted frame looks like.\n" +
	"\t\tlet painted = false;\n";

/**
 * Same DOM, same layout, same first painted frame; only the ongoing loop
 * differs. `painted` gates the very top of `draw`, so once the loop has
 * completed one real paint (visible, past the frame-interval throttle) the
 * next call returns before re-queuing `requestAnimationFrame` at all.
 */
function patchToStatic(root: string): void {
	const specimen = join(root, "design/shared/ui/dither-specimen.tsx");
	patchFile(specimen, [
		[
			"\t\tlet raf = 0;\n\t\tlet last = 0;\n\t\tlet tick = 0;\n\t\tlet visible = true;\n\n",
			`\t\tlet raf = 0;\n\t\tlet last = 0;\n\t\tlet tick = 0;\n\t\tlet visible = true;\n${PAINTED_FLAG_COMMENT}\n`,
		],
		[
			"\t\tconst draw = (now: number) => {\n\t\t\traf = requestAnimationFrame(draw);\n\t\t\tif (!visible) return;\n\t\t\tif (now - last < FRAME_MS) return;\n\t\t\tlast = now;\n\t\t\ttick++;\n",
			"\t\tconst draw = (now: number) => {\n\t\t\tif (painted) return;\n\t\t\traf = requestAnimationFrame(draw);\n\t\t\tif (!visible) return;\n\t\t\tif (now - last < FRAME_MS) return;\n\t\t\tlast = now;\n\t\t\ttick++;\n",
		],
		[
			"\t\t\t} else if (atlas) {\n\t\t\t\tctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n\t\t\t\tctx.imageSmoothingEnabled = false;\n\t\t\t\tsink.paint(ctx, atlas, src);\n\t\t\t}\n\t\t};\n",
			"\t\t\t} else if (atlas) {\n\t\t\t\tctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n\t\t\t\tctx.imageSmoothingEnabled = false;\n\t\t\t\tsink.paint(ctx, atlas, src);\n\t\t\t}\n\t\t\tpainted = true;\n\t\t};\n",
		],
	]);

	const dotPlate = join(root, "design/shared/ui/dot-plate.tsx");
	patchFile(dotPlate, [
		[
			"\t\tlet raf = 0;\n\t\tlet last = 0;\n\t\tlet visible = true;\n\n",
			`\t\tlet raf = 0;\n\t\tlet last = 0;\n\t\tlet visible = true;\n${PAINTED_FLAG_COMMENT}\n`,
		],
		[
			"\t\tconst draw = (now: number) => {\n\t\t\traf = requestAnimationFrame(draw);\n\t\t\tif (!visible) return;\n\t\t\tif (now - last < FRAME_MS) return;\n\t\t\tlast = now;\n\n\t\t\tconst aim = target.current;\n",
			"\t\tconst draw = (now: number) => {\n\t\t\tif (painted) return;\n\t\t\traf = requestAnimationFrame(draw);\n\t\t\tif (!visible) return;\n\t\t\tif (now - last < FRAME_MS) return;\n\t\t\tlast = now;\n\n\t\t\tconst aim = target.current;\n",
		],
		[
			"\t\t\toffCtx.putImageData(image, 0, 0);\n\t\t\tctx.setTransform(1, 0, 0, 1, 0, 0);\n\t\t\tctx.imageSmoothingEnabled = false;\n\t\t\tctx.drawImage(off, 0, 0, GRID, GRID, 0, 0, PLATE * dpr, PLATE * dpr);\n\t\t};\n",
			"\t\t\toffCtx.putImageData(image, 0, 0);\n\t\t\tctx.setTransform(1, 0, 0, 1, 0, 0);\n\t\t\tctx.imageSmoothingEnabled = false;\n\t\t\tctx.drawImage(off, 0, 0, GRID, GRID, 0, 0, PLATE * dpr, PLATE * dpr);\n\t\t\tpainted = true;\n\t\t};\n",
		],
	]);
}

// --- gesture collector (ported from bench/canvas.ts, #82) ------------------

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
interface BenchState {
	raf: Sample[];
	loaf: Loaf[];
}

function collector(): void {
	if (window !== window.top) return;
	const state: BenchState = { raf: [], loaf: [] };
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
}

interface GestureStats {
	p50: number;
	p95: number;
	worst: number;
	rareIntervals: number;
	loafs: number;
	loafWorstBlocking: number;
	frames: number;
	mountedPeak: number;
	wallMs: number;
}

const RARE_INTERVAL_MS = 12;

function windowStats(state: BenchState, from: number, to: number): GestureStats {
	const inside = state.raf.filter((sample) => sample.t >= from && sample.t <= to);
	const deltas = inside.map((sample) => sample.d).sort((a, b) => a - b);
	const loafs = state.loaf.filter((entry) => entry.t >= from && entry.t <= to);
	return {
		p50: quantile(deltas, 0.5),
		p95: quantile(deltas, 0.95),
		worst: deltas.at(-1) ?? Number.NaN,
		rareIntervals: deltas.filter((delta) => delta > RARE_INTERVAL_MS).length,
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

/** Hold until the canvas stops mounting: the count unchanged across `stableMs` (ported from canvas.ts). */
async function settle(page: Page, stableMs: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let count = await mountedCount(page);
	let since = Date.now();
	while (Date.now() < deadline) {
		await page.waitForTimeout(150);
		const next = await mountedCount(page);
		if (next !== count) {
			count = next;
			since = Date.now();
		} else if (Date.now() - since >= stableMs) return;
	}
}

const PAN_EVENTS = 90;
const PAN_STEP_PX = 26;
const ZOOM_EVENTS = 60;
const ZOOM_STEP_PX = 4;
const WHEEL_INTERVAL_MS = 1000 / 60;

async function driveRoundTripWheel(page: Page, steps: number, deltaX: number, deltaY: number): Promise<void> {
	const started = performance.now();
	for (let step = 0; step < steps; step++) {
		const direction = step < steps / 2 ? 1 : -1;
		await page.mouse.wheel(direction * deltaX, direction * deltaY);
		const delay = started + (step + 1) * WHEEL_INTERVAL_MS - performance.now();
		if (delay > 0) await page.waitForTimeout(delay);
	}
}

// --- process accounting -----------------------------------------------------

interface ProcInfo {
	type: string;
	id: number;
	cpuTime: number;
}

async function snapshotProcesses(browserSession: CDPSession): Promise<ProcInfo[]> {
	const { processInfo } = await browserSession.send("SystemInfo.getProcessInfo");
	return processInfo;
}

/** cpu-seconds each pid in `after` gained since `before` (0 if the pid is new). */
function cpuDeltas(before: readonly ProcInfo[], after: readonly ProcInfo[]): Map<number, number> {
	const beforeMap = new Map(before.map((p) => [p.id, p.cpuTime]));
	const out = new Map<number, number>();
	for (const p of after) out.set(p.id, p.cpuTime - (beforeMap.get(p.id) ?? 0));
	return out;
}

function rssMbByPid(pids: readonly number[]): Map<number, number> {
	const map = new Map<number, number>();
	if (pids.length === 0) return map;
	let out: string;
	try {
		out = execFileSync("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], { encoding: "utf8" });
	} catch {
		return map; // a pid that has already exited makes `ps` fail on some platforms; report nothing for it
	}
	for (const line of out.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const parts = trimmed.split(/\s+/);
		const pid = Number(parts[0]);
		const rss = Number(parts[1]);
		if (Number.isFinite(pid) && Number.isFinite(rss)) map.set(pid, rss / 1024);
	}
	return map;
}

/**
 * Which pid is which, established by causing a known ~250ms synchronous cpu
 * spike through a CDP session scoped to a known target, then reading back
 * which pid's cpu jumped by about that much (see the file header). Redone
 * once per fresh browser context, since Chromium hands each context its own
 * renderer processes even for the same site.
 */
interface Roles {
	canvasPid: number;
	canvasCalibrationS: number;
	framesPid: number;
	framesCalibrationS: number;
	gpuPids: number[];
	browserPid: number | undefined;
	otherRendererPids: number[];
}

const BUSY_LOOP_MS = 250;
const busyLoopExpression = `(() => { const s = Date.now(); while (Date.now() - s < ${BUSY_LOOP_MS}) { /* deliberate */ } return 1; })()`;

function rendererIds(list: readonly ProcInfo[]): number[] {
	return list.filter((p) => p.type === "renderer").map((p) => p.id);
}

function argmaxDelta(delta: Map<number, number>, candidates: readonly number[]): [number, number] {
	let bestId: number | undefined;
	let bestValue = Number.NEGATIVE_INFINITY;
	for (const id of candidates) {
		const value = delta.get(id) ?? 0;
		if (value > bestValue) {
			bestValue = value;
			bestId = id;
		}
	}
	if (bestId === undefined) throw new Error("argmaxDelta: no renderer candidates to choose from");
	return [bestId, bestValue];
}

async function calibrateRoles(context: BrowserContext, page: Page, browserSession: CDPSession): Promise<Roles> {
	const pageCdp = await context.newCDPSession(page);
	const before1 = await snapshotProcesses(browserSession);
	await pageCdp.send("Runtime.evaluate", { expression: busyLoopExpression, returnByValue: true });
	const after1 = await snapshotProcesses(browserSession);
	const delta1 = cpuDeltas(before1, after1);
	await pageCdp.detach().catch(() => undefined);

	await page.waitForTimeout(500);

	const frameHandle = page.frames().find((f) => f !== page.mainFrame());
	if (frameHandle === undefined) throw new Error("calibrateRoles: no mounted frame to attach to");
	const frameCdp = await context.newCDPSession(frameHandle);
	const before2 = await snapshotProcesses(browserSession);
	await frameCdp.send("Runtime.evaluate", { expression: busyLoopExpression, returnByValue: true });
	const after2 = await snapshotProcesses(browserSession);
	const delta2 = cpuDeltas(before2, after2);
	await frameCdp.detach().catch(() => undefined);

	const [canvasPid, canvasCalibrationS] = argmaxDelta(delta1, rendererIds(after1));
	const [framesPid, framesCalibrationS] = argmaxDelta(delta2, rendererIds(after2));

	if (canvasPid === framesPid) {
		throw new Error("calibrateRoles: the page busy-loop and the frame busy-loop landed on the same pid");
	}
	if (canvasCalibrationS < 0.1 || framesCalibrationS < 0.1) {
		process.stderr.write(
			`bench:   WARNING calibration deltas smaller than expected (canvas ${(canvasCalibrationS * 1000).toFixed(0)}ms, frames ${(framesCalibrationS * 1000).toFixed(0)}ms) — pid roles may be unreliable this run\n`,
		);
	}

	const gpuPids = after2.filter((p) => p.type === "GPU").map((p) => p.id);
	const browserPid = after2.find((p) => p.type === "browser")?.id;
	const otherRendererPids = rendererIds(after2).filter((id) => id !== canvasPid && id !== framesPid);

	return { canvasPid, canvasCalibrationS, framesPid, framesCalibrationS, gpuPids, browserPid, otherRendererPids };
}

interface Buckets {
	canvasS: number;
	framesS: number;
	gpuS: number;
	browserS: number;
	otherS: number;
}

function bucketDeltas(before: readonly ProcInfo[], after: readonly ProcInfo[], roles: Roles): Buckets {
	const delta = cpuDeltas(before, after);
	const sumOf = (ids: readonly number[]): number => ids.reduce((sum, id) => sum + (delta.get(id) ?? 0), 0);
	const known = new Set<number>([
		roles.canvasPid,
		roles.framesPid,
		...roles.gpuPids,
		...roles.otherRendererPids,
		...(roles.browserPid !== undefined ? [roles.browserPid] : []),
	]);
	const otherIds = after.filter((p) => !known.has(p.id)).map((p) => p.id);
	return {
		canvasS: delta.get(roles.canvasPid) ?? 0,
		framesS: delta.get(roles.framesPid) ?? 0,
		gpuS: sumOf(roles.gpuPids),
		browserS: roles.browserPid !== undefined ? (delta.get(roles.browserPid) ?? 0) : 0,
		otherS: sumOf([...roles.otherRendererPids, ...otherIds]),
	};
}

interface MemorySnapshot {
	canvasRssMb: number;
	framesRssMb: number;
	gpuRssMb: number;
	browserRssMb: number;
	otherRssMb: number;
	totalRssMb: number;
}

function memorySnapshot(processInfo: readonly ProcInfo[], roles: Roles): MemorySnapshot {
	const known = new Set<number>([
		roles.canvasPid,
		roles.framesPid,
		...roles.gpuPids,
		...roles.otherRendererPids,
		...(roles.browserPid !== undefined ? [roles.browserPid] : []),
	]);
	const otherIds = processInfo.filter((p) => !known.has(p.id)).map((p) => p.id);
	const rss = rssMbByPid(processInfo.map((p) => p.id));
	const sumOf = (ids: readonly number[]): number => ids.reduce((sum, id) => sum + (rss.get(id) ?? 0), 0);
	const canvasRssMb = rss.get(roles.canvasPid) ?? 0;
	const framesRssMb = rss.get(roles.framesPid) ?? 0;
	const gpuRssMb = sumOf(roles.gpuPids);
	const browserRssMb = roles.browserPid !== undefined ? (rss.get(roles.browserPid) ?? 0) : 0;
	const otherRssMb = sumOf([...roles.otherRendererPids, ...otherIds]);
	return {
		canvasRssMb,
		framesRssMb,
		gpuRssMb,
		browserRssMb,
		otherRssMb,
		totalRssMb: canvasRssMb + framesRssMb + gpuRssMb + browserRssMb + otherRssMb,
	};
}

// --- Chrome trace (raw CDP Tracing, not Playwright's own format) -----------

interface TraceEvent {
	pid: number;
	tid: number;
	ts: number;
	dur?: number;
	ph: string;
	name: string;
	cat: string;
	args?: unknown;
}

const TRACE_CATEGORIES = [
	"devtools.timeline",
	"disabled-by-default-devtools.timeline.frame",
	"v8.execute",
	"blink.user_timing",
];

async function captureTrace(browserSession: CDPSession, during: () => Promise<void>): Promise<TraceEvent[]> {
	const collected: TraceEvent[] = [];
	// the CDP type for a trace event's own fields is a loose string map (the
	// protocol does not type individual trace event shapes); the real payload
	// is the standard Chrome JSON trace event object this file's analysis expects
	const onData = (event: { value: Record<string, string>[] }): void => {
		collected.push(...(event.value as unknown as TraceEvent[]));
	};
	browserSession.on("Tracing.dataCollected", onData);
	const complete = new Promise<void>((resolveComplete) => {
		browserSession.once("Tracing.tracingComplete", () => resolveComplete());
	});
	await browserSession.send("Tracing.start", {
		transferMode: "ReportEvents",
		traceConfig: { includedCategories: TRACE_CATEGORIES },
	});
	await during();
	await browserSession.send("Tracing.end");
	await complete;
	browserSession.off("Tracing.dataCollected", onData);
	return collected;
}

function mainThreadTid(events: readonly TraceEvent[], pid: number): number | undefined {
	const meta = events.find(
		(e) =>
			e.cat === "__metadata" &&
			e.name === "thread_name" &&
			e.pid === pid &&
			typeof e.args === "object" &&
			e.args !== null &&
			(e.args as Record<string, unknown>).name === "CrRendererMain",
	);
	return meta?.tid;
}

/** Non-overlapping wall-clock busy time on one (pid, tid): nested 'X' spans are not double counted. */
function flattenBusyMs(events: readonly TraceEvent[], pid: number, tid: number): number {
	const spans = events
		.filter((e) => e.ph === "X" && e.pid === pid && e.tid === tid && typeof e.dur === "number")
		.map((e) => ({ start: e.ts, end: e.ts + (e.dur ?? 0) }))
		.sort((a, b) => a.start - b.start);
	let total = 0;
	let cursor = Number.NEGATIVE_INFINITY;
	for (const span of spans) {
		if (span.end <= cursor) continue;
		const start = Math.max(span.start, cursor);
		total += span.end - start;
		cursor = Math.max(cursor, span.end);
	}
	return total / 1000;
}

interface NamedTotal {
	name: string;
	totalMs: number;
	count: number;
}

/** Inclusive per-name totals (a name's total includes time spent in anything nested under it). */
function topByName(events: readonly TraceEvent[], pid: number, tid: number, limit: number): NamedTotal[] {
	const totals = new Map<string, { total: number; count: number }>();
	for (const e of events) {
		if (e.ph !== "X" || e.pid !== pid || e.tid !== tid || typeof e.dur !== "number") continue;
		const cur = totals.get(e.name) ?? { total: 0, count: 0 };
		cur.total += e.dur;
		cur.count += 1;
		totals.set(e.name, cur);
	}
	return [...totals.entries()]
		.map(([name, { total, count }]) => ({ name, totalMs: total / 1000, count }))
		.sort((a, b) => b.totalMs - a.totalMs)
		.slice(0, limit);
}

interface TraceAnalysis {
	canvasBusyMs: number;
	framesBusyMs: number;
	canvasTop: NamedTotal[];
	framesTop: NamedTotal[];
	windowMs: number;
}

function analyzeTrace(events: readonly TraceEvent[], roles: Roles): TraceAnalysis {
	const canvasTid = mainThreadTid(events, roles.canvasPid);
	const framesTid = mainThreadTid(events, roles.framesPid);
	const ts = events.map((e) => e.ts).filter((t) => Number.isFinite(t));
	const windowMs = ts.length > 0 ? (Math.max(...ts) - Math.min(...ts)) / 1000 : Number.NaN;
	return {
		canvasBusyMs: canvasTid === undefined ? Number.NaN : flattenBusyMs(events, roles.canvasPid, canvasTid),
		framesBusyMs: framesTid === undefined ? Number.NaN : flattenBusyMs(events, roles.framesPid, framesTid),
		canvasTop: canvasTid === undefined ? [] : topByName(events, roles.canvasPid, canvasTid, 5),
		framesTop: framesTid === undefined ? [] : topByName(events, roles.framesPid, framesTid, 5),
		windowMs,
	};
}

// --- arms --------------------------------------------------------------------

interface ArmSetup {
	label: "animated" | "static";
	root: string;
	name: string;
	spoolDir: string;
	url: string;
	renderUrl: string;
	stop: () => void;
}

async function setupArm(source: string, label: "animated" | "static"): Promise<ArmSetup> {
	const { root, name, spoolDir } = copyProject(source);
	if (label === "static") patchToStatic(root);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	return { label, root, name, spoolDir, url, renderUrl: daemon.renderUrl, stop: daemon.stop };
}

async function verifyPaintBehavior(
	browser: Browser,
	arm: ArmSetup,
	outDir: string,
): Promise<{ painted: boolean; changedOverTwoSeconds: boolean }> {
	const frameUrl = `${arm.renderUrl}/p/${encodeURIComponent(arm.name)}/frames/${encodeURIComponent(SAMPLE_FRAME)}`;
	const context = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	await page.goto(frameUrl, { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(1200);
	await page.screenshot({ path: join(outDir, `${arm.label}-frame-screenshot.png`) });

	const fingerprint = (): Promise<number | null> =>
		page.evaluate(() => {
			const canvas = document.querySelector("canvas");
			if (!canvas) return null;
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			let sum = 0;
			for (let i = 0; i < data.length; i += 97) sum += data[i] ?? 0;
			return sum;
		});

	const painted = await page.evaluate(() => {
		const canvas = document.querySelector("canvas");
		if (!canvas) return false;
		const ctx = canvas.getContext("2d");
		if (!ctx) return false;
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 10) return true;
		return false;
	});
	const s1 = await fingerprint();
	await page.waitForTimeout(2000);
	const s2 = await fingerprint();
	await context.close();
	return { painted, changedOverTwoSeconds: s1 !== s2 };
}

// --- one measured run --------------------------------------------------------

interface RunResult {
	arm: "animated" | "static";
	index: number;
	traced: boolean;
	liveMounted: number;
	roles: {
		canvasPid: number;
		framesPid: number;
		canvasCalibrationMs: number;
		framesCalibrationMs: number;
		otherRendererPids: number[];
	};
	pan: GestureStats;
	zoom: GestureStats;
	idleCpu: Buckets;
	idleRss: MemorySnapshot;
	panCpu: Buckets;
	zoomCpu: Buckets;
}

const IDLE_MS = 10_000;

async function runOnce(
	browser: Browser,
	arm: ArmSetup,
	camera: { x: number; y: number; k: number },
	index: number,
	trace: boolean,
): Promise<{ result: RunResult; traceEvents: TraceEvent[] | undefined }> {
	writeCamera(arm.root, camera, PAGE_NAME);

	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
	await context.addInitScript(collector);
	const page = await context.newPage();
	page.on("pageerror", (e) =>
		process.stderr.write(`bench: [${arm.label}#${index}] page error — ${String(e).slice(0, 200)}\n`),
	);

	await page.goto(arm.url, { waitUntil: "domcontentloaded" });
	await settle(page, 1000, 30_000);
	const borrowed = await quiet(page, 120_000);
	if (borrowed !== 0) throw new Error(`[${arm.label}#${index}] ${borrowed} picture errands remained after settle`);
	// let the still-frames' rAF loops reach steady state before anything is measured
	await page.waitForTimeout(2000);
	const liveMounted = await mountedCount(page);

	const browserSession = await browser.newBrowserCDPSession();
	const roles = await calibrateRoles(context, page, browserSession);
	await page.waitForTimeout(300);

	// --- idle window ---
	await quiet(page, 30_000);
	const idleBefore = await snapshotProcesses(browserSession);
	await page.waitForTimeout(IDLE_MS);
	const idleAfter = await snapshotProcesses(browserSession);
	const idleCpu = bucketDeltas(idleBefore, idleAfter, roles);
	const idleRss = memorySnapshot(idleAfter, roles);

	// --- gesture window ---
	await quiet(page, 30_000);
	const size = page.viewportSize() ?? VIEWPORT;
	const cx = Math.round(size.width / 2);
	const cy = Math.round(size.height / 2);
	await page.mouse.move(cx, cy);
	await page.waitForTimeout(400);

	const panBefore = await snapshotProcesses(browserSession);
	const panFrom = await now(page);
	let traceEvents: TraceEvent[] | undefined;
	if (trace) {
		traceEvents = await captureTrace(browserSession, async () => {
			await driveRoundTripWheel(page, PAN_EVENTS, PAN_STEP_PX, PAN_STEP_PX);
		});
	} else {
		await driveRoundTripWheel(page, PAN_EVENTS, PAN_STEP_PX, PAN_STEP_PX);
	}
	const panTo = await now(page);
	const panAfter = await snapshotProcesses(browserSession);
	const panCpu = bucketDeltas(panBefore, panAfter, roles);

	await page.waitForTimeout(800);

	const zoomBefore = await snapshotProcesses(browserSession);
	await page.keyboard.down("Control");
	const zoomFrom = await now(page);
	await driveRoundTripWheel(page, ZOOM_EVENTS, 0, -ZOOM_STEP_PX);
	const zoomTo = await now(page);
	await page.keyboard.up("Control");
	const zoomAfter = await snapshotProcesses(browserSession);
	const zoomCpu = bucketDeltas(zoomBefore, zoomAfter, roles);

	await settle(page, 800, 20_000);

	const state = await read(page);
	const pan = windowStats(state, panFrom, panTo);
	const zoom = windowStats(state, zoomFrom, zoomTo);

	// sanity: the roles this run measured against should still be alive at the end
	const finalProcs = await snapshotProcesses(browserSession);
	const finalIds = new Set(finalProcs.map((p) => p.id));
	if (!finalIds.has(roles.canvasPid) || !finalIds.has(roles.framesPid)) {
		process.stderr.write(
			`bench:   WARNING [${arm.label}#${index}] a classified pid disappeared before the run ended\n`,
		);
	}

	await context.close();

	const result: RunResult = {
		arm: arm.label,
		index,
		traced: trace,
		liveMounted,
		roles: {
			canvasPid: roles.canvasPid,
			framesPid: roles.framesPid,
			canvasCalibrationMs: roles.canvasCalibrationS * 1000,
			framesCalibrationMs: roles.framesCalibrationS * 1000,
			otherRendererPids: roles.otherRendererPids,
		},
		pan,
		zoom,
		idleCpu,
		idleRss,
		panCpu,
		zoomCpu,
	};
	return { result, traceEvents };
}

// --- reporting ----------------------------------------------------------------

const pct = (seconds: number, windowMs: number): string => `${((seconds / (windowMs / 1000)) * 100).toFixed(1)}%`;

function bucketRow(label: string, arm: "animated" | "static", index: number, b: Buckets, windowMs: number): string {
	return `| ${label} | ${arm} #${index} | ${b.canvasS.toFixed(3)} s (${pct(b.canvasS, windowMs)}) | ${b.framesS.toFixed(3)} s (${pct(b.framesS, windowMs)}) | ${b.gpuS.toFixed(3)} s (${pct(b.gpuS, windowMs)}) | ${b.browserS.toFixed(3)} s (${pct(b.browserS, windowMs)}) | ${b.otherS.toFixed(3)} s (${pct(b.otherS, windowMs)}) |`;
}

function gestureRow(label: string, arm: "animated" | "static", index: number, g: GestureStats): string {
	return `| ${label} | ${arm} #${index} | ${ms(g.p50)} / ${ms(g.p95)} / ${ms(g.worst)} | ${g.rareIntervals} / ${g.frames} | ${g.loafs} (worst block ${ms(g.loafWorstBlocking)}) | ${g.mountedPeak} |`;
}

function toMarkdown(
	options: Options,
	camera: { x: number; y: number; k: number },
	boxes: FrameBox[],
	verify: Record<"animated" | "static", { painted: boolean; changedOverTwoSeconds: boolean }>,
	results: RunResult[],
	traceAnalysis: Record<"animated" | "static", TraceAnalysis>,
): string {
	const clean = results.filter((r) => !r.traced);
	const traced = results.filter((r) => r.traced);
	const lines: string[] = [];
	lines.push("# dither pan/zoom attribution");
	lines.push("");
	lines.push(
		`Project: \`${options.project}\` (copied twice via \`copyProject\`, never modified). Page \`${PAGE_NAME}\`, ${boxes.length} frames, camera \`${JSON.stringify(camera)}\` (drawn width ${(800 * camera.k).toFixed(1)} CSS px).`,
	);
	lines.push("");
	lines.push("## Achieved live count");
	lines.push("");
	lines.push("| arm | run | live (mounted) / total |");
	lines.push("|---|---|---|");
	for (const r of results)
		lines.push(`| ${r.arm} | #${r.index}${r.traced ? " (trace)" : ""} | ${r.liveMounted} / ${boxes.length} |`);
	lines.push("");
	lines.push("## Static-arm paint verification");
	lines.push("");
	lines.push("| arm | painted (non-blank) | pixels changed over 2s |");
	lines.push("|---|---|---|");
	for (const arm of ["animated", "static"] as const) {
		lines.push(`| ${arm} | ${verify[arm].painted} | ${verify[arm].changedOverTwoSeconds} |`);
	}
	lines.push("");
	lines.push("## Pan gesture — frame interval (ms)");
	lines.push("");
	lines.push("| set | run | p50 / p95 / worst | intervals > 12ms | long-animation-frames | mounted peak |");
	lines.push("|---|---|---|---|---|---|");
	for (const r of clean) lines.push(gestureRow("clean", r.arm, r.index, r.pan));
	for (const r of traced) lines.push(gestureRow("traced", r.arm, r.index, r.pan));
	lines.push("");
	lines.push("## Zoom gesture — frame interval (ms)");
	lines.push("");
	lines.push("| set | run | p50 / p95 / worst | intervals > 12ms | long-animation-frames | mounted peak |");
	lines.push("|---|---|---|---|---|---|");
	for (const r of clean) lines.push(gestureRow("clean", r.arm, r.index, r.zoom));
	for (const r of traced) lines.push(gestureRow("traced", r.arm, r.index, r.zoom));
	lines.push("");
	lines.push(`## Idle CPU by process (${IDLE_MS / 1000}s window, all ${results[0]?.liveMounted ?? "?"} frames live)`);
	lines.push("");
	lines.push("| set | run | canvas renderer | frames renderer | GPU process | browser process | other |");
	lines.push("|---|---|---|---|---|---|---|");
	for (const r of clean) lines.push(bucketRow("clean", r.arm, r.index, r.idleCpu, IDLE_MS));
	for (const r of traced) lines.push(bucketRow("traced", r.arm, r.index, r.idleCpu, IDLE_MS));
	lines.push("");
	lines.push("## Gesture-window CPU by process (pan)");
	lines.push("");
	lines.push("| set | run | canvas renderer | frames renderer | GPU process | browser process | other |");
	lines.push("|---|---|---|---|---|---|---|");
	for (const r of clean) lines.push(bucketRow("clean", r.arm, r.index, r.panCpu, r.pan.wallMs));
	for (const r of traced) lines.push(bucketRow("traced", r.arm, r.index, r.panCpu, r.pan.wallMs));
	lines.push("");
	lines.push("## Gesture-window CPU by process (zoom)");
	lines.push("");
	lines.push("| set | run | canvas renderer | frames renderer | GPU process | browser process | other |");
	lines.push("|---|---|---|---|---|---|---|");
	for (const r of clean) lines.push(bucketRow("clean", r.arm, r.index, r.zoomCpu, r.zoom.wallMs));
	for (const r of traced) lines.push(bucketRow("traced", r.arm, r.index, r.zoomCpu, r.zoom.wallMs));
	lines.push("");
	lines.push("## Memory at idle (RSS, run #1 of each arm)");
	lines.push("");
	lines.push("| arm | canvas renderer | frames renderer | GPU process | browser process | other | total |");
	lines.push("|---|---|---|---|---|---|---|");
	for (const r of clean.filter(
		(r) => r.index === Math.min(...clean.filter((c) => c.arm === r.arm).map((c) => c.index)),
	)) {
		const m = r.idleRss;
		lines.push(
			`| ${r.arm} | ${m.canvasRssMb.toFixed(0)} MB | ${m.framesRssMb.toFixed(0)} MB | ${m.gpuRssMb.toFixed(0)} MB | ${m.browserRssMb.toFixed(0)} MB | ${m.otherRssMb.toFixed(0)} MB | ${m.totalRssMb.toFixed(0)} MB |`,
		);
	}
	lines.push("");
	lines.push("## Chrome trace over the pan gesture");
	lines.push("");
	lines.push(
		"Main-thread busy time is flattened (non-overlapping 'X'-phase spans on each renderer's CrRendererMain thread), so nested durations are not double counted. Per-name totals below are inclusive sums.",
	);
	lines.push("");
	lines.push("| arm | trace window | canvas renderer busy | frames renderer busy |");
	lines.push("|---|---|---|---|");
	for (const arm of ["animated", "static"] as const) {
		const a = traceAnalysis[arm];
		lines.push(
			`| ${arm} | ${ms(a.windowMs)} ms | ${ms(a.canvasBusyMs)} ms (${((a.canvasBusyMs / a.windowMs) * 100).toFixed(0)}%) | ${ms(a.framesBusyMs)} ms (${((a.framesBusyMs / a.windowMs) * 100).toFixed(0)}%) |`,
		);
	}
	lines.push("");
	for (const arm of ["animated", "static"] as const) {
		const a = traceAnalysis[arm];
		lines.push(`**${arm} — top 5 by inclusive duration, canvas renderer main thread**`);
		lines.push("");
		lines.push("| name | total ms | count |");
		lines.push("|---|---|---|");
		for (const t of a.canvasTop) lines.push(`| ${t.name} | ${ms(t.totalMs)} | ${t.count} |`);
		if (a.canvasTop.length === 0) lines.push("| (no CrRendererMain thread found in trace) | | |");
		lines.push("");
		lines.push(`**${arm} — top 5 by inclusive duration, frames renderer main thread**`);
		lines.push("");
		lines.push("| name | total ms | count |");
		lines.push("|---|---|---|");
		for (const t of a.framesTop) lines.push(`| ${t.name} | ${ms(t.totalMs)} | ${t.count} |`);
		if (a.framesTop.length === 0) lines.push("| (no CrRendererMain thread found in trace) | | |");
		lines.push("");
	}
	lines.push("## Verdict");
	lines.push("");
	lines.push("_(filled in by hand after reviewing the numbers above — see results.json for every raw run)_");
	lines.push("");
	return lines.join("\n");
}

// --- main ----------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	mkdirSync(options.out, { recursive: true });

	process.stderr.write(`bench: setting up animated arm from ${options.project}\n`);
	const animated = await setupArm(options.project, "animated");
	process.stderr.write(`bench: setting up static arm from ${options.project}\n`);
	const staticArm = await setupArm(options.project, "static");
	const arms = { animated, static: staticArm };

	const boxes = namedPage(animated.root, PAGE_NAME).frames;
	if (boxes.length === 0) throw new Error(`${options.project} has no frames on page "${PAGE_NAME}"`);
	const camera = planCamera(boxes, VIEWPORT.width, VIEWPORT.height, K);
	process.stderr.write(
		`bench: ${boxes.length} frames on "${PAGE_NAME}", camera ${JSON.stringify(camera)}, drawn width ${(800 * camera.k).toFixed(1)}px\n`,
	);

	let browser: Browser | undefined;
	try {
		browser = await chromium.launch({ channel: "chromium", headless: false });

		for (const arm of [animated, staticArm]) {
			process.stderr.write(`bench: preparing covers for ${arm.label}\n`);
			writeCamera(arm.root, planCamera(boxes, VIEWPORT.width, VIEWPORT.height, DEFAULT_ZOOM), PAGE_NAME);
			await prepareCurrentCovers(browser, arm.url, arm.root, boxes);
			writeCamera(arm.root, camera, PAGE_NAME);
		}

		process.stderr.write("bench: verifying static-arm paint behavior\n");
		const verify = {
			animated: await verifyPaintBehavior(browser, animated, options.out),
			static: await verifyPaintBehavior(browser, staticArm, options.out),
		};
		process.stderr.write(`bench:   animated: ${JSON.stringify(verify.animated)}\n`);
		process.stderr.write(`bench:   static:   ${JSON.stringify(verify.static)}\n`);
		if (verify.static.changedOverTwoSeconds) {
			throw new Error("static arm's sample frame still changed pixels over 2s — the patch did not take");
		}
		if (!verify.static.painted)
			throw new Error("static arm's sample frame never painted — the patch broke the first paint");

		// warm pass per arm: one discarded navigation so the first measured run
		// is not paying for a cold compile
		for (const arm of [animated, staticArm]) {
			process.stderr.write(`bench: warming ${arm.label}\n`);
			writeCamera(arm.root, camera, PAGE_NAME);
			const warm = await browser.newContext({ viewport: VIEWPORT });
			const warmPage = await warm.newPage();
			await warmPage.goto(arm.url, { waitUntil: "domcontentloaded" });
			await settle(warmPage, 1500, 60_000);
			await warm.close();
			await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
		}

		const sequence: readonly ("animated" | "static")[] = [
			"animated",
			"static",
			"static",
			"animated",
			"animated",
			"static",
		];
		const results: RunResult[] = [];
		const runIndex: Record<"animated" | "static", number> = { animated: 0, static: 0 };
		for (const label of sequence) {
			runIndex[label]++;
			process.stderr.write(`bench: run ${label} #${runIndex[label]}\n`);
			const { result } = await runOnce(browser, arms[label], camera, runIndex[label], false);
			results.push(result);
			process.stderr.write(
				`bench:   live=${result.liveMounted} pan p50/p95/worst=${ms(result.pan.p50)}/${ms(result.pan.p95)}/${ms(result.pan.worst)} zoom p50/p95/worst=${ms(result.zoom.p50)}/${ms(result.zoom.p95)}/${ms(result.zoom.worst)}\n`,
			);
		}

		const traceEventsByArm: Record<"animated" | "static", TraceEvent[]> = { animated: [], static: [] };
		const traceRolesByArm: Record<"animated" | "static", Roles | undefined> = {
			animated: undefined,
			static: undefined,
		};
		for (const label of ["animated", "static"] as const) {
			runIndex[label]++;
			process.stderr.write(`bench: trace run ${label} #${runIndex[label]}\n`);
			const { result, traceEvents } = await runOnce(browser, arms[label], camera, runIndex[label], true);
			results.push(result);
			if (traceEvents !== undefined) {
				traceEventsByArm[label] = traceEvents;
				traceRolesByArm[label] = {
					canvasPid: result.roles.canvasPid,
					canvasCalibrationS: result.roles.canvasCalibrationMs / 1000,
					framesPid: result.roles.framesPid,
					framesCalibrationS: result.roles.framesCalibrationMs / 1000,
					gpuPids: [],
					browserPid: undefined,
					otherRendererPids: result.roles.otherRendererPids,
				};
				writeFileSync(join(options.out, `trace-${label}.json`), JSON.stringify({ traceEvents }));
				process.stderr.write(`bench:   wrote trace-${label}.json (${traceEvents.length} events)\n`);
			}
		}

		const traceAnalysis: Record<"animated" | "static", TraceAnalysis> = {
			animated:
				traceRolesByArm.animated === undefined
					? {
							canvasBusyMs: Number.NaN,
							framesBusyMs: Number.NaN,
							canvasTop: [],
							framesTop: [],
							windowMs: Number.NaN,
						}
					: analyzeTrace(traceEventsByArm.animated, traceRolesByArm.animated),
			static:
				traceRolesByArm.static === undefined
					? {
							canvasBusyMs: Number.NaN,
							framesBusyMs: Number.NaN,
							canvasTop: [],
							framesTop: [],
							windowMs: Number.NaN,
						}
					: analyzeTrace(traceEventsByArm.static, traceRolesByArm.static),
		};

		writeFileSync(
			join(options.out, "results.json"),
			JSON.stringify(
				{
					project: options.project,
					page: PAGE_NAME,
					camera,
					drawnWidthPx: 800 * camera.k,
					frameCount: boxes.length,
					verify,
					results,
					traceAnalysis,
				},
				null,
				2,
			),
		);
		const md = toMarkdown(options, camera, boxes, verify, results, traceAnalysis);
		writeFileSync(join(options.out, "results.md"), md);
		process.stderr.write(`bench: wrote ${options.out}/results.json and results.md\n`);
	} finally {
		await browser?.close();
		animated.stop();
		staticArm.stop();
	}
}

await main();
