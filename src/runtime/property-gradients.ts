import { nativeColorComparison } from "./property-colors";

export type NativeGradientResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };

type Position = { amount: number; unit: "px" | "%" };
type Stop = { color: string; position: Position | undefined };
type Gradient = { direction: string; stops: Stop[] };

/** Splits a value at one nesting level, so functional colors and positions stay whole. */
function pieces(value: string, separator: "," | " "): string[] | undefined {
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

function position(token: string): Position | undefined {
	const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|%)$/i.exec(token);
	if (!match) return;
	const amount = Number(match[1]);
	return Number.isFinite(amount) ? { amount, unit: match[2]!.toLowerCase() as "px" | "%" } : undefined;
}

const sides = ["top", "right", "bottom", "left"];

/** An interpolation space this engine drops from a substituted value is never compared away. */
function interpolated(value: string): boolean {
	const trimmed = value.trim();
	if (!/^(?:repeating-)?linear-gradient\(/i.test(trimmed) || !trimmed.endsWith(")")) return false;
	const items = pieces(trimmed.slice(trimmed.indexOf("(") + 1, -1), ",");
	const prelude = items?.[0] === undefined ? undefined : pieces(items[0], " ");
	return prelude?.some((token) => token.toLowerCase() === "in") ?? false;
}

/** Reads one plain linear gradient; every other image form stays unread. */
function gradient(value: string): Gradient | undefined {
	const trimmed = value.trim();
	if (!/^linear-gradient\(/i.test(trimmed) || !trimmed.endsWith(")")) return;
	const items = pieces(trimmed.slice(trimmed.indexOf("(") + 1, -1), ",");
	if (!items || items.length < 2) return;
	let direction = "to bottom";
	const prelude = pieces(items[0]!, " ");
	if (!prelude) return;
	const angle = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)$/i.exec(prelude[0]!);
	if (/^to$/i.test(prelude[0]!)) {
		const named = prelude.slice(1).map((word) => word.toLowerCase());
		if (named.length < 1 || named.length > 2 || named.some((word) => !sides.includes(word))) return;
		if (named.length === 2 && sides.indexOf(named[0]!) % 2 === sides.indexOf(named[1]!) % 2) return;
		// The engine records a corner in its own order, so the pair is read as a set.
		direction = `to ${[...named].sort().join(" ")}`;
		items.shift();
	} else if (angle) {
		// Only degrees are represented here; other angle units keep their own native record.
		if (prelude.length !== 1 || angle[2]!.toLowerCase() !== "deg" || !Number.isFinite(Number(angle[1]))) return;
		direction = `${Number(angle[1])}deg`;
		items.shift();
	}
	if (items.length < 2) return;
	const stops: Stop[] = [];
	for (const item of items) {
		const tokens = pieces(item, " ");
		if (!tokens || tokens.length < 1 || tokens.length > 2) return;
		const place = tokens.length === 2 ? position(tokens[1]!) : undefined;
		if (tokens.length === 2 && !place) return;
		if (position(tokens[0]!)) return;
		stops.push({ color: tokens[0]!, position: place });
	}
	return { direction, stops };
}

/** A cleared background image, or one plain linear gradient. */
function image(value: string): "none" | Gradient | undefined {
	return value.trim().toLowerCase() === "none" ? "none" : gradient(value);
}

function samePosition(left: Position | undefined, right: Position | undefined): boolean {
	if (!left || !right) return !left && !right;
	return left.unit === right.unit && left.amount === right.amount;
}

type Agreement =
	| { kind: "known"; matches: boolean }
	| { kind: "unknown"; reason: "unsupported" | "imprecise" | "space" };

/** Direction and stop positions only; each stop color carries its own admission. */
function sameShape(left: Gradient, right: Gradient): boolean {
	return (
		left.direction === right.direction &&
		left.stops.length === right.stops.length &&
		left.stops.every((stop, index) => samePosition(stop.position, right.stops[index]!.position))
	);
}

function sameGradient(left: Gradient, right: Gradient): Agreement {
	if (left.direction !== right.direction || left.stops.length !== right.stops.length)
		return { kind: "known", matches: false };
	let matches = true;
	for (const [index, stop] of left.stops.entries()) {
		const other = right.stops[index]!;
		const comparison = nativeColorComparison(stop.color, other.color);
		if (comparison.kind === "unknown") return comparison;
		if (!comparison.matches || !samePosition(stop.position, other.position)) matches = false;
	}
	return { kind: "known", matches };
}

/** The caller supplies the complete resolved gradient and owns source, cascade and variable proof. */
export function nativeGradient(element: Element, expectedValue: string): NativeGradientResult {
	const unknown = (reason: string): NativeGradientResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (!view || !element.isConnected || element.getRootNode() !== element.ownerDocument)
		return unknown("this gradient has no rendered native host");
	if (!(element instanceof HTMLElement)) return unknown("this gradient needs a proven native paint context");
	const style = view.getComputedStyle(element);
	if (element.getClientRects().length === 0 || style.visibility !== "visible")
		return unknown("this gradient has no rendered native host");
	for (let host: Element | null = element; host; host = host.parentElement)
		if (view.getComputedStyle(host).contentVisibility === "hidden")
			return unknown("this gradient has no rendered native host");
	if (view.matchMedia("(forced-colors: active)").matches)
		return unknown("this gradient needs an unforced native color context");
	const observed = style.backgroundImage;
	if ((pieces(expectedValue, ",") ?? []).length !== 1 || (pieces(observed, ",") ?? []).length !== 1)
		return unknown("this gradient needs a single native image layer");
	if (interpolated(expectedValue) || interpolated(observed))
		return unknown("this gradient needs a native interpolation space proof");
	const expected = image(expectedValue),
		actual = image(observed);
	if (!expected || !actual) return unknown("this gradient needs a resolved supported linear declaration");
	// A cleared gradient is a value of its own, and no gradient is the removal it replaces.
	if (expected === "none" || actual === "none") return { kind: "known", matches: expected === actual, observed };
	let represented: Gradient | undefined;
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":root{}");
		const rule = sheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) return unknown("this gradient needs native declaration precision access");
		rule.style.setProperty("background-image", expectedValue);
		represented = gradient(rule.style.getPropertyValue("background-image"));
	} catch {
		return unknown("this gradient needs native declaration precision access");
	}
	if (!represented || !sameShape(expected, represented))
		return unknown("this gradient needs observable native numeric precision");
	const comparison = sameGradient(expected, actual);
	if (comparison.kind === "unknown")
		return unknown(
			comparison.reason === "imprecise"
				? "this gradient needs observable native color precision"
				: comparison.reason === "space"
					? "this gradient needs an exact native color-space comparison"
					: "this gradient needs a resolved supported color",
		);
	return { kind: "known", matches: comparison.matches, observed };
}
