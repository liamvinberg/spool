import { nativeColorComparison } from "./property-colors";

export type NativeBorderSide = "top" | "right" | "bottom" | "left";
export type NativeBorderColorResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };

const refusals = {
	unsupported: "this border color needs a resolved supported literal",
	imprecise: "this border color needs observable native numeric precision",
	space: "this border color needs an exact native color-space comparison",
} as const;

/** A system color depends on the platform theme, so it is never resolved here. */
const systemColor =
	/\b(?:accentcolor(?:text)?|activetext|buttonborder|buttonface|buttontext|canvas(?:text)?|field(?:text)?|graytext|highlight(?:text)?|linktext|mark(?:text)?|selecteditem(?:text)?|visitedtext|activeborder|activecaption|appworkspace|background|buttonhighlight|buttonshadow|captiontext|inactiveborder|inactivecaption(?:text)?|infobackground|infotext|menu(?:text)?|scrollbar|threeddarkshadow|threedface|threedhighlight|threedlightshadow|threedshadow|window(?:frame|text)?)\b/i;

/** The caller selects the physical sides and owns source, cascade, logical mapping and default proof. */
export function nativeBorderColors(
	element: Element,
	expected: readonly { side: NativeBorderSide; color: string }[],
): NativeBorderColorResult {
	const unknown = (reason: string): NativeBorderColorResult => ({ kind: "unknown", reason });
	if (expected.length === 0) return unknown("this border color needs a selected native side");
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this border color has no rendered native host");
	if (!(element instanceof HTMLElement)) return unknown("this border color needs a proven native border box context");
	const style = view.getComputedStyle(element);
	const boxes = element.getClientRects();
	if (boxes.length === 0 || style.visibility !== "visible")
		return unknown("this border color has no rendered native host");
	if (boxes.length !== 1 || (style.borderCollapse === "collapse" && style.display.includes("table")))
		return unknown("this border color needs a proven native border box context");
	if (view.matchMedia("(forced-colors: active)").matches)
		return unknown("this border color needs an unforced native color context");
	for (let host: Element | null = element; host; host = host.parentElement)
		if (view.getComputedStyle(host).contentVisibility === "hidden")
			return unknown("this border color has no rendered native host");
	const observed: string[] = [];
	let matches = true;
	for (const entry of expected) {
		if (systemColor.test(entry.color)) return unknown(refusals.unsupported);
		if (
			["none", "hidden"].includes(style.getPropertyValue(`border-${entry.side}-style`)) ||
			Number.parseFloat(style.getPropertyValue(`border-${entry.side}-width`)) === 0
		)
			return unknown("this border color has no painted native border side");
		const value = style.getPropertyValue(`border-${entry.side}-color`);
		observed.push(`${entry.side}: ${value}`);
		const comparison = nativeColorComparison(entry.color, value);
		if (comparison.kind === "unknown") return unknown(refusals[comparison.reason]);
		if (!comparison.matches) matches = false;
	}
	return { kind: "known", matches, observed: observed.join("; ") };
}
