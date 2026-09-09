import type { Node } from "@babel/types";

/** Only direct data literals can supply read-only native style descriptor evidence. */
export function literalStyleMembers(object: Node | undefined) {
	if (object?.type !== "ObjectExpression")
		throw new Error("style must be a direct literal object; alias and mutation ownership unproved");
	const members: { key: string; value: string | number; enumerable: boolean }[] = [];
	for (const prop of object.properties) {
		if (prop.type !== "ObjectProperty" || prop.computed || prop.shorthand)
			throw new Error("style spread, getter, computed or shorthand expression unproved");
		const key =
			prop.key.type === "Identifier"
				? prop.key.name
				: prop.key.type === "StringLiteral"
					? prop.key.value
					: undefined;
		if (!key || key === "__proto__" || members.some((m) => m.key === key))
			throw new Error("style key duplicated or special");
		let value: string | number;
		if (prop.value.type === "StringLiteral" || prop.value.type === "NumericLiteral") value = prop.value.value;
		else if (
			prop.value.type === "UnaryExpression" &&
			prop.value.operator === "-" &&
			prop.value.argument.type === "NumericLiteral"
		)
			value = -prop.value.argument.value;
		else throw new Error("style member expression needs original evaluated origin");
		members.push({ key, value, enumerable: true });
	}
	return members;
}
