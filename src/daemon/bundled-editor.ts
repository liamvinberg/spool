import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { createEditToolDefinition } from "@earendil-works/pi-coding-agent";
import { build } from "esbuild";
import { z } from "zod";
export interface ExecutedEdit {
	start: number;
	end: number;
	text: string;
	before: string;
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
const editSource = join(packageRoot, "dist/core/tools/edit.js");
const diffSource = join(packageRoot, "dist/core/tools/edit-diff.js");
const traceKey = "spool-bundled-executed-match";
const traces = new AsyncLocalStorage<(event: unknown) => void>();
Reflect.set(globalThis, Symbol.for(traceKey), traces);
const matchSchema = z.object({ matchIndex: z.number(), matchLength: z.number(), newText: z.string() });
const traceSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("matched"),
		normalizedContent: z.string(),
		usedFuzzyMatch: z.boolean(),
		matchedEdits: z.array(matchSchema),
	}),
	z.object({ kind: z.literal("line"), start: z.number(), end: z.number(), text: z.string() }),
]);
type Trace = z.infer<typeof traceSchema>;
const expected = new Map([
	[editSource, "ed04b10ad45834276cf09d4a061db4304b923b4a2016ae9a1685cca171742b83"],
	[diffSource, "fadc87523d52babf246967a1f1b921e621eb4437e50c50f8426c46cec3f05071"],
]);

/** Observe the pinned SDK matcher without changing its execution or installed files. */
export async function buildBundledEditor(outfile: string, absoluteExternals = false): Promise<void> {
	for (const [file, hash] of expected)
		if (createHash("sha256").update(readFileSync(file)).digest("hex") !== hash)
			throw new Error("Bundled SDK editor changed; its source observation must be reviewed");
	const entry = import.meta.resolve("@earendil-works/pi-coding-agent");
	// Keep the SDK's actual queue, wrappers and renderers. Only the two pinned
	// matcher modules are bundled; their imports resolve from the installed SDK,
	// including transitive dependencies absent from Spool's own package exports.
	const anchor = absoluteExternals ? JSON.stringify(entry) : 'import.meta.resolve("@earendil-works/pi-coding-agent")';
	function externalImports(source: string, file: string): string {
		return source.replace(
			/^import (.+) from "([^"]+)";$/gm,
			(declaration: string, bindings: string, specifier: string) => {
				if (specifier === "./edit-diff.js") return declaration;
				const address = specifier.startsWith(".")
					? `new URL(${JSON.stringify(relative(dirname(fileURLToPath(entry)), resolve(dirname(file), specifier)))}, sdkEntry).href`
					: `sdkRequire.resolve(${JSON.stringify(specifier)})`;
				const pattern = bindings.startsWith("* as ") ? bindings.slice(5) : bindings.replaceAll(/\bas\b/g, ":");
				return `const ${pattern} = await import(${address});`;
			},
		);
	}
	await build({
		entryPoints: [editSource],
		outfile,
		bundle: true,
		packages: "external",
		platform: "node",
		format: "esm",
		banner: {
			js: `import { createRequire as sdkCreateRequire } from "node:module"; const sdkEntry = ${anchor}; const sdkRequire = sdkCreateRequire(sdkEntry);`,
		},
		plugins: [
			{
				name: "observe-actual-matches",
				setup(b) {
					b.onLoad({ filter: /\/edit(?:-diff)?\.js$/ }, async (args) => {
						if (args.path === editSource)
							return { contents: externalImports(readFileSync(args.path, "utf8"), args.path), loader: "js" };
						let source = readFileSync(args.path, "utf8");
						const markers = [
							"return { baseContent, newContent };",
							"result += applyReplacements(baseContent.slice(groupStartOffset, groupEndOffset), group.replacements, groupStartOffset);",
						];
						for (const marker of markers)
							if (source.split(marker).length !== 2) throw new Error("SDK trace seam changed");
						source = source.replace(
							markers[0] ?? "",
							`globalThis[Symbol.for('${traceKey}')]?.getStore()?.({kind:'matched',normalizedContent,usedFuzzyMatch,matchedEdits}); return { baseContent, newContent };`,
						);
						source = source.replace(
							markers[1] ?? "",
							`const replacedGroup = applyReplacements(baseContent.slice(groupStartOffset, groupEndOffset), group.replacements, groupStartOffset);
				globalThis[Symbol.for('${traceKey}')]?.getStore()?.({kind:'line',start:originalLines.slice(0,group.startLine).join('').length,end:originalLines.slice(0,group.endLine).join('').length,text:replacedGroup}); result += replacedGroup;`,
						);
						return { contents: externalImports(source, args.path), loader: "js" };
					});
				},
			},
		],
	});
}
let editor: Promise<typeof createEditToolDefinition> | undefined;
export function observedEditor(): Promise<typeof createEditToolDefinition> {
	editor ??= (async () => {
		const outfile = import.meta.url.endsWith(".ts")
			? join(mkdtempSync(join(tmpdir(), "spool-editor-")), "edit.mjs")
			: fileURLToPath(new URL("./bundled-editor.js", import.meta.url));
		if (import.meta.url.endsWith(".ts")) await buildBundledEditor(outfile, true);
		const loaded: { createEditToolDefinition: typeof createEditToolDefinition } = await import(
			pathToFileURL(outfile).href
		);
		return loaded.createEditToolDefinition;
	})();
	return editor;
}

export async function withTrace<T>(
	work: (events: readonly Trace[]) => Promise<T>,
): Promise<{ value: T; events: Trace[] }> {
	const events: Trace[] = [];
	const value = await traces.run(
		(event: unknown) => events.push(traceSchema.parse(event)),
		() => work(events),
	);
	return { value, events };
}
export function editsFromTrace(raw: string, output: string, events: readonly Trace[]): ExecutedEdit[] | null {
	const match = events.find((e) => e.kind === "matched");
	if (match?.kind !== "matched") throw new Error("no executed SDK trace");
	const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
	const body = raw.slice(bom.length);
	const crlf = body.includes("\r\n");
	// Mixed/bare endings normalize outside the edit. Retire as an opaque operation
	// while retaining the actual matcher trace; do not invent minimal provenance.
	if (body.replaceAll("\r\n", "").includes("\r") || (crlf && body.replaceAll("\r\n", "").includes("\n"))) return null;
	const restore = (text: string) => (crlf ? text.replaceAll("\n", "\r\n") : text);
	const offset = (at: number) => bom.length + restore(match.normalizedContent.slice(0, at)).length;
	const patches = match.usedFuzzyMatch
		? events.filter((e) => e.kind === "line").map((e) => ({ start: e.start, end: e.end, text: e.text }))
		: match.matchedEdits.map((e) => ({ start: e.matchIndex, end: e.matchIndex + e.matchLength, text: e.newText }));
	const edits = patches.map((e) => ({
		start: offset(e.start),
		end: offset(e.end),
		text: restore(e.text),
		before: raw.slice(offset(e.start), offset(e.end)),
	}));
	let reconstructed = raw;
	for (const e of [...edits].reverse())
		reconstructed = reconstructed.slice(0, e.start) + e.text + reconstructed.slice(e.end);
	if (reconstructed !== output) throw new Error("executed trace does not reproduce SDK output");
	return edits;
}
