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

const lower = (key: string, unit: string): Metric => ({ key, unit, better: "lower" });
const higher = (key: string, unit: string): Metric => ({ key, unit, better: "higher" });

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

export const ROWS: Row[] = [
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
	},
];

export { BENCH, execFileSync, metricsOf, REAL, repoRoot };
