import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design asset checking", () => {
	it("resolves a design-relative shared/ import from any depth (#273)", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/lib/utils.ts", "export function cn(value: string): string {\n\treturn value;\n}\n");
		writeDesignFile(
			root,
			"frames/shop/cart/frame.tsx",
			'import { cn } from "shared/lib/utils";\nexport default function Cart() {\n\treturn <p>{cn("cart")}</p>;\n}\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("still reports a shared/ import that resolves to nothing, and type errors through one that does", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/lib/utils.ts", "export function cn(value: string): string {\n\treturn value;\n}\n");
		writeDesignFile(
			root,
			"frames/cart/frame.tsx",
			'import { gone } from "shared/lib/nope";\nimport { cn } from "shared/lib/utils";\nexport default function Cart() {\n\treturn <p>{cn(gone) + cn(1)}</p>;\n}\n',
		);

		const result = await messages(root);
		expect(result.some((line) => line.includes("TS2307") && line.includes("shared/lib/nope"))).toBe(true);
		// the resolved shared file's own types hold: cn(1) is a real mistake
		expect(result.some((line) => line.includes("TS2345"))).toBe(true);
	});

	it("supports explicit TypeScript and JSON imports while excluding CSS and JavaScript semantics", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/value.ts", "export const value = 1;\n");
		writeDesignFile(root, "shared/data.json", '{ "label": "ok" }\n');
		writeDesignFile(root, "shared/code.js", "throw new Error('must not execute or check');\n");
		writeDesignFile(root, "shared/theme.css", "broken {\n");
		writeFrame(
			root,
			"home",
			'import "../../shared/theme.css";\nimport code from "../../shared/code.js";\nimport { value } from "../../shared/value.ts";\nimport data from "../../shared/data.json";\nexport default function Home() { return <p>{value + data.label.length + Number(code)}</p>; }\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("checks an authored design/.spool-check.json as ordinary imported JSON", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, ".spool-check.json", '{ "label": "authored" }\n');
		writeFrame(
			root,
			"home",
			'import config from "../../.spool-check.json";\nconst label: string = config.label;\nvoid label;\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it.each([
		[
			"require helper",
			".spool-check-require.d.ts",
			'const dependency = require("../../shared/dep");\nvoid dependency;\n',
		],
		[
			"permissive JSX runtime",
			".spool-check-jsx-runtime.d.ts",
			"/** @jsxImportSource mapped */\nexport default function Home() { return <main />; }\n",
		],
	] as const)("preserves an authored file sharing the former $name path", async (_name, file, trigger) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, file, "export interface Authored { label: string }\n");
		writeDesignFile(root, "shared/dep.ts", "export const value = true;\n");
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			`import type { Authored } from "../../${file.slice(0, -".d.ts".length)}";\nconst authored: Authored = {};\nvoid authored;\n${trigger}`,
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2741: Property 'label' is missing");
		expect(result[0]).not.toContain("TS2305:");
	});

	it("checks an authored declaration adjacent to a CSS module", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeDesignFile(
			root,
			"shared/theme.d.css.ts",
			"declare const theme: { color: string };\nexport default theme;\n",
		);
		writeFrame(
			root,
			"home",
			'import theme from "../../shared/theme.css?module";\nconst color: number = theme.color;\nvoid color;\n',
		);

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("restores the authored CSS name in diagnostics from an adjacent declaration", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeDesignFile(
			root,
			"shared/theme.d.css.ts",
			"declare const theme: { color: string };\nexport default theme;\n",
		);
		writeFrame(root, "home", 'import { missing } from "../../shared/theme.css?module";\nvoid missing;\n');

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("Module '\"../../shared/theme.css?module\"'");
		expect(result[0]).not.toContain(".spool-check-internal");
	});

	it.each([
		[
			"CSS module default import",
			"shared/theme.module.css",
			'import styles from "../../shared/theme.module.css";\nstyles.runtimeClass;\n',
		],
		["CSS side-effect import", "shared/theme.css", 'import "../../shared/theme.css";\n'],
		[
			"CSS query import",
			"shared/theme.module.css",
			'import styles from "../../shared/theme.module.css?inline";\nstyles.runtimeClass;\n',
		],
		["CSS fragment import", "shared/theme.css", 'import "../../shared/theme.css#dark";\n'],
	] as const)("keeps an existing $name permissive without an authored declaration", async (_name, file, frame) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, file, ".root { color: red; }\n");
		writeFrame(root, "home", frame);

		expect(await messages(root)).toEqual([]);
	});

	it.each([
		["png", "frames/home/hero.png"],
		["jpg", "frames/home/hero.jpg"],
		["jpeg", "frames/home/hero.jpeg"],
		["webp", "frames/home/hero.webp"],
		["gif", "frames/home/hero.gif"],
		["svg", "shared/assets/logo.svg"],
		["txt", "frames/home/copy.txt"],
		["glsl", "frames/home/effect.glsl"],
		["wgsl", "shared/shaders/effect.wgsl"],
	] as const)("types an imported %s asset as the string a frame receives", async (_kind, file) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, file, "pretend bytes\n");
		const specifier = file.startsWith("shared/") ? `../../${file}` : `./${file.split("/").pop()}`;
		writeFrame(
			root,
			"home",
			`import asset from "${specifier}";\nconst value: string = asset;\nexport default function Home() { return <p>{value}</p>; }\n`,
		);

		expect(await messages(root)).toEqual([]);
	});

	it.each([
		["asset", "frames/home/hero.png", "./hero.png"],
		["text file", "frames/home/copy.txt", "./copy.txt"],
		["GLSL shader", "frames/home/effect.glsl", "./effect.glsl"],
		["WGSL shader", "shared/shaders/effect.wgsl", "shared/shaders/effect.wgsl"],
	] as const)("holds an imported %s to being a string and nothing looser", async (_kind, file, specifier) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, file, "pretend bytes\n");
		writeFrame(root, "home", `import value from "${specifier}";\nconst width: number = value;\nvoid width;\n`);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2322");
		expect(result[0]).toContain("Type 'string' is not assignable to type 'number'");
	});

	it.each(["png", "glsl", "wgsl"])("reports a missing .%s import", async (extension) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `import hero from "./hero.${extension}";\nvoid hero;\n`);

		expect(await messages(root)).toEqual([
			`design/frames/home/frame.tsx:1:18 TS2307: Cannot find module './hero.${extension}' or its corresponding type declarations.`,
		]);
	});

	it("keeps an asset import that leaves design/ a boundary failure", async () => {
		const root = makeTempDir();
		markProject(root);
		writeFileSync(join(root, "hero.png"), "pretend bytes\n");
		writeFrame(root, "home", 'import hero from "../../../hero.png";\nvoid hero;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:18 TS2307: Relative imports outside design/",
		]);
	});

	it("does not let a CSS import satisfy a missing authored declaration reference", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/theme.d.css.ts" />\nimport "../../shared/theme.css";\n',
		);

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:22 TS6053: File '../../shared/theme.d.css.ts' not found.",
		]);
	});

	it("does not let a CSS import satisfy a missing authored declaration type import", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeFrame(
			root,
			"home",
			'import "../../shared/theme.css";\ntype Theme = typeof import("../../shared/theme.d.css.ts");\nvoid (undefined as unknown as Theme);\n',
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain(
			"TS2307: Cannot find module '../../shared/theme.d.css.ts' or its corresponding type declarations.",
		);
		expect(result[0]).not.toContain(".spool-check-internal");
	});

	it.each([
		["mts", ".mts"],
		["cts", ".cts"],
		["mts", ".mjs"],
		["cts", ".cjs"],
	] as const)("preflights a design-local .%s module imported through %s", async (sourceExtension, importExtension) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/value.${sourceExtension}`, "export const value: string = 1;\n");
		writeFrame(
			root,
			"home",
			`import { value } from "../../shared/value${importExtension}";\nexport default function Home() { return <main>{value}</main>; }\n`,
		);

		expect(await messages(root)).toEqual([
			`design/shared/value.${sourceExtension}:1:14 TS2322: Type 'number' is not assignable to type 'string'.`,
		]);
	});

	it.each([
		{
			name: "explicit query",
			specifier: "../../shared/explicit.ts?raw",
			selected: "shared/explicit.ts",
		},
		{
			name: "explicit fragment",
			specifier: "../../shared/explicit.ts#preview",
			selected: "shared/explicit.ts",
		},
		{
			name: "extensionless query",
			specifier: "../../shared/extensionless?raw",
			selected: "shared/extensionless.tsx",
			ignored: "shared/extensionless.ts",
		},
		{
			name: "index fragment",
			specifier: "../../shared/group#preview",
			selected: "shared/group/index.ts",
		},
		{
			name: "opaque traversal-like query",
			specifier: "../../shared/opaque.ts?../../../outside.ts",
			selected: "shared/opaque.ts",
		},
	] as const)(
		"preflights the live local target behind an $name suffix",
		async ({ specifier, selected, ...fixture }) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, selected, "export const broken: string = 1;\n");
			if ("ignored" in fixture) writeDesignFile(root, fixture.ignored, "export const clean = true;\n");
			writeFrame(root, "home", `import ${JSON.stringify(specifier)};\n`);

			expect(await messages(root)).toEqual([
				`design/${selected}:1:14 TS2322: Type 'number' is not assignable to type 'string'.`,
			]);
		},
	);

	it("preserves a missing local query suffix in its diagnostic", async () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import "../../shared/missing.ts?raw";\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:8 TS2882: Cannot find module or type declarations for side-effect import of '../../shared/missing.ts?raw'.",
		]);
	});

	it("still blocks an outside local target carrying a query suffix", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "../outside.ts", "export const secret = true;\n");
		writeFrame(root, "home", 'import "../../../outside.ts?raw";\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:8 TS2307: Relative imports outside design/",
		]);
	});

	it("resolves an implicit CSS extension selected by the live compiler", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeFrame(root, "home", 'import styles from "../../shared/theme?inline";\nstyles.runtimeClass;\n');

		expect(await messages(root)).toEqual([]);
	});

	it("preserves an authored declaration for an implicit CSS extension", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeDesignFile(
			root,
			"shared/theme.d.css.ts",
			"declare const theme: { color: string };\nexport default theme;\n",
		);
		writeFrame(
			root,
			"home",
			'import theme from "../../shared/theme?module";\nconst color: number = theme.color;\nvoid color;\n',
		);

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("checks an implicit JSON extension selected by the live compiler", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data.json", '{ "label": "live" }\n');
		writeFrame(
			root,
			"home",
			'import data from "../../shared/data#preview";\nconst label: number = data.label;\nvoid label;\n',
		);

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("preserves the strict TypeScript diagnostic for deprecated import assertions", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data.json", '{ "label": "live" }\n');
		writeFrame(root, "home", 'import data from "../../shared/data.json" assert { type: "json" };\nvoid data;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:43 TS2880: Import assertions have been replaced by import attributes. Use 'with' instead of 'assert'.",
		]);
	});

	it("accepts current import attributes while keeping JSON semantics", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data.json", '{ "label": "live" }\n');
		writeFrame(
			root,
			"home",
			'import data from "../../shared/data.json" with { type: "json" };\nconst label: string = data.label;\nvoid label;\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("resolves an implicit CSS index selected by the live compiler", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme/index.css", ".root { color: red; }\n");
		writeFrame(root, "home", 'import styles from "../../shared/theme?inline";\nstyles.runtimeClass;\n');

		expect(await messages(root)).toEqual([]);
	});

	it("checks an implicit JSON index selected by the live compiler", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data/index.json", '{ "label": "live" }\n');
		writeFrame(
			root,
			"home",
			'import data from "../../shared/data/#preview";\nconst label: number = data.label;\nvoid label;\n',
		);

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});
});
