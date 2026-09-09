import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyNative, SourcePropertyReading } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { propertyInputs, readPropertyEffects } from "./source-property-effects";

/** Binding identity comes from the captured compiler, never equality with native pixels. */
export function propertyReading(
	certificate: PropertyCertificate,
	operation: Extract<SourceOperation, { kind: "property" }>,
	environment: SourcePropertyEnvironment,
	native?: SourcePropertyNative,
): SourcePropertyReading {
	const { effects, owners } = readPropertyEffects(certificate, operation.property, operation.scope, environment);
	const values = [...new Set(effects.map((effect) => effect.value))];
	const references = [...new Set(effects.flatMap(propertyInputs))];
	const reference = owners.length === 1 && references.length === 1 ? references[0] : undefined;
	const token = reference ? certificate.theme[reference] : undefined;
	let binding: SourcePropertyReading["binding"] = { kind: "mixed" };
	if (!owners.length) binding = { kind: "page" };
	// A compiler fallback and its supported branch can retain one source reference.
	else if (reference) binding = { kind: "reference", name: reference, ...(token ? { value: token.value } : {}) };
	else if (values.length === 1 && !values[0]!.includes("var(")) binding = { kind: "custom" };
	return {
		tokens: owners,
		binding,
		...(binding.kind === "custom" ? { authored: values[0]! } : {}),
		...(native?.property === operation.property ? { native: native.value } : {}),
	};
}
