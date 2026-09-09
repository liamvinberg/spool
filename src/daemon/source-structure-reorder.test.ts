import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { lowerLiterals } from "./retained-compile";
import { type Selection, Sources } from "./source-origins";
import { applySourcePatches } from "./source-patches";
import { deriveSourceReorder, reorderPatches } from "./source-structure-reorder";
import { certifyStructuralChange } from "./source-structure-target";

const A = '<Button key="a" onClick={first}>A</Button>',
	B = '<Button key="b" onClick={second}>B</Button>',
	C = '<Button key="c" onClick={third}>C</Button>';
const source = `export default function Frame(){return <main>\n\t{/* between */}\n\t${A}\n\t${B}\n\t${C}\n</main>}`;

function siblings() {
	return [A, B, C].map((unit) => ({ start: source.indexOf(unit), end: source.indexOf(unit) + unit.length }));
}

it("swaps two authored siblings and leaves everything written between them where it was", () => {
	const moved = applySourcePatches(source, reorderPatches(source, siblings(), 0, 1)).text;
	expect(moved).toBe(source.replace(`${A}\n\t${B}`, `${B}\n\t${A}`));
	expect(moved).toContain("{/* between */}");
});

it("moves one unit past several siblings, keeping the others in their own order", () => {
	const moved = applySourcePatches(source, reorderPatches(source, siblings(), 2, 0)).text;
	expect(moved).toBe(source.replace(`${A}\n\t${B}\n\t${C}`, `${C}\n\t${A}\n\t${B}`));
});

it("writes nothing where the requested position is the one it already has", () => {
	expect(reorderPatches(source, siblings(), 1, 1)).toEqual([]);
});

it("changes canonical membership order alone, with every surviving payload identical", () => {
	const original = lowerLiterals("frame.tsx", source);
	const site = Object.keys(original.structure.lists)[0]!;
	const next = applySourcePatches(source, reorderPatches(source, siblings(), 0, 1)).text;
	const certified = certifyStructuralChange({ source: "frame.tsx:1:1", site, shape: original.shape }, source, next, {
		kind: "structure",
		site,
		state: original.structure,
	});
	expect(certified.before.lists[site]).toEqual(["a", "b", "c"]);
	expect(certified.after.lists[site]).toEqual(["b", "a", "c"]);
	expect(certified.after.factories).toEqual(certified.before.factories);
});

/** One committed observation of an authored child, built the way the frame's own observer would. */
function selectionAt(child: string): Selection {
	const origin = (field: string, slot: "prop" | "type" | "key") => ({
		kind: "jsx" as const,
		source: child,
		field,
		slot,
		element: 10,
		via: [{ kind: "jsx" as const, source: child, element: 10, replaced: false }],
	});
	return {
		generation: "1",
		occurrence: "child",
		source: child,
		values: {
			id: 10,
			source: child,
			kind: "jsx",
			type: { value: "section", origin: origin("type", "type") },
			key: { value: null, origin: origin("key", "key") },
			fields: {},
		},
		chain: [],
	};
}

async function derived(frameSource: string, at: string, steps: number) {
	const { root } = makeProject(makeTempDir());
	writeFrame(root, "home", frameSource);
	const compiler = createFrameCompiler("reorder-test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("missing compiled publication");
	const sources = new Sources(root, compilation);
	sources.read("frames/home/frame.tsx");
	const child = `frames/home/frame.tsx:1:${frameSource.indexOf(at) + 1}`;
	return () => deriveSourceReorder(sources, selectionAt(child), steps);
}

it("refuses a supplied value, which is a slot rather than one of a list", async () => {
	const move = await derived(
		"export default function Frame({show}){return <main>{show ? <section data-a/> : null}</main>}",
		"<section",
		1,
	);
	expect(move).toThrow(/supplied value rather than one of a list/);
});

it("refuses an only child, which has no sibling to move past", async () => {
	const move = await derived("export default function Frame(){return <main><section data-a/></main>}", "<section", 1);
	expect(move).toThrow(/no authored sibling to move past/);
});

it("explains stable keys, and the state two unkeyed siblings would exchange", async () => {
	const move = await derived(
		"export default function Frame(){return <main><section data-a/><section data-b/></main>}",
		"<section data-a",
		1,
	);
	expect(move).toThrow(/stable authored keys required/);
	expect(move).toThrow(/give each item a stable key of its own/);
});

it("explains the same for two siblings that share one key", async () => {
	const move = await derived(
		'export default function Frame(){return <main><section key="x" data-a/><section key="x" data-b/></main>}',
		"<section key",
		1,
	);
	expect(move).toThrow(/duplicate sibling keys/);
	expect(move).toThrow(/give each item a stable key of its own/);
});
