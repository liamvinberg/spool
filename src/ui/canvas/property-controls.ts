import { toggledOf } from "../../properties/families";
import { type At, editsFor, type Row, type RowValue } from "../../properties/rows";

/** What a control asks to write: tokens to wear, a value of its own, or nothing at all. */
export type PropertyValue =
	| { kind: "binding"; tokens: readonly string[] }
	| { kind: "custom"; value: string }
	| { kind: "remove" };

/** What a control draws: the tokens the element wears for one property, and what they come to. */
export interface PropertyReading {
	tokens: readonly string[];
	/** the value as it is written, in the unit the author chose */
	authored?: string;
	/** the theme reference the value is bound to, the custom value it is, or nothing set */
	binding: { kind: "page" } | { kind: "custom" } | { kind: "reference"; name: string; value?: string };
	/** the value as the frame draws it */
	native?: string;
}

/** What a control is handed to write with; a rail with nothing to write through hands it none. */
export interface PropertyControls {
	/** which element, under which scope, these controls are about */
	subject: string;
	/** that subject as this rail last read it, which is what a re-read replaces */
	identity: string;
	begin(property: string): void;
	preview(property: string, value: PropertyValue, sampleValue?: string): void;
	apply(property: string, value: PropertyValue): void;
	/** Several properties one gesture decides together, saved as one operation. */
	applyFields(changes: readonly { property: string; value: PropertyValue }[]): void;
	finish(commit: boolean): void;
}

/** Every control writes; a reading row writes nothing. */
export function writableProperty(row: Row): boolean {
	return row.primitive !== "read";
}

/**
 * The CSS property a row's request is about.
 *
 * A row is a control, and two controls can be about one property: the width
 * field and the width mode menu both author the element's width, so a mode
 * change is a width request rather than a request about a control's own name.
 */
export function propertyNameOf(row: Row): string {
	return row.rule.kind === "size-mode" ? (row.rule.axis === "w" ? "width" : "height") : row.property;
}

/** The tokens a row's change comes to, spelled under the scope it is written in. */
export function propertyControlValue(row: Row, value: RowValue, at: At, scope: string): PropertyValue {
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
