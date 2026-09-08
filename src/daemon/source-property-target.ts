import { relative } from "node:path";
import { z } from "zod";
import { rowFor } from "../properties/rows";
import type { SourceOccurrence, SourceOperation } from "../source-edit";
import { realDesignDir } from "./design-path";
import type { RetainedCompilation } from "./retained-compile";
import { type Selection, Sources, sourceRead } from "./source-origins";

/** Class attribution is a property purpose, never a generic attribute write. */
export function resolvePropertySource(
	root: string,
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
	operation: Extract<SourceOperation, { kind: "property" }>,
	inverseCell?: string,
) {
	const row = rowFor(operation.property);
	if (!row || row.primitive === "read") throw new Error("this property has no supported control");
	if (original.field !== "className" || !original.provenance)
		throw new Error("this property has no committed class source observation");
	const { native: environment } = z
		.object({
			path: z.array(z.string()),
			native: z.object({ direction: z.enum(["ltr", "rtl"]), writingMode: z.string() }).strict(),
		})
		.strict()
		.parse(JSON.parse(original.context));
	const sources = new Sources(root, compilation);
	for (const input of compilation.inputs.keys())
		if (/\.[cm]?[jt]sx?$/.test(input)) sources.read(relative(realDesignDir(root), input));
	const selection = JSON.parse(original.provenance) as Selection;
	const previous = inverseCell ? compilation.cells[inverseCell] : undefined;
	const target = sourceRead(
		sources,
		{ ...selection, generation: String(generation) },
		operation,
		previous ? { kind: "inverse", source: previous.source, field: "className" } : undefined,
	);
	for (const unit of sources.revisions.values())
		if (!compilation.inputs.has(unit.file))
			throw new Error("the property origin is outside captured compiler inputs");
	const found = Object.entries(compilation.cells).find(
		([, cell]) => cell.source === target.source && cell.field === "className",
	);
	if (!found) throw new Error("the committed class has no retained source cell");
	const [cellKey, cell] = found;
	if (cell.value !== original.value && inverseCell !== cellKey)
		throw new Error("the committed class differs from its original source literal");
	return { cellKey, cell, target, environment };
}
