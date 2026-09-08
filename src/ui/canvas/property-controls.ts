import { toggledOf } from "../../properties/families";
import { type At, editsFor, type Row, type RowValue } from "../../properties/rows";
import type { SourcePropertyReading, SourcePropertyValue } from "../../source-property";

export interface PropertyDescription {
	reading?: SourcePropertyReading | undefined;
	reason?: string;
}

export interface PropertyControls {
	identity: string;
	describe(property: string): Promise<PropertyDescription | undefined>;
	begin(property: string): void;
	preview(property: string, value: SourcePropertyValue, sampleValue?: string): void;
	apply(property: string, value: SourcePropertyValue): void;
	finish(commit: boolean): void;
}

export function appearanceProperty(row: Row): boolean {
	return ["appearance", "fill", "stroke", "text"].includes(row.section);
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
