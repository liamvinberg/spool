import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyNative, SourcePropertyReading } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { readPropertyEffects } from "./source-property-effects";

/** Binding identity comes from the captured compiler, never equality with native pixels. */
export function propertyReading(
	certificate: PropertyCertificate,
	operation: Extract<SourceOperation, { kind: "property" }>,
	environment: SourcePropertyEnvironment,
	native?: SourcePropertyNative,
): SourcePropertyReading {
	const { effects, owners } = readPropertyEffects(certificate, operation.property, operation.scope, environment);
	const values = [...new Set(effects.map((effect) => effect.value))];
	let binding: SourcePropertyReading["binding"] = { kind: "mixed" };
	if (!owners.length) binding = { kind: "page" };
	else if (values.length === 1) {
		const value = values[0]!;
		const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
		const token = reference ? certificate.theme[reference] : undefined;
		if (reference) binding = { kind: "reference", name: reference, ...(token ? { value: token.value } : {}) };
		else if (!value.includes("var(")) binding = { kind: "custom" };
	}
	return { tokens: owners, binding, ...(native?.property === operation.property ? { native: native.value } : {}) };
}
