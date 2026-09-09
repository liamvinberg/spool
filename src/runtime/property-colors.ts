/** Native color serialization without drawing pixels or adopting styles into the application. */
export type NativeColorComparison =
	| { kind: "known"; matches: boolean }
	| { kind: "unknown"; reason: "unsupported" | "imprecise" | "space" };

type ColorNumbers = { space: string; values: number[] };

/** Reads the numbers a native color serialization carries, in the space it carries them. */
function colorNumbers(value: string): ColorNumbers | undefined {
	const match = /^(rgba?|oklch|oklab|lch|lab|color)\(([^()]*)\)$/i.exec(value.trim());
	if (!match) return;
	let space = match[1]!.toLowerCase().replace("rgba", "rgb");
	let content = match[2]!.trim();
	if (space === "color") {
		const model = /^([a-z0-9-]+)\s+(.+)$/i.exec(content);
		if (!model) return;
		space = `color:${model[1]!.toLowerCase()}`;
		content = model[2]!;
	}
	const words = content.split(/[\s,/]+/);
	if (words.length < 3 || words.length > 4) return;
	const values: number[] = [];
	for (const [index, word] of words.entries()) {
		const number = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg)?$/i.exec(word);
		if (!number) return;
		let amount = Number(number[1]);
		const unit = number[2];
		if (unit === "%") {
			const [mantissa, exponent = "0"] = number[1]!.toLowerCase().split("e");
			amount = Number(`${mantissa}e${Number(exponent) - 2}`);
			if (index !== 3) {
				if (space === "rgb") amount *= 255;
				else if (!(space.startsWith("color:") || ((space === "oklch" || space === "oklab") && index === 0))) return;
			}
		} else if (unit === "deg" && !(index === 2 && (space === "lch" || space === "oklch"))) return;
		if (!Number.isFinite(amount)) return;
		values.push(amount);
	}
	if (values.length === 3) values.push(1);
	return { space, values };
}

function sameNumbers(left: ColorNumbers, right: ColorNumbers): boolean {
	return (
		left.space === right.space &&
		left.values.length === right.values.length &&
		left.values.every((value, index) => value === right.values[index])
	);
}

/** The native parser's own record of a declaration, kept out of the document. */
function nativeRecord(value: string): string | undefined {
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":root{}");
		const rule = sheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) return;
		rule.style.setProperty("color", value);
		return rule.style.getPropertyValue("color") || undefined;
	} catch {
		return;
	}
}

/**
 * Native color storage drops digits it cannot keep, collapsing `rgba(10,20,30,.5000005)` and
 * `rgba(10,20,30,.5)` into one record. An expected value whose own numbers survive its native record
 * is admitted; one whose numbers do not is never certified equal to anything. Forms this reader makes
 * no numeric claim about, such as keywords, hex and color-mix, and hosts without a reachable native
 * parser keep their existing admission; callers that need parser access refuse it themselves.
 */
function admitsPrecision(value: string): boolean {
	const declared = colorNumbers(value);
	if (!declared) return true;
	const record = nativeRecord(value);
	const kept = record === undefined ? undefined : colorNumbers(record);
	return kept === undefined || sameNumbers(declared, kept);
}

export function nativeColor(value: string): string | undefined {
	if (
		/\b(?:currentcolor|inherit|initial|unset|revert|revert-layer)\b|\b(?:light-dark|contrast-color|var|env|attr)\(/i.test(
			value,
		)
	)
		return;
	if (!admitsPrecision(value)) return;
	const context = new OffscreenCanvas(1, 1).getContext("2d");
	if (!context) return;
	const parse = (input: string): string | undefined => {
		context.fillStyle = "#010203";
		context.fillStyle = input;
		const first = context.fillStyle;
		context.fillStyle = "#040506";
		context.fillStyle = input;
		return typeof first === "string" && first === context.fillStyle ? first : undefined;
	};
	// Serialize once before changing color spaces, matching computed CSS precision.
	const parsed = parse(value);
	return parsed === undefined ? undefined : parse(`color(from ${parsed} srgb r g b / alpha)`);
}

/**
 * Compares an independently supplied color against an observed native value. Equality is claimed only
 * when the shared sRGB serialization and both native records agree, since that serialization can round
 * two differently recorded colors together; a keyword or hex literal carries no numbers of its own.
 */
export function nativeColorComparison(expected: string, observed: string): NativeColorComparison {
	const wanted = nativeColor(expected),
		actual = nativeColor(observed);
	if (wanted === undefined || actual === undefined)
		return { kind: "unknown", reason: admitsPrecision(expected) ? "unsupported" : "imprecise" };
	if (wanted !== actual) return { kind: "known", matches: false };
	const record = nativeRecord(expected);
	const left = record === undefined ? undefined : colorNumbers(record),
		right = colorNumbers(observed);
	if (/^(?:[a-z]+|#[0-9a-f]{3,8})$/i.test(expected.trim()) && right?.space === "rgb")
		return { kind: "known", matches: true };
	if (!left || !right || !sameNumbers(left, right)) return { kind: "unknown", reason: "space" };
	return { kind: "known", matches: true };
}
