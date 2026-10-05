import { readdirSync, readFileSync } from "node:fs";
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
const designDir = join(repo, "design");

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

/** Every file a frame's closure can hold: the canvas's frames and shared/, and the repo's fixtures. */
const files = [...walk(join(designDir, "frames")), ...walk(join(designDir, "shared")), ...walk(join(repo, "fixtures"))];

function scanned(file: string): ScannedFile {
	return { content: readFileSync(file, "utf8"), extension: extname(file).slice(1) };
}

/**
 * Whether Tailwind builds anything from a candidate, with this canvas's own
 * tokens: a utility it has CSS for, or a custom property its theme holds, which
 * build() then emits. Asked of Tailwind's design system, one candidate at a
 * time, rather than of build(), which keeps every candidate it has seen.
 */
async function buildsSomething(): Promise<(candidate: string) => boolean> {
	const system = await __unstable__loadDesignSystem(
		ROOT_CSS,
		designStylesheets(designDir, diskDesignFiles, pinnedTailwind),
	);
	return (candidate) =>
		candidate.startsWith("--")
			? system.theme.get([candidate as `--${string}`]) !== null
			: system.candidatesToCss([candidate])[0] !== null;
}

describe("the class scanner, held to Oxide", () => {
	it("finds every class Oxide finds in each file, and only the documented extra besides", {
		timeout: 120_000,
	}, async () => {
		const builds = await buildsSomething();
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
			for (const candidate of found.keys()) if (!builds(candidate)) found.delete(candidate);

		expect(files.length).toBeGreaterThan(2000);
		expect(Object.fromEntries(missed)).toEqual({});
		expect([...extra.keys()].filter((candidate) => !DOCUMENTED_EXTRAS.has(candidate))).toEqual([]);
	});

	// what other canvases than Spool's own showed it, each where Oxide takes a
	// candidate this scanner once missed or took one Oxide does not
	it.each([
		["a key", "const [filter, setFilter] = useState<Filter>({ q: '' });"],
		["a closing bracket", "const [blurRef, blur] = useComputed<HTMLDivElement>(readFilter);"],
		["a parameter's name", "export function watchVisible(onChange: (visible: boolean) => void) {}"],
		["a callback's parameter", "const emit = useCallback((block: Block) => setBlocks([block]), []);"],
		["a shorthand Oxide refuses", '<Note says="Each takes its z-(--layer-*) class and a portal container." />'],
		["a shorthand inside a value", '<div className="max-h-[calc(100dvh-(--spacing(16)))] overflow-auto" />'],
	])("builds what Oxide builds from %s", async (_, content) => {
		const builds = await buildsSomething();
		const source = [{ content, extension: "tsx" }];

		expect(scanCandidates(source).filter(builds).sort()).toEqual(oxide(source).filter(builds).sort());
	});

	it("builds every frame on the canvas the stylesheet Oxide would", { timeout: 300_000 }, async () => {
		const frames = files.filter((file) => file.startsWith(join(designDir, "frames")) && file.endsWith("/frame.tsx"));
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

		expect(compared).toBeGreaterThan(800);
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
