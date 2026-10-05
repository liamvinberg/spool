import { Buffer } from "node:buffer";
import { dirname, extname, join, posix, resolve } from "node:path";
import { compile } from "tailwindcss";
import { type ClassScanner, scanCandidates } from "./class-scanner";
import { designPathResolver, designRelativePath } from "./design-boundary";
import type { DesignFiles } from "./design-files";
import { contentDigest, readDesignBytes } from "./design-reads";

/**
 * Serve-time Tailwind (#15): frames receive finished CSS, compiled with the
 * Tailwind pinned inside spool. The stylesheet loader below is the pin —
 * "tailwindcss" imports resolve into spool's own install, never a product's,
 * and tokens.css is the only project entry into the compile.
 */

/**
 * The stylesheets of Spool's pinned Tailwind, by name in its package:
 * `index.css` for `@import "tailwindcss"`, and the others a project may import
 * by name. Where they are read from is the caller's: the daemon reads its own
 * install, a Worker carries them as text.
 */
export type TailwindStylesheets = (name: string) => string | undefined;

/** Every stylesheet of the pinned Tailwind a project's tokens.css can reach. */
export const TAILWIND_STYLESHEETS: readonly string[] = ["index.css", "theme.css", "preflight.css", "utilities.css"];

/**
 * Where Tailwind's own stylesheets sit as far as its compile is told: no
 * folder anywhere, so nothing a project writes can name one of them by path.
 */
const TAILWIND_BASE = "/\0tailwindcss";

/**
 * The layer every project stylesheet the frame bundle carries is wrapped in
 * (#323), and the one the frame document names its bundled block by.
 *
 * A plain `.company-byline { font-size: 13px }` arrives unlayered, and an
 * unlayered declaration outranks every layered one whatever its specificity —
 * so a `text-[20px]` the hand wrote, which Tailwind emits inside `utilities`,
 * lost to it unconditionally. Naming a layer for the project's own sheets is
 * what puts the two in the order a person expects: the agent's stylesheet is
 * the ground, and a utility written on top of it wins.
 *
 * It sits above `base` rather than at the bottom, because `base` is preflight
 * — `* { margin: 0; padding: 0 }` — and a project's own margins have always
 * beaten it. Below `components` and `utilities`, which is the whole point.
 */
export const PROJECT_LAYER = "project";

export const ROOT_CSS = `@layer theme, base, ${PROJECT_LAYER}, components, utilities;
@import "tailwindcss";
@import "./tokens.css";
`;

export interface FrameCss {
	css: string;
	/**
	 * Project stylesheets the compile read (tokens.css plus its relative
	 * @imports), each by the digest of the bytes it was compiled from: they are
	 * cache inputs, keyed by exactly what the stylesheet was made of.
	 */
	stylesheets: { file: string; digest: string }[];
}

/** One file of a frame's source closure, as its bundle read it, for Tailwind to scan. */
export interface CssSource {
	file: string;
	bytes: Uint8Array;
}

/** What a compile of this project's stylesheets needs, and what it read. */
export interface DesignStylesheets {
	base: string;
	loadStylesheet: (id: string, base: string) => Promise<{ path: string; base: string; content: string }>;
	loadModule: () => Promise<never>;
	/** Project stylesheets read so far, by the digest of what was read; filled as the compile resolves imports. */
	stylesheets: Map<string, string>;
}

/**
 * The one way into a project's stylesheets.
 *
 * It is where the pin lives: "tailwindcss" resolves into spool's own Tailwind
 * and nowhere else, a relative import resolves inside design/ or is refused,
 * and anything else is not an import this daemon serves.
 */
export function designStylesheets(
	designDir: string,
	files: DesignFiles,
	tailwind: TailwindStylesheets,
): DesignStylesheets {
	const stylesheets = new Map<string, string>();
	const resolvePath = designPathResolver(designDir, files);

	function pinned(id: string, name: string): { path: string; base: string; content: string } {
		const content = name.startsWith("../") ? undefined : tailwind(name);
		if (content === undefined)
			throw new Error(`tailwindcss import "${id}" is not a stylesheet of Spool's pinned Tailwind`);
		return { path: `${TAILWIND_BASE}/${name}`, base: TAILWIND_BASE, content };
	}

	async function loadStylesheet(id: string, base: string): Promise<{ path: string; base: string; content: string }> {
		if (id === "tailwindcss") return pinned(id, "index.css");
		if (id.startsWith("tailwindcss/")) return pinned(id, posix.normalize(id.slice("tailwindcss/".length)));
		if (!id.startsWith("./") && !id.startsWith("../")) {
			throw new Error(
				`unsupported import "${id}" — only tailwindcss and relative stylesheets resolve in tokens.css`,
			);
		}
		// Spool's pinned Tailwind is the only non-design stylesheet root
		if (base === TAILWIND_BASE) return pinned(id, posix.normalize(id));
		const file = resolvePath(resolve(base, id), id);
		const bytes = readDesignBytes(resolvePath, file, files);
		if (bytes === undefined) throw new Error(`no stylesheet at design/${designRelativePath(designDir, file)}`);
		stylesheets.set(file, contentDigest(bytes));
		return { path: file, base: dirname(file), content: bytes.toString("utf8") };
	}

	async function loadModule(): Promise<never> {
		throw new Error("@plugin and @config are not supported in tokens.css");
	}

	return { base: join(designDir, "shared"), loadStylesheet, loadModule, stylesheets };
}

/** What compiling a frame's stylesheet reads from: the project, Spool's Tailwind, and the scanner. */
export interface StylesheetSources {
	files: DesignFiles;
	tailwind: TailwindStylesheets;
	scan?: ClassScanner | undefined;
}

/**
 * Compile one frame document's finished stylesheet: theme + preflight + the
 * utilities its source closure actually uses. A fresh compiler per call keeps
 * the output a pure function of the read stylesheets and the given sources —
 * Tailwind's build() accumulates candidates across calls, which would bleed
 * one frame's utilities into the next document. The same accumulation is why
 * one compiler cannot serve a whole project either: build() also marks every
 * theme variable a frame used, and the marks decide which variables the next
 * frame's stylesheet carries.
 *
 * The daemon never calls this on its event loop: its stylesheet runner hands
 * the job to a stylesheet worker, which runs this.
 */
export async function compileFrameCss(
	designDir: string,
	sources: CssSource[],
	{ files, tailwind, scan = scanCandidates }: StylesheetSources,
): Promise<FrameCss> {
	const sheets = designStylesheets(designDir, files, tailwind);
	const compiler = await compile(ROOT_CSS, {
		base: sheets.base,
		loadStylesheet: sheets.loadStylesheet,
		loadModule: sheets.loadModule,
	});
	// the bytes the bundle was made of, read as text the way the file would be
	const scanned = sources.map(({ file, bytes }) => ({
		content: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8"),
		extension: extname(file).slice(1),
	}));
	const stylesheets = [...sheets.stylesheets].map(([file, digest]) => ({ file, digest }));
	return { css: compiler.build(scan(scanned)), stylesheets };
}

/**
 * Where a compile's frame stylesheets are made, from the bytes its bundle was
 * made of. The daemon runs them on its stylesheet workers; a Worker runs them
 * in place (`inProcessStylesheets`).
 */
export type StylesheetRunner = (designDir: string, sources: CssSource[]) => Promise<FrameCss>;

/** Frame stylesheets compiled where they are asked for, as a Cloudflare Worker compiles them. */
export function inProcessStylesheets(sources: StylesheetSources): StylesheetRunner {
	return (designDir, frameSources) => compileFrameCss(designDir, frameSources, sources);
}
