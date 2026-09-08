import { basename } from "node:path";
import { parse } from "@babel/parser";
import { getBindingIdentifiers } from "@babel/types";
import { walkNodes } from "./jsx-walk";
import { rewriteConsumed } from "./source-consumed-compile";

/** Record the executed lazy loader's source without executing it or reading exports. */
export function observeLazySource(file: string, source: string, lowered: string): string {
	const options = {
		sourceType: "module" as const,
		plugins: ["jsx" as const, "typescript" as const, "decorators-legacy" as const],
	};
	const original = parse(source, options);
	const lazies = new Set<string>();
	for (const statement of original.program.body)
		if (
			statement.type === "ImportDeclaration" &&
			statement.source.value === "react" &&
			statement.importKind !== "type"
		)
			for (const spec of statement.specifiers)
				if (
					spec.type === "ImportSpecifier" &&
					spec.importKind !== "type" &&
					spec.imported.type === "Identifier" &&
					spec.imported.name === "lazy"
				)
					lazies.add(spec.local.name);
	walkNodes(original, [], (node) => {
		if (node.type === "VariableDeclarator" || /Function|Method/.test(node.type) || node.type === "CatchClause")
			for (const name of Object.keys(getBindingIdentifiers(node))) lazies.delete(name);
	});
	const plans = new Map<string, { file: string; start: number; end: number }>();
	walkNodes(original, [], (node, ancestors) => {
		if (
			node.type === "VariableDeclarator" &&
			node.id.type === "Identifier" &&
			node.init?.type === "CallExpression" &&
			node.init.callee.type === "Identifier" &&
			lazies.has(node.init.callee.name) &&
			node.init.arguments.length === 1 &&
			!ancestors.some((parent) => /Function|Method/.test(parent.type))
		)
			plans.set(node.id.name, { file, start: node.init.start!, end: node.init.end! });
	});
	let helper = "__spoolLazy";
	while (lowered.includes(helper)) helper += "_";
	const edits: { start: number; end: number; text: string }[] = [];
	walkNodes(parse(lowered, options), [], (node, ancestors) => {
		if (
			node.type !== "VariableDeclarator" ||
			node.id.type !== "Identifier" ||
			ancestors.some((parent) => /Function|Method/.test(parent.type))
		)
			return;
		const plan = plans.get(node.id.name),
			call = node.init;
		if (
			!plan ||
			call?.type !== "CallExpression" ||
			call.callee.type !== "Identifier" ||
			!lazies.has(call.callee.name)
		)
			return;
		edits.push({
			start: call.start!,
			end: call.end!,
			text: `${helper}.created(${lowered.slice(call.start!, call.end!)},${JSON.stringify(plan)})`,
		});
	});
	for (const edit of edits.sort((a, b) => b.start - a.start))
		lowered = lowered.slice(0, edit.start) + edit.text + lowered.slice(edit.end);
	const code = rewriteConsumed(lowered);
	// A self-import creates the real namespace, including star/cyclic routes, without a second evaluation.
	return `import {sourceLazy as ${helper}} from "spool/jsx-dev-runtime";\nimport * as ${helper}Namespace from ${JSON.stringify(`./${basename(file)}`)};\n${helper}.namespace(${helper}Namespace,${JSON.stringify(file)});\n${code}`;
}
