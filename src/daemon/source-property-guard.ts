import type { SourcePropertyEffect, SourcePropertyEnvironment } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { changedPropertyKeys, externalPropertySignature, propertyDependencies } from "./source-property-dependencies";

/** Both the removed and the chosen binding contribute original read dependencies. */
export function propertyReadKeys(
	before: PropertyCertificate,
	after: PropertyCertificate,
	roots: ReadonlySet<string>,
	environment: SourcePropertyEnvironment,
): ReadonlySet<string> {
	return new Set([
		...roots,
		...propertyDependencies(before, roots, environment),
		...propertyDependencies(after, roots, environment),
		"direction",
		"writing-mode",
	]);
}

/** Validate every acknowledged state, even when a later edit puts the bytes back. */
export function guardPropertyEffects(
	before: PropertyCertificate,
	after: PropertyCertificate,
	keys: ReadonlySet<string>,
	environment: SourcePropertyEnvironment,
	frameBefore: readonly SourcePropertyEffect[],
	frameAfter: readonly SourcePropertyEffect[],
): void {
	// Every acknowledged state is guarded whole: this read owns no token another
	// operation may change underneath it.
	if (
		externalPropertySignature(before, keys, [], environment) !==
		externalPropertySignature(after, keys, [], environment)
	)
		throw new Error("another operation changed a property binding, consumer or revealed default");
	const changed = changedPropertyKeys(frameBefore, frameAfter, environment);
	if ([...changed].some((key) => keys.has(key)))
		throw new Error("another operation changed the property's captured native context");
}
