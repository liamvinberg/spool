import type { SourcePropertyEffect, SourcePropertyEnvironment } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { propertyInputs, propertyKeys } from "./source-property-effects";

function key(effect: SourcePropertyEffect): string {
	return JSON.stringify([effect.path, effect.property]);
}
function value(effect: SourcePropertyEffect): string {
	return JSON.stringify([effect.value, effect.important]);
}

/** Changed declaration keys preserve paths and priority, independently of token naming. */
export function changedPropertyKeys(
	before: readonly SourcePropertyEffect[],
	after: readonly SourcePropertyEffect[],
	environment: SourcePropertyEnvironment,
): Set<string> {
	const changed = new Set<string>();
	const keys = new Set([...before, ...after].flatMap((effect) => propertyKeys(effect.property, environment)));
	for (const name of keys) {
		const declarations = (effects: readonly SourcePropertyEffect[]) =>
			JSON.stringify(
				effects
					.filter((effect) => propertyKeys(effect.property, environment).includes(name))
					.map((effect) => [key(effect), value(effect)]),
			);
		if (declarations(before) !== declarations(after)) changed.add(name);
	}
	return changed;
}

/** Follow variable consumers across all emitted conditions, including inactive branches. */
export function propertyConsumers(
	certificate: PropertyCertificate,
	roots: ReadonlySet<string>,
	environment: SourcePropertyEnvironment,
): SourcePropertyEffect[] {
	const keys = new Set(roots);
	const effects = new Set<SourcePropertyEffect>();
	let growing = true;
	while (growing) {
		growing = false;
		for (const effect of certificate.effects) {
			if (
				effects.has(effect) ||
				![...propertyKeys(effect.property, environment), ...propertyInputs(effect)].some((name) => keys.has(name))
			)
				continue;
			effects.add(effect);
			if (effect.property.startsWith("--")) keys.add(effect.property);
			growing = true;
		}
	}
	return [...effects];
}

/** Other inputs of a shared filter/transform consumer remain independent operations. */
export function propertyDependencies(
	certificate: PropertyCertificate,
	roots: ReadonlySet<string>,
	environment: SourcePropertyEnvironment,
): Set<string> {
	const keys = new Set(roots);
	let growing = true;
	while (growing) {
		growing = false;
		for (const effect of certificate.effects) {
			if (!propertyKeys(effect.property, environment).some((name) => keys.has(name))) continue;
			for (const name of propertyInputs(effect)) {
				if ((name.startsWith("--tw-") && !roots.has(name)) || keys.has(name)) continue;
				keys.add(name);
				growing = true;
			}
		}
	}
	return keys;
}

export function propertySignature(effects: readonly SourcePropertyEffect[]): string {
	return JSON.stringify(effects.map((effect) => [effect.owner, key(effect), value(effect)]));
}

/** Defaults and carried consumers are read dependencies even if masked before an inverse. */
export function externalPropertySignature(
	certificate: PropertyCertificate,
	roots: ReadonlySet<string>,
	owned: readonly string[],
	environment: SourcePropertyEnvironment,
): string {
	const inputs = propertyDependencies(certificate, roots, environment);
	const effects = [
		...propertyConsumers(certificate, roots, environment),
		...certificate.effects.filter((effect) =>
			propertyKeys(effect.property, environment).some((name) => inputs.has(name)),
		),
	];
	const considered = new Set(effects);
	const declarations = certificate.effects
		.filter(
			(effect) =>
				considered.has(effect) &&
				!effect.path.includes("@layer theme") &&
				(effect.owner === null || !owned.includes(effect.owner)),
		)
		.map((effect) => JSON.stringify([key(effect), value(effect)]));
	const names = new Set([...inputs, ...effects.flatMap(propertyInputs)]);
	// Candidate-dependent @layer theme emission is not the definition table.
	// Read the actual pinned compiler's complete entries, only along reached references.
	const reached = new Set(inputs);
	let growing = true;
	while (growing) {
		growing = false;
		for (const name of reached) {
			const entry = certificate.theme[name];
			if (!entry) continue;
			for (const dependency of propertyInputs({
				owner: null,
				path: [],
				property: name,
				value: entry.value,
				important: false,
			}))
				if (!reached.has(dependency)) {
					reached.add(dependency);
					growing = true;
				}
		}
	}
	const theme = [...reached].sort().map((name) => [name, certificate.theme[name] ?? null]);
	const registrations = [...names].sort().map((name) => [name, certificate.registrations[name] ?? null]);
	return JSON.stringify({ declarations, registrations, theme });
}
