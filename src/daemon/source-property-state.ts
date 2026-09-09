import { relative } from "node:path";
import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyExpectation } from "../source-property";
import type { SourcePropertyGroupExpectation } from "../source-property-group";
import { realDesignDir } from "./design-path";
import { lowerLiterals, type RetainedCompilation, type SourceInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { nativePropertyEffects } from "./source-property-dependencies";
import { propertyKeys } from "./source-property-effects";
import { nativeConsumerEffects } from "./source-property-observation";
import { type StyleMember, styleMemberEffects } from "./source-property-style";

/** The class cell a property read owns, and what that read selected inside it. */
export interface PropertyContext {
	root: string;
	inputs: ReadonlyMap<string, SourceInput>;
	file: string;
	cellKey: string;
	operation: Extract<SourceOperation, { kind: "property" | "properties" }>;
	environment: SourcePropertyEnvironment;
	roots: ReadonlySet<string>;
	scopePaths: SourcePropertyExpectation["scopePaths"];
	selections?: SourcePropertyGroupExpectation["selections"] | undefined;
	/** The element's own members for this state, when an inline member owns the write. */
	style?: readonly StyleMember[] | undefined;
}

/** Read the same retained class cell from a proposed or acknowledged source snapshot. */
export async function propertyState(
	context: PropertyContext,
	snapshot: { compilation: RetainedCompilation; source: string },
) {
	const { root, inputs, file, cellKey, operation, environment, roots, scopePaths, selections, style } = context;
	const { compilation, source } = snapshot;
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
			// The class keeps its own effects; the element's members are declarations
			// of their own, and the selected roots are where the two meet.
			effects: [
				...nativePropertyEffects(certificate, roots, environment),
				...(style
					? styleMemberEffects(style).filter((effect) =>
							propertyKeys(effect.property, environment).some((key) => roots.has(key)),
						)
					: []),
			],
		};
	} else {
		if (!selections) throw new Error("the grouped property selections are missing");
		expected = {
			...common,
			kind: "properties",
			selections: selections.map((selection) => ({
				...selection,
				effects: nativePropertyEffects(certificate, new Set(selection.roots), environment),
				observations: selection.observations.map((observation) => ({
					...observation,
					effects: nativeConsumerEffects(certificate, observation.property, environment),
				})),
			})),
		};
	}
	return { certificate, expected };
}
