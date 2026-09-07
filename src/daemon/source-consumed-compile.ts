import { parse } from "@babel/parser";
import { getBindingIdentifiers, type Node } from "@babel/types";
import { walkNodes } from "./jsx-walk";
export function rewriteConsumed(code: string): string {
	const ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] });
	let helper = "__spoolConsumed";
	while (code.includes(helper)) helper += "_";
	const imports = new Map<string, { namespace: string; key: string }>();
	const prefixes: string[] = [`import {sourceConsumed as ${helper}} from "spool/jsx-dev-runtime";`];
	// A file-wide refusal is deliberate: spelling is not lexical binding identity.
	// Keep execution intact and leave origin unknown when any local binds an import's name.
	const localBindings = new Set<string>();
	const identifiers = new Set<string>();
	walkNodes(ast, [], (node) => {
		if (node.type === "Identifier") identifiers.add(node.name);
		const patterns: Node[] = [];
		if (node.type === "VariableDeclarator") patterns.push(node.id);
		if (node.type === "CatchClause" && node.param) patterns.push(node.param);
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
			if (node.id) patterns.push(node.id);
		}
		if (
			node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression" ||
			node.type === "ObjectMethod" ||
			node.type === "ClassMethod" ||
			node.type === "ClassPrivateMethod"
		) {
			patterns.push(...node.params);
			if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression") && node.id)
				patterns.push(node.id);
		}
		for (const pattern of patterns)
			for (const name of Object.keys(getBindingIdentifiers(pattern))) localBindings.add(name);
	});
	for (const n of ast.program.body)
		if (
			n.type === "ImportDeclaration" &&
			n.importKind !== "type" &&
			n.source.value !== "react" &&
			!n.source.value.includes("runtime")
		) {
			let namespace = `__consumedImport${prefixes.length}`;
			while (identifiers.has(namespace)) namespace += "_";
			identifiers.add(namespace);
			prefixes.push(`import * as ${namespace} from ${JSON.stringify(n.source.value)};`);
			for (const spec of n.specifiers)
				if (spec.type === "ImportSpecifier" && spec.importKind !== "type")
					imports.set(spec.local.name, {
						namespace,
						key: spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value,
					});
				else if (spec.type === "ImportDefaultSpecifier")
					imports.set(spec.local.name, { namespace, key: "default" });
		}
	const slice = (n: Node) => code.slice(n.start!, n.end!);
	const member = (n: Node): string | undefined => {
		if (n.type === "Identifier") {
			const imported = imports.get(n.name);
			if (imported && !localBindings.has(n.name))
				return `${helper}.member(${imported.namespace},${JSON.stringify(imported.key)})`;
		}
		if (n.type === "ConditionalExpression") {
			const a = member(n.consequent),
				b = member(n.alternate);
			return a && b ? `(${slice(n.test)}?${a}:${b})` : undefined;
		}
		if (n.type === "MemberExpression" && n.object.type !== "Super" && n.property.type !== "PrivateName")
			return `${helper}.member(${slice(n.object)},${n.computed ? slice(n.property) : JSON.stringify(n.property.type === "Identifier" ? n.property.name : "")})`;
		if (
			n.type === "CallExpression" &&
			n.callee.type === "MemberExpression" &&
			n.callee.object.type === "Identifier" &&
			n.callee.object.name === "Reflect" &&
			n.callee.property.type === "Identifier" &&
			n.callee.property.name === "get" &&
			(n.arguments.length === 2 || n.arguments.length === 3)
		)
			return `${helper}.reflect(${slice(n.callee.object)})(${n.arguments.map(slice).join(",")})`;
		return undefined;
	};
	const edits: { start: number; end: number; text: string }[] = [];
	walkNodes(ast, [], (n) => {
		let text: string | undefined;
		if (n.type === "ObjectExpression" && n.properties.length === 1) {
			const prop = n.properties[0]!;
			if (
				prop.type === "ObjectProperty" &&
				!prop.computed &&
				prop.key.type === "Identifier" &&
				prop.key.name === "default"
			) {
				const m = member(prop.value);
				if (m) text = `${helper}.object(${m})`;
			}
			if (prop.type === "SpreadElement") text = `${helper}.copy(${slice(prop.argument)})`;
		}
		if (
			n.type === "AssignmentExpression" &&
			n.operator === "=" &&
			n.left.type === "MemberExpression" &&
			n.left.object.type !== "Super" &&
			!n.left.computed &&
			n.left.property.type === "Identifier" &&
			n.left.property.name === "default"
		) {
			const m = member(n.right);
			text = `${helper}.write(${slice(n.left.object)},"default",${m ?? `{value:${slice(n.right)},origin:undefined}`})`;
		}
		if (n.type === "ReturnStatement" && n.argument) {
			const m = member(n.argument);
			if (m) text = `return ${helper}.returned(${m});`;
		}
		if (text) edits.push({ start: n.start!, end: n.end!, text });
	});
	const outer = edits.filter((e) => !edits.some((o) => o !== e && o.start <= e.start && o.end >= e.end));
	for (const e of outer.sort((a, b) => b.start - a.start)) code = code.slice(0, e.start) + e.text + code.slice(e.end);
	const returns = parse(code, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] });
	const returnEdits: { start: number; end: number; text: string }[] = [];
	walkNodes(returns, [], (n) => {
		if (n.type !== "ReturnStatement" || !n.argument) return;
		const arg = n.argument;
		const expression = code.slice(arg.start!, arg.end!);
		if (expression.startsWith(`${helper}.returned(`)) return;
		returnEdits.push(
			{ start: arg.start!, end: arg.start!, text: `${helper}.returned({value:` },
			{ start: arg.end!, end: arg.end!, text: ",origin:undefined})" },
		);
	});
	for (const e of returnEdits.sort((a, b) => b.start - a.start))
		code = code.slice(0, e.start) + e.text + code.slice(e.end);
	const escaping = parse(code, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] });
	const invalidations: { start: number; end: number; text: string }[] = [];
	walkNodes(escaping, [], (n) => {
		if (n.type !== "CallExpression" || n.callee.type !== "MemberExpression" || n.callee.object.type !== "Identifier")
			return;
		const receiver = n.callee.object.name;
		if (
			receiver !== "globalThis" &&
			!(
				receiver === "Object" &&
				n.callee.property.type === "Identifier" &&
				["defineProperty", "defineProperties", "assign"].includes(n.callee.property.name)
			)
		)
			return;
		for (const arg of n.arguments)
			if (arg.type !== "SpreadElement" && arg.type !== "ArgumentPlaceholder")
				invalidations.push({
					start: arg.start!,
					end: arg.end!,
					text: `${helper}.escape(${code.slice(arg.start!, arg.end!)})`,
				});
	});
	for (const e of invalidations
		.filter((e) => !invalidations.some((o) => o !== e && o.start <= e.start && o.end >= e.end))
		.sort((a, b) => b.start - a.start))
		code = code.slice(0, e.start) + e.text + code.slice(e.end);
	const opaqueAst = parse(code, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] });
	const opaqueEdits: { start: number; end: number; text: string }[] = [];
	walkNodes(opaqueAst, [], (n) => {
		if (
			n.type === "CallExpression" &&
			n.callee.type === "MemberExpression" &&
			n.callee.object.type === "Identifier" &&
			n.callee.object.name === "globalThis"
		)
			opaqueEdits.push({
				start: n.start!,
				end: n.end!,
				text: `(${helper}.opaque(),${code.slice(n.start!, n.end!)})`,
			});
	});
	for (const e of opaqueEdits
		.filter((e) => !opaqueEdits.some((o) => o !== e && o.start <= e.start && o.end >= e.end))
		.sort((a, b) => b.start - a.start))
		code = code.slice(0, e.start) + e.text + code.slice(e.end);
	const second = parse(code, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] });
	const proxies: { start: number; end: number; text: string }[] = [];
	walkNodes(second, [], (n) => {
		if (
			n.type === "NewExpression" &&
			n.callee.type === "Identifier" &&
			n.callee.name === "Proxy" &&
			n.arguments.length === 2 &&
			n.arguments[1]?.type === "ObjectExpression"
		) {
			const handler = n.arguments[1];
			const transparent = handler.properties.every(
				(p) =>
					(p.type === "ObjectMethod" || p.type === "ObjectProperty") &&
					!p.computed &&
					p.key.type === "Identifier" &&
					p.key.name !== "get" &&
					p.type === "ObjectMethod" &&
					p.body.body.every(
						(statement) =>
							statement.type === "ReturnStatement" ||
							(statement.type === "ExpressionStatement" && statement.expression.type === "UpdateExpression"),
					),
			);
			proxies.push({
				start: n.start!,
				end: n.end!,
				text: `${helper}.proxy(Proxy,${code.slice(n.arguments[0]!.start!, n.arguments[0]!.end!)},${code.slice(handler.start!, handler.end!)},${transparent})`,
			});
		}
	});
	for (const e of proxies.sort((a, b) => b.start - a.start))
		code = code.slice(0, e.start) + e.text + code.slice(e.end);
	return `${prefixes.join("\n")}\n${code}`;
}
