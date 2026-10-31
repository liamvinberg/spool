import { createHash } from "node:crypto";

/**
 * Fast Refresh in frames, behind the `fast-refresh` experiment (spool#218).
 *
 * A canvas with the experiment on asks for its frames' documents with
 * `?refresh=1`, and gets them compiled for it: React's development build (the
 * only one that can swap a component), React Refresh's own runtime ahead of
 * React, and every design module closed with a footer that registers its
 * top-level components with their hook signatures and says whether the module
 * may be run again. A save then reaches the open document as a message: the
 * document imports its bundle again from `?update=<n>`, which registers every
 * component afresh, and React Refresh swaps them in place, state and DOM kept.
 * The document answers the canvas, which reloads it as before whenever it says no.
 *
 * The whole bundle is evaluated again on each update, not the changed module
 * alone, so an update is refused unless every module in it may run again: one
 * that exports only components, or only declares functions. A module with any
 * other export (a store, a cache, a table of constants) could hand kept state a
 * fresh copy of what it was made from, so its frame reloads, as before.
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

/** React Refresh's runtime and the document's side of an update, bundled as a classic script run ahead of React (`vendor.ts`). */
export const FAST_REFRESH_RUNTIME = `import * as Refresh from "react-refresh/runtime";
Refresh.injectIntoGlobalHook(window);
let collecting = null;
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
	module(id, rerunnable) {
		if (collecting !== null) collecting.set(id, rerunnable);
	},
	async update(url) {
		if (++updates > ${HOT_UPDATE_LIMIT}) return "${HOT_UPDATE_LIMIT} updates: a reload lets their modules go";
		collecting = new Map();
		let next;
		let mod;
		try {
			mod = await import(url);
		} catch (error) {
			return "the update did not load: " + String(error);
		} finally {
			next = collecting;
			collecting = null;
		}
		for (const [id, rerunnable] of next) if (!rerunnable) return id + " exports more than components";
		if (mod.head !== this.head) return "fonts or the import map changed";
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
const FUNCTION = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\b/;
const COMPONENT_NAME = /^[A-Z]/;
const HOOK_NAME = /^use[A-Z]/;
const HOOK_CALL = /\b(use[A-Z][\w$]*|use)\s*(?:<[^()]*?>)?\s*\(/g;
const TYPE_ONLY = /^(?:export\s+)?(?:declare\s+)?(?:type|interface)\b/;
const QUIET = /^(?:import\b|\/\/|\/\*|\*|export\s*\{\s*\}\s*;?\s*$)/;
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

/**
 * What a design module closes with in a document compiled for Fast Refresh:
 * its record (path, and whether it may run again: every export a component,
 * or nothing but functions declared), each top-level component registered
 * under `<path>#<name>`, and each one's signature, so a change to its hooks
 * remounts it rather than handing it state of another shape.
 */
export function refreshFooter(id: string, source: string): string {
	const lines = source.split("\n");
	const tops: { name: string; from: number }[] = [];
	let boundary = true;
	let functionsOnly = true;
	const exportName = (name: string) => {
		if (!COMPONENT_NAME.test(name)) boundary = false;
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
		if (!QUIET.test(line) && !FUNCTION.test(line) && !/^export\s*\{/.test(line)) functionsOnly = false;
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
				functionsOnly = false;
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
		if (declared[1] !== undefined) {
			if (name === "") boundary = false;
			else exportName(name);
		}
		tops.push({ name, from: at });
	}
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
	const out = [`\n;globalThis.__spoolHot?.module(${JSON.stringify(id)}, ${boundary || functionsOnly});`];
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
 */
export function hotHeadKey(fonts: string | undefined, importMap: string | undefined): string {
	return createHash("sha256")
		.update(JSON.stringify([fonts ?? null, importMap ?? null]))
		.digest("hex")
		.slice(0, 16);
}

/**
 * The document's half of an update, appended to its boot entry: the canvas
 * asks with a message, the document imports its bundle again and answers. One
 * update runs at a time; asks that arrive meanwhile coalesce into the latest,
 * which alone is answered, because the bundle it imports is the newest anyway.
 */
export const HOT_BOOT_CLIENT = `let hotRunning = false;
let hotNext = null;
async function drainHot() {
	hotRunning = true;
	while (hotNext !== null) {
		const id = hotNext;
		hotNext = null;
		const url = new URL(location.pathname, location.href);
		url.searchParams.set("update", String(id));
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

/** The entry an update is bundled from: the frame, and nothing that renders it. */
export const HOT_UPDATE_ENTRY = `import "./frame.tsx";\n`;
