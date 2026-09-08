/** A binding retains authored references; a custom value explicitly detaches them. */
export type SourcePropertyValue =
	| { kind: "binding"; tokens: readonly string[] }
	| { kind: "custom"; value: string }
	| { kind: "remove" };

/** Declarations and their nested conditions come from the captured project compiler. */
export interface SourcePropertyEffect {
	owner: string | null;
	path: readonly string[];
	property: string;
	value: string;
	important: boolean;
}

/** Independent source expectation, evaluated in each occurrence's native context. */
export interface SourcePropertyExpectation {
	kind: "property";
	property: string;
	scope: string;
	className: string;
	absent: boolean;
	effects: readonly SourcePropertyEffect[];
	css: string;
}
