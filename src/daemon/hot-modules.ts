import { createHash, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { ImportKind, Metafile, Plugin } from "esbuild";
import { frameFolder } from "../page-path";
import { designPathResolver, designRelativePath } from "./design-boundary";
import { type CompileHost, compileFrameHotState, designBuildOptions, designInputFile } from "./design-compile";
import { contentDigest, createDesignReads, readDesignBytes } from "./design-reads";
import { designResolver } from "./design-resolve";
import { type HotModule, hotModuleUrl, hotPlan, isHotModuleFile, isRefreshBoundary } from "./fast-refresh";

/**
 * Fast Refresh's modules (the fast-refresh experiment, `fast-refresh.ts`):
 * every design module of a Fast Refresh document served on its own, its
 * imports of other design modules rewritten to their URLs in the document's
 * session, and the plan an update follows. What a module inlines (an image,
 * JSON, text, a CSS module's names) stays in it, as the bundle has it; a
 * stylesheet is the document's to carry.
 *
 * A session is one open document: which version of each module it was handed,
 * and the version each module's next import must name, so a module that did not
 * change keeps the one instance the document's module map holds. Only the
 * daemon mints one, as it serves the document, under an id no one can guess:
 * a module or a plan asked for in any other is refused. A daemon that restarts
 * holds none, nor one it has let go, and the next update reloads the document.
 */

/** Inlined into the module that imports it, so a version of that module: what isn't a module or a stylesheet. */
function inlined(path: string): boolean {
	return !isHotModuleFile(path) && (!/\.css$/.test(path) || /\.module\.css$/.test(path));
}

/**
 * A module's version: its bytes and those of what it inlines, as esbuild's
 * metafile lists its imports. The served module and the plan read it the same.
 */
function moduleHash(key: string, inputs: Metafile["inputs"], digestOf: (key: string) => string | undefined): string {
	const own = digestOf(key) ?? "";
	const imports = inputs[key]?.imports ?? [];
	const parts = imports
		.filter((edge) => edge.external !== true && inlined(edge.path))
		.map((edge) => `${edge.path}\0${digestOf(edge.path) ?? ""}`)
		.sort();
	// the design modules it imports, by path: an import that resolves elsewhere is a new version
	const modules = imports
		.map((edge) =>
			edge.path.startsWith(PLACEHOLDER)
				? decodeURIComponent(edge.path.slice(PLACEHOLDER.length))
				: edge.external !== true && isHotModuleFile(edge.path)
					? edge.path
					: undefined,
		)
		.filter((path) => path !== undefined)
		.sort();
	return createHash("sha256")
		.update(JSON.stringify([own, parts, modules]))
		.digest("hex")
		.slice(0, 16);
}

/** What one import resolves to, as a string to compare: a file, external, missing, or refused. */
function answerOf(
	resolveImport: ReturnType<typeof designResolver>,
	specifier: string,
	resolveDir: string,
	kind: ImportKind,
): string {
	try {
		return JSON.stringify(resolveImport(specifier, resolveDir, kind) ?? null);
	} catch (error) {
		return `refused: ${String(error)}`;
	}
}

/** Where a compiled module names another design module, until a session's URL for it is put in. */
const PLACEHOLDER = "__spool_hot__/";
const PLACED = /__spool_hot__\/([A-Za-z0-9%._~!*'()-]+)/g;

/** One module compiled, for every session: what it was made of, so a change to any of it compiles it again. */
interface Compiled {
	digests: ReadonlyMap<string, string>;
	/** Every import it made, and what it resolved to, so a file that comes or goes beside one is a change. */
	probes: readonly Probe[];
	js: string;
	hash: string;
}

interface Probe {
	specifier: string;
	resolveDir: string;
	kind: ImportKind;
	answer: string;
}

interface Session {
	root: string;
	served: Map<string, string>;
	versions: Map<string, number>;
	updates: number;
	/** Each module's version as this session will be handed it: checked when the document was served, or planned. */
	expected: Map<string, string>;
	/** The document's modules compiled ahead: a module asked for waits on it. */
	ready: Promise<void>;
}

/** The sessions one daemon keeps: the last ones opened, so a canvas left open for days never grows it. */
const SESSIONS_KEPT = 256;

export function hotModules(host: CompileHost) {
	const sessions = new Map<string, Session>();
	const compiled = new Map<string, Compiled>();
	const fresh = (designDir: string, entry: Compiled) => {
		const resolvePath = designPathResolver(designDir, host.files);
		for (const [file, digest] of entry.digests) {
			if (contentDigest(readDesignBytes(resolvePath, file, host.files)) !== digest) return false;
		}
		const resolveImport = designResolver(designDir, host.files);
		for (const probe of entry.probes) {
			if (answerOf(resolveImport, probe.specifier, probe.resolveDir, probe.kind) !== probe.answer) return false;
		}
		return true;
	};
	/** A session by its id, as the one it was minted for: the most recently used kept, the least let go first. */
	const sessionOf = (root: string, id: string): Session | undefined => {
		const session = sessions.get(id);
		if (session === undefined || session.root !== root) return undefined;
		sessions.delete(id);
		sessions.set(id, session);
		return session;
	};
	let warming: Promise<unknown> = Promise.resolve();

	/**
	 * A session for a Fast Refresh document as it is served, its modules
	 * compiled ahead alongside: the id it is served with.
	 */
	function open(root: string, designDir: string, modules: readonly string[]): string {
		const id = randomBytes(18).toString("base64url");
		const expected = new Map<string, string>();
		// one warm at a time: a second document of the same closure finds the first's work
		const ready = warming.then(() => warm(designDir, modules, expected));
		warming = ready;
		sessions.set(id, { root, served: new Map(), versions: new Map(), updates: 0, expected, ready });
		for (const old of sessions.keys()) {
			if (sessions.size <= SESSIONS_KEPT) break;
			sessions.delete(old);
		}
		return id;
	}

	/**
	 * One design module for a session, at the version its URL names. Undefined
	 * for a path that names no module; a module that doesn't compile throws.
	 */
	async function module(
		root: string,
		project: string,
		designDir: string,
		path: string,
		id: string,
	): Promise<string | undefined> {
		if (!isHotModuleFile(path) || path.split("/").some((part) => part === ".." || part === "." || part === "")) {
			return undefined;
		}
		const session = sessionOf(root, id);
		if (session === undefined) return undefined;
		await session.ready;
		const key = `${designDir}\0${path}`;
		let entry = compiled.get(key);
		// checked as the document was served, or as its update was planned: no need to read it all again
		const known = entry !== undefined && entry.hash === session.expected.get(path);
		if (entry === undefined || (!known && !fresh(designDir, entry))) {
			entry = (await compile(designDir, [path])).get(path);
			if (entry === undefined) return undefined;
			compiled.set(key, entry);
		}
		session.served.set(path, entry.hash);
		return entry.js.replace(PLACED, (_, dep: string) => {
			const module = decodeURIComponent(dep);
			return hotModuleUrl(project, module, id, session.versions.get(module) ?? 0);
		});
	}

	/**
	 * Modules compiled each on its own, in one build, every design module they
	 * import named by a placeholder; each with the files it was made of. A
	 * module that is no file is left out; any that doesn't compile throws.
	 */
	async function compile(designDir: string, paths: readonly string[]): Promise<Map<string, Compiled>> {
		const reads = createDesignReads(designDir, host.files);
		const entries = new Map<string, string>();
		for (const path of paths) {
			const file = join(designDir, ...path.split("/"));
			if (reads.bytes(file) !== undefined) entries.set(file, path);
		}
		const done = new Map<string, Compiled>();
		if (entries.size === 0) return done;
		const resolveImport = designResolver(designDir, host.files);
		const probes = new Map<string, Probe[]>();
		const toPlaceholders: Plugin = {
			name: "spool-hot-modules",
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					// only the modules' own imports: what they inline is bundled as before
					if (args.kind === "entry-point" || !entries.has(args.importer) || Object.keys(args.with).length > 0) {
						return undefined;
					}
					const shared = args.path.startsWith("shared/");
					const specifier = shared ? `./${args.path}` : args.path;
					const resolveDir = shared ? designDir : args.resolveDir;
					const path = entries.get(args.importer) ?? "";
					probes.set(path, [
						...(probes.get(path) ?? []),
						{
							specifier,
							resolveDir,
							kind: args.kind,
							answer: answerOf(resolveImport, specifier, resolveDir, args.kind),
						},
					]);
					let resolved: ReturnType<typeof resolveImport>;
					try {
						resolved = resolveImport(specifier, resolveDir, args.kind);
					} catch {
						return undefined;
					}
					if (resolved === undefined || !("file" in resolved) || resolved.suffix !== "") return undefined;
					if (!isHotModuleFile(resolved.file)) return undefined;
					return {
						path: PLACEHOLDER + encodeURIComponent(designRelativePath(designDir, resolved.file)),
						external: true,
					};
				});
			},
		};
		const {
			stdin: _,
			plugins = [],
			...options
		} = designBuildOptions({
			designDir,
			resolveDir: designDir,
			sourcefile: "",
			contents: "",
			label: "design/",
			files: host.files,
			reads: () => reads,
			hot: true,
		});
		const result = await host.esbuild.build({
			...options,
			entryPoints: [...entries.keys()],
			plugins: [toPlaceholders, ...plugins],
		});
		const digests = reads.digests();
		const digestOf = (input: string) => digests.get(designInputFile(designDir, input, host.files));
		for (const [out, meta] of Object.entries(result.metafile.outputs)) {
			if (meta.entryPoint === undefined || !out.endsWith(".js")) continue;
			const path = meta.entryPoint;
			const js = result.outputFiles.find((file) => file.path === resolve(designDir, out))?.text;
			if (js === undefined) continue;
			// what this module was made of: its own file, and what it inlines
			const made = new Map<string, string>();
			for (const input of [path, ...(result.metafile.inputs[path]?.imports ?? []).map((edge) => edge.path)]) {
				const file = designInputFile(designDir, input, host.files);
				const digest = digests.get(file);
				if (digest !== undefined) made.set(file, digest);
			}
			done.set(path, {
				digests: made,
				probes: probes.get(path) ?? [],
				js,
				hash: moduleHash(path, result.metafile.inputs, digestOf),
			});
		}
		return done;
	}

	/**
	 * A Fast Refresh document's modules compiled ahead, in one build, as the
	 * document is: its first load then asks for each from the cache.
	 */
	async function warm(designDir: string, paths: readonly string[], expected: Map<string, string>): Promise<void> {
		const stale = paths.filter((path) => {
			const entry = compiled.get(`${designDir}\0${path}`);
			if (entry !== undefined && fresh(designDir, entry)) {
				expected.set(path, entry.hash);
				return false;
			}
			return true;
		});
		try {
			for (const [path, entry] of await compile(designDir, stale)) {
				compiled.set(`${designDir}\0${path}`, entry);
				expected.set(path, entry.hash);
			}
		} catch {
			// each module compiles again when it is asked for, and says why there
		}
	}

	/**
	 * A session's update of one frame: the modules to import again, at their
	 * new versions, and the stylesheets and head key the document checks; or why
	 * only a reload will do.
	 */
	async function plan(
		root: string,
		project: string,
		designDir: string,
		frame: string,
		id: string,
	): Promise<{ refused: string } | { imports: string[]; css: string; bundledCss: string; head: string }> {
		const session = sessionOf(root, id);
		if (session === undefined) return { refused: "the daemon has no record of this document's modules" };
		await session.ready;
		const state = await compileFrameHotState(host, { designDir, frame });
		const entry = `${frameFolder(frame)}/frame.tsx`;
		const digestOf = (key: string) => state.digests.get(designInputFile(designDir, key, host.files));
		const importers = new Map<string, string[]>();
		for (const [key, input] of Object.entries(state.inputs)) {
			if (!isHotModuleFile(key)) continue;
			for (const edge of input.imports) {
				if (edge.external === true || !isHotModuleFile(edge.path)) continue;
				importers.set(edge.path, [...(importers.get(edge.path) ?? []), key]);
			}
		}
		const modules = new Map<string, HotModule>();
		for (const key of Object.keys(state.inputs)) {
			if (!isHotModuleFile(key)) continue;
			const source = state.read(designInputFile(designDir, key, host.files)) ?? "";
			modules.set(key, {
				hash: moduleHash(key, state.inputs, digestOf),
				boundary: isRefreshBoundary(source),
				importers: key === entry ? [] : (importers.get(key) ?? []),
			});
		}
		const planned = hotPlan(modules, session.served);
		if ("refused" in planned) return planned;
		session.updates += 1;
		for (const path of planned.rerun) {
			session.versions.set(path, session.updates);
			const planned = modules.get(path);
			if (planned !== undefined) session.expected.set(path, planned.hash);
		}
		return {
			imports: planned.roots.map((path) => hotModuleUrl(project, path, id, session.updates)),
			css: state.css,
			bundledCss: state.bundledCss,
			head: state.head,
		};
	}

	return { open, module, plan };
}
