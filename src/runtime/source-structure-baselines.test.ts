import { expect, it } from "vitest";
import { createStructuralBaselines } from "./source-structure-baselines";

it("releases every canceled structural preparation without a history entry", () => {
	const baselines = createStructuralBaselines();
	for (let generation = 1; generation <= 200; generation++) {
		const basis = { site: "parent", groups: [], prefixes: new Map<string, string>() };
		baselines.prepare(generation, basis);
		expect(baselines.get(generation)).toBe(basis);
		baselines.cancel(generation);
		expect(baselines.get(generation)).toBeUndefined();
	}
});

it("keeps valid history through completion and protects a pending preparation from history pruning", () => {
	const baselines = createStructuralBaselines();
	const first = { site: "first", groups: [], prefixes: new Map<string, string>() };
	const pending = { site: "pending", groups: [], prefixes: new Map<string, string>() };
	baselines.prepare(1, first);
	baselines.retain([1]);
	baselines.finish(1);
	baselines.cancel(1);
	expect(baselines.get(1)).toBe(first);
	baselines.prepare(2, pending);
	baselines.retain([]);
	expect(baselines.get(1)).toBeUndefined();
	expect(baselines.get(2)).toBe(pending);
	baselines.finish(2);
	expect(baselines.get(2)).toBeUndefined();
});

it("releases a known unavailable inverse without restoring its evidence from later history lists", () => {
	const baselines = createStructuralBaselines();
	baselines.prepare(1, { site: "parent", groups: [], prefixes: new Map() });
	baselines.retain([1]);
	baselines.finish(1);
	baselines.retire(1);
	baselines.retain([1]);
	expect(baselines.get(1)).toBeUndefined();
	expect(baselines.values()).toEqual([]);
});

it("drops all native evidence when the source runtime is reconfigured", () => {
	const baselines = createStructuralBaselines();
	baselines.prepare(1, { site: "parent", groups: [], prefixes: new Map() });
	baselines.retain([1]);
	baselines.clear();
	expect(baselines.get(1)).toBeUndefined();
	expect(baselines.values()).toEqual([]);
});
