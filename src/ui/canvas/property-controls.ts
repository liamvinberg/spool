import { toggledOf } from "../../properties/families";
import { type At, editsFor, type Row, type RowValue } from "../../properties/rows";
import type { SourcePropertyReading, SourcePropertyValue } from "../../source-property";

/** One reading of this element's class cell: what each asked property is wearing, or why none can be. */
export interface PropertyDescription {
	readings?: Readonly<Record<string, SourcePropertyReading>> | undefined;
	reason?: string;
}

export interface PropertyControls {
	/** which element, under which scope, these controls are about */
	subject: string;
	/** that subject as this rail last read it, which is what a re-read replaces */
	identity: string;
	describe(properties: readonly string[]): Promise<PropertyDescription | undefined>;
	begin(property: string, preview?: SourcePropertyValue): void;
	preview(property: string, value: SourcePropertyValue, sampleValue?: string): void;
	apply(property: string, value: SourcePropertyValue): void;
	/** Several properties one gesture decides together, saved as one operation. */
	applyFields(changes: readonly { property: string; value: SourcePropertyValue }[]): void;
	finish(commit: boolean): void;
}

/** Every control writes through the source owner; a reading row writes nothing. */
export function sourceProperty(row: Row): boolean {
	return row.primitive !== "read";
}

/**
 * The CSS property a row's request is about.
 *
 * A row is a control, and two controls can be about one property: the width
 * field and the width mode menu both author the element's width, so a mode
 * change is a width request rather than a request about a control's own name.
 */
export function sourcePropertyName(row: Row): string {
	return row.rule.kind === "size-mode" ? (row.rule.axis === "w" ? "width" : "height") : row.property;
}

/** Candidate spelling carries the control's request; the source compiler proves ownership. */
export function propertyControlValue(row: Row, value: RowValue, at: At, scope: string): SourcePropertyValue {
	if (value === null || (value.kind === "gradient" && value.gradient === null)) return { kind: "remove" };
	const edits = editsFor(row, value, at);
	const tokens = row.rule.kind === "toggles" ? new Set(toggledOf(at.scoped, row.rule.set)) : new Set<string>();
	for (const edit of edits) {
		if (edit.remove) tokens.delete(edit.token);
		else tokens.add(edit.token);
	}
	return tokens.size
		? { kind: "binding", tokens: [...tokens].map((token) => `${scope}${token}`) }
		: { kind: "remove" };
}

/** The numeric control's exact displayed unit, independently of candidate token spelling. */
export function propertyNumericSample(row: Row, value: RowValue): string | undefined {
	if (value?.kind !== "value") return;
	const raw = value.value;
	const custom = /^(-?)\[([^\]]+)\]$/.exec(raw);
	if (custom) return `${custom[1]}${custom[2]}`;
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return;
	const unit = row.rule.kind === "length" ? row.rule.unit : row.rule.kind === "border-width" ? "px" : undefined;
	if (unit === undefined) return;
	return unit === "spacing"
		? `calc(var(--spacing) * ${raw})`
		: `${raw}${unit === "count" ? "" : unit === "percent" ? "%" : unit}`;
}
