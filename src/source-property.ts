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
	/** Selected compiler paths, including conditions retained from removed declarations. */
	scopePaths: readonly (readonly string[])[];
	effects: readonly SourcePropertyEffect[];
	css: string;
}

/** Read-only proposed effects, bound to an existing edit and each installed frame. */
export interface SourcePropertyPreview {
	generation: number;
	revision: number;
	value: string;
	frames: readonly { publication: string; css: string; bundledCss: string }[];
	/**
	 * The element's own proposed declarations, where an inline member owns the
	 * write. An empty value is the removal of that declaration. A class-owned
	 * write carries none of these: its preview is the compiled sheet.
	 */
	inline?: readonly { property: string; value: string }[];
}

/** Read-only original native presentation; it does not confer source authority. */
export interface SourcePropertyNative {
	property: string;
	value: string;
}

export interface SourcePropertyReading {
	tokens: readonly string[];
	/**
	 * Which authored source declares this property's winning effects here.
	 * `mixed` is a reading that cannot attribute them to one source; it claims no
	 * value, and a write against it refuses with the reason before saving.
	 */
	source: "class" | "style" | "declaration" | "mixed";
	/** One compiler-proven custom declaration, preserving its authored unit. */
	authored?: string;
	binding:
		| { kind: "page" }
		| { kind: "custom" }
		| { kind: "reference"; name: string; value?: string }
		| { kind: "mixed" };
	native?: string;
}

export const propertySamplePlaceholder = "var(--spool-property-input)";

/** A once-compiled temporary declaration; samples replace only its value marker. */
export interface SourcePropertyPreviewTemplate {
	placeholder: string;
	declarations: readonly { property: string; value: string }[];
	plan: SourcePropertyPreview;
}
