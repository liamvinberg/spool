import type { SourceOccurrence, SourceOperation } from "../source-edit";
import type { LiteralCell, RetainedCompilation } from "./retained-compile";
import type { Selection } from "./source-origins";
import { resolvePropertySource } from "./source-property-target";
import { resolveTextSource } from "./source-target";

/** Reconcile one explicitly retried literal, without relaxing ordinary reads. */
export function retryTextSource(
	root: string,
	before: RetainedCompilation,
	current: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
) {
	const prior = resolveTextSource(root, before, original, generation);
	const cell = checkedRetryCell(before, current, original, prior);
	const target = resolveTextSource(root, current, original, generation, undefined, {
		kind: "retry",
		source: cell.source,
		field: cell.field ?? "children",
		before: prior.cell.value,
		after: cell.value,
	});
	if (
		target.cellKey !== prior.cellKey ||
		target.target?.role !== prior.target?.role ||
		target.target?.syntax !== prior.target?.syntax ||
		target.target?.attribute !== prior.target?.attribute
	)
		throw new Error("The original owning declaration changed.");
	return target;
}

function checkedRetryCell(
	before: RetainedCompilation,
	current: RetainedCompilation,
	original: SourceOccurrence,
	prior: { cellKey: string; cell: LiteralCell },
): LiteralCell {
	if (before.packet.shape !== current.packet.shape)
		throw new Error("The original executable context changed. Confirm the target in current source.");
	const cell = current.cells[prior.cellKey];
	if (!cell || cell.source !== prior.cell.source || cell.field !== prior.cell.field)
		throw new Error("The original source owner changed.");
	const selection: Selection | undefined = original.provenance ? JSON.parse(original.provenance) : undefined;
	const ancestry = new Set([prior.cell.source]);
	const collectSources = (value: unknown): void => {
		if (value === null || typeof value !== "object") return;
		for (const [key, child] of Object.entries(value)) {
			if (key === "source" && typeof child === "string") ancestry.add(child);
			else collectSources(child);
		}
	};
	collectSources(selection);
	// A mode/branch argument can change which declaration governs a retained host
	// while leaving its DOM identity and lowered executable shape unchanged.
	for (const [key, previous] of Object.entries(before.cells)) {
		const next = current.cells[key];
		if (
			key !== prior.cellKey &&
			ancestry.has(previous.source) &&
			(!next || next.value !== previous.value || next.source !== previous.source || next.field !== previous.field)
		)
			throw new Error(
				"Another input in the original call ancestry changed. Confirm the original target before retrying.",
			);
	}
	return cell;
}

/** Read-only property reconciliation retains the original ancestry and exact class cell. */
export function retryPropertySource(
	root: string,
	before: RetainedCompilation,
	current: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
	operation: Extract<SourceOperation, { kind: "property" }>,
) {
	const prior = resolvePropertySource(root, before, original, generation, operation);
	const cell = checkedRetryCell(before, current, original, prior);
	const target = resolvePropertySource(root, current, original, generation, operation, {
		kind: "retry",
		cell: prior.cellKey,
		before: prior.cell.value,
		after: cell.value,
	});
	if (
		target.cellKey !== prior.cellKey ||
		target.target.role !== prior.target.role ||
		target.target.syntax !== prior.target.syntax ||
		target.target.attribute !== prior.target.attribute
	)
		throw new Error("The original owning declaration changed.");
	return target;
}
