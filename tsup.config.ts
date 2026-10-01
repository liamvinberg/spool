import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";
import { esbuildLicenses } from "./src/bundle-licenses";
import { buildBundledOAuth } from "./src/daemon/bundled-oauth-build";

// no clean flag: array configs build in parallel, and one config's clean
// would race the other's write — the build script clears dist/ up front
const licenses = esbuildLicenses();

export default defineConfig([
	{
		entry: {
			cli: "src/cli.ts",
			"bundled-host": "src/daemon/bundled-host.ts",
			"bundled-command-process": "src/daemon/bundled-command-process.ts",
		},
		format: "esm",
		target: "node22",
		esbuildPlugins: [licenses],
		onSuccess: async () => {
			const renderer = fileURLToPath(new URL("./src/daemon/bundled-oauth-page.ts", import.meta.url));
			await writeFile("dist/bundled-oauth-native.js", await buildBundledOAuth(renderer));
			// pi reads its name, version and config directory from its package.json
			// as it loads; agent-engine-spool points the host at this copy.
			const pi = JSON.parse(
				await readFile(new URL("../package.json", import.meta.resolve("@earendil-works/pi-coding-agent")), "utf8"),
			);
			await mkdir("dist/pi", { recursive: true });
			await writeFile(
				"dist/pi/package.json",
				`${JSON.stringify({ name: pi.name, version: pi.version, piConfig: pi.piConfig }, null, "\t")}\n`,
			);
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
		define: { __SPOOL_PUBLICATION_BUILD__: "false" },
		external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
		noExternal: ["zod", "motion"],
		esbuildPlugins: [licenses],
	},
	{
		entry: { "publication-runtime": "src/runtime/frame-runtime.ts" },
		format: "esm",
		platform: "browser",
		splitting: false,
		target: "es2022",
		tsconfig: "tsconfig.runtime.json",
		minify: true,
		define: { __SPOOL_PUBLICATION_BUILD__: "true" },
		external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
		esbuildPlugins: [licenses],
	},
]);
