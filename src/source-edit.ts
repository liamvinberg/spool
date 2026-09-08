import type {
	SourcePropertyExpectation,
	SourcePropertyNative,
	SourcePropertyPreviewTemplate,
	SourcePropertyReading,
	SourcePropertyValue,
} from "./source-property";
import {
	type SourcePropertyGroupExpectation,
	type SourcePropertyGroupTarget,
	type SourcePropertyGroupValue,
	samePropertyGroupTarget,
} from "./source-property-group";
import type { SourceStructuralExpectation, SourceStructuralParent } from "./source-structure";

/** Purpose is captured before reading source and retained through completion and recovery. */
export type SourceOperation =
	| { kind: "literal"; field?: string }
	| { kind: "property"; property: string; scope: string }
	| { kind: "properties"; target: SourcePropertyGroupTarget }
	| { kind: "delete" };

export function isPropertyOperation(
	operation: SourceOperation,
): operation is Extract<SourceOperation, { kind: "property" | "properties" }> {
	return operation.kind === "property" || operation.kind === "properties";
}

/** Requested value is separate from the original source operation's authority. */
export type SourceChange =
	| { kind: "literal"; text: string }
	| { kind: "property"; value: SourcePropertyValue }
	| { kind: "properties"; value: SourcePropertyGroupValue }
	| { kind: "delete" };

export function sameSourceOperation(a: SourceOperation, b: SourceOperation): boolean {
	if (a.kind === "literal") return b.kind === "literal" && a.field === b.field;
	if (a.kind === "property") return b.kind === "property" && a.property === b.property && a.scope === b.scope;
	if (a.kind === "properties") return b.kind === "properties" && samePropertyGroupTarget(a.target, b.target);
	return b.kind === "delete";
}

/** Transient source authority shared by canvas input, frame delivery and history. */
export interface SourceOccurrence {
	/** Original native presentation, not part of source identity or write authority. */
	propertyNative?: SourcePropertyNative | undefined;
	structure?: { parent: string; source?: SourceStructuralParent | undefined } | undefined;
	absent?: boolean | undefined;
	field?: string | undefined;
	publication: string;
	cell: string;
	occurrence: string;
	invocation: string;
	value: string;
	context: string;
	provenance?: string | undefined;
}

export function sameSourceOccurrence(a: SourceOccurrence, b: SourceOccurrence): boolean {
	return (
		a.publication === b.publication &&
		a.cell === b.cell &&
		a.occurrence === b.occurrence &&
		a.invocation === b.invocation &&
		a.value === b.value &&
		a.context === b.context &&
		a.provenance === b.provenance &&
		a.field === b.field &&
		a.absent === b.absent &&
		a.structure?.parent === b.structure?.parent &&
		JSON.stringify(a.structure?.source) === JSON.stringify(b.structure?.source)
	);
}

export interface SourceUse {
	frame: string;
	original: SourceOccurrence;
	visible: boolean;
}
export interface SourceInventory {
	frame: string;
	publication: string;
	uses: { original: SourceOccurrence; visible: boolean }[];
	unknown: number;
}
export interface SourceReach {
	unverified?: UseOutcome[];
	uses: SourceUse[];
	unmounted: string[];
	unknown: string[];
}

export interface SourceRead {
	propertyPreview?: SourcePropertyPreviewTemplate;
	property?: SourcePropertyReading;
	structure?: SourceStructuralExpectation;
	operation: SourceOperation;
	handle: string;
	owner: string;
	generation: number;
	original: SourceOccurrence;
	source: string;
	role: "literal-child" | "literal-attribute" | "factory-literal" | "structural-unit";
	cell?: string;
	field?: string;
	scope?: "definition" | "call-site";
	repeated?: boolean;
	reach?: SourceReach;
	value: string;
}

export type SourceDescription = Omit<SourceRead, "handle" | "owner" | "generation">;

export interface SourceReceipt {
	operation: SourceOperation;
	field?: string | undefined;
	handle: string;
	owner: string;
}

export interface RetainedValues {
	structure?: import("./source-structure").SourceStructureState;
	childValues?: Record<string, string | readonly string[] | null>;
	attributes?: Record<string, Record<string, { cell: string; absent: boolean }>>;
	stamps?: Record<string, string>;
	locations?: Record<string, string>;
	id: string;
	shape: string;
	sequence: number;
	values: Record<string, string>;
	owners: Record<string, string>;
	css: string;
	bundledCss: string;
}

export interface SourcePublication {
	expected:
		| { kind: "literal"; value: string; absent: boolean }
		| SourcePropertyExpectation
		| SourcePropertyGroupExpectation
		| SourceStructuralExpectation;
	admission: { token: string; expires: number };
	owner: string;
	frame: string;
	cell?: string;
	targets?: SourceOccurrence[];
	related?: SourcePublication[];
	failures?: UseOutcome[];
	before: string;
	compatibleBefore?: string[];
	packet: RetainedValues;
	generation: number;
	original: SourceOccurrence;
	receipt: SourceReceipt;
}

export type RenderOutcome =
	| "verified"
	| "mismatching"
	| "pending"
	| "failed"
	| "unverified"
	| "unmounted"
	| "inactive"
	| "constrained";
export interface UseOutcome {
	frame?: string;
	occurrence: string;
	installation: "installed" | "refused";
	rendered: RenderOutcome;
	observed?: string;
	reason?: string;
	uses?: UseOutcome[];
}

export type SourceResult =
	| {
			ok: true;
			source: "saved" | "unchanged";
			publication: SourcePublication | null;
			receipt?: SourceReceipt;
			reason?: string;
	  }
	| { ok: false; reason: string; current?: SourceChange };

/** A successful occurrence cannot conceal another occurrence's delivery result. */
export function combineUseOutcomes(uses: UseOutcome[], occurrence = ""): UseOutcome {
	const order: RenderOutcome[] = [
		"failed",
		"mismatching",
		"pending",
		"unverified",
		"unmounted",
		"constrained",
		"inactive",
		"verified",
	];
	const worst = order.map((state) => uses.find((use) => use.rendered === state)).find((use) => use !== undefined);
	return { ...(worst ?? { occurrence, installation: "refused", rendered: "unverified" }), uses };
}
