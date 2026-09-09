import type { SourcePropertyEffect, SourcePropertyExpectation } from "../source-property";
import { type NativeBorderSide, nativeBorderColors } from "./property-border-colors";
import { nativeColor } from "./property-colors";
import { nativeFilter } from "./property-filters";
import { nativeFont } from "./property-fonts";
import { nativeGradient } from "./property-gradients";
import { type NativeKeywordProperty, nativeKeyword } from "./property-keywords";
import { nativeShadow } from "./property-shadows";
import { type NativeTransformProperty, nativeTransform } from "./property-transforms";
import { type NativeTransitionProperty, nativeTransition } from "./property-transitions";

/** A keyword with no `value` has no initial declaration this evaluator can prove for every host. */
const keywordDefaults: Record<NativeKeywordProperty, { value?: string; inherited: boolean }> = {
	"text-align": { value: "start", inherited: true },
	"text-transform": { value: "none", inherited: true },
	"text-decoration-line": { value: "none", inherited: false },
	"font-style": { value: "normal", inherited: true },
	"white-space": { value: "normal", inherited: true },
	"object-fit": { value: "fill", inherited: false },
	"text-overflow": { value: "clip", inherited: false },
	// Every host's own native display comes from the engine's stylesheet, not from one initial value.
	display: { inherited: false },
	"flex-direction": { value: "row", inherited: false },
	"flex-wrap": { value: "nowrap", inherited: false },
	"align-items": { value: "normal", inherited: false },
	"justify-content": { value: "normal", inherited: false },
	"align-self": { value: "auto", inherited: false },
	position: { value: "static", inherited: false },
	"overflow-x": { value: "visible", inherited: false },
	"overflow-y": { value: "visible", inherited: false },
};

/** Hosts the engine's own stylesheet declares layout keywords on, where no initial value is proof. */
const declaringHosts = [
	"IMG",
	"VIDEO",
	"CANVAS",
	"IFRAME",
	"OBJECT",
	"EMBED",
	"INPUT",
	"SELECT",
	"TEXTAREA",
	"BUTTON",
	"DIALOG",
	"DETAILS",
	"SUMMARY",
	"MARQUEE",
];
function keywordProperty(property: string): property is NativeKeywordProperty {
	return Object.hasOwn(keywordDefaults, property);
}

/** Box keywords, whose initial value competes with this host's own engine stylesheet. */
function layoutKeyword(property: NativeKeywordProperty): boolean {
	return ![
		"text-align",
		"text-transform",
		"text-decoration-line",
		"font-style",
		"white-space",
		"object-fit",
		"text-overflow",
	].includes(property);
}

/** Two-axis shorthands the compiler emits whole, which each axis row reads its own half of. */
const axisShorthands: Readonly<Record<string, string>> = {
	"overflow-x": "overflow",
	"overflow-y": "overflow",
	"column-gap": "gap",
	"row-gap": "gap",
};

// Companions whose effect the native applicability guard reads directly from this use.
const outlineGuards = ["outline-style", "--tw-outline-style", "outline-color"];
const decorationGuards = ["text-decoration-line", "text-decoration-style", "text-decoration-color"];

/** Retained single-length rows, with the initial declaration and keywords their native use can show. */
type LengthRow = { initial?: string; inherited: boolean; keywords: readonly string[]; guarded: readonly string[] };

const lengthRows: Readonly<Record<string, LengthRow>> = {
	// The initial outline width is a keyword with no native length, so a cleared use stays unverified.
	"flex-basis": {
		initial: "auto",
		inherited: false,
		keywords: ["auto", "content", "min-content", "max-content", "fit-content"],
		guarded: [],
	},
	"column-gap": { initial: "normal", inherited: false, keywords: ["normal"], guarded: [] },
	"row-gap": { initial: "normal", inherited: false, keywords: ["normal"], guarded: [] },
	"outline-width": { inherited: false, keywords: [], guarded: outlineGuards },
	"outline-offset": { initial: "0px", inherited: false, keywords: [], guarded: outlineGuards },
	"stroke-width": { inherited: true, keywords: [], guarded: ["stroke", "stroke-opacity"] },
	"text-indent": { initial: "0px", inherited: true, keywords: [], guarded: [] },
	"text-decoration-thickness": {
		initial: "auto",
		inherited: false,
		keywords: ["auto", "from-font"],
		guarded: decorationGuards,
	},
	"text-underline-offset": { initial: "auto", inherited: true, keywords: ["auto"], guarded: decorationGuards },
	"-webkit-line-clamp": {
		initial: "none",
		inherited: false,
		keywords: ["none"],
		guarded: ["display", "overflow", "-webkit-box-orient"],
	},
};

const transformProperties: Readonly<Record<string, NativeTransformProperty>> = {
	scale: "scale",
	"scale-x": "scale",
	"scale-y": "scale",
	rotate: "rotate",
	"rotate-x": "transform",
	"rotate-y": "transform",
	skew: "transform",
	"skew-x": "transform",
	"skew-y": "transform",
	translate: "translate",
	"translate-x": "translate",
	"translate-y": "translate",
};

/** Ring and shadow rows are separate source controls over one native box-shadow consumer. */
const shadowProperties = ["box-shadow", "box-shadow color", "ring-width", "ring-offset-width", "ring-color"];

function transitionProperty(property: string): property is NativeTransitionProperty {
	return (
		property === "transition-duration" || property === "transition-delay" || property === "transition-timing-function"
	);
}

type ComposedNative =
	| NativeTransformProperty
	| NativeTransitionProperty
	| "filter"
	| "box-shadow"
	| "font-variant-numeric"
	| "background-image";

type SelectedFamily =
	| { kind: "keyword"; keyword: NativeKeywordProperty }
	| { kind: "length"; row: LengthRow }
	| { kind: "metric"; companion: string; measure: "weight" | "leading" | "spacing" }
	| { kind: "family" }
	| { kind: "color" }
	| { kind: "corner" }
	| { kind: "size" }
	| { kind: "opacity" };

type PropertyFamily =
	| { kind: "composed"; native: ComposedNative }
	| { kind: "border" }
	| { kind: "border-color" }
	| { kind: "radius" }
	| { kind: "axes"; axes: readonly [string, string] }
	| { kind: "box"; box: "padding" | "margin" | "inset" }
	| { kind: "declaration"; row: DeclarationRow }
	| { kind: "size"; native: string }
	| { kind: "selected"; select: SelectedFamily };

const filterProperties = ["filter", "brightness", "contrast", "saturate", "hue-rotate"];
const colorProperties = [
	"color",
	"background-color",
	"outline-color",
	"text-decoration-color",
	"caret-color",
	"accent-color",
	"fill",
	"stroke",
];
const metricRows: Readonly<Record<string, { companion: string; measure: "weight" | "leading" | "spacing" }>> = {
	"font-weight": { companion: "--tw-font-weight", measure: "weight" },
	"line-height": { companion: "--tw-leading", measure: "leading" },
	"letter-spacing": { companion: "--tw-tracking", measure: "spacing" },
};
const boxRow = /^(padding|margin)(?:-(top|right|bottom|left|inline|block|(?:inline|block)-(?:start|end)))?$/;
const insetRow = /^(?:(inset)(?:-(inline|block|(?:inline|block)-(?:start|end)))?|(top|right|bottom|left))$/;

/** One box row's spelling: which native box it writes and which side of it this row is. */
function boxParts(property: string): { box: "padding" | "margin" | "inset"; group: string } | undefined {
	const box = boxRow.exec(property);
	if (box) return { box: box[1] as "padding" | "margin", group: box[2] ?? "" };
	const inset = insetRow.exec(property);
	return inset ? { box: "inset", group: inset[3] ?? inset[2] ?? "" } : undefined;
}
const borderWidthRow = /^border-(?:(?:top|right|bottom|left|inline|block|(?:inline|block)-(?:start|end))-)?width$/;

/** Every retained property is read by exactly one family; an unlisted one has no native proof. */
function propertyFamily(property: string): PropertyFamily | undefined {
	if (Object.hasOwn(transformProperties, property))
		return { kind: "composed", native: transformProperties[property]! };
	if (filterProperties.includes(property)) return { kind: "composed", native: "filter" };
	if (shadowProperties.includes(property)) return { kind: "composed", native: "box-shadow" };
	if (transitionProperty(property)) return { kind: "composed", native: property };
	if (property === "font-variant-numeric" || property === "background-image")
		return { kind: "composed", native: property };
	if (borderWidthRow.test(property)) return { kind: "border" };
	if (borderColorRow.test(property)) return { kind: "border-color" };
	if (property === "border-radius") return { kind: "radius" };
	if (property === "overflow") return { kind: "axes", axes: ["overflow-x", "overflow-y"] };
	if (property === "gap") return { kind: "axes", axes: ["row-gap", "column-gap"] };
	const box = boxParts(property);
	if (box) return { kind: "box", box: box.box };
	if (Object.hasOwn(declarationRows, property)) return { kind: "declaration", row: declarationRows[property]! };
	if (property === "width and height") return { kind: "axes", axes: ["width", "height"] };
	if (Object.hasOwn(sizeRows, property)) return { kind: "size", native: sizeRows[property]! };
	if (keywordProperty(property)) return { kind: "selected", select: { kind: "keyword", keyword: property } };
	if (Object.hasOwn(lengthRows, property))
		return { kind: "selected", select: { kind: "length", row: lengthRows[property]! } };
	if (Object.hasOwn(metricRows, property))
		return { kind: "selected", select: { kind: "metric", ...metricRows[property]! } };
	if (colorProperties.includes(property)) return { kind: "selected", select: { kind: "color" } };
	if (isCorner(property)) return { kind: "selected", select: { kind: "corner" } };
	if (property === "font-family") return { kind: "selected", select: { kind: "family" } };
	if (property === "font-size") return { kind: "selected", select: { kind: "size" } };
	if (property === "opacity") return { kind: "selected", select: { kind: "opacity" } };
	return;
}

/**
 * A row the compiler writes as several native components: each is read on its own, a refusal by
 * any of them is the row's answer, and the row is verified only when every component is.
 */
function componentsOutcome(
	element: Element,
	expected: SourcePropertyExpectation,
	components: readonly string[],
): PropertyOutcome {
	const outcomes = components.map((property) => propertyOutcome(element, { ...expected, property }));
	const refused = outcomes.find((outcome) => outcome.rendered !== "verified" && outcome.rendered !== "mismatching");
	if (refused) return refused;
	return {
		rendered: outcomes.every((outcome) => outcome.rendered === "verified") ? "verified" : "mismatching",
		observed: outcomes.map((outcome) => outcome.observed ?? "").join(" "),
	};
}

const radiusCorners = [
	"border-top-left-radius",
	"border-top-right-radius",
	"border-bottom-right-radius",
	"border-bottom-left-radius",
];

export interface PropertyOutcome {
	rendered: "verified" | "mismatching" | "unverified" | "inactive" | "constrained";
	observed?: string;
	reason?: string;
}

/** Read each use independently. Parsing never adopts a stylesheet or changes the authored document. */
export function propertyOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this use has no native document context");
	if (expected.property === "placeholder color") return propertyOutcome(element, { ...expected, property: "color" });
	if (Object.hasOwn(childRows, expected.property))
		return childrenOutcome(element, expected, childRows[expected.property]!);
	const pseudo = selectedPseudo(expected.scopePaths);
	if (pseudo === undefined) return unverified("this property has no single native pseudo-element context");
	if (pseudo !== "" && !supportedPseudos.includes(pseudo))
		return unverified("this pseudo-element needs its own native context proof");
	const scopes = expected.scopePaths.map((path) => pathCondition(element, path, true, pseudo));
	if (scopes.length === 0) return unverified("the selected property has no compiled condition proof");
	if (!scopes.includes("active")) {
		if (scopes.includes("unverified"))
			return unverified("the selected property condition needs a native context proof");
		return { rendered: "inactive", reason: "the selected compiled condition is inactive for this use" };
	}
	const family = propertyFamily(expected.property);
	if (!family) return unverified("this property needs a native effect proof");
	if (family.kind === "composed") return composedOutcome(element, expected, family.native);
	if (family.kind === "border") return borderOutcome(element, expected);
	if (family.kind === "border-color") return borderColorOutcome(element, expected);
	if (family.kind === "radius") return componentsOutcome(element, expected, radiusCorners);
	if (family.kind === "axes") return componentsOutcome(element, expected, family.axes);
	if (family.kind === "box") return boxOutcome(element, expected, family.box);
	if (family.kind === "declaration") return declarationOutcome(element, expected, family.row);
	if (family.kind === "size") return sizeOutcome(element, expected, family.native);
	return selectedOutcome(element, view, expected, family.select, pseudo);
}

/** One shared declaration selection, then the family that reads the selected value natively. */
function selectedOutcome(
	element: Element,
	view: Window,
	expected: SourcePropertyExpectation,
	select: SelectedFamily,
	pseudo: string,
): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	if (pseudo !== "" && select.kind !== "color")
		return unverified("this property has no native pseudo-element reading");
	const corner = select.kind === "corner";
	const shorthand = axisShorthands[expected.property];
	const length = select.kind === "length" ? select.row : undefined;
	const companion = select.kind === "metric" ? select.companion : undefined;
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const applicable: SourcePropertyEffect[] = [];
	const companions: SourcePropertyEffect[] = [];
	for (const effect of expected.effects) {
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		// Residual native corners are separate components; their source preservation is compiler-proved.
		if (corner && isCorner(effect.property) && effect.property !== expected.property) continue;
		const condition = pathCondition(element, effect.path, effect.owner !== null, pseudo);
		if (condition === "inactive") continue;
		if (condition === "unverified")
			return unverified("this property effect needs a native selector or conditional context proof");
		if (companion && effect.property === companion) companions.push(effect);
		else if (effect.property === expected.property) applicable.push(effect);
		else if (shorthand && effect.property === shorthand) {
			const value = resolvedValue(element, sheet, effect.value);
			if (value === undefined) return unverified("this native axis needs a variable context proof");
			const index = sheet.insertRule(":root {}", sheet.cssRules.length);
			const rule = sheet.cssRules[index];
			if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
			rule.style.setProperty(shorthand, value);
			const component = rule.style.getPropertyValue(expected.property);
			if (!component) return unverified("this native axis has no shorthand component proof");
			applicable.push({ ...effect, property: expected.property, value: component });
		} else if (corner && effect.property === "border-radius") {
			const value = resolvedValue(element, sheet, effect.value);
			if (value === undefined) return unverified("this corner needs a variable context proof");
			const index = sheet.insertRule(":root {}", sheet.cssRules.length);
			const rule = sheet.cssRules[index];
			if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
			rule.style.borderRadius = value;
			const component = rule.style.getPropertyValue(expected.property);
			if (!component) return unverified("this corner has no native shorthand component proof");
			applicable.push({ ...effect, property: expected.property, value: component });
		} else if (!length?.guarded.includes(effect.property))
			return unverified("this property has dependent effects requiring native proof");
	}

	const selection = winningEffect(sheet, applicable);
	if (selection.reason) return unverified(selection.reason);
	const winner = selection.winner;
	if (select.kind === "keyword") {
		const keyword = select.keyword;
		const fallback = keywordDefaults[keyword];
		let value = winner ? resolvedValue(element, sheet, winner.value) : undefined;
		if (winner && value === undefined) return unverified("this keyword needs a resolved variable context");
		if (!winner || value === "inherit" || value === "unset" || value === "initial") {
			if (
				(element instanceof HTMLElement || element instanceof SVGElement) &&
				element.style.getPropertyValue(keyword)
			)
				return unverified("this keyword has an independent inline context requiring proof");
			if (value === "inherit" || (value !== "initial" && fallback.inherited)) {
				const parent = element.parentElement;
				if (!parent) return unverified("this keyword needs a native inherited context proof");
				value = view.getComputedStyle(parent).getPropertyValue(keyword);
			} else if (fallback.value === undefined)
				return unverified(`this ${keyword} has no independent native default declaration`);
			else if (layoutKeyword(keyword) && declaringHosts.includes(element.tagName))
				return unverified("this host's own native stylesheet declares this keyword");
			else value = fallback.value;
		}
		if (value === undefined) return unverified("this keyword has no independent expected declaration");
		const result = nativeKeyword(element, keyword, value);
		return result.kind === "unknown"
			? unverified(result.reason)
			: { rendered: result.matches ? "verified" : "mismatching", observed: result.observed };
	}
	if (length) {
		const context = lengthContext(element, expected.property);
		if (context) return unverified(context);
		if (
			(!winner || winner.owner === null) &&
			(!(element instanceof HTMLElement || element instanceof SVGElement) ||
				element.style.getPropertyValue(expected.property))
		)
			return unverified("this native length has an independent inline context requiring proof");
		let value = winner ? resolvedValue(element, sheet, winner.value) : undefined;
		if (winner && value === undefined) return unverified("this native length needs a resolved variable context");
		if (!winner || value === "inherit") {
			if (length.inherited) {
				const parent = element.parentElement;
				if (!parent) return unverified("this native length needs a native inherited context proof");
				value = view.getComputedStyle(parent).getPropertyValue(expected.property);
			} else value = length.initial;
		}
		if (value === undefined) return unverified("this native length has no independent initial declaration");
		const observed = view.getComputedStyle(element).getPropertyValue(expected.property);
		const counted = expected.property === "-webkit-line-clamp";
		// An SVG stroke width without a unit is a user unit, which is this document's pixel.
		const number = (input: string) =>
			counted
				? nativeCount(input)
				: nativeLength(
						element,
						sheet,
						expected.property,
						expected.property === "stroke-width" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input.trim())
							? `${input.trim()}px`
							: input,
					);
		const keyword = (input: string) =>
			length.keywords.includes(input.trim().toLowerCase()) ? input.trim().toLowerCase() : undefined;
		const wanted = number(value);
		const actual = number(observed);
		const wantedKeyword = keyword(value);
		const actualKeyword = keyword(observed);
		if ((wanted === undefined) === (wantedKeyword === undefined))
			return unverified("this native length has no independent expected declaration");
		if ((actual === undefined) === (actualKeyword === undefined))
			return unverified("this native length needs a native value context proof");
		const matches =
			wantedKeyword === undefined && actualKeyword === undefined
				? wanted === actual
				: wantedKeyword === actualKeyword;
		return { rendered: matches ? "verified" : "mismatching", observed };
	}
	if (select.kind === "family") {
		if (
			(!winner || winner.owner === null) &&
			(!(element instanceof HTMLElement || element instanceof SVGElement) ||
				element.style.getPropertyValue("font-family"))
		)
			return unverified("this font family has an independent inline context requiring proof");
		let value = winner ? resolvedValue(element, sheet, winner.value) : undefined;
		if (winner && value === undefined) return unverified("this font family needs a resolved variable context");
		if (!winner || value === "inherit") {
			const parent = element.parentElement;
			if (!parent) return unverified("this font family needs a native inherited context proof");
			value = view.getComputedStyle(parent).fontFamily;
		}
		if (value === undefined) return unverified("this font family has no independent expected declaration");
		const result = nativeFont(element, "font-family", value);
		return result.kind === "unknown"
			? unverified(result.reason)
			: { rendered: result.matches ? "verified" : "mismatching", observed: result.observed };
	}
	if (select.kind === "metric") {
		const number = (value: string) =>
			select.measure === "weight"
				? nativeWeight(value)
				: select.measure === "spacing"
					? nativeSpacing(element, sheet, value)
					: nativeLineHeight(element, sheet, value);
		const result = winningEffect(sheet, companions);
		if (result.reason) return unverified(result.reason);
		const native = view.getComputedStyle(element);
		let companionMatches = true;
		if (result.winner) {
			const value = resolvedValue(element, sheet, result.winner.value);
			const wanted = value === undefined ? undefined : number(value);
			const observed = native.getPropertyValue(select.companion).trim();
			const actual = number(observed);
			if (wanted === undefined || (actual === undefined && observed !== ""))
				return unverified("this type metric companion needs a native value proof");
			companionMatches = wanted === actual;
		}
		let value: string | undefined;
		if (!winner || winner.value.trim() === "inherit") {
			if (
				!(element instanceof HTMLElement || element instanceof SVGElement) ||
				element.style.getPropertyValue(expected.property)
			)
				return unverified("this type metric has an independent inline context requiring proof");
			const parent = element.parentElement;
			if (!parent) return unverified("this type metric needs an inherited context proof");
			const parentStyle = view.getComputedStyle(parent);
			if (select.measure === "leading" && parentStyle.fontSize !== native.fontSize)
				return unverified("inherited leading needs its original unit context");
			value = parentStyle.getPropertyValue(expected.property);
		} else value = resolvedValue(element, sheet, winner.value);
		const wanted = value === undefined ? undefined : number(value);
		const observed = native.getPropertyValue(expected.property);
		const actual = number(observed);
		if (wanted === undefined || actual === undefined)
			return unverified("this type metric needs a native value context proof");
		return { rendered: companionMatches && wanted === actual ? "verified" : "mismatching", observed };
	}
	if (select.kind === "color") {
		// An inline declaration cannot target a pseudo-element, so it is not a competing context there.
		if (
			!pseudo &&
			(!winner || winner.owner === null) &&
			(!(element instanceof HTMLElement || element instanceof SVGElement) ||
				element.style.getPropertyValue(expected.property))
		)
			return unverified("this color has an independent inline context requiring proof");
		let value = winner ? resolvedValue(element, sheet, winner.value) : undefined;
		if (winner && value === undefined) return unverified("this color needs a resolved variable context");
		if (!winner || value === "inherit") {
			if (expected.property === "caret-color")
				return unverified("inherited caret color needs its original auto context");
			if (!winner && expected.property === "background-color") value = "transparent";
			else if (!winner && expected.property === "accent-color") value = "auto";
			else if (!winner && ["outline-color", "text-decoration-color"].includes(expected.property))
				value = "currentcolor";
			else {
				// A pseudo-element inherits from the element it originates on.
				const parent = pseudo ? element : element.parentElement;
				if (!parent) return unverified("this color needs a native inherited context proof");
				value = view.getComputedStyle(parent).getPropertyValue(expected.property);
			}
		}
		if (value !== undefined && /(?<![\w-])currentcolor(?![\w-])/i.test(value)) {
			// The current color of a pseudo-element is the one it inherits from its originating element.
			const context = pseudo || expected.property !== "color" ? element : element.parentElement;
			if (!context) return unverified("this color needs an independent current color context");
			value = value.replace(/(?<![\w-])currentcolor(?![\w-])/gi, view.getComputedStyle(context).color);
		}
		const context = paintContext(element, expected.property, value, pseudo);
		if (context) return unverified(context);
		const observed = view.getComputedStyle(element, pseudo || null).getPropertyValue(expected.property);
		const normalize = (color: string) =>
			(expected.property === "fill" || expected.property === "stroke") && color.trim() === "none"
				? "none"
				: nativeColor(color);
		const wanted = value === undefined ? undefined : normalize(value);
		const actual = normalize(observed);
		if (wanted === undefined || actual === undefined)
			return unverified("this color needs a variable or native context proof");
		return { rendered: wanted === actual ? "verified" : "mismatching", observed };
	}
	if (select.kind === "size" || corner) {
		if (!winner && !corner) return unverified("this type size needs an inherited context proof");
		const value = resolvedValue(element, sheet, winner?.value ?? "0px");
		const wanted = value === undefined ? undefined : nativeLength(element, sheet, expected.property, value);
		const observed = view.getComputedStyle(element).getPropertyValue(expected.property);
		const parts = observed.trim().split(/\s+/);
		if (
			wanted === undefined ||
			parts.length > (corner ? 2 : 1) ||
			parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?px$/i.test(part))
		)
			return unverified("this property needs a native length context proof");
		return {
			rendered: parts.every((part) => Number.parseFloat(part) === wanted) ? "verified" : "mismatching",
			observed,
		};
	}
	let wanted = 1;
	if (winner) {
		const index = sheet.insertRule(":root {}", sheet.cssRules.length);
		const rule = sheet.cssRules[index];
		if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
		rule.style.setProperty("opacity", winner.value);
		const value = rule.style.getPropertyValue("opacity");
		if (value === "") return unverified("the expected opacity is not a native declaration");
		const number = Number(value.endsWith("%") ? value.slice(0, -1) : value);
		if (!Number.isFinite(number)) return unverified("this opacity needs variable or expression resolution");
		wanted = Math.max(0, Math.min(1, value.endsWith("%") ? number / 100 : number));
	}
	const observed = view.getComputedStyle(element).opacity;
	if (observed === "" || !Number.isFinite(Number(observed)))
		return unverified("this use has no resolved native opacity");
	return { rendered: Number(observed) === wanted ? "verified" : "mismatching", observed };
}

/** Read nested var fallbacks without resolving branches the selected declaration does not use. */
function substituteVariables(
	value: string,
	replace: (name: string, fallback: string | undefined) => string,
): string | undefined {
	let result = "";
	let cursor = 0;
	for (const match of value.matchAll(/\bvar\(/g)) {
		if (match.index < cursor) continue;
		const start = match.index + 4;
		let depth = 1;
		let end = start;
		let comma = -1;
		for (; end < value.length; end++) {
			if (value[end] === "(") depth++;
			else if (value[end] === ")" && --depth === 0) break;
			else if (value[end] === "," && depth === 1 && comma < 0) comma = end;
		}
		if (depth !== 0) return;
		const name = value.slice(start, comma < 0 ? end : comma).trim();
		if (!/^--[\w-]+$/.test(name)) return;
		result += value.slice(cursor, match.index) + replace(name, comma < 0 ? undefined : value.slice(comma + 1, end));
		cursor = end + 1;
	}
	return result + value.slice(cursor);
}

/** Resolve a complete captured native consumer, including independently owned companion inputs. */
function composedOutcome(
	element: Element,
	expected: SourcePropertyExpectation,
	property:
		| NativeTransformProperty
		| NativeTransitionProperty
		| "filter"
		| "box-shadow"
		| "font-variant-numeric"
		| "background-image",
): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const declarations = new Map<string, SourcePropertyEffect[]>();
	const ownsVariable = (name: string) =>
		property === "scale"
			? /^--tw-scale-[xyz]$/.test(name)
			: property === "translate"
				? /^--tw-translate-[xyz]$/.test(name)
				: property === "filter"
					? /^--tw-(?:blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|drop-shadow)$/.test(name)
					: property === "box-shadow"
						? /^--tw-(?:inset-)?(?:ring-(?:inset|color|offset-(?:width|color|shadow)|shadow)|shadow(?:-color|-alpha)?)$/.test(
								name,
							)
						: property === "font-variant-numeric"
							? /^--tw-(?:ordinal|slashed-zero|numeric-(?:figure|spacing|fraction))$/.test(name)
							: property === "background-image"
								? /^--tw-gradient-(?:position|from|via|to|stops|via-stops|(?:from|via|to)-position)$/.test(name)
								: property === "transition-duration"
									? name === "--tw-duration"
									: property === "transition-timing-function"
										? name === "--tw-ease"
										: property === "transform" && /^--tw-(?:rotate-[xyz]|skew-[xy])$/.test(name);
	for (const effect of expected.effects) {
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		const condition = pathCondition(element, effect.path, effect.owner !== null);
		if (condition === "inactive") continue;
		if (condition === "unverified") return unverified("this composed effect needs a native condition proof");
		if (effect.property !== property && !ownsVariable(effect.property))
			return unverified("this composed effect has dependent effects requiring native proof");
		const group = declarations.get(effect.property) ?? [];
		group.push(effect);
		declarations.set(effect.property, group);
	}
	let unresolved = false;
	const resolve = (value: string, seen = new Set<string>()): string => {
		const result = substituteVariables(value, (name, fallback) => {
			if (seen.has(name)) {
				unresolved = true;
				return "";
			}
			const next = new Set([...seen, name]);
			if (!ownsVariable(name)) {
				const resolved = resolvedValue(element, sheet, `var(${name})`);
				if (resolved === undefined) unresolved = true;
				return resolved ?? "";
			}
			const selected = winningEffect(sheet, declarations.get(name) ?? []);
			if (selected.reason) {
				unresolved = true;
				return "";
			}
			let definition = selected.winner?.value;
			if (definition === undefined) {
				const defaultOnly = (rules: CSSRuleList): boolean =>
					[...rules].every((rule) => {
						if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) return true;
						if (rule instanceof CSSStyleRule && rule.style.getPropertyValue(name)) return false;
						return !(rule instanceof CSSGroupingRule) || defaultOnly(rule.cssRules);
					});
				if (!defaultOnly(sheet.cssRules)) {
					unresolved = true;
					return "";
				}
				const registrations = [...sheet.cssRules].filter(
					(rule) => rule instanceof CSSPropertyRule && rule.name === name,
				);
				const registration = registrations[0];
				// Transition utilities may reference an undeclared optional slot before its theme fallback.
				if (registrations.length === 0 && transitionProperty(property) && fallback !== undefined) {
					const native = element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(name);
					if (native !== undefined && native.trim() === "") return resolve(fallback, next);
				}
				if (registrations.length !== 1 || !(registration instanceof CSSPropertyRule) || registration.inherits) {
					unresolved = true;
					return "";
				}
				definition = registration.initialValue ?? undefined;
				if (definition === undefined || definition === "") {
					if (fallback === undefined) unresolved = true;
					return fallback === undefined ? "" : resolve(fallback, next);
				}
			}
			const resolved = resolve(definition, next);
			if (property === "translate") {
				const length = nativeLength(element, sheet, property, resolved);
				if (length === undefined) unresolved = true;
				return length === undefined ? "" : `${length}px`;
			}
			return resolved;
		});
		if (result === undefined || /\b(?:var|env|attr)\(/i.test(result)) unresolved = true;
		return result ?? "";
	};
	const selection = winningEffect(sheet, declarations.get(property) ?? []);
	if (selection.reason) return unverified(selection.reason);
	if (
		!selection.winner &&
		(element instanceof HTMLElement || element instanceof SVGElement) &&
		element.style.getPropertyValue(property)
	)
		return unverified("this composed effect has an independent inline default context");
	const transition = transitionProperty(property);
	if (transition && element.ownerDocument.defaultView?.getComputedStyle(element).transitionProperty === "none")
		return unverified("this transition has no active native property");
	const initial = transition
		? property === "transition-timing-function"
			? "ease"
			: "0s"
		: property === "font-variant-numeric"
			? "normal"
			: "none";
	// A fully resolved empty fallback list computes to this non-inherited consumer's initial value.
	let value = resolve(selection.winner?.value ?? initial).trim() || initial;
	if (property === "box-shadow" && !unresolved) {
		const view = element.ownerDocument.defaultView;
		const flattened = view === null ? undefined : absoluteLengths(value);
		// Shadow lengths and the used current color are this element's own native context.
		if (flattened === undefined || view === null)
			return unverified("this shadow needs an absolute native length context");
		value = flattened.replace(/(?<![\w-])currentcolor(?![\w-])/gi, view.getComputedStyle(element).color);
	}
	if (unresolved) return unverified("this composed effect needs complete captured variable and companion evidence");
	const result = transitionProperty(property)
		? nativeTransition(element, property, value)
		: property === "filter"
			? nativeFilter(element, value)
			: property === "box-shadow"
				? nativeShadow(element, value)
				: property === "font-variant-numeric"
					? nativeFont(element, property, value)
					: property === "background-image"
						? nativeGradient(element, value)
						: nativeTransform(element, property, value);
	return result.kind === "unknown"
		? unverified(result.reason)
		: { rendered: result.matches ? "verified" : "mismatching", observed: result.observed };
}

/** Reduce only top-level calc terms to absolute pixels; nested or relative units stay unresolved. */
function absoluteLengths(value: string): string | undefined {
	let result = "";
	let cursor = 0;
	let depth = 0;
	for (let index = 0; index < value.length; index++) {
		if (value[index] === ")") {
			if (--depth < 0) return;
			continue;
		}
		if (value[index] !== "(") continue;
		const open = index;
		const start = /(?<![\w-])calc\($/i.test(value.slice(cursor, open + 1)) ? open - 4 : -1;
		depth++;
		if (start < 0 || depth !== 1) continue;
		for (index = open + 1; index < value.length; index++) {
			if (value[index] === "(") depth++;
			else if (value[index] === ")" && --depth === 0) break;
		}
		if (depth !== 0) return;
		let pixels: number;
		try {
			pixels = CSSNumericValue.parse(value.slice(start, index + 1)).to("px").value;
		} catch {
			return;
		}
		if (!Number.isFinite(pixels)) return;
		result += `${value.slice(cursor, start)}${pixels}px`;
		cursor = index + 1;
	}
	return depth === 0 ? result + value.slice(cursor) : undefined;
}

/** Additional paint channels need their own applicable native surface, separately from color equality. */
function paintContext(element: Element, property: string, value: string | undefined, pseudo = ""): string | undefined {
	if (pseudo === "::placeholder")
		return (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
			element.matches(":placeholder-shown")
			? undefined
			: "this placeholder color needs a shown native placeholder";
	if (property === "color" || property === "background-color") return;
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getClientRects().length === 0)
		return "this paint has no rendered native surface";
	const box = element.getBoundingClientRect();
	if (!(box.width > 0 && box.height > 0)) return "this paint has no positive native surface";
	const native = view.getComputedStyle(element);
	for (let node: Element | null = element; node; node = node.parentElement) {
		const style = view.getComputedStyle(node);
		if (style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0)
			return "this paint needs a visible native context";
	}
	if (property === "outline-color") {
		if (["none", "hidden", "auto"].includes(native.outlineStyle) || !(Number.parseFloat(native.outlineWidth) > 0))
			return "this outline color needs an explicit visible outline";
	} else if (property === "text-decoration-color") {
		if (
			!(element instanceof HTMLElement) ||
			!Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
			native.textDecorationLine === "none"
		)
			return "this decoration color needs an authored native text decoration";
		for (let parent = element.parentElement; parent; parent = parent.parentElement)
			if (view.getComputedStyle(parent).textDecorationLine !== "none")
				return "this decoration color needs an independent propagation context";
	} else if (property === "caret-color") {
		if (
			!(
				(element instanceof HTMLInputElement &&
					["text", "search", "url", "tel", "email", "password"].includes(element.type)) ||
				element instanceof HTMLTextAreaElement
			) ||
			element.disabled ||
			element.readOnly ||
			element.ownerDocument.activeElement !== element
		)
			return "this caret color needs a focused editable native text control";
	} else if (property === "accent-color") {
		if (
			!(element instanceof HTMLInputElement) ||
			!["checkbox", "radio"].includes(element.type) ||
			!element.checked ||
			element.disabled ||
			native.appearance === "none"
		)
			return "this accent color needs a checked native control appearance";
	} else if (property === "fill" || property === "stroke") {
		if (!(element instanceof SVGGeometryElement) || !["rect", "circle", "ellipse"].includes(element.localName))
			return "this SVG paint needs a known native geometry";
		const bounds = element.getBBox();
		if (!(bounds.width > 0 && bounds.height > 0)) return "this SVG paint has no positive native geometry";
		if (value !== "none" && !(Number(property === "fill" ? native.fillOpacity : native.strokeOpacity) > 0))
			return "this SVG paint needs positive native paint opacity";
		if (property === "stroke" && value !== "none" && !(Number.parseFloat(native.strokeWidth) > 0))
			return "this stroke color needs positive native stroke width";
	}
	return;
}

/** Width and style are one visible border component; compiler-owned siblings remain independent. */
const supportedPseudos = ["::placeholder"];

/** The one pseudo-element every compiled condition selects, or "" when they select the element. */
function selectedPseudo(paths: readonly (readonly string[])[]): string | undefined {
	const carried = new Set<string>();
	for (const path of paths)
		for (const part of path) if (!part.startsWith("@")) carried.add(/::[\w-]+$/.exec(part)?.[0] ?? "");
	if (carried.size === 0) return "";
	return carried.size === 1 ? [...carried][0] : undefined;
}

const borderPaint =
	/^border-(?:(?:top|right|bottom|left|inline|block|(?:inline|block)-(?:start|end))-)?(?:width|style)$/;

const borderGroups = [
	"",
	"top",
	"right",
	"bottom",
	"left",
	"inline",
	"block",
	"inline-start",
	"inline-end",
	"block-start",
	"block-end",
];

/** The logical roles this use actually resolves, read from its own native writing context. */
function physicalSides(style: CSSStyleDeclaration): Map<string, string> | undefined {
	const mode = style.writingMode;
	const rightToLeft = style.direction === "rtl";
	if (style.direction !== "ltr" && !rightToLeft) return;
	if (mode === "horizontal-tb")
		return new Map([
			["block-start", "top"],
			["block-end", "bottom"],
			["inline-start", rightToLeft ? "right" : "left"],
			["inline-end", rightToLeft ? "left" : "right"],
		]);
	if (mode !== "vertical-rl" && mode !== "vertical-lr") return;
	const sideways = mode === "vertical-rl";
	return new Map([
		["block-start", sideways ? "right" : "left"],
		["block-end", sideways ? "left" : "right"],
		["inline-start", rightToLeft ? "bottom" : "top"],
		["inline-end", rightToLeft ? "top" : "bottom"],
	]);
}

function borderOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this border has no native document context");
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const style = view.getComputedStyle(element);
	const physical = physicalSides(style);
	if (!physical) return unverified("this border needs a known native writing mode context");
	const logical = new Map([...physical].map(([role, side]) => [side, role]));
	const group = expected.property.slice(7, -6);
	const sides =
		group === ""
			? ["top", "right", "bottom", "left"]
			: group === "inline" || group === "block"
				? [physical.get(`${group}-start`), physical.get(`${group}-end`)]
				: physical.has(group)
					? [physical.get(group)]
					: [group];
	if (sides.some((side) => side === undefined)) return unverified("this border has no known native side");
	let matches = true;
	const observed: string[] = [];
	for (const side of sides as string[]) {
		const role = logical.get(side);
		for (const component of ["width", "style"] as const) {
			const property = `border-${side}-${component}`;
			const applicable = borderDefaults(sheet, property);
			for (const effect of expected.effects) {
				if (effect.owner !== null && !classes.has(effect.owner)) continue;
				const parts = /^border-(.*?)-?(width|style)$/.exec(effect.property);
				const declared = parts?.[1] ?? "";
				if (!parts || !borderGroups.includes(declared))
					return unverified("this border has dependent effects requiring native proof");
				if (parts[2] !== component) continue;
				// Each declaration is read back through its own family; only the side is mapped.
				const target =
					declared === "" || declared === side
						? property
						: declared === role
							? `border-${role}-${component}`
							: (declared === "inline" || declared === "block") && role?.startsWith(`${declared}-`)
								? `border-${role}-${component}`
								: undefined;
				if (target === undefined) continue;
				const condition = pathCondition(element, effect.path, effect.owner !== null);
				if (condition === "inactive") continue;
				if (condition === "unverified") return unverified("this border needs a native conditional context proof");
				const value = resolvedValue(element, sheet, effect.value);
				if (value === undefined) return unverified("this border needs a variable context proof");
				const index = sheet.insertRule(":root {}", sheet.cssRules.length);
				const rule = sheet.cssRules[index];
				if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
				rule.style.setProperty(effect.property, value);
				const expanded = rule.style.getPropertyValue(target);
				if (!expanded) return unverified("this border has no native shorthand component proof");
				applicable.push({ ...effect, property, value: expanded });
			}
			const selection = winningEffect(sheet, applicable);
			if (selection.reason) return unverified(selection.reason);
			if (!selection.winner) return unverified("this border needs an initial declaration proof");
			const wanted =
				component === "width"
					? nativeLength(element, sheet, property, selection.winner.value)
					: selection.winner.value;
			const actual = style.getPropertyValue(property);
			if (
				wanted === undefined ||
				(component === "width" && (typeof wanted !== "number" || !Number.isInteger(wanted)))
			)
				return unverified("this border needs a native width context proof");
			if (component === "width" && !actual.endsWith("px"))
				return unverified("this border has no resolved native width");
			matches &&= component === "width" ? Number.parseFloat(actual) === wanted : actual === wanted;
			observed.push(actual);
		}
	}
	return { rendered: matches ? "verified" : "mismatching", observed: observed.join(" ") };
}

/** Nine source roles over four native sides of one box, read in this use's own writing context. */
function boxOutcome(
	element: Element,
	expected: SourcePropertyExpectation,
	box: "padding" | "margin" | "inset",
): PropertyOutcome {
	const offset = box === "inset";
	const longhand = (side: string) => (offset ? side : `${box}-${side}`);
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this box spacing has no native document context");
	if (!element.isConnected || element.getClientRects().length === 0)
		return unverified("this box spacing has no rendered native box");
	const style = view.getComputedStyle(element);
	// A box with no principal box of its own, or one the table algorithm owns, honours neither.
	if (
		!offset &&
		["contents", "table-row", "table-row-group", "table-header-group", "table-footer-group"].includes(style.display)
	)
		return unverified("this display has no native box for its own spacing");
	// A static box ignores every offset while still reporting the declaration it was given.
	if (offset && style.position === "static") return unverified("this offset needs a positioned native box");
	const physical = physicalSides(style);
	if (!physical) return unverified("this box spacing needs a known native writing mode context");
	const logical = new Map([...physical].map(([role, side]) => [side, role]));
	const group = boxParts(expected.property)?.group ?? "";
	const sides =
		group === ""
			? ["top", "right", "bottom", "left"]
			: group === "inline" || group === "block"
				? [physical.get(`${group}-start`), physical.get(`${group}-end`)]
				: physical.has(group)
					? [physical.get(group)]
					: [group];
	if (sides.some((side) => side === undefined)) return unverified("this box spacing has no known native side");
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	// The compiler's own inputs to this declaration: owned here, resolved with it, never compared.
	const companions = new Map<string, SourcePropertyEffect[]>();
	for (const effect of expected.effects) {
		if (!effect.property.startsWith("--")) continue;
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		const condition = pathCondition(element, effect.path, effect.owner !== null);
		if (condition === "inactive") continue;
		if (condition === "unverified") return unverified("this box spacing needs a native conditional context proof");
		companions.set(effect.property, [...(companions.get(effect.property) ?? []), effect]);
	}
	let unresolved = false;
	const resolveSpacing = (value: string, seen = new Set<string>()): string => {
		const substituted = substituteVariables(value, (name, fallback) => {
			const owned = companions.get(name);
			if (!owned) {
				const resolved = fallback === undefined ? resolvedValue(element, sheet, `var(${name})`) : undefined;
				if (resolved === undefined) unresolved = true;
				return resolved ?? "";
			}
			if (seen.has(name)) {
				unresolved = true;
				return "";
			}
			const selected = winningEffect(sheet, owned);
			if (selected.reason || !selected.winner) {
				unresolved = true;
				return "";
			}
			return resolveSpacing(selected.winner.value, new Set([...seen, name]));
		});
		if (substituted === undefined || /\b(?:var|env|attr)\(/i.test(substituted)) unresolved = true;
		return substituted ?? "";
	};
	let matches = true;
	const observed: string[] = [];
	for (const side of sides as string[]) {
		const role = logical.get(side);
		const property = longhand(side);
		const applicable: SourcePropertyEffect[] = [];
		for (const effect of expected.effects) {
			if (effect.owner !== null && !classes.has(effect.owner)) continue;
			// A companion variable is an input to the declaration, resolved with it rather than compared.
			if (effect.property.startsWith("--")) continue;
			const parts = boxParts(effect.property);
			if (!parts || parts.box !== box) return unverified("this box spacing has dependent effects requiring proof");
			const declared = parts.group;
			// Each declaration is read back through its own family; only the side is mapped.
			const target =
				declared === "" || declared === side
					? property
					: declared === role ||
							((declared === "inline" || declared === "block") && role?.startsWith(`${declared}-`))
						? `${box}-${role}`
						: undefined;
			if (target === undefined) continue;
			const condition = pathCondition(element, effect.path, effect.owner !== null);
			if (condition === "inactive") continue;
			if (condition === "unverified") return unverified("this box spacing needs a native conditional context proof");
			unresolved = false;
			const value = resolveSpacing(effect.value);
			if (unresolved) return unverified("this box spacing needs a variable context proof");
			const index = sheet.insertRule(":root {}", sheet.cssRules.length);
			const rule = sheet.cssRules[index];
			if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
			rule.style.setProperty(effect.property, value);
			const expanded = rule.style.getPropertyValue(target);
			if (!expanded) return unverified("this box spacing has no native shorthand component proof");
			applicable.push({ ...effect, property, value: expanded });
		}
		if ((element instanceof HTMLElement || element instanceof SVGElement) && element.style.getPropertyValue(property))
			return unverified("this box spacing has an independent inline context requiring proof");
		const selection = winningEffect(sheet, applicable);
		if (selection.reason) return unverified(selection.reason);
		// A relative or absolute box reports the offset it used, never the automatic keyword it stands at.
		const declared = selection.winner?.value.trim().toLowerCase();
		if (offset && (declared === undefined || declared === "auto")) {
			if (style.position !== "sticky") return unverified("this offset has no automatic native reading");
			const actual = style.getPropertyValue(property);
			matches &&= actual.trim().toLowerCase() === "auto";
			observed.push(actual);
			continue;
		}
		if (!selection.winner) return unverified("this box spacing has no independent initial declaration");
		const wanted = nativeLength(element, sheet, property, selection.winner.value);
		// An automatic margin resolves to the free space this evaluator does not compute.
		if (wanted === undefined) return unverified("this box spacing has no independent native length");
		const actual = style.getPropertyValue(property);
		// The engine stores a used length as a whole number of 1/64 pixels; anything else is truncated.
		if (!actual.endsWith("px") || !Number.isInteger(wanted * 64))
			return unverified("this box spacing needs a native length context proof");
		matches &&= Number.parseFloat(actual) === wanted;
		observed.push(actual);
	}
	return { rendered: matches ? "verified" : "mismatching", observed: observed.join(" ") };
}

/**
 * Retained rows whose whole value is one native declaration: the engine reports what it was
 * given, so each one names the longhands to compare and the box that has to exist first.
 */
/**
 * A retained row whose whole value is one native declaration the engine reports back: the
 * longhands to compare, and the box that has to exist before any of it means anything. The box
 * test is the row's own, so there is no switch on a kind somewhere else.
 */
type DeclarationRow = {
	longhands: readonly string[];
	/** The refusal reason when this use's box does not apply the row, or undefined when it does. */
	box: (element: Element, style: CSSStyleDeclaration, parent: string) => string | undefined;
};

const flexBoxes = ["flex", "inline-flex"];
const gridBoxes = ["grid", "inline-grid"];

const flexibleItem = (_element: Element, _style: CSSStyleDeclaration, parent: string) =>
	flexBoxes.includes(parent) ? undefined : "this row needs a native flexible item";
const gridItem = (_element: Element, _style: CSSStyleDeclaration, parent: string) =>
	gridBoxes.includes(parent) ? undefined : "this row needs a native grid item";

const declarationRows: Readonly<Record<string, DeclarationRow>> = {
	"z-index": {
		longhands: ["z-index"],
		// An unpositioned box reports the stacking order it was given while using none of it.
		box: (_element, style, parent) =>
			style.position !== "static" || [...flexBoxes, ...gridBoxes].includes(parent)
				? undefined
				: "this stacking order needs a positioned native box or a flexible or grid item",
	},
	order: { longhands: ["order"], box: flexibleItem },
	flex: { longhands: ["flex-grow", "flex-shrink", "flex-basis"], box: flexibleItem },
	"grid-column": { longhands: ["grid-column-start", "grid-column-end"], box: gridItem },
	"grid-row": { longhands: ["grid-row-start", "grid-row-end"], box: gridItem },
	"grid-column-start": { longhands: ["grid-column-start"], box: gridItem },
	"grid-row-start": { longhands: ["grid-row-start"], box: gridItem },
	columns: {
		longhands: ["column-count", "column-width"],
		box: (_element, style) =>
			["block", "flow-root", "inline-block", "list-item"].includes(style.display)
				? undefined
				: "this column count needs a native block container",
	},
	"scroll-snap-type": {
		longhands: ["scroll-snap-type"],
		box: (_element, style) =>
			[style.overflowX, style.overflowY].every((axis) => ["visible", "clip"].includes(axis))
				? "this snap type needs a native scroll container"
				: undefined,
	},
	"grid-template-columns": {
		longhands: ["grid-template-columns"],
		box: (_element, style) =>
			gridBoxes.includes(style.display) ? undefined : "this track list needs a native grid container",
	},
	"grid-template-rows": {
		longhands: ["grid-template-rows"],
		box: (_element, style) =>
			gridBoxes.includes(style.display) ? undefined : "this track list needs a native grid container",
	},
};

/** Compare one whole compiled declaration against what the engine reports for the same use. */
function declarationOutcome(
	element: Element,
	expected: SourcePropertyExpectation,
	row: DeclarationRow,
): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this declaration has no native document context");
	if (!element.isConnected || element.getClientRects().length === 0)
		return unverified("this declaration has no rendered native box");
	const style = view.getComputedStyle(element);
	const parent = element.parentElement;
	const context = row.box(element, style, parent ? view.getComputedStyle(parent).display : "");
	if (context) return unverified(context);
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const applicable: SourcePropertyEffect[] = [];
	for (const effect of expected.effects) {
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		// A companion variable is an input to the declaration, resolved with it rather than compared.
		if (effect.property.startsWith("--")) continue;
		if (effect.property !== expected.property)
			return unverified("this declaration has dependent effects requiring native proof");
		const condition = pathCondition(element, effect.path, effect.owner !== null);
		if (condition === "inactive") continue;
		if (condition === "unverified") return unverified("this declaration needs a native condition proof");
		applicable.push(effect);
	}
	if (
		(element instanceof HTMLElement || element instanceof SVGElement) &&
		element.style.getPropertyValue(expected.property)
	)
		return unverified("this declaration has an independent inline context requiring proof");
	const selection = winningEffect(sheet, applicable);
	if (selection.reason) return unverified(selection.reason);
	const index = sheet.insertRule(":root {}", sheet.cssRules.length);
	const rule = sheet.cssRules[index];
	if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
	if (selection.winner) {
		const value = resolvedValue(element, sheet, selection.winner.value);
		if (value === undefined) return unverified("this declaration needs a resolved variable context");
		rule.style.setProperty(expected.property, value);
		if (!rule.style.getPropertyValue(expected.property))
			return unverified("this declaration is not a native declaration of its own row");
	}
	let matches = true;
	const observed: string[] = [];
	for (const longhand of row.longhands) {
		const wanted = selection.winner ? rule.style.getPropertyValue(longhand) : initialDeclarations[longhand];
		const actual = style.getPropertyValue(longhand);
		if (wanted === undefined || wanted === "" || actual === "")
			return unverified("this declaration has no independent native reading");
		observed.push(actual);
		const repeat = /^repeat\(\s*(\d+)\s*,/.exec(wanted.trim());
		if (repeat) {
			// A grid container reports the tracks it used, so the proof is the track count it made.
			const tracks = actual.trim().split(/\s+/);
			if (!tracks.every((track) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)px$/i.test(track)))
				return unverified("this track list needs a native used-track proof");
			matches &&= tracks.length === Number(repeat[1]);
			continue;
		}
		rule.style.removeProperty(longhand);
		rule.style.setProperty(longhand, actual);
		const normalized = rule.style.getPropertyValue(longhand);
		if (!normalized) return unverified("this declaration has no supported native serialization");
		rule.style.removeProperty(longhand);
		rule.style.setProperty(longhand, wanted);
		matches &&= rule.style.getPropertyValue(longhand) === normalized;
	}
	return { rendered: matches ? "verified" : "mismatching", observed: observed.join(" ") };
}

/** The initial declaration each retained row stands at when nothing declares it. */
const initialDeclarations: Readonly<Record<string, string>> = {
	"z-index": "auto",
	order: "0",
	"flex-grow": "0",
	"flex-shrink": "1",
	"flex-basis": "auto",
	"grid-column-start": "auto",
	"grid-column-end": "auto",
	"grid-row-start": "auto",
	"grid-row-end": "auto",
	"column-count": "auto",
	"column-width": "auto",
	"scroll-snap-type": "none",
	"grid-template-columns": "none",
	"grid-template-rows": "none",
};

/** Source rows over the native sizing declarations, including the two size-mode controls. */
const sizeRows: Readonly<Record<string, string>> = {
	width: "width",
	height: "height",
	"width mode": "width",
	"height mode": "height",
	"min-width": "min-width",
	"max-width": "max-width",
	"min-height": "min-height",
	"max-height": "max-height",
};

/** The containing block a percentage size of this use resolves against, in native pixels. */
function containingSize(view: Window, element: Element, style: CSSStyleDeclaration): number | undefined {
	if (style.writingMode !== "horizontal-tb") return;
	if (!["static", "relative", "sticky"].includes(style.position)) return;
	const parent = element.parentElement;
	if (!parent) return;
	const outer = view.getComputedStyle(parent);
	if (outer.display.startsWith("table") || outer.writingMode !== "horizontal-tb") return;
	const width = Number.parseFloat(outer.width);
	if (!outer.width.endsWith("px") || !Number.isFinite(width)) return;
	if (outer.boxSizing !== "border-box") return width;
	const edges = ["padding-left", "padding-right", "border-left-width", "border-right-width"].map((name) =>
		Number.parseFloat(outer.getPropertyValue(name)),
	);
	if (edges.some((edge) => !Number.isFinite(edge))) return;
	return width - edges.reduce((total, edge) => total + edge, 0);
}

/**
 * The authored size and the box the engine used are different readings. This compares them and,
 * where they differ for a constraint it can name, reports the constraint rather than a mismatch.
 */
function sizeOutcome(element: Element, expected: SourcePropertyExpectation, native: string): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this size has no native document context");
	if (!element.isConnected || element.getClientRects().length === 0)
		return unverified("this size has no rendered native box");
	const style = view.getComputedStyle(element);
	if (["inline", "contents", "table-row", "table-row-group", "table-column-group"].includes(style.display))
		return unverified("this display has no native box a size applies to");
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const applicable: SourcePropertyEffect[] = [];
	for (const effect of expected.effects) {
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		if (!Object.values(sizeRows).includes(effect.property))
			return unverified("this size has dependent effects requiring native proof");
		if (effect.property !== native) continue;
		const condition = pathCondition(element, effect.path, effect.owner !== null);
		if (condition === "inactive") continue;
		if (condition === "unverified") return unverified("this size needs a native condition proof");
		applicable.push(effect);
	}
	if ((element instanceof HTMLElement || element instanceof SVGElement) && element.style.getPropertyValue(native))
		return unverified("this size has an independent inline context requiring proof");
	const selection = winningEffect(sheet, applicable);
	if (selection.reason) return unverified(selection.reason);
	const declared = selection.winner ? resolvedValue(element, sheet, selection.winner.value) : initialSizes[native];
	if (declared === undefined) return unverified("this size needs a resolved variable context");
	const axis = native.endsWith("width") ? "width" : "height";
	const observed = style.getPropertyValue(native);
	// A minimum or maximum is reported as it was computed, so it is compared as an authored value.
	if (native !== "width" && native !== "height") {
		const wanted = sizeValue(element, view, sheet, style, native, declared, axis);
		if (typeof wanted === "string") return unverified(wanted);
		if (wanted === undefined) {
			const same = declared.trim().toLowerCase() === observed.trim().toLowerCase();
			return { rendered: same ? "verified" : "mismatching", observed };
		}
		const actual = Number.parseFloat(observed);
		if (!observed.endsWith("px") || !Number.isFinite(actual))
			return unverified("this constraint has no resolved native length");
		return { rendered: actual === wanted ? "verified" : "mismatching", observed };
	}
	const wanted = sizeValue(element, view, sheet, style, native, declared, axis);
	if (typeof wanted === "string") return unverified(wanted);
	if (wanted === undefined) return unverified("this sizing mode has no native used-box proof");
	const used = Number.parseFloat(observed);
	if (!observed.endsWith("px") || !Number.isFinite(used)) return unverified("this size has no resolved native box");
	const constraint = sizeConstraint(view, element, style, axis, wanted, used);
	if (constraint) return { rendered: "constrained", observed, reason: constraint };
	if (!Number.isInteger(wanted * 64)) return unverified("this size needs an exact native pixel proof");
	return { rendered: used === wanted ? "verified" : "mismatching", observed };
}

/** A declared size as native pixels, a refusal reason, or undefined when it is a keyword. */
function sizeValue(
	element: Element,
	view: Window,
	sheet: CSSStyleSheet,
	style: CSSStyleDeclaration,
	native: string,
	declared: string,
	axis: "width" | "height",
): number | string | undefined {
	const value = declared.trim();
	const percentage = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/.exec(value);
	if (percentage) {
		if (axis !== "width") return "this percentage size needs a definite native containing block";
		const outer = containingSize(view, element, style);
		if (outer === undefined) return "this percentage size needs a definite native containing block";
		return (outer * Number(percentage[1])) / 100;
	}
	if (/^[a-z-]+$/i.test(value)) return;
	const length = nativeLength(element, sheet, native, value);
	return length === undefined ? "this size has no independent native length" : length;
}

/** Name the definite native constraint that decided this used box, if one did. */
function sizeConstraint(
	view: Window,
	element: Element,
	style: CSSStyleDeclaration,
	axis: "width" | "height",
	wanted: number,
	used: number,
): string | undefined {
	const parent = element.parentElement;
	const outer = parent ? view.getComputedStyle(parent) : undefined;
	const flexible = outer !== undefined && ["flex", "inline-flex"].includes(outer.display);
	const main = flexible && (outer.flexDirection.startsWith("row") ? axis === "width" : axis === "height");
	// A flex basis, not this row, decides the main size of a flexible item that declares one.
	if (main && style.flexBasis.trim().toLowerCase() !== "auto") return "this main size comes from a native flex basis";
	if (used === wanted) return;
	for (const bound of [`min-${axis}`, `max-${axis}`]) {
		const limit = style.getPropertyValue(bound);
		if (!limit.endsWith("px")) continue;
		const number = Number.parseFloat(limit);
		if (!Number.isFinite(number) || used !== number) continue;
		if (bound.startsWith("min") ? wanted < number : wanted > number)
			return `this used box is held by a definite native ${bound}`;
	}
	if (main) return "this used size is under a native flexible box constraint";
	if (style.getPropertyValue(`min-${axis}`).trim().toLowerCase() === "auto" && flexible && used > wanted)
		return "this used size is held by the native automatic minimum of a flexible item";
	return;
}

const initialSizes: Readonly<Record<string, string>> = {
	width: "auto",
	height: "auto",
	"min-width": "auto",
	"max-width": "none",
	"min-height": "auto",
	"max-height": "none",
};

/** Rows the compiler writes onto the children a use separates, not onto the use itself. */
const childRows: Readonly<Record<string, string>> = {
	"column-gap, between children": "margin-inline",
	"row-gap, between children": "margin-block",
	"border-color, between children": "border-color",
};

/**
 * A between-children row renders on the children the compiled scope selects. Each of them is read
 * independently through the family that owns the native declaration, and all of them must agree.
 */
function childrenOutcome(element: Element, expected: SourcePropertyExpectation, native: string): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const filters = new Set<string>();
	for (const path of expected.scopePaths) {
		const selectors = path.filter((part) => !part.startsWith("@"));
		const scope = selectors.length === 1 ? /^:where\(\$ > (.+)\)$/.exec(selectors[0]!) : null;
		if (!scope) return unverified("this row has no single native child scope");
		filters.add(scope[1]!);
	}
	if (filters.size !== 1) return unverified("this row has more than one native child scope");
	const filter = [...filters][0]!;
	const subject = `:where($ > ${filter})`;
	let targets: Element[];
	try {
		targets = [...element.children].filter((child) => child.matches(filter));
	} catch {
		return unverified("this child scope is not a native selector");
	}
	if (targets.length === 0) return unverified("this use has no native child this row separates");
	// The child was selected by the compiled scope itself, so only the child's own states remain.
	const carried: SourcePropertyExpectation = {
		...expected,
		property: native,
		scopePaths: expected.scopePaths.map((path) => path.map((part) => (part === subject ? "$" : part))),
		effects: expected.effects.map((effect) => ({
			...effect,
			path: effect.path.map((part) => (effect.owner !== null && part === subject ? "$" : part)),
		})),
	};
	const outcomes = targets.map((target) => propertyOutcome(target, carried));
	const refused = outcomes.find((outcome) => outcome.rendered !== "verified" && outcome.rendered !== "mismatching");
	if (refused) return refused;
	return {
		rendered: outcomes.every((outcome) => outcome.rendered === "verified") ? "verified" : "mismatching",
		observed: outcomes.map((outcome) => outcome.observed ?? "").join(", "),
	};
}

const borderColorRow = /^border-(?:(?:top|right|bottom|left|inline|block|(?:inline|block)-(?:start|end))-)?color$/;

/** Nine source roles over four native sides. Only the side is mapped; the comparator owns paint. */
function borderColorOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this border color has no native document context");
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const style = view.getComputedStyle(element);
	const physical = physicalSides(style);
	if (!physical) return unverified("this border color needs a known native writing mode context");
	const logical = new Map([...physical].map(([role, side]) => [side, role]));
	const group = expected.property.slice(7, -6);
	const sides =
		group === ""
			? ["top", "right", "bottom", "left"]
			: group === "inline" || group === "block"
				? [physical.get(`${group}-start`), physical.get(`${group}-end`)]
				: physical.has(group)
					? [physical.get(group)]
					: [group];
	if (sides.some((side) => side === undefined)) return unverified("this border color has no known native side");
	const selected: { side: NativeBorderSide; color: string }[] = [];
	for (const side of sides as NativeBorderSide[]) {
		const role = logical.get(side);
		const property = `border-${side}-color`;
		const applicable = borderDefaults(sheet, property);
		for (const effect of expected.effects) {
			if (effect.owner !== null && !classes.has(effect.owner)) continue;
			// Width and style decide whether a side paints at all, which the comparator reads natively.
			if (effect.property === "--tw-border-style" || borderPaint.test(effect.property)) continue;
			const parts = /^border-(.*?)-?color$/.exec(effect.property);
			const declared = parts?.[1] ?? "";
			if (!parts || !borderGroups.includes(declared))
				return unverified("this border color has dependent effects requiring native proof");
			const target =
				declared === "" || declared === side
					? property
					: declared === role ||
							((declared === "inline" || declared === "block") && role?.startsWith(`${declared}-`))
						? `border-${role}-color`
						: undefined;
			if (target === undefined) continue;
			const condition = pathCondition(element, effect.path, effect.owner !== null);
			if (condition === "inactive") continue;
			if (condition === "unverified")
				return unverified("this border color needs a native conditional context proof");
			const value = resolvedValue(element, sheet, effect.value);
			if (value === undefined) return unverified("this border color needs a variable context proof");
			const index = sheet.insertRule(":root {}", sheet.cssRules.length);
			const rule = sheet.cssRules[index];
			if (!(rule instanceof CSSStyleRule)) return unverified("the native declaration parser is unavailable");
			rule.style.setProperty(effect.property, value);
			const expanded = rule.style.getPropertyValue(target);
			if (!expanded) return unverified("this border color has no native shorthand component proof");
			applicable.push({ ...effect, property, value: expanded });
		}
		const selection = winningEffect(sheet, applicable);
		if (selection.reason) return unverified(selection.reason);
		if (!selection.winner) return unverified("this border color needs an initial declaration proof");
		let color = selection.winner.value.trim();
		if (color.toLowerCase() === "inherit") {
			const parent = element.parentElement;
			if (!parent) return unverified("this border color needs a native inherited context proof");
			color = view.getComputedStyle(parent).getPropertyValue(property);
		}
		// A border painted with the current color takes this element's own computed color.
		if (color.toLowerCase() === "currentcolor") color = style.color;
		selected.push({ side, color });
	}
	const result = nativeBorderColors(element, selected);
	return result.kind === "unknown"
		? unverified(result.reason)
		: { rendered: result.matches ? "verified" : "mismatching", observed: result.observed };
}

/** The compiler closure includes native preflight shorthands outside the selected utility roots. */
function borderDefaults(sheet: CSSStyleSheet, property: string): SourcePropertyEffect[] {
	const effects: SourcePropertyEffect[] = [];
	const visit = (rules: CSSRuleList, path: readonly string[]) => {
		for (const rule of rules) {
			if (rule instanceof CSSLayerBlockRule) visit(rule.cssRules, [...path, `@layer ${rule.name}`]);
			else if (rule instanceof CSSStyleRule && /^\*(?:,\s*::[\w-]+)*$/.test(rule.selectorText)) {
				const value = rule.style.getPropertyValue(property);
				if (value)
					effects.push({
						owner: null,
						path: [...path, rule.selectorText],
						property,
						value,
						important: rule.style.getPropertyPriority(property) === "important",
					});
			}
		}
	};
	visit(sheet.cssRules, []);
	return effects;
}

function winningEffect(
	sheet: CSSStyleSheet,
	applicable: readonly SourcePropertyEffect[],
): {
	winner?: SourcePropertyEffect;
	reason?: string;
} {
	const layers: string[] = [];
	for (const rule of sheet.cssRules) {
		const names =
			rule instanceof CSSLayerStatementRule ? rule.nameList : rule instanceof CSSLayerBlockRule ? [rule.name] : [];
		for (const name of names) if (!layers.includes(name)) layers.push(name);
	}
	const important = applicable.some((effect) => effect.important);
	const priority = (effect: SourcePropertyEffect) => {
		const names = effect.path.filter((part) => part.startsWith("@layer ")).map((part) => part.slice(7));
		if (names.length > 1 || names.some((name) => !layers.includes(name))) return undefined;
		const order = names.length === 0 ? layers.length : layers.indexOf(names[0]!);
		return important ? -order : order;
	};
	// Conditional group rules carry no specificity; only the selector chain does.
	const subject = (effect: SourcePropertyEffect) =>
		JSON.stringify(effect.path.filter((part) => !part.startsWith("@")));
	let winner: SourcePropertyEffect | undefined;
	let rank = Number.NEGATIVE_INFINITY;
	for (const effect of applicable.filter((effect) => effect.important === important)) {
		const next = priority(effect);
		if (next === undefined) return { reason: "this property effect needs a cascade layer proof" };
		if (next === rank && !(winner && subject(winner) === subject(effect)))
			return { reason: "competing property effects need a specificity proof" };
		// Equal compiler utility subjects have equal specificity; declaration order decides.
		if (next >= rank) {
			winner = effect;
			rank = next;
		}
	}
	if (winner?.owner === null && applicable.some((effect) => effect.owner !== null))
		return { reason: "the expected utility is masked by another declaration" };
	return winner ? { winner } : {};
}

type Condition = "active" | "inactive" | "unverified";

/** Only the compiler's utility subject is replaced; every state is read from the actual use. */
function pathCondition(element: Element, path: readonly string[], owned: boolean, pseudo = ""): Condition {
	const view = element.ownerDocument.defaultView;
	if (!view) return "unverified";
	let unknown = false;
	let selectors = 0;
	for (const part of path) {
		if (part.startsWith("@layer ")) continue;
		if (part.startsWith("@media ")) {
			if (!view.matchMedia(part.slice(7)).matches) return "inactive";
			continue;
		}
		if (part.startsWith("@supports ")) {
			if (!CSS.supports(part.slice(10))) return "inactive";
			continue;
		}
		if (part.startsWith("@")) {
			unknown = true;
			continue;
		}
		selectors++;
		let selector = part;
		if (owned) {
			const carried = /::[\w-]+$/.exec(part)?.[0] ?? "";
			// A declaration on another origin is not part of this pseudo-element's cascade.
			if (carried !== pseudo) return "inactive";
			const body = carried ? part.slice(0, -carried.length) : part;
			const subject = selectors === 1 ? "$" : "&";
			if (!body.startsWith(subject)) {
				unknown = true;
				continue;
			}
			const states = body.slice(1);
			// Relations and authored class tests need prospective ancestry/cascade proof.
			if (
				!/^(?::(?:hover|focus|focus-visible|focus-within|active|disabled|enabled|checked|indeterminate|valid|invalid|required|optional|read-only|read-write|placeholder-shown|empty|first-child|last-child|only-child|first-of-type|last-of-type|only-of-type))*$/.test(
					states,
				)
			) {
				unknown = true;
				continue;
			}
			// A universal :hover selector excludes non-links in quirks mode. The actual
			// tag preserves native state matching without consulting retained classes.
			selector = `${CSS.escape(element.localName)}${states}`;
		} else if (selectors > 1) {
			unknown = true;
			continue;
		} else if (pseudo) {
			const origins = selectorList(part);
			if (!origins) {
				unknown = true;
				continue;
			}
			const carried = origins.filter((item) => (/::[\w-]+$/.exec(item)?.[0] ?? "") === pseudo);
			if (carried.length === 0) return "inactive";
			const bases = carried.map((item) => item.slice(0, -pseudo.length).trim());
			if (bases.some((base) => base === "")) continue;
			selector = bases.join(", ");
		}
		try {
			if (!element.matches(selector)) return "inactive";
		} catch {
			// The style engine drops a selector its own parser rejects; ask it rather than guessing.
			if (!CSS.supports(`selector(${selector})`)) return "inactive";
			unknown = true;
		}
	}
	return unknown || selectors === 0 ? "unverified" : "active";
}

/** Split a selector list on its own top-level commas, leaving functional selectors intact. */
function selectorList(part: string): string[] | undefined {
	const items: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < part.length; index++) {
		const character = part[index];
		if (character === "(" || character === "[") depth++;
		else if (character === ")" || character === "]") depth--;
		else if (character === "," && depth === 0) {
			items.push(part.slice(start, index).trim());
			start = index + 1;
		}
		if (depth < 0) return;
	}
	items.push(part.slice(start).trim());
	return depth === 0 && items.every(Boolean) ? items : undefined;
}

/** Resolve only a unique unconditional compiler root definition, checked in this use's context. */
function resolvedValue(
	element: Element,
	sheet: CSSStyleSheet,
	value: string,
	seen = new Set<string>(),
): string | undefined {
	let unresolved = false;
	const result = value.replace(/var\((--[\w-]+)\)/g, (_reference, name: string) => {
		if (seen.has(name)) {
			unresolved = true;
			return "";
		}
		const definitions: string[] = [];
		const registered = [...sheet.cssRules].some((rule) => rule instanceof CSSPropertyRule && rule.name === name);
		const collect = (rules: CSSRuleList, unconditional: boolean) => {
			for (const rule of rules) {
				if (registered && rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
				if (rule instanceof CSSPropertyRule && rule.name === name) {
					if (!unconditional || !rule.initialValue) unresolved = true;
					else definitions.push(rule.initialValue.trim());
				} else if (rule instanceof CSSStyleRule) {
					const declaration = rule.style.getPropertyValue(name);
					if (!declaration) continue;
					if (!unconditional || !/^:root(?:,\s*:host)?$/.test(rule.selectorText)) {
						unresolved = true;
						continue;
					}
					definitions.push(declaration.trim());
				} else if (rule instanceof CSSGroupingRule)
					collect(rule.cssRules, unconditional && rule instanceof CSSLayerBlockRule);
			}
		};
		collect(sheet.cssRules, true);
		if (definitions.length !== 1) {
			unresolved = true;
			return "";
		}
		const resolved = resolvedValue(element, sheet, definitions[0]!, new Set([...seen, name]));
		const actual = element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(name).trim();
		if (resolved === undefined || actual !== resolved) {
			unresolved = true;
			return "";
		}
		return resolved;
	});
	return unresolved || /\b(?:var|env|attr)\(/i.test(result) ? undefined : result;
}

/** Relative font sizes use this native use's root or parent, never another selected use. */
function nativeLength(element: Element, sheet: CSSStyleSheet, property: string, value: string): number | undefined {
	const view = element.ownerDocument.defaultView;
	if (!view) return;
	const index = sheet.insertRule(":root {}", sheet.cssRules.length);
	const rule = sheet.cssRules[index];
	if (!(rule instanceof CSSStyleRule)) return;
	rule.style.setProperty(property, value);
	if (!rule.style.getPropertyValue(property)) return;
	const dimensions: { number: number; unit: string }[] = [];
	const parsed = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|rem|em|%)$/i.exec(value.trim());
	if (parsed) dimensions.push({ number: Number(parsed[1]), unit: parsed[2]!.toLowerCase() });
	else if (/^[+-]?0(?:\.0*)?$/.test(value.trim())) dimensions.push({ number: 0, unit: "px" });
	else {
		try {
			const sum = CSSNumericValue.parse(value).toSum("px", "em", "rem", "percent");
			for (const term of sum.values) {
				if (!(term instanceof CSSUnitValue)) return;
				dimensions.push({ number: term.value, unit: term.unit === "percent" ? "%" : term.unit });
			}
		} catch {
			return;
		}
	}
	let computed = 0;
	for (const dimension of dimensions) {
		const { unit } = dimension;
		let number = dimension.number;
		if (number === 0) continue;
		if (unit !== "px") {
			if (property === "font-size" && element === element.ownerDocument.documentElement) return;
			if (property !== "font-size" && property !== "line-height" && unit === "%") return;
			const context =
				unit === "rem"
					? element.ownerDocument.documentElement
					: property === "font-size"
						? element.parentElement
						: element;
			if (!context) return;
			const inherited = view.getComputedStyle(context).fontSize;
			if (!inherited.endsWith("px")) return;
			number *= Number.parseFloat(inherited) / (unit === "%" ? 100 : 1);
		}
		computed += number;
	}
	if (!Number.isFinite(computed)) return;
	// Preserve the authored precision during conversion; serialize only the final px value.
	rule.style.setProperty(property, `${computed}px`);
	return Number.parseFloat(rule.style.getPropertyValue(property));
}

function nativeLineHeight(element: Element, sheet: CSSStyleSheet, value: string): number | undefined {
	let multiplier: number | undefined;
	if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) multiplier = Number(value);
	else {
		try {
			multiplier = CSSNumericValue.parse(value).to("number").value;
		} catch {
			/* A length has a different native dimension. */
		}
	}
	if (multiplier !== undefined) {
		const size = element.ownerDocument.defaultView?.getComputedStyle(element).fontSize;
		return size?.endsWith("px") && multiplier >= 0
			? nativeLength(element, sheet, "line-height", `${multiplier * Number.parseFloat(size)}px`)
			: undefined;
	}
	return nativeLength(element, sheet, "line-height", value);
}

/** The native computed letter spacing serializes an authored zero as its normal keyword. */
function nativeSpacing(element: Element, sheet: CSSStyleSheet, value: string): number | undefined {
	return value.trim().toLowerCase() === "normal" ? 0 : nativeLength(element, sheet, "letter-spacing", value);
}

function nativeCount(value: string): number | undefined {
	return /^\+?\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
}

/** A retained length needs its own applicable native surface before any value comparison. */
function lengthContext(element: Element, property: string): string | undefined {
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getClientRects().length === 0)
		return "this native length has no rendered native surface";
	const native = view.getComputedStyle(element);
	const text = () =>
		element instanceof HTMLElement &&
		Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
	if (property === "flex-basis") {
		const parent = element.parentElement;
		if (!parent || !["flex", "inline-flex"].includes(view.getComputedStyle(parent).display))
			return "this flex basis needs a native flexible item";
	} else if (property === "column-gap" || property === "row-gap") {
		const multicol = native.columnCount !== "auto" || native.columnWidth !== "auto";
		if (!["flex", "inline-flex", "grid", "inline-grid"].includes(native.display) && !multicol)
			return "this gap needs a native flexible, grid or multi-column container";
		if (property === "row-gap" && !["flex", "inline-flex", "grid", "inline-grid"].includes(native.display))
			return "this row gap needs a native flexible or grid container";
	} else if (property === "outline-width" || property === "outline-offset") {
		if (["none", "hidden", "auto"].includes(native.outlineStyle))
			return "this outline length needs an explicit visible outline";
	} else if (property === "stroke-width") {
		if (!(element instanceof SVGGeometryElement) || !["rect", "circle", "ellipse"].includes(element.localName))
			return "this stroke width needs a known native geometry";
		const bounds = element.getBBox();
		if (!(bounds.width > 0 && bounds.height > 0)) return "this stroke width has no positive native geometry";
		if (native.stroke === "none") return "this stroke width needs an applied native stroke paint";
	} else if (property === "text-decoration-thickness" || property === "text-underline-offset") {
		if (!text()) return "this decoration length needs authored native text";
		if (
			native.textDecorationLine === "none" ||
			(property === "text-underline-offset" && !native.textDecorationLine.split(/\s+/).includes("underline"))
		)
			return "this decoration length needs an authored native text decoration";
	} else if (property === "text-indent") {
		if (!text() || !["block", "flow-root", "list-item", "table-cell", "inline-block"].includes(native.display))
			return "this indent needs a native block container with text";
	} else if (property === "-webkit-line-clamp") {
		// This engine may blockify the legacy box, so read the container it actually resolved.
		if (
			!["-webkit-box", "flow-root", "block", "list-item", "flow-root list-item", "inline-block"].includes(
				native.display,
			) ||
			native.getPropertyValue("-webkit-box-orient") !== "vertical" ||
			native.overflow !== "hidden"
		)
			return "this line clamp needs its native block container context";
	}
	return;
}

function nativeWeight(value: string): number | undefined {
	const normalized = value.trim();
	if (normalized === "normal") return 400;
	if (normalized === "bold") return 700;
	if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return;
	const number = Number(normalized);
	return number >= 1 && number <= 1000 ? number : undefined;
}

function isCorner(property: string): boolean {
	return /^border-(?:top|bottom)-(?:left|right)-radius$/.test(property);
}
