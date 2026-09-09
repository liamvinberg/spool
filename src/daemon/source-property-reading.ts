import type { MatchedRuleChain, SourceOperation } from "../source-edit";
import type { SourcePropertyEnvironment, SourcePropertyNative, SourcePropertyReading } from "../source-property";
import type { PropertyCertificate } from "./source-property-compile";
import {
	admissible,
	applies,
	declarationScope,
	type PropertySource,
	propertySourceOwner,
} from "./source-property-declaration";
import { propertyInputs, propertyKeys, readPropertyEffects } from "./source-property-effects";
import { type StyleMember, styleMemberEffects } from "./source-property-style";

/** What the use itself reports about this property, beside what the compiler says. */
export interface PropertyReadingContext {
	/** the value this use is computing right now */
	native?: SourcePropertyNative | undefined;
	/** the element's own proven literal members */
	style?: readonly StyleMember[] | undefined;
	/** the rule chains this use matched, and whether each is applying */
	matched?: readonly MatchedRuleChain[] | undefined;
}

/** Binding identity comes from the captured compiler, never equality with native pixels. */
export function propertyReading(
	certificate: PropertyCertificate,
	operation: Extract<SourceOperation, { kind: "property" }>,
	environment: SourcePropertyEnvironment,
	context: PropertyReadingContext = {},
): SourcePropertyReading {
	const { native, style, matched } = context;
	const { roots, effects, owners } = readPropertyEffects(
		certificate,
		operation.property,
		operation.scope,
		environment,
	);
	const shown = native?.property === operation.property ? { native: native.value } : {};
	// The conditions the project's own rules declare this property under, whether
	// or not one of them is what applies here. This is the written half of the
	// row: what the viewport is doing to the element is the native half.
	const written = [
		...new Set(
			certificate.effects
				.filter(
					(effect) =>
						admissible(effect) &&
						propertyKeys(effect.property, environment).some((key) => roots.has(key)) &&
						(matched === undefined || applies(effect, matched) !== undefined),
				)
				.flatMap(declarationScope),
		),
	];
	const under = written.length ? { written } : {};
	// A scope is a condition on a rule, and an inline member carries none, so a
	// scoped row reads its class literal even where a member also declares it.
	const inline = style && operation.scope === "" ? styleMemberEffects(style) : [];
	let held: PropertySource | undefined;
	if (operation.scope === "")
		try {
			held = propertySourceOwner(roots, effects, inline, certificate, environment, matched);
		} catch {
			// Sources this reading cannot tell apart: it says so rather than showing
			// either one's value. The write against it refuses with the reason.
			return { tokens: [], source: "mixed", binding: { kind: "mixed" }, ...shown };
		}
	if (held?.kind === "declaration") {
		const values = [...new Set(held.effects.map((effect) => effect.value))];
		const authored = values.length === 1 && !/\s/.test(values[0]!) ? values[0] : undefined;
		return {
			tokens: [],
			source: "declaration",
			...under,
			binding: authored === undefined ? { kind: "mixed" } : { kind: "custom" },
			...(authored === undefined ? {} : { authored }),
			...shown,
		};
	}
	if (held?.kind === "style") {
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
			...under,
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
		...under,
		binding,
		...(binding.kind === "custom" ? { authored: values[0]! } : {}),
		...shown,
	};
}
