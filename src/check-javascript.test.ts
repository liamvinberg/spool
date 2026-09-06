import { mkdirSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { checkSourceLimits } from "./check-budget";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design JavaScript bridges", () => {
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
});
