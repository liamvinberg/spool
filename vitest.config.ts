import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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

export default defineConfig({
	resolve: {
		alias: pins,
	},
	test: {
		include: ["src/**/*.test.ts"],
		/**
		 * One retry on CI, and none here.
		 *
		 * This suite spends most of its time waiting on things it started — daemons,
		 * headless browsers, worker processes, filesystem watchers — and it runs 150 files
		 * at once to stay under fifteen minutes. Those two facts together mean a test can
		 * lose its slot long enough to run past a wait, and which test that happens to is
		 * scheduling noise: a full run flakes roughly one time in three, on a different
		 * test each time, every one of which passes on its own. A retry answers exactly
		 * that and nothing else, because a test that is actually broken fails twice.
		 *
		 * It is off locally on purpose. A flake in front of a person is information, and
		 * this is where it should be paid attention to rather than smoothed over; the
		 * tight budget it exposes is worth fixing at the source, the way `reachForPill`
		 * and the machine-state waits were.
		 */
		retry: process.env.CI === undefined ? 0 : 1,
	},
});
