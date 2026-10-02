import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BrowserContext, type CDPSession, chromium, type Page } from "playwright-core";
import {
	type BenchState,
	type BuildRun,
	buildsHeader,
	collector,
	DEFAULT_ZOOM,
	driveRoundTripWheel,
	framesOnCanvas,
	type GestureStats,
	interleave,
	median,
	mountedCount,
	ms,
	now,
	oneMinuteLoad,
	PAN_EVENTS,
	PAN_STEP_PX,
	planCamera,
	prepareCurrentCovers,
	quantile,
	RARE_INTERVAL_MS,
	read,
	type Stamped,
	type Subject,
	settle,
	startSubjects,
	stopSubjects,
	takeBuildOptions,
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
 *   node bench/canvas.ts --project <path> --page n1000 --builds base=<checkout>,cand=<checkout> --rounds 4 --headed
 *
 * The default measures entry into a readable document. The 0.16 command keeps
 * the historical cold overview-entry route visible.
 *
 * `--builds` compares spool versions: each build is a built spool checkout,
 * measured on its own copy of the same subject, and `--rounds` runs every build
 * that many times with the order rotated each round (`takeBuildOptions` in
 * harness.ts). The report gives the median of the rounds and, beside it, the
 * worst round whole. A difference between builds means something only when it
 * is larger than the spread between rounds of one build, and the load row says
 * how busy the machine was.
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
	/** The one-minute load average as this rate began. */
	load1: number;
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
	load1: number,
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
	// Nothing the canvas is doing on its own may still be in flight: every
	// readable document has loaded.
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
		load1,
	};
}

/** A rate a round could not measure. It stays in the report as a failure; it is never dropped. */
interface Failed {
	rate: number;
	load1: number;
	failed: string;
}

type Outcome = RunResult | Failed;

const isFailed = (outcome: Outcome): outcome is Failed => "failed" in outcome;

/** One column of the report: a build at one rate, and what each of its rounds measured. */
interface Column {
	label: string;
	rounds: Outcome[];
}

/**
 * The worst round, picked whole so its figures are printed together: the one
 * whose slower gesture had the highest p95, then the longest single interval.
 * A failed round is worse than any measured one.
 */
function worstRound(rounds: readonly Outcome[]): number {
	const severity = (outcome: Outcome): number[] =>
		isFailed(outcome)
			? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
			: [Math.max(outcome.pan.p95, outcome.zoom.p95), Math.max(outcome.pan.worst, outcome.zoom.worst)];
	let worst = 0;
	for (let index = 1; index < rounds.length; index++) {
		const [p95, longest] = severity(rounds[index] as Outcome);
		const [worstP95, worstLongest] = severity(rounds[worst] as Outcome);
		if (
			(p95 as number) > (worstP95 as number) ||
			(p95 === worstP95 && (longest as number) > (worstLongest as number))
		) {
			worst = index;
		}
	}
	return worst;
}

/**
 * Every cell is the median of the column's measured rounds, so a column of one
 * round prints that round as it was. A round that failed is counted in the
 * `rounds measured` row, and a column with no measured round prints "failed".
 */
function table(columns: Column[], zoom: number): string {
	const entryScope = zoom === CANVAS_ZOOM ? `readable at k=${zoom}` : `k=${zoom}`;
	const cells = (cell: (runs: RunResult[]) => string): string =>
		columns
			.map((column) => {
				const measured = column.rounds.filter((outcome): outcome is RunResult => !isFailed(outcome));
				return measured.length === 0 ? "failed" : cell(measured);
			})
			.join(" | ");
	const mid = (runs: RunResult[], pick: (run: RunResult) => number): number => median(runs.map(pick));
	const count = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
	const gesture = (runs: RunResult[], pick: (run: RunResult) => GestureStats): string =>
		`${ms(mid(runs, (r) => pick(r).p50))} / ${ms(mid(runs, (r) => pick(r).p95))} / ${ms(mid(runs, (r) => pick(r).worst))}`;
	const rare = (runs: RunResult[], pick: (run: RunResult) => GestureStats): string =>
		`${count(mid(runs, (r) => pick(r).rareIntervals))} / ${count(mid(runs, (r) => pick(r).frames))}`;
	const loafs = (runs: RunResult[], pick: (run: RunResult) => GestureStats): string =>
		`${count(mid(runs, (r) => pick(r).loafs))} (worst block ${ms(mid(runs, (r) => pick(r).loafWorstBlocking))})`;
	const enter = (runs: RunResult[]): string => {
		const reached = runs.filter((r) => Number.isFinite(r.enterMs));
		if (reached.length === 0) return "never";
		const missed = runs.length - reached.length;
		return `${ms(mid(reached, (r) => r.enterMs))}${missed > 0 ? ` (never in ${missed} of ${runs.length})` : ""}`;
	};
	const measured = (column: Column): string => {
		const failures = column.rounds.filter(isFailed);
		const head = `${column.rounds.length - failures.length} of ${column.rounds.length}`;
		return failures.length === 0 ? head : `${head}, failed: ${failures.map((outcome) => outcome.failed).join("; ")}`;
	};
	const load = (column: Column): string => {
		const loads = column.rounds.map((outcome) => outcome.load1);
		const low = Math.min(...loads).toFixed(1);
		const high = Math.max(...loads).toFixed(1);
		return low === high ? low : `${low} to ${high}`;
	};
	const rows = [
		`| bar | ${columns.map((column) => column.label).join(" | ")} |`,
		`|---|${columns.map(() => "---|").join("")}`,
		`| rounds measured | ${columns.map(measured).join(" | ")} |`,
		`| refresh interval (idle p50) | ${cells((runs) => ms(mid(runs, (r) => r.refreshMs)))} |`,
		`| pan p50 / p95 / worst | ${cells((runs) => gesture(runs, (r) => r.pan))} |`,
		`| pan intervals > ${RARE_INTERVAL_MS} ms | ${cells((runs) => rare(runs, (r) => r.pan))} |`,
		`| pan long-animation frames | ${cells((runs) => loafs(runs, (r) => r.pan))} |`,
		`| zoom p50 / p95 / worst | ${cells((runs) => gesture(runs, (r) => r.zoom))} |`,
		`| zoom intervals > ${RARE_INTERVAL_MS} ms | ${cells((runs) => rare(runs, (r) => r.zoom))} |`,
		`| zoom long-animation frames | ${cells((runs) => loafs(runs, (r) => r.zoom))} |`,
		`| frame arrival p50 / worst | ${cells((runs) => `${ms(mid(runs, (r) => r.arrivalP50))} / ${ms(mid(runs, (r) => r.arrivalWorst))}`)} |`,
		`| double-click to clickable (${entryScope}) | ${cells(enter)} |`,
		`| reload to settled | ${cells((runs) => ms(mid(runs, (r) => r.reloadMs)))} |`,
		`| documents mounted (idle / peak) | ${cells((runs) => `${count(mid(runs, (r) => r.idleMounted))} / ${count(mid(runs, (r) => Math.max(r.pan.mountedPeak, r.zoom.mountedPeak)))}`)} |`,
		`| of those, throttled by name | ${cells((runs) => count(mid(runs, (r) => r.throttledFrames)))} |`,
		`| one-minute load at the run | ${columns.map(load).join(" | ")} |`,
	];
	return rows.join("\n");
}

async function main(): Promise<void> {
	const { builds, rounds, rest } = takeBuildOptions(process.argv.slice(2));
	const options = parseArgs(rest);
	const { subjects, page: measured } = await startSubjects(options.project, builds, options.page);
	try {
		const camera = planCamera(measured.frames, VIEWPORT.width, VIEWPORT.height, options.zoom);
		// rewritten before every run: the canvas persists its camera on settle, so
		// each rate would otherwise start where the last one's gestures left off
		const resetCamera = (subject: Subject): void => writeCamera(subject.root, camera, measured.page);
		const browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		let runs: BuildRun<Outcome[]>[];
		try {
			for (const subject of subjects) {
				const pictures = planCamera(measured.frames, VIEWPORT.width, VIEWPORT.height, DEFAULT_ZOOM);
				writeCamera(subject.root, pictures, measured.page);
				await prepareCurrentCovers(browser, subject.url, subject.root, measured.frames);

				// One discarded pass first. A fresh daemon compiles every frame it is
				// asked for, and a first-ever boot measures the toolchain rather than the
				// canvas — arrivals came out at 4.2 s cold against 0.2 s warm.
				process.stderr.write(`bench: warming ${subject.build.label}\n`);
				resetCamera(subject);
				const warm = await browser.newContext({ viewport: VIEWPORT });
				const warmPage = await warm.newPage();
				await warmPage.goto(subject.url, { waitUntil: "domcontentloaded" });
				await settle(warmPage, 1500, 60_000);
				await warm.close();
				// The canvas persists its own camera through the daemon on settle, so a
				// save in flight when the context closed can land *after* the planned
				// camera is written and quietly reopen the next run somewhere empty.
				await new Promise((wait) => setTimeout(wait, 1500));
			}

			runs = await interleave(subjects, rounds, async (subject) => {
				const outcomes: Outcome[] = [];
				for (const rate of options.throttle) {
					resetCamera(subject);
					const load1 = oneMinuteLoad();
					const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
					try {
						await context.addInitScript(collector);
						const page = await context.newPage();
						// a canvas that threw is not a canvas that was fast: never report over a broken run
						page.on("pageerror", (error) =>
							process.stderr.write(`bench: page error — ${String(error).slice(0, 200)}\n`),
						);
						const cdp = await context.newCDPSession(page);
						outcomes.push(await measure(page, context, cdp, rate, subject.url, load1));
						process.stderr.write(`bench:   throttle ${rate}x at load ${load1.toFixed(1)}\n`);
					} catch (error) {
						const reason = String(error).slice(0, 160);
						process.stderr.write(`bench:   throttle ${rate}x failed at load ${load1.toFixed(1)}: ${reason}\n`);
						outcomes.push({ rate, load1, failed: reason });
					} finally {
						await context.close();
					}
					// let the settle-time camera save land before the next plan overwrites it
					await new Promise((wait) => setTimeout(wait, 1500));
				}
				return outcomes;
			});
		} finally {
			await browser.close();
		}

		const column = (subject: Subject, index: number, picked: (rounds: Outcome[]) => Outcome[]): Column => ({
			label:
				subjects.length === 1
					? `${options.throttle[index]}x`
					: `${subject.build.label} ${options.throttle[index]}x`,
			rounds: picked(
				runs.filter((run) => run.build === subject.build.label).map((run) => run.result[index] as Outcome),
			),
		});
		const columns = subjects.flatMap((subject) =>
			options.throttle.map((_, index) => column(subject, index, (all) => all)),
		);
		const sections = [buildsHeader(subjects, runs, rounds)];
		if (rounds === 1) {
			sections.push(table(columns, options.zoom));
		} else {
			const worst = columns.map((each) => {
				const index = worstRound(each.rounds);
				return { label: `${each.label}, round ${index + 1}`, rounds: [each.rounds[index] as Outcome] };
			});
			sections.push(
				`### median of the rounds\n\n${table(columns, options.zoom)}`,
				`### worst round (highest gesture p95, then longest interval)\n\n${table(worst, options.zoom)}`,
			);
		}
		process.stdout.write(`${sections.join("\n\n")}\n`);
		if (options.out !== undefined) {
			const results = runs.flatMap((run) =>
				run.result.map((outcome) => ({ build: run.build, round: run.round, ...outcome })),
			);
			writeFileSync(
				options.out,
				`${JSON.stringify(
					{
						project: options.project,
						headed: options.headed,
						page: measured.page,
						builds: subjects.map((subject) => subject.build),
						results,
					},
					null,
					2,
				)}\n`,
			);
			process.stderr.write(`bench: wrote ${options.out}\n`);
		}
	} finally {
		stopSubjects(subjects);
	}
}

await main();
