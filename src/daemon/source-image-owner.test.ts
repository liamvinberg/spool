import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";
import { createSourceOwner } from "./source-owner";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"/>';

async function fixture(
	shared = false,
	transform = (source: string) => source,
	firstImage = SVG,
	consumerImage = false,
) {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/assets/first.svg", firstImage);
	writeDesignFile(root, "shared/assets/second.svg", SVG.replace('width="3"', 'width="7"'));
	const source = transform(
		'import picture from "shared/assets/first.svg"; export default function Frame(){return <img src={picture}/>}',
	);
	if (shared) {
		writeDesignFile(root, "shared/image.tsx", source);
		writeFrame(root, "second", 'export {default} from "shared/image"');
	}
	writeFrame(root, "home", shared ? 'export {default} from "shared/image"' : source);
	if (shared && consumerImage) {
		writeDesignFile(root, "frames/home/consumer.svg", SVG);
		writeFrame(
			root,
			"home",
			'import Image from "shared/image";import local from "./consumer.svg";export default function Consumer(){return <><Image/><img src={local}/></>}',
		);
	}
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("no immutable publication");
	const cell = Object.values(compilation.cells).find(
		(cell) => cell.field === "src" && (!shared || cell.file === "shared/image.tsx"),
	);
	if (!cell) throw new Error("missing compiled image source");
	const sourceAt = cell.source;
	const original = {
		publication: compilation.packet.id,
		cell: sourceAt,
		occurrence: "image-node",
		invocation: "render-call",
		value: cell.value,
		field: "src",
		absent: cell.absent,
		context: "original",
		provenance: JSON.stringify({ source: sourceAt, occurrence: "image-node", generation: "1", chain: [] }),
	};
	const owner = createSourceOwner(compiler, async () => original);
	return { root, source, sourceAt, compiler, original, owner };
}

it("attributes the original image to the captured import rather than equal rendered bytes", async () => {
	const { root, sourceAt, original, owner } = await fixture();
	const read = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
	expect(read).toMatchObject({
		ok: true,
		read: {
			operation: { kind: "image" },
			role: "image-binding",
			scope: "definition",
			source: sourceAt,
			value: original.value,
		},
	});
	const literal = await owner.read(root, "home", original, 2, "canvas", { kind: "literal", field: "src" });
	expect(literal).toMatchObject({ ok: false });
});

it("stages image bytes under the original read without saving source and cancels later staging", async () => {
	const { root, source, original, owner } = await fixture();
	const result = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
	if (!result.ok) throw new Error(result.reason);
	const data = Buffer.from(SVG.replace('width="3"', 'width="7"')).toString("base64");
	const staged = await owner.stageImage(root, result.read.handle, 1, original, {
		kind: "file",
		name: "new.svg",
		data,
	});
	expect(staged).toEqual({ ok: true, path: "frames/home/new.svg", value: `data:image/svg+xml;base64,${data}` });
	expect(readFileSync(join(root, "design/frames/home/new.svg")).toString("base64")).toBe(data);
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toBe(source);
	owner.cancel(root, result.read.handle);
	expect(
		await owner.stageImage(root, result.read.handle, 1, original, { kind: "file", name: "late.svg", data }),
	).toMatchObject({ ok: false });
	expect(readFileSync(join(root, "design/frames/home/new.svg")).toString("base64")).toBe(data);
	expect(existsSync(join(root, "design/frames/home/late.svg"))).toBe(false);
});

it("saves one image source operation and restores its import through source-owned undo and redo", async () => {
	const { root, source, original, owner } = await fixture();
	const result = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
	if (!result.ok) throw new Error(result.reason);
	const data = Buffer.from(SVG.replace('width="3"', 'width="7"')).toString("base64");
	const staged = await owner.stageImage(root, result.read.handle, 1, original, {
		kind: "file",
		name: "new.svg",
		data,
	});
	if (!staged.ok) throw new Error(staged.reason);
	const saved = await owner.commit(root, result.read.handle, 1, original, { kind: "image", path: staged.path });
	expect(saved).toMatchObject({
		ok: true,
		source: "saved",
		publication: { expected: { kind: "image", value: staged.value, absent: false } },
	});
	if (!saved.ok || !saved.publication) throw new Error("image did not publish");
	const file = join(root, "design/frames/home/frame.tsx");
	expect(readFileSync(file, "utf8")).toContain('from "./new.svg"');
	expect(readFileSync(file, "utf8")).not.toContain("first.svg");
	owner.delivered(saved.publication.packet.id);
	const undone = await owner.inverse(root, saved.publication.receipt);
	expect(undone).toMatchObject({
		ok: true,
		source: "saved",
		publication: { expected: { kind: "image", value: original.value, absent: false } },
	});
	if (!undone.ok || !undone.publication) throw new Error("image undo did not publish");
	expect(readFileSync(file, "utf8")).toBe(source);
	expect(readFileSync(join(root, "design/frames/home/new.svg")).toString("base64")).toBe(data);
	owner.delivered(undone.publication.packet.id);
	const redone = await owner.inverse(root, undone.publication.receipt);
	expect(redone).toMatchObject({
		ok: true,
		source: "saved",
		publication: { expected: { kind: "image", value: staged.value, absent: false } },
	});
	if (redone.ok && redone.publication) owner.delivered(redone.publication.packet.id);
});

it.each([
	{ kind: "existing", path: "../outside.svg" },
	{ kind: "existing", path: "shared/assets/missing.svg" },
	{ kind: "file", name: "../outside.svg", data: "YQ==" },
	{ kind: "file", name: "wrong.txt", data: "YQ==" },
	{ kind: "file", name: "invalid.svg", data: "not base64" },
	{ kind: "file", name: "large.svg", data: Buffer.alloc(400_000).toString("base64") },
] as const)("refuses invalid staged image $kind without changing source", async (put) => {
	const { root, source, original, owner } = await fixture();
	const result = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
	if (!result.ok) throw new Error(result.reason);
	expect(await owner.stageImage(root, result.read.handle, 1, original, put)).toMatchObject({ ok: false });
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toBe(source);
	if (put.kind === "file") expect(existsSync(join(root, "design/frames/home", put.name))).toBe(false);
});

it.each(["staged", "original"] as const)("refuses changed %s image bytes before saving any source", async (which) => {
	const { root, source, original, owner } = await fixture();
	const result = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
	if (!result.ok) throw new Error(result.reason);
	const data = Buffer.from(SVG.replace('width="3"', 'width="7"')).toString("base64");
	const staged = await owner.stageImage(root, result.read.handle, 1, original, {
		kind: "file",
		name: "new.svg",
		data,
	});
	if (!staged.ok) throw new Error(staged.reason);
	const path = which === "staged" ? staged.path : "shared/assets/first.svg";
	writeFileSync(join(root, "design", path), SVG.replace('width="3"', 'width="9"'));
	const saved = await owner.commit(root, result.read.handle, 1, original, { kind: "image", path: staged.path });
	expect(saved).toMatchObject({ ok: false });
	expect(saved).not.toHaveProperty("receipt");
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toBe(source);
});

it.each([false, true])(
	"restores shared image source after the initiating frame is gone without deleting staged bytes (consumer asset: %s)",
	async (consumerImage) => {
		const { root, source, original, owner } = await fixture(true, undefined, SVG, consumerImage);
		const read = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
		if (!read.ok) throw new Error(read.reason);
		const staged = await owner.stageImage(root, read.read.handle, 1, original, {
			kind: "existing",
			path: "shared/assets/second.svg",
		});
		if (!staged.ok) throw new Error(staged.reason);
		const saved = await owner.commit(root, read.read.handle, 1, original, { kind: "image", path: staged.path });
		if (!saved.ok || !saved.publication) throw new Error(JSON.stringify(saved));
		owner.delivered(saved.publication.packet.id);
		rmSync(join(root, "design/frames/home"), { recursive: true });
		const undone = await owner.inverse(root, saved.publication.receipt, []);
		expect(undone, JSON.stringify(undone)).toMatchObject({
			ok: true,
			source: "saved",
			publication: null,
			receipt: { operation: { kind: "image" } },
		});
		expect(readFileSync(join(root, "design/shared/image.tsx"), "utf8")).toBe(source);
		expect(readFileSync(join(root, "design/shared/assets/second.svg"), "utf8")).toBe(
			SVG.replace('width="3"', 'width="7"'),
		);
		if (!undone.ok || !undone.receipt) throw new Error("missing source-owned inverse");
		const redone = await owner.inverse(root, undone.receipt, []);
		expect(redone, JSON.stringify(redone)).toMatchObject({ ok: true, source: "saved", publication: null });
		expect(readFileSync(join(root, "design/shared/image.tsx"), "utf8")).toContain("second.svg");
	},
);

it.each(["changed", "removed"] as const)(
	"refuses source-only image undo when a required asset is %s",
	async (change) => {
		const { root, original, owner } = await fixture(true, undefined, SVG, true);
		const read = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
		if (!read.ok) throw new Error(read.reason);
		const staged = await owner.stageImage(root, read.read.handle, 1, original, {
			kind: "existing",
			path: "shared/assets/second.svg",
		});
		if (!staged.ok) throw new Error(staged.reason);
		const saved = await owner.commit(root, read.read.handle, 1, original, { kind: "image", path: staged.path });
		if (!saved.ok || !saved.publication) throw new Error(JSON.stringify(saved));
		owner.delivered(saved.publication.packet.id);
		const file = join(root, "design/shared/image.tsx");
		const after = readFileSync(file, "utf8");
		rmSync(join(root, "design/frames/home"), { recursive: true });
		const asset = join(root, "design/shared/assets/first.svg");
		if (change === "removed") rmSync(asset);
		else writeFileSync(asset, SVG.replace('width="3"', 'width="9"'));
		const undone = await owner.inverse(root, saved.publication.receipt, []);
		expect(undone).toMatchObject({ ok: false });
		expect(undone).not.toHaveProperty("receipt");
		expect(readFileSync(file, "utf8")).toBe(after);
		expect(readFileSync(join(root, "design/shared/assets/second.svg"), "utf8")).toBe(
			SVG.replace('width="3"', 'width="7"'),
		);
	},
);

async function sdkEdit(f: Awaited<ReturnType<typeof fixture>>, oldText: string, newText: string) {
	const runtime = await deterministicBundledRuntime(join(makeTempDir(), "bundled"));
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const authority = f.owner.agent(f.root, () => true);
	runtime.source = () => ({ request: (request) => authority.request(request) });
	onTestFinished(() => {
		authority.revoke();
		return runtime.close();
	});
	const path = join(f.root, "design/frames/home/frame.tsx");
	const calls = [
		{ name: "read", arguments: { path } },
		{ name: "edit", arguments: { path, edits: [{ oldText, newText }] } },
	];
	const results: boolean[] = [];
	await runtime.turn(
		randomUUID(),
		{
			root: f.root,
			session: { id: randomUUID() },
			permissions: "ask",
			ask: { value: "spool/openai/api_key/spool-test" },
			said: [{ selection: "", prompt: `file tools: ${JSON.stringify(calls)}` }],
		},
		(event) => {
			if (event.kind === "result") results.push(event.failed);
		},
	);
	expect(results).toEqual([false, false]);
}

it("refuses a pending image after the SDK changes its import to another already captured binding", async () => {
	const f = await fixture(false, (source) =>
		source
			.replace("export default", 'import other from "shared/assets/second.svg"; export default')
			.replace("<img src={picture}/>", "<><img src={picture}/><img src={picture}/><img src={other}/></>"),
	);
	const read = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!read.ok) throw new Error(read.reason);
	const staged = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "file",
		name: "new.svg",
		data: Buffer.from(SVG.replace('width="3"', 'width="11"')).toString("base64"),
	});
	if (!staged.ok) throw new Error(staged.reason);
	await sdkEdit(f, 'picture from "shared/assets/first.svg"', 'picture from "shared/assets/second.svg"');
	const changed = readFileSync(join(f.root, "design/frames/home/frame.tsx"), "utf8");
	const result = await f.owner.commit(f.root, read.read.handle, 1, f.original, { kind: "image", path: staged.path });
	expect(result, JSON.stringify(result)).toMatchObject({ ok: false });
	expect(readFileSync(join(f.root, "design/frames/home/frame.tsx"), "utf8")).toBe(changed);
});

it("preserves an independent acknowledged SDK prefix through image save and both inverses", async () => {
	const f = await fixture(false, (source) => `// original header\n${source}`);
	const read = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!read.ok) throw new Error(read.reason);
	const staged = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "existing",
		path: "shared/assets/second.svg",
	});
	if (!staged.ok) throw new Error(staged.reason);
	const prefix = "// independent source edit\n";
	await sdkEdit(f, "// original header\n", prefix);
	const saved = await f.owner.commit(f.root, read.read.handle, 1, f.original, { kind: "image", path: staged.path });
	expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, source: "saved" });
	if (!saved.ok || !saved.receipt) throw new Error("missing image receipt");
	if (saved.publication) f.owner.delivered(saved.publication.packet.id);
	const path = join(f.root, "design/frames/home/frame.tsx");
	expect(readFileSync(path, "utf8")).toContain(prefix);
	const undone = await f.owner.inverse(f.root, saved.receipt);
	expect(undone, JSON.stringify(undone)).toMatchObject({ ok: true, source: "saved" });
	if (!undone.ok || !undone.receipt) throw new Error("missing inverse receipt");
	if (undone.publication) f.owner.delivered(undone.publication.packet.id);
	expect(readFileSync(path, "utf8")).toBe(f.source.replace("// original header\n", prefix));
	const redone = await f.owner.inverse(f.root, undone.receipt);
	expect(redone, JSON.stringify(redone)).toMatchObject({ ok: true, source: "saved" });
	if (redone.ok && redone.publication) f.owner.delivered(redone.publication.packet.id);
	expect(readFileSync(path, "utf8")).toContain(prefix);
	expect(readFileSync(path, "utf8")).toContain("second.svg");
});

it("refuses image Undo when an import retained for another use changes after the save", async () => {
	const f = await fixture(false, (source) =>
		source
			.replace("export default", 'import other from "shared/assets/second.svg"; export default')
			.replace("<img src={picture}/>", "<><img src={picture}/><img src={picture}/><img src={other}/></>"),
	);
	const read = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!read.ok) throw new Error(read.reason);
	const staged = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "file",
		name: "new.svg",
		data: Buffer.from(SVG.replace('width="3"', 'width="11"')).toString("base64"),
	});
	if (!staged.ok) throw new Error(staged.reason);
	const saved = await f.owner.commit(f.root, read.read.handle, 1, f.original, { kind: "image", path: staged.path });
	if (!saved.ok || !saved.publication) throw new Error(JSON.stringify(saved));
	f.owner.delivered(saved.publication.packet.id);
	await sdkEdit(f, 'picture from "shared/assets/first.svg"', 'picture from "shared/assets/second.svg"');
	const path = join(f.root, "design/frames/home/frame.tsx");
	const changed = readFileSync(path, "utf8");
	const undone = await f.owner.inverse(f.root, saved.publication.receipt);
	expect(undone, JSON.stringify(undone)).toMatchObject({ ok: false });
	expect(readFileSync(path, "utf8")).toBe(changed);
});

it("publishes the chosen shared image import to every captured consumer", async () => {
	const f = await fixture(true);
	const document = await f.compiler.getDocument(f.root, "second", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	if (!id) throw new Error("missing secondary publication");
	const read = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!read.ok) throw new Error(read.reason);
	const second = { ...f.original, publication: id, occurrence: "second-image" };
	const reached = await f.owner.reach(f.root, read.read.handle, [
		{
			frame: "home",
			publication: f.original.publication,
			unknown: 0,
			uses: [{ original: f.original, visible: true }],
		},
		{ frame: "second", publication: id, unknown: 0, uses: [{ original: second, visible: true }] },
	]);
	if (!reached.ok) throw new Error(reached.reason);
	expect(reached.read.reach?.uses).toHaveLength(2);
	const staged = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "existing",
		path: "shared/assets/second.svg",
	});
	if (!staged.ok) throw new Error(staged.reason);
	const saved = await f.owner.commit(f.root, read.read.handle, 1, f.original, { kind: "image", path: staged.path });
	if (!saved.ok || !saved.publication) throw new Error(JSON.stringify(saved));
	expect(saved.publication.failures).toEqual([]);
	expect(saved.publication.related).toHaveLength(1);
	const related = saved.publication.related?.[0];
	if (!related) throw new Error("missing related publication");
	expect(related.expected).toEqual({
		kind: "image",
		value: staged.value,
		absent: false,
		asset: "shared/assets/second.svg",
		source: expect.stringMatching(/^shared\/image\.tsx:1:\d+$/),
	});
	expect(related.packet.values[read.read.cell!]).toBe(staged.value);
	expect(f.owner.admit(related.admission.token)).toBe(true);
	f.owner.delivered(saved.publication.packet.id);
});

it("does not rewrite an unchanged canonical image import or create history", async () => {
	const f = await fixture();
	const read = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!read.ok) throw new Error(read.reason);
	const staged = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "existing",
		path: "shared/assets/first.svg",
	});
	if (!staged.ok) throw new Error(staged.reason);
	const saved = await f.owner.commit(f.root, read.read.handle, 1, f.original, { kind: "image", path: staged.path });
	expect(saved).toEqual({ ok: true, source: "unchanged", publication: null });
	expect(readFileSync(join(f.root, "design/frames/home/frame.tsx"), "utf8")).toBe(f.source);
});

it("reuses identical staged bytes and preserves a different same-name file", async () => {
	const f = await fixture();
	const read = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!read.ok) throw new Error(read.reason);
	const first = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "file",
		name: "picture.svg",
		data: Buffer.from(SVG).toString("base64"),
	});
	expect(first).toMatchObject({ ok: true, path: "frames/home/picture.svg" });
	const repeated = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "file",
		name: "picture.svg",
		data: Buffer.from(SVG).toString("base64"),
	});
	expect(repeated).toEqual(first);
	const changed = SVG.replace('width="3"', 'width="9"');
	const second = await f.owner.stageImage(f.root, read.read.handle, 1, f.original, {
		kind: "file",
		name: "picture.svg",
		data: Buffer.from(changed).toString("base64"),
	});
	expect(second).toMatchObject({ ok: true, path: "frames/home/picture-2.svg" });
	expect(readFileSync(join(f.root, "design/frames/home/picture.svg"), "utf8")).toBe(SVG);
	expect(readFileSync(join(f.root, "design/frames/home/picture-2.svg"), "utf8")).toBe(changed);
	expect(readFileSync(join(f.root, "design/frames/home/frame.tsx"), "utf8")).toBe(f.source);
});

it("replaces an orphaned large import without counting its old bytes against the new document", async () => {
	const { root, original, owner } = await fixture(false, (source) => source, "x".repeat(300 * 1024));
	const result = await owner.read(root, "home", original, 1, "canvas", { kind: "image" });
	if (!result.ok) throw new Error(result.reason);
	const data = Buffer.from("y".repeat(300 * 1024)).toString("base64");
	const staged = await owner.stageImage(root, result.read.handle, 1, original, {
		kind: "file",
		name: "fresh.svg",
		data,
	});
	if (!staged.ok) throw new Error(staged.reason);
	const saved = await owner.commit(root, result.read.handle, 1, original, { kind: "image", path: staged.path });
	expect(saved).toMatchObject({ ok: true, source: "saved" });
	const source = readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8");
	expect(source).toContain('from "./fresh.svg"');
	expect(source).not.toContain("first.svg");
	expect(readFileSync(join(root, "design/shared/assets/first.svg"), "utf8")).toBe("x".repeat(300 * 1024));
	if (saved.ok && saved.publication) owner.delivered(saved.publication.packet.id);
});

it.each(["bytes", "equal-byte replacement"] as const)(
	"never hides a staged asset watcher event after outside %s",
	async (change) => {
		const f = await fixture();
		const result = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
		if (!result.ok) throw new Error(result.reason);
		const staged = await f.owner.stageImage(f.root, result.read.handle, 1, f.original, {
			kind: "file",
			name: "new.svg",
			data: Buffer.from(SVG).toString("base64"),
		});
		if (!staged.ok) throw new Error(staged.reason);
		const file = join(f.root, "design", staged.path);
		expect(f.owner.stagedAddition(f.root, file)).toBeTypeOf("function");
		if (change === "equal-byte replacement") rmSync(file);
		writeFileSync(file, change === "bytes" ? `${SVG} ` : SVG);
		expect(f.owner.stagedAddition(f.root, file)).toBeUndefined();
	},
);

it("gives only new additions a bounded watcher exception, never existing asset selection", async () => {
	const f = await fixture();
	const result = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
	if (!result.ok) throw new Error(result.reason);
	await f.owner.stageImage(f.root, result.read.handle, 1, f.original, {
		kind: "existing",
		path: "shared/assets/second.svg",
	});
	expect(f.owner.stagedAddition(f.root, join(f.root, "design/shared/assets/second.svg"))).toBeUndefined();
	const staged = await f.owner.stageImage(f.root, result.read.handle, 1, f.original, {
		kind: "file",
		name: "new.svg",
		data: Buffer.from(SVG).toString("base64"),
	});
	if (!staged.ok) throw new Error(staged.reason);
	const file = join(f.root, "design", staged.path);
	const release = f.owner.stagedAddition(f.root, file);
	expect(release).toBeTypeOf("function");
	release?.();
	expect(f.owner.stagedAddition(f.root, file)).toBeUndefined();
	expect(readFileSync(file, "utf8")).toBe(SVG);
});

it.each([true, false])(
	"keeps original computed import inventories strict when staged image matches=%s",
	async (matches) => {
		const pattern = matches ? "./" : "../../shared/assets/";
		const f = await fixture(
			false,
			(source) => `${source};export function imageNamed(name){return import(\`${pattern}\${name}.svg\`)}`,
		);
		const captured = f.compiler.publication(f.original.publication)?.compilation;
		expect(captured?.globDiscoveries?.length).toBe(1);
		const result = await f.owner.read(f.root, "home", f.original, 1, "canvas", { kind: "image" });
		if (!result.ok) throw new Error(result.reason);
		const staged = await f.owner.stageImage(f.root, result.read.handle, 1, f.original, {
			kind: "file",
			name: "new.svg",
			data: Buffer.from(SVG).toString("base64"),
		});
		expect(staged.ok).toBe(!matches);
		expect(existsSync(join(f.root, "design/frames/home/new.svg"))).toBe(!matches);
		expect(readFileSync(join(f.root, "design/frames/home/frame.tsx"), "utf8")).toBe(f.source);
		f.owner.cancel(f.root, result.read.handle);
		const next = await f.owner.read(f.root, "home", f.original, 2, "canvas", { kind: "image" });
		expect(next).toMatchObject({ ok: true });
	},
);
