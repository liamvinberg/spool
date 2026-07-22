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
	},
});
