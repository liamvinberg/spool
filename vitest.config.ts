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
const heavy = /(-browser|-native|\/bundled-[^/]+|\/cli|\/installed-engine)\.test\.ts$/;

class HeavyFirstSequencer extends BaseSequencer {
	override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
		const sorted = await super.sort(files);
		return [
			...sorted.filter((file) => heavy.test(file.moduleId)),
			...sorted.filter((file) => !heavy.test(file.moduleId)),
		];
	}
}

export default defineConfig({
	resolve: {
		alias: pins,
	},
	test: {
		include: ["src/**/*.test.ts", ".github/scripts/*.test.ts", ".agents/skills/*/scripts/*.test.ts"],
		setupFiles: ["./src/test-setup.ts"],
		globalSetup: ["./src/test-global-setup.ts"],
		// The checked-out revision owns this selection, including release recovery.
		...(process.env.SPOOL_TEST_DARWIN === "1" ? { testNamePattern: "macOS only" } : {}),
		// Measured on an 8-core M1 (2026-09-09, heavy subset): 2 workers 973s, 3 workers 812s,
		// 4 workers 760s with load failures. Each browser case runs a daemon, esbuild and a
		// Chromium, so the suite is CPU-bound by the third worker; more only adds flakes.
		// The 4-vCPU CI runners resolve to the same number. `--maxWorkers` still overrides.
		maxWorkers: 3,
		// Keep one CI retry for process/browser scheduling noise; local failures remain visible.
		retry: process.env.CI === undefined ? 0 : 1,
		sequence: { sequencer: HeavyFirstSequencer },
	},
});
