import { relative } from "node:path";
import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyExpectation } from "../source-property";
import type { SourcePropertyGroupExpectation } from "../source-property-group";
import { realDesignDir } from "./design-path";
import { lowerLiterals, type RetainedCompilation, type SourceInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { nativePropertyEffects } from "./source-property-dependencies";

/** Read the same retained class cell from a proposed or acknowledged source snapshot. */
export async function propertyState(
	root: string,
	compilation: RetainedCompilation,
	inputs: ReadonlyMap<string, SourceInput>,
	file: string,
	source: string,
	cellKey: string,
	operation: Extract<SourceOperation, { kind: "property" | "properties" }>,
	environment: SourcePropertyEnvironment,
	roots: ReadonlySet<string>,
	scopePaths: SourcePropertyExpectation["scopePaths"],
	selections?: SourcePropertyGroupExpectation["selections"],
) {
	const path = relative(realDesignDir(root), file);
	const lowered = lowerLiterals(path, source);
	if (lowered.shape !== compilation.shapes[path])
		throw new Error("the property owner or executable source role changed");
	const cell = lowered.cells[cellKey];
	if (cell?.field !== "className") throw new Error("the original class source cell is no longer present");
	const certificate = await compilePropertySource(root, inputs, cell.value, compilation.packet.bundledCss);
	const common = { className: cell.value, absent: cell.absent === true, css: certificate.css };
	let expected: SourcePropertyExpectation | SourcePropertyGroupExpectation;
	if (operation.kind === "property") {
		expected = {
			...common,
			kind: "property",
			property: operation.property,
			scope: operation.scope,
			scopePaths,
			effects: nativePropertyEffects(certificate, roots, environment),
		};
	} else {
		if (!selections) throw new Error("the grouped property selections are missing");
		expected = {
			...common,
			kind: "properties",
			selections: selections.map((selection) => ({
				...selection,
				effects: nativePropertyEffects(certificate, new Set(selection.roots), environment),
			})),
		};
	}
	return { certificate, expected };
}
