/**
 * The scoreboard's rows (`bench/loop/program.md`): which bench measures each,
 * on which subject, and which numbers of its `--out` report count.
 *
 * A bench written for the loop reports `{ metrics: { <key>: number } }`, and
 * its row takes them as they are. The older benches each have their own report
 * shape, read by the row's `extract`.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { repoRoot } from "../harness.ts";

export interface Arm {
	label: string;
	checkout: string;
	experiments: string[];
}

export interface Metric {
	key: string;
	unit: string;
	better: "lower" | "higher";
}

export interface Row {
	id: string;
	what: string;
	/** Which frozen subject the bench measures (its seed of covers is per subject). */
	subject: "spool-bench" | "spool-real" | "none";
	/** A bench under `bench/`, run as a process; or a measurement taken here, on the arm's checkout. */
	bench: string | ((arm: Arm) => Promise<Record<string, number>>);
	args: (arm: Arm) => string[];
	metrics: Metric[];
	extract: (out: unknown, log: string) => Record<string, number>;
	timeoutMs: number;
	/** A bench with no `--out` is read from what it prints; `extract` gets `undefined` and the log. */
	noOut?: true;
	/** Where its numbers can be believed: the m1 for feel, devobee for what needs Linux (its GPU, /proc). */
	stage: "m1" | "devobee" | "any";
}

/** Where the frozen subjects are on this machine (program.md); `SPOOL_LOOP_SUBJECTS` moves them. */
const subjects = process.env.SPOOL_LOOP_SUBJECTS ?? join(homedir(), "dev", "scratch");
const BENCH = join(subjects, "spool-bench");
const REAL = join(subjects, "spool-real-324");

export const lower = (key: string, unit: string): Metric => ({ key, unit, better: "lower" });
export const higher = (key: string, unit: string): Metric => ({ key, unit, better: "higher" });

export const median = (values: readonly number[]): number => {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (sorted.length === 0) return Number.NaN;
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/** A loop bench's report, taken as it is. */
const metricsOf = (out: unknown): Record<string, number> => {
	const metrics = (out as { metrics?: Record<string, unknown> }).metrics ?? {};
	return Object.fromEntries(
		Object.entries(metrics).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
	);
};

const nonTestLines = (dir: string): number => {
	let total = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) total += nonTestLines(path);
		else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$|test-|-harness\.ts$/.test(entry.name)) {
			total += readFileSync(path, "utf8").split("\n").length;
		}
	}
	return total;
};

const lines = (file: string): number => readFileSync(file, "utf8").split("\n").length;

const gzipBytes = (dir: string, pattern: RegExp): number => {
	let total = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) total += gzipBytes(path, pattern);
		else if (pattern.test(entry.name) && statSync(path).size > 0) total += gzipSync(readFileSync(path)).length;
	}
	return total;
};

interface Gesture {
	p50: number;
	p95: number;
	worst: number;
	rareIntervals: number;
	frames: number;
	loafWorstBlocking: number;
}

export const ROWS: Row[] = [
	{
		id: "canvas",
		what: "Pan and zoom over the 1000-frame page at working zoom, entry, arrival and reload (bench/canvas.ts, #82)",
		subject: "spool-bench",
		bench: "canvas.ts",
		args: () => ["--project", BENCH, "--page", "n1000", "--throttle", "1", "--headed"],
		metrics: [
			lower("pan_p95_ms", "ms"),
			lower("pan_worst_ms", "ms"),
			lower("pan_slow_share", "%"),
			lower("zoom_p95_ms", "ms"),
			lower("zoom_worst_ms", "ms"),
			lower("zoom_slow_share", "%"),
			lower("arrival_p50_ms", "ms"),
			lower("enter_ms", "ms"),
			lower("reload_ms", "ms"),
		],
		extract: (out) => {
			const result = (out as { results: Array<Record<string, unknown>> }).results[0] as Record<string, unknown>;
			const pan = result.pan as Gesture;
			const zoom = result.zoom as Gesture;
			return {
				pan_p95_ms: pan.p95,
				pan_worst_ms: pan.worst,
				// intervals over 12 ms: a missed frame at 120 Hz (#132's rare-interval threshold)
				pan_slow_share: (100 * pan.rareIntervals) / Math.max(1, pan.frames),
				zoom_p95_ms: zoom.p95,
				zoom_worst_ms: zoom.worst,
				zoom_slow_share: (100 * zoom.rareIntervals) / Math.max(1, zoom.frames),
				arrival_p50_ms: result.arrivalP50 as number,
				enter_ms: result.enterMs as number,
				reload_ms: result.reloadMs as number,
			};
		},
		timeoutMs: 40 * 60_000,
		stage: "m1",
	},
	{
		id: "entry",
		what: "Double-click a frame on the 1000-frame overview to it being live: the camera's flight and the landing (bench/entry.ts, DEV-296)",
		subject: "spool-bench",
		bench: "entry.ts",
		args: () => ["--project", BENCH, "--page", "n1000", "--entries", "6", "--throttle", "1", "--headed"],
		metrics: [
			lower("live_ms", "ms"),
			lower("flight_end_ms", "ms"),
			lower("flight_p95_ms", "ms"),
			higher("flight_fps", "fps"),
			lower("entry_slow_count", "n"),
			lower("landing_slow_count", "n"),
			lower("landing_worst_ms", "ms"),
		],
		extract: (out) => {
			const entries = out as Array<{
				flyStart: number;
				flyEnd: number;
				live: number;
				fly: Gesture;
				entry: Gesture;
				landing: Gesture;
			}>;
			const of = (pick: (entry: (typeof entries)[number]) => number): number => median(entries.map(pick));
			return {
				live_ms: of((entry) => entry.live),
				flight_end_ms: of((entry) => entry.flyEnd),
				flight_p95_ms: of((entry) => entry.fly.p95),
				// frames the flight drew per second of flight: 120 is the display's rate on the m1
				flight_fps: of((entry) => (1000 * entry.fly.frames) / Math.max(1, entry.flyEnd - entry.flyStart)),
				entry_slow_count: of((entry) => entry.entry.rareIntervals),
				landing_slow_count: of((entry) => entry.landing.rareIntervals),
				landing_worst_ms: of((entry) => entry.landing.worst),
			};
		},
		timeoutMs: 40 * 60_000,
		stage: "m1",
	},
	{
		id: "reload",
		what: "Reload of the 200-frame page to every cover on screen decoded, and the booth's covers from nothing (bench/reload.ts, #98)",
		subject: "spool-bench",
		bench: "reload.ts",
		args: () => ["--project", BENCH, "--page", "n200", "--repeats", "4", "--headed"],
		metrics: [lower("cold_ms", "ms"), lower("warm_ms", "ms"), lower("covers_from_nothing_s", "s")],
		extract: (out) => {
			const result = (
				out as {
					results: Array<{
						result: {
							coverMs: number;
							runs: Array<{ arm: string; cache: string; samples: Array<{ decodeCompleteMs: number }> }>;
						};
					}>;
				}
			).results[0]?.result;
			if (result === undefined) return {};
			const stock = (cache: string): number =>
				median(
					result.runs
						.filter((run) => run.arm === "stock" && run.cache === cache)
						.flatMap((run) => run.samples.map((sample) => sample.decodeCompleteMs)),
				);
			return { cold_ms: stock("cold"), warm_ms: stock("warm"), covers_from_nothing_s: result.coverMs / 1000 };
		},
		timeoutMs: 30 * 60_000,
		stage: "m1",
	},
	{
		id: "walk",
		what: "Click a link inside a live frame to the target frame's document loaded, same page and across pages (bench/walk.ts, #96)",
		subject: "spool-bench",
		bench: "walk.ts",
		args: () => ["--project", BENCH, "--walks", "8", "--headed"],
		metrics: [lower("same_page_ms", "ms"), lower("cross_page_ms", "ms")],
		extract: (out) => {
			const walks = (out as { results: Array<{ kind: string; ok: boolean; clickToLoaded: number }> }).results;
			const of = (kind: string): number =>
				median(walks.filter((walk) => walk.ok && walk.kind === kind).map((walk) => walk.clickToLoaded));
			return { same_page_ms: of("same-page"), cross_page_ms: of("cross-page") };
		},
		timeoutMs: 30 * 60_000,
		stage: "m1",
	},
	{
		id: "cost",
		what: "What mounted frames cost the browser: memory and idle cpu over a bare host page, and one mount's insert to loaded (bench/frame-cost.ts, #85)",
		subject: "spool-bench",
		bench: "frame-cost.ts",
		args: () => ["--project", BENCH, "--headed"],
		metrics: [
			lower("first_frame_mb", "MB"),
			lower("live25_mb", "MB"),
			lower("live50_mb", "MB"),
			lower("live25_cpu_pct", "%"),
			lower("offscreen24_cpu_pct", "%"),
			lower("mount_cold_ms", "ms"),
			lower("mount_warm_ms", "ms"),
		],
		extract: (out) => {
			interface Reading {
				rssMb: number;
				idleCpuPercent: number;
			}
			const report = out as {
				cases: Array<{ label: string; floor: Reading; held: Reading }>;
				arrivals: Array<{ label: string; p50: number }>;
			};
			const over = (label: string, field: keyof Reading): number => {
				const found = report.cases.find((each) => each.label === label);
				return found === undefined ? Number.NaN : found.held[field] - found.floor[field];
			};
			const mount = (prefix: string): number =>
				report.arrivals.find((each) => each.label.startsWith(prefix))?.p50 ?? Number.NaN;
			return {
				first_frame_mb: over("1 live", "rssMb"),
				live25_mb: over("25 live", "rssMb"),
				live50_mb: over("50 live", "rssMb"),
				live25_cpu_pct: over("25 live", "idleCpuPercent"),
				offscreen24_cpu_pct: over("24 live, offscreen", "idleCpuPercent"),
				mount_cold_ms: mount("cold"),
				mount_warm_ms: mount("warm"),
			};
		},
		timeoutMs: 30 * 60_000,
		stage: "any",
	},
	{
		id: "hand",
		what: "Hand editing on Spool's own home frame: pan and zoom with it live, click to ring, typing to paint, Enter to the file saved (bench/qa-editing.ts, task 141)",
		subject: "spool-real",
		bench: "qa-editing.ts",
		args: () => ["--project", REAL, "--frame", "app/spool-home"],
		metrics: [
			lower("pan_p95_ms", "ms"),
			lower("pan_slow_count", "n"),
			lower("zoom_p95_ms", "ms"),
			lower("zoom_slow_count", "n"),
			lower("click_to_ring_ms", "ms"),
			lower("click_to_rungs_ms", "ms"),
			lower("caret_ms", "ms"),
			lower("slow_keys_share", "%"),
			lower("enter_to_saved_ms", "ms"),
		],
		extract: (out) => {
			const results = (out as { results: Record<string, number[]> }).results;
			const of = (label: string): number => median(results[label] ?? []);
			const slowKeys = (results["keystrokes ≥16 ms to paint"] ?? []).reduce((sum, value) => sum + value, 0);
			// each words edit types four keys (qa-editing.ts)
			const typed = 4 * (results["keystrokes ≥16 ms to paint"] ?? []).length;
			return {
				pan_p95_ms: of("pan frame interval p95"),
				pan_slow_count: of("pan intervals over 12 ms"),
				zoom_p95_ms: of("zoom frame interval p95"),
				zoom_slow_count: of("zoom intervals over 12 ms"),
				click_to_ring_ms: of("click → selection ring"),
				click_to_rungs_ms: of("click → file read, edits allowed (POST /rungs)"),
				caret_ms: of("second click → caret in the words"),
				slow_keys_share: typed === 0 ? Number.NaN : (100 * slowKeys) / typed,
				enter_to_saved_ms: of("Enter → file saved"),
			};
		},
		timeoutMs: 30 * 60_000,
		stage: "m1",
	},
	{
		id: "live",
		what: "Pan, zoom and idle with Spool's live player frame on screen, at entry zoom and working zoom (bench/pan-trace.ts, DEV-297)",
		subject: "spool-real",
		bench: "pan-trace.ts",
		args: () => ["--project", REAL, "--frame", "app/spool-player", "--rounds", "2", "--dpr", "2"],
		noOut: true,
		stage: "m1",
		metrics: [
			lower("k85_pan_slow_share", "%"),
			lower("k85_zoom_slow_share", "%"),
			lower("k85_idle_slow_share", "%"),
			lower("k45_pan_slow_share", "%"),
			lower("k45_zoom_slow_share", "%"),
			lower("k45_idle_slow_share", "%"),
			lower("k45_pan_p95_ms", "ms"),
		],
		extract: (_out, log) => {
			const metrics: Record<string, number> = {};
			// k=0.85 base       pan p95 16.8 ms, 19.3% over 12 ms, worst 21.0 | zoom p95 16.6 ms, 19.0% over 12 ms, worst 17.9 | idle 34.0% over 12 ms
			const line =
				/^k=([\d.]+) base\s+pan p95 ([\d.]+) ms, ([\d.]+)% over 12 ms.*\| zoom p95 ([\d.]+) ms, ([\d.]+)% over 12 ms.*\| idle ([\d.]+)% over 12 ms/gm;
			for (const match of log.matchAll(line)) {
				const k = `k${Math.round(Number(match[1]) * 100)}`;
				metrics[`${k}_pan_p95_ms`] = Number(match[2]);
				metrics[`${k}_pan_slow_share`] = Number(match[3]);
				metrics[`${k}_zoom_slow_share`] = Number(match[5]);
				metrics[`${k}_idle_slow_share`] = Number(match[6]);
			}
			return metrics;
		},
		timeoutMs: 20 * 60_000,
	},
	{
		id: "save",
		what: "What a hand save to a shared file costs the requests after it and the daemon's event loop (bench/save-busy.ts, DEV-300)",
		subject: "spool-real",
		bench: "save-busy.ts",
		args: () => ["--project", REAL, "--frame", "app/spool-home", "--rounds", "6"],
		stage: "any",
		metrics: [
			lower("flows_after_save_ms", "ms"),
			lower("rungs_after_save_ms", "ms"),
			lower("selection_after_save_ms", "ms"),
			lower("loop_worst_ms", "ms"),
		],
		extract: (out) => {
			interface Requests {
				selection: number;
				rungs: number;
				flows: number;
			}
			const rounds = (out as { rounds: Array<{ first: Requests; loop: { worst: number } }> }).rounds;
			return {
				flows_after_save_ms: median(rounds.map((round) => round.first.flows)),
				rungs_after_save_ms: median(rounds.map((round) => round.first.rungs)),
				selection_after_save_ms: median(rounds.map((round) => round.first.selection)),
				loop_worst_ms: median(rounds.map((round) => round.loop.worst)),
			};
		},
		timeoutMs: 20 * 60_000,
	},
	{
		id: "viewer",
		what: "The read-only canvas (spool.page) on 600 synthetic frames: pan and zoom frame intervals on the GPU (bench/viewer.ts)",
		subject: "none",
		bench: "viewer.ts",
		args: (arm) => ["--rounds", "2", "--gpu", "vulkan", "--build", join(arm.checkout, "dist", "viewer")],
		noOut: true,
		stage: "devobee",
		metrics: [
			lower("slow_count", "n"),
			lower("long_task_ms", "ms"),
			lower("cpu_main_ms", "ms"),
			lower("cpu_all_ms", "ms"),
			lower("booted_count", "n"),
		],
		extract: (_out, log) => {
			//   readable pan (67%)   frames 120  p50 16.7  p95 16.7  max 16.8  >33ms   0  long   2 (  206 ms)  cpu main  2845 all   6090  iframes  7  booted 11
			const phase =
				/^ {2}(.+?) \(\d+%\)\s+frames\s+\d+.*>33ms\s+(\d+)\s+long\s+\d+ \(\s*(\d+) ms\)\s+cpu main\s+(\d+) all\s+(\d+)\s+iframes\s+\d+\s+booted (\d+)/gm;
			const totals = { slow_count: 0, long_task_ms: 0, cpu_main_ms: 0, cpu_all_ms: 0, booted_count: 0 };
			let rounds = 0;
			for (const match of log.matchAll(phase)) {
				if (match[1] === "open, fitted") rounds++;
				totals.slow_count += Number(match[2]);
				totals.long_task_ms += Number(match[3]);
				totals.cpu_main_ms += Number(match[4]);
				totals.cpu_all_ms += Number(match[5]);
				totals.booted_count = Math.max(totals.booted_count, Number(match[6]));
			}
			if (rounds === 0) return {};
			// per round, so a row's numbers do not depend on how many rounds it ran
			return {
				slow_count: totals.slow_count / rounds,
				long_task_ms: totals.long_task_ms / rounds,
				cpu_main_ms: totals.cpu_main_ms / rounds,
				cpu_all_ms: totals.cpu_all_ms / rounds,
				booted_count: totals.booted_count,
			};
		},
		timeoutMs: 20 * 60_000,
	},
	{
		id: "code",
		what: "Lines of code in the core modules and the bundles a person downloads: smaller at equal numbers is a win",
		subject: "none",
		bench: async (arm) => {
			const src = join(arm.checkout, "src");
			return {
				src_lines: nonTestLines(src),
				canvas_tsx_lines: lines(join(src, "ui", "canvas", "canvas.tsx")),
				canvas_dir_lines: nonTestLines(join(src, "ui", "canvas")),
				runtime_lines: nonTestLines(join(src, "runtime")),
				daemon_lines: nonTestLines(join(src, "daemon")),
				ui_js_gzip_kb: gzipBytes(join(arm.checkout, "dist", "ui"), /\.js$/) / 1024,
				ui_css_gzip_kb: gzipBytes(join(arm.checkout, "dist", "ui"), /\.css$/) / 1024,
				deps: Object.keys(
					(JSON.parse(readFileSync(join(arm.checkout, "package.json"), "utf8")) as { dependencies?: object })
						.dependencies ?? {},
				).length,
			};
		},
		args: () => [],
		metrics: [
			lower("src_lines", "lines"),
			lower("canvas_tsx_lines", "lines"),
			lower("canvas_dir_lines", "lines"),
			lower("runtime_lines", "lines"),
			lower("daemon_lines", "lines"),
			lower("ui_js_gzip_kb", "KiB"),
			lower("ui_css_gzip_kb", "KiB"),
			lower("deps", "pkgs"),
		],
		extract: () => ({}),
		timeoutMs: 60_000,
		stage: "any",
	},
	{
		id: "edit",
		what: "An agent's write landing in the live frame a person is inside: to its pixels, its state kept, the daemon's compile",
		subject: "spool-real",
		bench: "edit-loop.ts",
		args: () => ["--project", REAL],
		metrics: [
			lower("save_to_pixels_ms", "ms"),
			lower("save_to_loaded_ms", "ms"),
			lower("shared_save_to_pixels_ms", "ms"),
			lower("shared_save_to_loaded_ms", "ms"),
			higher("state_kept_count", "of 4"),
			higher("shared_state_kept_count", "of 4"),
			lower("compile_ms", "ms"),
			lower("shared_compile_ms", "ms"),
			lower("document_hit_ms", "ms"),
		],
		extract: metricsOf,
		// a first run on a commit makes the subject's covers before it measures
		timeoutMs: 1_800_000,
		stage: "m1",
	},
	{
		id: "cold",
		what: "A cold start, no covers: daemon spawned to the canvas up and its first live frame loaded",
		subject: "spool-real",
		bench: "edit-loop.ts",
		args: () => ["--project", REAL, "--measure", "cold"],
		metrics: [lower("daemon_up_ms", "ms"), lower("canvas_ready_ms", "ms"), lower("cold_first_live_ms", "ms")],
		extract: metricsOf,
		timeoutMs: 600_000,
		stage: "m1",
	},
];

export { BENCH, execFileSync, metricsOf, REAL, repoRoot };
