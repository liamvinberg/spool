/**
 * The loop's runner (spool#218, `bench/loop/program.md`): every row of the
 * scoreboard, for two or more arms, interleaved.
 *
 *   node bench/loop/ab.ts --rows pan,reload --arms base=<checkout>,cand=<checkout>+<experiment> --rounds 2
 *   node bench/loop/ab.ts --rows all --arms a=<checkout>,b=<checkout of the same commit> --rounds 4 --aa
 *
 * An arm is a built spool checkout, and the experiments it switches on after a
 * `+`. Every bench runs as its own process from this checkout's bench code,
 * measuring the arm's `dist/` (`SPOOL_BENCH_BUILD`), so two arms differ in the
 * product and nothing else. Each round runs every arm once per row, the order
 * rotated round by round, and records the one-minute load before each run.
 *
 * Without `--aa` the report puts each arm's median beside the first arm's and
 * the row's band from `bands.json`: a difference inside the band is noise.
 * With `--aa` the arms are one commit twice, and what it prints is the band:
 * the gap between the two arms' medians and the spread within each.
 *
 * Every run's numbers go to `--out` (JSON lines, default under the OS temp
 * dir), so a report can be redrawn without measuring again.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { loadavg, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repoRoot } from "../harness.ts";
import { type Arm, type Metric, median, ROWS, type Row } from "./rows.ts";

interface Options {
	rows: Row[];
	arms: Arm[];
	rounds: number;
	aa: boolean;
	out: string;
}

const BANDS = join(repoRoot, "bench", "loop", "bands.json");
const SEEDS = join(tmpdir(), "spool-loop-seeds");

function parseArgs(argv: readonly string[]): Options {
	let rowNames: string[] = [];
	let arms: Arm[] = [];
	let rounds = 2;
	let aa = false;
	let out = "";
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--rows" && next !== undefined) {
			rowNames = next.split(",");
			i++;
		} else if (arg === "--arms" && next !== undefined) {
			arms = next.split(",").map(parseArm);
			i++;
		} else if (arg === "--rounds" && next !== undefined) {
			rounds = Number(next);
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else if (arg === "--aa") {
			aa = true;
		} else {
			throw new Error(`unknown option ${arg}`);
		}
	}
	const rows = rowNames.includes("all") ? ROWS : rowNames.map(findRow);
	if (rows.length === 0) throw new Error(`--rows takes some of: all, ${ROWS.map((row) => row.id).join(", ")}`);
	if (arms.length === 0) throw new Error("--arms takes label=<checkout>[+experiment...], comma-separated");
	if (new Set(arms.map((arm) => arm.label)).size !== arms.length) throw new Error("--arms needs distinct labels");
	if (!Number.isInteger(rounds) || rounds < 1 || rounds % arms.length !== 0) {
		throw new Error(
			`--rounds ${rounds} must be a positive multiple of the ${arms.length} arms, so the order is balanced`,
		);
	}
	if (aa && arms.length !== 2) throw new Error("--aa compares exactly two arms of one commit");
	if (out === "") out = join(mkdtempSync(join(tmpdir(), "spool-loop-")), "runs.jsonl");
	return { rows, arms, rounds, aa, out };
}

function findRow(id: string): Row {
	const row = ROWS.find((each) => each.id === id);
	if (row === undefined) throw new Error(`no row "${id}"; rows are ${ROWS.map((each) => each.id).join(", ")}`);
	return row;
}

function parseArm(spec: string): Arm {
	const at = spec.indexOf("=");
	if (at <= 0) throw new Error(`an arm is label=<checkout>[+experiment...], got "${spec}"`);
	const [checkout = "", ...experiments] = spec.slice(at + 1).split("+");
	const root = resolve(checkout);
	if (!existsSync(join(root, "dist", "cli.js"))) throw new Error(`${root} has no dist/cli.js: build it first`);
	return { label: spec.slice(0, at), checkout: root, experiments };
}

const commitOf = (checkout: string): Promise<string> =>
	new Promise((done) => {
		const git = spawn("git", ["-C", checkout, "rev-parse", "--short=12", "HEAD"]);
		let text = "";
		git.stdout.on("data", (chunk) => {
			text += chunk;
		});
		// a copy made without its repo (on the m1) names its commit in .loop-commit
		git.once("exit", () => {
			const marker = join(checkout, ".loop-commit");
			done(text.trim() || (existsSync(marker) ? readFileSync(marker, "utf8").trim() : "unknown"));
		});
	});

/**
 * One bench process for one arm. On Linux it runs headed under Xvfb, one timed
 * run on the machine at a time (`flock`), as program.md says; elsewhere it is
 * the desktop session's.
 */
function runBench(row: Row, arm: Arm, commit: string, out: string): Promise<{ code: number; log: string }> {
	const bench = row.bench;
	if (typeof bench !== "string") throw new Error("not a process row");
	const args = [join(repoRoot, "bench", bench), ...row.args(), "--out", out];
	const env = {
		...process.env,
		SPOOL_BENCH_BUILD: arm.checkout,
		SPOOL_BENCH_EXPERIMENTS: arm.experiments.join(","),
		SPOOL_BENCH_SEED: join(SEEDS, `${commit}${arm.experiments.map((name) => `+${name}`).join("")}`, row.subject),
	};
	let command = process.execPath;
	let argv = args;
	if (platform() === "linux") {
		command = "flock";
		argv = ["/tmp/spool-loop-218.lock", "xvfb-run", "-a", "-s", "-screen 0 1920x1080x24", process.execPath, ...args];
	}
	return new Promise((done, fail) => {
		const child = spawn(command, argv, { env, cwd: repoRoot });
		let log = "";
		const keep = (chunk: Buffer): void => {
			log = (log + chunk.toString()).slice(-20_000);
		};
		child.stdout.on("data", keep);
		child.stderr.on("data", keep);
		const timer = setTimeout(() => child.kill("SIGTERM"), row.timeoutMs);
		child.once("error", fail);
		child.once("exit", (code) => {
			clearTimeout(timer);
			done({ code: code ?? -1, log });
		});
	});
}

interface Run {
	row: string;
	arm: string;
	commit: string;
	experiments: string[];
	round: number;
	load: number;
	at: string;
	metrics: Record<string, number>;
	error?: string;
}

async function measure(row: Row, arm: Arm, commit: string, round: number): Promise<Run> {
	const load = loadavg()[0] ?? Number.NaN;
	const at = new Date().toISOString();
	const base = { row: row.id, arm: arm.label, commit, experiments: arm.experiments, round, load, at };
	if (typeof row.bench === "function") return { ...base, metrics: await row.bench(arm) };
	const dir = mkdtempSync(join(tmpdir(), "spool-loop-run-"));
	const out = join(dir, "out.json");
	try {
		const { code, log } = await runBench(row, arm, commit, out);
		if (code !== 0 || !existsSync(out)) {
			return { ...base, metrics: {}, error: `exit ${code}: ${log.split("\n").slice(-12).join("\n")}` };
		}
		return { ...base, metrics: row.extract(JSON.parse(readFileSync(out, "utf8")), log) };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const fmt = (value: number): string =>
	!Number.isFinite(value)
		? "-"
		: Math.abs(value) >= 100
			? value.toFixed(0)
			: value.toFixed(Math.abs(value) >= 10 ? 1 : 2);

function readBands(): Record<string, number> {
	return existsSync(BANDS) ? (JSON.parse(readFileSync(BANDS, "utf8")) as Record<string, number>) : {};
}

function report(options: Options, runs: readonly Run[]): string {
	const bands = readBands();
	const lines: string[] = [];
	const loads = runs.map((run) => run.load);
	lines.push(
		`arms: ${options.arms.map((arm) => `${arm.label}=${arm.checkout}${arm.experiments.map((name) => `+${name}`).join("")} (${runs.find((run) => run.arm === arm.label)?.commit ?? "?"})`).join(", ")}`,
		`${options.rounds} rounds, order rotated; one-minute load ${fmt(Math.min(...loads))} to ${fmt(Math.max(...loads))}`,
		"",
	);
	for (const row of options.rows) {
		const failed = runs.filter((run) => run.row === row.id && run.error !== undefined);
		for (const run of failed) lines.push(`${row.id} ${run.arm} round ${run.round + 1} FAILED: ${run.error}`);
		for (const metric of row.metrics) {
			const key = `${row.id}.${metric.key}`;
			const per = options.arms.map((arm) =>
				runs
					.filter((run) => run.row === row.id && run.arm === arm.label)
					.map((run) => run.metrics[metric.key])
					.filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
			);
			const medians = per.map(median);
			const cells = options.arms.map(
				(arm, index) =>
					`${arm.label} ${fmt(medians[index] as number)} [${fmt(Math.min(...(per[index] as number[])))}..${fmt(Math.max(...(per[index] as number[])))}]`,
			);
			let verdict = "";
			if (options.aa) {
				const gap = Math.abs((medians[0] as number) - (medians[1] as number));
				const spread = Math.max(...per.map((values) => Math.max(...values) - Math.min(...values)));
				verdict = `A/A gap ${fmt(gap)}, spread within an arm ${fmt(spread)}`;
			} else {
				const band = bands[key];
				verdict = medians
					.slice(1)
					.map((value, index) => {
						const delta = value - (medians[0] as number);
						const label = options.arms[index + 1]?.label;
						if (band === undefined) return `${label} ${delta >= 0 ? "+" : ""}${fmt(delta)} (no band yet)`;
						const beyond = Math.abs(delta) > band;
						const better = metric.better === "lower" ? delta < 0 : delta > 0;
						return `${label} ${delta >= 0 ? "+" : ""}${fmt(delta)} vs band ${fmt(band)}: ${beyond ? (better ? "WIN" : "LOSS") : "noise"}`;
					})
					.join("; ");
			}
			lines.push(`${key.padEnd(34)} ${metric.unit.padEnd(5)} ${cells.join("  ")}  ${verdict}`);
		}
	}
	return lines.join("\n");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	mkdirSync(SEEDS, { recursive: true });
	const commits = await Promise.all(options.arms.map((arm) => commitOf(arm.checkout)));
	const runs: Run[] = [];
	process.stderr.write(`loop: runs to ${options.out}\n`);
	for (let round = 0; round < options.rounds; round++) {
		for (const row of options.rows) {
			for (let turn = 0; turn < options.arms.length; turn++) {
				const index = (turn + round) % options.arms.length;
				const arm = options.arms[index] as Arm;
				process.stderr.write(`loop: round ${round + 1}/${options.rounds}, ${row.id}, ${arm.label}\n`);
				const run = await measure(row, arm, commits[index] as string, round);
				runs.push(run);
				appendFileSync(options.out, `${JSON.stringify(run)}\n`);
				if (run.error !== undefined) process.stderr.write(`loop: ${row.id} ${arm.label} failed\n${run.error}\n`);
			}
		}
	}
	process.stdout.write(`${report(options, runs)}\n`);
}

export type { Metric };

if (import.meta.url === `file://${process.argv[1]}`) await main();
