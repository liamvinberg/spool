export type NativeTransitionProperty = "transition-duration" | "transition-delay" | "transition-timing-function";
export type NativeTransitionResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };

function transitionTimes(value: string): number[] | undefined {
	const entries = value.split(",").map((part) => {
		const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:e([+-]?\d+))?(ms|s)\s*$/i.exec(part);
		if (!match) return Number.NaN;
		// Shift the decimal exponent before conversion, avoiding a second binary rounding step.
		return Number(`${match[1]}e${Number(match[2] ?? 0) - (match[3]?.toLowerCase() === "ms" ? 3 : 0)}`);
	});
	return entries.every(Number.isFinite) ? entries : undefined;
}

const keywordEasings: Record<string, string> = {
	linear: "cubic-bezier(0,0,1,1)",
	ease: "cubic-bezier(0.25,0.1,0.25,1)",
	"ease-in": "cubic-bezier(0.42,0,1,1)",
	"ease-out": "cubic-bezier(0,0,0.58,1)",
	"ease-in-out": "cubic-bezier(0.42,0,0.58,1)",
	"step-start": "steps(1,jump-start)",
	"step-end": "steps(1,jump-end)",
};
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function easing(value: string): string | undefined {
	if (Object.hasOwn(keywordEasings, value)) return keywordEasings[value];
	const curve = /^cubic-bezier\(([^()]*)\)$/.exec(value);
	if (curve) {
		const parts = curve[1]!.split(",").map((part) => part.trim());
		if (parts.length !== 4 || !parts.every((part) => numberPattern.test(part))) return;
		const points = parts.map(Number);
		if (!points.every(Number.isFinite)) return;
		return `cubic-bezier(${points.join(",")})`;
	}
	const steps = /^steps\(\s*([+]?\d+)\s*(?:,\s*(start|end|jump-start|jump-end|jump-none|jump-both)\s*)?\)$/.exec(
		value,
	);
	if (!steps || !Number.isSafeInteger(Number(steps[1]))) return;
	const position = steps[2] ?? "end";
	return `steps(${Number(steps[1])},${position === "start" || position === "end" ? `jump-${position}` : position})`;
}

function transitionValues(property: NativeTransitionProperty, value: string): (string | number)[] | undefined {
	const text = value.trim().toLowerCase();
	if (!CSS.supports(property, text)) return;
	if (property !== "transition-timing-function") return transitionTimes(text);
	const values: string[] = [];
	const pattern = /\s*([a-z-]+(?:\([^()]*\))?)\s*(,|$)/gy;
	while (pattern.lastIndex < text.length) {
		const match = pattern.exec(text);
		if (!match) return;
		const entry = easing(match[1]!);
		if (!entry) return;
		values.push(entry);
	}
	return values.length ? values : undefined;
}
function sameValues(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Compare configured values; the caller owns source, complete lists and transition applicability. */
export function nativeTransition(
	element: Element,
	property: NativeTransitionProperty,
	expectedValue: string,
): NativeTransitionResult {
	const unknown = (reason: string): NativeTransitionResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this transition needs a connected native document context");
	const style = view.getComputedStyle(element);
	if (element.getClientRects().length === 0 || style.visibility !== "visible")
		return unknown("this transition has no rendered native host");
	for (let host: Element | null = element; host; host = host.parentElement) {
		if ((host === element ? style : view.getComputedStyle(host)).contentVisibility === "hidden")
			return unknown("this transition has no rendered native host");
	}
	const observed = style.getPropertyValue(property);
	const expected = transitionValues(property, expectedValue);
	const actual = transitionValues(property, observed);
	if (!expected || !actual) return unknown("this transition needs a resolved supported declaration");
	let represented: (string | number)[] | undefined;
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":root{}");
		const rule = sheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) return unknown("this transition needs native declaration precision access");
		rule.style.setProperty(property, expectedValue);
		represented = transitionValues(property, rule.style.getPropertyValue(property));
	} catch {
		return unknown("this transition needs native declaration precision access");
	}
	if (!represented || !sameValues(expected, represented))
		return unknown("this transition needs observable native numeric precision");
	return {
		kind: "known",
		matches: sameValues(expected, actual),
		observed,
	};
}
