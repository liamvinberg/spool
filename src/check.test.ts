import { mkdirSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { checkDesign } from "./check";
import { checkSourceLimits } from "./check-budget";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

function messages(root: string): string[] {
	return checkDesign(root).map(
		(diagnostic) =>
			`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
	);
}

describe("offline design checking", () => {
	it("returns clean when a project has no HTML frames", () => {
		const root = makeTempDir();
		markProject(root);

		expect(messages(root)).toEqual([]);
	});

	it("reports a regular file at design/frames instead of treating it as an empty project", () => {
		const root = makeTempDir();
		markProject(root);
		writeFileSync(join(root, "design", "frames"), "not a directory\n");

		expect(messages(root)).toEqual(["design/frames:1:1 TS5083: Filesystem read failed (ENOTDIR)"]);
	});

	it("does not discover nested HTML source inside a top-level terminal frame", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "frames/terminal/term.tsx", "this source stays inert;\n");
		writeDesignFile(root, "frames/terminal/internal/frame.tsx", "terminalImplementationMustStayInert;\n");

		expect(messages(root)).toEqual([]);
	});

	it("rejects an escaped frames directory before enumerating it", () => {
		const root = makeTempDir();
		markProject(root);
		const outside = join(root, "outside-frames");
		mkdirSync(join(outside, "secret"), { recursive: true });
		writeFileSync(join(outside, "secret", "frame.tsx"), "outsideSecret();\n");
		symlinkSync(outside, join(root, "design", "frames"), "dir");

		const result = messages(root);

		expect(result).toEqual(["design/frames:1:1 TS5083: Design boundary prevents checking this project"]);
		expect(result.join("\n")).not.toContain("secret");
		expect(result.join("\n")).not.toContain(root);
	});

	it("reports unreadable source shapes instead of returning clean", () => {
		const root = makeTempDir();
		markProject(root);
		mkdirSync(join(root, "design", "frames", "home", "frame.tsx"), { recursive: true });

		expect(messages(root)).toEqual(["design/frames:1:1 TS5083: Filesystem read failed (EISDIR)"]);
	});

	it("refuses a socket frame without opening it", async () => {
		const root = makeTempDir();
		markProject(root);
		const frame = join(root, "design", "frames", "home", "frame.tsx");
		mkdirSync(dirname(frame), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(frame, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS5083: Filesystem read refused (non-regular file)",
		]);
	});

	it("refuses a socket source with one importer-local diagnostic", async () => {
		const root = makeTempDir();
		markProject(root);
		const source = join(root, "design", "shared", "value.ts");
		mkdirSync(dirname(source), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(source, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));
		writeFrame(root, "home", 'import { value } from "../../shared/value";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Filesystem read refused (non-regular file)",
		]);
	});

	it("refuses a socket import map without opening it", async () => {
		const root = makeTempDir();
		markProject(root);
		const importMap = join(root, "design", "shared", "importmap.json");
		mkdirSync(dirname(importMap), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(importMap, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));
		writeFrame(root, "home", "export default function Home() { return <main />; }\n");

		expect(messages(root)).toEqual([
			"design/shared/importmap.json:1:1 TS5083: Filesystem read refused (non-regular file)",
		]);
	});

	it("fails closed with one diagnostic when a source exceeds the offline-check budget", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", "export default function Home() { return <main />; }\n");
		truncateSync(join(root, "design", "frames", "home", "frame.tsx"), checkSourceLimits.maxFileBytes + 1);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS5083: Offline check resource limit exceeded",
		]);
	});

	it("supports explicit TypeScript and JSON imports while excluding CSS and JavaScript semantics", () => {
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

		expect(messages(root)).toEqual([]);
	});

	it("checks an authored design/.spool-check.json as ordinary imported JSON", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, ".spool-check.json", '{ "label": "authored" }\n');
		writeFrame(
			root,
			"home",
			'import config from "../../.spool-check.json";\nconst label: string = config.label;\nvoid label;\n',
		);

		expect(messages(root)).toEqual([]);
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
	] as const)("preserves an authored file sharing the former $name path", (_name, file, trigger) => {
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

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2741: Property 'label' is missing");
		expect(result[0]).not.toContain("TS2305:");
	});

	it("checks an authored declaration adjacent to a CSS module", () => {
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

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("restores the authored CSS name in diagnostics from an adjacent declaration", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeDesignFile(
			root,
			"shared/theme.d.css.ts",
			"declare const theme: { color: string };\nexport default theme;\n",
		);
		writeFrame(root, "home", 'import { missing } from "../../shared/theme.css?module";\nvoid missing;\n');

		const result = messages(root);

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
	] as const)("keeps an existing $name permissive without an authored declaration", (_name, file, frame) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, file, ".root { color: red; }\n");
		writeFrame(root, "home", frame);

		expect(messages(root)).toEqual([]);
	});

	it("does not let a CSS import satisfy a missing authored declaration reference", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/theme.d.css.ts" />\nimport "../../shared/theme.css";\n',
		);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:22 TS6053: File '../../shared/theme.d.css.ts' not found.",
		]);
	});

	it("does not let a CSS import satisfy a missing authored declaration type import", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeFrame(
			root,
			"home",
			'import "../../shared/theme.css";\ntype Theme = typeof import("../../shared/theme.d.css.ts");\nvoid (undefined as unknown as Theme);\n',
		);

		const result = messages(root);

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
	] as const)("preflights a design-local .%s module imported through %s", (sourceExtension, importExtension) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/value.${sourceExtension}`, "export const value: string = 1;\n");
		writeFrame(
			root,
			"home",
			`import { value } from "../../shared/value${importExtension}";\nexport default function Home() { return <main>{value}</main>; }\n`,
		);

		expect(messages(root)).toEqual([
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
	] as const)("preflights the live local target behind an $name suffix", ({ specifier, selected, ...fixture }) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, selected, "export const broken: string = 1;\n");
		if ("ignored" in fixture) writeDesignFile(root, fixture.ignored, "export const clean = true;\n");
		writeFrame(root, "home", `import ${JSON.stringify(specifier)};\n`);

		expect(messages(root)).toEqual([
			`design/${selected}:1:14 TS2322: Type 'number' is not assignable to type 'string'.`,
		]);
	});

	it("preserves a missing local query suffix in its diagnostic", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import "../../shared/missing.ts?raw";\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:8 TS2882: Cannot find module or type declarations for side-effect import of '../../shared/missing.ts?raw'.",
		]);
	});

	it("still blocks an outside local target carrying a query suffix", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "../outside.ts", "export const secret = true;\n");
		writeFrame(root, "home", 'import "../../../outside.ts?raw";\n');

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:1:8 TS2307: Relative imports outside design/"]);
	});

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

	it("keeps TypeScript's internally reached React, DOM, and spool declarations available", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'import { useState } from "react";\nimport { ui } from "spool";\nconst node: HTMLElement = document.createElement("div");\nexport default function Home() { const [value] = useState(1); ui.go("next"); return <p>{node.tagName}{value}</p>; }\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("types ui.copy as a Promise<void> clipboard write", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'import { ui } from "spool";\nconst copied: Promise<void> = ui.copy("invite link");\nvoid copied;\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("requires ui.copy text to be a string", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import { ui } from "spool";\nui.copy(42);\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:9 TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
		]);
	});

	it("reports missing local CSS and JavaScript imports", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/importmap.json",
			'{ "imports": { "../../shared/missing.css": "https://example/missing.css", "../../shared/missing.js": "https://example/missing.js" } }\n',
		);
		writeDesignFile(root, "shared/missing.d.css.ts", "declare const styles: string;\nexport default styles;\n");
		writeDesignFile(root, "shared/missing.d.ts", "declare const value: string;\nexport default value;\n");
		writeFrame(
			root,
			"home",
			'import styles from "../../shared/missing.css";\nimport value from "../../shared/missing.js";\nvoid styles;\nvoid value;\n',
		);

		const result = messages(root);

		expect(result).toHaveLength(2);
		expect(result[0]).toContain("TS2307: Cannot find module '../../shared/missing.css'");
		expect(result[1]).toContain("TS2307: Cannot find module '../../shared/missing.js'");
	});

	it("rejects local assets that resolve outside the design boundary", () => {
		const root = makeTempDir();
		markProject(root);
		const outside = join(root, "outside.js");
		writeFileSync(outside, "export default 1;\n");
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(outside, join(root, "design", "shared", "escaped.js"));
		writeFrame(root, "home", 'import value from "../../shared/escaped.js";\nvoid value;\n');

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:1:19 TS2307: Relative imports outside design/"]);
	});

	it("treats an existing confined JavaScript namespace as any", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.js", "throw new Error('unchecked');\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module.js";\nmodule.feature();\n');

		expect(messages(root)).toEqual([]);
	});

	it("treats string-named imports from existing confined JavaScript as any", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.js", "throw new Error('unchecked');\n");
		writeFrame(root, "home", 'import { "hyphen-name" as feature } from "../../shared/module.js";\nfeature();\n');

		expect(messages(root)).toEqual([]);
	});

	it("checks TypeScript reached through a JavaScript bridge", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", 'import "./broken.ts";\nexport const runtimeOnly = true;\n');
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import * as bridge from "../../shared/bridge.js";\nbridge.runtimeOnly;\n');

		expect(messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("checks TypeScript reached through nested JavaScript bridges", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", 'import "./nested.js";\n');
		writeDesignFile(root, "shared/nested.js", 'import "./broken.ts";\n');
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		["static require", 'const broken = require("./broken.ts");\nvoid broken;\n'],
		["static dynamic import", 'void import("./broken.ts");\n'],
	] as const)("checks TypeScript reached through a JavaScript $name", (_name, bridge) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", bridge);
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		["query then fragment", "./nested.js?raw", "./broken.ts#preview"],
		["fragment then query", "./nested.js#preview", "./broken.ts?raw"],
	] as const)(
		"checks TypeScript through JavaScript bridges carrying a $name",
		(_name, nestedSpecifier, brokenSpecifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/bridge.js", `import ${JSON.stringify(nestedSpecifier)};\n`);
			writeDesignFile(root, "shared/nested.js", `import ${JSON.stringify(brokenSpecifier)};\n`);
			writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
			writeFrame(root, "home", 'import "../../shared/bridge.js?entry";\n');

			expect(messages(root)).toEqual([
				"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
			]);
		},
	);

	it("checks a TypeScript dependency once through a JavaScript cycle", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/a.js", 'import "./b.js";\n');
		writeDesignFile(root, "shared/b.js", 'import "./a.js";\nimport "./broken.ts";\n');
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/a.js";\n');

		expect(messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("checks TypeScript reached through a JSX bridge without checking JSX semantics", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/bridge.jsx",
			'import "./broken.ts";\nexport default <runtime-only unknownProperty />;\n',
		);
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.jsx";\n');

		expect(messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("enforces the design boundary on an absolute import inside JavaScript", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/javascript-bridge-secret.ts";
		writeDesignFile(root, "shared/bridge.js", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/bridge.js:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("blocks a JavaScript bridge dependency that escapes through a symlink", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "escaped.ts"));
		writeDesignFile(root, "shared/bridge.js", 'import "./escaped.ts";\n');
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/bridge.js:1:8 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("fails closed at malformed reachable JavaScript without traversing past it", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", 'const unsupported = #{};\nimport "./broken.ts";\n');
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/bridge.js:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain("broken.ts");
		expect(result.join("\n")).not.toContain(root);
	});

	it.each([
		["declarations", "export default 1;\nexport default 2;\n"],
		[
			"specifiers",
			"const first = 1;\nconst second = 2;\nexport { first as default };\nexport { second as default };\n",
		],
		["mixed declaration and specifier", "const second = 2;\nexport default 1;\nexport { second as default };\n"],
	] as const)(
		"fails closed at recovered duplicate default $name before inspecting hidden imports",
		(_name, invalid) => {
			const root = makeTempDir();
			markProject(root);
			const secret = "/private/recovered-javascript-secret.ts";
			writeDesignFile(root, "shared/bridge.js", `${invalid}import ${JSON.stringify(secret)};\n`);
			writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

			const result = messages(root);

			expect(result).toEqual(["design/shared/bridge.js:1:1 TS1003: Source syntax cannot be inspected safely"]);
			expect(result.join("\n")).not.toContain(secret);
			expect(result.join("\n")).not.toContain(root);
		},
	);

	it.each([
		["named", "export { missing };\n"],
		["default", "export { missing as default };\n"],
	] as const)(
		"fails closed at an undeclared JavaScript $name export before inspecting hidden imports",
		(_name, invalid) => {
			const root = makeTempDir();
			markProject(root);
			const secret = "/private/undeclared-javascript-export-secret.ts";
			writeDesignFile(root, "shared/bridge.js", `${invalid}import ${JSON.stringify(secret)};\n`);
			writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

			const result = messages(root);

			expect(result).toEqual(["design/shared/bridge.js:1:1 TS1003: Source syntax cannot be inspected safely"]);
			expect(result.join("\n")).not.toContain(secret);
			expect(result.join("\n")).not.toContain(root);
		},
	);

	it.each([
		["bound named", "const value = 1;\nexport { value };\n"],
		["forward named", "export { value };\nconst value = 1;\n"],
		["bound default", "const value = 1;\nexport { value as default };\n"],
		["forward default", "export { value as default };\nconst value = 1;\n"],
	] as const)("keeps a valid $name JavaScript export inspectable", (_name, valid) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", `${valid}import "./broken.ts";\n`);
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("keeps a valid TypeScript type export semantically checked", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/model.ts", "type Model = { label: string };\nexport { Model };\n");
		writeFrame(
			root,
			"home",
			'import type { Model } from "../../shared/model";\nconst model: Model = {};\nvoid model;\n',
		);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2741: Property 'label' is missing in type '{}' but required in type 'Model'. 'label' is declared here.",
		]);
	});

	it.each([
		["duplicate const binding", "js", "const duplicate = 1;\nconst duplicate = 2;\n"],
		["duplicate private name", "jsx", "class Model { #value; #value; }\nexport default <runtime-only />;\n"],
	] as const)("fails closed at a recovered $name in reachable .$extension", (_name, extension, invalid) => {
		const root = makeTempDir();
		markProject(root);
		const secret = `/private/recovered-${extension}-secret.ts`;
		writeDesignFile(root, `shared/bridge.${extension}`, `${invalid}import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `import "../../shared/bridge.${extension}";\n`);

		const result = messages(root);

		expect(result).toEqual([
			`design/shared/bridge.${extension}:1:1 TS1003: Source syntax cannot be inspected safely`,
		]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("applies the offline source budget to a reachable JavaScript bridge", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", "export {};\n");
		truncateSync(join(root, "design", "shared", "bridge.js"), checkSourceLimits.maxFileBytes + 1);
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(messages(root)).toEqual(["design/shared/bridge.js:1:1 TS5083: Offline check resource limit exceeded"]);
	});

	it.each<{
		name: string;
		extension: "js" | "mjs" | "cjs";
		frame: string;
		bridge?: string;
	}>([
		{
			name: "named import",
			extension: "mjs",
			frame: 'import { feature } from "../../shared/module.mjs";\nfeature();\n',
		},
		{
			name: "dynamic import",
			extension: "cjs",
			frame: 'async function load() { (await import("../../shared/module.cjs")).feature(); }\nvoid load;\n',
		},
		{
			name: "import type",
			extension: "js",
			frame: 'type Feature = import("../../shared/module.js").Feature;\ndeclare const feature: Feature;\nfeature();\n',
		},
		{
			name: "named re-export",
			extension: "js",
			bridge: 'export { feature } from "./module.js";\n',
			frame: 'import { feature } from "../../shared/bridge";\nfeature();\n',
		},
		{
			name: "namespace re-export",
			extension: "js",
			bridge: 'export * as module from "./module.js";\n',
			frame: 'import { module } from "../../shared/bridge";\nmodule.feature();\n',
		},
		{
			name: "star re-export",
			extension: "js",
			bridge: 'export * from "./module.js";\n',
			frame: 'import { feature } from "../../shared/bridge";\nfeature();\n',
		},
	])("treats an existing confined JavaScript $name as any", ({ extension, frame, bridge }) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/module.${extension}`, "throw new Error('unchecked');\n");
		if (bridge !== undefined) writeDesignFile(root, "shared/bridge.ts", bridge);
		writeFrame(root, "home", frame);

		expect(messages(root)).toEqual([]);
	});

	it("ignores adjacent declarations for an existing confined JavaScript module", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.js", "throw new Error('unchecked');\n");
		writeDesignFile(root, "shared/module.d.ts", "export const known: string;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module.js";\nmodule.feature();\n');

		expect(messages(root)).toEqual([]);
	});

	it("checks TypeScript selected through an explicit JavaScript module specifier", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/value.ts", "export const value: string = 1;\n");
		writeFrame(root, "home", 'import { value } from "../../shared/value.js";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/shared/value.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("checks TSX selected through an explicit JSX module specifier", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/value.tsx", "export const value: string = 1;\n");
		writeFrame(root, "home", 'import { value } from "../../shared/value.jsx";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/shared/value.tsx:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		["JavaScript", "js", "ts"],
		["JSX", "jsx", "tsx"],
		["ES module JavaScript", "mjs", "mts"],
		["CommonJS", "cjs", "cts"],
	] as const)("keeps an exact confined %s asset ahead of its TypeScript substitute", (_, asset, substitute) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/value.${asset}`, "globalThis.missingRuntimeGlobal.deep.property;\n");
		writeDesignFile(root, `shared/value.${substitute}`, "export const broken: string = 1;\n");
		writeFrame(root, "home", `import * as value from "../../shared/value.${asset}";\nvalue.runtimeOnly();\n`);

		expect(messages(root)).toEqual([]);
	});

	it("keeps the explicit .js substitution order at .ts before .tsx", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/explicit-js-tsx-lower-priority-secret.ts";
		writeDesignFile(root, "shared/value.ts", 'export const value = "selected TS";\n');
		writeDesignFile(
			root,
			"shared/value.tsx",
			`import ${JSON.stringify(secret)};\nexport const value = "lower-priority TSX";\n`,
		);
		writeFrame(root, "home", 'import { value } from "../../shared/value.js";\nvoid value;\n');

		expect(messages(root)).toEqual([]);
	});

	it("treats every supported import shape from existing confined JSX as any", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/module.jsx",
			"globalThis.missingRuntimeGlobal.deep.property;\nexport default <runtime-only unknownProperty />;\n",
		);
		writeDesignFile(
			root,
			"shared/bridge.ts",
			'export { default as defaultFeature, feature as named } from "./module.jsx";\nexport type { Feature as NamedFeature } from "./module.jsx";\nexport * as module from "./module.jsx";\nexport * from "./module.jsx";\n',
		);
		writeFrame(
			root,
			"home",
			'import direct, * as namespace from "../../shared/module.jsx";\nimport { feature, "hyphen-name" as stringNamed, type Feature } from "../../shared/module.jsx";\nimport "../../shared/module.jsx";\ntype Imported = import("../../shared/module.jsx").Feature;\nvoid import("../../shared/module.jsx").then((loaded) => loaded.dynamic());\nimport { defaultFeature, named, module, starFeature, type NamedFeature } from "../../shared/bridge";\ndeclare const typed: Feature & Imported & NamedFeature;\ndirect();\nnamespace.anything();\nfeature();\nstringNamed();\ndefaultFeature();\nnamed();\nmodule.anything();\nstarFeature();\nvoid typed;\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it.each(["js", "jsx"] as const)(
		"treats an extensionless confined .%s module as unchecked JavaScript",
		(extension) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(
				root,
				`shared/module.${extension}`,
				extension === "jsx"
					? "globalThis.missingRuntimeGlobal.deep.property;\nexport default <runtime-only unknownProperty />;\n"
					: "globalThis.missingRuntimeGlobal.deep.property;\n",
			);
			writeFrame(root, "home", 'import * as module from "../../shared/module";\nmodule.runtimeOnly();\n');

			expect(messages(root)).toEqual([]);
		},
	);

	it.each(["../../shared/module", "../../shared/module?raw", "../../shared/module#preview"] as const)(
		"keeps an extensionless live JavaScript module ahead of an adjacent declaration for %s",
		(specifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/module.js", "export const runtimeOnly = true;\n");
			writeDesignFile(root, "shared/module.d.ts", "export type Broken = MissingType;\n");
			writeFrame(root, "home", `import * as module from ${JSON.stringify(specifier)};\nmodule.runtimeOnly;\n`);

			expect(messages(root)).toEqual([]);
		},
	);

	it.each(["../../shared/module", "../../shared/module?raw", "../../shared/module#preview"] as const)(
		"keeps an exact extensionless runtime file ahead of appended candidates for %s",
		(specifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/module", "export const runtimeOnly = true;\n");
			writeDesignFile(root, "shared/module.ts", "export const broken: string = 1;\n");
			writeFrame(root, "home", `import * as module from ${JSON.stringify(specifier)};\nmodule.runtimeOnly;\n`);

			expect(messages(root)).toEqual([]);
		},
	);

	it.each([
		["extensionless", "module"],
		["JavaScript", "module.js"],
		["JSX", "module.jsx"],
		["ES module", "module.mjs"],
		["CommonJS", "module.cjs"],
	] as const)("rejects TypeScript syntax in an exact %s file like its live loader", (_name, source) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/${source}`, 'export const value: string = "runtime";\n');
		writeDesignFile(root, "shared/module.ts", 'export const value = "lower";\n');
		writeFrame(root, "home", `import "../../shared/${source}?raw";\n`);

		expect(messages(root)).toEqual([`design/shared/${source}:1:1 TS1003: Source syntax cannot be inspected safely`]);
	});

	it.each([
		["extensionless", "module"],
		["JavaScript", "module.js"],
		["ES module", "module.mjs"],
		["CommonJS", "module.cjs"],
	] as const)("rejects JSX syntax in an exact %s file like its live loader", (_name, source) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/${source}`, "export default <runtime-only />;\n");
		writeFrame(root, "home", `import "../../shared/${source}#preview";\n`);

		expect(messages(root)).toEqual([`design/shared/${source}:1:1 TS1003: Source syntax cannot be inspected safely`]);
	});

	it("accepts JSX syntax in an exact .jsx file like the live loader", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.jsx", "export default <runtime-only />;\n");
		writeFrame(root, "home", 'import "../../shared/module.jsx";\n');

		expect(messages(root)).toEqual([]);
	});

	it.each(["ts", "tsx", "mts", "cts"] as const)(
		"keeps TypeScript inspection active for an exact .%s source",
		(extension) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, `shared/module.${extension}`, "export const broken: string = 1;\n");
			writeFrame(root, "home", `import "../../shared/module.${extension}";\n`);

			expect(messages(root)).toEqual([
				`design/shared/module.${extension}:1:14 TS2322: Type 'number' is not assignable to type 'string'.`,
			]);
		},
	);

	it("blocks an exact extensionless candidate that escapes through a symlink", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "module"));
		writeDesignFile(root, "shared/module.ts", "export const lower = true;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module?raw";\nmodule.runtimeOnly;\n');

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:25 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("refuses a non-regular exact extensionless candidate without opening it", async () => {
		const root = makeTempDir();
		markProject(root);
		const source = join(root, "design", "shared", "module");
		mkdirSync(dirname(source), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(source, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));
		writeFrame(root, "home", 'import * as module from "../../shared/module#preview";\nmodule.runtimeOnly;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:25 TS2307: Filesystem read refused (non-regular file)",
		]);
	});

	it("applies the offline source budget to an exact extensionless candidate", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module", "export {};\n");
		truncateSync(join(root, "design", "shared", "module"), checkSourceLimits.maxFileBytes + 1);
		writeFrame(root, "home", 'import "../../shared/module";\n');

		expect(messages(root)).toEqual(["design/shared/module:1:1 TS5083: Offline check resource limit exceeded"]);
	});

	it("resolves an implicit CSS extension selected by the live compiler", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme.css", ".root { color: red; }\n");
		writeFrame(root, "home", 'import styles from "../../shared/theme?inline";\nstyles.runtimeClass;\n');

		expect(messages(root)).toEqual([]);
	});

	it("preserves an authored declaration for an implicit CSS extension", () => {
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

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("checks an implicit JSON extension selected by the live compiler", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data.json", '{ "label": "live" }\n');
		writeFrame(
			root,
			"home",
			'import data from "../../shared/data#preview";\nconst label: number = data.label;\nvoid label;\n',
		);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("preserves the strict TypeScript diagnostic for deprecated import assertions", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data.json", '{ "label": "live" }\n');
		writeFrame(root, "home", 'import data from "../../shared/data.json" assert { type: "json" };\nvoid data;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:43 TS2880: Import assertions have been replaced by import attributes. Use 'with' instead of 'assert'.",
		]);
	});

	it("accepts current import attributes while keeping JSON semantics", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data.json", '{ "label": "live" }\n');
		writeFrame(
			root,
			"home",
			'import data from "../../shared/data.json" with { type: "json" };\nconst label: string = data.label;\nvoid label;\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("resolves an implicit CSS index selected by the live compiler", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/theme/index.css", ".root { color: red; }\n");
		writeFrame(root, "home", 'import styles from "../../shared/theme?inline";\nstyles.runtimeClass;\n');

		expect(messages(root)).toEqual([]);
	});

	it("checks an implicit JSON index selected by the live compiler", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/data/index.json", '{ "label": "live" }\n');
		writeFrame(
			root,
			"home",
			'import data from "../../shared/data/#preview";\nconst label: number = data.label;\nvoid label;\n',
		);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2322: Type 'string' is not assignable to type 'number'.",
		]);
	});

	it("keeps an extensionless live TypeScript module ahead of JavaScript", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const broken: string = 1;\n");
		writeDesignFile(root, "shared/module.js", "export const runtimeOnly = true;\n");
		writeFrame(root, "home", 'import "../../shared/module";\n');

		expect(messages(root)).toEqual([
			"design/shared/module.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("checks an explicit declaration even when its JavaScript runtime sibling exists", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.js", "export const runtimeOnly = true;\n");
		writeDesignFile(root, "shared/module.d.ts", "export type Broken = MissingType;\n");
		writeFrame(root, "home", 'import "../../shared/module.d.ts";\n');

		expect(messages(root)).toEqual(["design/shared/module.d.ts:1:22 TS2304: Cannot find name 'MissingType'."]);
	});

	it("keeps a live JavaScript index ahead of a declaration-only sibling", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module/index.js", "export const runtimeOnly = true;\n");
		writeDesignFile(root, "shared/module.d.ts", "export type Broken = MissingType;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module";\nmodule.runtimeOnly;\n');

		expect(messages(root)).toEqual([]);
	});

	it("keeps a directory-only JavaScript index ahead of its declaration", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module/index.js", "export const runtimeOnly = true;\n");
		writeDesignFile(root, "shared/module/index.d.ts", "export type Broken = MissingType;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module/";\nmodule.runtimeOnly;\n');

		expect(messages(root)).toEqual([]);
	});

	it("skips a directory candidate before selecting an extensionless TSX module", () => {
		const root = makeTempDir();
		markProject(root);
		mkdirSync(join(root, "design", "shared", "value.ts"), { recursive: true });
		writeDesignFile(root, "shared/value.tsx", 'export const value = "ok";\n');
		writeFrame(root, "home", 'import { value } from "../../shared/value";\nvalue.toUpperCase();\n');

		expect(messages(root)).toEqual([]);
	});

	it("checks the extensionless TSX module selected by the live compiler before an adjacent TS module", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/extensionless-tsx-priority-secret.ts";
		writeDesignFile(root, "shared/value.ts", 'export const value = "clean TS";\n');
		writeDesignFile(
			root,
			"shared/value.tsx",
			`import ${JSON.stringify(secret)};\nexport const value = "runtime TSX";\n`,
		);
		writeFrame(root, "home", 'import { value } from "../../shared/value";\nvoid value;\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/value.tsx:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("checks the extensionless TSX index selected by the live compiler before an adjacent TS index", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/extensionless-index-tsx-priority-secret.ts";
		writeDesignFile(root, "shared/value/index.ts", 'export const value = "clean TS index";\n');
		writeDesignFile(
			root,
			"shared/value/index.tsx",
			`import ${JSON.stringify(secret)};\nexport const value = "runtime TSX index";\n`,
		);
		writeFrame(root, "home", 'import { value } from "../../shared/value";\nvoid value;\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/value/index.tsx:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it.each([
		["direct module", "shared/value.tsx", "shared/value.ts"],
		["index module", "shared/value/index.tsx", "shared/value/index.ts"],
	] as const)("keeps TypeScript semantics on the runtime-selected TSX %s", (_, selected, ignored) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, selected, 'export const value = "runtime TSX";\n');
		writeDesignFile(root, ignored, "export const ignored: string = 1;\n");
		writeFrame(root, "home", 'import { value } from "../../shared/value";\nvalue.toUpperCase();\n');

		expect(messages(root)).toEqual([]);
	});

	it.each([
		["direct module", "shared/value.tsx", "shared/value.ts", "../../shared/value", "../../shared/value.ts"],
		[
			"index module",
			"shared/value/index.tsx",
			"shared/value/index.ts",
			"../../shared/value",
			"../../shared/value/index.ts",
		],
	] as const)(
		"pins the runtime-selected TSX %s when its adjacent TS file is explicitly reachable",
		(_, selected, explicit, extensionlessSpecifier, explicitSpecifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, selected, 'export const runtimeValue = "runtime TSX";\n');
			writeDesignFile(root, explicit, 'export const explicitValue = "explicit TS";\n');
			writeFrame(
				root,
				"home",
				`import { runtimeValue } from ${JSON.stringify(extensionlessSpecifier)};\nimport { explicitValue } from ${JSON.stringify(explicitSpecifier)};\nexport default function Home() { return <main>{runtimeValue}{explicitValue}</main>; }\n`,
			);

			expect(messages(root)).toEqual([]);
		},
	);

	it("keeps one-code-unit module aliases injective past the old wrap", { timeout: 30_000 }, () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "frames/home/index.ts", "export const rootOnly = true;\n");
		writeDesignFile(root, "shared/dep/index.ts", "export const depOnly = true;\n");
		writeDesignFile(root, "shared/dep/source.ts", 'import { depOnly } from ".";\nvoid depOnly;\n');
		writeFrame(
			root,
			"home",
			`import { rootOnly } from ".";\n${'import ".";\n'.repeat(4_095)}import "../../shared/dep/source";\nvoid rootOnly;\n`,
		);

		expect(messages(root)).toEqual([]);
	});

	it("keeps local and ambient checker aliases in one collision-free namespace", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "frames/home/index.ts", "export const known = true;\n");
		const declarations = Array.from({ length: 1_793 }, (_, index) =>
			index === 1_792 ? 'declare module "x" { export const injected: true; }\n' : 'declare module "x" {}\n',
		).join("");
		writeFrame(root, "home", `import { injected } from ".";\n${declarations}void injected;\n`);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:10 TS2305: Module '\".\"' has no exported member 'injected'.",
		]);
	});

	it("accepts the full checker alias budget for compact ambient modules", { timeout: 30_000 }, () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'declare module""{}\n'.repeat(checkSourceLimits.maxAliases));

		expect(messages(root)).toEqual([]);
	});

	it("fails closed with one stable diagnostic when checker aliases exhaust their resource budget", {
		timeout: 30_000,
	}, () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "frames/home/index.ts", "export const known = true;\n");
		writeFrame(root, "home", 'import ".";\n'.repeat(checkSourceLimits.maxAliases + 1));

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS5083: Offline check resource limit exceeded",
		]);
	});

	it("reports a missing local JSX module despite an adjacent declaration", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/missing.d.ts", "export const known: string;\n");
		writeFrame(root, "home", 'import { feature } from "../../shared/missing.jsx";\nfeature();\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:25 TS2307: Cannot find module '../../shared/missing.jsx' or its corresponding type declarations.",
		]);
	});

	it("types every import form from a mapped external and keeps exact star keys exact", () => {
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

		const result = messages(root);

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
	])("treats an isolated mapped $name as any", ({ frame, bridge }) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		if (bridge !== undefined) writeDesignFile(root, "shared/bridge.ts", bridge);
		writeFrame(root, "home", frame);

		expect(messages(root)).toEqual([]);
	});

	it("accepts arbitrary string-named imports from mapped externals", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeFrame(root, "home", 'import { "hyphen-name" as value } from "mapped";\nvalue.feature();\n');

		expect(messages(root)).toEqual([]);
	});

	it("still reports missing exports from ordinary TypeScript modules", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = 1;\n");
		writeFrame(root, "home", 'import { missing } from "../../shared/module";\nvoid missing;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:10 TS2305: Module '\"../../shared/module\"' has no exported member 'missing'.",
		]);
	});

	it("does not replace an unrelated authored PUA value with a checker module name", () => {
		const root = makeTempDir();
		markProject(root);
		const authoredPua = "\ue001";
		writeDesignFile(root, "frames/home/index.ts", "export const known = true;\n");
		writeFrame(
			root,
			"home",
			`import { known } from ".";\nvoid known;\nconst value = {};\nvalue[${JSON.stringify(authoredPua)}];\n`,
		);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain(`Property '${authoredPua}' does not exist on type '{}'.`);
		expect(result[0]).not.toContain("Property '.'");
	});

	it("restores the authored module name in a cascading namespace diagnostic", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = true;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module";\nmodule.missing;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:8 TS2339: Property 'missing' does not exist on type 'typeof import(\"../../shared/module\")'.",
		]);
	});

	it.each([
		["parenthesized", "(first).missing;\n"],
		["non-null", "(first!).missing;\n"],
		["asserted", "(first as typeof first).missing;\n"],
		["computed", 'first["missing"];\n'],
		["destructured", "const { missing } = first;\nvoid missing;\n"],
	] as const)("restores the bound module name for a $name namespace use", (_name, use) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = true;\n");
		writeFrame(
			root,
			"home",
			`import * as first from "../../shared/module";\nimport * as second from "../../shared/module.ts";\n${use}void second;\n`,
		);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain('typeof import("../../shared/module")');
		expect(result[0]).not.toContain('typeof import("design/shared/module")');
	});

	it("restores the bound TypeScript import-assignment name in a cascading diagnostic", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.ts", "export const known = true;\n");
		writeDesignFile(
			root,
			"shared/entry.cts",
			'import first = require("./module");\nimport second = require("./module.ts");\nfirst.missing;\nvoid second;\n',
		);
		writeFrame(root, "home", 'import "../../shared/entry.cjs";\n');

		expect(messages(root).filter((message) => !message.includes("TS1202:"))).toEqual([
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
	])("classifies a bare $name independently of wildcard ambient modules", ({ name, source }) => {
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

			const result = messages(root);
			const resolution = result.filter((message) => message.includes("TS2307:"));
			const other = result.filter((message) => !message.includes("TS2307:") && !message.includes("TS1202:"));

			expect(resolution).toHaveLength(classification === "mapped" ? 0 : 1);
			if (classification === "unmapped") expect(resolution[0]).toContain(`'${specifier}'`);
			expect(other).toEqual([]);
		}
	});

	it("keeps the real module-mode error for a mapped TypeScript import assignment", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(root, "home", 'import value = require("mapped");\nvalue.runtimeOnly();\n');

		const result = messages(root);

		expect(result).toEqual([
			expect.stringContaining("TS1202: Import assignment cannot be used when targeting ECMAScript modules."),
		]);
		expect(result.join("\n")).not.toContain("TS2307");
	});

	it("ignores exact ambient declarations for mapped and unmapped runtime modules", () => {
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

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Cannot find module 'unmapped-exact'");
		expect(result.join("\n")).not.toContain("Cannot find module 'mapped-exact'");
	});

	it.each(["mapped", "unmapped"] as const)(
		"keeps an empty %s specifier independent of an exact empty ambient declaration",
		(classification) => {
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

			const result = messages(root);

			if (classification === "mapped") {
				expect(result).toEqual([]);
			} else {
				expect(result).toEqual([expect.stringContaining("TS2307: Cannot find module ''")]);
			}
		},
	);

	it("neutralizes a compact empty ambient declaration without hiding its body errors", () => {
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

		expect(messages(root)).toEqual(["design/shared/ambient.d.ts:1:37 TS2304: Cannot find name 'MissingType'."]);
	});

	it("neutralizes a compact empty export assignment without hiding its type errors", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "": "https://example.test/empty.js" } }\n');
		writeDesignFile(root, "shared/ambient.d.ts", 'declare module""{const value:MissingType;export=value;}\n');
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport value from "";\nvalue.runtimeOnly();\n',
		);

		expect(messages(root)).toEqual(["design/shared/ambient.d.ts:1:30 TS2304: Cannot find name 'MissingType'."]);
	});

	it("classifies an import assignment inside a compact empty ambient declaration", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "": "https://example.test/empty.js" } }\n');
		writeDesignFile(root, "shared/ambient.d.ts", 'declare module""{import value=require("other");export=value;}\n');
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/ambient.d.ts" />\nimport value from "";\nvalue.runtimeOnly();\n',
		);

		expect(messages(root)).toEqual([expect.stringContaining("TS2307: Cannot find module 'other'")]);
	});

	it.each(["mapped", "unmapped"] as const)(
		"classifies a dot-prefixed %s bare specifier as external",
		(classification) => {
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

			const result = messages(root);

			if (classification === "mapped") {
				expect(result).toEqual([]);
			} else {
				expect(result).toEqual([expect.stringContaining(`TS2307: Cannot find module '${specifier}'`)]);
			}
		},
	);

	it("keeps pinned modules typed despite exact and wildcard ambient declarations", () => {
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

		const result = messages(root);

		expect(result).toHaveLength(2);
		expect(result.join("\n")).toContain("has no exported member 'injected'");
		expect(result.join("\n")).toContain("has no exported member 'wildcardInjected'");
		expect(result.join("\n")).not.toContain("useState");
		expect(result.join("\n")).not.toContain("Property 'go'");
	});

	it("neutralizes a reachable module augmentation without hiding errors in its declaration body", () => {
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

		const result = messages(root);

		expect(result.filter((message) => message.includes("TS2307:"))).toEqual([
			expect.stringContaining("Cannot find module 'unmapped-augmentation'"),
		]);
		expect(result.filter((message) => message.includes("MissingType"))).toEqual([
			expect.stringContaining("design/shared/augmentations.ts:4:23 TS2304:"),
		]);
		expect(result.join("\n")).not.toContain("\ue001");
	});

	it("preserves a confined relative module augmentation", () => {
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

		expect(messages(root)).toEqual([]);
	});

	it("reports an invalid relative ambient declaration in a script declaration file", () => {
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

		expect(messages(root)).toEqual([
			expect.stringContaining("TS2436: Ambient module declaration cannot specify relative module name."),
		]);
	});

	it("preserves authored diagnostic positions around mapped imports", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeFrame(root, "home", 'import mapped from "mapped";\nmapped.feature();\nmissingName;\n');

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:3:1 TS2304: Cannot find name 'missingName'."]);
	});

	it.each([null, [], 42, "invalid"] as const)("treats a non-record import map root as having no mappings", (value) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", `${JSON.stringify(value)}\n`);
		writeFrame(root, "home", 'import mapped from "mapped";\nvoid mapped;\n');

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Cannot find module 'mapped'");
		expect(result.join("\n")).not.toContain(root);
	});

	it("keeps a query-like suffix on a bare specifier in import-map policy", () => {
		const root = makeTempDir();
		markProject(root);
		const specifier = "mapped?../../../outside";
		writeDesignFile(
			root,
			"shared/importmap.json",
			`${JSON.stringify({ imports: { [specifier]: "https://example.test/mapped.js" } })}\n`,
		);
		writeFrame(root, "home", `import mapped from ${JSON.stringify(specifier)};\nmapped.runtimeOnly();\n`);

		expect(messages(root)).toEqual([]);
	});

	it("ignores design-local packages when checking mapped externals", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example/mapped.js" } }\n');
		writeDesignFile(root, "node_modules/mapped/package.json", '{ "name": "mapped", "types": "index.d.ts" }\n');
		writeDesignFile(root, "node_modules/mapped/index.d.ts", "export const known: string;\n");
		writeFrame(root, "home", 'import * as mapped from "mapped";\nmapped.feature();\n');

		expect(messages(root)).toEqual([]);
	});

	it("ignores an import map whose canonical target is design-local package data", () => {
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

		const result = messages(root);

		expect(result).toEqual([
			"design/frames/home/frame.tsx:1:20 TS2307: Cannot find module 'hidden-mapped' or its corresponding type declarations.",
		]);
	});

	it("does not resolve unmapped imports from design-local packages", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "node_modules/unmapped/package.json", '{ "name": "unmapped", "types": "index.d.ts" }\n');
		writeDesignFile(root, "node_modules/unmapped/index.d.ts", "export const value: string;\n");
		writeFrame(root, "home", 'import { value } from "unmapped";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Cannot find module 'unmapped' or its corresponding type declarations.",
		]);
	});

	it("does not resolve a source alias into design-local packages", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "node_modules/hidden/index.ts", "export const value = 1;\n");
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(
			join(root, "design", "node_modules", "hidden", "index.ts"),
			join(root, "design", "shared", "vendor.ts"),
		);
		writeFrame(root, "home", 'import { value } from "../../shared/vendor";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Cannot find module '../../shared/vendor' or its corresponding type declarations.",
		]);
	});

	it("does not resolve design package import aliases", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "package.json", '{ "imports": { "#alias": "./shared/alias.ts" } }\n');
		writeDesignFile(root, "shared/alias.ts", "export const value = 1;\n");
		writeFrame(root, "home", 'import { value } from "#alias";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Cannot find module '#alias' or its corresponding type declarations.",
		]);
	});

	it("keeps mapped external semantics through an in-design source alias", () => {
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

		expect(messages(root)).toEqual([]);
	});

	it("diagnoses one canonical source once through multiple in-design aliases", () => {
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

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/shared/real.ts:1:");
		expect(result[0]).toContain("TS2322: Type 'number' is not assignable to type 'string'.");
		expect(result[0]).not.toContain("first.ts");
		expect(result[0]).not.toContain("second.ts");
	});

	it("discovers modules from syntax while leaving comments and strings inert", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'// import "../../outside"\nconst text = \'export * from "../../outside"\';\nexport default function Home() { return <p>{text}</p>; }\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("replaces absolute local module errors with a stable boundary diagnostic", () => {
		const root = makeTempDir();
		markProject(root);
		const absolute = "/private/spool-secret/missing.ts";
		writeFrame(root, "home", `import value from ${JSON.stringify(absolute)};\nvoid value;\n`);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result[0]).not.toContain(absolute);
		expect(result[0]).not.toContain("spool-secret");
	});

	it("blocks a relative import from entering a checker-trusted declaration root", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		const frame = join(root, "design", "frames", "home", "frame.tsx");
		const specifier = relative(dirname(frame), trusted);
		writeFrame(root, "home", `import * as runtime from ${JSON.stringify(specifier)};\nruntime.notReal();\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:26 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it("diagnoses an extensionless source alias that resolves into a trusted root", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "trusted.ts"));
		writeFrame(root, "home", 'import * as runtime from "../../shared/trusted";\nruntime.notReal();\n');

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:26 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it.each([
		["module", "module.tsx"],
		["module.tsx", "module.ts"],
		["module.ts", "module.jsx"],
		["module.jsx", "module.js"],
		["module.js", "module.css"],
		["module.css", "module.json"],
		["module.json", "module/index.tsx"],
		["module/index.tsx", "module/index.ts"],
		["module/index.ts", "module/index.jsx"],
		["module/index.jsx", "module/index.js"],
		["module/index.js", "module/index.css"],
		["module/index.css", "module/index.json"],
		["module/index.json", "module.d.ts"],
		["module.d.ts", "module/index.d.ts"],
	] as const)("selects %s before %s without inspecting the lower extensionless candidate", (selected, lower) => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		const source = selected.endsWith(".css")
			? ".value { color: red; }\n"
			: selected.endsWith(".json")
				? '{ "value": "confined" }\n'
				: selected.endsWith(".d.ts")
					? "declare const value: string;\nexport default value;\n"
					: "const value = 'confined';\nexport default value;\n";
		writeDesignFile(root, `shared/${selected}`, source);
		mkdirSync(dirname(join(root, "design", "shared", lower)), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", lower));
		writeFrame(root, "home", 'import value from "../../shared/module";\nvoid value;\n');

		expect(messages(root)).toEqual([]);
	});

	it("keeps direct implicit JSON ahead of a TypeScript index", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/extensionless-json-priority-secret.ts";
		writeDesignFile(root, "shared/module.json", '{ "value": "runtime JSON" }\n');
		writeDesignFile(
			root,
			"shared/module/index.ts",
			`import ${JSON.stringify(secret)};\nexport const value = "index";\n`,
		);
		writeFrame(root, "home", 'import data from "../../shared/module";\ndata.value.toUpperCase();\n');

		const result = messages(root);

		expect(result).toEqual([]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("treats a trailing-slash import as directory-only", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "module.ts"));
		writeDesignFile(root, "shared/module/index.ts", 'export const value = "index";\n');
		writeFrame(root, "home", 'import { value } from "../../shared/module/";\nvalue.toUpperCase();\n');

		expect(messages(root)).toEqual([]);
	});

	it("treats a terminal dot-segment import as directory-only", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/dot-segment-priority-secret.ts";
		writeDesignFile(root, "frames/home.ts", 'export const value = "wrong sibling";\n');
		writeDesignFile(
			root,
			"frames/home/index.ts",
			`import ${JSON.stringify(secret)};\nexport const value = "index";\n`,
		);
		writeFrame(root, "home", 'import { value } from ".";\nvalue.toUpperCase();\n');

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/index.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("blocks the first existing extensionless candidate when it escapes design", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "module.tsx"));
		writeDesignFile(root, "shared/module.ts", "export const value = 'lower priority';\n");
		writeFrame(root, "home", 'import * as runtime from "../../shared/module";\nruntime.notReal();\n');

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:26 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it("blocks an absolute TypeScript import assignment without leaking its target", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/spool-import-assignment-secret.ts";
		writeFrame(root, "home", `import secret = require(${JSON.stringify(secret)});\nvoid secret;\n`);

		const result = messages(root);

		expect(result).toEqual([
			expect.stringContaining("design/frames/home/frame.tsx:1:1 TS1202: Import assignment cannot be used"),
			"design/frames/home/frame.tsx:1:25 TS2307: Absolute local imports are outside design/",
		]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain("spool-import-assignment-secret");
	});

	it("blocks an absolute exported TypeScript import assignment at its Babel 7 source literal", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/spool-exported-import-assignment-secret.ts";
		writeFrame(root, "home", `export import secret = require(${JSON.stringify(secret)});\nvoid secret;\n`);

		const result = messages(root);

		expect(result).toContain("design/frames/home/frame.tsx:1:32 TS2307: Absolute local imports are outside design/");
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain("spool-exported-import-assignment-secret");
	});

	it("classifies cooked static template imports while leaving expression templates dynamic", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			`async function load() {\n\t(await import(\`mapped\\x2fpkg\`)).anything();\n\t(await import(\`unmapped-template\`)).anything();\n\tconst segment = "secret";\n\t(await import(\`/private/\${segment}\`)).anything();\n}\nvoid load;\n`,
		);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:3:16");
		expect(result[0]).toContain("TS2307: Cannot find module 'unmapped-template'");
		expect(result.join("\n")).not.toContain("mapped/pkg");
		expect(result.join("\n")).not.toContain("/private/");
	});

	it("blocks a static template import into a trusted root without loading or leaking it", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(root, "home", `async function load() { (await import(\`${trusted}\`)).notReal(); }\nvoid load;\n`);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it("fails closed on a deferred import that the live ES2022 build rejects", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(root, "home", 'import defer * as deferred from "mapped";\ndeferred.runtimeOnly();\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely",
		]);
	});

	it.each([
		["decorator", "function dec(value: Function) {}\n@dec class Model {}\n"],
		["exported decorator", "function dec(value: Function) {}\n@dec export class Model {}\n"],
		["auto-accessor", "class Model { accessor value = 1; }\n"],
	])("keeps module policy active around a TypeScript %s", (_name, syntax) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(root, "home", `${syntax}import mapped from "mapped";\nmapped.runtimeOnly();\nvoid Model;\n`);

		expect(messages(root)).toEqual([]);
	});

	it.each([
		{ form: "plain concrete", declaration: "@dec declare class Model {}", isDefault: false },
		{ form: "plain abstract", declaration: "@dec declare abstract class Model {}", isDefault: false },
		{
			form: "decorator before export concrete",
			declaration: "@dec export declare class Model {}",
			isDefault: false,
		},
		{
			form: "decorator before export abstract",
			declaration: "@dec export declare abstract class Model {}",
			isDefault: false,
		},
		{
			form: "export before decorator concrete",
			declaration: "export @dec declare class Model {}",
			isDefault: false,
		},
		{
			form: "export before decorator abstract",
			declaration: "export @dec declare abstract class Model {}",
			isDefault: false,
		},
		{
			form: "default concrete",
			declaration: "export default @dec declare class Model {}",
			isDefault: true,
		},
		{
			form: "default abstract",
			declaration: "export default @dec declare abstract class Model {}",
			isDefault: true,
		},
	] as const)("accepts the TypeScript decorated declare class $form form", ({ declaration, isDefault }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n${declaration}\n${
				isDefault ? "" : "export default function Home() { return null; }\n"
			}`,
		);

		expect(messages(root)).toEqual([]);
	});

	it.each([
		{ shape: "named", declaration: "export default @dec abstract class Model {}" },
		{ shape: "anonymous", declaration: "export default @dec abstract class {}" },
	] as const)("accepts a decorated runtime default abstract $shape class", ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\n`);

		expect(messages(root)).toEqual([]);
	});

	it.each([
		{ modifier: "concrete", declaration: "export default @dec declare class {}" },
		{ modifier: "abstract", declaration: "export default @dec declare abstract class {}" },
	] as const)("accepts a decorated ambient anonymous default $modifier class", ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\n`);

		expect(messages(root)).toEqual([]);
	});

	it("preserves strict TypeScript diagnostics when an ambient default precedes a runtime default", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			[
				"function dec(value: Function) {}",
				"export default @dec declare abstract class Ambient {}",
				"export default function Home() { return null; }",
			].join("\n"),
		);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:44 TS2323: Cannot redeclare exported variable 'default'.",
			"design/frames/home/frame.tsx:3:25 TS2323: Cannot redeclare exported variable 'default'.",
		]);
	});

	it("accepts every ECMAScript same-line whitespace between decorated ambient class modifiers", () => {
		const root = makeTempDir();
		markProject(root);
		const whitespace = [
			"\u0009",
			"\u000b",
			"\u000c",
			"\u0020",
			"\u00a0",
			"\u1680",
			"\u2000",
			"\u2001",
			"\u2002",
			"\u2003",
			"\u2004",
			"\u2005",
			"\u2006",
			"\u2007",
			"\u2008",
			"\u2009",
			"\u200a",
			"\u202f",
			"\u205f",
			"\u3000",
			"\ufeff",
		];
		const declarations = whitespace
			.map((gap, index) => `@dec declare${gap}abstract${gap}class Model${index} {}`)
			.join("\n");
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n${declarations}\nexport default function Home() { return null; }\n`,
		);

		expect(messages(root)).toEqual([]);
	});

	it.each([
		{
			placement: "inline comments",
			declaration: "@dec declare /* modifier */ abstract /* class */ class Model {}",
		},
		{
			placement: "decorator newline",
			declaration: "@dec\n/* decorator gap */ declare abstract class Model {}",
		},
	] as const)("accepts a decorated declare abstract class with $placement placement", ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n${declaration}\nexport default function Home() { return null; }\n`,
		);

		expect(messages(root)).toEqual([]);
	});

	it("accepts multiple decorated declare classes with an inline comment gap", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			[
				"function dec(value: Function) {}",
				"@dec declare /* first */ class First {}",
				"@dec",
				"declare abstract class Second {}",
				"export default function Home() { return null; }",
			].join("\n"),
		);

		expect(messages(root)).toEqual([]);
	});

	it("fails closed when the decorated declare repair budget is exhausted", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-budget-secret.ts";
		const declarations = Array.from(
			{ length: 33 },
			(_, index) => `@dec declare ${index % 2 === 0 ? "abstract " : ""}class Model${index} {}`,
		).join("\n");
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n${declarations}\nimport ${JSON.stringify(secret)};\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("does not let a decorated ambient class shadow a static require", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-require-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare class require {}\nrequire(${JSON.stringify(secret)});\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:9 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("does not let an exported decorated ambient abstract class shadow a static require", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-abstract-require-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\nexport default @dec declare abstract class require {}\nrequire(${JSON.stringify(secret)});\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:9 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("preserves import offsets after an astral decorated ambient default class", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`const label = "🧵";\nfunction dec(value: Function) {}\nexport default @dec declare abstract class Model {}\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\nvoid label;\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:4:30 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain(root);
	});

	it("preserves import offsets after inspecting a decorated declare class", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare class Model {}\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:30 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed when a decorated declare class is split after declare", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-newline-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare\nclass Model {}\nimport ${JSON.stringify(secret)};\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it.each([
		{ form: "newline after declare", declaration: "@dec declare\nabstract class Model {}" },
		{ form: "carriage return after declare", declaration: "@dec declare\rabstract class Model {}" },
		{ form: "line separator after declare", declaration: "@dec declare\u2028abstract class Model {}" },
		{ form: "paragraph separator after declare", declaration: "@dec declare\u2029abstract class Model {}" },
		{ form: "non-whitespace U+0085 after declare", declaration: "@dec declare\u0085abstract class Model {}" },
		{ form: "newline after abstract", declaration: "@dec declare abstract\nclass Model {}" },
		{
			form: "newline-bearing comment",
			declaration: "@dec declare /* modifier\n */ abstract class Model {}",
		},
		{ form: "duplicate modifier", declaration: "@dec declare abstract abstract class Model {}" },
		{ form: "missing class keyword", declaration: "@dec declare abstract Model {}" },
	] as const)("fails closed on a decorated declare abstract class with $form", ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-abstract-malformed-secret.ts";
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\nimport ${JSON.stringify(secret)};\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it.each([
		{
			form: "runtime default newline",
			declaration: "export default @dec abstract\nclass Model {}",
		},
		{
			form: "runtime default comment newline",
			declaration: "export default @dec abstract /* modifier\n */ class Model {}",
		},
		{
			form: "runtime default duplicate modifier",
			declaration: "export default @dec abstract abstract class Model {}",
		},
		{
			form: "runtime default missing class",
			declaration: "export default @dec abstract Model {}",
		},
		{
			form: "non-default class expression",
			declaration: "const Model = @dec abstract class {};",
		},
		{
			form: "non-default anonymous ambient class",
			declaration: "@dec declare class {}",
		},
		{
			form: "named-export anonymous ambient class",
			declaration: "export @dec declare abstract class {}",
		},
	] as const)("fails closed on a decorated default fallback with $form", ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-default-malformed-secret.ts";
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\nimport ${JSON.stringify(secret)};\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed when a decorated declare class remains malformed after normalization", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-malformed-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare class Model {\nimport ${JSON.stringify(secret)};\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("keeps the absolute-import boundary active after a decorator", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec class Model {}\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:30 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("fails closed when source syntax cannot be inspected for module policy", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`const unsupported = #{};\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("fails closed when parser exhaustion prevents source inspection", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/parser-exhaustion-secret.ts";
		const nested = `${"[".repeat(500)}0${"]".repeat(500)}`;
		writeFrame(root, "home", `const nested = ${nested};\nimport ${JSON.stringify(secret)};\nvoid nested;\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed when policy traversal cannot inspect a successfully parsed source", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/traversal-exhaustion-secret.ts";
		const memberChain = `value${".x".repeat(20_000)}`;
		writeFrame(
			root,
			"home",
			`${memberChain};\nimport ${JSON.stringify(secret)};\nexport default function Home() { return null; }\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("blocks an absolute JSX import source without leaking its target", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/spool-secret-jsx";
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${secret} */\nexport default function Home() { return <main>ok</main>; }\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("fails closed on a deferred absolute import without loading or leaking its target", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(root, "home", `import defer * as deferred from ${JSON.stringify(trusted)};\ndeferred.notReal();\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed on a deferred relative import without following its escaped source", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "trusted.js"));
		writeFrame(root, "home", 'import defer * as deferred from "../../shared/trusted.js";\ndeferred.notReal();\n');

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
		expect(result.join("\n")).not.toContain(root);
	});

	it.each([
		{
			name: "quoted",
			source: 'import value from "../../shared/\\0secret";\nvoid value;\n',
		},
		{
			name: "template",
			source: "void import(`../../shared/\\0secret`);\n",
		},
	])("reports a sanitized module diagnostic for a $name NUL specifier", ({ source }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", source);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Cannot find module");
		expect(result[0]).toContain("../../shared/\\u0000secret");
		expect(result[0]).not.toContain("\0");
		expect(result[0]).not.toContain(root);
		expect(result[0]?.split("\n")).toHaveLength(1);
	});

	it.each([
		{
			name: "import",
			source: (segment: string) => `import value from ${JSON.stringify(`../../shared/${segment}`)};\nvoid value;\n`,
		},
		{
			name: "triple-slash path",
			source: (segment: string) => `/// <reference path=${JSON.stringify(`../../shared/${segment}.d.ts`)} />\n`,
		},
		{
			name: "JavaScript import",
			source: (segment: string) =>
				`import value from ${JSON.stringify(`../../shared/${segment}.js`)};\nvoid value;\n`,
		},
		{
			name: "CSS import",
			source: (segment: string) => `import ${JSON.stringify(`../../shared/${segment}.css`)};\n`,
		},
	])("reports a stable diagnostic for an overlong authored $name", ({ source }) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
		const segment = "a".repeat(300);
		writeFrame(root, "home", source(segment));

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:1:");
		expect(result[0]).toContain("TS2307: Filesystem read failed (ENAMETOOLONG)");
		expect(result[0]).not.toContain(root);
		expect(result[0]).not.toContain(segment);
		expect(result[0]?.split("\n")).toHaveLength(1);
	});

	it("blocks an absolute triple-slash path before it can add trusted globals", () => {
		const root = makeTempDir();
		markProject(root);
		const requireFromTest = createRequire(import.meta.url);
		const requireFromTypeScript = createRequire(requireFromTest.resolve("typescript/package.json"));
		const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
		const platformRoot = dirname(requireFromTypeScript.resolve(`${platformPackage}/package.json`));
		const trustedLib = join(platformRoot, "lib", "lib.esnext.disposable.d.ts");
		writeFrame(
			root,
			"home",
			`/// <reference path=${JSON.stringify(trustedLib)} />\ndeclare const resource: Disposable;\nvoid resource;\n`,
		);

		const result = messages(root);

		expect(result).toHaveLength(2);
		expect(result).toContain("design/frames/home/frame.tsx:1:21 TS2307: Reference paths outside design/");
		expect(result.join("\n")).toContain("TS2304: Cannot find name 'Disposable'.");
		expect(result.join("\n")).not.toContain(trustedLib);
	});

	it("blocks an untrusted absolute triple-slash path without leaking its target", () => {
		const root = makeTempDir();
		markProject(root);
		const outside = join(root, "outside-secret.d.ts");
		writeFileSync(outside, "interface EscapedGlobal { escaped: true }\n");
		writeFrame(
			root,
			"home",
			`/// <reference path=${JSON.stringify(outside)} />\ndeclare const value: EscapedGlobal;\nvoid value;\n`,
		);

		const result = messages(root);

		expect(result).toHaveLength(2);
		expect(result).toContain("design/frames/home/frame.tsx:1:21 TS2307: Reference paths outside design/");
		expect(result.join("\n")).toContain("TS2304: Cannot find name 'EscapedGlobal'.");
		expect(result.join("\n")).not.toContain(outside);
		expect(result.join("\n")).not.toContain("outside-secret");
	});

	it.each(["types", "lib"] as const)(
		"blocks an absolute triple-slash %s directive without leaking its target",
		(kind) => {
			const root = makeTempDir();
			markProject(root);
			const secret = `/private/spool-secret-${kind}`;
			writeFrame(root, "home", `/// <reference ${kind}=${JSON.stringify(secret)} />\n`);

			const result = messages(root);

			expect(result).toEqual([
				`design/frames/home/frame.tsx:1:${kind === "types" ? 22 : 20} TS2307: Reference ${kind} outside design/`,
			]);
			expect(result.join("\n")).not.toContain(secret);
		},
	);

	it.each(["types", "lib"] as const)(
		"reports a source-local diagnostic for an overlong triple-slash %s directive",
		(kind) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
			const segment = "a".repeat(300);
			writeFrame(root, "home", `/// <reference ${kind}=${JSON.stringify(`../../shared/${segment}`)} />\n`);

			const result = messages(root);

			expect(result).toEqual([
				`design/frames/home/frame.tsx:1:${kind === "types" ? 22 : 20} TS2307: Filesystem read failed (ENAMETOOLONG)`,
			]);
			expect(result.join("\n")).not.toContain(root);
			expect(result.join("\n")).not.toContain(segment);
		},
	);

	it("leaves an inactive triple-slash comment after source code inert", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'const value = 1;\n/// <reference path="/private/inactive-secret.d.ts" />\nvoid value;\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("preflights dependencies reached through a confined triple-slash path", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-reference-secret.ts";
		writeDesignFile(root, "shared/referenced.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/referenced.d.ts" />\nexport default function Home() { return null; }\n',
		);

		const result = messages(root);

		expect(result).toEqual(["design/shared/referenced.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights dependencies reached through a backslash-spelled triple-slash path", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-reference-secret.ts";
		const reference = "..\\..\\shared\\referenced.d.ts";
		writeDesignFile(root, "shared/referenced.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `/// <reference path="${reference}" />\n`);

		const result = messages(root);

		expect(result).toEqual(["design/shared/referenced.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights a declaration file reached through a confined triple-slash types directive", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-types-secret.ts";
		writeDesignFile(root, "shared/pkg.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", '/// <reference types="../../shared/pkg" />\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/pkg.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights a declaration reached through a backslash-spelled triple-slash types directive", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-types-secret.ts";
		const reference = "..\\..\\shared\\pkg";
		writeDesignFile(root, "shared/pkg.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `/// <reference types="${reference}" />\n`);

		const result = messages(root);

		expect(result).toEqual(["design/shared/pkg.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights a declaration index reached through a confined triple-slash types directive", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-types-index-secret.ts";
		writeDesignFile(root, "shared/pkg/index.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", '/// <reference types="../../shared/pkg" />\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/pkg/index.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("leaves a standard triple-slash lib name to TypeScript", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'/// <reference lib="esnext.disposable" />\ndeclare const resource: Disposable;\nvoid resource;\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("blocks a confined triple-slash types candidate that escapes through a symlink", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "pkg.d.ts"));
		writeFrame(root, "home", '/// <reference types="../../shared/pkg" />\n');

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Reference types outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("preflights dependencies reached through an extensionless declaration import", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-declaration-secret.ts";
		writeDesignFile(root, "shared/types.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", 'import "../../shared/types";\n');

		const result = messages(root);

		expect(result).toEqual(["design/shared/types.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights dependencies reached through a backslash-spelled relative import", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-import-secret.ts";
		writeDesignFile(root, "shared/bridge.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `import ${JSON.stringify("..\\..\\shared\\bridge")};\n`);

		const result = messages(root);

		expect(result).toEqual(["design/shared/bridge.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("blocks a backslash-spelled relative import that escapes through a symlink", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		const specifier = "..\\..\\shared\\escaped";
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "escaped.ts"));
		writeFrame(root, "home", `import ${JSON.stringify(specifier)};\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:8 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("reports a source-local diagnostic for an overlong backslash-spelled relative import", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
		const segment = "a".repeat(300);
		const specifier = `..\\..\\shared\\${segment}`;
		writeFrame(root, "home", `import ${JSON.stringify(specifier)};\n`);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:8 TS2307: Filesystem read failed (ENAMETOOLONG)"]);
		expect(result.join("\n")).not.toContain(root);
		expect(result.join("\n")).not.toContain(segment);
	});

	it("checks a reachable design-local declaration file strictly exactly once", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/broken.d.ts", "export type Broken = MissingType;\n");
		writeDesignFile(root, "shared/bridge.ts", 'export type { Broken } from "./broken";\n');
		writeFrame(
			root,
			"home",
			'import type { Broken } from "../../shared/bridge";\ndeclare const value: Broken;\nvoid value;\n',
		);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/shared/broken.d.ts:1:");
		expect(result[0]).toContain("TS2304: Cannot find name 'MissingType'.");
	});

	it.each([
		["Windows drive", "C:\\Users\\liam\\secret.ts"],
		["Windows slash", "C:/Users/liam/secret.ts"],
		["UNC", "\\\\server\\share\\secret.ts"],
		["file URL", "file:///private/spool-secret.ts"],
	] as const)("rejects a %s absolute local specifier without echoing it", (_, specifier) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `import value from ${JSON.stringify(specifier)};\nvoid value;\n`);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result[0]).not.toContain(specifier);
		expect(result[0]).not.toContain("secret");
	});

	it("rejects an absolute import into a checker-trusted declaration root", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(root, "home", `import * as runtime from ${JSON.stringify(trusted)};\nruntime.notReal();\n`);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result[0]).not.toContain(trusted);
	});

	it("keeps mapped HTTP imports permissive", () => {
		const root = makeTempDir();
		markProject(root);
		const url = "https://cdn.example.test/library.js";
		writeDesignFile(root, "shared/importmap.json", `${JSON.stringify({ imports: { [url]: url } })}\n`);
		writeFrame(root, "home", `import * as library from ${JSON.stringify(url)};\nlibrary.feature();\n`);

		expect(messages(root)).toEqual([]);
	});

	it("treats a prefix-mapped JSX import source as a permissive external", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			"/** @jsxImportSource mapped */\nexport default function Home() { return <mapped-widget runtimeOnly />; }\n",
		);

		expect(messages(root)).toEqual([]);
	});

	it("only applies the last active leading JSX import source pragma", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/superseded-jsx-runtime-secret.ts";
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${secret} */\n/** @jsxImportSource mapped */\nexport default function Home() { return <mapped-widget runtimeOnly />; }\n`,
		);

		expect(messages(root)).toEqual([]);
	});

	it("checks the local JSX development runtime used by the live compiler", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/custom/jsx-dev-runtime.ts",
			'export function jsxDEV(): unknown { return undefined; }\nexport const Fragment = undefined;\nexport namespace JSX { export interface IntrinsicElements { "dev-only": { selected: string } } }\n',
		);
		writeFrame(
			root,
			"home",
			'/** @jsxImportSource ../../shared/custom */\nexport default function Home() { return <dev-only selected="yes" />; }\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("does not accept a production-only JSX runtime that the live compiler cannot load", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/custom/jsx-runtime.ts",
			"export function jsx(): unknown { return undefined; }\nexport const jsxs = jsx;\nexport namespace JSX { export interface IntrinsicElements { main: unknown } }\n",
		);
		writeFrame(
			root,
			"home",
			"/** @jsxImportSource ../../shared/custom */\nexport default function Home() { return <main />; }\n",
		);

		const result = messages(root);

		expect(result).not.toEqual([]);
		expect(result.join("\n")).toContain("jsx-dev-runtime");
	});

	it.each(["ts", "tsx"] as const)("preflights a confined JSX development runtime implemented in %s", (extension) => {
		const root = makeTempDir();
		markProject(root);
		const secret = `/private/transitive-jsx-dev-runtime-${extension}-secret.ts`;
		writeDesignFile(
			root,
			`shared/custom/jsx-dev-runtime.${extension}`,
			`import ${JSON.stringify(secret)};\nexport function jsxDEV(): unknown { return undefined; }\nexport namespace JSX { export interface IntrinsicElements { [element: string]: unknown } }\n`,
		);
		writeFrame(
			root,
			"home",
			"/** @jsxImportSource ../../shared/custom */\nexport default function Home() { return <section>custom</section>; }\n",
		);

		const result = messages(root);

		expect(result).toEqual([
			`design/shared/custom/jsx-dev-runtime.${extension}:1:8 TS2307: Absolute local imports are outside design/`,
		]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("pins the runtime-selected TSX JSX development runtime when its adjacent TS runtime is explicitly reachable", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/custom/jsx-dev-runtime.tsx",
			'export function jsxDEV(): unknown { return undefined; }\nexport namespace JSX { export interface IntrinsicElements { "runtime-only": { selected: string } } }\n',
		);
		writeDesignFile(
			root,
			"shared/custom/jsx-dev-runtime.ts",
			'export function jsxDEV(): unknown { return undefined; }\nexport const explicitRuntime = "explicit TS";\nexport namespace JSX { export interface IntrinsicElements { main: unknown } }\n',
		);
		writeFrame(
			root,
			"home",
			'/** @jsxImportSource ../../shared/custom */\nimport { explicitRuntime } from "../../shared/custom/jsx-dev-runtime.ts";\nexport default function Home() { return <runtime-only selected={explicitRuntime} />; }\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("preflights a JSX development runtime reached through a backslash-spelled JSX import source", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-jsx-dev-runtime-secret.ts";
		const importSource = "..\\..\\shared\\custom";
		writeDesignFile(
			root,
			"shared/custom/jsx-dev-runtime.ts",
			`import ${JSON.stringify(secret)};\nexport function jsxDEV(): unknown { return undefined; }\nexport namespace JSX { export interface IntrinsicElements { [element: string]: unknown } }\n`,
		);
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${importSource} */\nexport default function Home() { return <section>custom</section>; }\n`,
		);

		const result = messages(root);

		expect(result).toEqual([
			"design/shared/custom/jsx-dev-runtime.ts:1:8 TS2307: Absolute local imports are outside design/",
		]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("blocks a confined JSX development runtime that escapes through a symlink", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared", "custom"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "custom", "jsx-dev-runtime.ts"));
		writeFrame(
			root,
			"home",
			"/** @jsxImportSource ../../shared/custom */\nexport default function Home() { return <section>custom</section>; }\n",
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("reports a source-local diagnostic for an overlong confined JSX import source", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
		const segment = "a".repeat(300);
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ../../shared/${segment} */\nexport default function Home() { return <section>custom</section>; }\n`,
		);

		const result = messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Filesystem read failed (ENAMETOOLONG)"]);
		expect(result.join("\n")).not.toContain(root);
		expect(result.join("\n")).not.toContain(segment);
	});

	it("blocks an absolute JSX import source without leaking it", () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${trusted} */\nexport default function Home() { return <section>blocked</section>; }\n`,
		);

		const result = messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:1:");
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("jsx-dev-runtime");
	});

	it("sorts diagnostics by code units independently of locale", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "z", "missingZ;\n");
		writeFrame(root, "ä", "missingA;\n");

		expect(messages(root).map((message) => message.split(":")[0])).toEqual([
			"design/frames/z/frame.tsx",
			"design/frames/ä/frame.tsx",
		]);
	});

	it.each([
		["LF", "\n"],
		["CRLF", "\r\n"],
		["CR", "\r"],
		["Unicode line separator", "\u2028"],
		["Unicode paragraph separator", "\u2029"],
	])("reports exact positions after a $name line break", (_, lineBreak) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `const before = 1;${lineBreak}missingName;\n`);

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:2:1 TS2304: Cannot find name 'missingName'."]);
	});

	it("counts diagnostic columns in UTF-16 code units", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'const value = "😀"; missingName;\n');

		expect(messages(root)).toEqual(["design/frames/home/frame.tsx:1:21 TS2304: Cannot find name 'missingName'."]);
	});

	it("preserves distinct diagnostic identities when paths contain whitespace controls", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "bad name", "missing;\n");
		writeFrame(root, "bad\nname", "missing;\n");

		const result = messages(root);

		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				expect.stringContaining("design/frames/bad\\u000aname/frame.tsx"),
				expect.stringContaining("design/frames/bad name/frame.tsx"),
			]),
		);
		expect(result.every((message) => !message.includes("\n"))).toBe(true);
	});

	it("escapes terminal controls and Unicode line separators visibly", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "bad\u007f\u0085\u2028\u2029name", "missing;\n");

		const [message] = messages(root);

		expect(message).toContain("bad\\u007f\\u0085\\u2028\\u2029name");
		for (const character of ["\u007f", "\u0085", "\u2028", "\u2029"]) {
			expect(message).not.toContain(character);
		}
	});

	it("preserves ordinary backslashes in displayed diagnostics", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import value from "pkg\\\\name";\nvoid value;\n');

		const [message] = messages(root);

		expect(message).toContain("Cannot find module 'pkg\\name'");
		expect(message).not.toContain("Cannot find module 'pkg\\\\name'");
	});

	it("flattens diagnostic chains and sanitizes display paths", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"bad\n\u001bname",
			"function choose(value: string): string;\nfunction choose(value: number): number;\nfunction choose(value: string | number) { return value; }\nchoose(true);\n",
		);

		const [message] = messages(root);

		expect(message).toContain("TS2769: No overload matches this call.");
		expect(message).toContain("The last overload gave the following error.");
		expect(message).toContain("Argument of type 'boolean' is not assignable");
		expect(message).not.toContain("\n");
		expect(message).not.toContain("\u001b");
		expect(message).not.toContain(root);
	});

	it("sanitizes control characters decoded from module specifiers", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import missing from "missing\\n\\x1bmodule";\nvoid missing;\n');

		const [message] = messages(root);

		expect(message).toContain("TS2307");
		expect(message).not.toContain("\n");
		expect(message).not.toContain("\u001b");
		expect(message).toContain("\\u001b");
	});
});
