/** Canonical membership and unchanged factory shapes, derived from captured source. */
export interface SourceStructureState {
	lists: Record<string, readonly string[]>;
	optional: Record<string, boolean>;
	factories: Record<string, string>;
}

/** Canonical native parent and authored call ancestry, stable across explicit reload. */
export interface SourceStructuralParent {
	site: string;
	/** Calls from the owning call site through the native parent; empty verifies every use of the parent source. */
	chain: readonly string[];
}

/** Render verification uses the source owner's canonical result, not the installed packet as its oracle. */
export interface SourceStructuralExpectation {
	kind: "structure";
	site: string;
	parent?: SourceStructuralParent;
	state: SourceStructureState;
	fallback?: { source: string; value: string };
}
