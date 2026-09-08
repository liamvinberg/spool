import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { createSourceOwner } from "./source-owner";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"/>';

async function fixture() {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/assets/first.svg", SVG);
	const source =
		'import picture from "shared/assets/first.svg"; export default function Frame(){return <img src={picture}/>}';
	writeFrame(root, "home", source);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("no immutable publication");
	const sourceAt = `frames/home/frame.tsx:1:${source.indexOf("<img") + 1}`;
	const original = {
		publication: compilation.packet.id,
		cell: sourceAt,
		occurrence: "image-node",
		invocation: "render-call",
		value: `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`,
		field: "src",
		absent: false,
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
