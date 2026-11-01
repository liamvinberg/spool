import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Metafile, Plugin } from "esbuild";
import { frameFolder } from "../page-path";
import { IMAGE_BUDGET_BYTES } from "./assets";
import { designRelativePath } from "./design-boundary";
import { type CompileHost, compileFrameHotState, designBuildOptions, designInputFile } from "./design-compile";
import { createDesignReads } from "./design-reads";
import { designResolver } from "./design-resolve";
import { type HotModule, hotModuleUrl, hotPlan, isRefreshBoundary } from "./fast-refresh";

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
 * change keeps the one instance the document's module map holds. A daemon
 * that restarts has none, and the next update reloads the document.
 */

/** A design module: a script esbuild reads as one, named by its path alone. */
export function isHotModuleFile(path: string): boolean {
	return /\.(?:[mc]?[jt]s|[jt]sx)$/.test(path) && !/[?#]/.test(path);
}

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
	const parts = (inputs[key]?.imports ?? [])
		.filter((edge) => edge.external !== true && inlined(edge.path))
		.map((edge) => `${edge.path}\0${digestOf(edge.path) ?? ""}`)
		.sort();
	return createHash("sha256")
		.update(JSON.stringify([own, parts]))
		.digest("hex")
		.slice(0, 16);
}

interface Session {
	served: Map<string, string>;
	versions: Map<string, number>;
	updates: number;
}

/** The sessions one daemon keeps: the last ones opened, so a canvas left open for days never grows it. */
const SESSIONS_KEPT = 256;

export function hotModules(host: CompileHost) {
	const sessions = new Map<string, Session>();
	const sessionOf = (root: string, id: string, open: boolean): Session | undefined => {
		const key = `${root}\0${id}`;
		let session = sessions.get(key);
		if (session === undefined && open) {
			session = { served: new Map(), versions: new Map(), updates: 0 };
			sessions.set(key, session);
			for (const old of sessions.keys()) {
				if (sessions.size <= SESSIONS_KEPT) break;
				sessions.delete(old);
			}
		}
		return session;
	};

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
		if (!isHotModuleFile(path) || path.split("/").some((part) => part === ".." || part === "")) return undefined;
		const session = sessionOf(root, id, true);
		if (session === undefined) return undefined;
		const file = join(designDir, ...path.split("/"));
		const reads = createDesignReads(designDir, host.files);
		if (reads.bytes(file) === undefined) return undefined;
		const resolveImport = designResolver(designDir, host.files);
		const versionOf = (dep: string) => session.versions.get(dep) ?? 0;
		const toUrls: Plugin = {
			name: "spool-hot-modules",
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					// only the module's own imports: what it inlines is bundled as before
					if (args.kind === "entry-point" || args.importer !== file || Object.keys(args.with).length > 0) {
						return undefined;
					}
					const shared = args.path.startsWith("shared/");
					let resolved: ReturnType<typeof resolveImport>;
					try {
						resolved = resolveImport(
							shared ? `./${args.path}` : args.path,
							shared ? designDir : args.resolveDir,
							args.kind,
						);
					} catch {
						return undefined;
					}
					if (resolved === undefined || !("file" in resolved) || resolved.suffix !== "") return undefined;
					if (!isHotModuleFile(resolved.file)) return undefined;
					const dep = designRelativePath(designDir, resolved.file);
					return { path: hotModuleUrl(project, dep, id, versionOf(dep)), external: true };
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
			sourcefile: path,
			contents: "",
			label: `design/${path}`,
			imageBudget: IMAGE_BUDGET_BYTES,
			files: host.files,
			reads: () => reads,
			hot: true,
		});
		const result = await host.esbuild.build({ ...options, entryPoints: [file], plugins: [toUrls, ...plugins] });
		const js = result.outputFiles.find((out) => out.path.endsWith(".js"))?.text;
		if (js === undefined) throw new Error(`design/${path} compiled to no module`);
		const digests = reads.digests();
		session.served.set(
			path,
			moduleHash(path, result.metafile.inputs, (key) => digests.get(designInputFile(designDir, key, host.files))),
		);
		return js;
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
		const session = sessionOf(root, id, false);
		if (session === undefined) return { refused: "the daemon has no record of this document's modules" };
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
		for (const path of planned.rerun) session.versions.set(path, session.updates);
		return {
			imports: planned.roots.map((path) => hotModuleUrl(project, path, id, session.updates)),
			css: state.css,
			bundledCss: state.bundledCss,
			head: state.head,
		};
	}

	return { module, plan };
}
