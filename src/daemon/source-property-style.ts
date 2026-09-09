import { parse } from "@babel/parser";
import type { CallExpression, JSXElement, Node, ObjectExpression } from "@babel/types";
import type { SourcePropertyEffect } from "../source-property";
import type { SpanPatch } from "./hand-write";
import { walkNodes } from "./jsx-walk";

import { literalStyleMembers } from "./source-style-members";

/**
 * The inline style member as a source role.
 *
 * A `style={{...}}` literal is not a class literal: nothing compiles it, and
 * every member is its own declaration on the element itself. What it shares
 * with a class is the shape of an effect, so a member is read into the same
 * `SourcePropertyEffect` the compiler produces, and every later reader (scope
 * paths, dependencies, native evaluation) keeps working unchanged.
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
function styleMemberValue(key: string, value: string | number): string {
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

/** The member key a declaration is spelled with; a custom property keeps its name. */
export function styleMemberKey(property: string): string {
	if (property.startsWith("--")) return property;
	const vendor = /^-(ms|webkit|moz|o)-/.exec(property);
	const rest = (vendor ? property.slice(vendor[0].length) : property).replace(/-([a-z])/g, (_, letter: string) =>
		letter.toUpperCase(),
	);
	if (!vendor) return rest;
	// React spells `-ms-` lowercase and every other vendor prefix capitalised.
	const prefix = vendor[1] === "ms" ? "ms" : vendor[1]![0]!.toUpperCase() + vendor[1]!.slice(1);
	return prefix + rest[0]!.toUpperCase() + rest.slice(1);
}

/** A changed value keeps the form its author wrote: a bare number stays a number. */
function authoredValue(key: string, value: string, form: StyleMember | undefined): string | number {
	const css = value.trim();
	if (typeof form?.value !== "number") return css;
	if (UNITLESS.has(key) || key.startsWith("--")) return /^-?\d*\.?\d+$/.test(css) ? Number(css) : css;
	const pixels = /^(-?\d*\.?\d+)px$/.exec(css);
	if (pixels) return Number(pixels[1]);
	return css === "0" ? 0 : css;
}

/**
 * The member list one supported change produces.
 *
 * A member already spelling the property is changed where it stands, so the
 * order that decides inline priority is untouched. A property a shorthand owns
 * gets its own longhand after every member the read proved, which is the only
 * place a longhand overrides a shorthand.
 */
export function planStyleMembers(
	members: readonly StyleMember[],
	property: string,
	owner: readonly string[],
	requested: string | null,
): readonly StyleMember[] {
	const key = styleMemberKey(property);
	const held = members.find((member) => member.key === key && owner.includes(member.key));
	if (requested === null) {
		if (!held) throw new Error("this side belongs to a shorthand member that its other sides still need");
		return members.filter((member) => member !== held);
	}
	const form = held ?? members.find((member) => owner.includes(member.key));
	const next: StyleMember = { key, value: authoredValue(key, requested, form), enumerable: true };
	// A written value keeps its own effect: the read already refused a member
	// React would drop, and this one is held to the same account.
	styleMemberEffects([next]);
	return held ? members.map((member) => (member === held ? next : member)) : [...members, next];
}

function styleObject(source: string, address: { start: number; end: number }): ObjectExpression {
	let creation: JSXElement | CallExpression | undefined;
	walkNodes(parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), [], (node) => {
		if (
			(node.type === "JSXElement" || node.type === "CallExpression") &&
			node.start === address.start &&
			node.end === address.end
		)
			creation = node;
	});
	if (!creation) throw new Error("the original inline style source role changed");
	let object: Node | undefined;
	if (creation.type === "JSXElement") {
		const attributes = creation.openingElement.attributes;
		if (attributes.some((attribute) => attribute.type === "JSXSpreadAttribute"))
			throw new Error("a spread has no independent inline style field proof");
		const fields = attributes.filter(
			(attribute) =>
				attribute.type === "JSXAttribute" &&
				attribute.name.type === "JSXIdentifier" &&
				attribute.name.name === "style",
		);
		const field = fields.length === 1 ? fields[0] : undefined;
		if (field?.type === "JSXAttribute" && field.value?.type === "JSXExpressionContainer")
			object = field.value.expression;
	} else {
		const config = creation.arguments[1];
		if (
			config?.type !== "ObjectExpression" ||
			config.properties.some((p) => p.type !== "ObjectProperty" || p.computed)
		)
			throw new Error("the factory style field has no independent literal config");
		const fields = config.properties.filter(
			(property) =>
				property.type === "ObjectProperty" &&
				((property.key.type === "Identifier" && property.key.name === "style") ||
					(property.key.type === "StringLiteral" && property.key.value === "style")),
		);
		const field = fields.length === 1 ? fields[0] : undefined;
		if (field?.type === "ObjectProperty") object = field.value;
	}
	if (object?.type !== "ObjectExpression") throw new Error("the original inline style literal changed");
	return object;
}

/** An added member is written the way an author would spell it, key and value both. */
function memberSyntax(member: StyleMember): string {
	const key = /^[A-Za-z_$][\w$]*$/.test(member.key) ? member.key : JSON.stringify(member.key);
	return `${key}: ${typeof member.value === "number" ? String(member.value) : JSON.stringify(member.value)}`;
}

/**
 * The patches one member change makes in the authored object.
 *
 * Every other member keeps its own bytes: its spelling, its quotes and its
 * spacing. The literal is re-read here rather than trusted, so a source that
 * moved under the edit refuses instead of writing over someone else's member.
 */
export function planStyleLiteral(
	source: string,
	address: { start: number; end: number },
	before: readonly StyleMember[],
	after: readonly StyleMember[],
): SpanPatch[] {
	const object = styleObject(source, address);
	const current = literalStyleMembers(object);
	if (JSON.stringify(current) !== JSON.stringify(before))
		throw new Error("the inline style members no longer match their original source read");
	const kept = after.filter((member) => before.some((held) => held.key === member.key));
	const surviving = before.filter((member) => after.some((held) => held.key === member.key));
	if (JSON.stringify(kept.map((member) => member.key)) !== JSON.stringify(surviving.map((member) => member.key)))
		throw new Error("an inline style member cannot be reordered by a property change");
	const patches: SpanPatch[] = [];
	object.properties.forEach((property, index) => {
		if (property.type !== "ObjectProperty") throw new Error("the original inline style literal changed");
		const held = before[index]!;
		const wanted = after.find((member) => member.key === held.key);
		if (!wanted) {
			const previous = object.properties[index - 1];
			patches.push({ start: previous ? previous.end! : object.start! + 1, end: property.end!, text: "" });
		} else if (wanted.value !== held.value)
			patches.push({
				start: property.value.start!,
				end: property.value.end!,
				text: memberSyntax(wanted).slice(memberSyntax(wanted).indexOf(": ") + 2),
			});
	});
	const added = after.filter((member) => !before.some((held) => held.key === member.key));
	if (added.length) {
		const last = object.properties.at(-1);
		const at = last ? last.end! : object.start! + 1;
		patches.push({ start: at, end: at, text: `${last ? ", " : ""}${added.map(memberSyntax).join(", ")}` });
	}
	return patches;
}
