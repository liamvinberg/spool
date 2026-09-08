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

it("observes direct literal style descriptors without lowering their members into source cells", () => {
	const source =
		'export default function Frame(){return <h1 style={{fontWeight:550,padding:4}} className="text-red-500">Words</h1>}';
	const before = lowerLiterals("frames/home/frame.tsx", source);
	expect(before.code).toContain("Style({fontWeight:550,padding:4})");
	expect(Object.values(before.cells).some((cell) => cell.field === "style")).toBe(false);
	expect(lowerLiterals("frames/home/frame.tsx", source.replace("550", "551")).shape).not.toBe(before.shape);
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
