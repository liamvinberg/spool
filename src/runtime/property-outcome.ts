import type { SourcePropertyEffect, SourcePropertyExpectation } from "../source-property";

export interface PropertyOutcome {
	rendered: "verified" | "mismatching" | "unverified";
	observed?: string;
	reason?: string;
}

/** Read each use independently. Parsing never adopts a stylesheet or changes the authored document. */
export function propertyOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	if (expected.property !== "opacity") return unverified("this property needs a native effect proof");
	if (expected.scope !== "") return unverified("this conditional property scope needs a native effect proof");
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this use has no native document context");
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const applicable: SourcePropertyEffect[] = [];
	for (const effect of expected.effects) {
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		if (effect.property !== "opacity") return unverified("this opacity has dependent effects requiring native proof");
		const selectors = effect.path.filter((part) => !part.startsWith("@"));
		if (selectors.length !== 1) return unverified("this property effect needs a nested selector proof");
		const selector = selectors[0]!;
		if (effect.owner === null) {
			try {
				if (!element.matches(selector)) continue;
			} catch {
				return unverified("this property effect has no native selector proof");
			}
		} else if (selector !== "$") return unverified("this property effect needs a prospective selector proof");
		if (effect.path.some((part) => part.startsWith("@") && !part.startsWith("@layer ")))
			return unverified("this property effect needs a conditional context proof");
		applicable.push(effect);
	}

	const sheet = new CSSStyleSheet();
	sheet.replaceSync(expected.css);
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
	let winner: SourcePropertyEffect | undefined;
	let rank = Number.NEGATIVE_INFINITY;
	for (const effect of applicable.filter((effect) => effect.important === important)) {
		const next = priority(effect);
		if (next === undefined) return unverified("this property effect needs a cascade layer proof");
		if (next === rank) return unverified("competing property effects need a specificity proof");
		if (next > rank) {
			winner = effect;
			rank = next;
		}
	}
	if (winner?.owner === null && applicable.some((effect) => effect.owner !== null))
		return unverified("the expected utility is masked by another declaration");
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
