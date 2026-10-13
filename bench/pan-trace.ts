import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import {
	copyProject,
	freePort,
	planCamera,
	prepareCurrentCovers,
	readPages,
	startDaemon,
	writeCamera,
} from "./harness.ts";

/**
 * Pan and zoom at working zoom with live frames on screen (DEV-297): the same
 * wheel gestures `bench/qa-editing.ts` drives, repeated, and optionally traced
 * so each display interval over 12 ms can be laid against what every process
 * and thread of the browser was doing inside it.
 *
 *   node bench/pan-trace.ts --project <path> [--frame app/spool-player] [--k 0.85,0.45]
 *     [--rounds 4] [--dpr 1] [--variant base,stills] [--trace <dir>] [--hz 120] [--window default] [--front]
 *     [--camera plan] [--persistent] [--channel chrome]
 *   node bench/pan-trace.ts --analyse <trace.json>
 *
 * A variant is an experiment injected into the canvas after it settles, so
 * several can be compared on one build in one sitting, alternating per round:
 *   base        the canvas as built
 *   willchange  the camera's fields promoted (`will-change: transform`)
 *   stills      every passive live document behind its still, all the time
 *   nolive      no iframe drawn at all, the stills alone
 *   nogl        the picture layer's canvas hidden
 * and any of them joined with `+`; and
 *   control     not spool at all: a plain page moved the same way (CONTROL below)
 *
 * `--trace` records one extra Chrome trace per k and variant and prints, for
 * the long intervals and for the rest, each thread's mean busy time per
 * interval, the events that fill the long ones, and how many of them follow a
 * compositor deadline timer the OS woke late (see `lateDeadlines`).
 */

interface Options {
	project: string;
	frame: string;
	ks: number[];
	rounds: number;
	dpr: number;
	variants: string[];
	trace: string | undefined;
	hz: number | undefined;
	window: string;
	front: boolean;
	persistent: boolean;
	camera: string;
	channel: string;
	analyse: string | undefined;
}

function parseArgs(argv: string[]): Options {
	const o: Options = {
		project: "",
		frame: "app/spool-player",
		ks: [0.85, 0.45],
		rounds: 4,
		dpr: 1,
		variants: ["base"],
		trace: undefined,
		hz: undefined,
		window: "qa",
		front: false,
		persistent: false,
		camera: "frame",
		channel: "chromium",
		analyse: undefined,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--front" || a === "--persistent") {
			o[a === "--front" ? "front" : "persistent"] = true;
			continue;
		}
		const n = argv[i + 1];
		if (n === undefined) throw new Error(`${a} takes a value`);
		if (a === "--project") o.project = resolve(n);
		else if (a === "--frame") o.frame = n;
		else if (a === "--k") o.ks = n.split(",").map(Number);
		else if (a === "--rounds") o.rounds = Number(n);
		else if (a === "--dpr") o.dpr = Number(n);
		else if (a === "--variant") o.variants = n.split(",");
		else if (a === "--trace") o.trace = resolve(n);
		else if (a === "--hz") o.hz = Number(n);
		else if (a === "--window") o.window = n;
		else if (a === "--camera") o.camera = n;
		else if (a === "--channel") o.channel = n;
		else if (a === "--analyse") o.analyse = n;
		else throw new Error(`unknown argument ${a}`);
		i++;
	}
	if (o.project === "" && o.analyse === undefined) throw new Error("--project is required");
	return o;
}

const VIEW = { width: 1440, height: 810 };
const RARE_MS = 12;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const opts = parseArgs(process.argv.slice(2));

const VARIANTS: Record<string, string> = {
	base: "",
	willchange: "[data-canvas-camera],[data-canvas-under],[data-canvas-over]{will-change:transform}",
	stills:
		"[data-frame-passive]{visibility:hidden!important}[data-frame-passive]~[data-frame-standin]{visibility:visible!important}",
	nolive: "iframe{visibility:hidden!important}[data-frame-standin]{visibility:visible!important}",
	nogl: "canvas[data-picture-layer]{visibility:hidden!important}",
};

/**
 * Not spool: one transformed field of plain boxes, moved by a non-passive wheel
 * listener through one rAF, the way the camera store moves the canvas. What it
 * misses is the browser's and the display's, not spool's.
 */
const CONTROL = `<!doctype html><body style="margin:0;overflow:hidden;background:#eee">
<div id="f" style="position:absolute;left:0;top:0;transform-origin:0 0">${Array.from(
	{ length: 60 },
	(_, i) =>
		`<div style="position:absolute;left:${(i % 10) * 420}px;top:${Math.floor(i / 10) * 320}px;width:400px;height:300px;background:#fff;border-radius:12px;box-shadow:0 1px 3px #0003;font:14px system-ui;padding:12px">frame ${i}</div>`,
).join("")}</div>
<script>
const f = document.getElementById("f");
let x = 0, y = 0, k = 0.85, queued = false;
const draw = () => { queued = false; f.style.transform = "translate(" + x + "px," + y + "px) scale(" + k + ")"; };
addEventListener("wheel", (e) => {
	e.preventDefault();
	if (e.ctrlKey) k *= Math.exp(-e.deltaY * 0.011); else { x -= e.deltaX; y -= e.deltaY; }
	if (!queued) { queued = true; requestAnimationFrame(draw); }
}, { passive: false });
draw();
</script></body>`;

/** Every animation frame of the top document from its start, as [time, interval]. */
const LOOP = `if (window === window.top && !window.__all) {
	window.__all = [];
	let last = performance.now();
	const tick = (t) => { window.__all.push([t, t - last]); last = t; requestAnimationFrame(tick); };
	requestAnimationFrame(tick);
}`;

interface Stats {
	n: number;
	p95: number;
	over: number;
	worst: number;
}

function stats(iv: number[]): Stats {
	const sorted = [...iv].sort((a, b) => a - b);
	return {
		n: iv.length,
		p95: sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN,
		over: iv.filter((v) => v > RARE_MS).length,
		worst: sorted.at(-1) ?? Number.NaN,
	};
}

/** qa-editing's two gestures, verbatim: a horizontal pan out and back, then a ctrl-wheel zoom in and out. */
async function gestures(page: Page): Promise<{ idle: number[]; pan: number[]; zoom: number[] }> {
	const motion = async (label: string, drive: () => Promise<void>): Promise<number[]> => {
		if (opts.persistent) {
			// bench/canvas.ts's way: one loop since the page began, sliced by time
			const from = await page.evaluate(() => performance.now());
			await drive();
			const to = await page.evaluate(() => performance.now());
			const all = (await page.evaluate(() => (window as unknown as { __all: [number, number][] }).__all)) ?? [];
			return all.filter(([t]) => t >= from && t <= to).map(([, d]) => d);
		}
		await page.evaluate((label) => {
			// one loop per gesture: the last one's pending frame stops on its own
			const w = window as unknown as { __iv: number[]; __loop: string };
			const iv: number[] = [];
			w.__iv = iv;
			w.__loop = label;
			let last = performance.now();
			const tick = (t: number) => {
				if (w.__loop !== label) return;
				iv.push(t - last);
				last = t;
				console.timeStamp(`pan-trace-${label}`);
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}, label);
		await drive();
		return (await page.evaluate(() => {
			const w = window as unknown as { __iv: number[]; __loop: string };
			w.__loop = "";
			return w.__iv.slice(2);
		})) as number[];
	};
	await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
	const idle = await motion("idle", async () => {
		await sleep(1500);
	});
	// qa-editing's pacing by default: an awaited wheel and 16 ms, about 55 events a
	// second; `--hz` paces them to a clock instead, the same distance in smaller steps
	const wheel = async (steps: number, dx: number, dy: number) => {
		const n = opts.hz === undefined ? steps : Math.round((steps * opts.hz) / 60);
		const scale = steps / n;
		const started = performance.now();
		for (let i = 0; i < n; i++) {
			const sign = i < n / 2 ? 1 : -1;
			await page.mouse.wheel(sign * dx * scale, sign * dy * scale);
			if (opts.hz === undefined) await sleep(16);
			else {
				const wait = started + ((i + 1) * 1000) / opts.hz - performance.now();
				if (wait > 0) await sleep(wait);
			}
		}
	};
	const pan = await motion("pan", () => wheel(70, 26, 0));
	await sleep(600);
	const zoom = await motion("zoom", async () => {
		await page.keyboard.down("Control");
		await wheel(50, 0, 4);
		await page.keyboard.up("Control");
	});
	await sleep(800);
	return { idle, pan, zoom };
}

/**
 * With `--front`, the browser made the frontmost app, as it is when somebody
 * pans. macOS paces an app behind another one differently, and a bench window
 * opened from a shell never comes to the front on its own.
 */
async function front(): Promise<void> {
	if (!opts.front || process.platform !== "darwin") return;
	const app = chromium.executablePath().replace(/\.app\/Contents\/.*$/, ".app");
	execFileSync("open", ["-a", app]);
	await sleep(500);
}

/** The canvas open on the planned camera, its live documents booted. */
async function open(
	browser: Browser,
	url: string,
	variant: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
	const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: opts.dpr });
	if (opts.persistent) await context.addInitScript(LOOP);
	const page = await context.newPage();
	if (variant === "control") {
		await page.setContent(CONTROL);
		if (opts.persistent) await page.evaluate(LOOP);
		await front();
		await sleep(1000);
		return { page, close: () => context.close() };
	}
	await page.goto(url, { waitUntil: "domcontentloaded" });
	await page.locator("[data-frame-label]").first().waitFor({ timeout: 30000 });
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		const pending = await page.evaluate(() => {
			const frames = [...document.querySelectorAll("iframe")];
			return frames.filter((f) => (f.contentDocument === null ? false : f.contentDocument.readyState !== "complete"))
				.length;
		});
		if (pending === 0) break;
		await sleep(100);
	}
	await sleep(2000);
	const css = variant
		.split("+")
		.map((part) => {
			const rule = VARIANTS[part];
			if (rule === undefined) throw new Error(`unknown variant ${part}`);
			return rule;
		})
		.join("");
	if (css !== "") await page.addStyleTag({ content: css });
	await front();
	await sleep(300);
	return { page, close: () => context.close() };
}

// --- the trace ------------------------------------------------------------------

interface TraceEvent {
	ph: string;
	name: string;
	cat?: string;
	pid: number;
	tid: number;
	ts: number;
	dur?: number;
	args?: Record<string, unknown> & { name?: string; data?: { message?: string } };
}

interface Span {
	start: number;
	end: number;
	name: string;
}

/** Busy time per thread inside each interval: long ones and the rest, and what fills the long ones. */
function attribute(events: TraceEvent[], gesture: string): string {
	const processName = new Map<number, string>();
	const threadName = new Map<string, string>();
	for (const e of events) {
		if (e.ph !== "M") continue;
		if (e.name === "process_name") processName.set(e.pid, String(e.args?.name ?? ""));
		if (e.name === "thread_name") threadName.set(`${e.pid}:${e.tid}`, String(e.args?.name ?? ""));
	}
	const ticks = events
		.filter((e) => e.name === "TimeStamp" && e.args?.data?.message === `pan-trace-${gesture}`)
		.sort((a, b) => a.ts - b.ts);
	if (ticks.length < 3) return "trace: no ticks found\n";
	const canvasPid = ticks[0]?.pid;
	const label = (pid: number, tid: number): string => {
		const proc = pid === canvasPid ? "canvas" : (processName.get(pid) ?? `pid${pid}`).replace(/ Process$/, "");
		const name = proc === "Renderer" ? "child" : proc;
		return `${name}:${threadName.get(`${pid}:${tid}`) ?? tid}`;
	};
	// complete spans per thread, B/E paired
	const spans = new Map<string, Span[]>();
	const open = new Map<string, TraceEvent[]>();
	for (const e of events) {
		const key = label(e.pid, e.tid);
		if (e.ph === "X" && e.dur !== undefined) {
			const list = spans.get(key) ?? [];
			list.push({ start: e.ts, end: e.ts + e.dur, name: e.name });
			spans.set(key, list);
		} else if (e.ph === "B") {
			const stack = open.get(`${e.pid}:${e.tid}`) ?? [];
			stack.push(e);
			open.set(`${e.pid}:${e.tid}`, stack);
		} else if (e.ph === "E") {
			const b = open.get(`${e.pid}:${e.tid}`)?.pop();
			if (b === undefined) continue;
			const list = spans.get(key) ?? [];
			list.push({ start: b.ts, end: e.ts, name: b.name });
			spans.set(key, list);
		}
	}
	const windows = ticks
		.slice(3)
		.map((t, i) => ({ start: ticks[i + 2]?.ts ?? 0, end: t.ts, ms: (t.ts - (ticks[i + 2]?.ts ?? 0)) / 1000 }));
	const long = windows.filter((w) => w.ms > RARE_MS);
	const rest = windows.filter((w) => w.ms <= RARE_MS);
	const busy = (list: Span[], w: { start: number; end: number }): number => {
		const clipped = list
			.filter((s) => s.end > w.start && s.start < w.end)
			.map((s) => [Math.max(s.start, w.start), Math.min(s.end, w.end)] as const)
			.sort((a, b) => a[0] - b[0]);
		let total = 0;
		let at = w.start;
		for (const [a, b] of clipped) {
			const from = Math.max(a, at);
			if (b > from) total += b - from;
			at = Math.max(at, b);
		}
		return total / 1000;
	};
	const lines: string[] = [
		`trace ${gesture}: ${windows.length} intervals, ${long.length} over ${RARE_MS} ms (${((100 * long.length) / windows.length).toFixed(0)}%)`,
		"trace: thread busy ms per interval, long / rest",
	];
	const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
	const rows: [string, number, number][] = [];
	for (const [key, list] of spans) {
		const l = mean(long.map((w) => busy(list, w)));
		const r = mean(rest.map((w) => busy(list, w)));
		if (l > 0.3 || r > 0.3) rows.push([key, l, r]);
	}
	rows.sort((a, b) => b[1] - a[1]);
	for (const [key, l, r] of rows.slice(0, 14))
		lines.push(`trace:   ${key.padEnd(44)} ${l.toFixed(2)} / ${r.toFixed(2)}`);
	// the events that fill the long windows, by summed clipped duration per window, top-level or not
	const names = new Map<string, { l: number; r: number }>();
	for (const [key, list] of spans) {
		if (!/child|GPU|canvas|Browser/.test(key)) continue;
		for (const s of list) {
			const into = (ws: typeof windows, side: "l" | "r") => {
				for (const w of ws) {
					const d = Math.min(s.end, w.end) - Math.max(s.start, w.start);
					if (d <= 0) continue;
					const k = `${key} ${s.name}`;
					const got = names.get(k) ?? { l: 0, r: 0 };
					got[side] += d / 1000;
					names.set(k, got);
				}
			};
			into(long, "l");
			into(rest, "r");
		}
	}
	const top = [...names]
		.map(([k, v]) => [k, v.l / Math.max(1, long.length), v.r / Math.max(1, rest.length)] as const)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 12);
	lines.push("trace: events, ms per interval, long / rest");
	for (const [k, l, r] of top) lines.push(`trace:   ${k.slice(0, 90).padEnd(90)} ${l.toFixed(2)} / ${r.toFixed(2)}`);
	lines.push(lateDeadlines(events, canvasPid, threadName, long));
	return `${lines.join("\n")}\n`;
}

/**
 * The canvas compositor's frame deadline: cc posts a precise timer for it on
 * each BeginFrame, and a draw can't go out before it fires. A timer that fires
 * late while its thread sat idle is the OS waking the thread late, not work in
 * the page; a long interval that follows one missed its vsync for that reason.
 */
function lateDeadlines(
	events: TraceEvent[],
	canvasPid: number | undefined,
	threadName: Map<string, string>,
	long: { start: number; end: number }[],
): string {
	const compositor = events
		.filter((e) => e.pid === canvasPid && threadName.get(`${e.pid}:${e.tid}`) === "Compositor")
		.sort((a, b) => a.ts - b.ts);
	const tasks = compositor.filter((e) => e.ph === "X" && e.name === "ThreadControllerImpl::RunTask");
	const late: { at: number; ms: number; idle: boolean }[] = [];
	let due: number | undefined;
	for (const e of compositor) {
		if (e.name === "Scheduler::ScheduleBeginImplFrameDeadline") {
			const value = Number(e.args?.["new deadline"]);
			due = Number.isFinite(value) && value > 0 ? value : undefined;
		} else if (e.name === "Scheduler::OnBeginImplFrameDeadline" && due !== undefined) {
			const ms = (e.ts - due) / 1000;
			const from = due;
			const busy = tasks
				.filter((t) => t.ts < e.ts && t.ts + (t.dur ?? 0) > from)
				.reduce((sum, t) => sum + Math.min(t.ts + (t.dur ?? 0), e.ts) - Math.max(t.ts, from), 0);
			if (ms > LATE_MS) late.push({ at: e.ts, ms, idle: busy / 1000 < ms / 2 });
			due = undefined;
		}
	}
	// a deadline belongs to the vsync before the one that came late: look one interval back
	const behind = long.filter((w) => late.some((l) => l.at >= w.start - 9000 && l.at <= w.end)).length;
	const idle = late.filter((l) => l.idle).length;
	return `trace: ${behind} of ${long.length} long intervals follow a compositor deadline timer that fired over ${LATE_MS} ms late; in the whole trace ${idle} of ${late.length} such timers fired on an idle thread`;
}

const LATE_MS = 2;

const CATEGORIES = [
	"toplevel",
	"devtools.timeline",
	"disabled-by-default-devtools.timeline",
	"disabled-by-default-devtools.timeline.frame",
	"cc",
	"gpu",
	"viz",
	"benchmark",
	"input",
	"__metadata",
].join(",");

async function main(): Promise<void> {
	const { root, name, spoolDir } = copyProject(opts.project);
	const pageName = opts.frame.split("/").slice(0, -1).join("/");
	const onPage = readPages(root).find((p) => p.page === pageName);
	const target = onPage?.frames.find((f) => f.name === opts.frame);
	if (!onPage || !target) throw new Error(`${opts.frame} is not on page ${pageName}`);
	const daemon = await startDaemon(spoolDir, root, await freePort());
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	const browser = await chromium.launch({
		channel: opts.channel,
		headless: false,
		// qa-editing's window by default; `--window default` leaves it to the browser, as bench/canvas.ts does
		args: opts.window === "qa" ? ["--window-position=0,0", `--window-size=${VIEW.width},${VIEW.height + 90}`] : [],
	});
	const out: string[] = [];
	const say = (line: string) => {
		out.push(line);
		process.stdout.write(`${line}\n`);
	};
	say(
		`pan-trace: ${opts.frame}, dpr ${opts.dpr}, wheel ${opts.hz === undefined ? "as qa-editing" : `${opts.hz} Hz`}, ${opts.rounds} rounds, chromium ${browser.version()}`,
	);
	try {
		writeCamera(root, { x: 0, y: 0, k: 0.16 }, pageName);
		await prepareCurrentCovers(browser, daemon, url, root, onPage.frames);
		for (const k of opts.ks) {
			// qa-editing's camera, the frame's top centred, or bench/canvas.ts's densest band
			const camera =
				opts.camera === "plan"
					? planCamera(onPage.frames, VIEW.width, VIEW.height, k)
					: { x: VIEW.width / 2 - (target.x + target.w / 2) * k, y: 70 - target.y * k, k };
			const all: Record<string, { idle: number[]; pan: number[]; zoom: number[]; perRound: string[] }> = {};
			for (let round = 0; round < opts.rounds; round++) {
				const order = round % 2 === 0 ? opts.variants : [...opts.variants].reverse();
				for (const variant of order) {
					writeCamera(root, camera, pageName);
					const { page, close } = await open(browser, url, variant);
					const live = await page.evaluate(() => document.querySelectorAll("iframe").length);
					const got = await gestures(page);
					await close();
					const slot = all[variant] ?? { idle: [], pan: [], zoom: [], perRound: [] };
					slot.idle.push(...got.idle);
					slot.pan.push(...got.pan);
					slot.zoom.push(...got.zoom);
					const p = stats(got.pan);
					const z = stats(got.zoom);
					slot.perRound.push(
						`pan ${p.p95.toFixed(1)}/${p.over}of${p.n} zoom ${z.p95.toFixed(1)}/${z.over}of${z.n} live ${live}`,
					);
					all[variant] = slot;
				}
			}
			for (const variant of opts.variants) {
				const slot = all[variant];
				if (slot === undefined) continue;
				const p = stats(slot.pan);
				const z = stats(slot.zoom);
				const share = (s: Stats) => `${((100 * s.over) / s.n).toFixed(1)}%`;
				const i = stats(slot.idle);
				say(
					`k=${k} ${variant.padEnd(10)} pan p95 ${p.p95.toFixed(1)} ms, ${share(p)} over 12 ms, worst ${p.worst.toFixed(1)} | zoom p95 ${z.p95.toFixed(1)} ms, ${share(z)} over 12 ms, worst ${z.worst.toFixed(1)} | idle ${share(i)} over 12 ms`,
				);
				say(`    rounds: ${slot.perRound.join(" ; ")}`);
			}
			if (opts.trace !== undefined) {
				mkdirSync(opts.trace, { recursive: true });
				for (const variant of opts.variants) {
					writeCamera(root, camera, pageName);
					const { page, close } = await open(browser, url, variant);
					const path = join(opts.trace, `k${k}-${variant}.json`);
					await browser.startTracing(page, { path, categories: CATEGORIES.split(",") });
					await gestures(page);
					await browser.stopTracing();
					await close();
					const parsed = JSON.parse(readFileSync(path, "utf8")) as { traceEvents: TraceEvent[] } | TraceEvent[];
					const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
					say(`--- trace k=${k} ${variant} (${path})`);
					say(attribute(events, "pan").trimEnd());
					say(attribute(events, "zoom").trimEnd());
				}
			}
		}
	} finally {
		await browser.close();
		daemon.stop();
		if (opts.trace !== undefined) writeFileSync(join(opts.trace, "summary.txt"), `${out.join("\n")}\n`);
	}
}

/** `--analyse <trace.json>`: the summary of a trace already recorded, no browser. */
function analyse(path: string): void {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as { traceEvents: TraceEvent[] } | TraceEvent[];
	const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
	for (const gesture of ["pan", "zoom", "idle"]) process.stdout.write(attribute(events, gesture));
}

if (opts.analyse !== undefined) analyse(opts.analyse);
else await main();
