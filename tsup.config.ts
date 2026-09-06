import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";
import { buildBundledOAuth } from "./src/daemon/bundled-oauth-build";

// no clean flag: array configs build in parallel, and one config's clean
// would race the other's write — the build script clears dist/ up front
export default defineConfig([
	{
		entry: { cli: "src/cli.ts", "bundled-host": "src/daemon/bundled-host.ts" },
		format: "esm",
		target: "node22",
		onSuccess: async () => {
			const renderer = fileURLToPath(new URL("./src/daemon/bundled-oauth-page.ts", import.meta.url));
			await writeFile("dist/bundled-oauth-native.js", await buildBundledOAuth(renderer));
		},
	},
	{
		// the runtimes the daemon serves at /vendor/spool.js and /vendor/spool-jsx.js:
		// browser ESM, react left external for the import map pins (see daemon/vendor.ts)
		entry: {
			"frame-runtime": "src/runtime/frame-runtime.ts",
			"player-shell-runtime": "src/runtime/player-shell-runtime.tsx",
			"jsx-dev-runtime": "src/runtime/jsx-dev-runtime.ts",
		},
		format: "esm",
		platform: "browser",
		splitting: false,
		target: "es2022",
		tsconfig: "tsconfig.runtime.json",
		external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
	},
]);
