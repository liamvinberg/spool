import { parse } from "@babel/parser";
import type { CallExpression, StringLiteral } from "@babel/types";
import type { SpanPatch } from "./hand-write";
import { walkNodes } from "./jsx-walk";

/** A field established by committed origin admission, never a rendered-value search. */
export interface FactoryLiteral {
	start: number;
	end: number;
	field: string;
	value: string;
}

export function factoryLiteral(source: string, target: FactoryLiteral): StringLiteral {
	if (["key", "ref", "type", "data-go", "src", "style", "className"].includes(target.field))
		throw new Error("this field requires its dedicated source operation");
	let call: CallExpression | undefined;
	walkNodes(parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), [], (node) => {
		if (node.type === "CallExpression" && node.start === target.start && node.end === target.end) call = node;
	});
	if (!call) throw new Error("the original factory call changed");
	if (call.arguments.some((argument) => argument.type === "SpreadElement"))
		throw new Error("spread arguments have no proven literal field");
	let literal: StringLiteral | undefined;
	if (target.field === "children" && call.arguments.length > 2) {
		if (call.arguments.length === 3 && call.arguments[2]?.type === "StringLiteral") literal = call.arguments[2];
	} else {
		const config = call.arguments[1];
		if (config?.type !== "ObjectExpression") throw new Error("an indirect config has no proven literal field");
		if (config.properties.some((property) => property.type !== "ObjectProperty" || property.computed))
			throw new Error("a computed, method or spread config has no proven literal field");
		const fields = config.properties.filter(
			(property) =>
				property.type === "ObjectProperty" &&
				((property.key.type === "Identifier" && property.key.name === target.field) ||
					(property.key.type === "StringLiteral" && property.key.value === target.field)),
		);
		if (fields.length !== 1) throw new Error("the original factory field is missing or duplicated");
		const field = fields[0];
		if (field?.type === "ObjectProperty" && field.value.type === "StringLiteral") literal = field.value;
	}
	if (!literal || literal.value !== target.value)
		throw new Error("the factory literal no longer matches its source read");
	return literal;
}

/** Keep the exact call/config shape; JavaScript strings use escapes, not JSX entities. */
export function planFactoryLiteral(source: string, target: FactoryLiteral, value: string): SpanPatch {
	const literal = factoryLiteral(source, target);
	if (literal.start == null || literal.end == null) throw new Error("the factory literal has no source range");
	const text = JSON.stringify(value).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
	return { start: literal.start, end: literal.end, text };
}

export function writeFactoryLiteral(source: string, target: FactoryLiteral, value: string): string {
	const patch = planFactoryLiteral(source, target, value);
	return source.slice(0, patch.start) + patch.text + source.slice(patch.end);
}
