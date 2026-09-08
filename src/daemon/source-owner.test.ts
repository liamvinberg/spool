import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { expect, it, onTestFinished } from "vitest";
import type { RetainedValues, SourceOccurrence, SourceRead, SourceResult } from "../source-edit";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { buildDesignEntry, createFrameCompiler } from "./compile";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";
import { emptyCompilation, lowerLiterals, readInput } from "./retained-compile";
import type { SourceAgentReply, SourceAgentRequest } from "./source-agent";
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
		owner.commit(root, read.handle, read.generation, occurrence, { kind: "literal", text });
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

it("binds the requested change to the original operation purpose and consumes a mismatched attempt", async () => {
	const f = await fixture();
	expect(
		await f.owner.commit(f.root, f.read.handle, f.read.generation, f.read.original, { kind: "delete" }),
	).toMatchObject({
		ok: false,
		reason: "this source read does not authorize that operation",
	});
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	expect(await f.commit(f.read, "cannot retry an already consumed handle")).toMatchObject({ ok: false });
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
	expect(Object.values(adjacent.cells).filter((cell) => !cell.field)).toMatchObject([
		{ value: "onetwo", childValue: ["one", "two"] },
	]);
	expect(adjacent.code).toContain('["one","two"]');
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
	const result = await owner.commit(root, read.read.handle, 1, read.read.original, {
		kind: "literal",
		text: "must not save",
	});
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
async function actualAgent(
	f: Awaited<ReturnType<typeof fixture>>,
	hook?: (request: SourceAgentRequest, response: SourceAgentReply) => Promise<void>,
) {
	const directory = join(makeTempDir(), "bundled");
	const runtime = await deterministicBundledRuntime(directory);
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const authority = f.owner.agent(f.root, () => true);
	runtime.source = () => ({
		request: async (request) => {
			const response = await authority.request(request);
			await hook?.(request, response);
			return response;
		},
	});
	onTestFinished(() => {
		authority.revoke();
		return runtime.close();
	});
	const session = randomUUID();
	return {
		authority,
		directory,
		run: async (calls: { name: string; arguments: Record<string, unknown> }[]) => {
			const results: { failed: boolean; text: string }[] = [];
			await runtime.turn(
				randomUUID(),
				{
					root: f.root,
					session: { id: session },
					permissions: "ask",
					ask: { value: "spool/openai/api_key/spool-test" },
					said: [{ selection: "", prompt: `file tools: ${JSON.stringify(calls)}` }],
				},
				(event) => {
					if (event.kind === "result") results.push(event);
				},
			);
			return results;
		},
	};
}
const agentRead = (path: string) => ({ name: "read", arguments: { path } });
const agentEdit = (path: string, oldText: string, newText: string) => ({
	name: "edit",
	arguments: { path, edits: [{ oldText, newText }] },
});

for (const order of ["agent first", "hand first"] as const) {
	it(`preserves actual bundled full Read and executed MultiEdit through hand commit, undo and redo: ${order}`, async () => {
		const f = await fixture((root) => writeFrame(root, "home", SOURCE.replace("<input", '<p>{"Other"}</p><input')));
		let hand: SourceResult | undefined;
		const agent = await actualAgent(f, async (request) => {
			if (order === "hand first" && request.kind === "read-complete") {
				hand = await f.commit(f.read, "Mine");
				if (hand.ok && hand.publication) f.owner.delivered(hand.publication.packet.id);
			}
		});
		const results = await agent.run([agentRead(f.file), agentEdit(f.file, "Other", "the agent")]);
		expect(results.map((one) => one.failed)).toEqual([false, false]);
		hand ??= await f.commit(f.read, "Mine");
		if (!hand.ok || !hand.receipt) throw new Error(JSON.stringify(hand));
		if (hand.publication) f.owner.delivered(hand.publication.packet.id);
		expect(readFileSync(f.file, "utf8")).toContain('{"Mine"}');
		expect(readFileSync(f.file, "utf8")).toContain('{"the agent"}');
		const undo = await f.owner.inverse(f.root, hand.receipt);
		if (!undo.ok || !undo.receipt) throw new Error(JSON.stringify(undo));
		if (undo.publication) f.owner.delivered(undo.publication.packet.id);
		expect(readFileSync(f.file, "utf8")).toContain('{"Hello"}');
		expect(readFileSync(f.file, "utf8")).toContain('{"the agent"}');
		const redo = await f.owner.inverse(f.root, undo.receipt);
		expect(redo.ok).toBe(true);
		if (redo.ok && redo.publication) f.owner.delivered(redo.publication.packet.id);
		expect(readFileSync(f.file, "utf8")).toContain('{"Mine"}');
		expect(readFileSync(f.file, "utf8")).toContain('{"the agent"}');
		expect(readFileSync(join(agent.directory, "provider-calls.jsonl"), "utf8")).not.toContain('"handle"');
	});
}
it("records competing matcher touches permanently even when another character changes and original bytes return", async () => {
	const f = await fixture();
	const agent = await actualAgent(f);
	const results = await agent.run([
		agentRead(f.file),
		agentEdit(f.file, "Hello", "Yello"),
		agentEdit(f.file, "Yello", "Hello"),
	]);
	expect(results.every((result) => !result.failed)).toBe(true);
	expect(await f.commit(f.read, "HellX")).toMatchObject({ ok: false, reason: expect.stringContaining("touched") });
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});
it("treats actual identical-byte Write as opaque and refuses an old inverse", async () => {
	const f = await fixture();
	const hand = await f.commit(f.read, "Mine");
	if (!hand.ok || !hand.receipt) throw new Error("hand failed");
	if (hand.publication) f.owner.delivered(hand.publication.packet.id);
	const agent = await actualAgent(f);
	expect(
		(
			await agent.run([
				agentRead(f.file),
				{ name: "write", arguments: { path: f.file, content: readFileSync(f.file, "utf8") } },
			])
		).every((r) => !r.failed),
	).toBe(true);
	expect(await f.owner.inverse(f.root, hand.receipt)).toMatchObject({ ok: false });
});
for (const partial of [{ offset: 1 }, { limit: 100 }, { offset: 2 }]) {
	it(`does not authorize edits from an actual partial Read ${JSON.stringify(partial)}`, async () => {
		const f = await fixture();
		const agent = await actualAgent(f);
		const results = await agent.run([
			{ name: "read", arguments: { path: f.file, ...partial } },
			agentEdit(f.file, "Hello", "agent"),
		]);
		expect(results.at(-1)?.failed).toBe(true);
		expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	});
}
it("requires a fresh full read of unseen rebased output", async () => {
	const f = await fixture((root) => writeFrame(root, "home", SOURCE.replace("<input", '<p>{"Other"}</p><input')));
	const agent = await actualAgent(f, async (request) => {
		if (request.kind !== "read-complete") return;
		const hand = await f.commit(f.read, "Mine");
		if (hand.ok && hand.publication) f.owner.delivered(hand.publication.packet.id);
	});
	const results = await agent.run([
		agentRead(f.file),
		agentEdit(f.file, "Other", "agent"),
		agentEdit(f.file, "agent", "later"),
	]);
	expect(results.map((result) => result.failed)).toEqual([false, false, true]);
	expect(readFileSync(f.file, "utf8")).toContain('{"agent"}');
});
it("invalidates out-of-order complete reads, forged handles and cross-session prepared records", async () => {
	const f = await fixture();
	const one = f.owner.agent(f.root, () => true),
		two = f.owner.agent(f.root, () => true);
	const old = await one.request({ kind: "read", path: f.file });
	const fresh = await one.request({ kind: "read", path: f.file });
	if (old.kind !== "read" || fresh.kind !== "read") throw new Error("no read");
	await one.request({ kind: "read-complete", handle: old.handle, complete: true });
	await expect(one.request({ kind: "prepare", path: f.file, operation: "edit" })).rejects.toThrow("complete");
	await expect(two.request({ kind: "read-complete", handle: fresh.handle, complete: true })).rejects.toThrow();
	await expect(one.request({ kind: "replace", handle: "forged", output: "bad", edits: null })).rejects.toThrow();
	one.revoke();
	two.revoke();
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});
it("keeps ambiguous named observations ordered and retires evidence on known observation loss", async () => {
	const f = await fixture();
	f.owner.observe(f.root, { kind: "named", path: f.file });
	const hand = await f.commit(f.read, "Mine");
	if (!hand.ok || !hand.receipt) throw new Error(JSON.stringify(hand));
	if (hand.publication) f.owner.delivered(hand.publication.packet.id);
	f.owner.observe(f.root, { kind: "lost" });
	expect(await f.owner.inverse(f.root, hand.receipt)).toMatchObject({ ok: false });
});

it.each(["LF", "BOM CRLF", "fuzzy CRLF"])("retains actual SDK encoding and matcher spans with %s", async (encoding) => {
	const content = 'export default function Frame(){return <main>\n<h1>{"Hello"}</h1>\n<p>“Other”</p>\n</main>}';
	const encoded = encoding === "LF" ? content : `\uFEFF${content.replaceAll("\n", "\r\n")}`;
	const f = await fixture((root) => writeFrame(root, "home", encoded));
	const agent = await actualAgent(f);
	const result = await agent.run([
		agentRead(f.file),
		agentEdit(f.file, encoding === "fuzzy CRLF" ? '"Other"' : "“Other”", "Agent"),
	]);
	expect(result.every((r) => !r.failed)).toBe(true);
	const saved = await f.commit(f.read, "Mine");
	expect(saved.ok).toBe(true);
	if (saved.ok && saved.publication) f.owner.delivered(saved.publication.packet.id);
	expect(readFileSync(f.file, "utf8")).toContain("<p>Agent</p>");
	if (encoding !== "LF") {
		expect(readFileSync(f.file, "utf8").startsWith("\uFEFF")).toBe(true);
		expect(readFileSync(f.file, "utf8").replaceAll("\r\n", "")).not.toContain("\n");
	}
});
it("retires mixed-ending normalization as an opaque actual SDK replacement", async () => {
	const f = await fixture((root) => writeFrame(root, "home", SOURCE.replace("<input", "\r\n<p>Other</p>\n<input")));
	const agent = await actualAgent(f);
	expect((await agent.run([agentRead(f.file), agentEdit(f.file, "Other", "Agent")])).every((r) => !r.failed)).toBe(
		true,
	);
	expect(await f.commit(f.read, "Mine")).toMatchObject({ ok: false });
});
it("rejects automatic Read truncation and consumes a failed executed edit's base", async () => {
	const f = await fixture((root) => writeFrame(root, "home", `${SOURCE}\n${"// padding\n".repeat(2100)}`));
	const agent = await actualAgent(f);
	const results = await agent.run([agentRead(f.file), agentEdit(f.file, "Hello", "bad")]);
	expect(results.map((r) => r.failed)).toEqual([false, true]);
	const short = await fixture();
	const second = await actualAgent(short);
	const failed = await second.run([
		agentRead(short.file),
		agentEdit(short.file, "missing text", "bad"),
		agentEdit(short.file, "Hello", "bad"),
	]);
	expect(failed.map((r) => r.failed)).toEqual([false, true, true]);
	expect(readFileSync(short.file, "utf8")).toBe(SOURCE);
});
it("requires checked absence for actual Write and refuses a competing creation", async () => {
	const f = await fixture();
	const path = join(f.root, "design/frames/home/new.ts");
	const agent = await actualAgent(f, async (request) => {
		if (request.kind === "prepare" && request.path === path) writeFileSync(path, "outside creation");
	});
	const result = await agent.run([{ name: "write", arguments: { path, content: "must not replace" } }]);
	expect(result[0]?.failed).toBe(true);
	expect(readFileSync(path, "utf8")).toBe("outside creation");
});
it("recertifies executable context before applying a disjoint hand span", async () => {
	const f = await fixture();
	const agent = await actualAgent(f);
	expect(
		(
			await agent.run([agentRead(f.file), agentEdit(f.file, 'defaultValue="keep"', "defaultValue={window.initial}")])
		).every((r) => !r.failed),
	).toBe(true);
	expect(await f.commit(f.read, "must not save")).toMatchObject({
		ok: false,
		reason: expect.stringContaining("context changed"),
	});
	expect(readFileSync(f.file, "utf8")).not.toContain("must not save");
});
it("releases an unacknowledged replacement and retires its source inverse when observation is lost", async () => {
	const f = await fixture();
	const saved = await f.commit(f.read, "Mine");
	if (!saved.ok || !saved.receipt) throw new Error("no receipt");
	if (saved.publication) f.owner.delivered(saved.publication.packet.id);
	const authority = f.owner.agent(f.root, () => true);
	const read = await authority.request({ kind: "read", path: f.file });
	if (read.kind !== "read") throw new Error("no read");
	await authority.request({ kind: "read-complete", handle: read.handle, complete: true });
	const prepared = await authority.request({ kind: "prepare", path: f.file, operation: "write" });
	if (prepared.kind !== "prepared") throw new Error("no prepared write");
	await authority.request({ kind: "replace", handle: prepared.handle, output: SOURCE, edits: null });
	authority.revoke();
	expect(await f.owner.inverse(f.root, saved.receipt)).toMatchObject({ ok: false });
	await expect(authority.request({ kind: "acknowledge", handle: prepared.handle, complete: true })).rejects.toThrow();
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});

it("keeps another project's actual agent records when one project's observation is lost", async () => {
	const first = await fixture(),
		second = await fixture();
	const agent = await actualAgent({ ...second, owner: first.owner });
	expect(
		(await agent.run([agentRead(second.file), agentEdit(second.file, "Hello", "Agent")])).every((r) => !r.failed),
	).toBe(true);
	first.owner.observe(first.root, { kind: "unknown" });
	expect((await agent.run([agentEdit(second.file, "Agent", "Still available")]))[0]?.failed).toBe(false);
	expect(readFileSync(second.file, "utf8")).toContain("Still available");
});
it("allows an outside editor's stale buffer to overwrite a save, then refuses its unavailable inverse", async () => {
	const f = await fixture();
	const saved = await f.commit(f.read, "Mine");
	if (!saved.ok || !saved.receipt) throw new Error("no saved receipt");
	if (saved.publication) f.owner.delivered(saved.publication.packet.id);
	writeFileSync(f.file, SOURCE);
	f.owner.observe(f.root, { kind: "named", path: f.file });
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	expect(await f.owner.inverse(f.root, saved.receipt)).toMatchObject({ ok: false });
});

it("permanently revokes a session when its persisted owner disappears and later returns", async () => {
	const f = await fixture();
	let persisted = true;
	const authority = f.owner.agent(f.root, () => persisted);
	const read = await authority.request({ kind: "read", path: f.file });
	if (read.kind !== "read") throw new Error("no read");
	await authority.request({ kind: "read-complete", handle: read.handle, complete: true });
	persisted = false;
	await expect(authority.request({ kind: "prepare", path: f.file, operation: "edit" })).rejects.toThrow();
	persisted = true;
	await expect(authority.request({ kind: "read", path: f.file })).rejects.toThrow();
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});
it("retires authority on project loss and daemon close without allowing a late reply to restore it", async () => {
	const f = await fixture();
	const authority = f.owner.agent(f.root, () => true);
	const read = await authority.request({ kind: "read", path: f.file });
	if (read.kind !== "read") throw new Error("no read");
	f.owner.keepProjects([]);
	await expect(authority.request({ kind: "read-complete", handle: read.handle, complete: true })).rejects.toThrow();
	f.owner.close();
	expect(await f.commit(f.read, "late")).toMatchObject({ ok: false });
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});

it("two hand undos preserve an independent actual agent edit", async () => {
	const f = await fixture((root) => writeFrame(root, "home", SOURCE.replace("<input", '<p>{"Other"}</p><input')));
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
	const agent = await actualAgent(f);
	expect((await agent.run([agentRead(f.file), agentEdit(f.file, "Other", "Agent")])).map((r) => r.failed)).toEqual([
		false,
		false,
	]);
	const undoSecond = await f.owner.inverse(f.root, second.publication.receipt);
	if (!undoSecond.ok || !undoSecond.publication) throw new Error("second undo failed");
	f.owner.delivered(undoSecond.publication.packet.id);
	const undoFirst = await f.owner.inverse(f.root, first.publication.receipt);
	if (!undoFirst.ok || !undoFirst.publication) throw new Error(`first undo failed: ${JSON.stringify(undoFirst)}`);
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE.replace("<input", '<p>{"Agent"}</p><input'));
	f.owner.delivered(undoFirst.publication.packet.id);
	const redoFirst = await f.owner.inverse(f.root, undoFirst.publication.receipt);
	if (!redoFirst.ok || !redoFirst.publication) throw new Error("first redo failed");
	f.owner.delivered(redoFirst.publication.packet.id);
	const redoSecond = await f.owner.inverse(f.root, undoSecond.publication.receipt);
	if (!redoSecond.ok || !redoSecond.publication) throw new Error("second redo failed");
	expect(readFileSync(f.file, "utf8")).toContain('{"Two"}</h1>');
	f.owner.delivered(redoSecond.publication.packet.id);
});

it("coordinates a design folder symlink inside the project and revokes it when its identity changes", async () => {
	const f = await fixture((root) => {
		renameSync(join(root, "design"), join(root, "actual-design"));
		symlinkSync("actual-design", join(root, "design"));
	});
	const agent = await actualAgent(f);
	expect(
		(await agent.run([agentRead(f.file), agentEdit(f.file, "Hello", "Agent")])).map((result) => result.failed),
	).toEqual([false, false]);
	expect(await f.commit(f.read, "Mine")).toMatchObject({ ok: false, reason: expect.stringContaining("touched") });
	const second = await actualAgent(f, async (request) => {
		if (request.kind === "prepare") {
			renameSync(join(f.root, "actual-design"), join(f.root, "old-design"));
			renameSync(join(f.root, "old-design"), join(f.root, "replacement-design"));
			// A different directory at the canonical path cannot inherit the authority.
			mkdirSync(join(f.root, "actual-design"));
			writeFrame(f.root, "home", SOURCE);
		}
	});
	expect((await second.run([agentRead(f.file), agentEdit(f.file, "Agent", "Wrong")])).at(-1)?.failed).toBe(true);
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
});

it("preserves a separately retained literal attribute across a rebased text save and inverse", async () => {
	const f = await fixture();
	const agent = await actualAgent(f);
	expect(
		(await agent.run([agentRead(f.file), agentEdit(f.file, 'defaultValue="keep"', 'defaultValue="changed"')])).every(
			(result) => !result.failed,
		),
	).toBe(true);
	const saved = await f.commit(f.read, "Mine");
	if (!saved.ok || !saved.receipt || !saved.publication) throw new Error("source did not save");
	expect(readFileSync(f.file, "utf8")).toContain('defaultValue="changed"');
	f.owner.delivered(saved.publication.packet.id);
	const undone = await f.owner.inverse(f.root, saved.receipt);
	expect(undone.ok).toBe(true);
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE.replace('defaultValue="keep"', 'defaultValue="changed"'));
	if (undone.ok && undone.publication) f.owner.delivered(undone.publication.packet.id);
});

it("keeps shared source inverse authority after every consuming frame is removed", async () => {
	const shared = 'export function Label(){return <h1>{"Hello"}</h1>}';
	const f = await fixture((root) => {
		writeDesignFile(root, "shared/label.tsx", shared);
		writeFrame(root, "home", 'import {Label} from "shared/label";export default function Frame(){return <Label/>}');
	});
	const saved = await f.commit(f.read, "Changed");
	if (!saved.ok || !saved.receipt || !saved.publication) throw new Error("no shared save");
	f.owner.delivered(saved.publication.packet.id);
	rmSync(join(f.root, "design/frames/home"), { recursive: true });
	const undone = await f.owner.inverse(f.root, saved.receipt, []);
	expect(undone).toMatchObject({ ok: true, source: "saved", publication: null });
	expect(readFileSync(join(f.root, "design/shared/label.tsx"), "utf8")).toBe(shared);
	if (!undone.ok || !undone.receipt) throw new Error("no source-owned redo");
	const redone = await f.owner.inverse(f.root, undone.receipt, []);
	expect(redone).toMatchObject({ ok: true, source: "saved", publication: null });
	expect(readFileSync(join(f.root, "design/shared/label.tsx"), "utf8")).toContain("Changed");
});

it.each(["save", "undo"])("keeps a stale observed use unverified beside a valid use during %s", async (operation) => {
	const f = await fixture();
	let original = f.read.original;
	let receipt: import("../source-edit").SourceReceipt | undefined;
	if (operation === "undo") {
		const saved = await f.commit(f.read, "After");
		if (!saved.ok || !saved.publication) throw new Error("save did not publish");
		receipt = saved.publication.receipt;
		f.owner.delivered(saved.publication.packet.id);
		original = { ...original, publication: saved.publication.packet.id, value: "After" };
	}
	const inventories = [
		{
			frame: "home",
			publication: original.publication,
			unknown: 0,
			uses: [
				{ original, visible: true },
				{ original: { ...original, publication: "retired-publication", occurrence: "stale-node" }, visible: true },
			],
		},
	];
	if (operation === "save") {
		const reached = await f.owner.reach(f.root, f.read.handle, inventories);
		if (!reached.ok) throw new Error(reached.reason);
		expect(reached.read.reach?.unknown).toContain("home");
	}
	const result = receipt ? await f.owner.inverse(f.root, receipt, inventories) : await f.commit(f.read, "After");
	if (!result.ok || !result.publication) throw new Error("valid use was not published");
	expect(result.publication.targets).toHaveLength(1);
	expect(result.publication.failures).toContainEqual(
		expect.objectContaining({ frame: "home", rendered: "unverified" }),
	);
	f.owner.delivered(result.publication.packet.id);
	expect(readFileSync(f.file, "utf8")).toBe(operation === "undo" ? SOURCE : SOURCE.replace('"Hello"', '"After"'));
});

it.each(["dependency", "coverage", "owner restart"])(
	"does not let an explicit fresh retry survive %s loss",
	async (loss) => {
		const f = await fixture();
		const agent = await actualAgent(f);
		expect(
			(await agent.run([agentRead(f.file), agentEdit(f.file, "Hello", "Agent current")])).every(
				(result) => !result.failed,
			),
		).toBe(true);
		const fresh = await f.owner.read(f.root, "home", f.read.original, 2, "canvas", { kind: "literal" }, true);
		if (!fresh.ok) throw new Error(fresh.reason);
		expect(fresh.read.value).toBe("Agent current");
		if (loss === "dependency") writeDesignFile(f.root, "shared/importmap.json", "{}");
		if (loss === "coverage") f.owner.observe(f.root, { kind: "lost" });
		const owner =
			loss === "owner restart" ? createSourceOwner(f.compiler, async () => f.observation.current) : f.owner;
		expect(
			await owner.commit(f.root, fresh.read.handle, fresh.read.generation, fresh.read.original, {
				kind: "literal",
				text: "Requested retry",
			}),
		).toEqual({ ok: false, reason: expect.any(String) });
		expect(readFileSync(f.file, "utf8")).toBe(SOURCE.replace("Hello", "Agent current"));
	},
);

it("recognizes a reloaded original publication after an acknowledged exact inverse but not an outside equal-byte replacement", async () => {
	const f = await fixture();
	const original = f.read.original.publication;
	const saved = await f.commit(f.read, "Changed");
	if (!saved.ok || !saved.publication) throw new Error("save did not publish");
	f.owner.delivered(saved.publication.packet.id);
	expect(f.owner.current(f.root, original)).toBe(false);
	const undone = await f.owner.inverse(f.root, saved.publication.receipt);
	if (!undone.ok || !undone.publication) throw new Error("inverse did not publish");
	f.owner.delivered(undone.publication.packet.id);
	expect(readFileSync(f.file, "utf8")).toBe(SOURCE);
	expect(f.owner.current(f.root, original)).toBe(true);
	const outside = `${f.file}.outside`;
	writeFileSync(outside, SOURCE);
	renameSync(outside, f.file);
	expect(f.owner.current(f.root, original)).toBe(false);
});
