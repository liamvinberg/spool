/** Transient source authority shared by canvas input, frame delivery and history. */
export interface SourceOccurrence {
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
		a.absent === b.absent
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
	uses: SourceUse[];
	unmounted: string[];
	unknown: string[];
}

export interface SourceRead {
	handle: string;
	owner: string;
	generation: number;
	original: SourceOccurrence;
	source: string;
	role: "literal-child" | "literal-attribute" | "factory-literal";
	cell?: string;
	field?: string;
	scope?: "definition" | "call-site";
	repeated?: boolean;
	reach?: SourceReach;
	value: string;
}

export type SourceDescription = Omit<SourceRead, "handle" | "owner" | "generation">;

export interface SourceReceipt {
	handle: string;
	owner: string;
}

export interface RetainedValues {
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

export type RenderOutcome = "verified" | "mismatching" | "pending" | "failed" | "unverified" | "unmounted";
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
	| { ok: false; reason: string };

/** A successful occurrence cannot conceal another occurrence's delivery result. */
export function combineUseOutcomes(uses: UseOutcome[], occurrence = ""): UseOutcome {
	const order: RenderOutcome[] = ["failed", "mismatching", "pending", "unverified", "unmounted", "verified"];
	const worst = order.map((state) => uses.find((use) => use.rendered === state)).find((use) => use !== undefined);
	return { ...(worst ?? { occurrence, installation: "refused", rendered: "unverified" }), uses };
}
