import { readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { parse } from "@babel/parser";
import type { FunctionDeclaration, JSXElement, Node } from "@babel/types";
import { realDesignDir, resolveDesignPath } from "../../src/daemon/design-path";
import { fingerprintOf } from "../../src/daemon/hand-write";
import { walkNodes } from "../../src/daemon/jsx-walk";

export function stamp(source: string, snippet: string, path = "frames/first/frame.tsx"): string {
	const at = source.indexOf(snippet);
	if (at < 0) throw new Error(`missing fixture snippet: ${snippet}`);
	const prefix = source.slice(0, at);
	return `${path}:${prefix.split("\n").length}:${at - prefix.lastIndexOf("\n")}`;
}

export function elementAt(source: string, at: string): { node: JSXElement; ancestors: Node[] } {
	const [, line, column] = /:(\d+):(\d+)$/.exec(at) ?? [];
	let found: { node: JSXElement; ancestors: Node[] } | undefined;
	walkNodes(parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), [], (node, ancestors) => {
		if (
			node.type === "JSXElement" &&
			node.loc?.start.line === Number(line) &&
			node.loc.start.column + 1 === Number(column)
		) {
			found = { node, ancestors: [...ancestors] };
		}
	});
	if (found === undefined) throw new Error("stale source target");
	return found;
}

// Syntactic references only. Import/export binding resolution and shadowing
// require a separate proof before these become a component-usage claim.
export function references(source: string, name: string) {
	const sites: { line: number; conditional: boolean; repeated: boolean }[] = [];
	walkNodes(parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }), [], (node, ancestors) => {
		if (
			node.type !== "JSXElement" ||
			node.openingElement.name.type !== "JSXIdentifier" ||
			node.openingElement.name.name !== name
		)
			return;
		sites.push({
			line: node.loc!.start.line,
			conditional: ancestors.some(
				(n) => n.type === "ConditionalExpression" || n.type === "LogicalExpression" || n.type === "IfStatement",
			),
			repeated: ancestors.some(
				(n) =>
					n.type === "CallExpression" &&
					n.callee.type === "MemberExpression" &&
					n.callee.property.type === "Identifier" &&
					n.callee.property.name === "map",
			),
		});
	});
	return sites;
}

// A deliberately small binding proof: named function, destructured parameter,
// exactly one return, and a direct parameter read. Call ancestry must already
// identify the matching function. No equality-of-text inference, transforms,
// shadowing, mutation, defaults, arbitrary components, or data inversion.
export function directParameter(source: string, at: string, attribute?: string): string | undefined {
	const { node, ancestors } = elementAt(source, at);
	const enclosing = [...ancestors]
		.reverse()
		.find((item) =>
			[
				"FunctionDeclaration",
				"FunctionExpression",
				"ArrowFunctionExpression",
				"ObjectMethod",
				"ClassMethod",
			].includes(item.type),
		);
	if (enclosing?.type !== "FunctionDeclaration") return undefined;
	const owner: FunctionDeclaration = enclosing;
	if (owner.body.body.length !== 1 || owner.body.body[0]?.type !== "ReturnStatement") return undefined;
	let mutates = false;
	walkNodes(owner, [], (node) => {
		if (node.type === "AssignmentExpression" || node.type === "UpdateExpression") mutates = true;
	});
	if (mutates) return undefined;
	let expression: Node | undefined;
	if (attribute === undefined) {
		const children = node.children.filter((child) => child.type !== "JSXText" || child.value.trim() !== "");
		if (children.length !== 1 || children[0]?.type !== "JSXExpressionContainer") return undefined;
		expression = children[0].expression;
	} else {
		const attr = node.openingElement.attributes.find(
			(item) => item.type === "JSXAttribute" && item.name.name === attribute,
		);
		if (attr?.type !== "JSXAttribute" || attr.value?.type !== "JSXExpressionContainer") return undefined;
		expression = attr.value.expression;
	}
	if (expression.type !== "Identifier") return undefined;
	const parameter = owner.params[0];
	if (parameter?.type !== "ObjectPattern" || owner.params.length !== 1) return undefined;
	const property = parameter.properties.find(
		(item) =>
			item.type === "ObjectProperty" &&
			!item.computed &&
			item.value.type === "Identifier" &&
			item.value.name === expression.name,
	);
	if (property?.type !== "ObjectProperty" || property.key.type !== "Identifier") return undefined;
	return property.key.name;
}

// The *same* disposable gate for writes and inverse targets. Checking the
// real path's role closes the metadata aliases that a lexical prefix misses.
export function sourceTarget(root: string, path: string): { file: string; revision: string } {
	const design = realDesignDir(root);
	const file = resolveDesignPath(design, join(design, path));
	for (const candidate of [path, relative(design, file)]) {
		const parts = candidate.split(/[\\/]/);
		if (
			parts.some((p) => p === ".spool" || p === ".git" || p === "node_modules") ||
			["canvas.json", "frame.json"].includes(basename(candidate)) ||
			![".tsx", ".jsx", ".ts", ".js", ".css"].includes(extname(candidate))
		) {
			throw new Error("not editable project source");
		}
	}
	return { file, revision: fingerprintOf(readFileSync(file, "utf8")) };
}

// Reorder complete adjacent authored JSX siblings, including intervening trivia.
// It deliberately refuses map templates and expression-wrapped/conditional
// children. Offsets only live inside this exact source snapshot.
export function swapSiblings(source: string, first: string, second: string): string | undefined {
	const a = elementAt(source, first);
	const b = elementAt(source, second);
	const parentA = a.ancestors.at(-1);
	const parentB = b.ancestors.at(-1);
	if (parentA?.type !== "JSXElement" && parentA?.type !== "JSXFragment") return undefined;
	if (parentB === undefined || parentA.start !== parentB.start || parentA.end !== parentB.end) return undefined;
	if (a.ancestors.some((n) => n.type === "CallExpression" || n.type === "ArrowFunctionExpression")) return undefined;
	const children = parentA.children.filter((n) => n.type !== "JSXText" || n.value.trim() !== "");
	if (children.findIndex((n) => n.start === b.node.start) !== children.findIndex((n) => n.start === a.node.start) + 1)
		return undefined;
	const { start: a0, end: a1 } = a.node;
	const { start: b0, end: b1 } = b.node;
	if (a0 == null || a1 == null || b0 == null || b1 == null) return undefined;
	return source.slice(0, a0) + source.slice(b0, b1) + source.slice(a1, b0) + source.slice(a0, a1) + source.slice(b1);
}
