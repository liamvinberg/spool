import { defineConfig } from "tsup";

// no clean flag: array configs build in parallel, and one config's clean
// would race the other's write — the build script clears dist/ up front
export default defineConfig([
	{
		entry: ["src/cli.ts"],
		format: "esm",
		target: "node22",
	},
	{
		// the flow runtime the daemon serves at /vendor/spool.js: browser ESM,
		// react left external for the import map pin (see daemon/vendor.ts)
		entry: { "frame-runtime": "src/runtime/frame-runtime.ts" },
		format: "esm",
		platform: "browser",
		target: "es2022",
		external: ["react"],
	},
]);
