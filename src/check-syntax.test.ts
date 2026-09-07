import { mkdirSync, symlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

describe("design source inspection", () => {
	it("discovers modules from syntax while leaving comments and strings inert", async () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'// import "../../outside"\nconst text = \'export * from "../../outside"\';\nexport default function Home() { return <p>{text}</p>; }\n',
		);

		expect(await messages(root)).toEqual([]);
	});

	it("replaces absolute local module errors with a stable boundary diagnostic", async () => {
		const root = makeTempDir();
		markProject(root);
		const absolute = "/private/spool-secret/missing.ts";
		writeFrame(root, "home", `import value from ${JSON.stringify(absolute)};\nvoid value;\n`);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result[0]).not.toContain(absolute);
		expect(result[0]).not.toContain("spool-secret");
	});

	it("blocks a relative import from entering a checker-trusted declaration root", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		const frame = join(root, "design", "frames", "home", "frame.tsx");
		const specifier = relative(dirname(frame), trusted);
		writeFrame(root, "home", `import * as runtime from ${JSON.stringify(specifier)};\nruntime.notReal();\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:26 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it("diagnoses an extensionless source alias that resolves into a trusted root", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "trusted.ts"));
		writeFrame(root, "home", 'import * as runtime from "../../shared/trusted";\nruntime.notReal();\n');

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:26 TS2307: Relative imports outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it("blocks an absolute TypeScript import assignment without leaking its target", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/spool-import-assignment-secret.ts";
		writeFrame(root, "home", `import secret = require(${JSON.stringify(secret)});\nvoid secret;\n`);

		const result = await messages(root);

		expect(result).toEqual([
			expect.stringContaining("design/frames/home/frame.tsx:1:1 TS1202: Import assignment cannot be used"),
			"design/frames/home/frame.tsx:1:25 TS2307: Absolute local imports are outside design/",
		]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain("spool-import-assignment-secret");
	});

	it("blocks an absolute exported TypeScript import assignment at its Babel 7 source literal", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/spool-exported-import-assignment-secret.ts";
		writeFrame(root, "home", `export import secret = require(${JSON.stringify(secret)});\nvoid secret;\n`);

		const result = await messages(root);

		expect(result).toContain("design/frames/home/frame.tsx:1:32 TS2307: Absolute local imports are outside design/");
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain("spool-exported-import-assignment-secret");
	});

	it("classifies cooked static template imports while leaving expression templates dynamic", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped/": "https://example.test/mapped/" } }\n');
		writeFrame(
			root,
			"home",
			`async function load() {\n\t(await import(\`mapped\\x2fpkg\`)).anything();\n\t(await import(\`unmapped-template\`)).anything();\n\tconst segment = "secret";\n\t(await import(\`/private/\${segment}\`)).anything();\n}\nvoid load;\n`,
		);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:3:16");
		expect(result[0]).toContain("TS2307: Cannot find module 'unmapped-template'");
		expect(result.join("\n")).not.toContain("mapped/pkg");
		expect(result.join("\n")).not.toContain("/private/");
	});

	it("blocks a static template import into a trusted root without loading or leaking it", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(root, "home", `async function load() { (await import(\`${trusted}\`)).notReal(); }\nvoid load;\n`);

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("TS2307: Absolute local imports are outside design/");
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
	});

	it("fails closed on a deferred import that the live ES2022 build rejects", async () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(root, "home", 'import defer * as deferred from "mapped";\ndeferred.runtimeOnly();\n');

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely",
		]);
	});

	it.each([
		["decorator", "function dec(value: Function) {}\n@dec class Model {}\n"],
		["exported decorator", "function dec(value: Function) {}\n@dec export class Model {}\n"],
		["auto-accessor", "class Model { accessor value = 1; }\n"],
	])("keeps module policy active around a TypeScript %s", async (_name, syntax) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
		writeFrame(root, "home", `${syntax}import mapped from "mapped";\nmapped.runtimeOnly();\nvoid Model;\n`);

		expect(await messages(root)).toEqual([]);
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
	] as const)("accepts the TypeScript decorated declare class $form form", async ({ declaration, isDefault }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n${declaration}\n${
				isDefault ? "" : "export default function Home() { return null; }\n"
			}`,
		);

		expect(await messages(root)).toEqual([]);
	});

	it.each([
		{ shape: "named", declaration: "export default @dec abstract class Model {}" },
		{ shape: "anonymous", declaration: "export default @dec abstract class {}" },
	] as const)("accepts a decorated runtime default abstract $shape class", async ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\n`);

		expect(await messages(root)).toEqual([]);
	});

	it.each([
		{ modifier: "concrete", declaration: "export default @dec declare class {}" },
		{ modifier: "abstract", declaration: "export default @dec declare abstract class {}" },
	] as const)("accepts a decorated ambient anonymous default $modifier class", async ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\n`);

		expect(await messages(root)).toEqual([]);
	});

	it("preserves strict TypeScript diagnostics when an ambient default precedes a runtime default", async () => {
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

		expect(await messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:44 TS2323: Cannot redeclare exported variable 'default'.",
			"design/frames/home/frame.tsx:3:25 TS2323: Cannot redeclare exported variable 'default'.",
		]);
	});

	it("accepts every ECMAScript same-line whitespace between decorated ambient class modifiers", async () => {
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

		expect(await messages(root)).toEqual([]);
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
	] as const)("accepts a decorated declare abstract class with $placement placement", async ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n${declaration}\nexport default function Home() { return null; }\n`,
		);

		expect(await messages(root)).toEqual([]);
	});

	it("accepts multiple decorated declare classes with an inline comment gap", async () => {
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

		expect(await messages(root)).toEqual([]);
	});

	it("fails closed when the decorated declare repair budget is exhausted", async () => {
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

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("does not let a decorated ambient class shadow a static require", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-require-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare class require {}\nrequire(${JSON.stringify(secret)});\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:9 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("does not let an exported decorated ambient abstract class shadow a static require", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-abstract-require-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\nexport default @dec declare abstract class require {}\nrequire(${JSON.stringify(secret)});\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:9 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("preserves import offsets after an astral decorated ambient default class", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`const label = "🧵";\nfunction dec(value: Function) {}\nexport default @dec declare abstract class Model {}\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\nvoid label;\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:4:30 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain(root);
	});

	it("preserves import offsets after inspecting a decorated declare class", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare class Model {}\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:30 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed when a decorated declare class is split after declare", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-newline-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare\nclass Model {}\nimport ${JSON.stringify(secret)};\n`,
		);

		const result = await messages(root);

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
	] as const)("fails closed on a decorated declare abstract class with $form", async ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-abstract-malformed-secret.ts";
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\nimport ${JSON.stringify(secret)};\n`);

		const result = await messages(root);

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
	] as const)("fails closed on a decorated default fallback with $form", async ({ declaration }) => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-default-malformed-secret.ts";
		writeFrame(root, "home", `function dec(value: Function) {}\n${declaration}\nimport ${JSON.stringify(secret)};\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed when a decorated declare class remains malformed after normalization", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/decorated-declare-malformed-secret.ts";
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec declare class Model {\nimport ${JSON.stringify(secret)};\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("keeps the absolute-import boundary active after a decorator", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`function dec(value: Function) {}\n@dec class Model {}\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:3:30 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("fails closed when source syntax cannot be inspected for module policy", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(
			root,
			"home",
			`const unsupported = #{};\nimport type { SpoolUi } from ${JSON.stringify(trusted)};\ndeclare const ui: SpoolUi;\nui.go("home");\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(trusted);
	});

	it("fails closed when parser exhaustion prevents source inspection", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/parser-exhaustion-secret.ts";
		const nested = `${"[".repeat(500)}0${"]".repeat(500)}`;
		writeFrame(root, "home", `const nested = ${nested};\nimport ${JSON.stringify(secret)};\nvoid nested;\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed when policy traversal cannot inspect a successfully parsed source", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/traversal-exhaustion-secret.ts";
		const memberChain = `value${".x".repeat(20_000)}`;
		writeFrame(
			root,
			"home",
			`${memberChain};\nimport ${JSON.stringify(secret)};\nexport default function Home() { return null; }\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(secret);
		expect(result.join("\n")).not.toContain(root);
	});

	it("blocks an absolute JSX import source without leaking its target", async () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/spool-secret-jsx";
		writeFrame(
			root,
			"home",
			`/** @jsxImportSource ${secret} */\nexport default function Home() { return <main>ok</main>; }\n`,
		);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:22 TS2307: Absolute local imports are outside design/"]);
		expect(result.join("\n")).not.toContain(secret);
	});

	it("fails closed on a deferred absolute import without loading or leaking its target", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		writeFrame(root, "home", `import defer * as deferred from ${JSON.stringify(trusted)};\ndeferred.notReal();\n`);

		const result = await messages(root);

		expect(result).toEqual(["design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely"]);
		expect(result.join("\n")).not.toContain(trusted);
		expect(result.join("\n")).not.toContain("notReal");
		expect(result.join("\n")).not.toContain(root);
	});

	it("fails closed on a deferred relative import without following its escaped source", async () => {
		const root = makeTempDir();
		markProject(root);
		const trusted = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
		mkdirSync(join(root, "design", "shared"), { recursive: true });
		symlinkSync(trusted, join(root, "design", "shared", "trusted.js"));
		writeFrame(root, "home", 'import defer * as deferred from "../../shared/trusted.js";\ndeferred.notReal();\n');

		const result = await messages(root);

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
	])("reports a sanitized module diagnostic for a $name NUL specifier", async ({ source }) => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", source);

		const result = await messages(root);

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
	])("reports a stable diagnostic for an overlong authored $name", async ({ source }) => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(root, "shared/keep.ts", "export const keep = true;\n");
		const segment = "a".repeat(300);
		writeFrame(root, "home", source(segment));

		const result = await messages(root);

		expect(result).toHaveLength(1);
		expect(result[0]).toContain("design/frames/home/frame.tsx:1:");
		expect(result[0]).toContain("TS2307: Filesystem read failed (ENAMETOOLONG)");
		expect(result[0]).not.toContain(root);
		expect(result[0]).not.toContain(segment);
		expect(result[0]?.split("\n")).toHaveLength(1);
	});
});
