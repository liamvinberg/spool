import { toggledOf } from "../../properties/families";
import { type At, editsFor, type Row, type RowValue } from "../../properties/rows";
import type { SourcePropertyReading, SourcePropertyValue } from "../../source-property";

export interface PropertyControls {
	identity: string;
	describe(property: string): Promise<SourcePropertyReading | undefined>;
	begin(property: string): void;
	preview(property: string, value: SourcePropertyValue): void;
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
