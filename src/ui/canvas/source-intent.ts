import type {
	SourceChange,
	SourceDescription,
	SourceOccurrence,
	SourceOperation,
	SourcePublication,
} from "../../source-edit";
import type { SelectionEntry } from "../api";
import type { PickedSelection } from "./overlays";
import { parseStampRef } from "./protocol";

/** Presentation of an original attempt, never permission to write source. */
export interface SourceIntent {
	id: string;
	frame: string;
	selector: string;
	selection: readonly SelectionEntry[];
	operation: SourceOperation;
	change?: SourceChange;
	expected?: SourcePublication["expected"];
	action: string;
	field?: string;
	original?: SourceOccurrence;
	source?: string;
	cell?: string;
	resolves?: string;
	role?: SourceDescription["role"];
	scope?: string;
	inverse?: "undo" | "redo";
}

export function sourceIntent(pick: PickedSelection, entries: readonly SelectionEntry[], field?: string): SourceIntent {
	const stamp = parseStampRef(pick.source);
	const selection = entries.filter(
		(entry) => entry.kind === "element" && entry.frame === pick.frame && entry.selector === pick.selector,
	);
	return {
		id: crypto.randomUUID(),
		frame: pick.frame,
		selector: pick.selector,
		selection: selection.length
			? selection
			: stamp
				? [
						{
							kind: "element",
							frame: pick.frame,
							selector: pick.selector,
							name: pick.tag,
							path: `design/${stamp.rel}`,
							lines: [stamp.line, stamp.line],
							excerpt: pick.outerHtml.slice(0, 240),
						},
					]
				: [],
		operation: field ? { kind: "literal", field } : { kind: "literal" },
		action: field ? `change ${field}` : "change text",
		...(field ? { field } : {}),
	};
}

export function attributedIntent(intent: SourceIntent, read: SourceDescription): SourceIntent {
	return {
		...intent,
		original: read.original,
		source: read.source,
		role: read.role,
		...(read.scope ? { scope: read.scope } : {}),
		...(read.cell ? { cell: read.cell } : {}),
	};
}

export function inverseIntent(intent: SourceIntent, way: "undo" | "redo"): SourceIntent {
	const { change: _forward, expected: _expected, ...original } = intent;
	return {
		...original,
		id: crypto.randomUUID(),
		resolves: intent.id,
		inverse: way,
		action: `${way} ${intent.action}`,
	};
}

export function intentText(intent: SourceIntent): string | undefined {
	return intent.change?.kind === "literal" ? intent.change.text : undefined;
}

export function preparedHelp(intent: SourceIntent, reason: string, saved: boolean): string {
	return [
		`I tried to ${intent.action}${intent.change?.kind === "literal" && !(intent.expected?.kind === "literal" && intent.expected.absent) ? ` to ${JSON.stringify(intent.change.text)}` : ""}. ${reason}`,
		...(intent.operation.kind === "property"
			? [`Property: ${intent.operation.property}. Property scope: ${intent.operation.scope}.`]
			: []),
		...(intent.change?.kind === "property" ? [`Requested value: ${JSON.stringify(intent.change.value)}.`] : []),
		saved
			? "Inspect the saved source and the affected app to diagnose why the result is missing. Ask before a reload that would reset application state. Do not repeat an acknowledged source write."
			: "Inspect the current source and reconcile my requested change with it, preserving unrelated edits. Confirm the original target before applying the change; do not replay an uncertain save.",
		...(intent.expected?.kind === "literal" && intent.field
			? [
					`Requested result: ${intent.field} ${intent.expected.absent ? "is absent" : `is present with value ${JSON.stringify(intent.expected.value)}`}.`,
				]
			: []),
		`Target: ${intent.frame}, ${intent.selector}.`,
		`Source: ${intent.source ?? intent.selection.find((entry) => entry.kind === "element")?.path ?? "not attributed"}.`,
		`Role: ${intent.role ?? "not established"}. Scope: ${intent.scope ?? "not established"}.`,
		...(intent.original
			? [
					`Original occurrence: ${intent.original.occurrence}. Original value: ${JSON.stringify(intent.original.value)}. Render context: ${intent.original.context}.`,
				]
			: []),
	].join("\n\n");
}

export type AgentRequest =
	| { id: string; retire: readonly string[]; thread?: never; prepared?: never }
	| {
			id: string;
			thread: string;
			retire?: never;
			/** A generic request clears the old recovery target without adding words. */
			prepared?: { intent: string; text: string; selection: readonly SelectionEntry[] };
	  };
