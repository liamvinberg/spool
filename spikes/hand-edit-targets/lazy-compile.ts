import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import { build, type Plugin, transform } from "esbuild";
import { type DesignEntryOptions, designBuildOptions, designEntryKey } from "../../src/daemon/compile";
import { resolveDesignPath } from "../../src/daemon/design-path";
import { walkNodes } from "../../src/daemon/jsx-walk";
import { rewriteObjectLoader } from "./lazy-objects";

function rewriteLoader(node: Node, text: string, helper: string): string | undefined {
	const objects = rewriteObjectLoader(node, text, helper);
	if (objects) return objects;
	// The earlier direct-return proof remains the fallback. Prefix statements
	// execute normally but earn no object origin, and no projected object may
	// pass through an unaccounted-for variable, getter or callback here.
	const slice = (node: Node) => text.slice(node.start!, node.end!);
	const member = (node: Node): string | undefined => {
		if (node.type === "ConditionalExpression") {
			const yes = member(node.consequent),
				no = member(node.alternate);
			return yes && no ? `(${slice(node.test)} ? ${yes} : ${no})` : undefined;
		}
		if (node.type !== "MemberExpression" || node.object.type !== "Identifier") return undefined;
		const key =
			!node.computed && node.property.type === "Identifier"
				? JSON.stringify(node.property.name)
				: node.computed && node.property.type === "StringLiteral"
					? JSON.stringify(node.property.value)
					: undefined;
		return key === undefined ? undefined : `${helper}.member(${slice(node.object)}, ${key})`;
	};
	const result = (node: Node, project: boolean): string | undefined => {
		if (node.type === "Identifier") return slice(node); // Runtime requires a registered namespace.
		if (node.type === "AwaitExpression") {
			const argument = result(node.argument, project);
			return argument ? `(await ${argument})` : undefined;
		}
		if (node.type === "ConditionalExpression") {
			const yes = result(node.consequent, project),
				no = result(node.alternate, project);
			return yes && no ? `(${slice(node.test)} ? ${yes} : ${no})` : undefined;
		}
		if (node.type === "ObjectExpression" && project && node.properties.length === 1) {
			const property = node.properties[0];
			if (
				property?.type !== "ObjectProperty" ||
				property.computed ||
				property.key.type !== "Identifier" ||
				property.key.name !== "default"
			)
				return undefined;
			const origin = member(property.value);
			return origin ? `${helper}.project(${origin})` : undefined;
		}
		if (node.type !== "CallExpression") return undefined;
		if (node.callee.type === "Import" && node.arguments.length === 1) return slice(node);
		if (node.callee.type !== "MemberExpression" || node.callee.computed || node.callee.property.type !== "Identifier")
			return undefined;
		if (
			node.callee.object.type === "Identifier" &&
			node.callee.object.name === "Promise" &&
			node.callee.property.name === "resolve" &&
			node.arguments.length === 1
		)
			return slice(node);
		if (node.callee.property.name !== "then" || node.arguments.length !== 1 || !node.arguments[0]) return undefined;
		// No projected object may flow into a subsequent user callback.
		const input = result(node.callee.object, false),
			callback = fn(node.arguments[0], project, false);
		return input && callback ? `(${input}).then(${callback})` : undefined;
	};
	const fn = (node: Node, project: boolean, loader: boolean): string | undefined => {
		if (
			(node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") ||
			node.generator ||
			(loader && node.params.length !== 0)
		)
			return undefined;
		if (node.params.some((param) => param.type !== "Identifier")) return undefined;
		let body: Node = node.body;
		if (body.type === "BlockStatement") {
			const last = body.body.at(-1);
			if (
				last?.type !== "ReturnStatement" ||
				!last.argument ||
				body.body
					.slice(0, -1)
					.some((statement) => !["VariableDeclaration", "ExpressionStatement"].includes(statement.type))
			)
				return undefined;
			body = last.argument;
		}
		const replacement = result(body, project);
		return replacement
			? slice(node).slice(0, body.start! - node.start!) + replacement + slice(node).slice(body.end! - node.start!)
			: undefined;
	};
	return fn(node, true, true);
}

function plugin(designDir: string): Plugin {
	return {
		name: "disposable-lazy-origins",
		setup(build) {
			build.onLoad({ filter: /\.[jt]sx?$/ }, async ({ path }) => {
				const file = resolveDesignPath(designDir, path);
				const source = readFileSync(file, "utf8"),
					name = relative(designDir, file);
				const original = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
				const lazies = new Set(
					original.program.body.flatMap((node) =>
						node.type === "ImportDeclaration" && node.source.value === "react"
							? node.specifiers
									.filter(
										(s) =>
											s.type === "ImportSpecifier" && s.imported.type === "Identifier" && s.imported.name === "lazy",
									)
									.map((s) => s.local.name)
							: [],
					),
				);
				const plans = new Map<string, { file: string; start: number; end: number }>();
				walkNodes(original, [], (node, ancestors) => {
					if (
						node.type === "VariableDeclarator" &&
						node.id.type === "Identifier" &&
						node.init?.type === "CallExpression" &&
						node.init.callee.type === "Identifier" &&
						lazies.has(node.init.callee.name) &&
						node.init.arguments.length === 1 &&
						node.init.arguments[0] &&
						!ancestors.some((n) => /Function|Method/.test(n.type)) &&
						rewriteLoader(node.init.arguments[0], source, "unused")
					)
						plans.set(node.id.name, { file: name, start: node.init.start!, end: node.init.end! });
				});
				// Lower JSX first so its original file/line/column survive all taps.
				let code = (
					await transform(source, {
						sourcefile: name,
						loader: "tsx",
						jsx: "automatic",
						jsxDev: true,
						jsxImportSource: "spool",
						target: "es2022",
						format: "esm",
					})
				).code;
				let helper = "__spoolLazyWitness";
				while (code.includes(helper)) helper += "_";
				const ast = parse(code, { sourceType: "module" });
				const edits: { start: number; end: number; text: string }[] = [];
				walkNodes(ast, [], (node, ancestors) => {
					if (
						node.type !== "VariableDeclarator" ||
						node.id.type !== "Identifier" ||
						ancestors.some((n) => /Function|Method/.test(n.type))
					)
						return;
					const plan = plans.get(node.id.name),
						call = node.init;
					if (
						!plan ||
						call?.type !== "CallExpression" ||
						call.callee.type !== "Identifier" ||
						!lazies.has(call.callee.name) ||
						!call.arguments[0]
					)
						return;
					const loader = rewriteLoader(call.arguments[0], code, helper);
					if (loader)
						edits.push({
							start: call.start!,
							end: call.end!,
							text: `${helper}.created(${call.callee.name}(${loader}), ${JSON.stringify(plan)})`,
						});
				});
				for (const edit of edits.sort((a, b) => b.start - a.start))
					code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
				// Force the compiler's real namespace object to exist even when it
				// would otherwise inline imports. Self-import doesn't evaluate again.
				code = `import {witness as ${helper}} from 'hand-edit-probe/lazy-witness';\nimport * as ${helper}Self from ${JSON.stringify(`./${basename(file)}`)};\n${helper}.namespace(${helper}Self, ${JSON.stringify(name)});\n${code}`;
				return { contents: code, loader: "js" };
			});
		},
	};
}

export async function buildLazyEntry(options: DesignEntryOptions) {
	const config = designBuildOptions(options);
	const result = await build({ ...config, plugins: [plugin(options.designDir), ...(config.plugins ?? [])] });
	const bootJs = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
	if (!bootJs) throw new Error("lazy witness compiler produced no module");
	return {
		bootJs,
		bundledCss: result.outputFiles.find((file) => file.path.endsWith(".css"))?.text,
		sourceFiles: Object.keys(result.metafile.inputs)
			.filter((input) => input !== designEntryKey(options))
			.map((input) => `${options.designDir}/${input}`),
	};
}
