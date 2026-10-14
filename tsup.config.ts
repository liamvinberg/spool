import { resolve } from "node:path";
import type { Plugin } from "esbuild";
import { defineConfig } from "tsup";
import { esbuildLicenses } from "./src/bundle-licenses";
import { buildFrameShims } from "./src/frame-shim-build";
import { buildVendorEntry } from "./src/vendor-entry-build";

// no clean flag: array configs build in parallel, and one config's clean
// would race the other's write — the build script clears dist/ up front
const licenses = esbuildLicenses();

// The frame shims, built once from src/runtime/frame-shim and baked into both builds that carry them in place of
// daemon/frame-shims.ts, which builds them from source in a checkout: the CLI and spool.page/compile inline the same
// bytes, and neither carries esbuild for it.
let shims: string | undefined;
const frameShims: Plugin = {
	name: "frame-shims",
	setup(build) {
		build.onResolve({ filter: /^\.\/frame-shims$/ }, () => ({ path: "frame-shims", namespace: "frame-shims" }));
		build.onLoad({ filter: /.*/, namespace: "frame-shims" }, () => {
			shims ??= JSON.stringify(buildFrameShims(resolve("src/runtime/frame-shim")));
			return { contents: `const shims = ${shims};\nexport function frameShims() { return shims; }\n`, loader: "js" };
		});
	},
};

export default defineConfig([
	{
		entry: {
			cli: "src/cli.ts",
			"tailwind-worker": "src/daemon/tailwind-worker.ts",
		},
		format: "esm",
		target: "node22",
		// A package belongs in `dependencies` only when something needs its files at
		// runtime: a native binary, wasm, vendor files, or a path spool or an agent
		// resolves. Every other package is bundled here. Bundled CommonJS calls
		// require for node builtins and reads __dirname, which an ES module has to
		// be given; __dirname then means dist/, so a package that reads files beside
		// its own code belongs in `dependencies`.
		banner: {
			js: 'import { createRequire as __spoolCreateRequire } from "node:module"; const require = __spoolCreateRequire(import.meta.url);',
		},
		shims: true,
		// Bundled code asks for builtins that only exist under node:, like node:sqlite.
		removeNodeProtocol: false,
		esbuildPlugins: [licenses, frameShims],
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
		esbuildPlugins: [licenses],
		// spool.page/vendor: the same modules, with the pinned React, for a host that is not the daemon
		onSuccess: () => buildVendorEntry("dist"),
	},
	{
		// spool.page/compile (src/compile-entry.ts): core's compile, as a Cloudflare
		// Worker imports it. Built on its own, with nothing of the CLI's bundle (its
		// require banner, its shims) riding along, so importing it runs nothing;
		// tailwindcss stays a dependency and node builtins are the Worker's.
		entry: { compile: "src/compile-entry.ts" },
		format: "esm",
		platform: "neutral",
		target: "es2022",
		splitting: false,
		external: [/^node:/],
		removeNodeProtocol: false,
		esbuildPlugins: [licenses, frameShims],
	},
	{
		// spool.page/sync-protocol (src/team-sync-protocol.ts): the sync protocol, which spool-cloud's sync object
		// imports rather than keeping a copy. It imports nothing, so it runs anywhere.
		entry: { "sync-protocol": "src/team-sync-protocol.ts" },
		format: "esm",
		platform: "neutral",
		target: "es2022",
		splitting: false,
	},
]);
