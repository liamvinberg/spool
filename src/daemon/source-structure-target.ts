import { relative } from "node:path";
import { parse } from "@babel/parser";
import type { SourceDescription, SourceOccurrence } from "../source-edit";
import type { SourceStructuralExpectation } from "../source-structure";
import { realDesignDir } from "./design-path";
import { lowerLiterals, type RetainedCompilation } from "./retained-compile";
import { type Selection, Sources } from "./source-origins";
import { deriveSourceDelete } from "./source-structure";
import { planStructureCompilation } from "./source-structure-compile";

/** A delete unit comes only from the original committed chain and frozen compiler inputs. */
export function resolveSourceDelete(
	root: string,
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
) {
	if (!original.provenance || !original.structure) throw new Error("the original structural observation is missing");
	const sources = new Sources(root, compilation);
	for (const file of compilation.inputs.keys())
		if (/\.[cm]?[jt]sx?$/.test(file)) sources.read(relative(realDesignDir(root), file));
	const selection = JSON.parse(original.provenance) as Selection;
	const plan = deriveSourceDelete(sources, { ...selection, generation: String(generation) });
	for (const unit of sources.revisions.values())
		if (!compilation.inputs.has(unit.file))
			throw new Error("the structural origin is outside captured compiler inputs");
	const file = relative(realDesignDir(root), plan.file);
	const structural = planStructureCompilation(
		parse(plan.text, { sourceType: "module", plugins: ["jsx", "typescript"] }).program,
		file,
	);
	const group = structural.groups.find((group) =>
		plan.replacement === "null"
			? group.kind === "optional" && group.node.start === plan.selected.start && group.node.end === plan.selected.end
			: group.kind === "list" && group.node.start === plan.parent.start && group.node.end === plan.parent.end,
	);
	if (!group) throw new Error("the original structural unit has no retained membership proof");
	const next = plan.text.slice(0, plan.selected.start) + plan.replacement + plan.text.slice(plan.selected.end);
	const before = lowerLiterals(file, plan.text),
		after = lowerLiterals(file, next);
	if (before.shape !== after.shape) throw new Error("this removal changes the original executable context");
	const fallbackSite = plan.fallback
		? Object.entries(compilation.packet.locations ?? {}).find(([, source]) => source === plan.fallback!.source)?.[0]
		: undefined;
	const observedParent = original.structure.source;
	const ownerCall =
		observedParent?.chain.findIndex((site) => compilation.packet.locations?.[site] === plan.parentCall) ?? -1;
	const parent =
		observedParent &&
		[observedParent.site, ...observedParent.chain].every((site) => compilation.packet.locations?.[site])
			? !plan.parentCall
				? { site: observedParent.site, chain: [] }
				: ownerCall >= 0
					? { site: observedParent.site, chain: observedParent.chain.slice(ownerCall) }
					: undefined
			: undefined;
	const children =
		parent && plan.parentShape && plan.parentShape.source === compilation.packet.locations?.[parent.site]
			? plan.parentShape.children.map((child) => {
					if (child.kind === "unit") return child;
					const site = Object.entries(compilation.packet.locations ?? {}).find(
						([, source]) => source === child.source,
					)?.[0];
					return site ? { ...child, source: site } : undefined;
				})
			: undefined;
	const expected: SourceStructuralExpectation = {
		kind: "structure",
		site: group.id,
		...(parent ? { parent } : {}),
		...(children?.every((child) => child !== undefined) ? { children } : {}),
		state: after.structure,
		...(plan.fallback && fallbackSite ? { fallback: { source: fallbackSite, value: plan.fallback.value } } : {}),
	};
	return { ...plan, site: group.id, expected, before: before.structure, shape: before.shape };
}
export type SourceDeleteTarget = ReturnType<typeof resolveSourceDelete>;

/** An original creation/field edge can expose uncertainty, never authorize deletion. */
export function potentialDeleteSource(original: SourceOccurrence, source: string): boolean {
	if (!original.provenance) return false;
	try {
		const selection = JSON.parse(original.provenance) as Selection;
		return (
			selection.source === source ||
			selection.chain.some((call) => call.source === source || call.renderedSource === source) ||
			[selection.values, ...selection.chain.flatMap((call) => [call.values, call.renderedValues])].some(
				(value) =>
					value &&
					(value.type.origin.source === source ||
						Object.values(value.fields).some((field) => field.origin.source === source)),
			)
		);
	} catch {
		return false;
	}
}

export function describeDeleteTarget(original: SourceOccurrence, target: SourceDeleteTarget): SourceDescription {
	return {
		operation: { kind: "delete" },
		structure: {
			kind: "structure",
			site: target.site,
			...(target.expected.parent ? { parent: target.expected.parent } : {}),
			...(target.expected.children ? { children: target.expected.children } : {}),
			state: target.before,
		},
		original,
		source: target.source,
		role: "structural-unit",
		scope: target.role,
		value: "",
	};
}

/** Recheck the original parent after journal transport, before any source write. */
export function certifyStructuralChange(
	target: Pick<SourceDeleteTarget, "source" | "site" | "shape">,
	before: string,
	after: string,
	expectedBefore: SourceStructuralExpectation,
) {
	const file = target.source.replace(/:\d+:\d+$/, ""),
		current = lowerLiterals(file, before),
		next = lowerLiterals(file, after),
		site = target.site;
	const sameMembership =
		JSON.stringify(current.structure.lists[site]) === JSON.stringify(expectedBefore.state.lists[site]) &&
		current.structure.optional[site] === expectedBefore.state.optional[site];
	if (!sameMembership || (!(site in current.structure.lists) && !(site in current.structure.optional)))
		throw new Error("the original structural parent or insertion position changed");
	const members = expectedBefore.state.lists[site];
	const factoryKeys = members
		? members.map((key) => `${site}/${key}`)
		: expectedBefore.state.optional[site]
			? [site]
			: [];
	if (factoryKeys.some((key) => current.structure.factories[key] !== expectedBefore.state.factories[key]))
		throw new Error("the original structural parent's surviving executable payload changed");
	if (current.shape !== target.shape || current.shape !== next.shape)
		throw new Error("the structural operation changes its original executable context");
	return { before: current.structure, after: next.structure };
}
