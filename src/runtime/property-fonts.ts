export type NativeFontProperty = "font-family" | "font-variant-numeric";
export type NativeFontResult =
	| { kind: "known"; matches: boolean; observed: string }
	| { kind: "unknown"; reason: string };
function families(value: string): string[] | undefined {
	const entries: string[] = [];
	let start = 0,
		quoted = false;
	for (let index = 0; index <= value.length; index++) {
		const character = value[index];
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === '"') quoted = !quoted;
		if (index === value.length || (character === "," && !quoted)) {
			const token = value.slice(start, index).trim();
			if (!token) return;
			const isString = token.startsWith('"') && token.endsWith('"');
			let name = isString ? token.slice(1, -1) : token;
			name = name.replace(
				/\\([0-9a-f]{1,6})(?:\r\n|[ \n\r\t\f])?|\\(.)/gi,
				(_match: string, hex: string | undefined, escaped: string | undefined) =>
					hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : escaped!,
			);
			name = name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
			if (!isString && /[()"'\\]/.test(name)) return;
			const generic =
				!isString &&
				[
					"serif",
					"sans-serif",
					"monospace",
					"cursive",
					"fantasy",
					"system-ui",
					"ui-serif",
					"ui-sans-serif",
					"ui-monospace",
					"ui-rounded",
					"math",
					"emoji",
					"fangsong",
				].includes(name);
			entries.push(`${generic ? "generic" : "named"}:${name}`);
			start = index + 1;
		}
	}
	return quoted ? undefined : entries;
}

function hasNativeText(element: HTMLElement): boolean {
	if (element instanceof HTMLInputElement)
		return (
			["text", "search", "tel", "url", "email", "password", "number"].includes(element.type) &&
			Boolean(element.value.trim())
		);
	if (element instanceof HTMLTextAreaElement) return Boolean(element.value.trim());
	return [...element.childNodes].some((node) => {
		if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
		const range = element.ownerDocument.createRange();
		range.selectNodeContents(node);
		return [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
	});
}

/** Compares configured declarations only; the caller owns source, cascade, defaults and font effect proof. */
export function nativeFont(element: Element, property: NativeFontProperty, expectedValue: string): NativeFontResult {
	const unknown = (reason: string): NativeFontResult => ({ kind: "unknown", reason });
	const view = element.ownerDocument.defaultView;
	if (
		!view ||
		!element.isConnected ||
		element.getRootNode() !== element.ownerDocument ||
		!(element instanceof HTMLElement)
	)
		return unknown("this font needs a rendered native text context");
	const style = view.getComputedStyle(element);
	if (
		element.getClientRects().length === 0 ||
		style.visibility !== "visible" ||
		style.fontSize === "0px" ||
		!hasNativeText(element)
	)
		return unknown("this font needs a rendered native text context");
	for (let host: Element | null = element; host; host = host.parentElement)
		if (view.getComputedStyle(host).contentVisibility === "hidden")
			return unknown("this font needs a rendered native text context");
	if (element.ownerDocument.fonts?.status !== "loaded")
		return unknown("this font needs a settled native loading context");
	if (property === "font-variant-numeric" && style.fontFeatureSettings !== "normal")
		return unknown("this numeric font needs a feature override proof");
	let expected: string;
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":root{}");
		const rule = sheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) return unknown("the native font parser is unavailable");
		rule.style.setProperty(property, expectedValue);
		expected = rule.style.getPropertyValue(property);
	} catch {
		return unknown("the native font parser is unavailable");
	}
	if (!expected || ["inherit", "initial", "unset", "revert", "revert-layer"].includes(expected))
		return unknown("this font needs a resolved supported declaration");
	const observed = style.getPropertyValue(property);
	if (property === "font-variant-numeric") {
		const left = expected.split(/\s+/).sort(),
			right = observed.split(/\s+/).sort();
		const supported = [
			"normal",
			"ordinal",
			"slashed-zero",
			"lining-nums",
			"oldstyle-nums",
			"proportional-nums",
			"tabular-nums",
			"diagonal-fractions",
			"stacked-fractions",
		];
		if ([...left, ...right].some((word) => !supported.includes(word)))
			return unknown("this font needs a resolved supported declaration");
		return { kind: "known", matches: left.join(" ") === right.join(" "), observed };
	}
	const left = families(expected),
		right = families(observed);
	if (!left || !right) return unknown("this font needs a resolved supported declaration");
	const differences = left.filter((name, index) => name !== right[index]);
	if (left.length !== right.length) return { kind: "known", matches: false, observed };
	if (differences.length && [...left, ...right].some((name) => /[^\p{ASCII}]/u.test(name)))
		return unknown("this font family needs a Unicode name comparison proof");
	if (
		differences.length &&
		left.every(
			(name, index) =>
				name === right[index] ||
				(["named:blinkmacsystemfont", "named:system-ui"].includes(name) &&
					["named:blinkmacsystemfont", "named:system-ui"].includes(right[index]!)),
		)
	)
		return unknown("this font family needs a native platform alias proof");
	return { kind: "known", matches: differences.length === 0, observed };
}
