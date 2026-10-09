import { defineConfig } from "tsup";
import { esbuildLicenses } from "./src/bundle-licenses";
import { collapsedWords } from "./src/daemon/edit-words";
import { tagWord, wholeComponent } from "./src/daemon/element-name";
import { buildVendorEntry } from "./src/vendor-entry-build";

// no clean flag: array configs build in parallel, and one config's clean
// would race the other's write — the build script clears dist/ up front
const licenses = esbuildLicenses();

// The canvas shim's helpers as source, printed once here and baked into both builds that carry the shim (the
// CLI's and spool.page/compile), so the daemon and a Worker that bundles the compile again embed the same bytes
// (src/daemon/document.ts).
const shimHelpers = {
	__SPOOL_SHIM_HELPERS__: JSON.stringify({
		wholeComponent: String(wholeComponent),
		tagWord: String(tagWord),
		collapsedWords: String(collapsedWords),
	}),
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
		define: shimHelpers,
		esbuildPlugins: [licenses],
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
		define: shimHelpers,
		esbuildPlugins: [licenses],
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
	{
		entry: { "publication-runtime": "src/runtime/frame-runtime.ts" },
		format: "esm",
		platform: "browser",
		splitting: false,
		target: "es2022",
		tsconfig: "tsconfig.runtime.json",
		minify: true,
		define: { __SPOOL_PUBLICATION_BUILD__: "true" },
		// Published pages have always imported motion through the project's import
		// map; bundled, it would drop out unused and change what they load.
		external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "motion", "motion/react"],
		esbuildPlugins: [licenses],
	},
]);
