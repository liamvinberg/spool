import { mkdirSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { checkSourceLimits } from "./check-budget";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design JavaScript bridges", () => {
	it("reports missing local CSS and JavaScript imports", async () => {
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

		const result = await messages(root);

		expect(result).toHaveLength(2);
		expect(result[0]).toContain("TS2307: Cannot find module '../../shared/missing.css'");
		expect(result[1]).toContain("TS2307: Cannot find module '../../shared/missing.js'");
	});

	it("rejects local assets that resolve outside the design boundary", async () => {
		const root = makeTempDir();
		markProject(root);
		const outside = join(root, "outside.js");
		writeFileSync(outside, "export default 1;\n");
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(outside, join(root, "design", "shared", "escaped.js"));
		writeFrame(root, "home", 'import value from "../../shared/escaped.js";\nvoid value;\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:19 TS2307: Relative imports outside design/",
		]);
	});

	it.each([
		["static require", 'const broken = require("./broken.ts");\nvoid broken;\n'],
		["static dynamic import", 'void import("./broken.ts");\n'],
	] as const)("checks TypeScript reached through a JavaScript $name", async (_name, bridge) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", bridge);
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(await messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		["query then fragment", "./nested.js?raw", "./broken.ts#preview"],
		["fragment then query", "./nested.js#preview", "./broken.ts?raw"],
	] as const)(
		"checks TypeScript through JavaScript bridges carrying a $name",
		async (_name, nestedSpecifier, brokenSpecifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/bridge.js", `import ${JSON.stringify(nestedSpecifier)};\n`);
			writeDesignFile(root, "shared/nested.js", `import ${JSON.stringify(brokenSpecifier)};\n`);
			writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
			writeFrame(root, "home", 'import "../../shared/bridge.js?entry";\n');

			expect(await messages(root)).toEqual([
				"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
			]);
		},
	);

	it("checks a TypeScript dependency once through a JavaScript cycle", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/a.js", 'import "./b.js";\n');
		writeDesignFile(root, "shared/b.js", 'import "./a.js";\nimport "./broken.ts";\n');
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/a.js";\n');

		expect(await messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("checks TypeScript reached through a JSX bridge without checking JSX semantics", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/bridge.jsx",
			'import "./broken.ts";\nexport default <runtime-only unknownProperty />;\n',
		);
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.jsx";\n');

		expect(await messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("enforces the design boundary on an absolute import inside JavaScript", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/javascript-bridge-secret.ts";
		writeDesignFile(root, "shared/bridge.js", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		const result = await messages(root);

		expect(result).toEqual(["design/shared/bridge.js:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("blocks a JavaScript bridge dependency that escapes through a symlink", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "escaped.ts"));
		writeDesignFile(root, "shared/bridge.js", 'import "./escaped.ts";\n');
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		const result = await messages(root);

		expect(result).toEqual(["design/shared/bridge.js:1:8 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("fails closed at malformed reachable JavaScript without traversing past it", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", 'const unsupported = #{};\nimport "./broken.ts";\n');
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		const result = await messages(root);

		expect(result).toEqual([
			'design/shared/bridge.js:1:21 TS1003: Syntax this file can\'t use here (it would need "recordAndTuple").',
		]);
		expect(result.join("\n")).not.toContain("broken.ts");
		expect(result.join("\n")).not.toContain(root);
	});

	it.each([
		["declarations", "export default 1;\nexport default 2;\n", "2:1"],
		[
			"specifiers",
			"const first = 1;\nconst second = 2;\nexport { first as default };\nexport { second as default };\n",
			"4:10",
		],
		[
			"mixed declaration and specifier",
			"const second = 2;\nexport default 1;\nexport { second as default };\n",
			"3:10",
		],
	] as const)(
		"fails closed at recovered duplicate default $name before inspecting hidden imports",
		async (_name, invalid, at) => {
			const root = makeTempDir();
			markProject(root);
			const secret = "/private/recovered-javascript-secret.ts";
			writeDesignFile(root, "shared/bridge.js", `${invalid}import ${JSON.stringify(secret)};\n`);
			writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

			const result = await messages(root);

			expect(result).toEqual([`design/shared/bridge.js:${at} TS1003: Only one default export allowed per module.`]);
			expect(result.join("\n")).not.toContain(secret);
			expect(result.join("\n")).not.toContain(root);
		},
	);

	it.each([["named", "export { missing };\n"]] as const)(
		"fails closed at an undeclared JavaScript $name export before inspecting hidden imports",
		async (_name, invalid) => {
			const root = makeTempDir();
			markProject(root);
			const secret = "/private/undeclared-javascript-export-secret.ts";
			writeDesignFile(root, "shared/bridge.js", `${invalid}import ${JSON.stringify(secret)};\n`);
			writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

			const result = await messages(root);

			expect(result).toEqual(["design/shared/bridge.js:1:10 TS1003: Export 'missing' is not defined."]);
			expect(result.join("\n")).not.toContain(secret);
			expect(result.join("\n")).not.toContain(root);
		},
	);

	it.each([
		["forward named", "export { value };\nconst value = 1;\n"],
		["forward default", "export { value as default };\nconst value = 1;\n"],
	] as const)("keeps a valid $name JavaScript export inspectable", async (_name, valid) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", `${valid}import "./broken.ts";\n`);
		writeDesignFile(root, "shared/broken.ts", "export const broken: string = 1;\n");
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(await messages(root)).toEqual([
			"design/shared/broken.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("keeps a valid TypeScript type export semantically checked", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/model.ts", "type Model = { label: string };\nexport { Model };\n");
		writeFrame(
			root,
			"home",
			'import type { Model } from "../../shared/model";\nconst model: Model = {};\nvoid model;\n',
		);

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:7 TS2741: Property 'label' is missing in type '{}' but required in type 'Model'. 'label' is declared here.",
		]);
	});

	it.each([
		[
			"duplicate private name",
			"jsx",
			"class Model { #value; #value; }\nexport default <runtime-only />;\n",
			"1:23 TS1003: Duplicate private name #value.",
		],
	] as const)(
		"fails closed at a recovered $name in reachable .$extension",
		async (_name, extension, invalid, said) => {
			const root = makeTempDir();
			markProject(root);
			const secret = `/private/recovered-${extension}-secret.ts`;
			writeDesignFile(root, `shared/bridge.${extension}`, `${invalid}import ${JSON.stringify(secret)};\n`);
			writeFrame(root, "home", `import "../../shared/bridge.${extension}";\n`);

			const result = await messages(root);

			expect(result).toEqual([`design/shared/bridge.${extension}:${said}`]);
			expect(result.join("\n")).not.toContain(secret);
			expect(result.join("\n")).not.toContain(root);
		},
	);

	it("applies the offline source budget to a reachable JavaScript bridge", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/bridge.js", "export {};\n");
		truncateSync(join(root, "design", "shared", "bridge.js"), checkSourceLimits.maxFileBytes + 1);
		writeFrame(root, "home", 'import "../../shared/bridge.js";\n');

		expect(await messages(root)).toEqual([
			"design/shared/bridge.js:1:1 TS5083: Offline check resource limit exceeded",
		]);
	});

	it("ignores adjacent declarations for an existing confined JavaScript module", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.js", "throw new Error('unchecked');\n");
		writeDesignFile(root, "shared/module.d.ts", "export const known: string;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module.js";\nmodule.feature();\n');

		expect(await messages(root)).toEqual([]);
	});

	it("checks TypeScript selected through an explicit JavaScript module specifier", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/value.ts", "export const value: string = 1;\n");
		writeFrame(root, "home", 'import { value } from "../../shared/value.js";\nvoid value;\n');

		expect(await messages(root)).toEqual([
			"design/shared/value.ts:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it("checks TSX selected through an explicit JSX module specifier", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/value.tsx", "export const value: string = 1;\n");
		writeFrame(root, "home", 'import { value } from "../../shared/value.jsx";\nvoid value;\n');

		expect(await messages(root)).toEqual([
			"design/shared/value.tsx:1:14 TS2322: Type 'number' is not assignable to type 'string'.",
		]);
	});

	it.each([
		["JavaScript", "js", "ts"],
		["JSX", "jsx", "tsx"],
		["ES module JavaScript", "mjs", "mts"],
		["CommonJS", "cjs", "cts"],
	] as const)("keeps an exact confined %s asset ahead of its TypeScript substitute", async (_, asset, substitute) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/value.${asset}`, "globalThis.missingRuntimeGlobal.deep.property;\n");
		writeDesignFile(root, `shared/value.${substitute}`, "export const broken: string = 1;\n");
		writeFrame(root, "home", `import * as value from "../../shared/value.${asset}";\nvalue.runtimeOnly();\n`);

		expect(await messages(root)).toEqual([]);
	});

	it("keeps the explicit .js substitution order at .ts before .tsx", async () => {
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

		expect(await messages(root)).toEqual([]);
	});

	it("treats every supported import shape from existing confined JSX as any", async () => {
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

		expect(await messages(root)).toEqual([]);
	});

	it.each(["jsx"] as const)(
		"treats an extensionless confined .%s module as unchecked JavaScript",
		async (extension) => {
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

			expect(await messages(root)).toEqual([]);
		},
	);

	it.each(["../../shared/module", "../../shared/module?raw"] as const)(
		"keeps an extensionless live JavaScript module ahead of an adjacent declaration for %s",
		async (specifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/module.js", "export const runtimeOnly = true;\n");
			writeDesignFile(root, "shared/module.d.ts", "export type Broken = MissingType;\n");
			writeFrame(root, "home", `import * as module from ${JSON.stringify(specifier)};\nmodule.runtimeOnly;\n`);

			expect(await messages(root)).toEqual([]);
		},
	);

	it.each(["../../shared/module", "../../shared/module?raw"] as const)(
		"keeps an exact extensionless runtime file ahead of appended candidates for %s",
		async (specifier) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/module", "export const runtimeOnly = true;\n");
			writeDesignFile(root, "shared/module.ts", "export const broken: string = 1;\n");
			writeFrame(root, "home", `import * as module from ${JSON.stringify(specifier)};\nmodule.runtimeOnly;\n`);

			expect(await messages(root)).toEqual([]);
		},
	);

	it.each([
		["extensionless", "module"],
		["JavaScript", "module.js"],
		["JSX", "module.jsx"],
	] as const)("rejects TypeScript syntax in an exact %s file like its live loader", async (_name, source) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/${source}`, 'export const value: string = "runtime";\n');
		writeDesignFile(root, "shared/module.ts", 'export const value = "lower";\n');
		writeFrame(root, "home", `import "../../shared/${source}?raw";\n`);

		expect(await messages(root)).toEqual([`design/shared/${source}:1:19 TS1003: Unexpected token`]);
	});

	it.each([
		["extensionless", "module"],
		["JavaScript", "module.js"],
	] as const)("rejects JSX syntax in an exact %s file like its live loader", async (_name, source) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, `shared/${source}`, "export default <runtime-only />;\n");
		writeFrame(root, "home", `import "../../shared/${source}#preview";\n`);

		expect(await messages(root)).toEqual([
			`design/shared/${source}:1:16 TS1003: Syntax this file can't use here (it would need "jsx", "flow", "typescript").`,
		]);
	});

	it("accepts JSX syntax in an exact .jsx file like the live loader", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module.jsx", "export default <runtime-only />;\n");
		writeFrame(root, "home", 'import "../../shared/module.jsx";\n');

		expect(await messages(root)).toEqual([]);
	});

	it("blocks an exact extensionless candidate that escapes through a symlink", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "module"));
		writeDesignFile(root, "shared/module.ts", "export const lower = true;\n");
		writeFrame(root, "home", 'import * as module from "../../shared/module?raw";\nmodule.runtimeOnly;\n');

		const result = await messages(root);

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

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:25 TS2307: Filesystem read refused (non-regular file)",
		]);
	});

	it("applies the offline source budget to an exact extensionless candidate", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/module", "export {};\n");
		truncateSync(join(root, "design", "shared", "module"), checkSourceLimits.maxFileBytes + 1);
		writeFrame(root, "home", 'import "../../shared/module";\n');

		expect(await messages(root)).toEqual(["design/shared/module:1:1 TS5083: Offline check resource limit exceeded"]);
	});
});
