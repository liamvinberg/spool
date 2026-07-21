import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "tailwindcss";

/**
 * Serve-time Tailwind (#15): frames receive finished CSS, compiled with the
 * Tailwind pinned inside spool. The stylesheet loader below is the pin —
 * "tailwindcss" imports resolve into spool's own install, never a product's,
 * and tokens.css is the only project file in the compile.
 */

const tailwindDir = dirname(fileURLToPath(import.meta.resolve("tailwindcss/index.css")));

const rootCss = `@import "tailwindcss";
@import "./tokens.css";
`;

async function loadStylesheet(id: string, base: string): Promise<{ path: string; base: string; content: string }> {
	let file: string;
	if (id === "tailwindcss") {
		file = join(tailwindDir, "index.css");
	} else if (id.startsWith("tailwindcss/")) {
		file = join(tailwindDir, id.slice("tailwindcss/".length));
	} else if (id.startsWith("./") || id.startsWith("../")) {
		file = resolve(base, id);
	} else {
		throw new Error(`unsupported import "${id}" — only tailwindcss and relative stylesheets resolve in tokens.css`);
	}
	return { path: file, base: dirname(file), content: readFileSync(file, "utf8") };
}

async function loadModule(): Promise<never> {
	throw new Error("@plugin and @config are not supported in tokens.css");
}

/**
 * Compile the finished stylesheet for one frame document: theme + preflight +
 * the utilities its source closure actually uses. A fresh compiler per call
 * keeps the output a pure function of tokens.css and the given files —
 * Tailwind's build() accumulates candidates across calls, which would bleed
 * one frame's utilities into the next document.
 */
export async function buildFrameCss(designDir: string, files: string[]): Promise<string> {
	const compiler = await compile(rootCss, { base: join(designDir, "shared"), loadStylesheet, loadModule });
	const scanner = new Scanner({ sources: [] });
	const sources = files.flatMap((file) => {
		let content: string;
		try {
			content = readFileSync(file, "utf8");
		} catch {
			return [];
		}
		return [{ content, extension: extname(file).slice(1) }];
	});
	return compiler.build(scanner.scanFiles(sources));
}
