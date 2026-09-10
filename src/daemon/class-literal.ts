import type { JSXAttribute, JSXOpeningElement, Node, StringLiteral } from "@babel/types";

/**
 * Where an element's classes are typed (#315, #317): the one place a class
 * write lands, and the one reason it cannot.
 *
 * A literal `className` is the plain case. A `cn`, `clsx` or `cx` call is as
 * editable as one, in its first string-literal argument — `cn("p-4", open &&
 * "bg-raised")` edits `"p-4"` and keeps the condition, which is what makes a
 * shadcn-style component as editable as a plain tag. No className at all is a
 * place to write a new one. Anything else the file computes: a template, a
 * variable, a call with no string in it. That refuses, and the refusal names
 * the file and line, because the honest next step is to edit it there.
 */
export interface LiteralSlot {
	kind: "literal";
	/** the characters between the quotes: where a rewrite lands */
	start: number;
	end: number;
	/** the string the file means */
	value: string;
	/** the characters as the file spells them */
	raw: string;
	/** the quote a JS string sits in; absent for a JSX attribute string, which has no escapes */
	quote?: '"' | "'";
}

/** Where the classes are, for an opening tag already parsed. */
export type ClassSlot =
	| LiteralSlot
	/** no className: a new one goes here, just past the tag name */
	| { kind: "none"; at: number }
	/** `<div className>`: an attribute with a place for a value rather than a value */
	| { kind: "bare"; at: number }
	| { kind: "computed"; line: number; expression: string };

/** The class helpers whose first string argument is the literal a hand edits. */
const CLASS_CALLS: ReadonlySet<string> = new Set(["cn", "clsx", "cx"]);

/**
 * The answer for an opening tag already in hand, which is how the write lane
 * asks: it has parsed the file once for every op and is not parsing it again
 * per attribute.
 */
export function classSlotOf(source: string, opening: JSXOpeningElement): ClassSlot {
	const held = opening.attributes.find(
		(attribute): attribute is JSXAttribute =>
			attribute.type === "JSXAttribute" && attribute.name.name === "className",
	);
	if (held === undefined) return { kind: "none", at: end(opening.name) };
	const value = held.value;
	if (value == null) return { kind: "bare", at: end(held) };
	if (value.type === "StringLiteral") return literal(source, value, undefined);
	const computed = { kind: "computed" as const, line: value.loc?.start.line ?? held.loc?.start.line ?? 0 };
	if (value.type !== "JSXExpressionContainer") {
		return { ...computed, expression: source.slice(start(value), end(value)) };
	}
	const expression = value.expression;
	if (expression.type === "StringLiteral") return literal(source, expression, quoteOf(source, expression));
	if (expression.type === "CallExpression" && expression.callee.type === "Identifier") {
		if (CLASS_CALLS.has(expression.callee.name)) {
			const first = expression.arguments.find(
				(argument): argument is StringLiteral => argument.type === "StringLiteral",
			);
			if (first !== undefined) return literal(source, first, quoteOf(source, first));
		}
	}
	return { ...computed, expression: source.slice(start(value), end(value)) };
}

function literal(source: string, node: StringLiteral, quote: '"' | "'" | undefined): LiteralSlot {
	const from = start(node) + 1;
	const to = end(node) - 1;
	return {
		kind: "literal",
		start: from,
		end: to,
		value: node.value,
		raw: source.slice(from, to),
		...(quote === undefined ? {} : { quote }),
	};
}

function quoteOf(source: string, node: StringLiteral): '"' | "'" {
	return source[start(node)] === "'" ? "'" : '"';
}

/** A parsed node always carries its range; the fallbacks are the types', not ours. */
function start(node: Node): number {
	return node.start ?? 0;
}

function end(node: Node): number {
	return node.end ?? 0;
}
