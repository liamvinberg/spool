import { rowFor, unlinkTo } from "../properties/rows";
import type { SourcePropertyEnvironment } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { propertyInputs, propertyKeys } from "./source-property-effects";

function parts(value: string): string[] {
	const result: string[] = [];
	let start = 0,
		depth = 0;
	for (let index = 0; index <= value.length; index++) {
		const char = value[index];
		if (char === '"' || char === "'" || char === "\\")
			throw new Error("this shorthand has no bounded component spelling");
		if (char === "(") depth++;
		if (char === ")") depth--;
		if (depth < 0) throw new Error("this shorthand has unbalanced component syntax");
		if (index === value.length || (depth === 0 && /\s/.test(char!))) {
			const one = value.slice(start, index).trim();
			if (one) result.push(one);
			start = index + 1;
		}
	}
	if (depth !== 0) throw new Error("this shorthand has unbalanced component syntax");
	return result;
}
function expand(value: string, count: number, certificate: PropertyCertificate): string[] {
	const values = parts(value);
	if (values.some((one) => one.includes("/")))
		throw new Error("this compound shorthand has no bounded per-component source spelling");
	if (values.length === 1 && /^var\(/.test(value)) {
		const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
		const definition = name ? certificate.theme[name]?.value : undefined;
		const definitions = [
			definition,
			...certificate.effects.filter((effect) => effect.property === name).map((effect) => effect.value),
		];
		if (definitions.some((one) => !one || parts(one).length !== 1 || one.includes("var(") || one.includes("/")))
			throw new Error("this whole shorthand reference has no proven single-component arity");
	}
	if (values.length < 1 || values.length > count) throw new Error("this shorthand has no bounded component arity");
	if (count === 4)
		return [values[0]!, values[1] ?? values[0]!, values[2] ?? values[0]!, values[3] ?? values[1] ?? values[0]!];
	if (count === 2) return [values[0]!, values[1] ?? values[0]!];
	return values;
}
function variableCandidate(property: string, value: string): string {
	return `[${property}:${value.replaceAll("_", "\\_").replaceAll(" ", "_")}]`;
}
function candidate(property: string, value: string): string {
	const row = rowFor(property);
	if (row) {
		const custom = unlinkTo(row, value);
		if (custom.ok) return custom.token;
	}
	const scale = /^--tw-scale-([xyz])$/.exec(property);
	if (scale) return `scale-${scale[1]}-[${value.replaceAll("_", "\\_").replaceAll(" ", "_")}]`;
	return variableCandidate(property, value);
}

/** Split only compiler-proven components; preserve each surviving authored reference. */
export function removalComponents(
	certificate: PropertyCertificate,
	owners: readonly string[],
	roots: ReadonlySet<string>,
	environment: SourcePropertyEnvironment,
	scope: string,
): string[] {
	const result = new Set<string>();
	for (const owner of owners) {
		const effects = certificate.effects.filter((effect) => effect.owner === owner);
		const consumed = new Set(effects.filter((effect) => !effect.property.startsWith("--")).flatMap(propertyInputs));
		const partial =
			effects.some((effect) => {
				const keys = propertyKeys(effect.property, environment);
				return keys.some((key) => roots.has(key)) && keys.some((key) => !roots.has(key));
			}) ||
			(effects.some((effect) => effect.property.startsWith("--tw-") && roots.has(effect.property)) &&
				effects.some((effect) => effect.property.startsWith("--tw-") && !roots.has(effect.property))) ||
			// A declared transition target remains independently meaningful when
			// removing one timing component from that same compiler utility.
			(effects.some((effect) => effect.property === "transition-property" && !roots.has(effect.property)) &&
				effects.some((effect) => propertyKeys(effect.property, environment).some((key) => roots.has(key))));
		if (!partial) continue;
		for (const effect of effects) {
			const keys = propertyKeys(effect.property, environment);
			const kept = keys.filter((key) => !roots.has(key));
			if (!kept.length) continue;
			// Component utilities recreate their compiler's shared final consumer.
			if (propertyInputs(effect).some((key) => roots.has(key))) continue;
			if (kept.length === keys.length) {
				// Keep unused compiler variables without introducing a new native consumer.
				const token =
					effect.property.startsWith("--") && !consumed.has(effect.property)
						? variableCandidate(effect.property, effect.value)
						: candidate(effect.property, effect.value);
				result.add(`${scope}${token}${effect.important ? "!" : ""}`);
				continue;
			}
			const values = keys.length === 1 ? [effect.value] : expand(effect.value, keys.length, certificate);
			for (let index = 0; index < keys.length; index++) {
				const key = keys[index]!;
				if (roots.has(key)) continue;
				const token = candidate(key, values[index]!);
				result.add(`${scope}${token}${effect.important ? "!" : ""}`);
			}
		}
	}
	return [...result];
}
