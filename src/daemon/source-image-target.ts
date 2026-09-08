import { relative } from "node:path";
import type { SourceOccurrence } from "../source-edit";
import { realDesignDir } from "./design-path";
import type { RetainedCompilation } from "./retained-compile";
import { type Selection, Sources, sourceRead } from "./source-origins";

/** Import identity comes from the original compiler snapshot, never matching pixels. */
export function resolveImageSource(
	root: string,
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
	inverseCell?: string,
) {
	if (original.field !== "src" || !original.provenance) throw new Error("the image has no committed import origin");
	const sources = new Sources(root, compilation);
	for (const input of compilation.inputs.keys())
		if (/\.[cm]?[jt]sx?$/.test(input)) sources.read(relative(realDesignDir(root), input));
	const selection = JSON.parse(original.provenance) as Selection;
	const target = sourceRead(sources, { ...selection, generation: String(generation) }, { kind: "asset" });
	for (const unit of sources.revisions.values())
		if (!compilation.inputs.has(unit.file)) throw new Error("the image origin is outside captured compiler inputs");
	const entry = Object.entries(compilation.cells).find(([, cell]) => cell.source === target.source && cell.image);
	if (!entry) throw new Error("the original image binding has no retained source cell");
	const [cellKey, cell] = entry;
	if (cell.value !== original.value && inverseCell !== cellKey)
		throw new Error("the committed image differs from its original imported bytes");
	if ((cell.absent === true) !== (original.absent === true) && inverseCell !== cellKey)
		throw new Error("the image source presence changed");
	if (
		target.asset &&
		(target.asset.identifier !== cell.image?.identifier || target.asset.specifier !== cell.image?.specifier)
	)
		throw new Error("the image import binding changed");
	return { cellKey, cell, target };
}

/** The unchanged executable tree may still hide a changed image import or call argument.
 * Recheck those captured inputs while allowing unrelated source spans to move locations. */
export function assertImageContext(
	before: RetainedCompilation,
	current: RetainedCompilation,
	original: SourceOccurrence,
	cellKey: string,
): void {
	if (before.packet.shape !== current.packet.shape) throw new Error("the original image executable context changed");
	const previous = before.cells[cellKey];
	const next = current.cells[cellKey];
	const same = (a: typeof previous, b: typeof next) =>
		!!a &&
		!!b &&
		a.file === b.file &&
		a.owner === b.owner &&
		a.field === b.field &&
		a.value === b.value &&
		(a.absent === true) === (b.absent === true) &&
		JSON.stringify(a.image) === JSON.stringify(b.image);
	if (!previous?.image || !same(previous, next)) throw new Error("the original image import binding changed");
	const ancestry = new Set([previous.source]);
	const collect = (value: unknown): void => {
		if (!value || typeof value !== "object") return;
		for (const [key, child] of Object.entries(value)) {
			if (key === "source" && typeof child === "string") ancestry.add(child);
			else collect(child);
		}
	};
	if (original.provenance) collect(JSON.parse(original.provenance));
	for (const [key, cell] of Object.entries(before.cells))
		if (ancestry.has(cell.source) && !same(cell, current.cells[key]))
			throw new Error("an input in the original image call ancestry changed");
}
