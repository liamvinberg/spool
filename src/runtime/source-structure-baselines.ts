import type { StructuralBasis } from "./source-structure-verification";

/** Owns native evidence, never source authority. History decides what remains retained. */
export function createStructuralBaselines() {
	const entries = new Map<number, { basis: StructuralBasis; pending: boolean }>();
	let retained = new Set<number>();
	const prune = () => {
		for (const [generation, entry] of entries)
			if (!entry.pending && !retained.has(generation)) entries.delete(generation);
	};
	const finish = (generation: number) => {
		const entry = entries.get(generation);
		if (entry) entry.pending = false;
		prune();
	};
	return {
		prepare(generation: number, basis: StructuralBasis): void {
			entries.set(generation, { basis, pending: true });
		},
		get(generation: number): StructuralBasis | undefined {
			return entries.get(generation)?.basis;
		},
		retain(generations: readonly number[]): void {
			retained = new Set(generations);
			prune();
		},
		finish,
		cancel: finish,
		retire(generation: number): void {
			entries.delete(generation);
			retained.delete(generation);
		},
		values(): StructuralBasis[] {
			return [...entries.values()].map((entry) => entry.basis);
		},
		clear(): void {
			entries.clear();
			retained.clear();
		},
	};
}
