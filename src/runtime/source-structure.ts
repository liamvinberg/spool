import type { ReactNode } from "react";
import type { SourceStructureState } from "../source-structure";

export function structuralOptional(
	state: SourceStructureState | undefined,
	site: string,
	factory: () => ReactNode,
): ReactNode {
	return state?.optional[site] === false ? null : factory();
}

export function structuralList(
	state: SourceStructureState | undefined,
	site: string,
	factories: Record<string, () => ReactNode>,
): { children?: ReactNode } {
	const membership = state?.lists[site] ?? Object.keys(factories);
	const children = membership.map((key) => {
		const factory = Object.getOwnPropertyDescriptor(factories, key)?.value as (() => ReactNode) | undefined;
		if (!factory) throw new Error("the original structural factory is no longer available");
		return factory();
	});
	return children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children };
}

/** A retained module can only evaluate factories that existed when it was loaded. */
export function compatibleStructure(
	initial: SourceStructureState | undefined,
	next: SourceStructureState | undefined,
): boolean {
	return Object.entries(next?.factories ?? {}).every(([site, hash]) => initial?.factories[site] === hash);
}

export function changedStructure(
	previous: SourceStructureState | undefined,
	next: SourceStructureState | undefined,
): string[] {
	const sites = new Set([
		...Object.keys(previous?.lists ?? {}),
		...Object.keys(next?.lists ?? {}),
		...Object.keys(previous?.optional ?? {}),
		...Object.keys(next?.optional ?? {}),
	]);
	return [...sites].filter(
		(site) =>
			JSON.stringify(previous?.lists[site]) !== JSON.stringify(next?.lists[site]) ||
			previous?.optional[site] !== next?.optional[site],
	);
}
