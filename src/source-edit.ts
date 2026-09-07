/** Transient source authority shared by canvas input, frame delivery and history. */
export interface SourceOccurrence {
	publication: string;
	cell: string;
	occurrence: string;
	invocation: string;
	value: string;
	context: string;
}

export function sameSourceOccurrence(a: SourceOccurrence, b: SourceOccurrence): boolean {
	return (
		a.publication === b.publication &&
		a.cell === b.cell &&
		a.occurrence === b.occurrence &&
		a.invocation === b.invocation &&
		a.value === b.value &&
		a.context === b.context
	);
}

export interface SourceRead {
	handle: string;
	owner: string;
	generation: number;
	original: SourceOccurrence;
	source: string;
	role: "literal-child";
	value: string;
}

export interface SourceReceipt {
	handle: string;
	owner: string;
}

export interface RetainedValues {
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
	before: string;
	compatibleBefore?: string[];
	packet: RetainedValues;
	generation: number;
	original: SourceOccurrence;
	receipt: SourceReceipt;
}

export type RenderOutcome = "verified" | "mismatching" | "pending" | "failed" | "unverified" | "unmounted";
export interface UseOutcome {
	occurrence: string;
	installation: "installed" | "refused";
	rendered: RenderOutcome;
	observed?: string;
	reason?: string;
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
