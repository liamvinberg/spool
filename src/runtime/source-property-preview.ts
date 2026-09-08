import type { RetainedValues } from "../source-edit";
import type { SourcePropertyPreview } from "../source-property";

interface Styles {
	revision: number;
	entries: { element: HTMLElement; original: string; preview: string }[];
}
const previews = new Map<number, Styles>();

/** Temporary sheets share the original edit's lifetime and never overwrite an outside mutation. */
export function previewPropertyStyles(
	plan: SourcePropertyPreview,
	packet: Pick<RetainedValues, "id" | "css" | "bundledCss">,
): boolean {
	const frame = plan.frames.find((frame) => frame.publication === packet.id);
	if (!frame) return false;
	const previous = previews.get(plan.generation);
	if (previous && plan.revision <= previous.revision) return false;
	const values = [
		["spool-compiled-css", frame.css, packet.css],
		["spool-bundled-css", frame.bundledCss, packet.bundledCss],
	] as const;
	const entries: Styles["entries"] = [];
	for (const [id, value, original] of values) {
		const element = document.getElementById(id);
		if (!element) {
			if (value) return false;
			continue;
		}
		const held = previous?.entries.find((entry) => entry.element === element);
		if (previous ? !held || element.textContent !== held.preview : element.textContent !== original) return false;
		entries.push({ element, original: held?.original ?? element.textContent ?? "", preview: value });
	}
	for (const entry of entries) entry.element.textContent = entry.preview;
	previews.set(plan.generation, { revision: plan.revision, entries });
	return true;
}

export function restorePropertyStyles(generation: number): void {
	const held = previews.get(generation);
	previews.delete(generation);
	for (const entry of held?.entries ?? [])
		if (entry.element.isConnected && entry.element.textContent === entry.preview)
			entry.element.textContent = entry.original;
}
