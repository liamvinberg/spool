import { applySpan, type SpanPatch } from "./hand-write";

/** One source operation may own disjoint spans without owning the bytes between them. */
export function applySourcePatches(source: string, patches: readonly SpanPatch[]) {
	const ordered = [...patches].sort((a, b) => a.start - b.start);
	let shift = 0;
	const inverse: SpanPatch[] = [];
	for (const [index, patch] of ordered.entries()) {
		if (
			!Number.isSafeInteger(patch.start) ||
			!Number.isSafeInteger(patch.end) ||
			patch.start < 0 ||
			patch.end < patch.start ||
			patch.end > source.length
		)
			throw new Error("the source operation has an invalid span");
		const previous = ordered[index - 1];
		if (previous && (previous.end > patch.start || previous.start === patch.start))
			throw new Error("the source operation has overlapping spans");
		inverse.push({
			start: patch.start + shift,
			end: patch.start + shift + patch.text.length,
			text: source.slice(patch.start, patch.end),
		});
		shift += patch.text.length - (patch.end - patch.start);
	}
	let text = source;
	for (const patch of [...ordered].reverse()) text = applySpan(text, patch);
	return { text, patches: ordered, inverse };
}
