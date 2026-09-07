import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { parse } from "@babel/parser";
import { getBindingIdentifiers, type Node } from "@babel/types";
import type { Plugin } from "esbuild";
import { walkNodes } from "../../src/daemon/jsx-walk";

export const REACT_SHA256 = "66fa8fc8149e02f61dd5f26e3d0ea7bd03bac64a52d15601019f50a61260a115";

// Exact assignment taps: never infer overrides from equality or re-read config
// getters. The original calls, argument evaluation and returned elements remain.
export function valueReact(): Plugin {
	return {
		name: "pinned-react-value-witness",
		setup(build) {
			build.onLoad({ filter: /[/\\]react\.production\.js$/ }, ({ path }) => {
				let contents = readFileSync(path, "utf8");
				if (createHash("sha256").update(contents).digest("hex") !== REACT_SHA256)
					throw new Error("value taps require exact pinned React bytes");
				const replace = (before: string, after: string) => {
					if (contents.split(before).length !== 2) throw new Error("React value tap anchor is not unique");
					contents = contents.replace(before, after);
				};
				replace(
					"return ReactElement(oldElement.type, newKey, oldElement.props);",
					'return globalThis.__handValues.created(ReactElement(oldElement.type, newKey, oldElement.props), "key", oldElement, [], true);',
				);
				const begin = contents.indexOf("exports.cloneElement = function");
				const end = contents.indexOf("exports.createContext =", begin);
				let clone = contents.slice(begin, end);
				clone = clone.replace(
					"var props = assign",
					"var __handReplaced = [], __handKeyReplaced = false;\n  var props = assign",
				);
				clone = clone.replace('(key = "" + config.key)', '(key = "" + config.key, __handKeyReplaced = true)');
				clone = clone.replace(
					"(props[propName] = config[propName]);",
					"(props[propName] = config[propName], __handReplaced.push(propName));",
				);
				clone = clone.replace(
					"if (1 === propName) props.children = children;",
					'if (1 === propName) { props.children = children; __handReplaced.push("children"); }',
				);
				clone = clone.replace(
					"props.children = childArray;",
					'props.children = childArray; __handReplaced.push("children");',
				);
				clone = clone.replace(
					"return ReactElement(element.type, key, props);",
					'return globalThis.__handValues.created(ReactElement(element.type, key, props), "clone", element, __handReplaced, __handKeyReplaced);',
				);
				contents = contents.slice(0, begin) + clone + contents.slice(end);
				replace(
					"return ReactElement(type, key, props);",
					'return globalThis.__handValues.created(ReactElement(type, key, props), "create");',
				);
				return { contents, loader: "js" };
			});
		},
	};
}

// Synchronous, directly imported React calls only. An in-memory wrapper carries
// the authored location through the real React call, with a finally-restored
// stack. Shadowed imports and await/yield/super expressions stay uninstrumented.
export function valueCalls(designDir: string, mapping: Record<string, string>): Plugin {
	return {
		name: "authored-react-call-witness",
		setup(build) {
			build.onLoad({ filter: /\.[jt]sx?$/ }, ({ path }) => {
				const source = readFileSync(path, "utf8");
				const file = relative(designDir, path);
				const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
				const imports = new Map<string, string>();
				for (const statement of ast.program.body)
					if (
						statement.type === "ImportDeclaration" &&
						statement.source.value === "react" &&
						statement.importKind !== "type"
					) {
						for (const spec of statement.specifiers)
							if (
								spec.type === "ImportSpecifier" &&
								spec.importKind !== "type" &&
								spec.imported.type === "Identifier" &&
								["createElement", "cloneElement", "Children"].includes(spec.imported.name)
							)
								imports.set(spec.local.name, spec.imported.name);
					}
				walkNodes(ast, [], (node) => {
					if (
						node.type === "VariableDeclarator" ||
						/Function|Method/.test(node.type) ||
						node.type === "CatchClause"
					)
						for (const name of Object.keys(getBindingIdentifiers(node))) imports.delete(name);
				});
				const edits: { offset: number; text: string }[] = [];
				const originals: Node[] = [];
				walkNodes(ast, [], (node) => {
					if (node.type === "JSXElement" || node.type === "JSXFragment") originals.push(node);
					if (node.type !== "CallExpression" || node.optional) return;
					const callee = node.callee;
					const api =
						callee.type === "Identifier"
							? imports.get(callee.name)
							: callee.type === "MemberExpression" &&
									!callee.computed &&
									callee.object.type === "Identifier" &&
									imports.get(callee.object.name) === "Children" &&
									callee.property.type === "Identifier" &&
									callee.property.name === "toArray"
								? "toArray"
								: undefined;
					if (!api || api === "Children") return;
					let unsafe = false;
					walkNodes(node, [], (part) => {
						if (["AwaitExpression", "YieldExpression", "Super"].includes(part.type)) unsafe = true;
					});
					if (unsafe) return;
					const stamp = `${file}:${node.loc!.start.line}:${node.loc!.start.column + 1}`;
					edits.push(
						{ offset: node.start!, text: `globalThis.__handValues.at(${JSON.stringify(stamp)},()=>` },
						{ offset: node.end!, text: ")" },
					);
				});
				let contents = source;
				for (const edit of edits.sort((a, b) => b.offset - a.offset))
					contents = contents.slice(0, edit.offset) + edit.text + contents.slice(edit.offset);
				const transformed = parse(contents, { sourceType: "module", plugins: ["jsx", "typescript"] });
				let index = 0;
				walkNodes(transformed, [], (node) => {
					if (node.type !== "JSXElement" && node.type !== "JSXFragment") return;
					const original = originals[index++];
					if (!original || original.type !== node.type) throw new Error("JSX remap mismatch");
					mapping[`${file}:${node.loc!.start.line}:${node.loc!.start.column + 1}`] =
						`${file}:${original.loc!.start.line}:${original.loc!.start.column + 1}`;
				});
				if (index !== originals.length) throw new Error("JSX remap lost a site");
				return { contents, loader: path.endsWith("x") ? "tsx" : "ts" };
			});
		},
	};
}
