import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import {
	type BenchState,
	collector,
	DEFAULT_ZOOM,
	type FrameBox,
	type GestureStats,
	median,
	ms,
	planCamera,
	prepareCurrentCovers,
	RARE_INTERVAL_MS,
	read,
	type Subject,
	settleOnFrames,
	startSubjects,
	stopSubjects,
	takeBuildOptions,
	VIEWPORT,
	waitForMountedFramesLoaded,
	windowStats,
	writeCamera,
} from "./harness.ts";

/**
 * Entering a frame from an overview, timed as one move (DEV-296).
 *
 * `bench/canvas.ts` times a double-click to the first frame its iframe takes
 * the pointer, which is the shell's first commit: 36 ms whether or not the
 * document behind it has loaded, and blind to the camera's flight. This times
 * the whole of what a person watches, in the page's own clock:
 *
 *   - the flight: the first frame the camera moves to the last it changes
 *   - the shell: the entered frame's iframe in the page
 *   - loaded: the document's own loaded report, which is when it is clickable
 *   - live: its still's fade begun, plus the fade, which is when it is seen
 *
 * and the animation-frame intervals over the flight and over the whole entry
 * (double-click to the later of the flight's end and the live document), with
 * the long-animation frames in them. The double-click is a hand's, its
 * presses held and spaced, because its first click selects the frame and
 * that already mounts its document. Each entry is a fresh load of the canvas
 * at the overview camera, into a different frame, so every one boots a
 * document nobody has opened in that tab.
 *
 * The landing is what the camera coming to rest sets off, from its rest
 * (REST_MS after the flight's last frame) to LANDING_MS after that frame: the
 * canvas's work at the rest and the neighbouring documents it mounts. Its
 * animation-frame intervals are timed for every entry.
 *
 * `--trace <file>` records every entry as a Chrome trace and reads the
 * landing's longest main-thread task out of each, which is the one number an
 * interval cannot give. It keeps one entry's trace at each rate, for Perfetto
 * or DevTools, and lists that one's long tasks: the second by default
 * (`--trace-entry`), because the first in a fresh browser also pays its GPU
 * process's first pipeline compiles, which a browser in use has long since
 * paid.
 *
 *   pnpm build && node bench/entry.ts --project <path> --page app --headed
 *   node bench/entry.ts --project <path> --page app --zoom 0.16 --entries 8 --throttle 1,4 --headed
 *
 * Run it with node's own type stripping, not tsx (see bench/canvas.ts).
 */

interface Options {
	project: string;
	page: string | undefined;
	zoom: number;
	entries: number;
	throttle: number[];
	headed: boolean;
	trace: string | undefined;
	/** Which entry the trace records, from 1. */
	traceEntry: number;
	out: string | undefined;
}

function parseArgs(argv: string[]): Options {
	const options: Options = {
		project: "",
		page: undefined,
		zoom: DEFAULT_ZOOM,
		entries: 6,
		throttle: [1],
		headed: false,
		trace: undefined,
		traceEntry: 2,
		out: undefined,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--headed") options.headed = true;
		else if (arg === "--headless") options.headed = false;
		else if (next === undefined) throw new Error(`${arg} takes a value`);
		else if (arg === "--project") options.project = resolve(next);
		else if (arg === "--page") options.page = next;
		else if (arg === "--zoom") options.zoom = Number(next);
		else if (arg === "--entries") options.entries = Number(next);
		else if (arg === "--throttle") options.throttle = next.split(",").map(Number);
		else if (arg === "--trace") options.trace = resolve(next);
		else if (arg === "--trace-entry") options.traceEntry = Number(next);
		else if (arg === "--out") options.out = resolve(next);
		else throw new Error(`unknown argument ${arg}`);
		if (arg !== "--headed" && arg !== "--headless") i++;
	}
	if (options.project === "") throw new Error("--project <path to a spool project root> is required");
	if (!(options.zoom > 0)) throw new Error("--zoom takes a positive scale");
	if (!(options.entries >= 1)) throw new Error("--entries takes a count");
	return options;
}

/** One animation frame of the entry, as the probe saw it. */
interface Mark {
	t: number;
	/** The camera field's transform: the camera as drawn. */
	camera: string;
	/** The frame whose iframe owns the pointer: the entered one. */
	entered: string | null;
	/** That frame's still's opacity as written (1 covering, 0 fading out), null with no still. */
	cover: string | null;
	/** Whether the entered frame's slot is still hidden, waiting for its still to decode. */
	slotHidden: boolean;
	iframes: number;
}

interface Probe {
	/** The double-click's first press. */
	press: number | null;
	click: number | null;
	marks: Mark[];
	stop: boolean;
}

/**
 * Installed just before the double-click. It reads inline styles only, never
 * computed ones, so it forces no style recalc of its own into the frames it
 * is measuring.
 */
function installProbe(): void {
	const probe: Probe = { press: null, click: null, marks: [], stop: false };
	(globalThis as unknown as { __entry: Probe }).__entry = probe;
	addEventListener(
		"pointerdown",
		(event) => {
			probe.press = event.timeStamp;
		},
		{ capture: true, once: true },
	);
	addEventListener(
		"dblclick",
		(event) => {
			probe.click = event.timeStamp;
		},
		{ capture: true, once: true },
	);
	const tick = (t: number): void => {
		const field = document.querySelector<HTMLElement>("[data-canvas-camera]");
		const frames = [...document.querySelectorAll("iframe")];
		const live = frames.find((frame) => frame.style.pointerEvents === "auto") ?? null;
		const name = live?.title ?? null;
		const cover =
			name === null ? null : document.querySelector<HTMLElement>(`[data-frame-cover="${CSS.escape(name)}"]`);
		const slot = live?.closest<HTMLElement>('[style*="translate"]') ?? null;
		probe.marks.push({
			t,
			camera: field?.style.transform ?? "",
			entered: name,
			cover: cover === null ? null : cover.style.opacity,
			slotHidden: slot?.style.opacity === "0",
			iframes: frames.length,
		});
		if (!probe.stop) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/** The still's fade, frame-shell.tsx's `opacity 180ms`: live is its start plus this. */
const COVER_FADE_MS = 180;
const ENTRY_TIMEOUT_MS = 8000;
/** A double-click as a hand makes one: each press held this long, this far apart. */
const CLICK_HOLD_MS = 60;
const CLICK_GAP_MS = 90;
/** How long a camera left alone takes to be at rest: camera-store.ts's REST_MS. */
const REST_MS = 100;
/** How long after the flight's last frame the landing is watched. */
const LANDING_MS = 1000;

interface Entry {
	rate: number;
	frame: string;
	/** From the double-click, in ms. */
	flyStart: number;
	flyEnd: number;
	shell: number;
	slotShown: number;
	loaded: number;
	live: number;
	/** From the first press to the double-click: what selecting the frame set going. */
	between: GestureStats;
	fly: GestureStats;
	entry: GestureStats;
	/** The camera's rest and what it mounts, from the rest to LANDING_MS after the flight. */
	landing: GestureStats;
	/** The landing's longest task on the canvas's main thread, from a trace; NaN untraced. */
	landingTask: number;
	/** Documents mounted once the entry was over, the entered one included. */
	mountedAfter: number;
}

async function enterOnce(page: Page, target: { x: number; y: number }, rate: number): Promise<Entry> {
	await page.evaluate(installProbe);
	// a person's double-click, not playwright's instant one: the first click
	// selects the frame, and what that starts has the gap to get going in
	const x = Math.round(target.x);
	const y = Math.round(target.y);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.waitForTimeout(CLICK_HOLD_MS);
	await page.mouse.up();
	await page.waitForTimeout(CLICK_GAP_MS);
	await page.mouse.down({ clickCount: 2 });
	await page.waitForTimeout(CLICK_HOLD_MS);
	await page.mouse.up({ clickCount: 2 });
	// over when the document is live, its fade done and the camera still for a while
	const deadline = Date.now() + ENTRY_TIMEOUT_MS;
	for (;;) {
		const done = await page.evaluate(
			({ fade }) => {
				const probe = (globalThis as unknown as { __entry: Probe }).__entry;
				const state = (globalThis as unknown as { __bench: BenchState }).__bench;
				const last = probe.marks.at(-1);
				if (probe.click === null || last?.entered == null) return false;
				const loaded = state.loaded.some((entry) => entry.frame === last.entered && entry.t >= (probe.press ?? 0));
				// a still already gone counts as faded: the first click's selection can
				// have booted the document before the second click arrived
				const faded = probe.marks.find(
					(mark) => mark.entered === last.entered && (mark.cover === "0" || mark.cover === null),
				);
				const still = probe.marks.filter((mark) => mark.t >= last.t - 300);
				return (
					loaded &&
					faded !== undefined &&
					last.t - faded.t >= (faded.cover === null ? 0 : fade) &&
					still.every((mark) => mark.camera === last.camera)
				);
			},
			{ fade: COVER_FADE_MS },
		);
		if (done) break;
		if (Date.now() > deadline) {
			const seen = await page.evaluate(() => {
				const probe = (globalThis as unknown as { __entry: Probe }).__entry;
				return { press: probe.press, click: probe.click, last: probe.marks.at(-1) };
			});
			throw new Error(`the entry did not go live within ${ENTRY_TIMEOUT_MS / 1000} s: ${JSON.stringify(seen)}`);
		}
		await page.waitForTimeout(100);
	}
	const probe = await page.evaluate(() => {
		const probe = (globalThis as unknown as { __entry: Probe }).__entry;
		probe.stop = true;
		return probe;
	});
	// the landing runs on past the entry: the neighbours the rest mounts
	await page.waitForTimeout(LANDING_MS);
	const state = await read(page);
	const click = probe.click as number;
	const marks = probe.marks.filter((mark) => mark.t >= click);
	const frame = marks.find((mark) => mark.entered !== null)?.entered as string;
	const ofFrame = marks.filter((mark) => mark.entered === frame);
	const first = (pick: (mark: Mark) => boolean): number => (marks.find(pick)?.t ?? Number.NaN) - click;
	const before = probe.marks.filter((mark) => mark.t < click).at(-1)?.camera;
	let flyEnd = click;
	let flyStart = Number.NaN;
	for (let i = 0; i < marks.length; i++) {
		const was = i === 0 ? before : marks[i - 1]?.camera;
		if (marks[i]?.camera !== was) {
			if (Number.isNaN(flyStart)) flyStart = (marks[i]?.t as number) - click;
			flyEnd = marks[i]?.t as number;
		}
	}
	// loaded before the second click is clickable the moment it is entered
	const loadedAt = Math.max(
		state.loaded.find((entry) => entry.frame === frame && entry.t >= (probe.press ?? click))?.t ?? Number.NaN,
		click,
	);
	const faded = ofFrame.find((mark) => mark.cover === "0" || mark.cover === null);
	const liveAt = faded === undefined ? Number.NaN : faded.t + (faded.cover === null ? 0 : COVER_FADE_MS);
	const end = Math.max(flyEnd, liveAt);
	return {
		rate,
		frame,
		flyStart,
		flyEnd: flyEnd - click,
		shell: first((mark) => mark.entered === frame),
		slotShown: first((mark) => mark.entered === frame && !mark.slotHidden),
		loaded: loadedAt - click,
		live: liveAt - click,
		between: windowStats(state, probe.press as number, click),
		fly: windowStats(state, click, flyEnd),
		entry: windowStats(state, click, end),
		landing: windowStats(state, flyEnd + REST_MS, flyEnd + LANDING_MS),
		landingTask: Number.NaN,
		mountedAfter: marks.at(-1)?.iframes ?? 0,
	};
}

/** The frames drawn largest on screen at the overview camera, as double-click points. */
async function targets(page: Page, count: number): Promise<{ x: number; y: number }[]> {
	return await page.evaluate((count) => {
		const layer = document.querySelector("[data-picture-layer]") as
			| (HTMLCanvasElement & {
					spoolPictures?: () => { drawn: { box: { x: number; y: number; w: number; h: number } }[] };
			  })
			| null;
		const origin = layer?.getBoundingClientRect();
		const boxes = (layer?.spoolPictures?.().drawn ?? []).map(({ box }) => {
			const left = Math.max(0, (origin?.left ?? 0) + box.x);
			const top = Math.max(0, (origin?.top ?? 0) + box.y);
			const right = Math.min(innerWidth, (origin?.left ?? 0) + box.x + box.w);
			const bottom = Math.min(innerHeight, (origin?.top ?? 0) + box.y + box.h);
			return {
				x: (left + right) / 2,
				y: (top + bottom) / 2,
				area: Math.max(0, right - left) * Math.max(0, bottom - top),
			};
		});
		return boxes
			.filter((box) => box.area >= 2500)
			.sort((a, b) => b.area - a.area)
			.slice(0, count);
	}, count);
}

async function measure(
	browser: Browser,
	subject: Subject,
	camera: { x: number; y: number; k: number },
	page: string,
	options: Options,
): Promise<Entry[]> {
	const entries: Entry[] = [];
	for (const rate of options.throttle) {
		for (let index = 0; index < options.entries; index++) {
			writeCamera(subject.root, camera, page);
			const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
			try {
				await context.addInitScript(collector);
				const tab = await context.newPage();
				tab.on("pageerror", (error) =>
					process.stderr.write(`bench: page error — ${String(error).slice(0, 200)}\n`),
				);
				const cdp = await context.newCDPSession(tab);
				await cdp.send("Emulation.setCPUThrottlingRate", { rate });
				await tab.goto(subject.url, { waitUntil: "domcontentloaded" });
				await settleOnFrames(tab, 1000, 30_000);
				await waitForMountedFramesLoaded(tab, 60_000);
				await tab.waitForTimeout(600);
				const target = (await targets(tab, options.entries))[index];
				if (target === undefined) throw new Error(`no frame ${index + 1} on screen to enter`);
				const kept = index + 1 === options.traceEntry;
				const trace = options.trace?.replace(/\.json$/, kept ? `-${rate}x.json` : `-${rate}x-${index + 1}.json`);
				if (trace !== undefined) await browser.startTracing(tab, { path: trace });
				const entry = await enterOnce(tab, target, rate);
				if (trace !== undefined) {
					await browser.stopTracing();
					const tasks = canvasTasks(trace);
					entry.landingTask = tasks
						.filter((task) => task.at >= entry.flyEnd + REST_MS && task.at <= entry.flyEnd + LANDING_MS)
						.reduce((longest, task) => Math.max(longest, task.ms), 0);
					if (kept) {
						const rows = tasks.filter((task) => task.ms >= TRACE_TASK_MS);
						process.stderr.write(
							`bench: wrote the trace to ${trace}\n` +
								`bench:   canvas tasks over ${TRACE_TASK_MS} ms from the double-click, the flight ending at ${ms(entry.flyEnd)}:\n` +
								rows.map((task) => `bench:     +${ms(task.at)} ms  ${ms(task.ms)} ms\n`).join(""),
						);
					} else rmSync(trace);
				}
				entries.push(entry);
				process.stderr.write(
					`bench:   ${rate}x ${entry.frame}: fly ${ms(entry.flyStart)}–${ms(entry.flyEnd)}, loaded ${ms(entry.loaded)}, live ${ms(entry.live)}, ` +
						`entry p95 ${ms(entry.entry.p95)} worst ${ms(entry.entry.worst)}\n`,
				);
			} finally {
				await context.close();
			}
			// the canvas saves its camera on settle: let that land before the next plan
			await new Promise((wait) => setTimeout(wait, 1500));
		}
	}
	return entries;
}

interface TraceEvent {
	name: string;
	ph: string;
	pid: number;
	tid: number;
	ts: number;
	dur?: number;
	args?: { data?: { type?: string } };
}

/** A task this long on the canvas's main thread is listed from the kept trace. */
const TRACE_TASK_MS = 8;

/**
 * The canvas's own main-thread tasks from the double-click on, from a trace:
 * the thread is the one that dispatched the double-click, and each task is
 * its start after it and its length, in ms.
 */
function canvasTasks(path: string): { at: number; ms: number }[] {
	const { traceEvents } = JSON.parse(readFileSync(path, "utf8")) as { traceEvents: TraceEvent[] };
	const click = traceEvents.find((event) => event.name === "EventDispatch" && event.args?.data?.type === "dblclick");
	if (click === undefined) throw new Error(`no double-click in the trace ${path}`);
	const tasks = traceEvents
		.filter(
			(event) =>
				event.ph === "X" &&
				event.pid === click.pid &&
				event.tid === click.tid &&
				event.ts >= click.ts &&
				(event.name === "ThreadControllerImpl::RunTask" || event.name === "RunTask"),
		)
		.sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
	// a task is often traced twice, the scheduler's span around the thread's
	// own: one inside another is the same task
	const found: { at: number; ms: number }[] = [];
	let end = Number.NEGATIVE_INFINITY;
	for (const task of tasks) {
		if (task.ts < end) continue;
		end = task.ts + (task.dur ?? 0);
		found.push({ at: (task.ts - click.ts) / 1000, ms: (task.dur ?? 0) / 1000 });
	}
	return found;
}

function table(entries: Entry[], rateList: number[]): string {
	const rates = rateList.map(String);
	const column = (key: string) => entries.filter((entry) => String(entry.rate) === key);
	const cell = (pick: (entry: Entry) => number) =>
		rates
			.map((rate) => {
				const values = column(rate).map(pick);
				return `${ms(median(values))} (${ms(Math.max(...values.filter(Number.isFinite)))})`;
			})
			.join(" | ");
	const count = (pick: (entry: Entry) => number) =>
		rates.map((rate) => `${median(column(rate).map(pick))} (${Math.max(...column(rate).map(pick))})`).join(" | ");
	return [
		`| median (worst) of ${entries.length / rates.length} entries | ${rates.map((rate) => `${rate}x`).join(" | ")} |`,
		`|---|${rates.map(() => "---|").join("")}`,
		`| double-click to flight's first frame | ${cell((e) => e.flyStart)} |`,
		`| double-click to flight's last frame | ${cell((e) => e.flyEnd)} |`,
		`| double-click to shell in the page | ${cell((e) => e.shell)} |`,
		`| double-click to shell shown | ${cell((e) => e.slotShown)} |`,
		`| double-click to document loaded (clickable) | ${cell((e) => e.loaded)} |`,
		`| double-click to live (still faded) | ${cell((e) => e.live)} |`,
		`| between the clicks, worst interval | ${cell((e) => e.between.worst)} |`,
		`| flight frames drawn | ${count((e) => e.fly.frames)} |`,
		`| flight p95 interval | ${cell((e) => e.fly.p95)} |`,
		`| flight worst interval | ${cell((e) => e.fly.worst)} |`,
		`| entry p95 interval | ${cell((e) => e.entry.p95)} |`,
		`| entry worst interval | ${cell((e) => e.entry.worst)} |`,
		`| entry intervals > ${RARE_INTERVAL_MS} ms | ${count((e) => e.entry.rareIntervals)} |`,
		`| entry long-animation frames | ${count((e) => e.entry.loafs)} |`,
		`| entry worst LoAF blocking | ${cell((e) => e.entry.loafWorstBlocking)} |`,
		`| landing worst interval | ${cell((e) => e.landing.worst)} |`,
		`| landing intervals > ${RARE_INTERVAL_MS} ms | ${count((e) => e.landing.rareIntervals)} |`,
		`| landing longest task (traced) | ${cell((e) => e.landingTask)} |`,
		`| documents mounted after | ${count((e) => e.mountedAfter)} |`,
	].join("\n");
}

async function main(): Promise<void> {
	const { builds, rest } = takeBuildOptions(process.argv.slice(2));
	const options = parseArgs(rest);
	const { subjects, page: measured } = await startSubjects(options.project, builds.slice(0, 1), options.page);
	const subject = subjects[0] as Subject;
	try {
		const frames = measured.frames as FrameBox[];
		const camera = planCamera(frames, VIEWPORT.width, VIEWPORT.height, options.zoom);
		const browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		try {
			writeCamera(subject.root, planCamera(frames, VIEWPORT.width, VIEWPORT.height, DEFAULT_ZOOM), measured.page);
			await prepareCurrentCovers(browser, subject.daemon, subject.url, subject.root, measured.frames);
			const entries = await measure(browser, subject, camera, measured.page, options);
			process.stdout.write(
				`entry from k=${options.zoom} on page "${measured.page}"\n\n${table(entries, options.throttle)}\n`,
			);
			if (options.out !== undefined) writeFileSync(options.out, `${JSON.stringify(entries, null, 2)}\n`);
		} finally {
			await browser.close();
		}
	} finally {
		stopSubjects(subjects);
	}
}

await main();
