import { type ParserPlugin, parse } from "@babel/parser";
import type { CallExpression, Node, ObjectExpression } from "@babel/types";
import type { KnobPath, KnobSite } from "../runtime/knob-protocol";
import { walkNodes } from "./jsx-walk";

/**
 * What a file says about its knobs (#220), read the one way the compile that
 * stamps them and the gate that writes them both read it: the `ui.knobs`
 * calls, the knob a path names in one, and whether its `value` is a literal a
 * hand may write.
 */

/** Every `ui.knobs(schema)` in a module, `ui` being what it imports from "spool" under any name. */
export function knobCalls(program: Node): CallExpression[] {
	const names = new Set<string>();
	if (program.type === "Program") {
		for (const statement of program.body) {
			if (statement.type !== "ImportDeclaration" || statement.source.value !== "spool") continue;
			for (const held of statement.specifiers) {
				if (held.type !== "ImportSpecifier") continue;
				const imported = held.imported.type === "Identifier" ? held.imported.name : held.imported.value;
				if (imported === "ui") names.add(held.local.name);
			}
		}
	}
	if (names.size === 0) return [];
	const calls: CallExpression[] = [];
	walkNodes(program, [], (node) => {
		if (node.type !== "CallExpression" || node.arguments.length !== 1) return;
		const callee = node.callee;
		if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier") return;
		if (!names.has(callee.object.name) || callee.property.type !== "Identifier") return;
		if (callee.property.name === "knobs" && node.arguments[0]?.type === "ObjectExpression") calls.push(node);
	});
	return calls;
}

/** The call whose stamp this is: the one starting exactly there, 1-based as the JSX stamps are. */
export function knobCallAt(program: Node, line: number, column: number): CallExpression | undefined {
	return knobCalls(program).find((call) => call.loc?.start.line === line && call.loc.start.column + 1 === column);
}

/** What a path names in a call. */
export type KnobAt =
	| { kind: "knob"; spec: ObjectExpression; type: string | undefined; value: Node | undefined }
	/** something on the way is not written as an object: the schema is computed there */
	| { kind: "computed" }
	| { kind: "none" };

export function knobAt(call: CallExpression, path: KnobPath): KnobAt {
	let node: Node | undefined = call.arguments[0];
	for (const key of path.split(".")) {
		if (node?.type !== "ObjectExpression") return { kind: "computed" };
		if (isKnob(node)) return { kind: "none" };
		node = propertyNamed(node, key);
		if (node === undefined) return { kind: "none" };
	}
	if (node?.type !== "ObjectExpression") return { kind: "computed" };
	if (!isKnob(node)) return { kind: "none" };
	const type = propertyNamed(node, "type");
	return {
		kind: "knob",
		spec: node,
		type: type?.type === "StringLiteral" ? type.value : undefined,
		value: propertyNamed(node, "value"),
	};
}

/** The paths a call's knobs can't be written at, because the file computes their value or their spec. */
export function computedPaths(call: CallExpression): KnobPath[] {
	const paths: KnobPath[] = [];
	const visit = (node: ObjectExpression, prefix: string) => {
		for (const property of node.properties) {
			const key = property.type === "ObjectProperty" ? plainKey(property) : undefined;
			if (property.type !== "ObjectProperty" || key === undefined) continue;
			const path = prefix === "" ? key : `${prefix}.${key}`;
			const held = property.value;
			if (held.type !== "ObjectExpression") paths.push(path);
			else if (!isKnob(held)) visit(held, path);
			else {
				const value = propertyNamed(held, "value");
				const type = propertyNamed(held, "type");
				const action = type?.type === "StringLiteral" && type.value === "action";
				if (value === undefined ? !action : !isLiteral(value)) paths.push(path);
			}
		}
	};
	const schema = call.arguments[0];
	if (schema?.type === "ObjectExpression") visit(schema, "");
	return paths;
}

/**
 * A value a hand may write over: numbers (a minus included), strings, a
 * template with nothing in it, booleans, and arrays and objects of nothing
 * else under plain keys.
 */
export function isLiteral(node: Node): boolean {
	switch (node.type) {
		case "NumericLiteral":
		case "StringLiteral":
		case "BooleanLiteral":
			return true;
		case "UnaryExpression":
			return node.operator === "-" && node.argument.type === "NumericLiteral";
		case "TemplateLiteral":
			return node.expressions.length === 0;
		case "ArrayExpression":
			return node.elements.every((element) => element !== null && isLiteral(element));
		case "ObjectExpression":
			return node.properties.every(
				(property) =>
					property.type === "ObjectProperty" &&
					!property.shorthand &&
					plainKey(property) !== undefined &&
					isLiteral(property.value),
			);
		default:
			return false;
	}
}

/** A nested object is a knob when it says its type, and a group when it doesn't. */
function isKnob(node: ObjectExpression): boolean {
	return propertyNamed(node, "type") !== undefined;
}

/** The value written under a plain key, the last one written winning as it does at run time. */
function propertyNamed(node: ObjectExpression, key: string): Node | undefined {
	let found: Node | undefined;
	for (const property of node.properties) {
		if (property.type === "ObjectProperty" && plainKey(property) === key) found = property.value;
	}
	return found;
}

/** A key as the run time names it, or nothing for one only the run time can name. */
export function plainKey(property: { key: Node; computed: boolean }): string | undefined {
	if (property.computed) return undefined;
	const key = property.key;
	if (key.type === "Identifier") return key.name;
	if (key.type === "StringLiteral") return key.value;
	if (key.type === "NumericLiteral") return String(key.value);
	return undefined;
}

const PLUGINS: Readonly<Record<string, ParserPlugin[]>> = {
	js: [],
	jsx: ["jsx"],
	ts: ["typescript"],
	tsx: ["jsx", "typescript"],
};

/**
 * A module with each `ui.knobs` call stamped (#220): its site passed as a
 * second argument, written just before the call's closing paren, so no line
 * and nothing before the paren moves and every JSX stamp after it still
 * points where it did. The text as it was, the same string, when it has none
 * or does not parse (esbuild then says why).
 */
export function stampKnobCalls(text: string, rel: string, loader: string): string {
	const plugins = PLUGINS[loader];
	if (plugins === undefined || !text.includes("knobs(")) return text;
	let program: Node;
	try {
		program = parse(text, { sourceType: "module", plugins }).program;
	} catch {
		return text;
	}
	let stamped = text;
	for (const call of knobCalls(program).sort((a, b) => (b.end ?? 0) - (a.end ?? 0))) {
		const start = call.loc?.start;
		if (start === undefined || call.end == null) continue;
		const site: KnobSite = { at: `${rel}:${start.line}:${start.column + 1}`, computed: computedPaths(call) };
		const comma = (call.extra?.trailingComma as number | undefined) === undefined ? ", " : " ";
		const paren = call.end - 1;
		stamped = `${stamped.slice(0, paren)}${comma}${JSON.stringify(site)}${stamped.slice(paren)}`;
	}
	return stamped;
}
