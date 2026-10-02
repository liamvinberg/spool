import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, type ImportKind } from "esbuild";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { realDesignDir } from "./design-path";
import { RESOLVE_EXTENSIONS, sharedImportResolver } from "./shared-import";

interface Resolved {
	path: string;
	sideEffects: boolean;
	suffix: string;
}

/**
 * What esbuild's own resolver makes of each `./shared/<rest>` from design/: the
 * answer the shared/ plugin used to ask it for, one re-entrant resolve each,
 * with the options the design compile resolves under.
 */
async function esbuildResolves(
	designDir: string,
	specifiers: readonly string[],
	kind: ImportKind,
): Promise<Map<string, Resolved | undefined>> {
	const answers = new Map<string, Resolved | undefined>();
	await build({
		stdin: { contents: "", resolveDir: designDir, sourcefile: "<probe>" },
		write: false,
		platform: "browser",
		resolveExtensions: [...RESOLVE_EXTENSIONS],
		absWorkingDir: designDir,
		logLevel: "silent",
		plugins: [
			{
				name: "probe",
				setup(probe) {
					probe.onStart(async () => {
						for (const specifier of specifiers) {
							const result = await probe.resolve(`./${specifier}`, { resolveDir: designDir, kind });
							answers.set(
								specifier,
								result.errors.length > 0
									? undefined
									: { path: result.path, sideEffects: result.sideEffects, suffix: result.suffix },
							);
						}
					});
				},
			},
		],
	});
	return answers;
}

async function answers(designDir: string, specifiers: readonly string[], kind: ImportKind = "import-statement") {
	const resolveShared = sharedImportResolver(designDir);
	return new Map(
		await Promise.all(
			specifiers.map(async (specifier) => [specifier, await resolveShared(specifier, kind)] as const),
		),
	);
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
	file("shared/kit/main-folder/package.json", JSON.stringify({ main: "./lib.ts" }));
	file("shared/kit/main-folder/lib.ts");
	file("shared/kit/main-folder/index.ts");
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
	file("shared/@scope/pkg.ts");
	file("shared/kit/tokens.css", ".a { color: red }\n");
	file("shared/kit/data.json", "{}\n");
	file("shared/kit/effect.glsl", "void main() {}\n");
	file("shared/kit/Cased.tsx");
	file("shared/kit/node_modules/kept.ts");
	file("shared/kit/real/inner.ts");
	file("shared/marked/package.json", JSON.stringify({ sideEffects: false }));
	file("shared/marked/pure.ts");
	file("shared/marked/inner/package.json", JSON.stringify({ name: "inner" }));
	file("shared/marked/inner/module.ts");
	file("shared/remapped/package.json", JSON.stringify({ browser: { "./elsewhere.js": false } }));
	file("shared/remapped/inner/package.json", JSON.stringify({ name: "inner" }));
	file("shared/remapped/inner/module.ts");
	file("shared/main-only/package.json", JSON.stringify({ browser: "./main.js", sideEffects: true }));
	file("shared/main-only/module.ts");
	file("shared/twice/package.json", '{ "sideEffects": true, "sideEffects": false }');
	file("shared/twice/module.ts");
	symlinkSync(join(designDir, "shared", "kit", "real", "inner.ts"), join(designDir, "shared", "kit", "linked.ts"));
	symlinkSync(join(designDir, "shared", "kit", "real"), join(designDir, "shared", "kit", "linked-folder"), "dir");
	return designDir;
}

/** Each import the folders answer, and the file it names under design/. */
const ANSWERED: ReadonlyArray<readonly [string, string]> = [
	["shared/lib/utils", "shared/lib/utils.ts"],
	["shared/lib/utils.ts", "shared/lib/utils.ts"],
	// the extension order is esbuild's, and a file comes before a folder of its name
	["shared/kit/both", "shared/kit/both.tsx"],
	["shared/kit/both.ts", "shared/kit/both.ts"],
	["shared/kit/folder", "shared/kit/folder.ts"],
	// a folder's index, in the same order
	["shared/kit/only-index", "shared/kit/only-index/index.tsx"],
	["shared/kit/index-order", "shared/kit/index-order/index.ts"],
	// the TypeScript rewrite, after the name and its extensions
	["shared/kit/rewritten.js", "shared/kit/rewritten.ts"],
	["shared/kit/view.jsx", "shared/kit/view.tsx"],
	["shared/kit/module.mjs", "shared/kit/module.mts"],
	["shared/kit/common.cjs", "shared/kit/common.cts"],
	["shared/kit/kept.js", "shared/kit/kept.js"],
	["shared/kit/plain.js", "shared/kit/plain.js"],
	["shared/kit/plain", "shared/kit/plain.js"],
	["shared/kit/LICENSE", "shared/kit/LICENSE"],
	["shared/kit/with space", "shared/kit/with space.tsx"],
	["shared/kit/50%", "shared/kit/50%.ts"],
	["shared/@scope/pkg", "shared/@scope/pkg.ts"],
	["shared/kit/tokens", "shared/kit/tokens.css"],
	["shared/kit/data.json", "shared/kit/data.json"],
	["shared/kit/effect.glsl", "shared/kit/effect.glsl"],
	["shared/kit/real/inner", "shared/kit/real/inner.ts"],
	// the nearest manifest's sideEffects applies, and this one has none
	["shared/marked/inner/module", "shared/marked/inner/module.ts"],
	// a browser string is a main field, not a map, and sideEffects true marks nothing
	["shared/main-only/module", "shared/main-only/module.ts"],
];

const ASKED_OF_ESBUILD = [
	"shared/kit/main-folder",
	"shared/kit/cased",
	"shared/kit/node_modules/kept",
	"shared/kit/linked",
	"shared/kit/linked-folder/inner",
	"shared/marked/pure",
	"shared/remapped/inner/module",
	"shared/twice/module",
	"shared/kit/effect.glsl?raw",
	"shared/kit/a*b",
	"shared/kit/../kit/both",
	"shared/kit//both",
	"shared/kit/",
	"shared/kit/missing",
	"shared/gone/missing",
];

/**
 * The shared/ plugin answers an import from the folders where it can
 * (`shared-import.ts`) and asks esbuild about the rest. Whatever it answers
 * must be what esbuild's own resolver gives, the same file under the same path
 * with the same side effects, or a frame would compile from another file than
 * it did when every shared/ import was esbuild's.
 */
describe("a shared/ import answered from the folders", () => {
	for (const kind of ["import-statement", "require-call", "dynamic-import"] as const) {
		it(`is what esbuild's resolver gives for a ${kind}, wherever it answers`, async () => {
			const designDir = designWithCases();
			const specifiers = [...ANSWERED.map(([specifier]) => specifier), ...ASKED_OF_ESBUILD];
			const esbuild = await esbuildResolves(designDir, specifiers, kind);
			const ours = await answers(designDir, specifiers, kind);

			for (const [specifier, file] of ANSWERED) {
				const path = join(designDir, file);
				expect([specifier, ours.get(specifier)]).toEqual([specifier, path]);
				expect([specifier, esbuild.get(specifier)]).toEqual([specifier, { path, sideEffects: true, suffix: "" }]);
			}
			for (const specifier of ASKED_OF_ESBUILD)
				expect([specifier, ours.get(specifier)]).toEqual([specifier, undefined]);
		});
	}

	it("is unmoved by a tsconfig.json, as esbuild's resolver is for a relative path", async () => {
		const designDir = designWithCases();
		const remap = {
			compilerOptions: { baseUrl: ".", paths: { "shared/*": ["./elsewhere/*"], "*": ["./elsewhere/*"] } },
		};
		writeFileSync(join(designDir, "tsconfig.json"), JSON.stringify(remap));
		writeFileSync(join(designDir, "shared", "kit", "tsconfig.json"), JSON.stringify(remap));
		const specifiers = ANSWERED.map(([specifier]) => specifier);
		const esbuild = await esbuildResolves(designDir, specifiers, "import-statement");
		const ours = await answers(designDir, specifiers);

		for (const [specifier, file] of ANSWERED) {
			expect([specifier, ours.get(specifier), esbuild.get(specifier)?.path]).toEqual([
				specifier,
				join(designDir, file),
				join(designDir, file),
			]);
		}
	});

	it("leaves every stylesheet and url() reference to esbuild", async () => {
		const resolveShared = sharedImportResolver(designWithCases());
		for (const kind of ["import-rule", "composes-from", "url-token", "require-resolve"] as const) {
			expect(await resolveShared("shared/kit/tokens.css", kind)).toBeUndefined();
		}
	});

	it("asks esbuild about every file a browser map above could remap", async () => {
		const designDir = designWithCases();
		writeFileSync(join(designDir, "package.json"), JSON.stringify({ browser: { "./shared/lib/utils.ts": false } }));
		const ours = await answers(
			designDir,
			ANSWERED.map(([specifier]) => specifier),
		);

		expect([...ours.values()].every((answer) => answer === undefined)).toBe(true);
	});

	it("answers under a project's sideEffects only where a nearer manifest is the one esbuild reads", async () => {
		const designDir = designWithCases();
		// above design/, where a repo keeps its manifest
		writeFileSync(join(designDir, "..", "package.json"), JSON.stringify({ sideEffects: false }));
		const specifiers = ["shared/lib/utils", "shared/marked/inner/module", "shared/main-only/module"];
		const esbuild = await esbuildResolves(designDir, specifiers, "import-statement");
		const ours = await answers(designDir, specifiers);

		expect(esbuild.get("shared/lib/utils")?.sideEffects).toBe(false);
		expect(ours.get("shared/lib/utils")).toBeUndefined();
		for (const specifier of ["shared/marked/inner/module", "shared/main-only/module"]) {
			expect(esbuild.get(specifier)?.sideEffects).toBe(true);
			expect(ours.get(specifier)).toBe(esbuild.get(specifier)?.path);
		}
	});

	it("asks esbuild when a package.json it would read cannot be read as one", async () => {
		const designDir = designWithCases();
		writeFileSync(join(designDir, "shared", "kit", "package.json"), "{ not json");
		const resolveShared = sharedImportResolver(designDir);

		expect(await resolveShared("shared/kit/both", "import-statement")).toBeUndefined();
		expect(await resolveShared("shared/lib/utils", "import-statement")).toBe(
			join(designDir, "shared", "lib", "utils.ts"),
		);
	});

	it("asks esbuild when the design folder is gone", async () => {
		const designDir = designWithCases();
		const resolveShared = sharedImportResolver(designDir);
		rmSync(designDir, { recursive: true });

		expect(await resolveShared("shared/lib/utils", "import-statement")).toBeUndefined();
	});

	it("sees the folders as they are in the next pass", async () => {
		const designDir = designWithCases();
		expect(await sharedImportResolver(designDir)("shared/later/file", "import-statement")).toBeUndefined();

		mkdirSync(join(designDir, "shared", "later"));
		writeFileSync(join(designDir, "shared", "later", "file.ts"), "export {};\n");

		expect(await sharedImportResolver(designDir)("shared/later/file", "import-statement")).toBe(
			join(designDir, "shared", "later", "file.ts"),
		);
	});
});
