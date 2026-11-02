import { createHash } from "node:crypto";

/**
 * Fast Refresh in frames, behind the `fast-refresh` experiment (spool#218).
 *
 * A canvas with the experiment on asks for its frames' documents with
 * `?refresh=1`, and gets them compiled for it: React's development build (the
 * only one that can swap a component), React Refresh's own runtime ahead of
 * React, and every design module served on its own (`hot-modules.ts`), at a
 * URL that names the document's session and the module's version in it, each
 * closed with a footer that registers its top-level components with their hook
 * signatures. A save reaches the open document as a message, and the document
 * asks the daemon for a plan (`hotPlan`): the modules whose source changed
 * since this document loaded them, and their importers up to the nearest
 * module that exports only components. Those alone get a new version and are
 * imported again; every other module keeps its instance in the document's
 * module map, its state with it, and React Refresh swaps the components in
 * place. A change that climbs to the frame without meeting such a module, or
 * any refusal, reloads the document as before.
 *
 * What the registration reads is the file's text, top-level declarations at
 * column 0, rather than a parse: a component it misses is remounted rather than
 * kept, and a hook signature reads each hook call's whole line, in order, so
 * reordered or changed hooks remount the component. A custom hook declared in
 * the same module is signed through; one from elsewhere remounts its caller on
 * every update rather than guess.
 */

/** Updates one document takes before it asks to be reloaded: each leaves its module in the realm for good. */
export const HOT_UPDATE_LIMIT = 50;

/** Where a Fast Refresh document names its session, until the daemon serves it with one of its own. */
export const HOT_SESSION_PLACEHOLDER = "__spool_hot_session__";

/** React Refresh's runtime and the document's side of an update, bundled as a classic script run ahead of React (`vendor.ts`). */
export const FAST_REFRESH_RUNTIME = `import * as Refresh from "react-refresh/runtime";
Refresh.injectIntoGlobalHook(window);
let updates = 0;
const tick = () => new Promise((done) => { const channel = new MessageChannel(); channel.port1.onmessage = () => done(); channel.port2.postMessage(0); });
function swapStyle(id, css, after) {
	if (typeof css !== "string") return;
	let style = document.getElementById(id);
	if (style === null) {
		if (css === "") return;
		style = document.createElement("style");
		style.id = id;
		const anchor = document.getElementById(after);
		if (anchor !== null) anchor.after(style);
		else document.head.append(style);
	}
	if (style.textContent !== css) style.textContent = css;
}
const isType = (type) => typeof type === "function" || (typeof type === "object" && type !== null);
window.__spoolHot = {
	head: null,
	// this document's name to the daemon, minted as it served the document (\`hot-modules.ts\`)
	session: "${HOT_SESSION_PLACEHOLDER}",
	register(type, id) {
		if (isType(type)) Refresh.register(type, id);
	},
	sign(type, key, forceReset) {
		if (!isType(type)) return;
		Refresh.setSignature(type, key, forceReset);
		// memo and forwardRef: the render function inside carries the hooks
		const inner = type.render ?? type.type;
		if (typeof inner === "function") Refresh.setSignature(inner, key, forceReset);
	},
	async update(url) {
		if (++updates > ${HOT_UPDATE_LIMIT}) return "${HOT_UPDATE_LIMIT} updates: a reload lets their modules go";
		let plan;
		try {
			const answer = await fetch(url, { cache: "no-store" });
			if (!answer.ok) return "the plan failed: " + answer.status;
			plan = await answer.json();
		} catch (error) {
			return "the plan did not load: " + String(error);
		}
		if (typeof plan.refused === "string") return plan.refused;
		if (plan.head !== this.head) return "fonts or the import map changed";
		let roots;
		try {
			roots = await Promise.all(plan.imports.map((next) => import(next)));
		} catch (error) {
			return "the update did not load: " + String(error);
		}
		// the daemon read each root as exporting only components; what it exports
		// now is the proof, as Vite checks: anything else would leave its importers
		// holding the old value while the refresh re-renders nothing
		for (const [at, root] of roots.entries()) {
			for (const [name, value] of Object.entries(root)) {
				if (!Refresh.isLikelyComponentType(value) || Refresh.getFamilyByType(value) === undefined) {
					return plan.imports[at] + " exports " + name + ", which is no component";
				}
			}
		}
		const mod = plan;
		swapStyle("spool-css", mod.css, "");
		swapStyle("spool-bundled-css", mod.bundledCss, "spool-css");
		const root = document.getElementById("root");
		const had = root !== null && root.childNodes.length > 0;
		let failed = null;
		const onError = (event) => { failed = String(event.error ?? event.message); };
		addEventListener("error", onError);
		try {
			Refresh.performReactRefresh();
			await tick();
		} catch (error) {
			failed = String(error);
		} finally {
			removeEventListener("error", onError);
		}
		if (failed !== null) return "the refresh threw: " + failed;
		if (had && root.childNodes.length === 0) return "the refresh emptied the frame";
		return null;
	},
};
`;

const IDENT = "[A-Za-z_$][\\w$]*";
/** A top-level declaration: at column 0, exported or not. */
const DECLARATION = new RegExp(
	`^(export\\s+(?:default\\s+)?)?(?:declare\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*(${IDENT})|(?:const|let|var)\\s+(${IDENT})|class\\s+(${IDENT}))`,
);
const COMPONENT_NAME = /^[A-Z]/;
/** A capitalised name that reads as a constant, not a component: USERS, API_URL. */
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]+$/;
/** What a component's `const` is set to: a function, or React's wrappers of one. */
const COMPONENT_VALUE =
	/^\s*(?:async\s*)?(?:\(|function\b|[A-Za-z_$][\w$]*\s*=>|(?:React\.)?(?:memo|forwardRef|lazy)\s*[(<])/;
const HOOK_NAME = /^use[A-Z]/;
const HOOK_CALL = /\b(use[A-Z][\w$]*|use)\s*(?:<[^()]*?>)?\s*\(/g;
const TYPE_ONLY = /^(?:export\s+)?(?:declare\s+)?(?:type|interface)\b/;
/** React's own hooks: their state is React's to keep. Any other is a custom hook. */
const REACT_HOOKS = new Set([
	"use",
	"useActionState",
	"useCallback",
	"useContext",
	"useDebugValue",
	"useDeferredValue",
	"useEffect",
	"useId",
	"useImperativeHandle",
	"useInsertionEffect",
	"useLayoutEffect",
	"useMemo",
	"useOptimistic",
	"useReducer",
	"useRef",
	"useState",
	"useSyncExternalStore",
	"useTransition",
	"useFormStatus",
]);

/** A component's or custom hook's signature: each hook call's line, in order, and whether it must remount. */
interface Signature {
	key: string;
	forceReset: boolean;
}

/** A module's top-level declarations, read off column 0, and whether every export it has is a component. */
function scan(source: string): { lines: string[]; tops: { name: string; from: number }[]; boundary: boolean } {
	const lines = source.split("\n");
	const tops: { name: string; from: number }[] = [];
	let boundary = true;
	// what each top-level name was declared as, and every name exported, read at the end
	const kinds = new Map<string, "class" | "function" | "value">();
	const exported: string[] = [];
	const exportName = (name: string) => {
		if (!COMPONENT_NAME.test(name) || CONSTANT_NAME.test(name)) boundary = false;
		else exported.push(name);
	};
	let typeBlock = false;
	for (const [at, line] of lines.entries()) {
		if (line === "" || /^[\s})\]]/.test(line)) continue;
		// a multi-line type's own lines, at column 0, belong to it
		if (TYPE_ONLY.test(line)) {
			typeBlock = !/[;}]\s*$/.test(line);
			tops.push({ name: "", from: at });
			continue;
		}
		if (typeBlock && /^[|&]/.test(line)) continue;
		typeBlock = false;
		if (/^export\b/.test(line)) {
			const list = /^export\s*\{([^}]*)\}/.exec(line);
			if (list !== null) {
				for (const part of (list[1] ?? "").split(",")) {
					const name =
						part
							.trim()
							.split(/\s+as\s+/)
							.pop() ?? "";
					if (name !== "" && !name.startsWith("type ")) exportName(name);
				}
			} else if (/^export\s+(?:\*|\{)/.test(line) || /^export\s+(?:const\s+)?enum\b/.test(line)) {
				boundary = false;
			} else if (/^export\s+default\s+/.test(line) && !DECLARATION.test(line)) {
				const named = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/.exec(line);
				if (named === null) boundary = false;
				else exportName(named[1] ?? "");
			}
		}
		const declared = DECLARATION.exec(line);
		if (declared === null) {
			tops.push({ name: "", from: at });
			continue;
		}
		const name = declared[2] ?? declared[3] ?? declared[4] ?? "";
		if (declared[2] !== undefined) kinds.set(name, "function");
		else if (declared[4] !== undefined) kinds.set(name, "class");
		else if (declared[3] !== undefined) {
			const value = line.slice(line.indexOf("=", declared[0].length) + 1);
			kinds.set(name, line.includes("=", declared[0].length) && COMPONENT_VALUE.test(value) ? "function" : "value");
		}
		if (declared[1] !== undefined) {
			if (name === "") boundary = false;
			else exportName(name);
		}
		tops.push({ name, from: at });
	}
	// a component is a function: a class or any other value exported is not one, whatever its name
	for (const name of exported) if (kinds.has(name) && kinds.get(name) !== "function") boundary = false;
	return { lines, tops, boundary };
}

/**
 * Whether a module exports only components: the boundary an update stops
 * climbing at, because React Refresh swaps its components in its importers'
 * trees without their running again (`hotPlan`).
 */
export function isRefreshBoundary(source: string): boolean {
	return scan(source).boundary;
}

/**
 * What a design module closes with in a document compiled for Fast Refresh:
 * each top-level component registered under `<path>#<name>`, and each one's
 * signature, so a change to its hooks remounts it rather than handing it state
 * of another shape.
 */
export function refreshFooter(id: string, source: string): string {
	const { lines, tops } = scan(source);
	const bodies = new Map<string, string>();
	for (const [index, top] of tops.entries()) {
		if (top.name !== "")
			bodies.set(top.name, lines.slice(top.from, tops[index + 1]?.from ?? lines.length).join("\n"));
	}
	const signed = new Map<string, Signature>();
	const signatureOf = (name: string, seen: Set<string>): Signature => {
		const known = signed.get(name);
		if (known !== undefined) return known;
		const body = bodies.get(name) ?? "";
		const parts: string[] = [];
		let forceReset = false;
		for (const match of body.matchAll(HOOK_CALL)) {
			const hook = match[1] ?? "";
			const from = body.lastIndexOf("\n", match.index) + 1;
			// a hook's own declaration is no call
			if (/function\s*\*?\s*$/.test(body.slice(from, match.index))) continue;
			const to = body.indexOf("\n", match.index);
			parts.push(body.slice(from, to === -1 ? undefined : to).trim());
			if (REACT_HOOKS.has(hook)) continue;
			// a custom hook signs through when it is declared here; from elsewhere it can't be seen into
			if (!bodies.has(hook) || seen.has(hook)) {
				forceReset = true;
				continue;
			}
			const inner = signatureOf(hook, new Set([...seen, hook]));
			parts.push(`{${inner.key}}`);
			forceReset ||= inner.forceReset;
		}
		const signature = { key: parts.join("\n"), forceReset };
		signed.set(name, signature);
		return signature;
	};
	const out = [""];
	for (const name of bodies.keys()) {
		if (!COMPONENT_NAME.test(name) || HOOK_NAME.test(name)) continue;
		const { key, forceReset } = signatureOf(name, new Set());
		const family = JSON.stringify(`${id}#${name}`);
		out.push(
			`try { globalThis.__spoolHot?.register(${name}, ${family}); globalThis.__spoolHot?.sign(${name}, ${JSON.stringify(key)}, ${forceReset}); } catch {}`,
		);
	}
	return `${out.join("\n")}\n`;
}

/**
 * The fonts and import map a document was made with, as one key: neither can
 * change under a running document, so an update that brings others is refused.
 * The fonts are the stylesheet that names them and the bytes of every local
 * face it, or the theme, names (`faces`, their digests in order): a face file
 * changed behind the same stylesheet is new fonts too.
 */
export function hotHeadKey(
	fonts: string | undefined,
	importMap: string | undefined,
	faces: readonly (string | null)[] = [],
): string {
	return createHash("sha256")
		.update(JSON.stringify([fonts ?? null, importMap ?? null, faces]))
		.digest("hex")
		.slice(0, 16);
}

/**
 * The document's half of an update, appended to its boot entry: the canvas
 * asks with a message, the document asks the daemon for its plan, imports what
 * it names and answers. One update runs at a time; asks that arrive meanwhile
 * coalesce into the latest, which alone is answered, because the plan it asks
 * for is made from the files as they are by then.
 */
export const HOT_BOOT_CLIENT = `let hotRunning = false;
let hotNext = null;
async function drainHot() {
	hotRunning = true;
	while (hotNext !== null) {
		const id = hotNext;
		hotNext = null;
		const url = new URL(location.pathname, location.href);
		url.searchParams.set("hot", window.__spoolHot.session);
		url.searchParams.set("n", String(id));
		let refused;
		try {
			refused = await window.__spoolHot.update(url.href);
		} catch (error) {
			refused = String(error);
		}
		if (hotNext === null) report("hot", { id, ok: refused === null, ...(refused === null ? {} : { refused }) });
	}
	hotRunning = false;
}
addEventListener("message", (event) => {
	const data = event.data;
	if (event.source !== parent || data === null || typeof data !== "object" || data.spool !== "hot" || typeof data.id !== "number") return;
	hotNext = data.id;
	if (!hotRunning) void drainHot();
});
`;

/** A design module: a script esbuild reads as one, named by its path alone. */
export function isHotModuleFile(path: string): boolean {
	return /\.(?:[mc]?[jt]s|[jt]sx)$/.test(path) && !/[?#]/.test(path);
}

/** Where a design module is served on its own for a Fast Refresh document: its path in design/, under its project. */
export function hotModulePath(project: string, module: string): string {
	return `/p/${encodeURIComponent(project)}/hot/${encodeURIComponent(module)}`;
}

/**
 * Every module of a frame's closure fetched at once, as the document's head is
 * read, so neither the boot's own imports nor one module's imports wait.
 */
export function hotPreloads(project: string, closure: readonly string[]): string {
	return closure
		.map(
			(path) =>
				`<link rel="modulepreload" href="${hotModuleUrl(project, path, HOT_SESSION_PLACEHOLDER, 0).replaceAll("&", "&amp;")}">\n`,
		)
		.join("");
}

/** One version of a module in one document's session: the URL its module map knows it by. */
export function hotModuleUrl(project: string, module: string, session: string, version: number): string {
	return `${hotModulePath(project, module)}?s=${encodeURIComponent(session)}&v=${version}`;
}

/**
 * A Fast Refresh document's own module: what `bootEntry` is, with the frame
 * imported from its served URL in this document's session rather than bundled.
 */
export function hotBootEntry(frame: string, project: string, entry: string): string {
	const url = JSON.stringify(hotModuleUrl(project, entry, HOT_SESSION_PLACEHOLDER, 0));
	return `import "spool";
import { createElement, Fragment, useEffect } from "react";
import { createRoot } from "react-dom/client";
const FRAME = ${JSON.stringify(frame)};
function report(spool, detail) {
	if (parent !== window) parent.postMessage({ spool, frame: FRAME, ...detail }, "*");
}
addEventListener("error", (event) => report("error", { error: String(event.error ?? event.message) }));
addEventListener("unhandledrejection", (event) => report("error", { error: String(event.reason) }));
const { default: Frame } = await import(${url});
function Ready() {
	useEffect(() => report("loaded", {}), []);
	return null;
}
createRoot(document.getElementById("root")).render(
	createElement(Fragment, null, createElement(Frame), createElement(Ready)),
);
${HOT_BOOT_CLIENT}`;
}

/** A design module in a frame's closure, as an update plans over it. */
export interface HotModule {
	/** Its version as served: its own bytes and what it inlines (`hot-modules.ts`). */
	hash: string;
	/** Exports only components (`isRefreshBoundary`). */
	boundary: boolean;
	/** The design modules that import it; none for the frame's own. */
	importers: readonly string[];
}

export type HotPlan = { refused: string } | { rerun: string[]; roots: string[] };

/**
 * What an update runs again, Vite's way: every module whose version differs
 * from what this document loaded, and from each, its importers up to the
 * nearest component-only module, the root an update imports again. A module
 * the document never loaded is no change: it loads fresh when it is first
 * asked for. A change that climbs to the frame's own module, and it no
 * boundary, can't be swapped in, and the document reloads.
 */
export function hotPlan(modules: ReadonlyMap<string, HotModule>, served: ReadonlyMap<string, string>): HotPlan {
	const rerun = new Set<string>();
	const roots = new Set<string>();
	let refused: string | undefined;
	const climb = (path: string) => {
		if (rerun.has(path) || refused !== undefined) return;
		rerun.add(path);
		const module = modules.get(path);
		if (module === undefined) return;
		if (module.boundary) {
			roots.add(path);
			return;
		}
		if (module.importers.length === 0) {
			refused = `${path} exports more than components, and nothing above it only components`;
			return;
		}
		for (const importer of module.importers) climb(importer);
	};
	for (const [path, module] of modules) {
		const was = served.get(path);
		if (was !== undefined && was !== module.hash) climb(path);
	}
	if (refused !== undefined) return { refused };
	return { rerun: [...rerun].sort(), roots: [...roots].sort() };
}
