import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design JSX runtimes", () => {
	it("treats a prefix-mapped JSX import source as a permissive external", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			"/** @jsxImportSource mapped */\nexport default function Home() { return <mapped-widget runtimeOnly />; }\n",
		);

		expect(await messages(root)).toEqual([]);
	});

	it("only applies the last active leading JSX import source pragma", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/superseded-jsx-runtime-secret.ts";
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${secret} */\n/** @jsxImportSource mapped */\nexport default function Home() { return <mapped-widget runtimeOnly />; }\n`,
		);

		expect(await messages(root)).toEqual([]);
	});

	it("checks the local JSX development runtime used by the live compiler", async () => {
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

		expect(await messages(root)).toEqual([]);
	});

	it("does not accept a production-only JSX runtime that the live compiler cannot load", async () => {
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

		const result = await messages(root);

		expect(result).not.toEqual([]);
		expect(result.join("\n")).toContain("jsx-dev-runtime");
	});

	it.each(["ts", "tsx"] as const)(
		"preflights a confined JSX development runtime implemented in %s",
		async (extension) => {
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

			const result = await messages(root);

			expect(result).toEqual([
				`design/shared/custom/jsx-dev-runtime.${extension}:1:8 TS2307: Absolute local imports are outside design/`,
			]);
			expect(result.join("\n")).not.toContain(secret);
		},
	);

	it("pins the runtime-selected TSX JSX development runtime when its adjacent TS runtime is explicitly reachable", async () => {
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

		expect(await messages(root)).toEqual([]);
	});

	it("preflights a JSX development runtime reached through a backslash-spelled JSX import source", async () => {
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

		const result = await messages(root);

		expect(result).toEqual([
			"design/shared/custom/jsx-dev-runtime.ts:1:8 TS2307: Absolute local imports are outside design/",
		]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("blocks a confined JSX development runtime that escapes through a symlink", async () => {
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

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("reports a source-local diagnostic for an overlong confined JSX import source", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
		const segment = "a".repeat(300);
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ../../shared/${segment} */\nexport default function Home() { return <section>custom</section>; }\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Filesystem read failed (ENAMETOOLONG)"]);
		expect(result.join("\n")).not.toContain(root);
		expect(result.join("\n")).not.toContain(segment);
	});

	it("blocks an absolute JSX import source without leaking it", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${trusted} */\nexport default function Home() { return <section>blocked</section>; }\n`,
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:1:");
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("jsx-dev-runtime");
	});
});
