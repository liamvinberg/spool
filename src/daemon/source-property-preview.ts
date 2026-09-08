import type { SourcePropertyEffect } from "../source-property";
import { propertyInputs } from "./source-property-effects";

/** Native syntax checks for a compiler-owned temporary value, without changing its consumer closure. */
export function propertyPreviewDeclarations(effects: readonly SourcePropertyEffect[], placeholder: string) {
	const declarations: { property: string; value: string }[] = [];
	for (const effect of effects) {
		if (!effect.value.includes(placeholder)) continue;
		if (!effect.property.startsWith("--")) {
			declarations.push({ property: effect.property, value: effect.value });
			continue;
		}
		// A filter/transform component carries its own function grammar. Validate
		// that function as a native consumer, retaining all other functions in CSS.
		const wrapped = /^([a-zA-Z][\w-]*)\((.*)\)$/.exec(effect.value);
		if (wrapped?.[2] !== placeholder) continue;
		for (const consumer of effects) {
			if (!["filter", "backdrop-filter", "transform"].includes(consumer.property)) continue;
			if (!propertyInputs(consumer).includes(effect.property)) continue;
			declarations.push({ property: consumer.property, value: effect.value });
		}
	}
	return declarations.filter(
		(declaration, index) =>
			declarations.findIndex(
				(other) => other.property === declaration.property && other.value === declaration.value,
			) === index,
	);
}
