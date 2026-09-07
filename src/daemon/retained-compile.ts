import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { parse, parseExpression } from "@babel/parser";
import { getBindingIdentifiers, type Node } from "@babel/types";
import { type OnResolveResult, type Plugin, transformSync } from "esbuild";
import { LITERAL_ATTRIBUTES_BY_TAG, LITERAL_ATTRIBUTES_EVERY } from "../literal-attributes";
import type { RetainedValues } from "../source-edit";
import { TEXT_LOADERS } from "./assets";
import { assertDesignFile } from "./design-path";
import { observeLazySource } from "./source-lazy-compile";

export interface SourceInput {
	bytes: Buffer;
	identity: string;
}
export interface LiteralCell {
	absent?: true;
	source: string;
	file: string;
	value: string;
	owner: string;
	field?: string;
	syntax?: "jsx" | "react-call";
}
export interface RetainedCompilation {
	packet: RetainedValues;
	cells: Record<string, LiteralCell>;
	inputs: Map<string, SourceInput>;
	shapes: Record<string, string>;
	absent: Set<string>;
	directories: Map<string, string>;
	resolutions: Map<string, OnResolveResult>;
	configuration: Map<string, SourceInput>;
	configurationAbsent: Set<string>;
	configurationError?: string;
}

/** esbuild reads configuration outside onLoad/metafile. Preserve that context
 * with the source read, including inherited settings and package resolution. */
function captureConfiguration(file: string, compilation: RetainedCompilation): void {
	const seen = new Set<string>();
	const capture = (path: string): ReturnType<typeof parseExpression> => {
		const input = readInput(path),
			previous = compilation.configuration.get(path);
		if (previous && !sameInput(previous, input)) throw new Error("compiler configuration changed while reading it");
		compilation.configuration.set(path, input);
		return parseExpression(input.bytes.toString("utf8"));
	};
	const property = (node: ReturnType<typeof parseExpression>, name: string) =>
		node.type === "ObjectExpression"
			? node.properties.find(
					(p) =>
						p.type === "ObjectProperty" &&
						((p.key.type === "Identifier" && p.key.name === name) ||
							(p.key.type === "StringLiteral" && p.key.value === name)),
				)
			: undefined;
	const optional = (path: string): boolean => {
		if (existsSync(path)) return true;
		compilation.configurationAbsent.add(path);
		return false;
	};
	const chain = (path: string): void => {
		if (seen.has(path)) return;
		seen.add(path);
		const extended = property(capture(path), "extends");
		if (extended?.type !== "ObjectProperty") return;
		const entries = extended.value.type === "ArrayExpression" ? extended.value.elements : [extended.value];
		for (const entry of entries) {
			if (entry?.type !== "StringLiteral") throw new Error("compiler configuration origin is not a literal path");
			let target: string;
			if (entry.value.startsWith(".") || entry.value.startsWith("/")) {
				target = resolve(dirname(path), entry.value);
				if (!optional(target)) target += ".json";
			} else {
				const require = createRequire(path);
				try {
					target = require.resolve(entry.value);
				} catch {
					const packageFile = require.resolve(`${entry.value}/package.json`),
						named = property(capture(packageFile), "tsconfig");
					target = resolve(
						dirname(packageFile),
						named?.type === "ObjectProperty" && named.value.type === "StringLiteral"
							? named.value.value
							: "tsconfig.json",
					);
				}
			}
			if (!optional(target)) throw new Error("an extended compiler configuration is missing");
			chain(target);
		}
	};
	try {
		let found = false;
		for (let directory = dirname(file); ; directory = dirname(directory)) {
			const packageFile = resolve(directory, "package.json");
			if (optional(packageFile)) capture(packageFile);
			if (!found) {
				const config = resolve(directory, "tsconfig.json");
				if (optional(config)) {
					chain(config);
					found = true;
				}
			}
			if (dirname(directory) === directory) break;
		}
	} catch (error) {
		compilation.configurationError =
			error instanceof Error ? error.message : "compiler configuration could not be captured";
	}
}

export function directoryEntries(path: string): string {
	return existsSync(path) && statSync(path).isDirectory() ? JSON.stringify(readdirSync(path).sort()) : "absent";
}

export const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export function readInput(file: string): SourceInput {
	const before = statSync(file, { bigint: true });
	const bytes = readFileSync(file);
	const after = statSync(file, { bigint: true });
	const identity = (s: typeof before) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
	if (identity(before) !== identity(after)) throw new Error("source changed while reading it");
	return { bytes, identity: identity(after) };
}
export function sameInput(a: SourceInput, b: SourceInput): boolean {
	return a.identity === b.identity && a.bytes.equals(b.bytes);
}

function children(node: Node): Node[] {
	return Object.entries(node).flatMap(([key, value]: [string, unknown]) => {
		if (["loc", "leadingComments", "trailingComments", "innerComments", "comments"].includes(key)) return [];
		return (Array.isArray(value) ? value : [value]).filter(
			(item): item is Node =>
				typeof item === "object" && item !== null && "type" in item && typeof item.type === "string",
		);
	});
}
function walk(node: Node, visit: (node: Node, ancestors: Node[]) => void, ancestors: Node[] = []): void {
	visit(node, ancestors);
	for (const child of children(node)) walk(child, visit, [...ancestors, node]);
}
interface Patch {
	start: number;
	end: number;
	text: string;
	order?: number;
}
function apply(source: string, patches: Patch[]): string {
	let result = source;
	for (const p of patches.sort((a, b) => b.start - a.start || b.end - a.end || (a.order ?? 1) - (b.order ?? 1))) {
		result = result.slice(0, p.start) + p.text + result.slice(p.end);
	}
	return result;
}
function position(node: Node): { start: number; end: number } {
	if (node.start == null || node.end == null) throw new Error("compiler source range missing");
	return { start: node.start, end: node.end };
}

/** Instrument source expressions without lowering TypeScript. The existing
 * esbuild pass retains the project's complete compiler settings. */
export function lowerLiterals(
	file: string,
	source: string,
): {
	code: string;
	cells: Record<string, LiteralCell>;
	shape: string;
	stamps: Record<string, string>;
	locations: Record<string, string>;
} {
	const ast = parse(source, {
		sourceType: "module",
		plugins: [...(/\.[jt]sx$/.test(file) ? ["jsx" as const] : []), "typescript", "decorators-legacy"],
	}).program;
	const cells: Record<string, LiteralCell> = {};
	const eligible = new Set<Node>();
	const attributes = new Set<Node>();
	const retainedAttributes = new Set<Node>();
	const absentCells: Record<string, LiteralCell> = {};
	const sites: { node: Extract<Node, { type: "JSXElement" | "CallExpression" }>; id: string }[] = [];
	const functions = new Map<Node, string>();
	const patches: Patch[] = [];
	const prefix = `__spool_${digest(source).slice(0, 12)}`;
	walk(ast, (node, ancestors) => {
		if (node.type !== "JSXElement" || node.loc == null) return;
		const id = `${file}#literal:${sites.length}`;
		sites.push({ node, id });
		const open = node.openingElement;

		const fn = ancestors.find((n) =>
			["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ClassMethod"].includes(n.type),
		);
		if (
			!fn ||
			!(
				fn.type === "FunctionDeclaration" ||
				fn.type === "FunctionExpression" ||
				fn.type === "ArrowFunctionExpression" ||
				fn.type === "ClassMethod"
			) ||
			fn.async ||
			fn.generator
		)
			return;
		if (fn.type === "ClassMethod" && (fn.static || fn.key.type !== "Identifier" || fn.key.name !== "render")) return;
		const declaration = ancestors[ancestors.indexOf(fn) - 1];
		const name =
			fn.type === "FunctionDeclaration"
				? fn.id?.name
				: declaration?.type === "VariableDeclarator" && declaration.id.type === "Identifier"
					? declaration.id.name
					: undefined;
		if (
			fn.type !== "ClassMethod" &&
			!(name && /^[A-Z]/.test(name)) &&
			declaration?.type !== "ExportDefaultDeclaration"
		)
			return;

		const owner = functions.get(fn) ?? `${file}#component:${functions.size}`;
		const retainOwner = () => functions.set(fn, owner);
		if (!open.attributes.some((attribute) => attribute.type === "JSXSpreadAttribute")) {
			for (const attribute of open.attributes) {
				if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier") continue;
				const field = attribute.name.name;
				if (/^(?:on[A-Z]|data-spool-)/.test(field)) continue;
				if (["key", "ref", "data-go", "src", "className", "style"].includes(field)) continue;
				if (
					open.attributes.filter(
						(other) =>
							other.type === "JSXAttribute" && other.name.type === "JSXIdentifier" && other.name.name === field,
					).length !== 1
				)
					continue;
				const value =
					attribute.value?.type === "StringLiteral"
						? attribute.value
						: attribute.value?.type === "JSXExpressionContainer" &&
								attribute.value.expression.type === "StringLiteral"
							? attribute.value.expression
							: undefined;
				if (!value) continue;
				const key = `${id}@${field}`;
				cells[key] = {
					file,
					source: `${file}:${node.loc.start.line}:${node.loc.start.column + 1}`,
					value: value.value,
					owner,
					field,
					syntax: "jsx",
				};
				retainOwner();
				attributes.add(value);
				retainedAttributes.add(attribute);
				patches.push({
					...position(value),
					text: `${attribute.value === value ? "{" : ""}${prefix}Value(${JSON.stringify(key)},${JSON.stringify(value.value)})${attribute.value === value ? "}" : ""}`,
				});
			}
		}
		if (
			open.name.type === "JSXIdentifier" &&
			/^[a-z]/.test(open.name.name) &&
			!open.attributes.some((attr) => attr.type === "JSXSpreadAttribute")
		) {
			const names = [...(LITERAL_ATTRIBUTES_BY_TAG[open.name.name] ?? []), ...LITERAL_ATTRIBUTES_EVERY].filter(
				(name) => name !== "src",
			);
			for (const field of names) {
				if (
					open.attributes.some(
						(attr) =>
							attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" && attr.name.name === field,
					)
				)
					continue;
				absentCells[`${id}@${field}`] = {
					file,
					source: `${file}:${node.loc.start.line}:${node.loc.start.column + 1}`,
					value: "",
					owner,
					field,
					syntax: "jsx",
					absent: true,
				};
				retainOwner();
			}
		}
		if (
			open.selfClosing ||
			!node.closingElement ||
			!node.children.every(
				(child) =>
					child.type === "JSXText" ||
					(child.type === "JSXExpressionContainer" &&
						["StringLiteral", "JSXEmptyExpression"].includes(child.expression.type)),
			)
		)
			return;
		const meaningful = node.children.filter(
			(child) =>
				!(child.type === "JSXText" && /^\s*\n\s*$/.test(child.value)) &&
				!(child.type === "JSXExpressionContainer" && child.expression.type === "JSXEmptyExpression"),
		);
		if (meaningful.length > 1) return;
		// Ask the same JSX lowerer for the value of only this literal child. No
		// application expression or TypeScript declaration passes through this step.
		const contentStart = position(open).end,
			contentEnd = position(node.closingElement).start;
		const literal = transformSync(`const value=<p>${source.slice(contentStart, contentEnd)}</p>`, {
			loader: "jsx",
			jsx: "automatic",
			jsxDev: true,
		}).code;
		let value = "";
		walk(parse(literal, { sourceType: "module" }).program, (n) => {
			if (
				n.type === "ObjectProperty" &&
				n.key.type === "Identifier" &&
				n.key.name === "children" &&
				n.value.type === "StringLiteral"
			)
				value = n.value.value;
		});
		retainOwner();
		eligible.add(node);
		cells[id] = { file, source: `${file}:${node.loc.start.line}:${node.loc.start.column + 1}`, value, owner };
		patches.push({
			start: contentStart,
			end: contentEnd,
			text: `{${prefix}Value(${JSON.stringify(id)},${JSON.stringify(value)})}`,
		});
		const jsxChild = ["JSXElement", "JSXFragment"].includes(ancestors.at(-1)?.type ?? "");
		patches.push({
			start: position(node).start,
			end: position(node).start,
			text: `${jsxChild ? "{" : ""}${prefix}Observe(${JSON.stringify(id)},`,
		});
		patches.push({ start: position(node).end, end: position(node).end, text: jsxChild ? ")}" : ")", order: 2 });
	});
	const factories = new Map<string, string>();
	for (const statement of ast.body)
		if (
			statement.type === "ImportDeclaration" &&
			statement.source.value === "react" &&
			statement.importKind !== "type"
		)
			for (const spec of statement.specifiers) {
				if (
					spec.type === "ImportSpecifier" &&
					spec.importKind !== "type" &&
					spec.imported.type === "Identifier" &&
					["createElement", "cloneElement"].includes(spec.imported.name)
				)
					factories.set(spec.local.name, spec.imported.name);
				if (spec.type === "ImportNamespaceSpecifier" || spec.type === "ImportDefaultSpecifier")
					factories.set(spec.local.name, "namespace");
			}
	walk(ast, (node) => {
		if (node.type === "VariableDeclarator" || /Function|Method/.test(node.type) || node.type === "CatchClause")
			for (const name of Object.keys(getBindingIdentifiers(node))) factories.delete(name);
	});
	let factory = 0;
	walk(ast, (node, ancestors) => {
		if (node.type !== "CallExpression" || node.optional || !node.loc) return;
		const callee = node.callee;
		const api =
			callee.type === "Identifier"
				? factories.get(callee.name)
				: callee.type === "MemberExpression" &&
						!callee.computed &&
						callee.object.type === "Identifier" &&
						factories.get(callee.object.name) === "namespace" &&
						callee.property.type === "Identifier"
					? callee.property.name
					: undefined;
		if (!api || !["createElement", "cloneElement"].includes(api)) return;
		let unsafe = false;
		walk(node, (part) => {
			if (["AwaitExpression", "YieldExpression", "Super"].includes(part.type)) unsafe = true;
		});
		if (unsafe) return;
		const id = `${file}#factory:${factory++}`;
		sites.push({ node, id });
		patches.push({
			start: position(node).start,
			end: position(node).start,
			text: `${prefix}Factory(${JSON.stringify(id)},()=>`,
		});
		patches.push({ start: position(node).end, end: position(node).end, text: ")", order: 2 });
		const type = node.arguments[0];
		if (
			api === "createElement" &&
			type?.type === "MemberExpression" &&
			!type.computed &&
			type.object.type === "Identifier" &&
			type.property.type === "Identifier" &&
			type.property.name === "type"
		)
			patches.push({ ...position(type), text: `${prefix}TypeFrom(${type.object.name})` });
		const fn = ancestors.find((part) =>
			["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ClassMethod"].includes(part.type),
		);
		if (
			!fn ||
			!["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ClassMethod"].includes(fn.type)
		)
			return;
		const declaration = ancestors[ancestors.indexOf(fn) - 1];
		const name =
			fn.type === "FunctionDeclaration"
				? fn.id?.name
				: declaration?.type === "VariableDeclarator" && declaration.id.type === "Identifier"
					? declaration.id.name
					: undefined;
		if (
			!(name && /^[A-Z]/.test(name)) &&
			declaration?.type !== "ExportDefaultDeclaration" &&
			fn.type !== "ClassMethod"
		)
			return;
		const owner = functions.get(fn) ?? `${file}#component:${functions.size}`;
		const retain = (literal: Node, field: string) => {
			if (literal.type !== "StringLiteral" || ["key", "ref", "data-go", "src", "className", "style"].includes(field))
				return;
			const key = `${id}@${field}`;
			cells[key] = {
				file,
				source: `${file}:${node.loc!.start.line}:${node.loc!.start.column + 1}`,
				value: literal.value,
				owner,
				field,
				syntax: "react-call",
			};
			functions.set(fn, owner);
			attributes.add(literal);
			patches.push({
				...position(literal),
				text: `${prefix}Value(${JSON.stringify(key)},${JSON.stringify(literal.value)})`,
			});
		};
		if (node.arguments.some((arg) => arg.type === "SpreadElement")) return;
		const config = node.arguments[1];
		if (
			config?.type === "ObjectExpression" &&
			config.properties.every((property) => property.type === "ObjectProperty" && !property.computed)
		) {
			for (const property of config.properties) {
				if (property.type !== "ObjectProperty") continue;
				const field =
					property.key.type === "Identifier"
						? property.key.name
						: property.key.type === "StringLiteral"
							? property.key.value
							: undefined;
				if (!field || (field === "children" && node.arguments.length > 2)) continue;
				if (
					config.properties.filter(
						(part) =>
							part.type === "ObjectProperty" &&
							((part.key.type === "Identifier" && part.key.name === field) ||
								(part.key.type === "StringLiteral" && part.key.value === field)),
					).length !== 1
				)
					continue;
				retain(property.value, field);
			}
		}
		if (node.arguments.length === 3 && node.arguments[2]) retain(node.arguments[2], "children");
	});

	for (const [fn, owner] of functions) {
		if (
			!(
				fn.type === "FunctionDeclaration" ||
				fn.type === "FunctionExpression" ||
				fn.type === "ArrowFunctionExpression" ||
				fn.type === "ClassMethod"
			)
		)
			continue;
		let name =
			fn.type === "ClassMethod"
				? "this"
				: fn.type === "FunctionDeclaration" || fn.type === "FunctionExpression"
					? fn.id?.name
					: undefined;
		let exported: Extract<Node, { type: "ExportDefaultDeclaration" }> | undefined;
		if (!name)
			walk(ast, (n) => {
				if (n.type === "VariableDeclarator" && n.init === fn && n.id.type === "Identifier") name = n.id.name;
				if (n.type === "ExportDefaultDeclaration" && n.declaration === fn) exported = n;
			});
		if (!name && exported) {
			name = `${prefix}Default`;
			if (fn.type === "FunctionDeclaration")
				patches.push({
					start: position(fn).start + "function".length,
					end: position(fn).start + "function".length,
					text: ` ${name}`,
				});
			else {
				patches.push({ start: position(exported).start, end: position(fn).start, text: `const ${name}=` });
				patches.unshift({
					start: position(fn).end,
					end: position(fn).end,
					text: `;export default ${name};`,
					order: 0,
				});
			}
		}
		if (!name) throw new Error("retained component has no stable local binding");
		const use = `${prefix}Use(${JSON.stringify(owner)},${name});`;
		const body = fn.body;
		if (body.type === "BlockStatement")
			patches.push({ start: position(body).start + 1, end: position(body).start + 1, text: use });
		else {
			patches.push({ start: position(body).start, end: position(body).start, text: `{${use}return (` });
			patches.unshift({ start: position(body).end, end: position(body).end, text: ");}" });
		}
	}
	const transformed = apply(source, [...patches]);
	const stamps: Record<string, string> = {},
		locations: Record<string, string> = {};
	for (const { node, id } of sites) {
		const start = position(node).start;
		const mapped =
			start + patches.reduce((offset, p) => offset + (p.end <= start ? p.text.length - (p.end - p.start) : 0), 0);
		const before = transformed.slice(0, mapped).split("\n");
		stamps[`${file}:${before.length}:${(before.at(-1)?.length ?? 0) + 1}`] = id;
		locations[id] = `${file}:${node.loc!.start.line}:${node.loc!.start.column + 1}`;
	}
	Object.assign(cells, absentCells);
	const shape = digest(
		JSON.stringify(ast, (key, value: unknown) => {
			if (
				[
					"start",
					"end",
					"loc",
					"extra",
					"leadingComments",
					"trailingComments",
					"innerComments",
					"comments",
				].includes(key)
			)
				return undefined;
			if (key === "attributes" && Array.isArray(value))
				return value.filter((attribute) => !retainedAttributes.has(attribute));
			if (typeof value === "object" && value !== null && attributes.has(value as Node))
				return { type: "RetainedAttribute" };
			if (typeof value === "object" && value !== null && eligible.has(value as Node))
				return { ...value, children: [{ type: "RetainedLiteral" }] };
			return value;
		}),
	);
	const imports =
		functions.size || factory > 0
			? `\nimport {sourceValue as ${prefix}Value,observeSource as ${prefix}Observe,useSourceValues as ${prefix}Use,observeFactory as ${prefix}Factory,sourceTypeFrom as ${prefix}TypeFrom} from "spool/jsx-dev-runtime";`
			: "";
	return { code: transformed + imports, cells, shape, stamps, locations };
}

export function retainedPlugin(
	designDir: string,
	compilation: RetainedCompilation,
	frozen?: ReadonlyMap<string, SourceInput>,
	resolutions?: ReadonlyMap<string, OnResolveResult>,
): Plugin {
	return {
		name: "spool-retained-source",
		setup(build) {
			build.onResolve({ filter: /.*/ }, async (args) => {
				if (args.pluginData?.retainedResolving) return null;
				const key = JSON.stringify([args.path, args.importer, args.resolveDir, args.kind]);

				const local = args.path.startsWith(".") || args.path.startsWith("/") || args.path.startsWith("shared/");
				if (local) {
					const target = resolve(args.path.startsWith("shared/") ? designDir : args.resolveDir, args.path);
					captureConfiguration(target, compilation);
					for (
						let directory = target;
						directory.startsWith(`${designDir}${sep}`) || directory === designDir;
						directory = dirname(directory)
					) {
						const entries = directoryEntries(directory);
						const previous = compilation.directories.get(directory);
						if (previous !== undefined && previous !== entries)
							throw new Error("module resolution changed during compilation");
						compilation.directories.set(directory, entries);
					}
				}
				const result = await build.resolve(args.path, {
					kind: args.kind,
					importer: args.importer,
					resolveDir: args.resolveDir,
					namespace: args.namespace,
					pluginData: { retainedResolving: true },
				});
				const recorded: OnResolveResult = {
					path: result.path,
					namespace: result.namespace,
					external: result.external,
					sideEffects: result.sideEffects,
					suffix: result.suffix,
					errors: result.errors,
					warnings: result.warnings,
				};
				if (resolutions && JSON.stringify(resolutions.get(key)) !== JSON.stringify(recorded))
					throw new Error("compilation requested an unpublished resolution");
				compilation.resolutions.set(key, recorded);
				return null;
			});
			build.onLoad({ filter: /.*/ }, (args) => {
				assertDesignFile(designDir, args.path);
				captureConfiguration(args.path, compilation);
				const input = frozen?.get(args.path) ?? (frozen ? undefined : readInput(args.path));
				if (!input) throw new Error("compilation requested an unpublished dependency");
				compilation.inputs.set(args.path, input);
				if (!/\.[cm]?[jt]sx?$/.test(args.path)) {
					const extension = extname(args.path);
					const loader =
						TEXT_LOADERS[extension as keyof typeof TEXT_LOADERS] ??
						(extension === ".css" ? "css" : extension === ".json" ? "json" : undefined);
					return loader ? { contents: input.bytes, loader, resolveDir: dirname(args.path) } : null;
				}
				const file = relative(designDir, args.path);
				let lowered: ReturnType<typeof lowerLiterals>;
				try {
					lowered = lowerLiterals(file, input.bytes.toString("utf8"));
				} catch {
					// Let the original esbuild pass explain invalid source, including its
					// original filename/line/column, rather than nesting transform errors.
					const loader = /\.[cm]?ts$/.test(file)
						? "ts"
						: file.endsWith(".tsx")
							? "tsx"
							: file.endsWith(".jsx")
								? "jsx"
								: "js";
					return { contents: input.bytes, loader, resolveDir: dirname(args.path) };
				}

				const observed = observeLazySource(file, input.bytes.toString("utf8"), lowered.code);
				const locations: string[] = [];
				walk(
					parse(lowered.code, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] })
						.program,
					(node) => {
						if (node.type === "JSXElement" && node.loc)
							locations.push(`${file}:${node.loc.start.line}:${node.loc.start.column + 1}`);
					},
				);
				const stamps: Record<string, string> = {};
				let nextLocation = 0;
				walk(
					parse(observed, { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy"] }).program,
					(node) => {
						if (node.type !== "JSXElement" || !node.loc) return;
						const old = locations[nextLocation++];
						const id = old ? lowered.stamps[old] : undefined;
						if (id) stamps[`${file}:${node.loc.start.line}:${node.loc.start.column + 1}`] = id;
					},
				);
				lowered = { ...lowered, code: observed, stamps };
				Object.assign(compilation.cells, lowered.cells);
				compilation.packet.stamps ??= {};
				compilation.packet.locations ??= {};
				Object.assign(compilation.packet.stamps, lowered.stamps);
				Object.assign(compilation.packet.locations, lowered.locations);
				compilation.shapes[file] = lowered.shape;
				const loader = /\.[cm]?ts$/.test(file)
					? "ts"
					: file.endsWith(".tsx")
						? "tsx"
						: file.endsWith(".jsx")
							? "jsx"
							: "js";
				return { contents: lowered.code, loader, resolveDir: dirname(args.path) };
			});
		},
	};
}
export function emptyCompilation(): RetainedCompilation {
	return {
		packet: { id: randomUUID(), sequence: 0, shape: "", values: {}, owners: {}, css: "", bundledCss: "" },
		cells: {},
		inputs: new Map(),
		shapes: {},
		absent: new Set(),
		directories: new Map(),
		resolutions: new Map(),
		configuration: new Map(),
		configurationAbsent: new Set(),
	};
}
