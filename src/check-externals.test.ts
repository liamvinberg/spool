import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design external and ambient modules", () => {
	it("types every import form from a mapped external and keeps exact star keys exact", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/importmap.json",
			'{ "imports": { "motion/react": "https://example/m.js", "icons/": "https://example/icons/", "*": "https://example/star.js", "pkg*": "https://example/pkg.js", "forgiven": 5 } }\n',
		);
		writeFrame(
			root,
			"home",
			'import motion, * as ns from "motion/react";\nimport { default as alias, MotionValue, type Variants } from "motion/react";\nimport type { Icon } from "icons/home";\nimport icons from "icons";\nimport literalStar from "*";\nimport literalPkg from "pkg*";\nimport missing from "unrelated";\nimport bareJs from "unmapped.js";\nimport bareCss from "unmapped.css";\nimport pkg from "pkg-unmapped";\nimport forgiven from "forgiven";\ntype Model = import("motion/react").Variants;\ntype Module = typeof import("motion/react");\nvoid import("motion/react");\nexport { MotionValue as ExportedMotion } from "motion/react";\nexport type { Variants as ExportedVariants } from "motion/react";\nexport * from "motion/react";\nexport default function Home() { const value: MotionValue = motion ?? alias ?? ns; const model: Model = value; const icon: Icon = value; const module: Module = ns; return <p>{String(model ?? icon ?? module ?? icons ?? literalStar ?? literalPkg ?? missing ?? bareJs ?? bareCss ?? pkg ?? forgiven)}</p>; }\n',
		);

		const result = await messages(root);

		expect(result).toHaveLength(6);
		expect(result.join("\n")).toContain("Cannot find module 'unrelated'");
		expect(result.join("\n")).toContain("Cannot find module 'unmapped.js'");
		expect(result.join("\n")).toContain("Cannot find module 'unmapped.css'");
		expect(result.join("\n")).toContain("Cannot find module 'pkg-unmapped'");
		expect(result.join("\n")).toContain("Cannot find module 'icons'");
		expect(result.join("\n")).toContain("Cannot find module 'forgiven'");
		expect(result.join("\n")).not.toContain("MotionValue");
	});

	it.each<{
		name: string;
		frame: string;
		bridge?: string;
	}>([
		{
			name: "namespace import",
			frame: 'import * as mapped from "mapped";\nmapped.feature();\n',
		},
		{
			name: "default import",
			frame: 'import mapped from "mapped";\nmapped.feature();\n',
		},
		{
			name: "default-as import",
			frame: 'import { default as mapped } from "mapped";\nmapped.feature();\n',
		},
		{
			name: "named import",
			frame: 'import { feature } from "mapped";\nfeature();\n',
		},
		{
			name: "side-effect import",
			frame: 'import "mapped";\n',
		},
		{
			name: "type-only import",
			frame: 'import type { Feature } from "mapped";\ndeclare const feature: Feature;\nfeature();\n',
		},
		{
			name: "dynamic import",
			frame: 'async function load() { (await import("mapped")).feature(); }\nvoid load;\n',
		},
		{
			name: "type query",
			frame: 'type Mapped = typeof import("mapped");\ndeclare const mapped: Mapped;\nmapped.feature();\n',
		},
		{
			name: "import type",
			frame: 'type Feature = import("mapped").Feature;\ndeclare const feature: Feature;\nfeature();\n',
		},
		{
			name: "namespace re-export",
			bridge: 'export * as mapped from "mapped";\n',
			frame: 'import { mapped } from "../../shared/bridge";\nmapped.feature();\n',
		},
		{
			name: "named re-export",
			bridge: 'export { feature } from "mapped";\n',
			frame: 'import { feature } from "../../shared/bridge";\nfeature();\n',
		},
		{
			name: "type re-export",
			bridge: 'export type { Feature } from "mapped";\n',
			frame: 'import type { Feature } from "../../shared/bridge";\ndeclare const feature: Feature;\nfeature();\n',
		},
		{
			name: "star re-export",
			frame: 'export * from "mapped";\n',
		},
		{
			name: "consumed star re-export",
			bridge: 'export * from "mapped";\n',
			frame: 'import { feature } from "../../shared/bridge";\nfeature();\n',
		},
	])("treats an isolated mapped $name as any", async ({ frame, bridge }) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		if (bridge !== undefined) writeDesignFile(root, "shared/bridge.ts", bridge);
		writeFrame(root, "home", frame);

		expect(await messages(root)).toEqual([]);
	});

	it("accepts arbitrary string-named imports from mapped externals", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeFrame(root, "home", 'import { "hyphen-name" as value } from "mapped";\nvalue.feature();\n');

		expect(await messages(root)).toEqual([]);
	});

	it("still reports missing exports from ordinary TypeScript modules", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = 1;\n");
		writeFrame(root, "home", 'import { missing } from "../../shared/module";\nvoid missing;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:10 TS2305: Module '\"../../shared/module\"' has no exported member 'missing'.",
		]);
	});

	it("does not replace an unrelated authored PUA value with a checker module name", async () => {
		const root = makeTempDir();
		markProject(root);
		const authoredPua = "\ue001";
		writeDesignFile(root, "frames/home/index.ts", "export const known = true;\n");
		writeFrame(
			root,
			"home",
			`import { known } from ".";\nvoid known;\nconst value = {};\nvalue[${JSON.stringify(authoredPua)}];\n`,
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain(`Property '${authoredPua}' does not exist on type '{}'.`);
		expect(result[0]).not.toContain("Property '.'");
	});

	it("restores the authored module name in a cascading namespace diagnostic", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = true;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module";\nmodule.missing;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:8 TS2339: Property 'missing' does not exist on type 'typeof import(\"../../shared/module\")'.",
		]);
	});

	it.each([
		["parenthesized", "(first).missing;\n"],
		["non-null", "(first!).missing;\n"],
		["asserted", "(first as typeof first).missing;\n"],
		["computed", 'first["missing"];\n'],
		["destructured", "const { missing } = first;\nvoid missing;\n"],
	] as const)("restores the bound module name for a $name namespace use", async (_name, use) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = true;\n");
		writeFrame(
			root,
			"home",
			`import * as first from "../../shared/module";\nimport * as second from "../../shared/module.ts";\n${use}void second;\n`,
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain('typeof import("../../shared/module")');
		expect(result[0]).not.toContain('typeof import("design/shared/module")');
	});

	it("restores the bound TypeScript import-assignment name in a cascading diagnostic", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = true;\n");
		writeDesignFile(
			root,
			"shared/entry.cts",
			'import first = require("./module");\nimport second = require("./module.ts");\nfirst.missing;\nvoid second;\n',
		);
		writeFrame(root, "home", 'import "../../shared/entry.cjs";\n');

		expect((await messages(root)).filter((message) => !message.includes("TS1202:"))).toEqual([
			"design/shared/entry.cts:3:7 TS2339: Property 'missing' does not exist on type 'typeof import(\"./module\")'.",
		]);
	});

	it.each([
		{
			name: "import",
			source: (specifier: string) => `import value from ${JSON.stringify(specifier)};\nvalue.missing();\n`,
		},
		{
			name: "side-effect import",
			source: (specifier: string) => `import ${JSON.stringify(specifier)};\n`,
		},
		{
			name: "named re-export",
			source: (specifier: string) => `export { missing } from ${JSON.stringify(specifier)};\n`,
		},
		{
			name: "star re-export",
			source: (specifier: string) => `export * from ${JSON.stringify(specifier)};\n`,
		},
		{
			name: "dynamic import",
			source: (specifier: string) =>
				`async function load() { (await import(${JSON.stringify(specifier)})).missing(); }\nvoid load;\n`,
		},
		{
			name: "type-only import",
			source: (specifier: string) =>
				`import type { Missing } from ${JSON.stringify(specifier)};\ndeclare const value: Missing;\nvoid value;\n`,
		},
		{
			name: "import type expression",
			source: (specifier: string) =>
				`type Missing = import(${JSON.stringify(specifier)}).Missing;\ndeclare const value: Missing;\nvoid value;\n`,
		},
		{
			name: "TypeScript import assignment",
			source: (specifier: string) => `import value = require(${JSON.stringify(specifier)});\nvalue.missing();\n`,
		},
	])("classifies a bare $name independently of wildcard ambient modules", async ({ name, source }) => {
		for (const classification of ["mapped", "unmapped"] as const) {
			const root = makeTempDir();
			markProject(root);
			const specifier = `${classification}/${name.replaceAll(" ", "-")}`;
			writeDesignFile(
				root,
				"shared/importmap.json",
				'{ "imports": { "mapped/": "https://example.test/mapped/" } }\n',
			);
			writeDesignFile(
				root,
				"shared/ambient.d.ts",
				'declare module "*" {\n\tconst ambientOnly: { ambientOnly: true };\n\texport default ambientOnly;\n\texport { ambientOnly };\n}\n',
			);
			writeFrame(root, "home", `/// <reference path="../../shared/ambient.d.ts" />\n${source(specifier)}`);

			const result = await messages(root);
			const resolution = result.filter((message) => message.includes("TS2307:"));
			const other = result.filter((message) => !message.includes("TS2307:") && !message.includes("TS1202:"));

			expect(resolution).toHaveLength(classification === "mapped" ? 0 : 1);
			if (classification === "unmapped") expect(resolution[0]).toContain(`'${specifier}'`);
			expect(other).toEqual([]);
		}
	});

	it("keeps the real module-mode error for a mapped TypeScript import assignment", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(root, "home", 'import value = require("mapped");\nvalue.runtimeOnly();\n');

		const result = await messages(root);

		expect(result).toEqual([
			expect.stringContaining("TS1202: Import assignment cannot be used when targeting ECMAScript modules."),
		]);
		expect(result.join("\n")).not.toContain("TS2307");
	});

	it("ignores exact ambient declarations for mapped and unmapped runtime modules", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/importmap.json",
			'{ "imports": { "mapped-exact": "https://example.test/mapped.js" } }\n',
		);
		writeDesignFile(
			root,
			"shared/ambient.d.ts",
			'declare module "mapped-exact" { const value: { ambientApproved: true }; export default value; }\ndeclare module "unmapped-exact" { const value: { ambientApproved: true }; export default value; }\n',
		);
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport mapped from "mapped-exact";\nimport unmapped from "unmapped-exact";\nmapped.runtimeOnly();\nunmapped.runtimeOnly();\n',
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Cannot find module 'unmapped-exact'");
		expect(result.join("\n")).not.toContain("Cannot find module 'mapped-exact'");
	});

	it.each(["mapped", "unmapped"] as const)(
		"keeps an empty %s specifier independent of an exact empty ambient declaration",
		async (classification) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(
				root,
				"shared/importmap.json",
				classification === "mapped"
					? '{ "imports": { "": "https://example.test/empty.js" } }\n'
					: '{ "imports": {} }\n',
			);
			writeDesignFile(
				root,
				"shared/ambient.d.ts",
				'declare module "" { const value: { ambientApproved: true }; export default value; }\n',
			);
			writeFrame(
				root,
				"home",
				'/// <reference path="../../shared/ambient.d.ts" />\nimport value from "";\nvalue.runtimeOnly();\n',
			);

			const result = await messages(root);

			if (classification === "mapped") {
				expect(result).toEqual([]);
			} else {
				expect(result).toEqual([expect.stringContaining("TS2307: Cannot find module ''")]);
			}
		},
	);

	it("neutralizes a compact empty ambient declaration without hiding its body errors", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "": "https://example.test/empty.js" } }\n');
		writeDesignFile(
			root,
			"shared/ambient.d.ts",
			'declare module""{export type Broken=MissingType;const value:{ambientApproved:true};export default value;}\n',
		);
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport value from "";\nvalue.runtimeOnly();\n',
		);

		expect(await messages(root)).toEqual(["design/shared/ambient.d.ts:1:37 TS2304: Cannot find name 'MissingType'."]);
	});

	it("neutralizes a compact empty export assignment without hiding its type errors", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "": "https://example.test/empty.js" } }\n');
		writeDesignFile(root, "shared/ambient.d.ts", 'declare module""{const value:MissingType;export=value;}\n');
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport value from "";\nvalue.runtimeOnly();\n',
		);

		expect(await messages(root)).toEqual(["design/shared/ambient.d.ts:1:30 TS2304: Cannot find name 'MissingType'."]);
	});

	it("classifies an import assignment inside a compact empty ambient declaration", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "": "https://example.test/empty.js" } }\n');
		writeDesignFile(root, "shared/ambient.d.ts", 'declare module""{import value=require("other");export=value;}\n');
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport value from "";\nvalue.runtimeOnly();\n',
		);

		expect(await messages(root)).toEqual([expect.stringContaining("TS2307: Cannot find module 'other'")]);
	});

	it.each(["mapped", "unmapped"] as const)(
		"classifies a dot-prefixed %s bare specifier as external",
		async (classification) => {
			const root = makeTempDir();
			markProject(root);
			const specifier = `.${classification}-package`;
			writeDesignFile(
				root,
				"shared/importmap.json",
				classification === "mapped"
					? `${JSON.stringify({ imports: { [specifier]: "https://example.test/package.js" } })}\n`
					: '{ "imports": {} }\n',
			);
			writeDesignFile(
				root,
				"shared/ambient.d.ts",
				`declare module ${JSON.stringify(specifier)} { const value: { ambientApproved: true }; export default value; }\n`,
			);
			writeFrame(
				root,
				"home",
				`/// <reference path="../../shared/ambient.d.ts" />\nimport value from ${JSON.stringify(specifier)};\nvalue.runtimeOnly();\n`,
			);

			const result = await messages(root);

			if (classification === "mapped") {
				expect(result).toEqual([]);
			} else {
				expect(result).toEqual([expect.stringContaining(`TS2307: Cannot find module '${specifier}'`)]);
			}
		},
	);

	it("keeps pinned modules typed despite exact and wildcard ambient declarations", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/ambient.d.ts",
			'declare module "react" { export function useState(value: number): [number, (next: number) => void]; export const injected: string; }\ndeclare module "spool" { export const ui: { go(target: string): void }; export const wildcardInjected: string; }\ndeclare module "*" { export const wildcardOnly: string; }\n',
		);
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport { useState, injected } from "react";\nimport { ui, wildcardInjected } from "spool";\nconst [count] = useState(1);\ncount.toFixed();\nui.go("next");\nvoid injected;\nvoid wildcardInjected;\n',
		);

		const result = await messages(root);

		expect(result).toHaveLength(2);
		expect(result.join("\n")).toContain("has no exported member 'injected'");
		expect(result.join("\n")).toContain("has no exported member 'wildcardInjected'");
		expect(result.join("\n")).not.toContain("useState");
		expect(result.join("\n")).not.toContain("Property 'go'");
	});

	it("neutralizes a reachable module augmentation without hiding errors in its declaration body", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/augmentations.ts",
			'export {};\ndeclare module "unmapped-augmentation" {\n\texport const ambientApproved: string;\n\texport type Broken = MissingType;\n}\n',
		);
		writeFrame(
			root,
			"home",
			'import "../../shared/augmentations";\nimport { ambientApproved } from "unmapped-augmentation";\nvoid ambientApproved;\n',
		);

		const result = await messages(root);

		expect(result.filter((message) => message.includes("TS2307:"))).toEqual([
			expect.stringContaining("Cannot find module 'unmapped-augmentation'"),
		]);
		expect(result.filter((message) => message.includes("MissingType"))).toEqual([
			expect.stringContaining("design/shared/augmentations.ts:4:23 TS2304:"),
		]);
		expect(result.join("\n")).not.toContain("\ue001");
	});

	it("preserves a confined relative module augmentation", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/model.ts", "export interface Model { base: string }\n");
		writeDesignFile(
			root,
			"shared/augmentations.ts",
			'export {};\ndeclare module "./model" { interface Model { extra: number } }\n',
		);
		writeFrame(
			root,
			"home",
			'import "../../shared/augmentations";\nimport type { Model } from "../../shared/model";\nconst model: Model = { base: "ok", extra: 1 };\nvoid model;\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("reports an invalid relative ambient declaration in a script declaration file", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/model.ts", "export interface Model { base: string }\n");
		writeDesignFile(
			root,
			"shared/invalid-relative.d.ts",
			'declare module "./model" { interface Model { extra: number } }\n',
		);
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/invalid-relative.d.ts" />\nimport type { Model } from "../../shared/model";\ndeclare const model: Model;\nvoid model;\n',
		);

		expect(await messages(root)).toEqual([
			expect.stringContaining("TS2436: Ambient module declaration cannot specify relative module name."),
		]);
	});

	it("preserves authored diagnostic positions around mapped imports", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeFrame(root, "home", 'import mapped from "mapped";\nmapped.feature();\nmissingName;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:3:1 TS2304: Cannot find name 'missingName'.",
		]);
	});

	it.each([null, [], 42, "invalid"] as const)(
		"treats a non-record import map root as having no mappings",
		async (value) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/importmap.json", `${JSON.stringify(value)}\n`);
			writeFrame(root, "home", 'import mapped from "mapped";\nvoid mapped;\n');

			const result = await messages(root);

			expect(result).toHaveLength(1);
			expect(result[0]).toContain("TS2307: Cannot find module 'mapped'");
			expect(result.join("\n")).not.toContain(root);
		},
	);

	it("keeps a query-like suffix on a bare specifier in import-map policy", async () => {
		const root = makeTempDir();
		markProject(root);
		const specifier = "mapped?../../../outside";
		writeDesignFile(
			root,
			"shared/importmap.json",
			`${JSON.stringify({ imports: { [specifier]: "https://example.test/mapped.js" } })}\n`,
		);
		writeFrame(root, "home", `import mapped from ${JSON.stringify(specifier)};\nmapped.runtimeOnly();\n`);

		expect(await messages(root)).toEqual([]);
	});

	it("ignores design-local packages when checking mapped externals", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeDesignFile(root, "node_modules/mapped/package.json", '{ "name": "mapped", "types": "index.d.ts" }\n');
		writeDesignFile(root, "node_modules/mapped/index.d.ts", "export const known: string;\n");
		writeFrame(root, "home", 'import * as mapped from "mapped";\nmapped.feature();\n');

		expect(await messages(root)).toEqual([]);
	});

	it("ignores an import map whose canonical target is design-local package data", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"node_modules/hidden/importmap.json",
			'{ "imports": { "hidden-mapped": "https://example.test/hidden.js" } }\n',
		);
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(
			join(root, "design", "node_modules", "hidden", "importmap.json"),
			join(root, "design", "shared", "importmap.json"),
		);
		writeFrame(root, "home", 'import hidden from "hidden-mapped";\nhidden.feature();\n');

		const result = await messages(root);

		expect(result).toEqual([
			"design/frames/home/frame.tsx:1:20 TS2307: Cannot find module 'hidden-mapped' or its corresponding type declarations.",
		]);
	});

	it("does not resolve unmapped imports from design-local packages", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "node_modules/unmapped/package.json", '{ "name": "unmapped", "types": "index.d.ts" }\n');
		writeDesignFile(root, "node_modules/unmapped/index.d.ts", "export const value: string;\n");
		writeFrame(root, "home", 'import { value } from "unmapped";\nvoid value;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Cannot find module 'unmapped' or its corresponding type declarations.",
		]);
	});

	it("does not resolve a source alias into design-local packages", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "node_modules/hidden/index.ts", "export const value = 1;\n");
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(
			join(root, "design", "node_modules", "hidden", "index.ts"),
			join(root, "design", "shared", "vendor.ts"),
		);
		writeFrame(root, "home", 'import { value } from "../../shared/vendor";\nvoid value;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Cannot find module '../../shared/vendor' or its corresponding type declarations.",
		]);
	});

	it("does not resolve design package import aliases", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "package.json", '{ "imports": { "#alias": "./shared/alias.ts" } }\n');
		writeDesignFile(root, "shared/alias.ts", "export const value = 1;\n");
		writeFrame(root, "home", 'import { value } from "#alias";\nvoid value;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Cannot find module '#alias' or its corresponding type declarations.",
		]);
	});

	it("keeps mapped external semantics through an in-design source alias", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeDesignFile(
			root,
			"shared/real.ts",
			'import * as mapped from "mapped";\nexport const value = mapped.feature();\n',
		);
		symlinkSync(join(root, "design", "shared", "real.ts"), join(root, "design", "shared", "alias.ts"));
		writeFrame(root, "home", 'import { value } from "../../shared/alias";\nvoid value;\n');

		expect(await messages(root)).toEqual([]);
	});

	it("diagnoses one canonical source once through multiple in-design aliases", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/real.ts", "export const value: string = 1;\n");
		const real = join(root, "design", "shared", "real.ts");
		symlinkSync(real, join(root, "design", "shared", "first.ts"));
		symlinkSync(real, join(root, "design", "shared", "second.ts"));
		writeFrame(
			root,
			"home",
			'import { value as first } from "../../shared/first";\nimport { value as second } from "../../shared/second";\nvoid first;\nvoid second;\n',
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/shared/real.ts:1:");
		expect(result[0]).toContain("TS2322: Type 'number' is not assignable to type 'string'.");
		expect(result[0]).not.toContain("first.ts");
		expect(result[0]).not.toContain("second.ts");
	});
});
