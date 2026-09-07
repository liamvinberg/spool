import type { Node } from "@babel/types";

type Kind = "namespace" | "result" | "either";
interface Value {
	code: string;
	kind: Kind;
	promise: boolean;
}

// A deliberately closed object-flow grammar. Every use of a result variable
// must be consumed here, including callbacks after a projection. Unknown
// statements reject the whole loader; no partial witness survives an escape.
export function rewriteObjectLoader(node: Node, text: string, helper: string): string | undefined {
	const slice = (node: Node) => text.slice(node.start!, node.end!);
	const key = (node: Node): string | undefined =>
		node.type === "MemberExpression"
			? !node.computed && node.property.type === "Identifier"
				? node.property.name
				: node.computed && node.property.type === "StringLiteral"
					? node.property.value
					: undefined
			: undefined;
	// Conditions and gates cannot capture or pass any tracked local object.
	// Restrict these to global scalar/member reads and ordinary operators.
	const scalar = (node: Node, env: Map<string, Value>): boolean => {
		if (["StringLiteral", "NumericLiteral", "BooleanLiteral", "NullLiteral"].includes(node.type)) return true;
		if (node.type === "Identifier") return node.name === "globalThis" && !env.has(node.name);
		if (node.type === "MemberExpression") return key(node) !== undefined && scalar(node.object, env);
		if (node.type === "UnaryExpression") return node.operator !== "delete" && scalar(node.argument, env);
		if (node.type === "BinaryExpression" || node.type === "LogicalExpression")
			return scalar(node.left, env) && scalar(node.right, env);
		return false;
	};
	const member = (node: Node, env: Map<string, Value>): string | undefined => {
		if (node.type === "ConditionalExpression") {
			const yes = member(node.consequent, env),
				no = member(node.alternate, env);
			return scalar(node.test, env) && yes && no ? `(${slice(node.test)} ? ${yes} : ${no})` : undefined;
		}
		if (node.type !== "MemberExpression" || node.object.type !== "Identifier") return undefined;
		const source = env.get(node.object.name),
			property = key(node);
		if (!source || source.promise || property === undefined || (source.kind !== "namespace" && property !== "default"))
			return undefined;
		return `${helper}.member(${slice(node.object)}, ${JSON.stringify(property)})`;
	};
	const expression = (node: Node, env: Map<string, Value>): Value | undefined => {
		if (node.type === "Identifier") {
			const held = env.get(node.name);
			return held ? { ...held, code: slice(node) } : undefined;
		}
		if (node.type === "AwaitExpression") {
			const value = expression(node.argument, env);
			return value ? { ...value, code: `(await ${value.code})`, promise: false } : undefined;
		}
		if (node.type === "ConditionalExpression") {
			const yes = expression(node.consequent, env),
				no = expression(node.alternate, env);
			return scalar(node.test, env) && yes && no && yes.promise === no.promise
				? {
						...yes,
						kind: yes.kind === no.kind ? yes.kind : "either",
						code: `(${slice(node.test)} ? ${yes.code} : ${no.code})`,
					}
				: undefined;
		}
		if (node.type === "ObjectExpression" && node.properties.length === 1) {
			const property = node.properties[0]!;
			if (property.type === "SpreadElement" && property.argument.type === "Identifier") {
				const source = env.get(property.argument.name);
				return source && !source.promise
					? { code: `${helper}.copy(${slice(property.argument)})`, kind: "result", promise: false }
					: undefined;
			}
			if (
				property.type !== "ObjectProperty" ||
				property.computed ||
				property.key.type !== "Identifier" ||
				property.key.name !== "default"
			)
				return undefined;
			const origin = member(property.value, env);
			return origin ? { code: `${helper}.project(${origin})`, kind: "result", promise: false } : undefined;
		}
		if (node.type !== "CallExpression") return undefined;
		if (
			node.callee.type === "Import" &&
			node.arguments.length === 1 &&
			node.arguments[0] &&
			scalar(node.arguments[0], env)
		)
			return { code: slice(node), kind: "namespace", promise: true };
		if (
			node.callee.type !== "MemberExpression" ||
			key(node.callee) !== "then" ||
			node.arguments.length !== 1 ||
			!node.arguments[0]
		)
			return undefined;
		const input = expression(node.callee.object, env);
		if (!input?.promise) return undefined;
		const callback = fn(node.arguments[0], env, { ...input, promise: false });
		return callback ? { ...callback, code: `(${input.code}).then(${callback.code})`, promise: true } : undefined;
	};
	const fn = (node: Node, outer: Map<string, Value>, input?: Value): Value | undefined => {
		if (
			(node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") ||
			node.generator ||
			node.params.length !== (input ? 1 : 0)
		)
			return undefined;
		const env = new Map(outer);
		if (input) {
			const param = node.params[0]!;
			if (param.type !== "Identifier" || env.has(param.name) || param.name === "globalThis") return undefined;
			env.set(param.name, input);
		}
		let value: Value | undefined, body: string;
		if (node.body.type !== "BlockStatement") {
			value = expression(node.body, env);
			body = value ? `(${value.code})` : "";
		} else {
			const statements: string[] = [];
			for (const statement of node.body.body) {
				if (statement.type === "ReturnStatement" && statement === node.body.body.at(-1) && statement.argument) {
					value = expression(statement.argument, env);
					if (!value) return undefined;
					statements.push(`return ${value.code};`);
				} else if (statement.type === "VariableDeclaration" && statement.kind === "const") {
					for (const decl of statement.declarations) {
						if (decl.id.type !== "Identifier" || env.has(decl.id.name) || decl.id.name === "globalThis" || !decl.init)
							return undefined;
						const held = expression(decl.init, env);
						// A detached chain could change a published object after React
						// consumed it. Require local asynchronous work to be awaited.
						if (!held || held.promise) return undefined;
						env.set(decl.id.name, held);
						statements.push(`const ${decl.id.name} = ${held.code};`);
					}
				} else if (statement.type === "ExpressionStatement") {
					const expr = statement.expression;
					if (
						expr.type === "AssignmentExpression" &&
						expr.operator === "=" &&
						expr.left.type === "MemberExpression" &&
						expr.left.object.type === "Identifier" &&
						key(expr.left) === "default"
					) {
						const target = env.get(expr.left.object.name),
							origin = member(expr.right, env);
						if (!target || target.promise || target.kind !== "result" || !origin) return undefined;
						statements.push(`${helper}.replace(${expr.left.object.name}, ${origin});`);
					} else if (
						(expr.type === "AwaitExpression" && scalar(expr.argument, env)) ||
						(expr.type === "UpdateExpression" &&
							expr.argument.type === "MemberExpression" &&
							scalar(expr.argument, env))
					) {
						statements.push(`${slice(expr)};`);
					} else return undefined;
				} else return undefined;
			}
			body = `{${statements.join("\n")}}`;
		}
		return value
			? {
					...value,
					promise: value.promise || node.async,
					code:
						slice(node).slice(0, node.body.start! - node.start!) +
						body +
						slice(node).slice(node.body.end! - node.start!),
				}
			: undefined;
	};
	return fn(node, new Map())?.code;
}
