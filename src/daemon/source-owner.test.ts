import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { expect, it } from "vitest";
import type { RetainedValues, SourceOccurrence, SourceRead } from "../source-edit";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { buildDesignEntry, createFrameCompiler } from "./compile";
import { emptyCompilation, lowerLiterals, readInput } from "./retained-compile";
import { createSourceOwner } from "./source-owner";

const SOURCE = 'export default function Frame(){ return <main><h1>{"Hello"}</h1><input defaultValue="keep" /></main> }';
async function fixture(configure?: (root: string) => void) {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "home", SOURCE);
	configure?.(root);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const packet: RetainedValues | undefined = id ? compiler.publication(id)?.compilation.packet : undefined;
	if (!packet) throw new Error("no immutable initial publication");
	const cell = Object.keys(packet.values)[0];
	if (!cell) throw new Error("no admitted literal");
	const original: SourceOccurrence = {
		publication: packet.id,
		cell,
		occurrence: "committed-node",
		invocation: "committed-call",
		value: "Hello",
		context: "original-context",
	};
	const observation = { current: original };
	const owner = createSourceOwner(compiler, async () => observation.current);
	const asked = await owner.read(root, "home", original, 1, "canvas");
	if (!asked.ok) throw new Error(asked.reason);
	const file = join(root, "design/frames/home/frame.tsx");
	const commit = (read: SourceRead, text: string, occurrence = read.original) =>
		owner.commit(root, read.handle, read.generation, occurrence, [{ kind: "set-text", source: read.source, text }]);
	return { root, compiler, owner, read: asked.read, file, commit, observation };
}

it("publishes literal source and exact dependencies, then guards undo and redo with source-owned receipts", async () => {
	const f = await fixture();
	const saved = await f.commit(f.read, 'One "quote" & {brace}\nsecond line');
	expect(saved.ok).toBe(true);
	if (!saved.ok || !saved.publication) throw new Error("save did not publish");
	expect(saved.publication.packet.values[f.read.original.cell]).toBe('One "quote" & {brace}\nsecond line');
	expect(readFileSync(f.file, "utf8")).toContain('<input defaultValue="keep" />');
	f.owner.delivered(saved.publication.packet.id);
	const undo = await f.owner.inverse(f.root, saved.publication.receipt);
	if (!undo.ok || !undo.publication) throw new Error("undo did not publish");
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	f.owner.delivered(undo.publication.packet.id);
	const redo = await f.owner.inverse(f.root, undo.publication.receipt);
	if (!redo.ok || !redo.publication) throw new Error("redo did not publish");
	expect(redo.publication.packet.values[f.read.original.cell]).toBe('One "quote" & {brace}\nsecond line');
	f.owner.delivered(redo.publication.packet.id);
});

it("retains the original occurrence, source role and generation across completion", async () => {
	const f = await fixture();
	expect(await f.commit(f.read, "other", { ...f.read.original, invocation: "later equal call" })).toMatchObject({
		ok: false,
	});
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	expect(await f.commit(f.read, "again")).toMatchObject({ ok: false });
});

it("refuses detected competing source and equal-byte outside replacements", async () => {
	const f = await fixture();
	writeFileSync(f.file, SOURCE.replace('"Hello"', '"outside"'));
	expect(await f.commit(f.read, "my intent")).toMatchObject({ ok: false });
	expect(readFileSync(f.file, "utf8")).toContain('"outside"');
	writeFileSync(f.file, SOURCE);
	expect(await f.owner.read(f.root, "home", f.read.original, 2, "canvas")).toMatchObject({ ok: false });
});

it("retires original reads when an absent compiler dependency appears", async () => {
	const f = await fixture();
	writeDesignFile(f.root, "shared/importmap.json", "{}");
	expect(await f.commit(f.read, "unpublished dependencies")).toMatchObject({ ok: false });
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});

it("does not write or mint an undo receipt for unchanged content", async () => {
	const f = await fixture();
	expect(await f.commit(f.read, "Hello")).toEqual({ ok: true, source: "unchanged", publication: null });
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});

it("refuses a receipt owned by another daemon lifetime", async () => {
	const f = await fixture();
	const saved = await f.commit(f.read, "saved");
	if (!saved.ok || !saved.receipt) throw new Error("no receipt");
	const restarted = createSourceOwner(f.compiler, async () => f.observation.current);
	expect(await restarted.inverse(f.root, saved.receipt)).toMatchObject({ ok: false });
});

it("preserves executable shape across empty and escaped literal writes and leaves adjacent children distinct", () => {
	const first = lowerLiterals("frame.tsx", SOURCE);
	const second = lowerLiterals("frame.tsx", SOURCE.replace('{"Hello"}', '{""}'));
	expect(first.shape).toBe(second.shape);
	const adjacent = lowerLiterals("frame.tsx", 'export default function Frame(){return <p>{"one"}{"two"}</p>}');
	expect(Object.values(adjacent.cells).filter((cell) => !cell.field)).toEqual([]);
	expect(adjacent.code).toContain('<p>{"one"}{"two"}</p>');
});

it("keeps two coordinated source edits reversible through two undos and two redos", async () => {
	const f = await fixture();
	const first = await f.commit(f.read, "One");
	if (!first.ok || !first.publication) throw new Error("first save failed");
	f.owner.delivered(first.publication.packet.id);
	f.observation.current = {
		...f.read.original,
		publication: first.publication.packet.id,
		value: "One",
		invocation: "second committed call",
	};
	const asked = await f.owner.read(f.root, "home", f.observation.current, 2, "canvas");
	if (!asked.ok) throw new Error(asked.reason);
	const second = await f.commit(asked.read, "Two");
	if (!second.ok || !second.publication) throw new Error("second save failed");
	f.owner.delivered(second.publication.packet.id);
	const undoSecond = await f.owner.inverse(f.root, second.publication.receipt);
	if (!undoSecond.ok || !undoSecond.publication) throw new Error("second undo failed");
	f.owner.delivered(undoSecond.publication.packet.id);
	const undoFirst = await f.owner.inverse(f.root, first.publication.receipt);
	if (!undoFirst.ok || !undoFirst.publication) throw new Error("first undo failed");
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	f.owner.delivered(undoFirst.publication.packet.id);
	const redoFirst = await f.owner.inverse(f.root, undoFirst.publication.receipt);
	if (!redoFirst.ok || !redoFirst.publication) throw new Error("first redo failed");
	f.owner.delivered(redoFirst.publication.packet.id);
	const redoSecond = await f.owner.inverse(f.root, undoSecond.publication.receipt);
	if (!redoSecond.ok || !redoSecond.publication) throw new Error("second redo failed");
	expect(readFileSync(f.file, "utf8")).toContain('{"Two"}</h1>');
	f.owner.delivered(redoSecond.publication.packet.id);
});

it("refuses a newly shadowing resolver candidate before saving source", async () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "home", `import {id} from "./dep";${SOURCE}`);
	writeDesignFile(root, "frames/home/dep.ts", "export const id = <T>(x:T)=>x;");
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const publication = id ? compiler.publication(id) : undefined;
	if (!publication) throw new Error("no publication");
	const cell = Object.keys(publication.compilation.cells)[0];
	if (!cell) throw new Error("no cell");
	const original = {
		publication: publication.compilation.packet.id,
		cell,
		occurrence: "node",
		invocation: "call",
		value: "Hello",
		context: "context",
	};
	const owner = createSourceOwner(compiler, async () => original);
	const read = await owner.read(root, "home", original, 1, "canvas");
	if (!read.ok) throw new Error(read.reason);
	writeDesignFile(root, "frames/home/dep.tsx", "export const id = 2;");
	const result = await owner.commit(root, read.read.handle, 1, read.read.original, [
		{ kind: "set-text", source: read.read.source, text: "must not save" },
	]);
	expect(result).toMatchObject({ ok: false });
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).not.toContain("must not save");
});

it("compiles CSS and JSON from the frozen publication rather than live loader reads", async () => {
	const { root } = makeProject(makeTempDir());
	writeFrame(
		root,
		"home",
		'import "./style.css"; import data from "./data.json"; export default ()=> <h1>{data.label}</h1>',
	);
	writeDesignFile(root, "frames/home/style.css", "h1 {color: red}");
	writeDesignFile(root, "frames/home/data.json", '{"label":"captured"}');
	const designDir = join(root, "design");
	const files = ["frame.tsx", "style.css", "data.json"];
	const frozen = new Map(
		files.map((file) => {
			const path = join(designDir, "frames/home", file);
			return [path, readInput(path)];
		}),
	);
	writeDesignFile(root, "frames/home/style.css", "h1 {color: blue}");
	writeDesignFile(root, "frames/home/data.json", '{"label":"outside"}');
	const result = await buildDesignEntry({
		designDir,
		resolveDir: join(designDir, "frames/home"),
		sourcefile: "entry.js",
		contents: 'import Frame from "./frame.tsx"; console.log(Frame)',
		label: "test",
		retained: emptyCompilation(),
		frozen,
	});
	expect(result.bundledCss).toContain("color: red");
	expect(result.bundledCss).not.toContain("blue");
	expect(result.bootJs).toContain('label: "captured"');
	expect(result.bootJs).not.toContain("outside");
});

it("preserves ordinary TypeScript and default expression-arrow compilation", async () => {
	expect(lowerLiterals("shared/id.ts", "export const id = <T>(x:T)=>x;").code).toBe("export const id = <T>(x:T)=>x;");
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "home", "export default () => <h1>Hello</h1>");
	const compiler = createFrameCompiler("test");
	expect(
		await compiler.getDocument(root, "home", { projectCapability: "test", controlOrigin: "http://localhost" }),
	).toMatchObject({ kind: "ok" });
});

it("does not mint a read for fabricated occurrence fields or save after the committed lease changes", async () => {
	const f = await fixture();
	expect(
		await f.owner.read(f.root, "home", { ...f.read.original, context: "fabricated context" }, 2, "canvas"),
	).toMatchObject({ ok: false });
	f.observation.current = { ...f.read.original, invocation: "later equal render" };
	expect(await f.commit(f.read, "must not save")).toMatchObject({ ok: false });
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});

it("preserves the ordinary compiler's configured class-field assignment semantics", async () => {
	const { root } = makeProject(makeTempDir());
	const designDir = join(root, "design"),
		resolveDir = join(designDir, "frames/home");
	writeFrame(
		root,
		"home",
		'class Base {set value(v){this.seen=v}} export class Derived extends Base {value="set"}; export default function Frame(){return <h1>Hello</h1>}',
	);
	writeDesignFile(root, "tsconfig.json", '{"compilerOptions":{"useDefineForClassFields":false}}');
	const options = {
		designDir,
		resolveDir,
		sourcefile: "entry.js",
		contents: 'import {Derived} from "./frame.tsx";globalThis.result=new Derived().seen;',
		label: "parity",
	};
	const ordinary = await buildDesignEntry(options),
		retained = await buildDesignEntry({ ...options, retained: emptyCompilation() });

	const runtime = await import("../runtime/jsx-dev-runtime");
	const evaluate = (code: string) => {
		const target = { result: undefined, __SPOOL_CONSUMED__: globalThis.__SPOOL_CONSUMED__ };
		const names: string[] = [],
			values: unknown[] = [];
		const imports = parse(code, { sourceType: "module" }).program.body.filter(
			(statement) => statement.type === "ImportDeclaration" && statement.source.value === "spool/jsx-dev-runtime",
		);
		for (const statement of imports) {
			if (statement.type !== "ImportDeclaration") continue;
			for (const spec of statement.specifiers) {
				if (spec.type !== "ImportSpecifier") throw new Error("unexpected runtime import");
				const name = spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
				names.push(spec.local.name);
				values.push(Reflect.get(runtime, name));
			}
		}
		for (const statement of imports.reverse()) code = code.slice(0, statement.start!) + code.slice(statement.end!);
		Function("globalThis", ...names, code)(target, ...values);
		return target.result;
	};
	expect(evaluate(ordinary.bootJs)).toBe("set");
	expect(evaluate(retained.bootJs)).toBe("set");
});

it.each(["tsconfig.json", "base.json", "frames/home/package.json"])(
	"refuses changed consumed %s configuration before saving source",
	async (file) => {
		const f = await fixture((root) => {
			writeDesignFile(
				root,
				"tsconfig.json",
				'{"extends":"./base.json","compilerOptions":{"useDefineForClassFields":false}}',
			);
			writeDesignFile(root, "base.json", '{"compilerOptions":{"alwaysStrict":true}}');
			writeDesignFile(root, "frames/home/package.json", '{"type":"module"}');
		});
		writeDesignFile(f.root, file, "{}");
		expect(await f.commit(f.read, "must not save")).toMatchObject({
			ok: false,
			reason: expect.stringContaining("configuration"),
		});
		expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	},
);

it("secondary-only dependency changes revoke secondary publication admission", async () => {
	const f = await fixture((root) => {
		writeDesignFile(root, "shared/label.tsx", 'export function Label(){return <h1>{"Hello"}</h1>}');
		writeFrame(root, "home", 'import {Label} from "shared/label"; export default function Frame(){return <Label/>}');
		writeFrame(
			root,
			"second",
			'import {Label} from "shared/label"; import "./only.css"; export default function Frame(){return <Label/>}',
		);
		writeDesignFile(root, "frames/second/only.css", "body{color:red}");
	});
	const document = await f.compiler.getDocument(f.root, "second", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	if (!id) throw new Error("no second publication");
	const second = { ...f.read.original, publication: id, occurrence: "second-node" };
	const reached = await f.owner.reach(f.root, f.read.handle, [
		{
			frame: "home",
			publication: f.read.original.publication,
			unknown: 0,
			uses: [{ original: f.read.original, visible: true }],
		},
		{ frame: "second", publication: id, unknown: 0, uses: [{ original: second, visible: true }] },
	]);
	if (!reached.ok) throw new Error(reached.reason);
	const saved = await f.commit(f.read, "After");
	if (!saved.ok || !saved.publication) throw new Error("no saved publication");
	const related = saved.publication.related?.[0];
	if (!related) throw new Error("no secondary publication");
	expect(f.owner.admit(related.admission.token)).toBe(true);
	writeDesignFile(f.root, "frames/second/only.css", "body{color:blue}");
	expect(f.owner.current(f.root, related.packet.id)).toBe(false);
	expect(f.owner.admit(related.admission.token)).toBe(false);
	f.owner.delivered(saved.publication.packet.id);
});
