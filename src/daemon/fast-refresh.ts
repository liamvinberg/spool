import { createHash } from "node:crypto";

/**
 * Fast Refresh in frames, behind the `fast-refresh` experiment (spool#218).
 *
 * A canvas with the experiment on asks for its frames' documents with
 * `?refresh=1`, and gets them compiled for it: React's development build (the
 * only one that can swap a component), React Refresh's own runtime ahead of
 * React, and every design module closed with a footer that registers its
 * top-level components and says whether it exports only components. A save then
 * reaches the open document as a message: the document imports its bundle
 * again from `?update=<n>`, which registers every component afresh, and React
 * Refresh swaps them in place, state and DOM kept. The document answers the
 * canvas, which reloads it as before whenever it says no.
 *
 * The whole bundle is evaluated again on each update, not the changed module
 * alone: a module's top-level code runs again and its module-level state starts
 * over. What the registration reads is the file's text, top-level declarations
 * at column 0, rather than a parse: a component it misses is remounted rather
 * than kept, and a hook it misses at worst throws, which reloads.
 */

/** React Refresh's runtime and the document's side of an update, bundled as a classic script run ahead of React (`vendor.ts`). */
export const FAST_REFRESH_RUNTIME = `import * as Refresh from "react-refresh/runtime";
Refresh.injectIntoGlobalHook(window);
const modules = new Map();
let collecting = null;
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
window.__spoolHot = {
	register(type, id) {
		if (typeof type === "function" || (typeof type === "object" && type !== null)) Refresh.register(type, id);
	},
	sign(type, key) {
		if (typeof type === "function") Refresh.setSignature(type, key);
	},
	module(id, hash, boundary) {
		(collecting ?? modules).set(id, { hash, boundary });
	},
	async update(url) {
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
		for (const [id, record] of next) {
			const was = modules.get(id);
			if ((was === undefined || was.hash !== record.hash) && !record.boundary) return id + " exports more than components";
		}
		for (const [id, record] of next) modules.set(id, record);
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
		if (Refresh.hasUnrecoverableErrors()) return "the refresh left an unrecoverable error";
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
const HOOK_CALL = /\b(use[A-Z][\w$]*|use)\s*(?:<[^()]*?>)?\s*\(/g;
const TYPE_ONLY = /^export\s+(?:declare\s+)?(?:type|interface)\b/;

/**
 * What a design module closes with in a document compiled for Fast Refresh:
 * its record (path, content hash, whether every export is a component), each
 * top-level component registered under `<path>#<name>`, and each one's hook
 * calls as its signature, so a change to its hooks remounts it rather than
 * handing it state of another shape.
 */
export function refreshFooter(id: string, source: string): string {
	const lines = source.split("\n");
	const tops: { name: string; from: number }[] = [];
	let boundary = true;
	const exportName = (name: string) => {
		if (!COMPONENT_NAME.test(name)) boundary = false;
	};
	for (const [at, line] of lines.entries()) {
		if (line === "" || /^[\s})\]]/.test(line)) continue;
		if (/^export\b/.test(line) && !TYPE_ONLY.test(line)) {
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
		if (declared[1] !== undefined) {
			if (name === "") boundary = false;
			else exportName(name);
		}
		tops.push({ name, from: at });
	}
	const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
	const out = [`\n;globalThis.__spoolHot?.module(${JSON.stringify(id)}, "${hash}", ${boundary});`];
	for (const [index, top] of tops.entries()) {
		if (!COMPONENT_NAME.test(top.name)) continue;
		const body = lines.slice(top.from, tops[index + 1]?.from ?? lines.length).join("\n");
		const hooks = [...body.matchAll(HOOK_CALL)].map((match) => match[1]).join(",");
		const key = JSON.stringify(`${id}#${top.name}`);
		out.push(
			`try { globalThis.__spoolHot?.register(${top.name}, ${key}); globalThis.__spoolHot?.sign(${top.name}, ${JSON.stringify(hooks)}); } catch {}`,
		);
	}
	return `${out.join("\n")}\n`;
}

/**
 * The document's half of an update, appended to its boot entry: the canvas
 * asks with a message, the document imports its bundle again and answers.
 */
export const HOT_BOOT_CLIENT = `addEventListener("message", (event) => {
	const data = event.data;
	if (event.source !== parent || data === null || typeof data !== "object" || data.spool !== "hot" || typeof data.id !== "number") return;
	const url = new URL(location.pathname, location.href);
	url.searchParams.set("update", String(data.id));
	void window.__spoolHot.update(url.href).then((refused) => report("hot", { id: data.id, ok: refused === null, ...(refused === null ? {} : { refused }) }));
});
`;

/** The entry an update is bundled from: the frame, and nothing that renders it. */
export const HOT_UPDATE_ENTRY = `import "./frame.tsx";\n`;
