import { expect, it } from "vitest";
import { lowerLiterals } from "./retained-compile";
import { applySourcePatches } from "./source-patches";
import { reorderPatches } from "./source-structure-reorder";
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
