import { rowFor, unlinkTo } from "../properties/rows";
import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyValue } from "../source-property";
import { anatomyOf, splitClass } from "./class-write";
import type { SourceInput } from "./retained-compile";
import { compilePropertySource, type PropertyCertificate } from "./source-property-compile";
import {
	changedPropertyKeys,
	externalPropertySignature,
	nativePropertyEffects,
	propertySignature,
} from "./source-property-dependencies";
import { propertyKeys, readPropertyEffects } from "./source-property-effects";
import { removalComponents } from "./source-property-removal";

/** A property name chooses a control; actual compiler output chooses its source tokens. */
export async function planPropertyValue(
	root: string,
	inputs: ReadonlyMap<string, SourceInput>,
	literal: string,
	operation: Extract<SourceOperation, { kind: "property" }>,
	requested: SourcePropertyValue,
	environment: SourcePropertyEnvironment,
	bundledCss = "",
	compiled?: PropertyCertificate,
) {
	const row = rowFor(operation.property);
	if (!row || row.primitive === "read") throw new Error("this property has no supported control");
	let candidate: readonly string[];
	if (requested.kind === "remove") candidate = [];
	else if (requested.kind === "binding") candidate = requested.tokens;
	else {
		const custom = unlinkTo(row, requested.value);
		if (!custom.ok) throw new Error(custom.reason);
		candidate = [`${operation.scope}${custom.token}`];
	}
	for (const token of candidate) {
		// Several classes spell one gradient, and each of them is its own source
		// token. A run of them in one request is malformed, not a class the
		// compiler declined to emit.
		if (token.trim() === "" || /\s/.test(token))
			throw new Error("each binding token is one class, and this request holds a run of them");
		const parts = anatomyOf(token);
		if ((parts.variants.length ? `${parts.variants.join(":")}:` : "") !== operation.scope)
			throw new Error("the chosen binding belongs to another scope");
	}
	const original = compiled ?? (await compilePropertySource(root, inputs, literal, bundledCss));
	const read = readPropertyEffects(original, operation.property, operation.scope, environment);
	const important = read.effects.some((effect) => effect.important);
	const owners = read.owners.filter((owner) =>
		read.effects.some((effect) => effect.owner === owner && effect.important === important),
	);
	if (important) candidate = candidate.map((token) => (anatomyOf(token).important ? token : `${token}!`));
	const compiledCandidates = await compilePropertySource(root, inputs, candidate.join(" "), bundledCss);
	const candidateEffects = readPropertyEffects(compiledCandidates, operation.property, operation.scope, environment);
	if (candidate.some((token) => !candidateEffects.owners.includes(token)))
		throw new Error("the chosen token has no compiled effect for this property");
	const allowed = new Set(
		compiledCandidates.effects
			.filter((effect) => effect.owner !== null)
			.flatMap((effect) => propertyKeys(effect.property, environment)),
	);
	for (const name of read.roots) allowed.add(name);
	// These controls deliberately own the compiler's coupled layout declarations.
	if (operation.property === "text-overflow")
		for (const name of ["overflow-x", "overflow-y", "white-space-collapse", "text-wrap-mode"]) allowed.add(name);
	const before = owners.filter((token) => {
		if (candidate.includes(token)) return false;
		if (candidate.length === 0) return true;
		const changed = changedPropertyKeys(
			original.effects.filter((effect) => effect.owner === token),
			compiledCandidates.effects.filter((effect) => effect.owner !== null),
			environment,
		);
		// A broader binding stays authored; the specific component is an override.
		// Replacing that binding would also detach its other independent components.
		return [...changed].every((name) => allowed.has(name));
	});
	const after =
		requested.kind === "remove"
			? removalComponents(original, before, read.roots, environment, operation.scope)
			: candidate.filter((token) => !owners.includes(token));
	const tokens = splitClass(literal);
	if (new Set(tokens).size !== tokens.length || new Set(candidate).size !== candidate.length)
		throw new Error("duplicate class tokens have no independent source ownership");
	if (after.some((token) => tokens.includes(token)))
		throw new Error("the chosen token already belongs to another source effect");
	const next = [...tokens.filter((token) => !before.includes(token)), ...after].join(" ");
	const desired = await compilePropertySource(root, inputs, next, bundledCss);
	const roots = changedPropertyKeys(
		original.effects.filter((effect) => effect.owner !== null && before.includes(effect.owner)),
		desired.effects.filter((effect) => effect.owner !== null && after.includes(effect.owner)),
		environment,
	);
	const carried = original.effects.filter((effect) => effect.owner !== null && !before.includes(effect.owner));
	const kept = desired.effects.filter((effect) => effect.owner !== null && !after.includes(effect.owner));
	if (propertySignature(carried) !== propertySignature(kept))
		throw new Error("the fresh compiler changed an independent carried declaration");
	return {
		before,
		after,
		original,
		desired,
		roots,
		consumers: nativePropertyEffects(desired, roots, environment),
		external: externalPropertySignature(original, roots, before, environment),
		next,
	};
}
