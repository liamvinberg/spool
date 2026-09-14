import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { parse } from "@babel/parser";
import { realDesignDir } from "../daemon/design-path";
import { escapeHtml } from "../daemon/document";
import { walkNodes } from "../daemon/jsx-walk";
import { REACT_SPECIFIERS, vendorPublicationJs, vendorReactJs } from "../daemon/vendor";
import { type CaptureOptions, withCapturedWebsite } from "./capture";
import { mapCssResources } from "./css-resources";
import type { ResourceFetcher } from "./fetch";
import { type ArtifactManifest, canonicalJson, sealManifest, sha256, validateManifest } from "./manifest";
import { createResources, type ResourceObject } from "./resources";

export interface WebsiteBuildOptions extends CaptureOptions {
	fetchResource?: ResourceFetcher;
}
export interface WebsiteArtifact {
	manifest: ArtifactManifest;
	inputIdentity: string;
	objects: ReadonlyMap<string, ResourceObject>;
}

/** One internal exporter for the offline CLI and the publishing client. */
export async function buildWebsite(options: WebsiteBuildOptions): Promise<WebsiteArtifact> {
	return withCapturedWebsite(options, async (capture) => {
		const map = capture.bundle.importMap as { imports: Record<string, string> };
		const resources = createResources(capture.designDir, map.imports, options.fetchResource);
		const [react, runtime] = await Promise.all([vendorReactJs(), vendorPublicationJs()]);
		resources.pin(REACT_SPECIFIERS, "vendor/react.js", react);
		resources.pin(["spool"], "vendor/spool.js", runtime.js);
		resources.add(
			"vendor/spool.js",
			resources.rewriteModule(runtime.js, "vendor/spool.js"),
			"application/javascript",
		);
		const services = new Set<string>();
		for (const [name, content] of capture.bundle.chunks) {
			if (name.endsWith(".css"))
				resources.add(
					name,
					resources.rewriteCss(content, name, join(capture.designDir, "shared", "tokens.css")),
					"text/css",
				);
			else {
				knownServices(content, services);
				resources.add(name, resources.rewriteModule(content, name), "application/javascript");
			}
		}
		const fonts = "styles/fonts.css";
		const transitions = "styles/transitions.css";
		resources.add(
			fonts,
			resources.rewriteCss(capture.bundle.fonts ?? "", fonts, join(capture.designDir, "shared", "fonts.css")),
			"text/css",
		);
		resources.add(
			transitions,
			resources.rewriteCss(
				capture.bundle.transitions ?? "",
				transitions,
				join(capture.designDir, "shared", "transitions.css"),
			),
			"text/css",
		);
		await resources.finish();
		const seed = "seed.json";
		resources.add(seed, canonicalJson(capture.seed), "application/json");
		const config = {
			entry: options.entry,
			scenario: capture.scenario,
			frames: Object.fromEntries(capture.frames.map(({ name, w, h }) => [name, { w, h }])),
			styles: Object.fromEntries(capture.bundle.styles),
			outgoing: Object.fromEntries(capture.readiness.outgoing.map(({ frame, targets }) => [frame, targets])),
		};
		const bootstrap = "bootstrap.js";
		resources.add(
			bootstrap,
			`const seed = await fetch(new URL("./${seed}", import.meta.url)).then(response => { if (!response.ok) throw new Error("The website seed could not be loaded."); return response.json(); });\nwindow.__SPOOL_PUBLICATION__ = { ...${JSON.stringify(config)}, seed };\nawait import(${JSON.stringify(`./${capture.bundle.entry}`)});\n`,
			"application/javascript",
		);
		const frames = capture.frames.map(({ name, w, h }) => {
			const module = capture.bundle.screens.get(name)?.[0];
			const stylesheet = capture.bundle.styles.get(name);
			if (module === undefined || stylesheet === undefined)
				throw new Error(`Frame "${name}" has no complete compiled output.`);
			const dependencies = closure(
				[module, stylesheet, fonts, transitions, "vendor/spool.js"],
				resources.objects,
				true,
			);
			return {
				name,
				width: w,
				height: h,
				outgoing: capture.readiness.outgoing.find((item) => item.frame === name)?.targets ?? [],
				module,
				stylesheet,
				dependencies,
			};
		});
		const entry = frames.find((frame) => frame.name === options.entry);
		if (entry === undefined) throw new Error("The website entry was not compiled.");
		const preloads = closure([entry.module, "vendor/spool.js"], resources.objects, false).filter(
			(path) => resources.objects.get(path)?.mediaType === "application/javascript",
		);
		const document = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${escapeHtml(options.entry)}</title><style>html,body,#root{height:100%}body{margin:0}</style><link rel="stylesheet" href="./${fonts}"><link rel="stylesheet" href="./${transitions}"><link rel="stylesheet" data-spool-frame-style="${escapeHtml(options.entry)}" data-spool-style-resource="${entry.stylesheet}" href="./${entry.stylesheet}">${preloads.map((path) => `<link rel="modulepreload" href="./${path}">`).join("")}</head><body><div id="root">Loading…</div><script>addEventListener("error",function(event){if(event.target && event.target.tagName === "LINK") document.getElementById("root").textContent="A website stylesheet could not be loaded. Reload to try again."},true);addEventListener("unhandledrejection",function(){document.getElementById("root").textContent="The website could not be loaded. Reload to try again."});</script><script type="module" src="./${bootstrap}"></script></body></html>\n`;
		resources.add("index.html", document, "text/html");
		const manifest = sealManifest({
			format: 1,
			producer: { name: "spool.page", version: options.version, runtimeVersion: options.version },
			entry: options.entry,
			scenario: capture.scenario,
			document: "index.html",
			bootstrap,
			seed,
			frames,
			objects: [...resources.objects]
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([path, { bytes, mediaType }]) => ({
					path,
					mediaType,
					byteLength: bytes.byteLength,
					sha256: sha256(bytes),
				})),
			externalServices: [...services].sort(),
		});
		return { manifest, inputIdentity: capture.inputIdentity, objects: resources.objects };
	});
}

/** Publish the completed directory only after all bytes and metadata have passed validation. */
export function writeWebsite(artifact: WebsiteArtifact, out: string, projectRoot: string): void {
	const requested = resolve(out);
	if (existsSync(requested) && lstatSync(requested).isSymbolicLink())
		throw new Error("The output directory must not be a symlink.");
	mkdirSync(dirname(requested), { recursive: true });
	const directory = join(realpathSync(dirname(requested)), requested.slice(dirname(requested).length + 1));
	const design = realDesignDir(projectRoot);
	const under = relative(design, directory);
	if (under === "" || (!under.startsWith("..") && !isAbsolute(under)) || directory === realpathSync(projectRoot))
		throw new Error("Choose an output directory outside design/ and separate from the project root.");
	validateManifest(artifact.manifest);
	if (artifact.objects.size !== artifact.manifest.objects.length)
		throw new Error("Artifact objects do not match the manifest inventory.");
	if (existsSync(directory)) {
		const entries = filesIn(directory);
		if (entries.length > 0) {
			let previous: ArtifactManifest;
			try {
				previous = validateManifest(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
			} catch {
				throw new Error("The output directory is not an existing Spool website. Choose an empty directory.");
			}
			const allowed = new Set(["manifest.json", ...previous.objects.map((object) => object.path)]);
			if (entries.some((file) => !allowed.has(file)))
				throw new Error("The output directory contains other files. Choose a separate directory.");
		}
	}
	mkdirSync(dirname(directory), { recursive: true });
	const staging = mkdtempSync(join(dirname(directory), ".spool-build-"));
	let backup: string | undefined;
	try {
		for (const [path, { bytes }] of artifact.objects) {
			const expected = artifact.manifest.objects.find((object) => object.path === path);
			if (expected === undefined || expected.sha256 !== sha256(bytes) || expected.byteLength !== bytes.byteLength)
				throw new Error("Artifact bytes do not match the manifest.");
			const target = join(staging, path);
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, bytes);
		}
		writeFileSync(join(staging, "manifest.json"), `${canonicalJson(artifact.manifest)}\n`);
		if (existsSync(directory)) {
			backup = `${staging}-previous`;
			renameSync(directory, backup);
		}
		try {
			renameSync(staging, directory);
		} catch (error) {
			if (backup !== undefined) renameSync(backup, directory);
			backup = undefined;
			throw error;
		}
	} finally {
		rmSync(staging, { recursive: true, force: true });
		if (backup !== undefined) rmSync(backup, { recursive: true, force: true });
	}
}
function filesIn(directory: string, prefix = ""): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isSymbolicLink()) throw new Error("The output directory contains a symlink.");
		const path = posix.join(prefix, entry.name);
		return entry.isDirectory() ? filesIn(join(directory, entry.name), path) : [path];
	});
}

function closure(roots: string[], objects: ReadonlyMap<string, ResourceObject>, dynamic: boolean): string[] {
	const seen = new Set<string>();
	const queue = [...roots];
	for (const path of queue) {
		if (seen.has(path)) continue;
		seen.add(path);
		const object = objects.get(path);
		if (object === undefined) throw new Error(`Compiled resource "${path}" is missing.`);
		const text = Buffer.from(object.bytes).toString("utf8");
		const refs: string[] = [];
		if (object.mediaType === "application/javascript") {
			const program = parse(text, { sourceType: "module" }).program;
			walkNodes(program, [], (node) => {
				if (
					(node.type === "ImportDeclaration" ||
						node.type === "ExportNamedDeclaration" ||
						node.type === "ExportAllDeclaration") &&
					node.source?.type === "StringLiteral"
				)
					refs.push(node.source.value);
				if (
					dynamic &&
					node.type === "CallExpression" &&
					node.callee.type === "Import" &&
					node.arguments[0]?.type === "StringLiteral"
				)
					refs.push(node.arguments[0].value);
			});
		}
		if (object.mediaType === "text/css")
			mapCssResources(text, (value) => {
				refs.push(value);
				return value;
			});
		for (const ref of refs) {
			if (ref.startsWith("data:") || ref.startsWith("#")) continue;
			if (!ref.startsWith(".")) throw new Error(`Resource "${path}" still depends on a non-local URL.`);
			queue.push(posix.normalize(posix.join(posix.dirname(path), ref)));
		}
	}
	return [...seen].sort();
}
function knownServices(js: string, services: Set<string>): void {
	const program = parse(js, { sourceType: "module" }).program;
	walkNodes(program, [], (node, ancestors) => {
		if (node.type !== "StringLiteral") return;
		const parent = ancestors.at(-1);
		if (/^https:\/\//.test(node.value)) services.add(node.value);
		const local = node.value.startsWith("/") || node.value.startsWith("./") || node.value.startsWith("../");
		const fetch =
			parent?.type === "CallExpression" &&
			parent.callee.type === "Identifier" &&
			parent.callee.name === "fetch" &&
			parent.arguments[0] === node;
		const attribute =
			parent?.type === "ObjectProperty" &&
			((parent.key.type === "Identifier" && ["src", "href", "poster"].includes(parent.key.name)) ||
				(parent.key.type === "StringLiteral" && ["src", "href", "poster"].includes(parent.key.value)));
		if (local && (fetch || attribute))
			throw new Error(
				`Authored local URL "${node.value}" cannot be exported. Import the asset or use an explicit external HTTPS service.`,
			);
	});
}
