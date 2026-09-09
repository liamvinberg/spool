import type { SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyNative, SourcePropertyReading } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import { propertyInputs, propertyKeys, readPropertyEffects } from "./source-property-effects";
import { type StyleMember, styleMemberEffects, stylePropertyOwner } from "./source-property-style";

/** Binding identity comes from the captured compiler, never equality with native pixels. */
export function propertyReading(
	certificate: PropertyCertificate,
	operation: Extract<SourceOperation, { kind: "property" }>,
	environment: SourcePropertyEnvironment,
	native?: SourcePropertyNative,
	style?: readonly StyleMember[],
): SourcePropertyReading {
	const { roots, effects, owners } = readPropertyEffects(
		certificate,
		operation.property,
		operation.scope,
		environment,
	);
	const shown = native?.property === operation.property ? { native: native.value } : {};
	// A scope is a condition on a rule, and an inline member carries none, so a
	// scoped row reads its class literal even where a member also declares it.
	const inline = style && operation.scope === "" ? styleMemberEffects(style) : [];
	let owner: "class" | "style" | "mixed" = "class";
	if (inline.length)
		try {
			owner = stylePropertyOwner(roots, effects, inline, environment).kind;
		} catch {
			// Two sources over one control: the reading says so rather than showing
			// either one's value. The write against it refuses with the reason.
			owner = "mixed";
		}
	if (owner === "mixed") return { tokens: [], source: "mixed", binding: { kind: "mixed" }, ...shown };
	if (owner === "style") {
		const values = [
			...new Set(
				[...roots].map((root) => {
					const effect = inline.filter((held) => propertyKeys(held.property, environment).includes(root)).at(-1)!;
					// One component spells every side it covers; a shorthand of several
					// has no honest per-side authored value to show.
					return effect.property === operation.property || !/\s/.test(effect.value) ? effect.value : undefined;
				}),
			),
		];
		const authored = values.length === 1 ? values[0] : undefined;
		return {
			tokens: [],
			source: "style",
			binding: authored === undefined ? { kind: "mixed" } : { kind: "custom" },
			...(authored === undefined ? {} : { authored }),
			...shown,
		};
	}
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
		source: "class",
		binding,
		...(binding.kind === "custom" ? { authored: values[0]! } : {}),
		...shown,
	};
}
