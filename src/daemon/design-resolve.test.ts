import { mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { build, type ImportKind } from "esbuild";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { DesignBoundaryError } from "./design-boundary";
import { type DesignFiles, memoryDesignFiles } from "./design-files";
import { realDesignDir } from "./design-path";
import { type DesignResolution, designResolver, RESOLVE_EXTENSIONS } from "./design-resolve";
import { diskDesignFiles } from "./disk-files";

/** What an import resolves to, said the same way for esbuild's resolver and ours. */
type Answer = string | "external" | "missing";

/**
 * What esbuild's own resolver makes of each import, from one folder, with the
 * options the design compile resolves under: what a frame compiled from when
 * esbuild read the folders itself.
 */
async function esbuildResolves(
	designDir: string,
	from: string,
	specifiers: readonly string[],
	kind: ImportKind,
): Promise<Map<string, Answer>> {
	const answers = new Map<string, Answer>();
	await build({
		stdin: { contents: "", resolveDir: from, sourcefile: "<probe>" },
		write: false,
		platform: "browser",
		packages: "external",
		resolveExtensions: [...RESOLVE_EXTENSIONS],
		absWorkingDir: designDir,
		logLevel: "silent",
		plugins: [
			{
				name: "probe",
				setup(probe) {
					probe.onStart(async () => {
						for (const specifier of specifiers) {
							const result = await probe.resolve(specifier, { resolveDir: from, kind });
							answers.set(
								specifier,
								result.errors.length > 0
									? "missing"
									: result.external
										? "external"
										: `${relative(designDir, result.path)}${result.suffix}`,
							);
						}
					});
				},
			},
		],
	});
	return answers;
}

function answer(resolution: DesignResolution, designDir: string): Answer | undefined {
	if (resolution === undefined) return undefined;
	if ("external" in resolution) return "external";
	if ("missing" in resolution) return "missing";
	return `${relative(designDir, resolution.file)}${resolution.suffix}`;
}

function ours(designDir: string, from: string, specifiers: readonly string[], kind: ImportKind, files: DesignFiles) {
	const resolveImport = designResolver(designDir, files);
	return new Map(specifiers.map((specifier) => [specifier, answer(resolveImport(specifier, from, kind), designDir)]));
}

function designWithCases(): string {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	const designDir = realDesignDir(root);
	const file = (rel: string, content = "export const value = 1;\n") => writeDesignFile(root, rel, content);
	file("shared/kit/both.tsx");
	file("shared/kit/both.ts");
	file("shared/kit/folder.ts");
	file("shared/kit/folder/index.tsx");
	file("shared/kit/only-index/index.tsx");
	file("shared/kit/index-order/index.ts");
	file("shared/kit/index-order/index.css", ".a { color: red }\n");
	file("shared/kit/rewritten.ts");
	file("shared/kit/view.tsx");
	file("shared/kit/module.mts");
	file("shared/kit/common.cts");
	file("shared/kit/plain.js");
	file("shared/kit/kept.js");
	file("shared/kit/kept.ts");
	file("shared/kit/LICENSE", "MIT\n");
	file("shared/kit/with space.tsx");
	file("shared/kit/50%.ts");
	file("shared/kit/tokens.css", ".a { color: red }\n");
	file("shared/kit/sheets/index.css", ".a { color: red }\n");
	file("shared/kit/data.json", "{}\n");
	file("shared/kit/effect.glsl", "void main() {}\n");
	file("shared/kit/picture.png", "png");
	file("shared/kit/real/inner.ts");
	file("frames/shop/cart/frame.tsx", "export default () => null;\n");
	file("frames/shop/cart/parts/row.tsx");
	symlinkSync(join(designDir, "shared", "kit", "real", "inner.ts"), join(designDir, "shared", "kit", "linked.ts"));
	symlinkSync(join(designDir, "shared", "kit", "real"), join(designDir, "shared", "kit", "linked-folder"), "dir");
	return designDir;
}

/** Imports from a frame on a page, each answered as esbuild answers it. */
const SCRIPT_IMPORTS = [
	"./frame.tsx",
	"./frame",
	"./parts/row",
	"./parts/row.js",
	"./parts/",
	"../../../shared/lib/utils",
	"../../../shared/lib/utils.ts",
	// the extension order is esbuild's, and a file comes before a folder of its name
	"../../../shared/kit/both",
	"../../../shared/kit/both.ts",
	"../../../shared/kit/folder",
	"../../../shared/kit/folder/",
	// a folder's index, in the same order
	"../../../shared/kit/only-index",
	"../../../shared/kit/index-order",
	// the TypeScript rewrite, after the name and its extensions
	"../../../shared/kit/rewritten.js",
	"../../../shared/kit/view.jsx",
	"../../../shared/kit/module.mjs",
	"../../../shared/kit/common.cjs",
	"../../../shared/kit/kept.js",
	"../../../shared/kit/plain",
	"../../../shared/kit/LICENSE",
	"../../../shared/kit/with space",
	"../../../shared/kit/50%",
	"../../../shared/kit/tokens",
	"../../../shared/kit/data.json",
	// a query or hash is part of the name, then dropped
	"../../../shared/kit/effect.glsl?raw",
	"../../../shared/kit/picture.png#frame",
	"../../../shared/kit/real/inner",
	// a symlink, followed to its real path
	"../../../shared/kit/linked",
	"../../../shared/kit/linked-folder/inner",
	"../../../shared/kit/../kit/both",
	"../../../shared/kit//both",
	"../../../shared/kit/missing",
	"../../../shared/gone/missing",
	"./missing.tsx",
	// packages, for the import map
	"react",
	"motion/react",
	"https://esm.sh/canvas-confetti",
	"#internal",
];

/** A stylesheet's references from shared/kit: an @import tries .css alone, and a url() names its file. */
const STYLESHEET_REFERENCES: ReadonlyArray<readonly [ImportKind, readonly string[]]> = [
	["import-rule", ["./tokens", "./tokens.css", "tokens.css", "./sheets", "./data", "./missing"]],
	["url-token", ["./picture.png", "picture.png", "./picture", "./picture.png?v=2", "./missing.png"]],
];

describe("an import of the design compile", () => {
	for (const kind of ["import-statement", "require-call", "dynamic-import"] as const) {
		it(`resolves as esbuild's resolver does for a ${kind}`, async () => {
			const designDir = designWithCases();
			const from = join(designDir, "frames", "shop", "cart");

			const theirs = await esbuildResolves(designDir, from, SCRIPT_IMPORTS, kind);

			expect(ours(designDir, from, SCRIPT_IMPORTS, kind, diskDesignFiles)).toEqual(theirs);
		});
	}

	for (const [kind, references] of STYLESHEET_REFERENCES) {
		it(`resolves as esbuild's resolver does for a stylesheet's ${kind}`, async () => {
			const designDir = designWithCases();
			const from = join(designDir, "shared", "kit");

			const theirs = await esbuildResolves(designDir, from, references, kind);

			expect(ours(designDir, from, references, kind, diskDesignFiles)).toEqual(theirs);
		});
	}

	it("leaves a data: URL and a stylesheet's remote URLs to esbuild, which needs no file for them", () => {
		const designDir = designWithCases();
		const resolveImport = designResolver(designDir, diskDesignFiles);

		expect(resolveImport("data:text/javascript,export default 1", designDir, "import-statement")).toBeUndefined();
		for (const url of ["https://example.com/a.png", "data:image/png;base64,AA", "#mask", "//cdn.example.com/a.png"]) {
			expect(resolveImport(url, designDir, "url-token")).toBeUndefined();
		}
	});

	it("is answered the same from the files held in memory as from the disk", () => {
		const designDir = designWithCases();
		const from = join(designDir, "frames", "shop", "cart");
		// the same folder with no symlinks, as a Worker holds it
		const held = memoryDesignFiles(
			walk(designDir).map((file) => [join("/held/design", relative(designDir, file)), readFileSync(file)] as const),
		);
		const linkless = SCRIPT_IMPORTS.filter((specifier) => !specifier.includes("linked"));

		const onDisk = ours(designDir, from, linkless, "import-statement", diskDesignFiles);
		const inMemory = ours("/held/design", "/held/design/frames/shop/cart", linkless, "import-statement", held);

		expect(inMemory).toEqual(onDisk);
	});

	it("sees the folders as they are in the next pass", () => {
		const designDir = designWithCases();
		const later = join(designDir, "shared", "later");
		const resolve = () =>
			designResolver(designDir, diskDesignFiles)("./shared/later/file", designDir, "import-statement");
		expect(resolve()).toEqual({ missing: true });

		mkdirSync(later);
		writeFileSync(join(later, "file.ts"), "export {};\n");

		expect(resolve()).toEqual({ file: join(later, "file.ts"), suffix: "" });
	});
});

/**
 * Where the design compile answers otherwise than esbuild would on a Mac, on
 * purpose: nothing outside design/ and no package.json may change what a frame
 * imports, and a name matches only as it is spelled, as on the case-sensitive
 * file system a Worker holds a project on.
 */
describe("an import the design compile answers on its own terms", () => {
	it("matches a name only as it is spelled", () => {
		const designDir = designWithCases();
		writeFileSync(join(designDir, "shared", "kit", "Cased.tsx"), "export {};\n");
		const resolveImport = designResolver(designDir, diskDesignFiles);

		expect(resolveImport("./shared/kit/cased", designDir, "import-statement")).toEqual({ missing: true });
		expect(resolveImport("./shared/Kit/both", designDir, "import-statement")).toEqual({ missing: true });
		expect(resolveImport("./shared/kit/Cased", designDir, "import-statement")).toEqual({
			file: join(designDir, "shared", "kit", "Cased.tsx"),
			suffix: "",
		});
	});

	it("reads no package.json, inside design/ or above it", async () => {
		const designDir = designWithCases();
		writeFileSync(join(designDir, "..", "package.json"), JSON.stringify({ sideEffects: false }));
		writeDesignFile(join(designDir, ".."), "shared/main/package.json", JSON.stringify({ main: "./lib.ts" }));
		writeDesignFile(join(designDir, ".."), "shared/main/lib.ts", "export {};\n");
		writeDesignFile(join(designDir, ".."), "shared/main/index.ts", "export {};\n");
		const resolveImport = designResolver(designDir, diskDesignFiles);

		expect(resolveImport("./shared/main", designDir, "import-statement")).toEqual({
			file: join(designDir, "shared", "main", "index.ts"),
			suffix: "",
		});
		expect(resolveImport("./shared/lib/utils", designDir, "import-statement")).toEqual({
			file: join(designDir, "shared", "lib", "utils.ts"),
			suffix: "",
		});
	});

	it("refuses an import that leaves design/, by the name it was written as", () => {
		const designDir = designWithCases();
		writeFileSync(join(designDir, "..", "outside.ts"), "export const secret = 1;\n");
		const resolveImport = designResolver(designDir, diskDesignFiles);

		expect(() => resolveImport("../outside", designDir, "import-statement")).toThrow(
			new DesignBoundaryError("../outside"),
		);
		expect(() => resolveImport("/etc/hosts", designDir, "import-statement")).toThrow(DesignBoundaryError);
	});
});

function walk(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		const stat = statSync(path);
		return stat.isDirectory() ? walk(path) : [path];
	});
}
