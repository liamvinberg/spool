import { mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSourceLimits } from "./check-budget";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design module resolution", () => {
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
});
