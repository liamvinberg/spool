import { expect, it } from "vitest";
import { lowerLiterals } from "./retained-compile";

it.each([
	["jsx", 'export default function Frame(){return <h1 className="text-red-500">Words</h1>}'],
	[
		"factory",
		'import {createElement} from "react"; export default function Frame(){return createElement("h1",{className:"text-red-500"},"Words")}',
	],
])("retains %s class values while keeping executable shape independent of the literal", (_name, source) => {
	const before = lowerLiterals("frames/home/frame.tsx", source);
	const after = lowerLiterals("frames/home/frame.tsx", source.replace("text-red-500", "text-blue-500"));
	const classes = Object.entries(before.cells).filter(([, cell]) => cell.field === "className" && !cell.absent);
	expect(classes).toHaveLength(1);
	const [key, cell] = classes[0]!;
	expect(cell.value).toBe("text-red-500");
	expect(after.cells[key]?.value).toBe("text-blue-500");
	expect(after.shape).toBe(before.shape);
	expect(before.code).toContain(JSON.stringify(key));
});

it("retains absent native classes without admitting expressions, duplicate attributes or spreads", () => {
	const source =
		'export default function Frame(){const extra={};return <main><p id="empty">Words</p><p className={String("x")}>Expression</p><p className="a" className="b">Duplicate</p><p {...extra}>Spread</p></main>}';
	const before = lowerLiterals("frames/home/frame.tsx", source);
	const cells = Object.values(before.cells).filter((cell) => cell.field === "className");
	expect(cells).toHaveLength(2);
	expect(cells.every((cell) => cell.absent === true)).toBe(true);
	const after = lowerLiterals(
		"frames/home/frame.tsx",
		source.replace('id="empty"', 'id="empty" className="text-red-500"'),
	);
	expect(after.shape).toBe(before.shape);
	expect(Object.values(after.cells).filter((cell) => cell.field === "className" && !cell.absent)).toHaveLength(1);
});

it("retains each direct literal style member as its own source cell", () => {
	const source =
		'export default function Frame(){return <h1 style={{fontWeight:550,padding:4}} className="text-red-500">Words</h1>}';
	const before = lowerLiterals("frames/home/frame.tsx", source);
	const members = Object.entries(before.cells).filter(([, cell]) => cell.field?.startsWith("style:"));
	expect(members.map(([, cell]) => [cell.field, cell.value])).toEqual([
		["style:fontWeight", "550"],
		["style:padding", "4"],
	]);
	// the member's value reaches a running use through the packet, the way a
	// class literal does, so its executable shape does not depend on the value
	for (const [key] of members) expect(before.code).toContain(`StyleValue(${JSON.stringify(key)},`);
	expect(lowerLiterals("frames/home/frame.tsx", source.replace("550", "551")).shape).toBe(before.shape);
	expect(lowerLiterals("frames/home/frame.tsx", source.replace("550", "551")).cells[members[0]![0]]?.value).toBe(
		"551",
	);
});

it.each([
	"{...unknown}",
	"{get fontWeight(){return 550}}",
	"new Proxy({}, {})",
	"{fontWeight:weight}",
	"{fontWeight:550,fontWeight:600}",
	"{__proto__:null}",
])("does not inspect or mark an unknown style object: %s", (value) => {
	const source = `export default function Frame(){return <h1 style={${value}} className="text-red-500">Words</h1>}`;
	expect(lowerLiterals("frames/home/frame.tsx", source).code).not.toMatch(/Style\(/);
});

it("retains a factory config's style members the same way a JSX attribute's are", () => {
	const source =
		'import {createElement} from "react"; export default function Frame(){return createElement("h1",{style:{padding:4},className:"text-red-500"},"Words")}';
	const before = lowerLiterals("frames/home/frame.tsx", source);
	const members = Object.entries(before.cells).filter(([, cell]) => cell.field?.startsWith("style:"));
	expect(members.map(([, cell]) => [cell.field, cell.value])).toEqual([["style:padding", "4"]]);
	for (const [key] of members) expect(before.code).toContain(`StyleValue(${JSON.stringify(key)},`);
	// a member's value reaches the running use through the packet here too, so
	// the executable shape does not follow it
	expect(lowerLiterals("frames/home/frame.tsx", source.replace("padding:4", "padding:6")).shape).toBe(before.shape);
});
