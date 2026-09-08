export type NativeKeywordProperty =
	| "text-align"
	| "text-transform"
	| "text-decoration-line"
	| "font-style"
	| "white-space"
	| "object-fit"
	| "text-overflow";

export type NativeKeywordResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };

const keywords: Record<NativeKeywordProperty, readonly string[]> = {
	"text-align": ["start", "end", "left", "right", "center", "justify"],
	"text-transform": ["none", "uppercase", "lowercase", "capitalize"],
	"text-decoration-line": ["none", "underline", "overline", "line-through"],
	"font-style": ["normal", "italic", "oblique"],
	"white-space": ["normal", "pre", "nowrap", "pre-wrap", "pre-line", "break-spaces"],
	"object-fit": ["fill", "contain", "cover", "none", "scale-down"],
	"text-overflow": ["clip", "ellipsis"],
};

function blockContainer(display: string): boolean {
	return ["block", "flow-root", "inline-block", "list-item", "table-cell", "table-caption"].includes(display);
}

/** Compare a resolved declaration; the caller owns its source, cascade and inherited/default proof. */
export function nativeKeyword(
	element: Element,
	property: NativeKeywordProperty,
	expectedValue: string,
): NativeKeywordResult {
	const unknown = (reason: string): NativeKeywordResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this keyword needs a connected native document context");
	const style = view.getComputedStyle(element);
	if (element.getClientRects().length === 0 || style.visibility !== "visible" || style.contentVisibility === "hidden")
		return unknown("this keyword has no rendered native host");
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(":root{}");
	const rule = sheet.cssRules[0];
	if (!(rule instanceof CSSStyleRule)) return unknown("the native keyword parser is unavailable");
	rule.style.setProperty(property, expectedValue);
	const expected = rule.style.getPropertyValue(property).trim();
	const words = expected.split(/\s+/);
	if (
		!expected ||
		words.some((word) => !keywords[property].includes(word)) ||
		(property !== "text-decoration-line" && words.length !== 1)
	)
		return unknown("this keyword needs a resolved supported declaration");
	if (property === "object-fit") {
		if (!(element instanceof HTMLImageElement)) return unknown("object fit needs a decoded native image");
		if (!element.complete || element.naturalWidth === 0 || element.naturalHeight === 0)
			return unknown("object fit needs a decoded native image");
		if (element.clientWidth === 0 || element.clientHeight === 0)
			return unknown("object fit needs visible native image dimensions");
	} else if (["IMG", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED", "INPUT"].includes(element.tagName)) {
		return unknown("this text keyword needs a replaced-host applicability proof");
	}
	if (property === "text-align" && !blockContainer(style.display))
		return unknown("text alignment needs a native block container");
	if (property === "text-overflow") {
		if (
			!blockContainer(style.display) ||
			style.writingMode !== "horizontal-tb" ||
			!["hidden", "clip"].includes(style.overflowX) ||
			!["nowrap", "pre"].includes(style.whiteSpace) ||
			element.clientWidth === 0 ||
			element.scrollWidth <= element.clientWidth ||
			element.children.length !== 0 ||
			!element.textContent?.trim()
		)
			return unknown("text overflow needs actual clipped single-line text in a horizontal block container");
	}
	if (property === "text-decoration-line") {
		for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement)
			if (view.getComputedStyle(ancestor).textDecorationLine !== "none")
				return unknown("ancestor text decoration needs a propagation proof");
	}
	const observed = style.getPropertyValue(property).trim();
	if (!observed) return unknown("this keyword has no resolved native value");
	rule.style.removeProperty(property);
	rule.style.setProperty(property, observed);
	const normalized = rule.style.getPropertyValue(property).trim();
	if (!normalized) return unknown("this keyword has no supported native serialization");
	return { kind: "known", matches: normalized === expected, observed };
}
