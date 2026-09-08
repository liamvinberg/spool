import { createHash } from "node:crypto";
import { type Node, VISITOR_KEYS } from "@babel/types";
import type { SourceStructureState } from "../source-structure";
import { significantStructuralChildren, structuralKey } from "./source-structure-syntax";

type Span = { start: number; end: number };
type Group =
	| { id: string; node: Node; span: Span; kind: "list"; children: { key: string; node: Node }[] }
	| { id: string; node: Node; span: Span; kind: "optional" };
const span = (node: Node): Span => {
	if (node.start == null || node.end == null) throw new Error("structural compiler range missing");
	return { start: node.start, end: node.end };
};
function staticKey(node: Node): string | undefined {
	const result = structuralKey(node);
	return result.ok ? result.key : undefined;
}

/** Structural lowering changes evaluated membership, never the application's keys or values. */
export function planStructureCompilation(ast: Node, file: string) {
	const paths = new Map<Node, string>();
	const groups: Group[] = [];
	const parents = new Map<Node, Node>();
	function visit(node: Node, path: string, parent?: Node) {
		if (parent) parents.set(node, parent);
		if (node.type === "ExportDefaultDeclaration") path = "default";
		if (node.type === "FunctionDeclaration" && node.id)
			path =
				parent?.type === "Program" || parent?.type === "ExportNamedDeclaration"
					? `function:${node.id.name}`
					: `${path}/function:${node.id.name}`;
		if (node.type === "VariableDeclarator" && node.id.type === "Identifier")
			path =
				parent && parents.get(parent)?.type === "Program"
					? `binding:${node.id.name}`
					: `${path}/binding:${node.id.name}`;
		paths.set(node, `${file}#structure:${path}`);
		let list: Group | undefined;
		if (node.type === "JSXElement" && !node.openingElement.selfClosing && node.closingElement) {
			const children = significantStructuralChildren(node);
			const keyed = children.map(staticKey);
			const only = children.length === 1 && children[0]?.type === "JSXElement";
			const blank = node.children.every(
				(child) =>
					child.type !== "JSXText" || (child.value.trim() === "" && (!child.value || child.value.includes("\n"))),
			);
			if (blank && (only || (keyed.every((key) => key !== undefined) && new Set(keyed).size === keyed.length))) {
				list = {
					kind: "list",
					id: `${file}#structure:${path}`,
					node,
					span: { start: span(node.openingElement).end - 1, end: span(node).end },
					children: children.map((child, i) => ({ node: child, key: keyed[i] ?? "only" })),
				};
				groups.push(list);
			}
		}
		if (node.type === "JSXElement" || node.type === "NullLiteral") {
			const optional =
				(parent?.type === "ConditionalExpression" && parent.test !== node) ||
				(parent?.type === "JSXExpressionContainer" && parents.get(parent)?.type === "JSXAttribute") ||
				(parent?.type === "ObjectProperty" && parent.value === node);
			if (optional)
				groups.push({ kind: "optional", id: `${file}#structure:${path}/optional`, node, span: span(node) });
		}
		for (const key of VISITOR_KEYS[node.type] ?? []) {
			const value = Reflect.get(node, key) as Node | Node[] | null | undefined;
			if (Array.isArray(value))
				value.forEach((child, index) => {
					if (!child) return;
					const member =
						list?.kind === "list" && key === "children"
							? list.children.find((one) => one.node === child)
							: undefined;
					visit(child, `${path}/${key}:${member ? JSON.stringify(member.key) : index}`, node);
				});
			else if (value) visit(value, `${path}/${key}`, node);
		}
	}
	visit(ast, "module");
	// Thunks cannot move suspension/yield/super across their original execution boundary.
	function unsafe(node: Node): boolean {
		if (["AwaitExpression", "YieldExpression", "Super"].includes(node.type)) return true;
		return (VISITOR_KEYS[node.type] ?? []).some((key) => {
			const value = Reflect.get(node, key) as Node | Node[] | undefined | null;
			return Array.isArray(value) ? value.some(unsafe) : value ? unsafe(value) : false;
		});
	}
	for (let index = groups.length - 1; index >= 0; index--) if (unsafe(groups[index]!.node)) groups.splice(index, 1);

	const groupNodes = new Set(groups.map((group) => group.node));
	for (const group of groups) {
		let parent = parents.get(group.node);
		while (parent && parent.type !== "JSXElement") parent = parents.get(parent);
		if (parent) groupNodes.add(parent);
	}
	return {
		paths,
		groupNodes,
		groups,
		state(normalize: (node: Node) => unknown): SourceStructureState {
			const state: SourceStructureState = { lists: {}, optional: {}, factories: {} };
			const hash = (node: Node) =>
				createHash("sha256")
					.update(JSON.stringify(normalize(node)))
					.digest("hex");
			for (const group of groups) {
				if (group.kind === "list") {
					state.lists[group.id] = group.children.map((child) => child.key);
					for (const child of group.children) state.factories[`${group.id}/${child.key}`] = hash(child.node);
				} else {
					state.optional[group.id] = group.node.type !== "NullLiteral";
					if (group.node.type !== "NullLiteral") state.factories[group.id] = hash(group.node);
				}
			}
			return state;
		},
		shape(node: Node, retainOptional = true): unknown | undefined {
			const optional = groups.find((group) => group.kind === "optional" && group.node === node);
			if (optional && retainOptional) return { type: "RetainedOptional", id: optional.id };
			const list = groups.find((group) => group.kind === "list" && group.node === node);
			if (list && node.type === "JSXElement")
				return {
					...node,
					children: [{ type: "RetainedChildren" }],
					openingElement: { ...node.openingElement, selfClosing: false },
					closingElement: { type: "JSXClosingElement", name: node.openingElement.name },
				};
		},
		render(
			code: string,
			prefix: string,
			map: (offset: number, side: "start" | "end" | "content-end", node?: Node) => number,
		): string {
			// An empty canonical parent has no retained factory to evaluate. Keep its
			// literal child observer intact so a later text edit can populate it.
			const mapped = groups
				.filter((group) => group.kind !== "list" || group.children.length > 0)
				.map((group) => ({
					...group,
					span: {
						start: map(group.span.start, "start"),
						end: map(group.span.end, group.kind === "list" ? "content-end" : "end", group.node),
					},
				}));
			function render(start: number, end: number, excluded?: Group): string {
				const candidates = mapped
					.filter((group) => group.id !== excluded?.id && group.span.start >= start && group.span.end <= end)
					.sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
				let output = "",
					cursor = start;
				for (const group of candidates) {
					if (group.span.start < cursor) continue;
					output += code.slice(cursor, group.span.start);
					if (group.kind === "optional")
						output += `${prefix}Optional(${JSON.stringify(group.id)},()=>(${render(group.span.start, group.span.end, group)}))`;
					else {
						const factories = group.children.map((child) => {
							const expression =
								child.node.type === "JSXExpressionContainer" ? child.node.expression : child.node;
							return `[${JSON.stringify(child.key)}]:()=>(${render(map(span(expression).start, "start"), map(span(expression).end, "end"))})`;
						});
						output += ` {...${prefix}List(${JSON.stringify(group.id)},{${factories.join(",")}})}/>`;
					}
					cursor = group.span.end;
				}
				return output + code.slice(cursor, end);
			}
			return render(0, code.length);
		},
	};
}
