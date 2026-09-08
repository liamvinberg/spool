import type { JSXElement, Node } from "@babel/types";

type StructuralKey = { ok: true; key: string } | { ok: false; reason: string };

export function significantStructuralChildren(node: JSXElement | Extract<Node, { type: "JSXFragment" }>) {
	return node.children.filter(
		(child) =>
			(child.type !== "JSXText" || child.value.trim() !== "") &&
			!(child.type === "JSXExpressionContainer" && child.expression.type === "JSXEmptyExpression"),
	);
}
export function structuralKey(node: Node): StructuralKey {
	if (node.type === "JSXExpressionContainer") return structuralKey(node.expression);
	if (node.type === "ConditionalExpression") {
		if (node.consequent.type === "NullLiteral") return structuralKey(node.alternate);
		if (node.alternate.type === "NullLiteral") return structuralKey(node.consequent);
		const a = structuralKey(node.consequent),
			b = structuralKey(node.alternate);
		if (!a.ok) return a;
		if (!b.ok) return b;
		if (a.key !== b.key) return { ok: false, reason: "conditional branches change key; movement identity unproved" };
		return a;
	}
	if (node.type === "CallExpression") {
		if (node.arguments.some((argument) => argument.type === "SpreadElement"))
			return { ok: false, reason: "spread factory arguments have no stable structural identity" };
		const config = node.arguments[1];
		if (
			config?.type !== "ObjectExpression" ||
			config.properties.some((property) => property.type !== "ObjectProperty" || property.computed)
		)
			return { ok: false, reason: "factory key configuration is not a direct immutable object" };
		const fields = config.properties.filter(
			(property) =>
				property.type === "ObjectProperty" &&
				((property.key.type === "Identifier" && property.key.name === "key") ||
					(property.key.type === "StringLiteral" && property.key.value === "key")),
		);
		const field = fields[0];
		if (fields.length !== 1 || field?.type !== "ObjectProperty" || field.value.type !== "StringLiteral")
			return { ok: false, reason: "stable authored factory keys required" };
		return { ok: true, key: field.value.value };
	}
	if (node.type !== "JSXElement") return { ok: false, reason: "complete keyed JSX sibling required" };
	if (node.openingElement.attributes.some((a) => a.type === "JSXSpreadAttribute"))
		return { ok: false, reason: "spread key unproved" };
	const fields = node.openingElement.attributes.filter((a) => a.type === "JSXAttribute" && a.name.name === "key");
	const field = fields[0];
	if (fields.length !== 1 || field?.type !== "JSXAttribute" || field.value?.type !== "StringLiteral")
		return { ok: false, reason: "stable authored keys required; unsafe unkeyed state transfer" };
	return { ok: true, key: field.value.value };
}
