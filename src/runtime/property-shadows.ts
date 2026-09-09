import { nativeColor } from "./property-colors";

export type NativeShadowResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };
type ShadowLayer = { color: string; inset: boolean; lengths: readonly [number, number, number, number] };

function shadowParts(value: string, separator: "," | " "): string[] | undefined {
	const parts: string[] = [];
	let depth = 0,
		start = 0;
	for (let index = 0; index < value.length; index++) {
		const character = value[index]!;
		if (character === "(") depth++;
		else if (character === ")") {
			depth--;
			if (depth < 0) return;
		}
		if (depth === 0 && (separator === "," ? character === "," : /\s/.test(character))) {
			const part = value.slice(start, index).trim();
			if (part) parts.push(part);
			else if (separator === ",") return;
			start = index + 1;
		}
	}
	if (depth !== 0) return;
	const last = value.slice(start).trim();
	if (last) parts.push(last);
	else if (separator === ",") return;
	return parts;
}

function shadows(value: string): ShadowLayer[] | undefined {
	if (value.trim().toLowerCase() === "none") return [];
	if (
		value.includes("\\") ||
		/\b(?:accentcolor(?:text)?|activetext|buttonborder|buttonface|buttontext|canvas(?:text)?|field(?:text)?|graytext|highlight(?:text)?|linktext|mark(?:text)?|selecteditem(?:text)?|visitedtext|activeborder|activecaption|appworkspace|background|buttonhighlight|buttonshadow|captiontext|inactiveborder|inactivecaption(?:text)?|infobackground|infotext|menu(?:text)?|scrollbar|threeddarkshadow|threedface|threedhighlight|threedlightshadow|threedshadow|window(?:frame|text)?)\b/i.test(
			value,
		) ||
		!CSS.supports("box-shadow", value)
	)
		return;
	const layers = shadowParts(value, ",");
	if (!layers) return;
	const result: ShadowLayer[] = [];
	for (const layer of layers) {
		const tokens = shadowParts(layer, " ");
		if (!tokens) return;
		const lengths: number[] = [];
		let color: string | undefined;
		let inset = false;
		for (const token of tokens) {
			if (token.toLowerCase() === "inset") {
				inset = true;
				continue;
			}
			const length = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px)?$/i.exec(token);
			if (length && (length[2] || Number(length[1]) === 0)) lengths.push(Number(length[1]));
			else {
				if (color) return;
				color = nativeColor(token);
				if (!color) return;
			}
		}
		if (!color || lengths.length < 2 || lengths.length > 4 || !lengths.every(Number.isFinite)) return;
		result.push({ color, inset, lengths: [lengths[0]!, lengths[1]!, lengths[2] ?? 0, lengths[3] ?? 0] });
	}
	return result;
}

function sameShadows(left: readonly ShadowLayer[], right: readonly ShadowLayer[]): boolean {
	return (
		left.length === right.length &&
		left.every((layer, index) => {
			const other = right[index]!;
			return (
				layer.color === other.color &&
				layer.inset === other.inset &&
				layer.lengths.every((value, index) => value === other.lengths[index])
			);
		})
	);
}

/** The caller supplies the complete resolved shadow sequence and owns source/cascade/companion proof. */
export function nativeShadow(element: Element, expectedValue: string): NativeShadowResult {
	const unknown = (reason: string): NativeShadowResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this shadow has no rendered native host");
	if (!(element instanceof HTMLElement)) return unknown("this shadow needs a proven native box applicability context");
	const style = view.getComputedStyle(element);
	const boxes = element.getClientRects();
	if (boxes.length === 0 || style.visibility !== "visible") return unknown("this shadow has no rendered native host");
	if (boxes.length !== 1 || (style.display.startsWith("table-") && style.borderCollapse === "collapse"))
		return unknown("this shadow needs a proven native box applicability context");
	if (view.matchMedia("(forced-colors: active)").matches)
		return unknown("this shadow needs an unforced native color context");
	for (let host: Element | null = element; host; host = host.parentElement) {
		const context = host === element ? style : view.getComputedStyle(host);
		if (context.contentVisibility === "hidden") return unknown("this shadow has no rendered native host");
		if (
			context.clipPath !== "none" ||
			context.maskImage !== "none" ||
			context.clip !== "auto" ||
			/\b(?:paint|content|strict)\b/.test(context.contain) ||
			(host !== element && (context.overflowX !== "visible" || context.overflowY !== "visible"))
		)
			return unknown("this shadow needs an unclipped native box context");
	}
	const observed = style.boxShadow;
	const expected = shadows(expectedValue),
		actual = shadows(observed);
	if (!expected || !actual) return unknown("this shadow needs a resolved supported declaration");
	let represented: ShadowLayer[] | undefined;
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":root{}");
		const rule = sheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) return unknown("this shadow needs native declaration precision access");
		rule.style.setProperty("box-shadow", expectedValue);
		represented = shadows(rule.style.getPropertyValue("box-shadow"));
	} catch {
		return unknown("this shadow needs native declaration precision access");
	}
	if (!represented || !sameShadows(expected, represented))
		return unknown("this shadow needs observable native numeric precision");
	return { kind: "known", matches: sameShadows(expected, actual), observed };
}
