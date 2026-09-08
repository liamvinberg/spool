import { expect, it } from "vitest";
import type { ValueSnapshot } from "../runtime/source-values";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { type Selection, Sources, sourceRead } from "./source-origins";

async function fixture() {
	const { root } = makeProject(makeTempDir());
	const text =
		'export default function Frame(){return <h1 style={{fontWeight:550,padding:4}} className="text-red-500">Hello</h1>}';
	writeFrame(root, "home", text);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("missing immutable compilation");
	const source = `frames/home/frame.tsx:1:${text.indexOf("<h1") + 1}`;
	const origin = (field: string, slot: "prop" | "type" | "key") => ({
		kind: "jsx" as const,
		source,
		field,
		slot,
		element: 1,
		via: [{ kind: "jsx" as const, source, element: 1, replaced: false }],
	});
	const members = [
		{ key: "fontWeight", value: 550, enumerable: true },
		{ key: "padding", value: 4, enumerable: true },
	];
	const values: ValueSnapshot = {
		id: 1,
		source,
		kind: "jsx",
		type: { value: "h1", origin: origin("type", "type") },
		key: { value: null, origin: origin("key", "key") },
		fields: {
			className: { value: "text-red-500", origin: origin("className", "prop") },
			style: { value: { kind: "style-members", members }, origin: origin("style", "prop") },
			children: { value: "Hello", origin: origin("children", "prop") },
		},
	};
	const selection: Selection = { generation: "1", occurrence: "native-host", source, values, chain: [] };
	const sources = new Sources(root, compilation);
	sources.read("frames/home/frame.tsx");
	return { sources, selection, members };
}

it("uses proven literal style members only as independent color and opacity context", async () => {
	const f = await fixture();
	for (const property of ["color", "background-color", "opacity"])
		expect(sourceRead(f.sources, f.selection, { kind: "property", property, scope: "" })).toMatchObject({
			slot: "class",
			expected: "text-red-500",
		});
	expect(() => sourceRead(f.sources, f.selection, { kind: "property", property: "font-weight", scope: "" })).toThrow(
		/inline style/,
	);
	expect(() => sourceRead(f.sources, f.selection, { kind: "properties" })).toThrow(/inline style/);
});

it.each(["value", "enumerability", "unobserved", "another owner"])(
	"refuses independent style context when its %s differs",
	async (mismatch) => {
		const f = await fixture();
		if (mismatch === "value") f.members[0]!.value = 700;
		if (mismatch === "enumerability") f.members[0]!.enumerable = false;
		if (mismatch === "unobserved") f.selection.values!.fields.style!.value = { kind: "object", id: 7 };
		if (mismatch === "another owner") f.selection.values!.fields.style!.origin.source = "frames/home/frame.tsx:1:1";
		expect(() => sourceRead(f.sources, f.selection, { kind: "property", property: "color", scope: "" })).toThrow();
	},
);
