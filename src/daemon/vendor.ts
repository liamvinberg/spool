import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { REACT_SPECIFIERS } from "./vendor-pins";

/**
 * The one pinned React (#16): a single ESM bundle covering react, react-dom,
 * react-dom/client and react/jsx-runtime, every specifier mapped to the same
 * URL — one fetch, one instance per frame realm by construction. React's CJS
 * entries hide named exports behind conditional re-exports esbuild cannot lift
 * statically, so the real exports are enumerated in node and emitted as a
 * facade (the pattern validated in spikes/live-frames).
 */

export {
	importMapPins,
	REACT_SPECIFIERS,
	VENDOR_REACT_URL,
	VENDOR_SPOOL_JSX_URL,
	VENDOR_SPOOL_URL,
} from "./vendor-pins";

export const reactVersion: string = (createRequire(import.meta.url)("react/package.json") as { version: string })
	.version;

/**
 * Memoize a vendor build. Same rule as the frame compiler: failures are never
 * cached — a transient build error must not poison the URL until restart.
 */
function lazyBuild<T>(builder: () => Promise<T>): () => Promise<T> {
	let memo: Promise<T> | undefined;
	return () => {
		if (memo === undefined) {
			const attempt = builder();
			attempt.catch(() => {
				if (memo === attempt) memo = undefined;
			});
			memo = attempt;
		}
		return memo;
	};
}

export const vendorReactJs: () => Promise<string> = lazyBuild(buildVendorReact);

async function buildVendorReact(): Promise<string> {
	const seen = new Set<string>(["default"]);
	const lines: string[] = [];
	for (const [i, spec] of REACT_SPECIFIERS.entries()) {
		const mod = (await import(spec)) as Record<string, unknown>;
		const resolved = fileURLToPath(import.meta.resolve(spec));
		lines.push(`import m${i} from ${JSON.stringify(resolved)};`);
		if (i === 0) lines.push("export default m0;");
		for (const name of Object.keys(mod)) {
			if (seen.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
			seen.add(name);
			lines.push(`export const ${name} = m${i}[${JSON.stringify(name)}];`);
		}
	}
	const result = await build({
		stdin: { contents: lines.join("\n"), resolveDir: dirname(fileURLToPath(import.meta.url)), loader: "js" },
		bundle: true,
		format: "esm",
		platform: "browser",
		minify: true,
		define: { "process.env.NODE_ENV": '"production"' },
		write: false,
		logLevel: "silent",
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error("vendor react bundle produced no output");
	return js;
}

/**
 * The runtime modules frames import: the flow runtime (#5) at
 * /vendor/spool.js and the stamping JSX runtime (#23) at /vendor/spool-jsx.js,
 * react left external for the import map. The installed package reads
 * prebuilt dist modules (tsup entries next to cli.js); a checkout (tsx,
 * vitest) has no prebuilt files next to this module and compiles
 * src/runtime/*.ts on demand, so dev always serves fresh source.
 */

export interface VendorModule {
	js: string;
	etag: string;
}

export const vendorSpoolJs: () => Promise<VendorModule> = lazyBuild(() => vendorRuntime("frame-runtime"));

export const vendorPublicationJs: () => Promise<VendorModule> = lazyBuild(() => vendorRuntime("publication-runtime"));

export const vendorSpoolJsxJs: () => Promise<VendorModule> = lazyBuild(() => vendorRuntime("jsx-dev-runtime"));

export const vendorPlayerShellJs: () => Promise<VendorModule> = lazyBuild(() => vendorRuntime("player-shell-runtime"));

async function vendorRuntime(
	name: "frame-runtime" | "player-shell-runtime" | "jsx-dev-runtime" | "publication-runtime",
): Promise<VendorModule> {
	const js = await runtimeJs(name);
	return { js, etag: `"spool-${createHash("sha256").update(js).digest("hex").slice(0, 32)}"` };
}

async function runtimeJs(name: string): Promise<string> {
	try {
		return readFileSync(new URL(`./${name}.js`, import.meta.url), "utf8");
	} catch {
		// no prebuilt module next to this file: running from source
	}
	const source =
		name === "publication-runtime"
			? "frame-runtime.ts"
			: name === "player-shell-runtime"
				? `${name}.tsx`
				: `${name}.ts`;
	const result = await build({
		entryPoints: [fileURLToPath(new URL(`../runtime/${source}`, import.meta.url))],
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		jsx: "automatic",
		external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
		define: {
			"process.env.NODE_ENV": '"production"',
			__SPOOL_PUBLICATION_BUILD__: name === "publication-runtime" ? "true" : "false",
		},
		minify: name === "publication-runtime",
		legalComments: "none",
		write: false,
		logLevel: "silent",
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error(`${name} bundle produced no output`);
	return js;
}
