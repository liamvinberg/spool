import type { SourcePropertyEffect, SourcePropertyEnvironment, SourcePropertyValue } from "../source-property";
import { anatomyOf, splitClass } from "./class-write";
import type { SourceInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import {
	changedPropertyKeys,
	externalPropertySignature,
	propertyConsumers,
	propertySignature,
} from "./source-property-dependencies";
import { propertyKeys, readPropertyEffects } from "./source-property-effects";
import { planPropertyValue } from "./source-property-plan";
import { removalComponents } from "./source-property-removal";

export type PropertyGroupRequest =
	| { kind: "fields"; changes: readonly { property: string; scope: string; value: SourcePropertyValue }[] }
	| { kind: "remove-scope"; scope: string }
	| { kind: "tokens"; add: readonly string[]; remove: readonly string[] };

type PropertyGroupSelection = ({ kind: "field"; property: string } | { kind: "effects" }) & {
	scope: string;
	roots: Set<string>;
	scopePaths: readonly (readonly string[])[];
};

/** All requests share one original compiler input and produce one final source candidate. */
export async function planPropertyGroup(
	root: string,
	inputs: ReadonlyMap<string, SourceInput>,
	literal: string,
	request: PropertyGroupRequest,
	environment: SourcePropertyEnvironment,
	bundledCss = "",
) {
	if (request.kind === "fields" && request.changes.length === 0) throw new Error("the property group is empty");
	const original = await compilePropertySource(root, inputs, literal, bundledCss);
	const before = new Set<string>();
	const after = new Set<string>();
	const selections: PropertyGroupSelection[] = [];
	const removedComponents = new Map<string, Set<string>>();
	const requestedRoots = new Map<string, Set<string>>();
	if (request.kind === "remove-scope") {
		if (!request.scope) throw new Error("scope removal requires an explicit nonempty written scope");
		const selected = splitClass(literal).filter((token) => scopeOf(token) === request.scope);
		if (!selected.length) throw new Error("the selected written scope is absent");
		for (const token of selected) {
			if (!original.effects.some((effect) => effect.owner === token))
				throw new Error("the selected token has no compiled ownership proof");
			before.add(token);
		}
		const effects = original.effects.filter((effect) => effect.owner !== null && before.has(effect.owner));
		selections.push(effectSelection(request.scope, effects, environment));
	}
	if (request.kind === "tokens") {
		const tokens = splitClass(literal);
		for (const group of [request.add, request.remove]) {
			if (new Set(group).size !== group.length)
				throw new Error("duplicate requested tokens have no independent ownership");
			for (const token of group)
				if (splitClass(token).length !== 1 || splitClass(token)[0] !== token)
					throw new Error("a requested token must be one exact class token");
		}
		if (!request.add.length && !request.remove.length) throw new Error("the token group is empty");
		if (request.remove.some((token) => !tokens.includes(token)))
			throw new Error("the removed token is not in the original source");
		if (request.add.some((token) => tokens.includes(token)))
			throw new Error("the added token already has an original owner");
		const candidates = await compilePropertySource(root, inputs, request.add.join(" "), bundledCss);
		for (const [requested, certificate] of [
			[request.remove, original],
			[request.add, candidates],
		] as const)
			for (const token of requested)
				if (!certificate.effects.some((effect) => effect.owner === token))
					throw new Error("the requested token has no compiled ownership proof");
		for (const token of request.remove) before.add(token);
		for (const token of request.add) after.add(token);
		const effects = [
			...original.effects.filter((effect) => effect.owner !== null && before.has(effect.owner)),
			...candidates.effects.filter((effect) => effect.owner !== null && after.has(effect.owner)),
		];
		for (const scope of new Set([...request.remove, ...request.add].map(scopeOf))) {
			const scoped = effects.filter((effect) => effect.owner !== null && scopeOf(effect.owner) === scope);
			selections.push(effectSelection(scope, scoped, environment));
		}
	}
	for (const change of request.kind === "fields" ? request.changes : []) {
		const plan = await planPropertyValue(
			root,
			inputs,
			literal,
			{ kind: "property", property: change.property, scope: change.scope },
			change.value,
			environment,
			bundledCss,
		);
		const read = readPropertyEffects(original, change.property, change.scope, environment);
		const desired = readPropertyEffects(plan.desired, change.property, change.scope, environment);
		const selectedRoots = new Set([...read.roots, ...desired.roots]);
		const claimed = requestedRoots.get(change.scope) ?? new Set<string>();
		if ([...selectedRoots].some((key) => claimed.has(key)))
			throw new Error("the property group has overlapping requested effects");
		for (const key of selectedRoots) claimed.add(key);
		requestedRoots.set(change.scope, claimed);
		const roots = new Set([...selectedRoots, ...plan.roots]);
		if (change.value.kind !== "remove" && plan.after.some((token) => after.has(token)))
			throw new Error("the property group has overlapping token ownership");
		for (const token of plan.before) before.add(token);
		if (change.value.kind === "remove") {
			const removed = removedComponents.get(change.scope) ?? new Set<string>();
			for (const token of plan.before) removed.add(token);
			removedComponents.set(change.scope, removed);
		} else for (const token of plan.after) after.add(token);
		selections.push({
			kind: "field",
			property: change.property,
			scope: change.scope,
			roots,
			scopePaths: effectPaths([...read.effects, ...desired.effects]),
		});
	}
	for (const [scope, owners] of removedComponents) {
		const roots = requestedRoots.get(scope)!;
		for (const token of removalComponents(original, [...owners], roots, environment, scope)) {
			if (after.has(token) || (splitClass(literal).includes(token) && !before.has(token)))
				throw new Error("the surviving component already has another owner");
			after.add(token);
		}
	}
	const tokens = splitClass(literal);
	if (new Set(tokens).size !== tokens.length)
		throw new Error("duplicate class tokens have no independent source ownership");
	const next = [...tokens.filter((token) => !before.has(token)), ...after].join(" ");
	const desired = await compilePropertySource(root, inputs, next, bundledCss);
	// Each explicit request must remain satisfied in the combined compiler candidate.
	for (const change of request.kind === "fields" ? request.changes : []) {
		const proof = await planPropertyValue(
			root,
			inputs,
			next,
			{ kind: "property", property: change.property, scope: change.scope },
			change.value,
			environment,
			bundledCss,
		);
		if (proof.before.length || proof.after.length)
			throw new Error("the final group does not satisfy every requested field");
	}
	const ownedBefore = original.effects.filter((effect) => effect.owner !== null && before.has(effect.owner));
	const ownedAfter = desired.effects.filter((effect) => effect.owner !== null && after.has(effect.owner));
	if (
		propertySignature(original.effects.filter((effect) => effect.owner !== null && !before.has(effect.owner))) !==
		propertySignature(desired.effects.filter((effect) => effect.owner !== null && !after.has(effect.owner)))
	)
		throw new Error("the final group changed an independent carried declaration");
	const roots = changedPropertyKeys(ownedBefore, ownedAfter, environment);
	return {
		original,
		desired,
		before: [...before],
		after: [...after],
		next,
		roots,
		consumers: propertyConsumers(desired, roots, environment),
		external: externalPropertySignature(original, roots, [...before], environment),
		selections: selections.map((selection) => ({
			...selection,
			consumers: propertyConsumers(desired, selection.roots, environment),
		})),
	};
}

function effectPaths(effects: readonly SourcePropertyEffect[]): readonly (readonly string[])[] {
	return [...new Map(effects.map((effect) => [JSON.stringify(effect.path), effect.path])).values()];
}

function scopeOf(token: string): string {
	const variants = anatomyOf(token).variants;
	return variants.length ? `${variants.join(":")}:` : "";
}

function effectSelection(
	scope: string,
	effects: readonly SourcePropertyEffect[],
	environment: SourcePropertyEnvironment,
): PropertyGroupSelection {
	return {
		kind: "effects",
		scope,
		roots: new Set(effects.flatMap((effect) => propertyKeys(effect.property, environment))),
		scopePaths: effectPaths(effects),
	};
}
