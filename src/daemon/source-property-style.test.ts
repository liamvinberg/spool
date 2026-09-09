import { describe, expect, it } from "vitest";
import type { ValueSnapshot } from "../runtime/source-values";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { type Selection, Sources, sourceRead } from "./source-origins";
import {
	planStyleLiteral,
	planStyleMembers,
	type StyleMember,
	styleMemberEffects,
	styleMemberKey,
	styleMemberProperty,
} from "./source-property-style";

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

it("carries the proven literal members beside the class the element also has", async () => {
	const f = await fixture();
	const proven = f.members.map((member) => ({ ...member, enumerable: true }));
	for (const property of ["color", "background-color", "opacity", "font-weight"])
		expect(sourceRead(f.sources, f.selection, { kind: "property", property, scope: "" })).toMatchObject({
			slot: "class",
			expected: "text-red-500",
			style: { members: proven },
		});
	expect(sourceRead(f.sources, f.selection, { kind: "properties" })).toMatchObject({ style: { members: proven } });
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

describe("literal inline members as native effects", () => {
	it("gives each member its own declaration, with React's own numeric meaning", () => {
		expect(
			styleMemberEffects([
				{ key: "padding", value: 4, enumerable: true },
				{ key: "paddingLeft", value: "1rem", enumerable: true },
				{ key: "opacity", value: 0.5, enumerable: true },
				{ key: "marginTop", value: 0, enumerable: true },
				{ key: "--brand", value: "#123456", enumerable: true },
				{ key: "WebkitLineClamp", value: 3, enumerable: true },
			]),
		).toEqual([
			{ owner: "padding", path: [], property: "padding", value: "4px", important: false },
			{ owner: "paddingLeft", path: [], property: "padding-left", value: "1rem", important: false },
			{ owner: "opacity", path: [], property: "opacity", value: "0.5", important: false },
			{ owner: "marginTop", path: [], property: "margin-top", value: "0", important: false },
			{ owner: "--brand", path: [], property: "--brand", value: "#123456", important: false },
			{ owner: "WebkitLineClamp", path: [], property: "-webkit-line-clamp", value: "3", important: false },
		]);
	});

	it("keeps a logical member logical, so the writing context maps it once", () => {
		expect(styleMemberEffects([{ key: "paddingInlineStart", value: 8, enumerable: true }])).toEqual([
			{ owner: "paddingInlineStart", path: [], property: "padding-inline-start", value: "8px", important: false },
		]);
	});

	it("drops a member React itself would not declare", () => {
		expect(styleMemberEffects([{ key: "padding", value: "", enumerable: true }])).toEqual([]);
	});

	it.each([
		["an important marker", { key: "padding", value: "4px !important" }],
		["a member React never enumerates", { key: "padding", value: 4, enumerable: false }],
	])("refuses %s", (_name, member) => {
		expect(() => styleMemberEffects([{ enumerable: true, ...member }])).toThrow();
	});
});

describe("the member key a declaration is spelled with", () => {
	it.each([
		["opacity", "opacity"],
		["padding-left", "paddingLeft"],
		["-webkit-line-clamp", "WebkitLineClamp"],
		["-ms-grid-row", "msGridRow"],
		["--brand", "--brand"],
	])("spells %s as %s, and reads it back", (property, key) => {
		expect(styleMemberKey(property)).toBe(key);
		expect(styleMemberProperty(key)).toBe(property);
	});
});

describe("planning one member change", () => {
	const members: StyleMember[] = [
		{ key: "padding", value: 4, enumerable: true },
		{ key: "opacity", value: 0.5, enumerable: true },
	];

	it("changes the member that already spells the property, keeping its numeric form", () => {
		expect(planStyleMembers(members, "opacity", ["opacity"], "0.25")).toEqual([
			{ key: "padding", value: 4, enumerable: true },
			{ key: "opacity", value: 0.25, enumerable: true },
		]);
	});

	it("overrides one side after the shorthand that owns it, in the shorthand's own form", () => {
		expect(planStyleMembers(members, "padding-left", ["padding"], "12px")).toEqual([
			...members,
			{ key: "paddingLeft", value: 12, enumerable: true },
		]);
	});

	it("keeps a quoted value quoted when the authored member is a string", () => {
		expect(
			planStyleMembers([{ key: "padding", value: "1rem", enumerable: true }], "padding", ["padding"], "2rem"),
		).toEqual([{ key: "padding", value: "2rem", enumerable: true }]);
	});

	it("removes the member itself, and nothing else", () => {
		expect(planStyleMembers(members, "opacity", ["opacity"], null)).toEqual([members[0]]);
	});

	it("refuses removing a side the shorthand still declares", () => {
		expect(() => planStyleMembers(members, "padding-left", ["padding"], null)).toThrow(/shorthand/);
	});
});

describe("writing the member back into its object literal", () => {
	const source = 'export function L(){return <b style={{padding: 4, opacity: 0.5}} className="p-2">x</b>}';
	const target = {
		address: { file: "f.tsx", start: source.indexOf("<b"), end: source.indexOf("</b>") + 4 },
		source: "f.tsx:1:1",
		role: "definition",
		slot: "attribute",
		attribute: "style",
		expected: "",
		scope: "",
		repeated: false,
	} as const;
	const before: StyleMember[] = [
		{ key: "padding", value: 4, enumerable: true },
		{ key: "opacity", value: 0.5, enumerable: true },
	];
	const written = (after: readonly StyleMember[]) => {
		let text = source;
		for (const patch of [...planStyleLiteral(source, target.address, before, after)].sort(
			(a, b) => b.start - a.start,
		))
			text = text.slice(0, patch.start) + patch.text + text.slice(patch.end);
		return text;
	};

	it("replaces only the changed member's value", () => {
		expect(written([before[0]!, { key: "opacity", value: 0.25, enumerable: true }])).toBe(
			source.replace("0.5", "0.25"),
		);
	});

	it("appends a new member after the ones already written", () => {
		expect(written([...before, { key: "paddingLeft", value: 12, enumerable: true }])).toBe(
			source.replace("opacity: 0.5", "opacity: 0.5, paddingLeft: 12"),
		);
	});

	it("removes a member with the separator that carried it", () => {
		expect(written([before[0]!])).toBe(source.replace(", opacity: 0.5", ""));
	});

	it("refuses when the authored members no longer match the original read", () => {
		expect(() => planStyleLiteral(source.replace("4", "6"), target.address, before, before)).toThrow();
	});
});

describe("writing the member back through a factory call", () => {
	const source = 'import {createElement as h} from "react";const e = h("b", {style: {padding: 4}, className: "p-2"});';
	const before: StyleMember[] = [{ key: "padding", value: 4, enumerable: true }];
	const target = {
		address: { file: "f.tsx", start: source.indexOf('h("b"'), end: source.length - 1 },
		source: "f.tsx:1:1",
		role: "definition",
		slot: "attribute",
		attribute: "style",
		expected: "",
		scope: "",
		repeated: false,
		syntax: "react-call",
	} as const;

	it("replaces the member inside the call's own config", () => {
		const patches = planStyleLiteral(source, target.address, before, [
			{ key: "padding", value: 12, enumerable: true },
		]);
		expect(patches).toEqual([{ start: source.indexOf("4"), end: source.indexOf("4") + 1, text: "12" }]);
	});

	it("refuses a style object that is not this call's own literal", () => {
		const aliased = source.replace("{padding: 4}", "styles.box");
		expect(() => planStyleLiteral(aliased, target.address, before, before)).toThrow();
	});
});
