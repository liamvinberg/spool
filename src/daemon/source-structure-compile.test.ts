import { expect, it } from "vitest";
import { lowerLiterals } from "./retained-compile";

it("retains keyed siblings by authored identity when an earlier sibling is removed", () => {
	const before = lowerLiterals(
		"frame.tsx",
		'export default function Frame(){return <main><button key="a">A</button><button key="b">B</button></main>}',
	);
	const after = lowerLiterals(
		"frame.tsx",
		'export default function Frame(){return <main><button key="b">B</button></main>}',
	);
	expect(after.shape).toBe(before.shape);
	const b = Object.entries(before.cells).find(([, cell]) => cell.value === "B");
	expect(b).toBeDefined();
	expect(after.cells[b![0]]?.value).toBe("B");
	expect(Object.values(before.structure.lists)).toContainEqual(["a", "b"]);
	expect(Object.values(after.structure.lists)).toContainEqual(["b"]);
	for (const [key, shape] of Object.entries(after.structure.factories))
		expect(before.structure.factories[key]).toBe(shape);
});

it("retains the named slot and condition while replacing only their supplied element with null", () => {
	for (const [before, after] of [
		["<Slot header={<button>A</button>}/>", "<Slot header={null}/>"],
		["<main>{condition?<button>A</button>:<i>B</i>}</main>", "<main>{condition?null:<i>B</i>}</main>"],
	]) {
		const a = lowerLiterals("frame.tsx", `export default function Frame(){return ${before}}`);
		const b = lowerLiterals("frame.tsx", `export default function Frame(){return ${after}}`);
		expect(b.shape).toBe(a.shape);
		expect(Object.values(a.structure.optional)).toContain(true);
		expect(Object.values(b.structure.optional)).toContain(false);
	}
});

it("records changed surviving executable payload separately from membership", () => {
	const a = lowerLiterals(
		"frame.tsx",
		'export default function Frame(){return <main><Button key="a" onClick={first}/><Button key="b" onClick={second}/></main>}',
	);
	const b = lowerLiterals(
		"frame.tsx",
		'export default function Frame(){return <main><Button key="b" onClick={different}/></main>}',
	);
	expect(b.shape).toBe(a.shape);
	const key = Object.keys(b.structure.factories)[0]!;
	expect(b.structure.factories[key]).not.toBe(a.structure.factories[key]);
});

it("lowers structural parents with authored attributes and expression children", () => {
	for (const body of [
		'<main title="parent"><button key="a">A</button><button key="b">B</button></main>',
		'<main>{flag?<button key="a">A</button>:null}<button key="b">B</button></main>',
		'<main>{createElement(Button,{key:"a"})}<Button key="b"/></main>',
		"<Slot header={null}/>",
	]) {
		const lowered = lowerLiterals("frame.tsx", `export default function Frame(){return ${body}}`);
		expect(lowered.code).toContain('from "spool/jsx-dev-runtime"');
		expect(Object.keys(lowered.structureOwners).length).toBeGreaterThan(0);
	}
});

it("keeps authored comments outside canonical rendered membership", () => {
	const before =
		'export default function Frame(){return <main>{/* before */}<button key="a">A</button>{/* between */}<button key="b">B</button>{/* after */}</main>}';
	const after = before.replace('<button key="a">A</button>', "");
	const original = lowerLiterals("frame.tsx", before);
	const removed = lowerLiterals("frame.tsx", after);
	expect(removed.shape).toBe(original.shape);
	expect(Object.values(original.structure.lists)).toContainEqual(["a", "b"]);
	expect(Object.values(removed.structure.lists)).toContainEqual(["b"]);
	const b = Object.entries(original.cells).find(([, cell]) => cell.value === "B")!;
	expect(removed.cells[b[0]]?.value).toBe("B");
});

it("keeps empty canonical parents compatible with literal text and last-child deletion", () => {
	const compile = (children: string) =>
		lowerLiterals("frame.tsx", `export default function Frame(){return <main>${children}</main>}`);
	const empty = compile("");
	const text = compile('{"next"}');
	const child = compile('<button key="only">Only</button>');
	expect(empty.shape).toBe(text.shape);
	expect(empty.shape).toBe(child.shape);
	expect(Object.values(empty.structure.lists)).toContainEqual([]);
	expect(Object.values(child.structure.lists)).toContainEqual(["only"]);
	expect(Object.values(empty.cells).find((cell) => cell.field === undefined)?.childValue).toBe(null);
	expect(Object.values(text.cells).find((cell) => cell.field === undefined)?.childValue).toBe("next");
});
