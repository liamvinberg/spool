/** Canonical membership and unchanged factory shapes, derived from captured source. */
export interface SourceStructureState {
	lists: Record<string, readonly string[]>;
	optional: Record<string, boolean>;
	factories: Record<string, string>;
}

/** Render verification uses the source owner's canonical result, not the installed packet as its oracle. */
export interface SourceStructuralExpectation {
	kind: "structure";
	site: string;
	state: SourceStructureState;
	fallback?: { source: string; value: string };
}
