import { availableParallelism, loadavg } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

/**
 * These aliases are the import map pins from daemon/vendor.ts, mirrored:
 * runtime behavior tests execute really-served boot modules from temp files,
 * and their bare imports must land exactly where a browser's import map
 * would send them — "spool" on the served runtime source, react on the one
 * pinned React.
 */
const pins = [
	{ find: /^spool$/, replacement: fileURLToPath(new URL("./src/runtime/frame-runtime.ts", import.meta.url)) },
	{
		find: /^spool\/jsx-dev-runtime$/,
		replacement: fileURLToPath(new URL("./src/runtime/jsx-dev-runtime.ts", import.meta.url)),
	},
	{ find: /^react$/, replacement: fileURLToPath(import.meta.resolve("react")) },
	{ find: /^react-dom\/client$/, replacement: fileURLToPath(import.meta.resolve("react-dom/client")) },
	{ find: /^react\/jsx-runtime$/, replacement: fileURLToPath(import.meta.resolve("react/jsx-runtime")) },
];

/**
 * The suites that boot a daemon, a Chromium, or a child process. They carry
 * most of the run and are scheduled first so the tail is unit files, not a
 * browser suite starting after the rest have finished. Within each group the
 * base order stands: longest first from the local cache, largest first without.
 */
const heavy = /(-browser|-native|\/bundled-[^/]+|\/cli(?:-[^/]+)?|\/installed-engine)\.test\.ts$/;

class HeavyFirstSequencer extends BaseSequencer {
	override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
		const sorted = await super.sort(files);
		return [
			...sorted.filter((file) => heavy.test(file.moduleId)),
			...sorted.filter((file) => !heavy.test(file.moduleId)),
		];
	}
}

/**
 * How many test files run at once. Each browser case runs a daemon, esbuild and
 * a Chromium, so a worker is worth about CORES_PER_WORKER cores, and the cores
 * other work already holds (the 1-minute load average) are not there to have:
 * a machine shared with other runs gets fewer workers, not slower ones. Never
 * fewer than the 3 measured on an 8-core M1 (2026-09-09, heavy subset: 2 workers
 * 973s, 3 workers 812s, 4 workers 760s with load failures), which is also what
 * the 4-vCPU CI runners get. Never more than 8: on a shared 22-thread Linux box
 * (2026-10-08), 7 workers ran the suite in 531s against 1204s for 3, while 12
 * ran no faster than 8 and failed several times as many timing-bound cases.
 * SPOOL_TEST_WORKERS sets it outright, and `--maxWorkers` still overrides both.
 */
const CORES_PER_WORKER = 2.5;
const MIN_WORKERS = 3;
const MAX_WORKERS = 8;

function testWorkers(): number {
	const set = process.env.SPOOL_TEST_WORKERS;
	if (set !== undefined && set !== "") {
		const workers = Number(set);
		if (!Number.isInteger(workers) || workers < 1)
			throw new Error(`SPOOL_TEST_WORKERS must be a whole number, not "${set}"`);
		return workers;
	}
	const free = availableParallelism() - (loadavg()[0] ?? 0);
	return Math.min(MAX_WORKERS, Math.max(MIN_WORKERS, Math.floor(free / CORES_PER_WORKER)));
}

export default defineConfig({
	define: { __SPOOL_PUBLICATION_BUILD__: "false" },
	resolve: {
		alias: pins,
	},
	test: {
		include: ["src/**/*.test.ts", ".github/scripts/*.test.ts", ".agents/skills/*/scripts/*.test.ts"],
		setupFiles: ["./src/test-setup.ts"],
		globalSetup: ["./src/test-global-setup.ts"],
		// The checked-out revision owns this selection, including release recovery.
		...(process.env.SPOOL_TEST_DARWIN === "1" ? { testNamePattern: "macOS only" } : {}),
		maxWorkers: testWorkers(),
		// A hang guard, not a measure: no case is judged by its timeout, and the 5 s
		// default reads a shared, loaded machine as a failure (a TypeScript check or
		// a website build is a second or two alone, five on a busy devobee). A case
		// that needs longer names its own.
		testTimeout: 30_000,
		// Keep one CI retry for process/browser scheduling noise; local failures remain visible.
		retry: process.env.CI === undefined ? 0 : 1,
		sequence: { sequencer: HeavyFirstSequencer },
	},
});
