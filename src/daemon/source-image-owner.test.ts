import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { createSourceOwner } from "./source-owner";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"/>';

it("attributes the original image to the captured import rather than equal rendered bytes", async () => {
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
