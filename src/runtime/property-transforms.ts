export type NativeTransformProperty = "transform" | "scale" | "rotate" | "translate";

export type NativeTransformResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const anglePattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:deg|grad|rad|turn)$/i;

/** Native parsing resolves absolute lengths and angles without attaching a probe to the document. */
function transformMatrix(property: NativeTransformProperty, value: string): DOMMatrix | undefined {
	if (value === "none") return new DOMMatrix();
	try {
		if (property === "transform") return new DOMMatrix(value);
		const parts = value.split(/\s+/);
		if (property === "scale") {
			if (parts.length > 3) return;
			const factors = parts.map((part) => {
				const percentage = part.endsWith("%");
				const scalar = percentage ? part.slice(0, -1) : part;
				return numberPattern.test(scalar) ? Number(scalar) / (percentage ? 100 : 1) : Number.NaN;
			});
			if (factors.some((factor) => !Number.isFinite(factor))) return;
			const x = factors[0];
			if (x === undefined) return;
			return new DOMMatrix().scale(x, factors[1] ?? x, factors[2] ?? 1);
		}
		if (property === "rotate") {
			const rotation = parts.at(-1);
			if (!rotation || !anglePattern.test(rotation)) return;
			if (parts.length === 1) return new DOMMatrix(`rotate(${rotation})`);
			if (parts.length === 2 && ["x", "y", "z"].includes(parts[0]!))
				return new DOMMatrix(`rotate${parts[0]!.toUpperCase()}(${rotation})`);
			if (parts.length === 4 && parts.slice(0, 3).every((part) => numberPattern.test(part)))
				return new DOMMatrix(`rotate3d(${parts.join(",")})`);
			return;
		}
		if (parts.length > 3 || value.includes("%")) return;
		return new DOMMatrix(`translate3d(${parts[0]},${parts[1] ?? "0px"},${parts[2] ?? "0px"})`);
	} catch {
		return;
	}
}

function sameMatrix(left: DOMMatrix, right: DOMMatrix): boolean {
	const values = right.toFloat64Array();
	return left.toFloat64Array().every((value, index) => value === values[index]);
}

function affine(matrix: DOMMatrix): boolean {
	return (
		matrix.toFloat64Array().every(Number.isFinite) &&
		matrix.m14 === 0 &&
		matrix.m24 === 0 &&
		matrix.m34 === 0 &&
		matrix.m44 === 1
	);
}

/** The caller supplies the complete resolved declaration and owns source/cascade/axis composition. */
export function nativeTransform(
	element: Element,
	property: NativeTransformProperty,
	expectedValue: string,
): NativeTransformResult {
	const unknown = (reason: string): NativeTransformResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this transform needs a connected native document context");
	if (!(element instanceof HTMLElement)) return unknown("this transform needs an HTML reference-box proof");
	const style = view.getComputedStyle(element);
	if (element.getClientRects().length === 0 || style.visibility !== "visible" || style.contentVisibility === "hidden")
		return unknown("this transform has no rendered native host");
	if (
		["table-column", "table-column-group"].includes(style.display) ||
		(style.display === "inline" &&
			!["IMG", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED", "INPUT"].includes(element.tagName))
	)
		return unknown("this native box is not a proven transformable host");
	for (let host: Element | null = element; host; host = host.parentElement) {
		const context = host === element ? style : view.getComputedStyle(host);
		if (!["1", "normal"].includes(context.getPropertyValue("zoom")))
			return unknown("this transform needs a zoom context proof");
		if (context.perspective !== "none") return unknown("this transform needs a perspective context proof");
		const surrounding = transformMatrix("transform", context.transform);
		if (!surrounding || !affine(surrounding))
			return unknown("this transform needs a finite affine native context proof");
	}
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(":root{}");
	const rule = sheet.cssRules[0];
	if (!(rule instanceof CSSStyleRule)) return unknown("the native transform parser is unavailable");
	rule.style.setProperty(property, expectedValue);
	const declaration = rule.style.getPropertyValue(property).trim();
	const expected = declaration ? transformMatrix(property, expectedValue.trim().toLowerCase()) : undefined;
	if (!expected) return unknown("this transform needs a resolved absolute declaration");
	if (!affine(expected)) return unknown("this transform needs a finite affine matrix proof");
	if (property !== "transform") {
		const represented = transformMatrix(property, declaration);
		if (!represented || !sameMatrix(expected, represented))
			return unknown("this transform needs observable native longhand precision");
	}
	const observed = style.getPropertyValue(property).trim();
	let actual: DOMMatrix | undefined;
	if (property === "transform") {
		if (observed === "none") actual = new DOMMatrix();
		else {
			if (typeof element.computedStyleMap !== "function")
				return unknown("this native transform needs Typed OM matrix access");
			try {
				const native = element.computedStyleMap().get("transform");
				if (native && "toMatrix" in native && typeof native.toMatrix === "function") {
					const value: unknown = native.toMatrix();
					if (value instanceof DOMMatrix) actual = value;
				}
			} catch {
				return unknown("this native transform needs an absolute Typed OM matrix proof");
			}
		}
	} else actual = observed ? transformMatrix(property, observed) : undefined;
	if (!actual) return unknown("this native transform needs a resolved absolute value");
	if (!affine(actual)) return unknown("this native transform needs a finite affine matrix proof");
	const matches = sameMatrix(expected, actual);
	if (!matches && property !== "transform" && /(?:rad|grad|turn|cm|mm|in|pt|pc|q)\b/i.test(declaration))
		return unknown("this absolute unit conversion needs a more precise native longhand value");
	return { kind: "known", matches, observed };
}
