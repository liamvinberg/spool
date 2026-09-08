/** A binding retains authored references; a custom value explicitly detaches them. */
export type SourcePropertyValue =
	| { kind: "binding"; tokens: readonly string[] }
	| { kind: "custom"; value: string }
	| { kind: "remove" };

export interface SourcePropertyEnvironment {
	direction: "ltr" | "rtl";
	writingMode: string;
}

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

/** Read-only proposed effects, bound to an existing edit and each installed frame. */
export interface SourcePropertyPreview {
	generation: number;
	revision: number;
	value: string;
	frames: readonly { publication: string; css: string; bundledCss: string }[];
}

/** Read-only original native presentation; it does not confer source authority. */
export interface SourcePropertyNative {
	property: string;
	value: string;
}

export interface SourcePropertyReading {
	tokens: readonly string[];
	/** One compiler-proven custom declaration, preserving its authored unit. */
	authored?: string;
	binding:
		| { kind: "page" }
		| { kind: "custom" }
		| { kind: "reference"; name: string; value?: string }
		| { kind: "mixed" };
	native?: string;
}
