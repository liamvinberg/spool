import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "tailwindcss";

/**
 * Serve-time Tailwind (#15): frames receive finished CSS, compiled with the
 * Tailwind pinned inside spool. The stylesheet loader below is the pin —
 * "tailwindcss" imports resolve into spool's own install, never a product's,
 * and tokens.css is the only project entry into the compile.
 */

const tailwindDir = dirname(fileURLToPath(import.meta.resolve("tailwindcss/index.css")));

const rootCss = `@import "tailwindcss";
@import "./tokens.css";
`;

export interface FrameCss {
	css: string;
	/** Project stylesheets the compile read (tokens.css plus its relative @imports) — they are cache inputs. */
	stylesheets: string[];
}

/**
 * Compile the finished stylesheet for one frame document: theme + preflight +
 * the utilities its source closure actually uses. A fresh compiler per call
 * keeps the output a pure function of the read stylesheets and the given
 * files — Tailwind's build() accumulates candidates across calls, which would
 * bleed one frame's utilities into the next document.
 */
export async function buildFrameCss(designDir: string, files: string[]): Promise<FrameCss> {
	const projectStylesheets = new Set<string>();

	async function loadStylesheet(id: string, base: string): Promise<{ path: string; base: string; content: string }> {
		let file: string;
		if (id === "tailwindcss") {
			file = join(tailwindDir, "index.css");
		} else if (id.startsWith("tailwindcss/")) {
			file = join(tailwindDir, id.slice("tailwindcss/".length));
		} else if (id.startsWith("./") || id.startsWith("../")) {
			file = resolve(base, id);
		} else {
			throw new Error(
				`unsupported import "${id}" — only tailwindcss and relative stylesheets resolve in tokens.css`,
			);
		}
		// spool's own tailwind css is pinned by the spool version; project files must be hashed
		if (!file.startsWith(tailwindDir)) projectStylesheets.add(file);
		return { path: file, base: dirname(file), content: readFileSync(file, "utf8") };
	}

	async function loadModule(): Promise<never> {
		throw new Error("@plugin and @config are not supported in tokens.css");
	}

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
	return { css: compiler.build(scanner.scanFiles(sources)), stylesheets: [...projectStylesheets] };
}
