import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Scanner } from "@tailwindcss/oxide";
import * as esbuild from "esbuild";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { type ClassScanner, type ScannedFile, scanCandidates } from "./class-scanner";
import { buildDesignEntry, cssSources } from "./design-compile";
import { createDesignReads } from "./design-reads";
import { diskDesignFiles } from "./disk-files";
import { pinnedTailwind } from "./stylesheet-workers";
import { compileFrameCss, designStylesheets, ROOT_CSS } from "./tailwind";

/**
 * Spool scans for Tailwind classes with its own scanner, so a Worker can scan
 * the way the canvas does. Oxide, Tailwind's own, is what it has to match: over
 * real frame sources it must find every class Oxide finds, add nothing that
 * changes a stylesheet beyond the one extra research 117 documented, and so
 * build every frame the stylesheet Oxide would. Oxide stays a dev dependency
 * pinned to the Tailwind Spool ships, and this runs again whenever that pin
 * moves.
 */

const repo = fileURLToPath(new URL("../..", import.meta.url));

/** What a frame's closure can hold that is text: what the scanner reads. */
const SCANNED: ReadonlySet<string> = new Set([".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json", ".html", ".md"]);

/**
 * The corpus every run holds the scanner to, all of it in git: the committed
 * canvases with their frames and shared code, and the Tailwind TSX of Spool's
 * own UI and runtime. Fixed, so a run passes or fails the same everywhere.
 */
const committedCanvases = [join(repo, "prototype-editing/design"), join(repo, "fixtures/compile/design")];
const committedFiles = [
	...new Set([
		...committedCanvases.flatMap((canvas) => [...walk(join(canvas, "frames")), ...walk(join(canvas, "shared"))]),
		...walk(join(repo, "src/ui")),
		...walk(join(repo, "src/runtime")),
		...walk(join(repo, "fixtures")),
	]),
].filter((file) => SCANNED.has(extname(file)));

/**
 * A live canvas, swept only on request: `pnpm test:canvas` sweeps Spool's own
 * design/, a team project out of git whose size and contents change under any
 * run; `SPOOL_TEST_CANVAS=<design dir>` sweeps another.
 */
const live = process.env.SPOOL_TEST_CANVAS;
const liveCanvas = live === undefined || live === "" ? undefined : live === "1" ? join(repo, "design") : live;

/**
 * Candidates this scanner finds that Oxide does not and that Tailwind builds
 * something from (spool-cloud research 117): a custom property read in code,
 * `var(--spacing)`, which marks a theme variable every spacing utility already
 * emits.
 */
const DOCUMENTED_EXTRAS: ReadonlySet<string> = new Set(["--spacing"]);

const oxide: ClassScanner = (files) => new Scanner({ sources: [] }).scanFiles([...files]);

function walk(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
	);
}

function scanned(file: string): ScannedFile {
	return { content: readFileSync(file, "utf8"), extension: extname(file).slice(1) };
}

/**
 * Whether Tailwind builds anything from a candidate, with a canvas's own
 * tokens: a utility it has CSS for, or a custom property its theme holds, which
 * build() then emits. Asked of Tailwind's design system, one candidate at a
 * time, rather than of build(), which keeps every candidate it has seen.
 */
async function buildsSomething(designDir: string): Promise<(candidate: string) => boolean> {
	const system = await __unstable__loadDesignSystem(
		ROOT_CSS,
		designStylesheets(designDir, diskDesignFiles, pinnedTailwind),
	);
	return (candidate) =>
		candidate.startsWith("--")
			? system.theme.get([candidate as `--${string}`]) !== null
			: system.candidatesToCss([candidate])[0] !== null;
}

/**
 * Each file scanned alone by both scanners: the candidates Oxide finds that
 * this one misses, and the ones this one finds besides the documented extras,
 * of those Tailwind builds something from, each with a file it came from.
 */
async function candidatesApart(files: readonly string[], designDir: string) {
	const builds = await buildsSomething(designDir);
	const missed = new Map<string, string>();
	const extra = new Map<string, string>();
	for (const file of files) {
		const source = [scanned(file)];
		const ours = new Set(scanCandidates(source));
		const theirs = new Set(oxide(source));
		for (const candidate of theirs) if (!ours.has(candidate)) missed.set(candidate, file);
		for (const candidate of ours) if (!theirs.has(candidate)) extra.set(candidate, file);
	}
	// only what Tailwind builds something from changes a stylesheet
	for (const found of [missed, extra])
		for (const candidate of found.keys())
			if (!builds(candidate) || DOCUMENTED_EXTRAS.has(candidate)) found.delete(candidate);
	return { missed: Object.fromEntries(missed), extra: Object.fromEntries(extra) };
}

/** Each frame of a canvas built with both scanners: how many compiled, and which built another stylesheet. */
async function stylesheetsApart(designDir: string) {
	const frames = walk(join(designDir, "frames")).filter((file) => file.endsWith("/frame.tsx"));
	const differ: string[] = [];
	let compared = 0;
	await inParallel(frames, 8, async (entry) => {
		const reads = createDesignReads(designDir, diskDesignFiles);
		let sourceFiles: string[];
		try {
			({ sourceFiles } = await buildDesignEntry(esbuild, {
				designDir,
				resolveDir: join(entry, ".."),
				sourcefile: "<spool-styles>",
				contents: 'import frame from "./frame.tsx";\nexport default frame;\n',
				label: entry,
				files: diskDesignFiles,
				reads: () => reads,
			}));
		} catch {
			// a frame that does not compile has no stylesheet to compare
			return;
		}
		const sources = cssSources(reads, sourceFiles);
		const from = { files: diskDesignFiles, tailwind: pinnedTailwind };
		const ours = await compileFrameCss(designDir, sources, from);
		const theirs = await compileFrameCss(designDir, sources, { ...from, scan: oxide });
		compared++;
		if (ours.css !== theirs.css) differ.push(entry.slice(designDir.length + 1));
	});
	return { frames: frames.length, compared, differ: differ.sort() };
}

/** The installed version of a package, which its pin alone doesn't give. */
const installed = (name: string): string =>
	(createRequire(import.meta.url)(`${name}/package.json`) as { version: string }).version;

describe("the class scanner, held to Oxide", () => {
	it("is held to the Oxide of the Tailwind Spool ships, so moving one pin alone fails here", () => {
		expect(installed("@tailwindcss/oxide")).toBe(installed("tailwindcss"));
	});

	it("finds every class Oxide finds in each committed file, and only the documented extra besides", {
		timeout: 120_000,
	}, async () => {
		// a floor under the corpus, so one moved folder cannot empty it unnoticed
		expect(committedFiles.length).toBeGreaterThan(250);
		expect(await candidatesApart(committedFiles, committedCanvases[0] as string)).toEqual({ missed: {}, extra: {} });
	});

	// what other canvases than the committed ones showed it, each where Oxide
	// takes a candidate this scanner once missed or took one Oxide does not
	it.each([
		["a key", "const [filter, setFilter] = useState<Filter>({ q: '' });"],
		["a closing bracket", "const [blurRef, blur] = useComputed<HTMLDivElement>(readFilter);"],
		["a parameter's name", "export function watchVisible(onChange: (visible: boolean) => void) {}"],
		["a callback's parameter", "const emit = useCallback((block: Block) => setBlocks([block]), []);"],
		["a shorthand Oxide refuses", '<Note says="Each takes its z-(--layer-*) class and a portal container." />'],
		["a shorthand inside a value", '<div className="max-h-[calc(100dvh-(--spacing(16)))] overflow-auto" />'],
		["a selector in code", "const screen = root.querySelector('[data-part=\"token:screen\"]');"],
		["arbitrary properties", '<div className="[mask-type:alpha] hover:[--glow:1px] md:[-webkit-x:y] [Mask:x]" />'],
	])("builds what Oxide builds from %s", async (_, content) => {
		const builds = await buildsSomething(committedCanvases[0] as string);
		const source = [{ content, extension: "tsx" }];

		expect(scanCandidates(source).filter(builds).sort()).toEqual(oxide(source).filter(builds).sort());
	});

	it.each(committedCanvases.map((canvas) => [canvas.slice(repo.length), canvas]))(
		"builds every frame of %s the stylesheet Oxide would",
		{ timeout: 120_000 },
		async (_, canvas) => {
			const { frames, compared, differ } = await stylesheetsApart(canvas);

			// every committed frame compiles, so every one is compared
			expect(compared).toBe(frames);
			expect(frames).toBeGreaterThan(0);
			expect(differ).toEqual([]);
		},
	);
});

describe.runIf(liveCanvas !== undefined)("the class scanner, held to Oxide over a live canvas", () => {
	const designDir = liveCanvas as string;

	it("finds every class Oxide finds in each file, and only the documented extra besides", {
		timeout: 300_000,
	}, async () => {
		const files = [...walk(join(designDir, "frames")), ...walk(join(designDir, "shared"))];

		expect(files.length).toBeGreaterThan(0);
		expect(await candidatesApart(files, designDir)).toEqual({ missed: {}, extra: {} });
	});

	it("builds every frame the stylesheet Oxide would", { timeout: 600_000 }, async () => {
		const { compared, differ } = await stylesheetsApart(designDir);

		expect(compared).toBeGreaterThan(0);
		expect(differ).toEqual([]);
	});
});

async function inParallel<Input>(inputs: readonly Input[], limit: number, work: (input: Input) => Promise<void>) {
	let next = 0;
	const worker = async () => {
		while (next < inputs.length) await work(inputs[next++] as Input);
	};
	await Promise.all(Array.from({ length: limit }, worker));
}
