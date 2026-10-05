import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import type { BuildContext, BuildResult } from "esbuild";
import { frameFolder } from "../page-path";
import { designPathResolver } from "./design-boundary";
import {
	buildDesignEntry,
	type CompileHost,
	describeCompileError,
	designBuildOptions,
	designEntryKey,
	designInputFile,
	designOutputName,
	inputsHash,
	isDesignBoundaryFailure,
	parseImportMap,
} from "./design-compile";
import type { DesignFiles } from "./design-files";
import { contentDigest, createDesignReads, type DesignReads } from "./design-reads";
import { mergeImportMap } from "./document";
import { inertWebfonts, inlineLocalFonts, type Webfonts } from "./font-faces";
import { buildFrameStyleClosure } from "./frame-styles";
import { importMapPins } from "./vendor-pins";

/**
 * The player's composition (#24): every frame of a project compiled into one
 * split bundle, each frame and whatever frames share cut into modules of their
 * own. The daemon composes the canvas's player from it (play.ts), and the
 * publication compile is the same composition built for a destination.
 */

const STDIN_NAME = "<spool-play>";

export interface PlayerBundle {
	/** The composition's entry module, by its served name. */
	entry: string;
	/**
	 * Every module the composition compiled to, by served name: the entry, one
	 * per frame, and the chunks they share. Names carry a content hash, so a
	 * name is the module and is cached forever.
	 */
	chunks: ReadonlyMap<string, string>;
	/**
	 * What each screen needs before it can mount: its own module and every
	 * static import under it, transitively. The document preloads the start
	 * screen's list, so the first paint waits on nothing it could have asked for
	 * sooner.
	 */
	screens: ReadonlyMap<string, readonly string[]>;
	/** Each frame's standalone stylesheet module, by frame name. */
	styles: ReadonlyMap<string, string>;
	fonts?: string | undefined;
	/** shared/transitions.css verbatim — crossfades, morphs, direction types. */
	transitions?: string | undefined;
	importMap: object;
	names: string[];
	hash: string;
}

/** A frame in the composition: leaf-name identity, page-aware folder (#39). */
export interface PlayerFrameRef {
	name: string;
	page?: string;
}

/** A composed player and what it was made of. */
export interface ComposedPlayer {
	stamp: string;
	inputs: string[];
	hash: string;
	bundle: PlayerBundle;
	/** The webfont resolution this bundle was assembled from (#80). */
	fonts: number;
	/** Frames serving a compile error in their own place rather than the player's. */
	broken: string[];
	/** Every input was one state through the compile (see DesignReads). */
	settled: boolean;
}

/** The frames a publication plays, and the folder they are in. */
export interface PublicationRequest {
	/** The design folder, absolute: the daemon's real path, or wherever a Worker holds the files. */
	designDir: string;
	frames: PlayerFrameRef[];
	/** Spool's version, folded into the input hash. */
	version: string;
}

/**
 * The publication compile: the player's split renderer, with strict
 * destination compilation and no source stamping. What `spool build` and Share
 * publish, and what a Worker serves to someone outside the project. A
 * composition that does not compile throws; `describeCompileError` says why.
 */
export async function compilePublication(
	host: CompileHost,
	{ designDir, frames, version }: PublicationRequest,
): Promise<{ bundle: PlayerBundle; inputs: string[]; hash: string }> {
	const stamp = playerStamp(frames);
	const reading: PlayerContext["reading"] = { reads: undefined };
	const held: PlayerContext = {
		stamp,
		designDir,
		reading,
		context: await host.esbuild.context(
			compositionOptions(designDir, playerEntry(frames, new Map()), host.files, () => reading.reads, true),
		),
		styles: new Map(),
	};
	try {
		const result = await compilePlayer(host, version, designDir, frames, stamp, inertWebfonts(), held, true);
		return { bundle: result.bundle, inputs: result.inputs, hash: result.hash };
	} finally {
		await held.context.dispose();
	}
}

/** What a player is compiled for, besides its files: the folders of the frames it plays. */
export function playerStamp(frames: readonly PlayerFrameRef[]): string {
	return frames.map((ref) => frameFolder(ref.name)).join("\n");
}

/** A composition kept between builds: esbuild's context, and each frame's stylesheet as last built. */
export interface PlayerContext {
	stamp: string;
	designDir: string;
	/** The reads of the compile now rebuilding the context, which its bundle is made of. */
	reading: { reads: DesignReads | undefined };
	context: BuildContext;
	/**
	 * Each frame's stylesheet as last built, by frame name. A frame's styles are
	 * its own esbuild and Tailwind compile, the bulk of a player build, so a
	 * frame whose inputs read the same is not built again.
	 */
	styles: Map<string, FrameStyle>;
}

export interface FrameStyle {
	inputs: string[];
	key: string;
	css: string;
}

/**
 * What a frame's stylesheet was made of: each input by a digest, and the names
 * beside each input and one folder up, since a file appearing there can win
 * an import the input answered (`card.tsx` beside `card.ts`, or `card.tsx`
 * beside a `card/` folder) without any input's bytes moving.
 */
function styleKey(
	designDir: string,
	inputs: readonly string[],
	digest: (file: string) => string,
	list: (folder: string) => string,
): string {
	const hash = createHash("sha256");
	const folders = new Set<string>();
	for (const file of inputs) {
		hash.update(`${file}\0${digest(file)}\0`);
		folders.add(dirname(file)).add(dirname(dirname(file)));
	}
	for (const folder of [...folders].sort()) {
		if (relative(designDir, folder).startsWith("..")) continue;
		hash.update(`${folder}\0${list(folder)}\0`);
	}
	return hash.digest("hex");
}

function listing(files: DesignFiles, folder: string): string {
	const names = files.list(folder);
	return names === undefined
		? "absent"
		: names
				.map((entry) => entry.name)
				.sort()
				.join("/");
}

export async function compilePlayer(
	host: CompileHost,
	version: string,
	designDir: string,
	frames: PlayerFrameRef[],
	stamp: string,
	webfonts: Webfonts,
	context: PlayerContext,
	publication = false,
): Promise<ComposedPlayer> {
	// One read of every input for the whole player, as for a frame document:
	// the composition, every frame's stylesheet and the cache key are all made of
	// the same bytes.
	const reads = createDesignReads(designDir, host.files);
	// the same stamping compile as frame documents (#23): one dialect, one
	// pipeline, identical semantics whether a frame renders alone or composed
	let composed: { composition: Composition; broken: Map<string, string> };
	context.reading.reads = reads;
	try {
		composed = publication
			? {
					composition: readComposition(designDir, frames, await context.context.rebuild(), host.files),
					broken: new Map<string, string>(),
				}
			: await composePlayer(host, designDir, frames, context, reads);
	} finally {
		context.reading.reads = undefined;
	}

	const shared = join(designDir, "shared");
	const kept = context.styles;
	const current = (file: string) => contentDigest(reads.bytes(file));
	const listings = new Map<string, string>();
	const list = (folder: string) => {
		const known = listings.get(folder);
		if (known !== undefined) return known;
		const names = listing(host.files, folder);
		listings.set(folder, names);
		return names;
	};
	const playing = new Set(frames.map((ref) => ref.name));
	for (const name of kept.keys()) if (!playing.has(name)) kept.delete(name);
	const frameStyles = await mapConcurrent(frames, 8, async (ref) => {
		if (composed.broken.has(ref.name)) return { name: ref.name, css: "" };
		const last = kept.get(ref.name);
		if (last !== undefined && styleKey(designDir, last.inputs, current, list) === last.key) {
			return { name: ref.name, css: last.css };
		}
		const { css, inputs } = await buildFrameStyleClosure(host, designDir, ref, reads, publication);
		// keyed by the bytes it was built from, which for a stylesheet Tailwind read
		// is the digest its worker noted, never a later read of the file
		const built = (file: string) => reads.digests().get(file) ?? current(file);
		kept.set(ref.name, { inputs, key: styleKey(designDir, inputs, built, list), css });
		return { name: ref.name, css };
	});
	const resolvedFonts = await webfonts.resolve(reads.text(join(shared, "fonts.css")));
	// read the moment the fonts resolve, as the frame compiler does (#80)
	const fontsRevision = webfonts.revision();
	const { css: fonts } = publication
		? { css: resolvedFonts }
		: inlineLocalFonts(designDir, resolvedFonts, reads.bytes, designPathResolver(designDir, host.files));
	const transitions = reads.text(join(shared, "transitions.css"));
	const importMap = mergeImportMap(parseImportMap(reads.text(join(shared, "importmap.json"))), importMapPins());

	const settled = reads.settled();
	const digests = reads.digests();
	const inputsKey = inputsHash(version, stamp, designDir, digests);
	const names = frames.map((ref) => ref.name);
	const { entry, chunks, screens } = composed.composition;
	const styles = new Map<string, string>();
	for (const frame of frameStyles) {
		const name = `styles/frame-${createHash("sha256").update(frame.css).digest("hex").slice(0, 16)}.css`;
		styles.set(frame.name, name);
		chunks.set(name, frame.css);
	}
	// A bundle a file moved under while it compiled (a stylesheet two frames read
	// differently) is named by its own contents, as a frame document is by its
	// bytes, so no revalidation takes it for the sources now. It is never cached.
	// A settled bundle carries the webfont revision in its name, as a frame
	// document's etag does (#80), since a resolve changes its fonts alone.
	const hash = settled
		? createHash("sha256").update(`${inputsKey}\0${fontsRevision}`).digest("hex")
		: createHash("sha256")
				.update(JSON.stringify([entry, [...chunks], fonts, transitions, importMap]))
				.digest("hex");
	return {
		stamp,
		inputs: [...digests.keys()],
		hash: inputsKey,
		fonts: fontsRevision,
		broken: [...composed.broken.keys()],
		settled,
		bundle: {
			entry,
			chunks,
			screens,
			styles,
			fonts,
			transitions,
			importMap,
			names,
			hash,
		},
	};
}

/** Keep large canvases from opening hundreds of esbuild and Tailwind compiles at once. */
async function mapConcurrent<Input, Output>(
	inputs: readonly Input[],
	limit: number,
	work: (input: Input) => Promise<Output>,
): Promise<Output[]> {
	const outputs = new Array<Output>(inputs.length);
	let next = 0;
	const worker = async () => {
		while (next < inputs.length) {
			const index = next++;
			outputs[index] = await work(inputs[index] as Input);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
	return outputs;
}

/** The split build of the composition: modules by served name, and what each screen needs. */
interface Composition {
	sourceFiles: string[];
	entry: string;
	chunks: Map<string, string>;
	screens: Map<string, string[]>;
}

/**
 * Builds the composition, and when it will not build, works out which frames are
 * to blame and stands each of them down in its own place. One bad import used to
 * cost the whole player, including every frame that compiled perfectly well.
 *
 * The whole-project build is tried first and unchanged, so a healthy project pays
 * nothing for this. Blame is settled by compiling each frame alone rather than by
 * reading esbuild's error locations: a broken file under shared/ belongs to every
 * frame that reaches it, and only a real build knows which those are.
 */
async function composePlayer(
	host: CompileHost,
	designDir: string,
	frames: PlayerFrameRef[],
	context: PlayerContext,
	reads: DesignReads,
): Promise<{ composition: Composition; broken: Map<string, string> }> {
	// No image budget here, and none in blameFrames either (#101). The budget
	// guards a frame document, because the canvas loads a page full of them; the
	// player is one document, loaded once. Applying it to the composition would
	// kill the whole player over the sum of frames that each fit their own
	// document — the exact whole-player failure this function exists to prevent.
	const none = new Map<string, string>();
	try {
		// The healthy build rides the held context: esbuild keeps what it parsed
		// last time and re-reads only what changed, so an edit costs its own file.
		return {
			composition: readComposition(designDir, frames, await context.context.rebuild(), host.files),
			broken: none,
		};
	} catch (error) {
		// A design-boundary escape is not an authoring mistake to be shown on one
		// screen. It fails the player whole and says nothing about what it read.
		if (isDesignBoundaryFailure(error)) throw error;
		const broken = await blameFrames(host, designDir, frames);
		// Nothing frame-shaped to blame — a broken importmap, a Tailwind failure —
		// so the player fails whole, as it should.
		if (broken.size === 0) throw error;
		// A stubbed build is a one-off: it is never cached, and the context stays
		// on the whole composition, ready for the fix.
		const result = await host.esbuild.build(
			compositionOptions(designDir, playerEntry(frames, broken), host.files, () => reads),
		);
		return { composition: readComposition(designDir, frames, result, host.files), broken };
	}
}

/** The composition's esbuild options: the design compile, split at every frame. */
export function compositionOptions(
	designDir: string,
	contents: string,
	files: DesignFiles,
	reads: () => DesignReads | undefined,
	publication = false,
) {
	return {
		...designBuildOptions({
			designDir,
			resolveDir: designDir,
			sourcefile: STDIN_NAME,
			contents,
			label: "the player",
			...(publication ? { publication: true } : {}),
			files,
			reads,
		}),
		splitting: true as const,
		entryNames: "play-[hash]",
		chunkNames: "[dir]/[name]-[hash]",
	};
}

/**
 * Reads a split build into served modules. Every output is a module under the
 * chunk route; the frame ones are found by the entry point esbuild recorded for
 * each dynamic import, and a screen's list is that module plus everything it
 * statically imports, walked to the leaves. Externals — react, the runtime —
 * come through the import map and are nobody's to preload here.
 */
function readComposition(
	designDir: string,
	frames: PlayerFrameRef[],
	result: BuildResult,
	files: DesignFiles,
): Composition {
	const { metafile, outputFiles } = result;
	if (metafile === undefined || outputFiles === undefined) throw new Error("the player compiled to nothing");
	const entryKey = designEntryKey({ designDir, resolveDir: designDir, sourcefile: STDIN_NAME });
	const sourceFiles = Object.keys(metafile.inputs)
		.filter((input) => input !== entryKey)
		.map((input) => designInputFile(designDir, input, files));
	const chunks = new Map<string, string>();
	for (const file of outputFiles) {
		const name = designOutputName(designDir, file.path);
		if (name.endsWith(".css")) continue;
		chunks.set(name, file.text);
	}
	// metafile paths are relative to absWorkingDir; served names hang off the outdir
	const outputs = new Map<string, { entryPoint?: string | undefined; imports: readonly string[] }>();
	let entry: string | undefined;
	for (const [path, output] of Object.entries(metafile.outputs)) {
		const name = designOutputName(designDir, resolve(designDir, path));
		if (!name.endsWith(".js")) continue;
		const imports = output.imports
			.filter((edge) => edge.kind === "import-statement" && edge.external !== true)
			.map((edge) => designOutputName(designDir, resolve(designDir, edge.path)));
		outputs.set(name, { entryPoint: output.entryPoint, imports });
		if (output.entryPoint === entryKey) entry = name;
	}
	if (entry === undefined) throw new Error("the player compiled to no entry module");
	const byEntry = new Map<string, string>();
	for (const [name, output] of outputs) {
		if (output.entryPoint !== undefined) byEntry.set(output.entryPoint, name);
	}
	const closure = (name: string): string[] => {
		const seen = new Set<string>();
		const walk = (module: string) => {
			if (seen.has(module)) return;
			seen.add(module);
			for (const imported of outputs.get(module)?.imports ?? []) walk(imported);
		};
		walk(name);
		return [...seen];
	};
	const screens = new Map<string, string[]>();
	for (const ref of frames) {
		const module = byEntry.get(`${frameFolder(ref.name)}/frame.tsx`);
		// a stubbed frame has no module of its own: its screen is in the entry
		screens.set(ref.name, module === undefined ? [] : closure(module));
	}
	return { sourceFiles, entry, chunks, screens };
}

/** Compiles each frame alone to find the ones that cannot build, with their errors. */
async function blameFrames(
	host: CompileHost,
	designDir: string,
	frames: PlayerFrameRef[],
): Promise<Map<string, string>> {
	const verdicts = await Promise.all(
		frames.map(async (ref) => {
			const folder = frameFolder(ref.name);
			const reads = createDesignReads(designDir, host.files);
			try {
				await buildDesignEntry(host.esbuild, {
					designDir,
					resolveDir: designDir,
					sourcefile: STDIN_NAME,
					// The default export is what the composition takes, so take it here too.
					contents: `import frame from ${JSON.stringify(`./${folder}/frame.tsx`)};\nexport default frame;\n`,
					label: `frame "${ref.name}"`,
					files: host.files,
					reads: () => reads,
				});
				return undefined;
			} catch (error) {
				return [ref.name, await describeCompileError(host.esbuild, error)] as const;
			}
		}),
	);
	return new Map(verdicts.filter((verdict): verdict is readonly [string, string] => verdict !== undefined));
}

/**
 * The composition: every frame known to the runtime's player boot by a loader
 * that imports it, so esbuild cuts each into its own module and a screen is
 * fetched when the session first needs it. A frame that would not compile is
 * not imported at all — it arrives as the runtime stand-in carrying its own
 * error, which is what makes the failure local to it.
 */
export function playerEntry(frames: PlayerFrameRef[], broken: Map<string, string>): string {
	const entries = frames.map((ref) => {
		const folder = frameFolder(ref.name);
		const error = broken.get(ref.name);
		if (error === undefined) {
			return `[${JSON.stringify(ref.name)}, { load: () => import(${JSON.stringify(`./${folder}/frame.tsx`)}) }]`;
		}
		const details = { frame: ref.name, file: `design/${folder}/frame.tsx`, error };
		return `[${JSON.stringify(ref.name)}, brokenFrame(${JSON.stringify(details)})]`;
	});
	const boot = broken.size === 0 ? "bootPlayer" : "bootPlayer, brokenFrame";
	return `import { ${boot} } from "spool";
bootPlayer(Object.fromEntries([${entries.join(", ")}]));
`;
}
