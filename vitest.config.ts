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
		include: ["src/**/*.test.ts", ".github/scripts/*.test.ts", ".agents/skills/*/scripts/*.test.ts"],
		setupFiles: ["./src/test-setup.ts"],
		globalSetup: ["./src/test-global-setup.ts"],
		// The checked-out revision owns this selection, including release recovery.
		...(process.env.SPOOL_TEST_DARWIN === "1" ? { testNamePattern: "macOS only" } : {}),
		// Keep one CI retry for process/browser scheduling noise; local failures remain visible.
		retry: process.env.CI === undefined ? 0 : 1,
	},
});
