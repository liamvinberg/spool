import { readFileSync } from "node:fs";
import { dirname, extname, posix, relative, resolve } from "node:path";
import { parse } from "@babel/parser";
import { resolveDesignPath } from "../daemon/design-path";
import { walkNodes } from "../daemon/jsx-walk";
import { mapCssResources } from "./css-resources";
import { fetchPublicResource, type ResourceFetcher } from "./fetch";
import { MAX_OBJECT_BYTES, MAX_OBJECTS, MAX_VERSION_BYTES, sha256 } from "./manifest";

export interface ResourceObject {
	bytes: Uint8Array;
	mediaType: string;
}
type Resource = { source: string; path: string; kind: "module" | "css" | "binary" };

/** Resolve only source-declared resources; never execute a project or dependency. */
export function createResources(
	designDir: string,
	importMap: Readonly<Record<string, string>>,
	fetcher: ResourceFetcher = fetchPublicResource,
) {
	const objects = new Map<string, ResourceObject>();
	const scheduled = new Map<string, Resource>();
	const queue: Resource[] = [];
	const builtins = new Map<string, string>();
	let totalBytes = 0;
	function add(path: string, bytes: Uint8Array | string, mediaType: string) {
		const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
		if (data.byteLength > MAX_OBJECT_BYTES) throw new Error(`Resource "${path}" exceeds 25 MiB.`);
		if (!objects.has(path) && objects.size >= MAX_OBJECTS) throw new Error("The website exceeds 2,000 resources.");
		const nextBytes = totalBytes - (objects.get(path)?.bytes.byteLength ?? 0) + data.byteLength;
		if (nextBytes > MAX_VERSION_BYTES) throw new Error("The website exceeds 100 MiB.");
		totalBytes = nextBytes;
		objects.set(path, { bytes: data, mediaType });
	}
	function pin(specifiers: readonly string[], path: string, js: string) {
		add(path, js, "application/javascript");
		for (const name of specifiers) builtins.set(name, path);
	}
	function resource(source: string, kind: Resource["kind"]): string {
		const previous = scheduled.get(source);
		if (previous !== undefined) return previous.path;
		if (scheduled.size >= MAX_OBJECTS) throw new Error("The website exceeds 2,000 resources.");
		const suffix =
			kind === "module"
				? ".js"
				: kind === "css"
					? ".css"
					: extname(source.split(/[?#]/)[0] ?? "").slice(0, 12) || ".bin";
		const entry = {
			source,
			path: `resources/${sha256(source.startsWith("https://") ? source : relative(designDir, source)).slice(0, 32)}${suffix}`,
			kind,
		};
		scheduled.set(source, entry);
		queue.push(entry);
		return entry.path;
	}
	function resolveModule(specifier: string, from?: string): string {
		const builtin = builtins.get(specifier);
		if (builtin !== undefined) return builtin;
		let source: string;
		if (/^https:\/\//i.test(specifier)) source = specifier;
		else if (from !== undefined && (specifier.startsWith(".") || specifier.startsWith("/")))
			source = new URL(specifier, from).href;
		else {
			const mapped = importMap[specifier];
			if (mapped === undefined)
				throw new Error(
					`Module "${specifier}" has no import-map resource. Add a pinned HTTPS import in shared/importmap.json.`,
				);
			source = mapped;
		}
		if (!source.startsWith("https://"))
			throw new Error(`Module "${specifier}" must resolve to a public HTTPS resource.`);
		return resource(source, "module");
	}
	function rewriteModule(js: string, path: string, from?: string): string {
		const program = parse(js, { sourceType: "module" }).program;
		const edits: { start: number; end: number; text: string }[] = [];
		walkNodes(program, [], (node) => {
			let target: Extract<typeof node, { type: "StringLiteral" }> | undefined;
			if (
				(node.type === "ImportDeclaration" ||
					node.type === "ExportNamedDeclaration" ||
					node.type === "ExportAllDeclaration") &&
				node.source?.type === "StringLiteral"
			)
				target = node.source;
			if (node.type === "CallExpression" && node.callee.type === "Import") {
				const argument = node.arguments[0];
				if (argument?.type !== "StringLiteral")
					throw new Error(`A computed module import in "${path}" cannot be exported. Use a literal import.`);
				target = argument;
			}
			if (target === undefined || target.start == null || target.end == null) return;
			if (from === undefined && (target.value.startsWith("./") || target.value.startsWith("../"))) return;
			const local = resolveModule(target.value, from);
			const relative = posix.relative(posix.dirname(path), local);
			edits.push({
				start: target.start,
				end: target.end,
				text: JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`),
			});
		});
		for (const edit of edits.sort((a, b) => b.start - a.start))
			js = js.slice(0, edit.start) + edit.text + js.slice(edit.end);
		return js.replace(/\/\/[#@]\s*sourceMappingURL=[^\r\n]*/g, "");
	}
	function rewriteCss(css: string, path: string, from: string): string {
		function reference(value: string, imported: boolean): string {
			if (value.startsWith("data:") || value.startsWith("#")) return value;
			let source: string;
			if (/^https:\/\//i.test(value)) source = value;
			else if (/^https:\/\//i.test(from)) source = new URL(value, from).href;
			else {
				if (value.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(value))
					throw new Error(`Local CSS URL "${value}" cannot be exported. Use a relative resource within design/.`);
				source = resolveDesignPath(designDir, resolve(dirname(from), value.split(/[?#]/)[0] ?? ""));
			}
			const target = resource(source, imported || /\.css(?:[?#]|$)/i.test(source) ? "css" : "binary");
			const relative = posix.relative(posix.dirname(path), target);
			return relative.startsWith(".") ? relative : `./${relative}`;
		}
		return mapCssResources(css, reference);
	}
	async function finish(): Promise<void> {
		for (let at = 0; at < queue.length; at++) {
			const entry = queue[at];
			if (entry === undefined) continue;
			const remote = entry.source.startsWith("https://");
			const result = remote
				? await fetcher(entry.source)
				: {
						bytes: readFileSync(resolveDesignPath(designDir, entry.source)),
						mediaType: mediaType(entry.source),
						url: entry.source,
					};
			const source = result.url;
			if (entry.kind === "module")
				add(
					entry.path,
					rewriteModule(Buffer.from(result.bytes).toString("utf8"), entry.path, source),
					"application/javascript",
				);
			else if (entry.kind === "css")
				add(entry.path, rewriteCss(Buffer.from(result.bytes).toString("utf8"), entry.path, source), "text/css");
			else add(entry.path, result.bytes, result.mediaType);
		}
	}
	return { objects, add, pin, rewriteModule, rewriteCss, finish };
}
function mediaType(path: string): string {
	const types: Record<string, string> = {
		".woff2": "font/woff2",
		".woff": "font/woff",
		".ttf": "font/ttf",
		".otf": "font/otf",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".svg": "image/svg+xml",
		".gif": "image/gif",
		".webp": "image/webp",
		".css": "text/css",
	};
	return types[extname(path).toLowerCase()] ?? "application/octet-stream";
}
