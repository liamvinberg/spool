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
	args: () => string[];
	metrics: Metric[];
	extract: (out: unknown, log: string) => Record<string, number>;
	timeoutMs: number;
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
	},
];

export { BENCH, execFileSync, metricsOf, REAL, repoRoot };
