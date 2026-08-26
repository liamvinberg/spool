import { readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "tailwindcss";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";

/**
 * Serve-time Tailwind (#15): frames receive finished CSS, compiled with the
 * Tailwind pinned inside spool. The stylesheet loader below is the pin —
 * "tailwindcss" imports resolve into spool's own install, never a product's,
 * and tokens.css is the only project entry into the compile.
 */

const tailwindDir = realpathSync(dirname(fileURLToPath(import.meta.resolve("tailwindcss/index.css"))));

function isWithin(base: string, target: string): boolean {
	const rel = relative(base, target);
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

export const ROOT_CSS = `@import "tailwindcss";
@import "./tokens.css";
`;

export interface FrameCss {
	css: string;
	/** Project stylesheets the compile read (tokens.css plus its relative @imports) — they are cache inputs. */
	stylesheets: string[];
}

/** What a compile of this project's stylesheets needs, and what it read. */
export interface DesignStylesheets {
	base: string;
	loadStylesheet: (id: string, base: string) => Promise<{ path: string; base: string; content: string }>;
	loadModule: () => Promise<never>;
	/** Project stylesheets read so far; filled as the compile resolves imports. */
	stylesheets: Set<string>;
}

/**
 * The one way into a project's stylesheets, shared by the frame compile and
 * the theme read (#257).
 *
 * It is where the pin lives: "tailwindcss" resolves into spool's own install
 * and nowhere else, a relative import resolves inside design/ or is refused,
 * and anything else is not an import this daemon serves. Both callers want the
 * same rules and the same list of what was read, so there is one of it.
 */
export function designStylesheets(designDir: string): DesignStylesheets {
	const stylesheets = new Set<string>();

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
		// Spool's pinned Tailwind install is the only non-design stylesheet
		// root. Component-aware containment prevents prefix siblings from
		// masquerading as package internals.
		if (isWithin(tailwindDir, file)) {
			file = realpathSync(file);
			if (!isWithin(tailwindDir, file)) {
				throw new Error(`tailwindcss import "${id}" resolves outside Spool's pinned Tailwind install`);
			}
		} else {
			file = resolveDesignPath(designDir, file, id);
			stylesheets.add(file);
		}
		return { path: file, base: dirname(file), content: readFileSync(file, "utf8") };
	}

	async function loadModule(): Promise<never> {
		throw new Error("@plugin and @config are not supported in tokens.css");
	}

	return { base: join(designDir, "shared"), loadStylesheet, loadModule, stylesheets };
}

/**
 * Compile the finished stylesheet for one frame document: theme + preflight +
 * the utilities its source closure actually uses. A fresh compiler per call
 * keeps the output a pure function of the read stylesheets and the given
 * files — Tailwind's build() accumulates candidates across calls, which would
 * bleed one frame's utilities into the next document.
 */
export async function buildFrameCss(designDir: string, files: string[]): Promise<FrameCss> {
	const sheets = designStylesheets(designDir);
	const compiler = await compile(ROOT_CSS, {
		base: sheets.base,
		loadStylesheet: sheets.loadStylesheet,
		loadModule: sheets.loadModule,
	});
	const scanner = new Scanner({ sources: [] });
	const sources = files.flatMap((file) => {
		let content: string;
		try {
			content = readFileSync(resolveDesignPath(designDir, file), "utf8");
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
			return [];
		}
		return [{ content, extension: extname(file).slice(1) }];
	});
	return { css: compiler.build(scanner.scanFiles(sources)), stylesheets: [...sheets.stylesheets] };
}
