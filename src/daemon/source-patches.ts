import { applySpan, type SpanPatch } from "./hand-write";

/** One source operation may own disjoint spans without owning the bytes between them. */
export function applySourcePatches(source: string, patches: readonly SpanPatch[]) {
	const supplied = [...patches].sort((a, b) => a.start - b.start);
	const ordered: SpanPatch[] = [];
	for (const [index, patch] of supplied.entries()) {
		if (
			!Number.isSafeInteger(patch.start) ||
			!Number.isSafeInteger(patch.end) ||
			patch.start < 0 ||
			patch.end < patch.start ||
			patch.end > source.length
		)
			throw new Error("the source operation has an invalid span");
		const previous = supplied[index - 1];
		if (previous && (previous.end > patch.start || previous.start === patch.start))
			throw new Error("the source operation has overlapping spans");
		const last = ordered.at(-1);
		// Touching owned spans have no independent bytes between them. Combining
		// them prevents adjacent deletions from producing ambiguous inverse inserts.
		if (last?.end === patch.start) {
			last.end = patch.end;
			last.text += patch.text;
		} else ordered.push({ ...patch });
	}
	let shift = 0;
	const inverse: SpanPatch[] = [];
	for (const patch of ordered) {
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
