export type NativeKeywordProperty =
	| "text-align"
	| "text-transform"
	| "text-decoration-line"
	| "font-style"
	| "white-space"
	| "object-fit"
	| "text-overflow"
	| "display"
	| "flex-direction"
	| "flex-wrap"
	| "align-items"
	| "justify-content"
	| "align-self"
	| "position"
	| "overflow-x"
	| "overflow-y";

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
	display: [
		"block",
		"inline",
		"inline-block",
		"flex",
		"inline-flex",
		"grid",
		"inline-grid",
		"flow-root",
		"contents",
		"list-item",
		"table",
		"inline-table",
		"table-row-group",
		"table-header-group",
		"table-footer-group",
		"table-row",
		"table-cell",
		"table-column-group",
		"table-column",
		"table-caption",
		"none",
	],
	"flex-direction": ["row", "row-reverse", "column", "column-reverse"],
	"flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
	"align-items": ["normal", "stretch", "center", "start", "end", "flex-start", "flex-end", "baseline", "last"],
	"justify-content": [
		"normal",
		"stretch",
		"center",
		"start",
		"end",
		"flex-start",
		"flex-end",
		"left",
		"right",
		"space-between",
		"space-around",
		"space-evenly",
	],
	"align-self": ["auto", "normal", "stretch", "center", "start", "end", "flex-start", "flex-end", "baseline", "last"],
	position: ["static", "relative", "absolute", "fixed", "sticky"],
	"overflow-x": ["visible", "hidden", "clip", "scroll", "auto"],
	"overflow-y": ["visible", "hidden", "clip", "scroll", "auto"],
};

/** Layout keywords read a box, not painted text, so they own their own applicability guards. */
const layoutKeywords = [
	"display",
	"flex-direction",
	"flex-wrap",
	"align-items",
	"justify-content",
	"align-self",
	"position",
	"overflow-x",
	"overflow-y",
];

function flexOrGrid(display: string): boolean {
	return ["flex", "inline-flex", "grid", "inline-grid"].includes(display);
}

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
	// A display keyword decides whether this use renders at all, so it cannot require a rendered host.
	if (
		property !== "display" &&
		(element.getClientRects().length === 0 || style.visibility !== "visible" || style.contentVisibility === "hidden")
	)
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
		(property !== "text-decoration-line" &&
			words.length !== 1 &&
			!(["align-items", "align-self", "justify-content"].includes(property) && words.length === 2))
	)
		return unknown("this keyword needs a resolved supported declaration");
	if (property === "object-fit") {
		if (!(element instanceof HTMLImageElement)) return unknown("object fit needs a decoded native image");
		if (!element.complete || element.naturalWidth === 0 || element.naturalHeight === 0)
			return unknown("object fit needs a decoded native image");
		if (element.clientWidth === 0 || element.clientHeight === 0)
			return unknown("object fit needs visible native image dimensions");
	} else if (
		!layoutKeywords.includes(property) &&
		["IMG", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED", "INPUT"].includes(element.tagName)
	) {
		return unknown("this text keyword needs a replaced-host applicability proof");
	}
	if (["flex-direction", "flex-wrap", "align-items", "justify-content"].includes(property)) {
		if (!flexOrGrid(style.display)) return unknown("this alignment needs a native flexible or grid box");
		if (property !== "justify-content" && !style.display.endsWith("flex"))
			return unknown("this flex keyword needs a native flexible box");
	}
	if (property === "align-self") {
		const parent = element.parentElement;
		if (!parent || !flexOrGrid(view.getComputedStyle(parent).display))
			return unknown("this alignment needs a native flexible or grid item");
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
	// A visible overflow computes to auto whenever the other axis is neither visible nor clip.
	if (
		(property === "overflow-x" || property === "overflow-y") &&
		expected === "visible" &&
		observed === "auto" &&
		!["visible", "clip"].includes(property === "overflow-x" ? style.overflowY : style.overflowX)
	)
		return unknown("this visible overflow is coupled to the other native axis");
	rule.style.removeProperty(property);
	rule.style.setProperty(property, observed);
	const normalized = rule.style.getPropertyValue(property).trim();
	if (!normalized) return unknown("this keyword has no supported native serialization");
	return { kind: "known", matches: normalized === expected, observed };
}
