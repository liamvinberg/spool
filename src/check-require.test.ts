import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design CommonJS checking", () => {
	it("preflights nested static CommonJS requires with the live local source priority", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/entry.cts", 'const next = require("./next");\nvoid next;\n');
		writeDesignFile(root, "shared/next.ts", "const dep = require(`./dep`);\nvoid dep;\n");
		writeDesignFile(root, "shared/dep.ts", 'export const value = "lower-priority TS";\n');
		writeDesignFile(root, "shared/dep.tsx", "export const value: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/entry.cjs";\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/dep.tsx:1:14 TS2322: Type 'number' is not assignable to type 'string'."]);
		expect(result.join("\n")).not.toContain("TS2591");
	});

	it("classifies mapped and unmapped bare static requires like imports", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(
			root,
			"home",
			'const mapped = require("mapped");\nconst missing = require("unmapped");\nmapped.runtimeOnly();\nvoid missing;\n',
		);

		const result = messages(root);

		expect(result).toEqual([
			"design/frames/home/frame.tsx:2:25 TS2307: Cannot find module 'unmapped' or its corresponding type declarations.",
		]);
		expect(result.join("\n")).not.toContain("TS2591");
	});

	it("reports a missing local static require at its authored specifier", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'const missing = require("./missing");\nvoid missing;\n');

		const result = messages(root);

		expect(result).toEqual([
			"design/frames/home/frame.tsx:1:25 TS2307: Cannot find module './missing' or its corresponding type declarations.",
		]);
		expect(result.join("\n")).not.toContain("TS2591");
	});

	it("leaves dynamic require calls unrecognized and does not preflight their possible target", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(
			root,
			"home",
			'const specifier = "../../shared/dep";\nconst dynamic = require(specifier);\nvoid dynamic;\n',
		);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:2:17 TS2591: Cannot find name 'require'.");
		expect(result.join("\n")).not.toContain("design/shared/dep.ts");
	});

	it.each([
		["parameter", 'export function load(require: (specifier: string) => unknown) { return require("./dep"); }\n'],
		[
			"const binding",
			'const require = (specifier: string): unknown => specifier;\nexport const value = require("./dep");\n',
		],
	] as const)("does not treat a shadowed $name as CommonJS", (_name, source) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/entry.ts", source);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/entry";\n');

		expect(messages(root)).toEqual([]);
	});

	it.each([
		["declared const", "declare const require: (specifier: string) => unknown;\n"],
		["declared function", "declare function require(specifier: string): unknown;\n"],
		["declared class", "declare class require {}\n"],
		["declared namespace", "declare namespace require {}\n"],
		["declared enum", "declare enum require {}\n"],
		["type-only default import", 'import type require from "react";\n'],
		["type-only named import", 'import { type Component as require } from "react";\n'],
		["type-only import equals", 'import type require = require("react");\n'],
	] as const)("preflights a runtime require despite an erased $name binding", (_name, binding) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", `${binding}const dependency = require("../../shared/dep");\nvoid dependency;\n`);

		expect(messages(root).filter((message) => !message.includes("TS1202:"))).toEqual([
			"design/shared/dep.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		["function", "function require(_specifier: string): unknown { return undefined; }\n"],
		["class", "class require {}\n"],
		["namespace", "namespace require { export const value = true; }\n"],
		["enum", "enum require { value }\n"],
		["value import", 'import require from "../../shared/live";\n'],
		["value import equals", 'import require = require("../../shared/live-export");\n'],
	] as const)("keeps a live $name binding ahead of global CommonJS", (_name, binding) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeDesignFile(
			root,
			"shared/live.ts",
			"export default function load(_specifier: string): unknown { return undefined; }\n",
		);
		writeDesignFile(
			root,
			"shared/live-export.d.ts",
			"declare function load(specifier: string): unknown;\nexport = load;\n",
		);
		writeFrame(root, "home", `${binding}const dependency = require("../../shared/dep");\nvoid dependency;\n`);

		expect(messages(root).join("\n")).not.toContain("design/shared/dep.ts");
	});

	it("does not treat a named class-expression binding as CommonJS", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/entry.ts",
			'export const loader = class require { static load() { return require("./dep"); } };\n',
		);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import { loader } from "../../shared/entry";\nvoid loader;\n');

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/shared/entry.ts");
		expect(result.join("\n")).not.toContain("design/shared/dep.ts");
	});

	it.each([
		[
			"computed object-method key",
			'const subject = { [require("../../shared/dep")](require: (specifier: string) => unknown) { return require("./ignored"); } };\nvoid subject;\n',
		],
		[
			"computed class-method key",
			'const subject = class { [require("../../shared/dep")](require: (specifier: string) => unknown) { return require("./ignored"); } };\nvoid subject;\n',
		],
		[
			"method decorator",
			'class Subject { @require("../../shared/dep") method(require: (specifier: string) => unknown) { return require("./ignored"); } }\nvoid Subject;\n',
		],
	] as const)("checks a static require in a $name outside its parameter scope", (_name, source) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", source);

		expect(messages(root)).toEqual([
			"design/shared/dep.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		[
			"class static block",
			'class Subject { static { var require = (specifier: string): unknown => specifier; void require("./ignored"); } }\nvoid Subject;\n',
		],
		[
			"TypeScript namespace block",
			'namespace Subject { var require = (specifier: string): unknown => specifier; export const ignored = require("./ignored"); }\nvoid Subject;\n',
		],
	] as const)("keeps a var require inside its $name", (_name, scopedBinding) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/dep.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", `${scopedBinding}const dependency = require("../../shared/dep");\nvoid dependency;\n`);

		expect(messages(root)).toEqual([
			"design/shared/dep.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("keeps the static require helper distinct from authored bindings", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/dep.ts", "export const value = true;\n");
		writeFrame(
			root,
			"home",
			'const $$$$$$$ = 1;\nconst _______ = 2;\nconst _$$$$$$ = 3;\nconst dep = require("../../shared/dep");\nvoid [$$$$$$$, _______, _$$$$$$, dep];\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it.each([
		["d.mts", ".mjs"],
		["d.cts", ".cjs"],
	] as const)(
		"does not substitute a design-local .%s declaration for missing %s runtime source",
		(declarationExtension, importExtension) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(
				root,
				`shared/contract.${declarationExtension}`,
				"export interface Contract { label: string }\n",
			);
			writeFrame(root, "home", `import "../../shared/contract${importExtension}";\n`);

			expect(messages(root)).toEqual([
				`design/frames/home/frame.tsx:1:8 TS2307: Cannot find module '../../shared/contract${importExtension}' or its corresponding type declarations.`,
			]);
		},
	);

	it.each(["d.mts", "d.cts"] as const)("checks an explicitly imported design-local .%s declaration", (extension) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/contract.${extension}`, "export type Broken = MissingType;\n");
		writeFrame(root, "home", `import "../../shared/contract.${extension}";\n`);

		expect(messages(root)).toEqual([
			`design/shared/contract.${extension}:1:22 TS2304: Cannot find name 'MissingType'.`,
		]);
	});
});
