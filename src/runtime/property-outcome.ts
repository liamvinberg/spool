import type { SourcePropertyEffect, SourcePropertyExpectation } from "../source-property";

export interface PropertyOutcome {
	rendered: "verified" | "mismatching" | "unverified" | "inactive";
	observed?: string;
	reason?: string;
}

/** Read each use independently. Parsing never adopts a stylesheet or changes the authored document. */
export function propertyOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome {
	const unverified = (reason: string): PropertyOutcome => ({ rendered: "unverified", reason });
	const view = element.ownerDocument.defaultView;
	if (!view) return unverified("this use has no native document context");
	const scopes = expected.scopePaths.map((path) => pathCondition(element, path, true));
	if (scopes.length === 0) return unverified("the selected property has no compiled condition proof");
	if (!scopes.includes("active")) {
		if (scopes.includes("unverified"))
			return unverified("the selected property condition needs a native context proof");
		return { rendered: "inactive", reason: "the selected compiled condition is inactive for this use" };
	}
	const color = expected.property === "color" || expected.property === "background-color";
	if (expected.property !== "opacity" && expected.property !== "font-size" && !color)
		return unverified("this property needs a native effect proof");
	const classes = new Set(expected.className.split(/\s+/).filter(Boolean));
	const applicable: SourcePropertyEffect[] = [];
	for (const effect of expected.effects) {
		if (effect.owner !== null && !classes.has(effect.owner)) continue;
		if (effect.property !== expected.property)
			return unverified("this property has dependent effects requiring native proof");
		const condition = pathCondition(element, effect.path, effect.owner !== null);
		if (condition === "inactive") continue;
		if (condition === "unverified")
			return unverified("this property effect needs a native selector or conditional context proof");
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
	if (color) {
		if (!winner) return unverified("this color needs an inherited or default context proof");
		const value = resolvedValue(element, sheet, winner.value);
		const observed = view.getComputedStyle(element).getPropertyValue(expected.property);
		const wanted = value === undefined ? undefined : nativeColor(value);
		const actual = nativeColor(observed);
		if (wanted === undefined || actual === undefined)
			return unverified("this color needs a variable or native context proof");
		return { rendered: wanted === actual ? "verified" : "mismatching", observed };
	}
	if (expected.property === "font-size") {
		if (!winner) return unverified("this type size needs an inherited context proof");
		const value = resolvedValue(element, sheet, winner.value);
		const wanted = value === undefined ? undefined : fontSize(element, sheet, value);
		const observed = view.getComputedStyle(element).fontSize;
		if (wanted === undefined || !observed.endsWith("px"))
			return unverified("this type size needs a native length context proof");
		return { rendered: Number.parseFloat(observed) === wanted ? "verified" : "mismatching", observed };
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

type Condition = "active" | "inactive" | "unverified";

/** Only the compiler's utility subject is replaced; every state is read from the actual use. */
function pathCondition(element: Element, path: readonly string[], owned: boolean): Condition {
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
			const subject = selectors === 1 ? "$" : "&";
			if (!part.startsWith(subject)) {
				unknown = true;
				continue;
			}
			const states = part.slice(1);
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
		}
		try {
			if (!element.matches(selector)) return "inactive";
		} catch {
			unknown = true;
		}
	}
	return unknown || selectors === 0 ? "unverified" : "active";
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
		const collect = (rules: CSSRuleList, unconditional: boolean) => {
			for (const rule of rules) {
				if (rule instanceof CSSStyleRule) {
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

/** Native color serialization without drawing pixels or adopting styles into the application. */
function nativeColor(value: string): string | undefined {
	if (
		/\b(?:currentcolor|inherit|initial|unset|revert|revert-layer)\b|\b(?:light-dark|contrast-color|var|env|attr)\(/i.test(
			value,
		)
	)
		return;
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

/** Relative font sizes use this native use's root or parent, never another selected use. */
function fontSize(element: Element, sheet: CSSStyleSheet, value: string): number | undefined {
	const view = element.ownerDocument.defaultView;
	if (!view) return;
	const index = sheet.insertRule(":root {}", sheet.cssRules.length);
	const rule = sheet.cssRules[index];
	if (!(rule instanceof CSSStyleRule)) return;
	rule.style.fontSize = value;
	if (!rule.style.fontSize) return;
	const parsed = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|rem|em|%)$/i.exec(value.trim());
	if (!parsed) return;
	const number = Number(parsed[1]);
	const unit = parsed[2]!.toLowerCase();
	let computed = number;
	if (unit !== "px") {
		if (element === element.ownerDocument.documentElement) return;
		const context = unit === "rem" ? element.ownerDocument.documentElement : element.parentElement;
		if (!context) return;
		const inherited = view.getComputedStyle(context).fontSize;
		if (!inherited.endsWith("px")) return;
		computed *= Number.parseFloat(inherited) / (unit === "%" ? 100 : 1);
	}
	if (!Number.isFinite(computed)) return;
	// Preserve the authored precision during conversion; serialize only the final px value.
	rule.style.fontSize = `${computed}px`;
	return Number.parseFloat(rule.style.fontSize);
}
