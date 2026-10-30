import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * CI splits the suite over its test runners by how long each file took on the
 * last main run, so the runners finish together rather than whenever a hash
 * happened to stack the long files on one. The `changes` job reads the last
 * run's reports once (`durations` below) and hands the same table to every
 * shard, and each shard deals the same files the same way from it.
 */

/** Seconds per test file, by its path from the repository root. */
export type Durations = Readonly<Record<string, number>>;

/**
 * A file costs its run time plus what the report leaves out: starting its
 * environment and importing it, about a second and a half on a CI runner
 * (each shard's three workers spent that much per file beyond the files' own
 * times, measured on run 41028676134).
 */
const PER_FILE = 1.5;

/**
 * A file the table doesn't know yet, new since that run or every file when
 * there is no table, is guessed from what files of its kind took on run
 * 41028676134: one that boots a daemon, a browser or the CLI 16 s on average,
 * any other 2.4 s.
 */
const heavy = /(-browser|-native|\/cli(?:-[^/]+)?)\.test\.ts$/;
const GUESS_HEAVY = 16.4;
const GUESS_OTHER = 2.4;

export function fileWeight(path: string, durations: Durations): number {
	const known = durations[path];
	return PER_FILE + (known ?? (heavy.test(path) ? GUESS_HEAVY : GUESS_OTHER));
}

/**
 * Longest first, each to the shard with least so far: the same files and table
 * give every shard the same answer, ties settled by path rather than by the
 * order the files were found in.
 */
export function assignShards(paths: readonly string[], durations: Durations, count: number): string[][] {
	if (!Number.isInteger(count) || count < 1) throw new Error(`A shard count must be a whole number, not ${count}.`);
	const shards = Array.from({ length: count }, () => ({ files: [] as string[], load: 0 }));
	const files = [...new Set(paths)]
		.map((path) => ({ path, weight: fileWeight(path, durations) }))
		.sort((a, b) => b.weight - a.weight || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	for (const file of files) {
		let least = shards[0];
		for (const shard of shards) if (least === undefined || shard.load < least.load) least = shard;
		if (least === undefined) break;
		least.files.push(file.path);
		least.load += file.weight;
	}
	return shards.map((shard) => shard.files);
}

/** Reads a table handed over as JSON; anything else is no table. */
export function parseDurations(json: string | undefined): Durations {
	if (json === undefined || json.trim() === "") return {};
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
		);
	} catch {
		return {};
	}
}

interface JsonReport {
	testResults?: { name: string; startTime: number; endTime: number }[];
}

/**
 * One table from the shards' Vitest JSON reports. A report names files by the
 * absolute path on the runner that wrote it; the table keeps them from the
 * repository root, so it reads the same on any machine.
 */
export function mergeReports(reports: readonly JsonReport[], root: string): Record<string, number> {
	const durations: Record<string, number> = {};
	for (const report of reports) {
		for (const file of report.testResults ?? []) {
			const path = repositoryPath(file.name, root);
			const seconds = (file.endTime - file.startTime) / 1000;
			if (path !== null && Number.isFinite(seconds) && seconds >= 0) durations[path] = Math.round(seconds * 10) / 10;
		}
	}
	return Object.fromEntries(Object.entries(durations).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function repositoryPath(name: string, root: string): string | null {
	const normalized = name.replaceAll("\\", "/");
	const fromRoot = relative(root, normalized).replaceAll("\\", "/");
	if (!fromRoot.startsWith("..") && !fromRoot.startsWith("/")) return fromRoot;
	// Written on another checkout path: the test roots are where the repository begins.
	const match = /\/((?:src|\.github|\.agents)\/.*)$/.exec(normalized);
	return match?.[1] ?? null;
}

/**
 * The newest finished main run's reports, merged, or none: a run that left no
 * reports, an expired artifact or a failed lookup leaves the shards to guess.
 */
function lastMainDurations(repository: string): Record<string, number> {
	const gh = (...args: string[]) =>
		execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
	const runs = JSON.parse(
		gh(
			"api",
			`repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=10`,
			"--jq",
			"[.workflow_runs[].id]",
		),
	) as number[];
	for (const run of runs) {
		const dir = mkdtempSync(join(tmpdir(), "spool-test-durations-"));
		try {
			gh("run", "download", String(run), "--repo", repository, "--pattern", "tests-*", "--dir", dir);
			const reports = readdirSync(dir)
				.map((shard) => join(dir, shard, "tests.json"))
				.filter((path) => existsSync(path))
				.map((path) => JSON.parse(readFileSync(path, "utf8")) as JsonReport);
			const durations = mergeReports(reports, process.cwd());
			if (Object.keys(durations).length > 0) {
				console.log(`Test durations from run ${run}: ${Object.keys(durations).length} files.`);
				return durations;
			}
		} catch (error) {
			console.log(
				`No test reports from run ${run}: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}
	console.log("No recent main run left test reports; the shards guess from file names.");
	return {};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	let durations: Record<string, number> = {};
	try {
		durations = lastMainDurations(process.env.GITHUB_REPOSITORY ?? "");
	} catch (error) {
		console.log(`Test durations lookup failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
	}
	appendFileSync(process.env.GITHUB_OUTPUT ?? "", `durations=${JSON.stringify(durations)}\n`);
}
