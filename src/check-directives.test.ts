import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design declaration boundaries", () => {
	it("blocks an absolute triple-slash path before it can add trusted globals", async () => {
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

		const result = await messages(root);

		expect(result).toHaveLength(2);
		expect(result).toContain("design/frames/home/frame.tsx:1:21 TS2307: Reference paths outside design/");
		expect(result.join("\n")).toContain("TS2304: Cannot find name 'Disposable'.");
		expect(result.join("\n")).not.toContain(trustedLib);
	});

	it("blocks an untrusted absolute triple-slash path without leaking its target", async () => {
		const root = makeTempDir();
		markProject(root);
		const outside = join(root, "outside-secret.d.ts");
		writeFileSync(outside, "interface EscapedGlobal { escaped: true }\n");
		writeFrame(
			root,
			"home",
			`/// <reference path=${JSON.stringify(outside)} />\ndeclare const value: EscapedGlobal;\nvoid value;\n`,
		);

		const result = await messages(root);

		expect(result).toHaveLength(2);
		expect(result).toContain("design/frames/home/frame.tsx:1:21 TS2307: Reference paths outside design/");
		expect(result.join("\n")).toContain("TS2304: Cannot find name 'EscapedGlobal'.");
		expect(result.join("\n")).not.toContain(outside);
		expect(result.join("\n")).not.toContain("outside-secret");
	});

	it.each(["types", "lib"] as const)(
		"blocks an absolute triple-slash %s directive without leaking its target",
		async (kind) => {
			const root = makeTempDir();
			markProject(root);
			const secret = `/private/spool-secret-${kind}`;
			writeFrame(root, "home", `/// <reference ${kind}=${JSON.stringify(secret)} />\n`);

			const result = await messages(root);

			expect(result).toEqual([
				`design/frames/home/frame.tsx:1:${kind === "types" ? 22 : 20} TS2307: Reference ${kind} outside design/`,
			]);
			expect(result.join("\n")).not.toContain(secret);
		},
	);

	it.each(["types", "lib"] as const)(
		"reports a source-local diagnostic for an overlong triple-slash %s directive",
		async (kind) => {
			const root = makeTempDir();
			markProject(root);
			writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
			const segment = "a".repeat(300);
			writeFrame(root, "home", `/// <reference ${kind}=${JSON.stringify(`../../shared/${segment}`)} />\n`);

			const result = await messages(root);

			expect(result).toEqual([
				`design/frames/home/frame.tsx:1:${kind === "types" ? 22 : 20} TS2307: Filesystem read failed (ENAMETOOLONG)`,
			]);
			expect(result.join("\n")).not.toContain(root);
			expect(result.join("\n")).not.toContain(segment);
		},
	);

	it("leaves an inactive triple-slash comment after source code inert", async () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'const value = 1;\n/// <reference path="/private/inactive-secret.d.ts" />\nvoid value;\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("preflights dependencies reached through a confined triple-slash path", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-reference-secret.ts";
		writeDesignFile(root, "shared/referenced.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(
			root,
			"home",
			'/// <reference path="../../shared/referenced.d.ts" />\nexport default function Home() { return null; }\n',
		);

		const result = await messages(root);

		expect(result).toEqual(["design/shared/referenced.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights dependencies reached through a backslash-spelled triple-slash path", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-reference-secret.ts";
		const reference = "..\\..\\shared\\referenced.d.ts";
		writeDesignFile(root, "shared/referenced.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `/// <reference path="${reference}" />\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/shared/referenced.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights a declaration file reached through a confined triple-slash types directive", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-types-secret.ts";
		writeDesignFile(root, "shared/pkg.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", '/// <reference types="../../shared/pkg" />\n');

		const result = await messages(root);

		expect(result).toEqual(["design/shared/pkg.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights a declaration reached through a backslash-spelled triple-slash types directive", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-types-secret.ts";
		const reference = "..\\..\\shared\\pkg";
		writeDesignFile(root, "shared/pkg.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `/// <reference types="${reference}" />\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/shared/pkg.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights a declaration index reached through a confined triple-slash types directive", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-types-index-secret.ts";
		writeDesignFile(root, "shared/pkg/index.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", '/// <reference types="../../shared/pkg" />\n');

		const result = await messages(root);

		expect(result).toEqual(["design/shared/pkg/index.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("leaves a standard triple-slash lib name to TypeScript", async () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'/// <reference lib="esnext.disposable" />\ndeclare const resource: Disposable;\nvoid resource;\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("blocks a confined triple-slash types candidate that escapes through a symlink", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "pkg.d.ts"));
		writeFrame(root, "home", '/// <reference types="../../shared/pkg" />\n');

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Reference types outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("preflights dependencies reached through an extensionless declaration import", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-declaration-secret.ts";
		writeDesignFile(root, "shared/types.d.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", 'import "../../shared/types";\n');

		const result = await messages(root);

		expect(result).toEqual(["design/shared/types.d.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("preflights dependencies reached through a backslash-spelled relative import", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/transitive-backslash-import-secret.ts";
		writeDesignFile(root, "shared/bridge.ts", `import ${JSON.stringify(secret)};\n`);
		writeFrame(root, "home", `import ${JSON.stringify("..\\..\\shared\\bridge")};\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/shared/bridge.ts:1:8 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("blocks a backslash-spelled relative import that escapes through a symlink", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		const specifier = "..\\..\\shared\\escaped";
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "escaped.ts"));
		writeFrame(root, "home", `import ${JSON.stringify(specifier)};\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:8 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("reports a source-local diagnostic for an overlong backslash-spelled relative import", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
		const segment = "a".repeat(300);
		const specifier = `..\\..\\shared\\${segment}`;
		writeFrame(root, "home", `import ${JSON.stringify(specifier)};\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:8 TS2307: Filesystem read failed (ENAMETOOLONG)"]);
		expect(result.join("\n")).not.toContain(root);
		expect(result.join("\n")).not.toContain(segment);
	});

	it("checks a reachable design-local declaration file strictly exactly once", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/broken.d.ts", "export type Broken = MissingType;\n");
		writeDesignFile(root, "shared/bridge.ts", 'export type { Broken } from "./broken";\n');
		writeFrame(
			root,
			"home",
			'import type { Broken } from "../../shared/bridge";\ndeclare const value: Broken;\nvoid value;\n',
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/shared/broken.d.ts:1:");
		expect(result[0]).toContain("TS2304: Cannot find name 'MissingType'.");
	});

	it.each([
		["Windows drive", "C:\\Users\\liam\\secret.ts"],
		["Windows slash", "C:/Users/liam/secret.ts"],
		["UNC", "\\\\server\\share\\secret.ts"],
		["file URL", "file:///private/spool-secret.ts"],
	] as const)("rejects a %s absolute local specifier without echoing it", async (_, specifier) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `import value from ${JSON.stringify(specifier)};\nvoid value;\n`);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result[0]).not.toContain(specifier);
		expect(result[0]).not.toContain("secret");
	});

	it("rejects an absolute import into a checker-trusted declaration root", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(root, "home", `import * as runtime from ${JSON.stringify(trusted)};\nruntime.notReal();\n`);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result[0]).not.toContain(trusted);
	});

	it("keeps mapped HTTP imports permissive", async () => {
		const root = makeTempDir();
		markProject(root);
		const url = "https://cdn.example.test/library.js";
		writeDesignFile(root, "shared/importmap.json", `${JSON.stringify({ imports: { [url]: url } })}\n`);
		writeFrame(root, "home", `import * as library from ${JSON.stringify(url)};\nlibrary.feature();\n`);

		expect(await messages(root)).toEqual([]);
	});
});
