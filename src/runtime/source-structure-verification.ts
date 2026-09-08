import type { RenderOutcome } from "../source-edit";
import type { SourceStructuralExpectation, SourceStructureState } from "../source-structure";

type Observation = ReturnType<typeof globalThis.__SPOOL_OBSERVER__.observe>;
interface Unit {
	key: string;
	roots: HTMLElement[];
}
interface ParentGroup {
	parent: HTMLElement;
	children: Node[];
	units: Unit[];
	native: Map<HTMLElement, string>;
	focused: Element | null;
}
export interface StructuralBasis {
	site: string;
	groups: ParentGroup[];
	prefixes: Map<string, string>;
	reason?: string;
}
function native(element: HTMLElement): string {
	return JSON.stringify({
		...(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
			? {
					value: element.value,
					selection: [element.selectionStart, element.selectionEnd, element.selectionDirection],
				}
			: {}),
		...(element instanceof HTMLInputElement ? { checked: element.checked } : {}),
		...(element instanceof HTMLSelectElement ? { value: element.value } : {}),
		scroll: [element.scrollLeft, element.scrollTop],
	});
}
function belongs(observed: Observation, prefix: string, locations: Record<string, string>): boolean {
	const sources = new Set(
		Object.entries(locations)
			.filter(([site]) => site === prefix || site.startsWith(`${prefix}/`) || site.startsWith(`${prefix}#`))
			.map(([, source]) => source),
	);
	return (
		sources.has(observed.source) ||
		observed.chain.some((call) => {
			const rendered = call.retainedProps ? call.renderedValues : call.values;
			return (
				sources.has(call.renderedSource ?? call.source) || (!!rendered && sources.has(rendered.type.origin.source))
			);
		})
	);
}
function roots(prefix: string, locations: Record<string, string>): HTMLElement[] {
	const all = [...document.querySelectorAll<HTMLElement>("[data-spool-source]")].filter((element) => {
		try {
			const observed = globalThis.__SPOOL_OBSERVER__.observe(element);
			return !observed.refusal && belongs(observed, prefix, locations);
		} catch {
			return false;
		}
	});
	return all.filter((element) => !all.some((other) => other !== element && other.contains(element)));
}
/** Snapshot complete attributed native roots and their original parents before publication. */
export function captureStructure(
	expected: SourceStructuralExpectation,
	locations: Record<string, string>,
): StructuralBasis {
	const { site, state } = expected;
	const prefixes = new Map<string, string>();
	if (site in state.lists)
		for (const key of state.lists[site]!) prefixes.set(key, `${site}/children:${JSON.stringify(key)}`);
	else if (site in state.optional) prefixes.set("optional", site.slice(0, -"/optional".length));
	else return { site, groups: [], prefixes, reason: "the original structural membership is missing" };
	const groups = new Map<HTMLElement, ParentGroup>();
	for (const [key, prefix] of prefixes)
		for (const root of roots(prefix, locations)) {
			const parent = root.parentElement;
			if (!parent) continue;
			let group = groups.get(parent);
			if (!group) {
				group = {
					parent,
					children: [...parent.childNodes],
					units: [],
					native: new Map(),
					focused: document.activeElement,
				};
				groups.set(parent, group);
			}
			let unit = group.units.find((unit) => unit.key === key);
			if (!unit) {
				unit = { key, roots: [] };
				group.units.push(unit);
			}
			unit.roots.push(root);
		}
	for (const group of groups.values())
		for (const element of group.parent.querySelectorAll<HTMLElement>("*")) group.native.set(element, native(element));
	const ambiguous = [...groups.values()].some(
		(group) =>
			group.units.some((unit) => unit.roots.length !== 1) ||
			(site in state.lists && group.units.length !== state.lists[site]!.length),
	);
	return {
		site,
		groups: [...groups.values()],
		prefixes,
		...(!groups.size
			? { reason: "the original attributed structural parents are unavailable" }
			: ambiguous
				? { reason: "the original structural unit has ambiguous or incomplete native roots" }
				: {}),
	};
}
function memberKeys(site: string, state: SourceStructureState): readonly string[] | undefined {
	return state.lists[site] ?? (site in state.optional ? (state.optional[site] ? ["optional"] : []) : undefined);
}
/** Verification reads ordinary committed output; it never repairs children or forces a remount. */
export function verifyStructure(
	basis: StructuralBasis,
	expected: SourceStructuralExpectation,
	before: SourceStructureState | undefined,
	locations: Record<string, string>,
	pending: (element: Element) => boolean,
	failed: (element: HTMLElement) => boolean,
): { parent?: HTMLElement; rendered: RenderOutcome; reason?: string }[] {
	if (basis.site !== expected.site)
		return [{ rendered: "unverified", reason: "the expectation belongs to another structural parent" }];
	if (basis.reason || !basis.groups.length)
		return [{ rendered: "unverified", reason: basis.reason ?? "missing original parent evidence" }];
	const membership = memberKeys(expected.site, expected.state);
	if (!membership) return [{ rendered: "unverified", reason: "canonical structural membership is missing" }];
	return basis.groups.map((group) => {
		const result = (rendered: RenderOutcome, reason?: string) => ({
			parent: group.parent,
			rendered,
			...(reason ? { reason } : {}),
		});
		if (failed(group.parent)) return result("failed");
		if (!group.parent.isConnected) return result("unmounted");
		if (pending(group.parent)) return result("pending");
		const actual: HTMLElement[] = [];
		const survivors = new Set<HTMLElement>();
		for (const key of membership) {
			const prefix = basis.prefixes.get(key);
			if (!prefix) return result("unverified", "the canonical member has no original factory attribution");
			const rendered = roots(prefix, locations).filter((root) => root.parentElement === group.parent);
			if (rendered.length === 0) return result("mismatching", "a canonical structural member is absent");
			actual.push(...rendered);
			const previous = group.units.find((unit) => unit.key === key);
			if (
				previous &&
				memberKeys(expected.site, before ?? { lists: {}, optional: {}, factories: {} })?.includes(key)
			) {
				if (
					previous.roots.length !== rendered.length ||
					previous.roots.some((root, index) => root !== rendered[index])
				)
					return result("mismatching", "a surviving structural unit changed native identity");
				for (const root of rendered)
					for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) survivors.add(element);
			}
		}
		const originalRoots = new Set(group.units.flatMap((unit) => unit.roots));
		const expectedChildren: Node[] = [];
		let inserted = false;
		for (const child of group.children) {
			if (originalRoots.has(child as HTMLElement)) {
				if (!inserted) {
					expectedChildren.push(...actual);
					inserted = true;
				}
			} else expectedChildren.push(child);
		}
		if (expected.fallback && membership.length === 0) {
			const fallback = roots(expected.fallback.source, locations).filter(
				(root) => root.parentElement === group.parent,
			);
			if (fallback.length !== 1 || fallback[0]?.textContent !== expected.fallback.value)
				return result("mismatching", "the authored fallback did not render");
			const position = group.children.findIndex((child) => originalRoots.has(child as HTMLElement));
			expectedChildren.splice(position, 0, ...fallback);
		}
		const children = [...group.parent.childNodes];
		if (
			children.length !== expectedChildren.length ||
			children.some((child, index) => child !== expectedChildren[index])
		)
			return result("mismatching", "the original parent has different membership or neighboring output");
		for (const [element] of group.native) {
			const unit = group.units.find((unit) => unit.roots.some((root) => root === element || root.contains(element)));
			if (unit) continue;
			if (!element.isConnected || !group.parent.contains(element))
				return result("mismatching", "unaffected neighboring output changed native identity");
			survivors.add(element);
		}
		if (
			group.focused instanceof HTMLElement &&
			survivors.has(group.focused) &&
			document.activeElement !== group.focused
		)
			return result("mismatching", "a surviving native field lost focus");
		for (const element of survivors)
			if (group.native.get(element) !== native(element))
				return result("mismatching", "a surviving native field or scroll position changed");
		return result("verified");
	});
}

export function refreshStructuralNative(basis: StructuralBasis): void {
	for (const group of basis.groups) {
		group.focused = document.activeElement;
		for (const [element] of group.native) if (element.isConnected) group.native.set(element, native(element));
	}
}

/** A verified owner inverse can restore a new native root. Older operations retain
 * that restoration as their next survivor, without adopting outside replacements. */
export function retainVerifiedRestorations(
	basis: StructuralBasis,
	expected: SourceStructuralExpectation,
	before: SourceStructureState | undefined,
	locations: Record<string, string>,
	verifiedParents: ReadonlySet<HTMLElement>,
): void {
	if (basis.site !== expected.site || !before) return;
	const previous = memberKeys(expected.site, before);
	const membership = memberKeys(expected.site, expected.state);
	if (!previous || !membership) return;
	for (const group of basis.groups) {
		if (!verifiedParents.has(group.parent)) continue;
		for (const unit of group.units) {
			if (previous.includes(unit.key) || !membership.includes(unit.key)) continue;
			const prefix = basis.prefixes.get(unit.key);
			if (!prefix) continue;
			const restored = roots(prefix, locations).filter((root) => root.parentElement === group.parent);
			if (restored.length !== unit.roots.length) continue;
			for (const [index, root] of unit.roots.entries()) {
				const replacement = restored[index]!;
				group.children = group.children.map((child) => (child === root ? replacement : child));
				for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) group.native.delete(element);
				for (const element of [replacement, ...replacement.querySelectorAll<HTMLElement>("*")])
					group.native.set(element, native(element));
			}
			unit.roots = restored;
		}
	}
}
