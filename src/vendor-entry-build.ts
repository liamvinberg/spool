import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { TAILWIND_STYLESHEETS } from "./daemon/tailwind";
import { VENDOR_REACT_URL, VENDOR_SPOOL_JSX_URL, VENDOR_SPOOL_URL, vendorReactJs } from "./daemon/vendor";

/**
 * `spool.page/vendor`: what a frame document needs besides itself, for anywhere
 * that serves one without the daemon. A frame's import map pins React and
 * Spool's runtimes to `/vendor/…` on the host that served it, and the daemon
 * builds and serves those modules itself; Spool Cloud serves these, the same
 * bytes. The compile is also handed Tailwind's own stylesheets, which are files
 * of the pinned `tailwindcss` that a Worker cannot read, so they ride here too.
 *
 * Written once at build, after the runtimes, as plain strings: a Worker imports
 * it with nothing to configure, and importing it runs nothing.
 */
export async function buildVendorEntry(dist: string): Promise<void> {
	const modules = {
		[VENDOR_REACT_URL]: await vendorReactJs(),
		[VENDOR_SPOOL_URL]: await readFile(join(dist, "frame-runtime.js"), "utf8"),
		[VENDOR_SPOOL_JSX_URL]: await readFile(join(dist, "jsx-dev-runtime.js"), "utf8"),
	};
	const tailwind = dirname(createRequire(import.meta.url).resolve("tailwindcss/index.css"));
	const stylesheets: Record<string, string> = {};
	for (const name of TAILWIND_STYLESHEETS) stylesheets[name] = await readFile(join(tailwind, name), "utf8");
	await writeFile(
		join(dist, "vendor.js"),
		`export const VENDOR_MODULES = ${JSON.stringify(modules)};\nexport const TAILWIND_SOURCES = ${JSON.stringify(stylesheets)};\n`,
	);
	await mkdir(join(dist, "types"), { recursive: true });
	await writeFile(
		join(dist, "types", "vendor.d.ts"),
		`/** Each module a frame's import map pins, by the path it is served at. */
export declare const VENDOR_MODULES: Readonly<Record<${[VENDOR_REACT_URL, VENDOR_SPOOL_URL, VENDOR_SPOOL_JSX_URL].map((url) => JSON.stringify(url)).join(" | ")}, string>>;
/** The pinned Tailwind's own stylesheets, by name: what \`inProcessStylesheets\` is handed as \`tailwind\`. */
export declare const TAILWIND_SOURCES: Readonly<Record<string, string>>;
`,
	);
}
