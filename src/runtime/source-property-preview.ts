import type { RetainedValues } from "../source-edit";
import type { SourcePropertyPreview } from "../source-property";

interface Styles {
	revision: number;
	entries: { element: HTMLStyleElement; original: string; preview: string; rules: string }[];
	inline: { element: HTMLElement; property: string; original: string; preview: string }[];
}
const previews = new Map<number, Styles>();
function sheetRules(sheet: CSSStyleSheet): string {
	return JSON.stringify([sheet.disabled, sheet.media.mediaText, [...sheet.cssRules].map((rule) => rule.cssText)]);
}
function canonicalRules(css: string): string {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	return sheetRules(sheet);
}

/** Temporary sheets share the original edit's lifetime and never overwrite an outside mutation. */
export function previewPropertyStyles(
	plan: SourcePropertyPreview,
	packet: Pick<RetainedValues, "id" | "css" | "bundledCss">,
	elements: readonly HTMLElement[] = [],
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
		if (!(element instanceof HTMLStyleElement) || !element.sheet) return false;
		const held = previous?.entries.find((entry) => entry.element === element);
		if (previous ? !held || element.textContent !== held.preview : element.textContent !== original) return false;
		if (sheetRules(element.sheet) !== (held?.rules ?? canonicalRules(original))) return false;
		entries.push({ element, original: held?.original ?? element.textContent ?? "", preview: value, rules: "" });
	}
	// An inline member has no compiled rule to swap, so its preview is the
	// element's own declaration. What was there is kept, so nothing outside this
	// edit is overwritten and nothing outside it is restored either.
	const inline: Styles["inline"] = [];
	for (const element of elements)
		for (const { property, value } of plan.inline ?? []) {
			const current = element.style.getPropertyValue(property);
			const held = previous?.inline.find((entry) => entry.element === element && entry.property === property);
			if (previous ? !held || current !== held.preview : false) return false;
			inline.push({ element, property, original: held?.original ?? current, preview: value });
		}
	for (const entry of entries) {
		entry.element.textContent = entry.preview;
		entry.rules = sheetRules(entry.element.sheet!);
	}
	for (const entry of inline) entry.element.style.setProperty(entry.property, entry.preview);
	previews.set(plan.generation, { revision: plan.revision, entries, inline });
	return true;
}

export function restorePropertyStyles(generation: number): void {
	const held = previews.get(generation);
	previews.delete(generation);
	for (const entry of held?.inline ?? [])
		if (entry.element.isConnected && entry.element.style.getPropertyValue(entry.property) === entry.preview)
			entry.element.style.setProperty(entry.property, entry.original);
	for (const entry of held?.entries ?? [])
		if (
			entry.element.isConnected &&
			entry.element.textContent === entry.preview &&
			entry.element.sheet &&
			sheetRules(entry.element.sheet) === entry.rules
		)
			entry.element.textContent = entry.original;
}
