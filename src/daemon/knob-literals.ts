import { type ParserPlugin, parse } from "@babel/parser";
import type { CallExpression, Node, ObjectExpression } from "@babel/types";
import { KNOB_TYPES, type KnobPath, type KnobSite } from "../runtime/knob-protocol";
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
	// the schema itself is always a group, whatever keys it has
	let node = call.arguments[0] as Node;
	for (const [index, key] of path.split(".").entries()) {
		const kind = index === 0 ? "group" : kindOf(node);
		if (kind === "computed") return { kind: "computed" };
		if (kind !== "group" || node.type !== "ObjectExpression") return { kind: "none" };
		const held = propertyNamed(node, key);
		if (held === undefined) return { kind: "none" };
		node = held;
	}
	const kind = kindOf(node);
	if (kind === "computed") return { kind: "computed" };
	if (kind !== "knob" || node.type !== "ObjectExpression") return { kind: "none" };
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
			const kind = kindOf(held);
			if (kind === "computed") paths.push(path);
			else if (held.type !== "ObjectExpression" || kind === "unknown") continue;
			else if (kind === "group") visit(held, path);
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

/**
 * What a node in a schema is, as the runtime decides it (`cleanSchema`): a
 * knob when its type is one spool knows, a group when it is an object with no
 * type string, nothing (left out) for any other literal, and computed when
 * only the run time can say.
 */
function kindOf(node: Node): "knob" | "group" | "unknown" | "computed" {
	if (node.type !== "ObjectExpression") return isLiteral(node) ? "unknown" : "computed";
	const type = propertyNamed(node, "type");
	if (type === undefined) return "group";
	const name =
		type.type === "StringLiteral"
			? type.value
			: type.type === "TemplateLiteral" && type.expressions.length === 0
				? type.quasis[0]?.value.cooked
				: undefined;
	if (name !== undefined) return (KNOB_TYPES as readonly string[]).includes(name) ? "knob" : "unknown";
	return isLiteral(type) ? "group" : "computed";
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
	const calls = knobCalls(program).flatMap((call) => {
		const start = call.loc?.start;
		const end = call.end;
		return start === undefined || end == null ? [] : [{ call, end, at: `${rel}:${start.line}:${start.column + 1}` }];
	});
	const inFile = calls.map(({ at }) => at);
	let stamped = text;
	for (const { call, end, at } of calls.sort((a, b) => b.end - a.end)) {
		const site: KnobSite = { at, computed: computedPaths(call), inFile };
		const comma = (call.extra?.trailingComma as number | undefined) === undefined ? ", " : " ";
		const paren = end - 1;
		stamped = `${stamped.slice(0, paren)}${comma}${JSON.stringify(site)}${stamped.slice(paren)}`;
	}
	return stamped;
}
