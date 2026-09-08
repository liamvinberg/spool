import { parse, parseExpression } from "@babel/parser";
import type { CallExpression, JSXElement, StringLiteral } from "@babel/types";
import type { SpanPatch } from "./hand-write";
import { walkNodes } from "./jsx-walk";
import type { Target } from "./source-origins";

interface ClassLiteral {
	value: StringLiteral | undefined;
	jsx: boolean;
	attribute: { start: number; end: number } | undefined;
	insert: number;
}

function classLiteral(source: string, target: Target): ClassLiteral {
	let creation: JSXElement | CallExpression | undefined;
	walkNodes(parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), [], (node) => {
		if (
			(node.type === "JSXElement" || node.type === "CallExpression") &&
			node.start === target.address.start &&
			node.end === target.address.end
		)
			creation = node;
	});
	if (!creation || target.slot !== "class") throw new Error("the original class source role changed");
	if (creation.type === "JSXElement") {
		const open = creation.openingElement;
		if (open.attributes.some((attribute) => attribute.type === "JSXSpreadAttribute"))
			throw new Error("a spread has no independent class field proof");
		const fields = open.attributes.filter(
			(attribute) =>
				attribute.type === "JSXAttribute" &&
				attribute.name.type === "JSXIdentifier" &&
				attribute.name.name === "className",
		);
		if (fields.length > 1) throw new Error("a duplicate class field has no single source owner");
		const field = fields[0];
		if (!field)
			return { value: undefined, jsx: true, attribute: undefined, insert: open.end! - (open.selfClosing ? 2 : 1) };
		if (field.type !== "JSXAttribute") throw new Error("the original class field changed");
		const value =
			field.value?.type === "StringLiteral"
				? field.value
				: field.value?.type === "JSXExpressionContainer" && field.value.expression.type === "StringLiteral"
					? field.value.expression
					: undefined;
		if (!value || value.value !== target.expected)
			throw new Error("the class expression cannot be replaced by a literal");
		return {
			value,
			jsx: field.value === value,
			attribute: { start: field.start!, end: field.end! },
			insert: value.end! - 1,
		};
	}
	const config = creation.arguments[1];
	if (
		config?.type !== "ObjectExpression" ||
		config.properties.some((property) => property.type !== "ObjectProperty" || property.computed)
	)
		throw new Error("the factory class field has no independent literal config");
	const fields = config.properties.filter(
		(property) =>
			property.type === "ObjectProperty" &&
			((property.key.type === "Identifier" && property.key.name === "className") ||
				(property.key.type === "StringLiteral" && property.key.value === "className")),
	);
	const field = fields[0];
	if (
		fields.length !== 1 ||
		field?.type !== "ObjectProperty" ||
		field.value.type !== "StringLiteral" ||
		field.value.value !== target.expected
	)
		throw new Error("the original factory class literal changed");
	return { value: field.value, jsx: false, attribute: undefined, insert: field.value.end! - 1 };
}

/** Preserve the authored encoding while locating decoded class tokens exactly. */
function positions(source: string, literal: StringLiteral, jsx: boolean) {
	const start = literal.start! + 1;
	const raw = source.slice(start, literal.end! - 1);
	const quote = source[literal.start!];
	const spans: { start: number; end: number }[] = [];
	let value = "";
	for (let at = 0; at < raw.length; ) {
		const piece = jsx
			? (/^&(?:#x[\da-f]+|#\d+|\w+);/i.exec(raw.slice(at))?.[0] ?? raw[at]!)
			: (/^\\(?:u\{[\da-f]+\}|u[\da-f]{4}|x[\da-f]{2}|\r?\n|.)/i.exec(raw.slice(at))?.[0] ?? raw[at]!);
		let decoded = piece;
		if (jsx && piece.startsWith("&") && piece.length > 1) {
			const node = parseExpression(`<x a="${piece}"/>`, { plugins: ["jsx"] });
			const attribute = node.type === "JSXElement" ? node.openingElement.attributes[0] : undefined;
			if (attribute?.type !== "JSXAttribute" || attribute.value?.type !== "StringLiteral")
				throw new Error("the class entity has no source mapping");
			decoded = attribute.value.value;
		} else if (!jsx && piece.startsWith("\\")) {
			const node = parseExpression(`${quote}${piece}${quote}`);
			if (node.type !== "StringLiteral") throw new Error("the class escape has no source mapping");
			decoded = node.value;
		}
		for (let index = 0; index < decoded.length; index++)
			spans.push({ start: start + at, end: start + at + piece.length });
		value += decoded;
		at += piece.length;
	}
	if (value !== literal.value) throw new Error("the decoded class source mapping changed");
	return spans;
}

function encode(value: string, jsx: boolean): string {
	return jsx
		? value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;")
		: JSON.stringify(value)
				.slice(1, -1)
				.replaceAll("'", "\\'")
				.replaceAll("\u2028", "\\u2028")
				.replaceAll("\u2029", "\\u2029");
}

/** Candidate spellings arrive only after the property compiler proves their affected effects. */
export function planPropertyLiteral(
	source: string,
	target: Target,
	remove: readonly string[],
	add: readonly string[],
): SpanPatch[] {
	const literal = classLiteral(source, target);
	if (add.some((token) => !token || /\s/.test(token))) throw new Error("a class candidate is not one literal token");
	if (!literal.value) {
		if (target.expected !== null || remove.length) throw new Error("the original absent class field changed");
		return add.length
			? [{ start: literal.insert, end: literal.insert, text: ` className="${encode(add.join(" "), true)}"` }]
			: [];
	}
	const matches = [...literal.value.value.matchAll(/\S+/g)];
	const tokens = matches.map((match) => match[0]);
	if (new Set(tokens).size !== tokens.length || new Set(add).size !== add.length)
		throw new Error("duplicate class tokens have no independent source spans");
	if (
		remove.some((token) => !tokens.includes(token)) ||
		add.some((token) => tokens.includes(token) && !remove.includes(token))
	)
		throw new Error("the property tokens no longer match their original source read");
	const retained = tokens.filter((token) => !remove.includes(token));
	if (!retained.length && !add.length && literal.attribute) return [{ ...literal.attribute, text: "" }];
	const spans = positions(source, literal.value, literal.jsx);
	const patches = matches
		.filter((match) => remove.includes(match[0]))
		.map(
			(match): SpanPatch => ({
				start: spans[match.index]!.start,
				end: spans[match.index + match[0].length - 1]!.end,
				text: "",
			}),
		);
	if (add.length) {
		const replaced = patches.at(-1);
		if (replaced) replaced.text = encode(add.join(" "), literal.jsx);
		else
			patches.push({
				start: literal.insert,
				end: literal.insert,
				text: encode(
					`${literal.value.value && !/\s$/.test(literal.value.value) ? " " : ""}${add.join(" ")}`,
					literal.jsx,
				),
			});
	}
	return patches;
}
