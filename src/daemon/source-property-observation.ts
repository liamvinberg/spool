import type { SourcePropertyEffect, SourcePropertyEnvironment } from "../source-property";
import { anatomyOf } from "./class-write";
import type { PropertyCertificate } from "./source-property-compile";
import { propertyConsumers } from "./source-property-dependencies";
import { propertyInputs, propertyKeys } from "./source-property-effects";

/** A native consumer reads its captured inputs without acquiring their source ownership. */
export function nativeConsumerEffects(
	certificate: PropertyCertificate,
	property: string,
	environment: SourcePropertyEnvironment,
): SourcePropertyEffect[] {
	const effects = new Set(propertyConsumers(certificate, new Set(propertyKeys(property, environment)), environment));
	const inputs = new Set([...effects].flatMap(propertyInputs).filter((name) => name.startsWith("--tw-")));
	let growing = true;
	while (growing) {
		growing = false;
		for (const effect of certificate.effects) {
			if (effects.has(effect) || !inputs.has(effect.property)) continue;
			effects.add(effect);
			growing = true;
			for (const name of propertyInputs(effect)) if (name.startsWith("--tw-")) inputs.add(name);
		}
	}
	return certificate.effects.filter((effect) => effects.has(effect));
}

/** Every selected source root has a consumer proof, or remains an explicit unknown. */
export function propertyObservations(
	original: PropertyCertificate,
	desired: PropertyCertificate,
	roots: ReadonlySet<string>,
	scope: string,
	environment: SourcePropertyEnvironment,
) {
	const projections = new Map<
		string,
		{ property: string; roots: Set<string>; paths: Map<string, readonly string[]> }
	>();
	for (const root of roots) {
		const effects = [original, desired].flatMap((certificate) =>
			propertyConsumers(certificate, new Set([root]), environment),
		);
		const consumers = new Set(
			effects
				.filter((effect) => !effect.property.startsWith("--"))
				.flatMap((effect) =>
					effect.property === "white-space" ? [effect.property] : propertyKeys(effect.property, environment),
				),
		);
		if (consumers.size === 0) consumers.add(root);
		const selected = [original, desired].flatMap((certificate) =>
			certificate.effects.filter((effect) => {
				if (effect.owner === null || !propertyKeys(effect.property, environment).includes(root)) return false;
				const variants = anatomyOf(effect.owner).variants;
				return (variants.length ? `${variants.join(":")}:` : "") === scope;
			}),
		);
		for (const property of consumers) {
			const projection = projections.get(property) ?? {
				property,
				roots: new Set<string>(),
				paths: new Map<string, readonly string[]>(),
			};
			projection.roots.add(root);
			for (const effect of selected) projection.paths.set(JSON.stringify(effect.path), effect.path);
			projections.set(property, projection);
		}
	}
	return [...projections.values()].map(({ property, roots, paths }) => ({
		property,
		roots: [...roots],
		scopePaths: [...paths.values()],
		effects: nativeConsumerEffects(desired, property, environment),
	}));
}
