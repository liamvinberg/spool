import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { observeReactValues } from "./source-react";

/**
 * The one pinned React (#16): a single ESM bundle covering react, react-dom,
 * react-dom/client and react/jsx-runtime, every specifier mapped to the same
 * URL — one fetch, one instance per frame realm by construction. React's CJS
 * entries hide named exports behind conditional re-exports esbuild cannot lift
 * statically, so the real exports are enumerated in node and emitted as a
 * facade (the pattern validated in spikes/live-frames).
 */

export const REACT_SPECIFIERS = ["react", "react-dom", "react-dom/client", "react/jsx-runtime"] as const;

export const VENDOR_REACT_URL = "/vendor/react.js";

export const VENDOR_SPOOL_URL = "/vendor/spool.js";

export const VENDOR_SPOOL_JSX_URL = "/vendor/spool-jsx.js";

export const reactVersion: string = (createRequire(import.meta.url)("react/package.json") as { version: string })
	.version;

/** Spool's import map pins: the pinned React and the flow runtime always win. */
export function importMapPins(): Record<string, string> {
	return {
		...Object.fromEntries(REACT_SPECIFIERS.map((spec) => [spec, VENDOR_REACT_URL])),
		spool: VENDOR_SPOOL_URL,
		// the stamping JSX runtime the compiler injects (#23) — not agent surface
		"spool/jsx-dev-runtime": VENDOR_SPOOL_JSX_URL,
	};
}

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
	// Committed source reads use this renderer's host-props/alternate contract.
	// Upgrading React requires replaying retained state, memo and native-input tests.
	const renderer = join(
		dirname(fileURLToPath(import.meta.resolve("react-dom/client"))),
		"cjs/react-dom-client.production.js",
	);
	if (
		createHash("sha256").update(readFileSync(renderer)).digest("hex") !==
		"9d2de2ee4a588c5d0b8580ff3467f796b8d9bbc45bdc35b257f7d1380e686c56"
	) {
		throw new Error("the pinned React renderer changed; source observation requires revalidation");
	}
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
		plugins: [
			{
				name: "spool-committed-renderer",
				setup(build) {
					build.onLoad({ filter: /[/\\]react\.production\.js$/ }, ({ path }) => ({
						contents: observeReactValues(readFileSync(path, "utf8")),
						loader: "js",
					}));
					build.onLoad({ filter: /react-dom-client\.production\.js$/ }, ({ path }) => {
						let contents = readFileSync(path, "utf8");
						const replace = (before: string, after: string) => {
							if (contents.split(before).length !== 2)
								throw new Error("pinned renderer observation anchor changed");
							contents = contents.replace(before, after);
						};
						replace(
							"nextRenderLanes = Component(props, secondArg);",
							"nextRenderLanes = globalThis.__SPOOL_REACT__ ? globalThis.__SPOOL_REACT__.invoke(Component, () => globalThis.__SPOOL_RECONCILE__.invoke(workInProgress, props, () => Component(props, secondArg))) : Component(props, secondArg);",
						);
						replace(
							"children = Component(props, secondArg);",
							"children = globalThis.__SPOOL_REACT__ ? globalThis.__SPOOL_REACT__.invoke(Component, () => globalThis.__SPOOL_RECONCILE__.invoke(workInProgress, props, () => Component(props, secondArg))) : Component(props, secondArg);",
						);
						replace(
							": context.render()),",
							": (globalThis.__SPOOL_REACT__ ? globalThis.__SPOOL_REACT__.invoke(context, () => context.render()) : context.render())),",
						);
						replace(
							"root.current = finishedWork;",
							"root.current = finishedWork; globalThis.__SPOOL_REACT__?.commit(finishedWork); globalThis.__SPOOL_OBSERVER__?.commit(finishedWork);",
						);

						replace(
							"function coerceRef(workInProgress, element) {",
							"function coerceRef(workInProgress, element) { globalThis.__SPOOL_RECONCILE__?.bind(workInProgress, element);",
						);
						replace(
							"  return workInProgress;\n}\nfunction resetWorkInProgress",
							"  globalThis.__SPOOL_RECONCILE__?.copy(current, workInProgress); globalThis.__SPOOL_CONSUMED__?.copyFiber(current, workInProgress); return workInProgress;\n}\nfunction resetWorkInProgress",
						);
						replace(
							"  return workInProgress;\n}\nfunction createFiberFromTypeAndProps",
							"  globalThis.__SPOOL_RECONCILE__?.copy(current, workInProgress); globalThis.__SPOOL_CONSUMED__?.copyFiber(current, workInProgress); return workInProgress;\n}\nfunction createFiberFromTypeAndProps",
						);
						replace(
							"current = resolveLazy(workInProgress.elementType);",
							"current = resolveLazy(workInProgress.elementType); globalThis.__SPOOL_CONSUMED__?.bind(workInProgress);",
						);
						return { contents, loader: "js" };
					});
				},
			},
		],
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

export const vendorSpoolJsxJs: () => Promise<VendorModule> = lazyBuild(() => vendorRuntime("jsx-dev-runtime"));

export const vendorPlayerShellJs: () => Promise<VendorModule> = lazyBuild(() => vendorRuntime("player-shell-runtime"));

async function vendorRuntime(
	name: "frame-runtime" | "player-shell-runtime" | "jsx-dev-runtime",
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
	const source = name === "player-shell-runtime" ? `${name}.tsx` : `${name}.ts`;
	const result = await build({
		entryPoints: [fileURLToPath(new URL(`../runtime/${source}`, import.meta.url))],
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		jsx: "automatic",
		external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
		define: { "process.env.NODE_ENV": '"production"' },
		write: false,
		logLevel: "silent",
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error(`${name} bundle produced no output`);
	return js;
}
