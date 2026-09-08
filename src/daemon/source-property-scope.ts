import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { readPropertyEffects } from "./source-property-effects";

/** Keep the selected compiler conditions even when removal leaves no authored effect. */
export function propertyScopePaths(
	before: PropertyCertificate,
	after: PropertyCertificate,
	operation: Extract<SourceOperation, { kind: "property" }>,
	environment: SourcePropertyEnvironment,
): readonly (readonly string[])[] {
	const paths = new Map<string, readonly string[]>();
	for (const certificate of [before, after])
		for (const effect of readPropertyEffects(certificate, operation.property, operation.scope, environment).effects)
			paths.set(JSON.stringify(effect.path), effect.path);
	return [...paths.values()];
}
