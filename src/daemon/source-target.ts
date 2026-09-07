import { relative } from "node:path";
import type { SourceOccurrence } from "../source-edit";
import { realDesignDir } from "./design-path";
import type { RetainedCompilation } from "./retained-compile";
import { type Selection, Sources, sourceRead } from "./source-origins";

/** Resolve the selected committed field against the original compiler snapshot. */
export function resolveTextSource(
	root: string,
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
) {
	let cellKey = original.cell;
	let target: ReturnType<typeof sourceRead> | undefined;
	if (original.provenance && !compilation.cells[original.cell]) {
		const sources = new Sources(root, compilation);
		for (const input of compilation.inputs.keys())
			if (/\.[cm]?[jt]sx?$/.test(input)) sources.read(relative(realDesignDir(root), input));
		const selection = JSON.parse(original.provenance) as Selection;
		target = sourceRead(sources, { ...selection, generation: String(generation) }, { kind: "text" });
		for (const unit of sources.revisions.values())
			if (!compilation.inputs.has(unit.file))
				throw new Error("the committed origin is outside captured compiler inputs");
		const field = target.syntax === "react-call" ? (target.attribute ?? "children") : target.attribute;
		const found = Object.entries(compilation.cells).find(
			([, cell]) => cell.source === target?.source && cell.field === field,
		);
		if (!found) throw new Error("the committed literal has no retained source cell");
		cellKey = found[0];
	}
	const cell = compilation.cells[cellKey];
	if (!cell || cell.value !== original.value) throw new Error("the selected words have no proven literal source");
	return { cellKey, cell, target };
}
