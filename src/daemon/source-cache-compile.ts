import { parse } from "@babel/parser";
import { getBindingIdentifiers, type Node } from "@babel/types";
import { walkNodes } from "./jsx-walk";

/** Observe the bounded global cache carrier without certifying its mutable lifetime.
 * The assignment expression still performs the application's own get/set, and the
 * return expression performs exactly its original read, including ignored stores. */
export function observeCacheSource(file: string, source: string, lowered: string): string {
	const options = {
		sourceType: "module" as const,
		plugins: ["jsx" as const, "typescript" as const, "decorators-legacy" as const],
	};
	const original = parse(source, options);
	let shadowed = false;
	walkNodes(original, [], (node) => {
		if (
			node.type === "VariableDeclarator" ||
			node.type === "ImportDeclaration" ||
			node.type === "CatchClause" ||
			/Function|Method|ClassDeclaration|ClassExpression/.test(node.type)
		)
			if (Object.hasOwn(getBindingIdentifiers(node), "globalThis")) shadowed = true;
	});
	if (shadowed) return lowered;
	const plans = new Map<string, { source: string; read: string; key: string }>();
	const carrier = (node: Node) => {
		if (node.type !== "FunctionDeclaration" || node.async || node.generator || node.body.body.length !== 2) return;
		const [statement, returned] = node.body.body;
		const assignment = statement?.type === "ExpressionStatement" ? statement.expression : undefined;
		const read = returned?.type === "ReturnStatement" ? returned.argument : undefined;
		if (
			assignment?.type !== "AssignmentExpression" ||
			assignment.operator !== "??=" ||
			assignment.right.type !== "Identifier" ||
			assignment.left.type !== "MemberExpression" ||
			assignment.left.computed ||
			assignment.left.object.type !== "Identifier" ||
			assignment.left.object.name !== "globalThis" ||
			assignment.left.property.type !== "Identifier" ||
			read?.type !== "MemberExpression" ||
			read.computed ||
			read.object.type !== "Identifier" ||
			read.object.name !== "globalThis" ||
			read.property.type !== "Identifier" ||
			read.property.name !== assignment.left.property.name
		)
			return;
		return { assignment, read, key: read.property.name };
	};
	const duplicates = new Set<string>();
	walkNodes(original, [], (node) => {
		const found = carrier(node);
		if (!found) return;
		const signature = source.slice(node.start!, node.end!);
		if (plans.has(signature)) duplicates.add(signature);
		const stamp = (part: Node) => `${file}:${part.loc!.start.line}:${part.loc!.start.column + 1}`;
		plans.set(signature, { source: stamp(found.assignment), read: stamp(found.read), key: found.key });
	});
	const edits: { offset: number; text: string }[] = [];
	walkNodes(parse(lowered, options), [], (node) => {
		const found = carrier(node);
		if (!found) return;
		// Literal lowering leaves this two-statement carrier untouched. Match the
		// full authored function, never a same-spelled binding in another scope.
		const signature = lowered.slice(node.start!, node.end!);
		const plan = plans.get(signature);
		if (!plan || duplicates.has(signature)) return;
		const { assignment, read } = found;
		const key = JSON.stringify(plan.key);
		edits.push(
			{
				offset: assignment.start!,
				text: `globalThis.__SPOOL_VALUES__.cacheAssign(${JSON.stringify(plan.source)},${key},()=>`,
			},
			{ offset: assignment.end!, text: ")" },
			{ offset: assignment.right.start!, text: "globalThis.__SPOOL_VALUES__.cacheInput(" },
			{ offset: assignment.right.end!, text: ")" },
			{ offset: read.start!, text: `globalThis.__SPOOL_VALUES__.cacheRead(${JSON.stringify(plan.read)},${key},` },
			{ offset: read.end!, text: ")" },
		);
	});
	for (const edit of edits.sort((a, b) => b.offset - a.offset))
		lowered = lowered.slice(0, edit.offset) + edit.text + lowered.slice(edit.offset);
	return lowered;
}
