import { expect, it } from "vitest";
import { lowerLiterals } from "./retained-compile";
import { certifyStructuralChange } from "./source-structure-target";

const A = '<Button key="a" onClick={first}>A</Button>',
	B = '<Button key="b" onClick={second}>B</Button>';
const source = `export default function Frame(){return <main>${A}${B}</main>}`;
function fixture() {
	const original = lowerLiterals("frame.tsx", source),
		site = Object.keys(original.structure.lists)[0]!;
	const target = { source: "frame.tsx:1:1", site, shape: original.shape };
	const expected = { kind: "structure" as const, site, state: original.structure };
	return { target, expected };
}
it("preserves independently transported comments and surviving literal edits", () => {
	const { target, expected } = fixture();
	const current = `// independent prefix\n${source.replace(">B<", ">Changed<")}`;
	const certified = certifyStructuralChange(target, current, current.replace(A, ""), expected);
	expect(certified.after.lists[target.site]).toEqual(["b"]);
});
it("refuses changed parent and surviving executable context before mutation", () => {
	const { target, expected } = fixture();
	for (const current of [
		source.replaceAll("main", "aside"),
		source.replace("second", "different"),
		source.replace(B, ""),
	])
		expect(() => certifyStructuralChange(target, current, current.replace(A, ""), expected)).toThrow(
			/original|surviving/,
		);
});
it("certifies inverse insertion against the exact acknowledged membership", () => {
	const { target, expected } = fixture();
	const removed = source.replace(A, "");
	const saved = certifyStructuralChange(target, source, removed, expected);
	const inverse = { ...expected, state: saved.after };
	expect(certifyStructuralChange(target, removed, source, inverse).after.lists[target.site]).toEqual(["a", "b"]);
	expect(() => certifyStructuralChange(target, source, source.replace("</main>", `${A}</main>`), inverse)).toThrow(
		/parent|position/,
	);
});
