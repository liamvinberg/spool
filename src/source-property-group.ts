import type { SourcePropertyEffect, SourcePropertyValue } from "./source-property";

/** A grouped read captures its intended source scope before any values are planned. */
export type SourcePropertyGroupTarget =
	| { kind: "fields"; fields: readonly { property: string; scope: string }[] }
	| { kind: "remove-scope"; scope: string }
	| { kind: "tokens" };

export type SourcePropertyGroupValue =
	| { kind: "fields"; changes: readonly { property: string; scope: string; value: SourcePropertyValue }[] }
	| { kind: "remove-scope"; scope: string }
	| { kind: "tokens"; add: readonly string[]; remove: readonly string[] };

export function propertyGroupTarget(value: SourcePropertyGroupValue): SourcePropertyGroupTarget {
	if (value.kind === "fields")
		return { kind: "fields", fields: value.changes.map(({ property, scope }) => ({ property, scope })) };
	return value.kind === "remove-scope" ? { kind: "remove-scope", scope: value.scope } : { kind: "tokens" };
}

export function samePropertyGroupTarget(a: SourcePropertyGroupTarget, b: SourcePropertyGroupTarget): boolean {
	if (a.kind === "fields")
		return (
			b.kind === "fields" &&
			a.fields.length === b.fields.length &&
			a.fields.every(
				(field, index) => field.property === b.fields[index]?.property && field.scope === b.fields[index]?.scope,
			)
		);
	if (a.kind === "remove-scope") return b.kind === "remove-scope" && a.scope === b.scope;
	return b.kind === "tokens";
}

/** Compiler effects remain explicit when an action has no single UI property. */
export interface SourcePropertyGroupExpectation {
	kind: "properties";
	className: string;
	absent: boolean;
	css: string;
	selections: readonly (({ kind: "field"; property: string } | { kind: "effects" }) & {
		scope: string;
		roots: readonly string[];
		scopePaths: readonly (readonly string[])[];
		effects: readonly SourcePropertyEffect[];
		observations: readonly {
			property: string;
			roots: readonly string[];
			scopePaths: readonly (readonly string[])[];
			effects: readonly SourcePropertyEffect[];
		}[];
	})[];
}
