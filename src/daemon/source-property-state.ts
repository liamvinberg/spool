import { relative } from "node:path";
import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyExpectation } from "../source-property";
import { realDesignDir } from "./design-path";
import { lowerLiterals, type RetainedCompilation, type SourceInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { propertyConsumers } from "./source-property-dependencies";

/** Read the same retained class cell from a proposed or acknowledged source snapshot. */
export async function propertyState(
	root: string,
	compilation: RetainedCompilation,
	inputs: ReadonlyMap<string, SourceInput>,
	file: string,
	source: string,
	cellKey: string,
	operation: Extract<SourceOperation, { kind: "property" }>,
	environment: SourcePropertyEnvironment,
	roots: ReadonlySet<string>,
	scopePaths: SourcePropertyExpectation["scopePaths"],
) {
	const path = relative(realDesignDir(root), file);
	const lowered = lowerLiterals(path, source);
	if (lowered.shape !== compilation.shapes[path])
		throw new Error("the property owner or executable source role changed");
	const cell = lowered.cells[cellKey];
	if (cell?.field !== "className") throw new Error("the original class source cell is no longer present");
	const certificate = await compilePropertySource(root, inputs, cell.value, compilation.packet.bundledCss);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: operation.scope,
		className: cell.value,
		absent: cell.absent === true,
		scopePaths,
		effects: propertyConsumers(certificate, roots, environment),
		css: certificate.css,
	};
	return { certificate, expected };
}
