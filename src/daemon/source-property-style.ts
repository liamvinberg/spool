import type { SourcePropertyEffect, SourcePropertyEnvironment } from "../source-property";
import { propertyKeys } from "./source-property-effects";

/**
 * The inline style member as a source role.
 *
 * A `style={{...}}` literal is not a class literal: nothing compiles it, and
 * every member is its own declaration on the element itself. What it shares
 * with a class is the shape of an effect, so a member is read into the same
 * `SourcePropertyEffect` the compiler produces and every later reader — scope
 * paths, dependencies, native evaluation — keeps working unchanged.
 */
export interface StyleMember {
	key: string;
	value: string | number;
	enumerable: boolean;
}

/**
 * React's own unitless properties: everywhere else a plain number means pixels.
 *
 * This is the list `react-dom` carries, plus the vendor spellings it derives
 * from it. A member whose meaning depends on this list is why an inline value
 * cannot be read as a bare CSS string.
 */
const UNITLESS = new Set(
	[
		"animationIterationCount",
		"aspectRatio",
		"borderImageOutset",
		"borderImageSlice",
		"borderImageWidth",
		"boxFlex",
		"boxFlexGroup",
		"boxOrdinalGroup",
		"columnCount",
		"columns",
		"flex",
		"flexGrow",
		"flexPositive",
		"flexShrink",
		"flexNegative",
		"flexOrder",
		"gridArea",
		"gridRow",
		"gridRowEnd",
		"gridRowSpan",
		"gridRowStart",
		"gridColumn",
		"gridColumnEnd",
		"gridColumnSpan",
		"gridColumnStart",
		"fontWeight",
		"lineClamp",
		"lineHeight",
		"opacity",
		"order",
		"orphans",
		"scale",
		"tabSize",
		"widows",
		"zIndex",
		"zoom",
		"fillOpacity",
		"floodOpacity",
		"stopOpacity",
		"strokeDasharray",
		"strokeDashoffset",
		"strokeMiterlimit",
		"strokeOpacity",
		"strokeWidth",
	].flatMap((name) => [
		name,
		...["Webkit", "ms", "Moz", "O"].map((prefix) => prefix + name[0]!.toUpperCase() + name.slice(1)),
	]),
);

/** The declaration a member key spells; a custom property keeps its authored name. */
export function styleMemberProperty(key: string): string {
	if (key.startsWith("--")) return key;
	if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key))
		throw new Error("this inline style member has no proven declaration spelling");
	return key
		.replace(/^(ms|Webkit|Moz|O)(?=[A-Z])/, (prefix) => `-${prefix.toLowerCase()}`)
		.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** React's `dangerousStyleValue`: the number's unit, and the string as authored. */
export function styleMemberValue(key: string, value: string | number): string {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error("this inline style member has no finite native value");
		return value === 0 || UNITLESS.has(key) || key.startsWith("--") ? String(value) : `${value}px`;
	}
	return value.trim();
}

/**
 * The effects a proven member list declares, in the order the object wrote them.
 *
 * Order is the whole of inline priority: a longhand after a shorthand overrides
 * it, and the reverse does not. Nothing here evaluates a getter or asks the
 * element what it computed; the members arrive already proven literal.
 */
export function styleMemberEffects(members: readonly StyleMember[]): SourcePropertyEffect[] {
	const effects: SourcePropertyEffect[] = [];
	for (const member of members) {
		if (!member.enumerable) throw new Error("a style member React never enumerates has no source effect");
		const value = styleMemberValue(member.key, member.value);
		if (/!\s*important/i.test(value))
			throw new Error("an inline style member cannot carry an important marker React would drop");
		if (value === "") continue;
		effects.push({ owner: member.key, path: [], property: styleMemberProperty(member.key), value, important: false });
	}
	return effects;
}

/** Which source the selected roots' winning effects belong to, or an explicit refusal. */
export function stylePropertyOwner(
	roots: ReadonlySet<string>,
	classEffects: readonly SourcePropertyEffect[],
	styleEffects: readonly SourcePropertyEffect[],
	environment: SourcePropertyEnvironment,
): { kind: "class" } | { kind: "style"; members: readonly string[] } {
	const winners = new Map<string, SourcePropertyEffect | undefined>();
	for (const root of roots) {
		const covers = (effect: SourcePropertyEffect) => propertyKeys(effect.property, environment).includes(root);
		// An inline member outranks every ordinary declaration and loses to an
		// important one, which is the cascade this element actually runs under.
		const important = classEffects.filter((effect) => effect.important && covers(effect));
		winners.set(root, important.at(-1) ?? styleEffects.filter(covers).at(-1));
	}
	const owners = [...winners.values()];
	const inline = owners.filter((effect) => effect && styleEffects.includes(effect));
	if (inline.length === 0) return { kind: "class" };
	if (inline.length !== owners.length) throw new Error("this property's declarations are owned by different sources");
	return { kind: "style", members: [...new Set(inline.map((effect) => effect!.owner!))] };
}
