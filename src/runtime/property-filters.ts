export type NativeFilterResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };

type FilterFunction = { name: string; amount: number };
const argumentPattern = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|px)?$/i;

function filterFunctions(value: string): FilterFunction[] | undefined {
	const text = value.trim().toLowerCase();
	if (text === "none") return [];
	if (!CSS.supports("filter", text)) return;
	const functions: FilterFunction[] = [];
	const pattern = /\s*([a-z-]+)\(\s*([^()]*)\)\s*/gy;
	while (pattern.lastIndex < text.length) {
		const match = pattern.exec(text);
		if (!match) return;
		const name = match[1]!;
		const argument = match[2]!.trim();
		const parsed = argument ? argumentPattern.exec(argument) : undefined;
		if (argument && !parsed) return;
		let amount = parsed ? Number(parsed[1]) : name === "blur" || name === "hue-rotate" ? 0 : 1;
		const unit = parsed?.[2] ?? "";
		if (!Number.isFinite(amount)) return;
		if (name === "hue-rotate") {
			if (unit !== "deg" && !(unit === "" && amount === 0)) return;
		} else if (name === "blur") {
			if (amount < 0 || (unit !== "px" && !(unit === "" && amount === 0))) return;
		} else {
			if (!["brightness", "contrast", "saturate", "grayscale", "invert", "sepia"].includes(name)) return;
			if (amount < 0 || !["", "%"].includes(unit)) return;
			if (unit === "%") amount /= 100;
			if (["grayscale", "invert", "sepia"].includes(name)) amount = Math.min(1, amount);
		}
		functions.push({ name, amount });
	}
	return functions.length ? functions : undefined;
}

function sameFilters(left: readonly FilterFunction[], right: readonly FilterFunction[]): boolean {
	return (
		left.length === right.length &&
		left.every((entry, index) => entry.name === right[index]!.name && entry.amount === right[index]!.amount)
	);
}

/** The caller owns the complete resolved declaration, ordered companions and source/cascade proof. */
export function nativeFilter(element: Element, expectedValue: string): NativeFilterResult {
	const unknown = (reason: string): NativeFilterResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this filter needs a connected native document context");
	if (!(element instanceof HTMLElement)) return unknown("this filter needs an HTML native host proof");
	const style = view.getComputedStyle(element);
	if (element.getClientRects().length === 0 || style.visibility !== "visible")
		return unknown("this filter has no rendered native host");
	const observed = style.filter;
	const expected = filterFunctions(expectedValue);
	const actual = filterFunctions(observed);
	if (!expected || !actual) return unknown("this filter needs a resolved supported declaration");
	let represented: FilterFunction[] | undefined;
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":root{}");
		const rule = sheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) return unknown("this filter needs native declaration precision access");
		rule.style.setProperty("filter", expectedValue);
		represented = filterFunctions(rule.style.getPropertyValue("filter"));
	} catch {
		return unknown("this filter needs native declaration precision access");
	}
	if (!represented || !sameFilters(expected, represented))
		return unknown("this filter needs observable native numeric precision");
	const hasBlur = [...expected, ...actual].some((entry) => entry.name === "blur");
	for (let host: Element | null = element; host; host = host.parentElement) {
		const context = host === element ? style : view.getComputedStyle(host);
		if (context.contentVisibility === "hidden") return unknown("this filter has no rendered native host");
		if (hasBlur && !["1", "normal"].includes(context.getPropertyValue("zoom")))
			return unknown("this blur needs an unscaled native length context");
	}
	return {
		kind: "known",
		matches: sameFilters(expected, actual),
		observed,
	};
}
