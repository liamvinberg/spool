import { expect, it } from "vitest";
import type { ValueSnapshot } from "../runtime/source-values";
import type { SourceOccurrence } from "../source-edit";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { type Selection, Sources, sourceRead } from "./source-origins";
import { resolvePropertySource } from "./source-property-target";

function snapshot(id: number, source: string, fields: Record<string, unknown>): ValueSnapshot {
	const origin = (field: string, slot: "prop" | "type" | "key") => ({
		kind: "jsx" as const,
		source,
		field,
		slot,
		element: id,
		via: [{ kind: "jsx", source, element: id, replaced: false }],
	});
	return {
		id,
		source,
		kind: "jsx",
		type: { value: "section", origin: origin("type", "type") },
		key: { value: null, origin: origin("key", "key") },
		fields: Object.fromEntries(
			Object.entries(fields).map(([name, value]) => [name, { value, origin: origin(name, "prop") }]),
		),
	};
}
async function fixture() {
	const { root } = makeProject(makeTempDir());
	const source =
		'import {memo} from "react";const Leaf=memo(function Leaf({children}){return children},()=>true);export default function Frame(){return <Leaf><section className="opacity-50"/></Leaf>}';
	writeFrame(root, "home", source);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("missing compiled publication");
	const call = `frames/home/frame.tsx:1:${source.indexOf("<Leaf>") + 1}`;
	const leaf = `frames/home/frame.tsx:1:${source.indexOf("<section") + 1}`;
	const rendered = snapshot(11, call, { children: { kind: "element", id: 10 } });
	const selection: Selection = {
		generation: "1",
		occurrence: "leaf",
		source: leaf,
		values: snapshot(10, leaf, { className: "opacity-75" }),
		chain: [
			{
				source: call,
				occurrence: "memo",
				passedChild: false,
				retainedProps: true,
				renderedSource: call,
				values: snapshot(21, call, { children: { kind: "element", id: 20 } }),
				renderedValues: rendered,
			},
		],
	};
	const sources = new Sources(root, compilation);
	sources.read("frames/home/frame.tsx");
	return { root, compilation, selection, rendered, sources };
}

it("keeps exact committed children transport separate from fresh literal equality and inverse ownership", async () => {
	const f = await fixture();
	const operation = { kind: "property", property: "opacity", scope: "" } as const;
	expect(sourceRead(f.sources, f.selection, operation)).toMatchObject({
		expected: "opacity-50",
		source: f.selection.source,
	});
	const original: SourceOccurrence = {
		publication: f.compilation.packet.id,
		cell: f.selection.source,
		occurrence: "leaf",
		invocation: "memo",
		value: "opacity-75",
		field: "className",
		provenance: JSON.stringify(f.selection),
		context: JSON.stringify({ path: [], native: { direction: "ltr", writingMode: "horizontal-tb" } }),
	};
	expect(() => resolvePropertySource(f.root, f.compilation, original, 1, operation)).toThrow(
		"differs from its original source literal",
	);
	const cell = Object.entries(f.compilation.cells).find(
		([, cell]) => cell.source === f.selection.source && cell.field === "className",
	)?.[0];
	if (!cell) throw new Error("missing original class cell");
	expect(resolvePropertySource(f.root, f.compilation, original, 1, operation, { kind: "inverse", cell }).cellKey).toBe(
		cell,
	);
});

it.each(["another element", "another source", "another field", "replaced field", "missing render"])(
	"refuses retained children from %s",
	async (change) => {
		const f = await fixture();
		const field = f.rendered.fields.children!;
		if (change === "another element") field.value = { kind: "element", id: 20 };
		if (change === "another source") field.origin.source = "frames/home/frame.tsx:1:1";
		if (change === "another field") field.origin.field = "content";
		if (change === "replaced field") field.origin.via[0]!.replaced = true;
		if (change === "missing render") delete f.selection.chain[0]!.renderedValues;
		expect(() => sourceRead(f.sources, f.selection, { kind: "property", property: "opacity", scope: "" })).toThrow(
			"children passthrough",
		);
	},
);
