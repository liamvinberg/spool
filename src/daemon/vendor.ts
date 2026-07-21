import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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

export const reactVersion: string = (createRequire(import.meta.url)("react/package.json") as { version: string })
	.version;

export function reactImportMapPins(): Record<string, string> {
	return Object.fromEntries(REACT_SPECIFIERS.map((spec) => [spec, VENDOR_REACT_URL]));
}

let bundle: Promise<string> | undefined;

export function vendorReactJs(): Promise<string> {
	bundle ??= buildVendorReact();
	return bundle;
}

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
