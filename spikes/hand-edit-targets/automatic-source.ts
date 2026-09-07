import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { parse } from "@babel/parser";
import {
	type ArrowFunctionExpression,
	type ClassMethod,
	type File,
	type FunctionDeclaration,
	type FunctionExpression,
	getBindingIdentifiers,
	type JSXElement,
	type Node,
} from "@babel/types";
import { realDesignDir, resolveDesignPath } from "../../src/daemon/design-path";
import { fingerprintOf } from "../../src/daemon/hand-write";
import { walkNodes } from "../../src/daemon/jsx-walk";
import { elementAt, sourceTarget } from "./targets";

export interface Revision {
	path: string;
	file: string;
	revision: string;
}
interface Unit extends Revision {
	text: string;
	ast: File;
}
export interface Address {
	file: string;
	start: number;
	end: number;
}
export interface Site {
	unit: Unit;
	node: JSXElement;
	ancestors: Node[];
	source: string;
}
export interface Call {
	source: string;
	occurrence: string;
	passedChild?: boolean;
}
export interface Selection {
	generation: string;
	occurrence: string;
	source: string;
	chain: Call[];
	refusal?: string;
}
export type Operation =
	| { kind: "text" | "delete" | "reorder" | "asset" }
	| { kind: "attribute"; attribute: "alt" | "title" | "href" }
	| { kind: "property"; property: string; scope: string };
export interface Target {
	address: Address;
	source: string;
	role: "definition" | "call-site";
	slot: "text" | "attribute" | "child" | "class";
	attribute?: string;
	expected: string | null;
	scope: string;
	repeated: boolean;
	asset?: Revision & { identifier: string; specifier: string };
}

export function address(site: Site): Address {
	return { file: site.unit.file, start: site.node.start!, end: site.node.end! };
}
type Component = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression | ClassMethod;
function owner(site: Site): Component {
	for (let i = site.ancestors.length - 1; i >= 0; i--) {
		const node = site.ancestors[i]!;
		if (node.type === "FunctionDeclaration") return node;
		if (!/Function|Method/.test(node.type)) continue;
		const parent = site.ancestors[i - 1];
		if (
			node.type === "ArrowFunctionExpression" &&
			parent?.type === "CallExpression" &&
			parent.callee.type === "MemberExpression" &&
			parent.callee.property.type === "Identifier" &&
			parent.callee.property.name === "map"
		)
			continue;
		if (
			node.type === "ArrowFunctionExpression" ||
			node.type === "FunctionExpression" ||
			(node.type === "ClassMethod" && node.key.type === "Identifier" && node.key.name === "render" && !node.static)
		)
			return node;
		throw new Error("component owner form is unproven");
	}
	throw new Error("no component owner");
}
export function attribute(site: Site, name: string) {
	if (site.node.openingElement.attributes.some((n) => n.type === "JSXSpreadAttribute"))
		throw new Error("spread may override the slot");
	const matches = site.node.openingElement.attributes.filter((n) => n.type === "JSXAttribute" && n.name.name === name);
	if (matches.length > 1) throw new Error("duplicate attribute");
	const attr = matches[0];
	return attr?.type === "JSXAttribute" ? attr : undefined;
}
export function literal(site: Site, name?: string): string | undefined {
	if (name !== undefined) {
		const value = attribute(site, name)?.value;
		if (value?.type === "StringLiteral") return value.value;
		if (value?.type === "JSXExpressionContainer" && value.expression.type === "StringLiteral")
			return value.expression.value;
		return undefined;
	}
	const children = site.node.children.filter((n) => n.type !== "JSXText" || n.value.trim() !== "");
	if (children.length === 1 && children[0]?.type === "JSXText") return children[0].value;
	if (
		children.length === 1 &&
		children[0]?.type === "JSXExpressionContainer" &&
		children[0].expression.type === "StringLiteral"
	)
		return children[0].expression.value;
	return undefined;
}

// Deliberately small module/binding reader. Every refusal remains observable;
// matching export names or displayed text is never a binding proof.
export class Sources {
	readonly units = new Map<string, Unit>();
	readonly revisions = new Map<string, Revision>();
	readonly resolutions = new Map<string, string>();
	readonly missing = new Set<string>();
	readonly assets = new Map<string, Revision>();
	constructor(readonly root: string) {}
	asset(path: string): Revision {
		const dir = realDesignDir(this.root);
		const file = resolveDesignPath(dir, join(dir, path));
		for (const candidate of [path, relative(dir, file)]) {
			if (
				candidate.split(/[\\/]/).some((p) => [".spool", ".git", "node_modules"].includes(p)) ||
				![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(extname(candidate))
			)
				throw new Error("asset source role is unproven");
		}
		const revision = { path, file, revision: fingerprintOf(readFileSync(file).toString("base64")) };
		const held = this.assets.get(path);
		if (held && (held.file !== file || held.revision !== revision.revision))
			throw new Error("asset changed during read");
		this.assets.set(path, revision);
		return revision;
	}
	retain(path: string): Revision {
		const canonical = sourceTarget(this.root, path);
		const held = this.revisions.get(path);
		if (held && (held.file !== canonical.file || held.revision !== canonical.revision))
			throw new Error("source changed during read");
		const revision = { path, ...canonical };
		this.revisions.set(path, revision);
		return revision;
	}
	read(path: string): Unit {
		const revision = this.retain(path);
		const held = this.units.get(revision.file);
		if (held) return held;
		const text = readFileSync(revision.file, "utf8");
		if (fingerprintOf(text) !== revision.revision) throw new Error("source changed during parse");
		const unit = { ...revision, text, ast: parse(text, { sourceType: "module", plugins: ["jsx", "typescript"] }) };
		this.units.set(unit.file, unit);
		return unit;
	}
	resolve(from: Unit, specifier: string): Unit {
		if (!specifier.startsWith(".") && !specifier.startsWith("shared/"))
			throw new Error("external module binding is unknown");
		const base = specifier.startsWith("shared/") ? specifier : join(dirname(from.path), specifier);
		const candidates = [
			base,
			...[".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"].map(
				(ext) => base + ext,
			),
		];
		for (const path of candidates) {
			const absolute = join(this.root, "design", path);
			if (!existsSync(absolute)) {
				this.missing.add(absolute);
				continue;
			}
			// A directory is not an extensionless source file.
			if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
			const found = this.read(path);
			this.resolutions.set(`${from.file}:${specifier}`, found.file);
			return found;
		}
		throw new Error("unresolved project import");
	}
	site(source: string): Site {
		const path = source.replace(/:\d+:\d+$/, "");
		if (!this.units.has(sourceTarget(this.root, path).file))
			throw new Error("source stamp is outside the compiled module evidence");
		const unit = this.read(path);
		return { unit, ...elementAt(unit.text, source), source };
	}
	private component(unit: Unit, node: Node, seen: Set<string>): { unit: Unit; fn: Component } {
		if (
			node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression"
		)
			return { unit, fn: node };
		if (node.type === "Identifier") return this.local(unit, node.name, seen);
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
			const method = node.body.body.find(
				(n) => n.type === "ClassMethod" && n.key.type === "Identifier" && n.key.name === "render" && !n.static,
			);
			if (method?.type === "ClassMethod") return { unit, fn: method };
		}
		if (node.type === "CallExpression" && node.callee.type === "Identifier") {
			const name = node.callee.name;
			const imported = unit.ast.program.body.some(
				(n) =>
					n.type === "ImportDeclaration" &&
					n.source.value === "react" &&
					n.specifiers.some(
						(s) =>
							s.type === "ImportSpecifier" &&
							s.local.name === name &&
							s.imported.type === "Identifier" &&
							["memo", "forwardRef"].includes(s.imported.name),
					),
			);
			if (imported && node.arguments[0]) return this.component(unit, node.arguments[0], seen);
		}
		throw new Error("wrapped, lazy or indirect definition is unproven");
	}
	private local(unit: Unit, name: string, seen: Set<string>): { unit: Unit; fn: Component } {
		const key = `${unit.file}:local:${name}`;
		if (seen.has(key)) throw new Error("cyclic component binding");
		seen.add(key);
		let changed = false;
		walkNodes(unit.ast, [], (node) => {
			if (
				(node.type === "AssignmentExpression" && getBindingIdentifiers(node.left)[name]) ||
				(node.type === "UpdateExpression" && getBindingIdentifiers(node.argument)[name])
			)
				changed = true;
		});
		if (changed) throw new Error("component binding is reassigned");
		for (const statement of unit.ast.program.body) {
			const declaration =
				statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
					? statement.declaration
					: statement;
			if (
				(declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") &&
				declaration.id?.name === name
			)
				return this.component(unit, declaration, seen);
			if (declaration?.type === "VariableDeclaration") {
				const variable = declaration.declarations.find((n) => n.id.type === "Identifier" && n.id.name === name);
				if (variable) {
					if (declaration.kind !== "const" || !variable.init)
						throw new Error("component variable is not immutable");
					return this.component(unit, variable.init, seen);
				}
			}
			if (statement.type !== "ImportDeclaration") continue;
			const binding = statement.specifiers.find((n) => n.local.name === name);
			if (!binding) continue;
			if (binding.type === "ImportNamespaceSpecifier" || statement.importKind === "type")
				throw new Error("unsupported import binding");
			const exported =
				binding.type === "ImportDefaultSpecifier"
					? "default"
					: binding.imported.type === "Identifier"
						? binding.imported.name
						: binding.imported.value;
			return this.exported(this.resolve(unit, statement.source.value), exported, seen);
		}
		throw new Error("component binding is unresolved");
	}
	private exported(unit: Unit, name: string, seen = new Set<string>()): { unit: Unit; fn: Component } {
		const key = `${unit.file}:export:${name}`;
		if (seen.has(key)) throw new Error("cyclic export binding");
		seen.add(key);
		for (const statement of unit.ast.program.body) {
			if (statement.type === "ExportDefaultDeclaration" && name === "default")
				return this.component(unit, statement.declaration, seen);
			if (statement.type !== "ExportNamedDeclaration") continue;
			if (statement.declaration && getBindingIdentifiers(statement.declaration)[name])
				return this.local(unit, name, seen);
			for (const specifier of statement.specifiers) {
				const exported =
					specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
				if (exported !== name || specifier.type !== "ExportSpecifier") continue;
				return statement.source
					? this.exported(this.resolve(unit, statement.source.value), specifier.local.name, seen)
					: this.local(unit, specifier.local.name, seen);
			}
		}
		const stars = unit.ast.program.body.filter((statement) => statement.type === "ExportAllDeclaration");
		if (name === "default") throw new Error("export star does not forward default");
		if (stars.length > 1) throw new Error("multiple export-star branches are unproven");
		if (stars[0]) return this.exported(this.resolve(unit, stars[0].source.value), name, seen);
		throw new Error("unresolved export binding");
	}
	callee(site: Site): { unit: Unit; fn: Component } {
		const tag = site.node.openingElement.name;
		const namespace = tag.type === "JSXMemberExpression" && tag.object.type === "JSXIdentifier" ? tag : undefined;
		const name =
			namespace?.object.type === "JSXIdentifier"
				? namespace.object.name
				: tag.type === "JSXIdentifier"
					? tag.name
					: undefined;
		if (!name || !/^[A-Z]/.test(name)) throw new Error("not a direct component binding");
		let shadowed = false;
		walkNodes(site.unit.ast, [], (node, ancestors) => {
			if (!ancestors.some((n) => /Function|Method/.test(n.type))) return;
			if (
				(node.type === "VariableDeclarator" || /Function|Method/.test(node.type) || node.type === "CatchClause") &&
				getBindingIdentifiers(node)[name]
			)
				shadowed = true;
		});
		for (const ancestor of site.ancestors)
			if (/Function|Method/.test(ancestor.type) && getBindingIdentifiers(ancestor)[name]) shadowed = true;
		if (shadowed) throw new Error("component binding may be shadowed");
		if (namespace) {
			const imported = site.unit.ast.program.body.find(
				(statement) =>
					statement.type === "ImportDeclaration" &&
					statement.importKind !== "type" &&
					statement.specifiers.some(
						(binding) => binding.type === "ImportNamespaceSpecifier" && binding.local.name === name,
					),
			);
			if (imported?.type !== "ImportDeclaration") throw new Error("member is not a verified namespace import");
			return this.exported(this.resolve(site.unit, imported.source.value), namespace.property.name);
		}
		return this.local(site.unit, name, new Set());
	}
	chain(selection: Selection): Site[] {
		if (selection.refusal) throw new Error(selection.refusal);
		const leaf = this.site(selection.source);
		let current = leaf;
		let transported = leaf;
		const sites: Site[] = [leaf];
		for (const call of [...selection.chain].reverse()) {
			const site = this.site(call.source);
			const actual = this.callee(site);
			if (actual.unit.file !== current.unit.file || actual.fn.start !== owner(current).start) {
				// Transport is separate from authorship. Prove both the exact
				// incoming element identity and the bounded source forwarding form.
				if (
					!call.passedChild ||
					site.unit.file !== transported.unit.file ||
					!site.node.children.some(
						(child) => child.start === transported.node.start && child.end === transported.node.end,
					) ||
					!passesChildren(actual.fn)
				)
					throw new Error("mounted call relationship is not a verified children passthrough");
				transported = site;
				continue;
			}
			current = site;
			transported = site;
			sites.push(site);
		}
		// The uninstrumented createElement entry must end at the frame export.
		const fn = owner(current);
		const entry = this.exported(current.unit, "default");
		if (entry.unit.file !== current.unit.file || entry.fn.start !== fn.start)
			throw new Error("call ancestry is incomplete");
		return sites;
	}
	valid(): boolean {
		try {
			for (const held of this.assets.values()) this.asset(held.path);
			for (const held of this.revisions.values()) {
				const fresh = sourceTarget(this.root, held.path);
				if (fresh.file !== held.file || fresh.revision !== held.revision) return false;
			}
			return [...this.missing].every((path) => !existsSync(path));
		} catch {
			return false;
		}
	}
}

// Only a direct, immutable children return, optionally inside literal host
// wrappers. Calls, callbacks, aliases, cached elements and named slots need a
// separate value-flow proof. A matching lexical owner alone is insufficient.
function passesChildren(fn: Component): boolean {
	if (fn.type === "ClassMethod" || fn.params.length !== 1) return false;
	const param = fn.params[0];
	let local: string | undefined;
	if (param?.type === "ObjectPattern") {
		const child = param.properties.find(
			(p) => p.type === "ObjectProperty" && !p.computed && p.key.type === "Identifier" && p.key.name === "children",
		);
		if (child?.type === "ObjectProperty" && child.value.type === "Identifier") local = child.value.name;
	}
	const body =
		fn.body.type === "BlockStatement"
			? fn.body.body.length === 1 && fn.body.body[0]?.type === "ReturnStatement"
				? fn.body.body[0].argument
				: undefined
			: fn.body;
	let count = 0;
	const visit = (node: Node): boolean => {
		if (
			(node.type === "Identifier" && local === node.name) ||
			(node.type === "MemberExpression" &&
				!node.computed &&
				param?.type === "Identifier" &&
				node.object.type === "Identifier" &&
				node.object.name === param.name &&
				node.property.type === "Identifier" &&
				node.property.name === "children")
		) {
			count++;
			return true;
		}
		if (node.type === "JSXText") return node.value.trim() === "";
		if (node.type === "JSXExpressionContainer") return visit(node.expression);
		if (node.type === "JSXFragment") return node.children.every(visit);
		if (
			node.type !== "JSXElement" ||
			node.openingElement.name.type !== "JSXIdentifier" ||
			!/^[a-z]/.test(node.openingElement.name.name)
		)
			return false;
		if (
			node.openingElement.attributes.some(
				(attr) => attr.type !== "JSXAttribute" || (attr.value !== null && attr.value?.type !== "StringLiteral"),
			)
		)
			return false;
		return node.children.every(visit);
	};
	return !!body && visit(body) && count === 1;
}

function directBinding(site: Site, name?: string): string | undefined {
	const fn = owner(site);
	// A map callback may shadow the component's parameter with identical text.
	// It can share definition ownership, but cannot borrow that prop binding.
	const nearest = [...site.ancestors].reverse().find((node) => /Function|Method/.test(node.type));
	if (nearest?.start !== fn.start) return undefined;
	if (fn.type === "ClassMethod" || fn.params.length < 1 || fn.params.length > 2) return undefined;
	if (fn.body.type === "BlockStatement" && (fn.body.body.length !== 1 || fn.body.body[0]?.type !== "ReturnStatement"))
		return undefined;
	let mutates = false;
	walkNodes(fn, [], (node) => {
		if (
			[
				"AssignmentExpression",
				"UpdateExpression",
				"CallExpression",
				"NewExpression",
				"AwaitExpression",
				"YieldExpression",
			].includes(node.type)
		)
			mutates = true;
	});
	if (mutates) return undefined;
	let expression: Node | undefined;
	if (name === undefined) {
		const children = site.node.children.filter((n) => n.type !== "JSXText" || n.value.trim() !== "");
		if (children.length !== 1 || children[0]?.type !== "JSXExpressionContainer") return undefined;
		expression = children[0].expression;
	} else {
		const value = attribute(site, name)?.value;
		if (value?.type !== "JSXExpressionContainer") return undefined;
		expression = value.expression;
	}
	const param = fn.params[0];
	if (expression.type === "Identifier" && param?.type === "ObjectPattern") {
		const prop = param.properties.find(
			(n) =>
				n.type === "ObjectProperty" &&
				!n.computed &&
				n.value.type === "Identifier" &&
				n.value.name === expression.name,
		);
		if (prop?.type === "ObjectProperty" && prop.key.type === "Identifier") return prop.key.name;
	}
	if (
		expression.type === "MemberExpression" &&
		!expression.computed &&
		expression.object.type === "Identifier" &&
		expression.property.type === "Identifier" &&
		param?.type === "Identifier" &&
		param.name === expression.object.name
	)
		return expression.property.name;
	return undefined;
}

export function sourceRead(sources: Sources, selection: Selection, operation: Operation): Target {
	const sites = sources.chain(selection);
	let site = sites[0]!;
	let role: Target["role"] = "definition";
	let slot: Target["slot"] = "text";
	let name: string | undefined;
	let expected: string | null;
	let asset: Target["asset"];
	if (operation.kind === "text") {
		let value = literal(site);
		for (let i = 1; value === undefined && i < sites.length; i++) {
			const parameter = directBinding(site, name);
			if (!parameter) throw new Error("text is not a direct immutable parameter or literal");
			site = sites[i]!;
			name = parameter === "children" ? undefined : parameter;
			value = literal(site, name);
			role = "call-site";
		}
		if (value === undefined) throw new Error("data or transformed text is not inverted");
		expected = value;
		slot = name === undefined ? "text" : "attribute";
	} else if (operation.kind === "property") {
		const attr = attribute(site, "className");
		expected = attr === undefined ? null : (literal(site, "className") ?? null);
		if (attr !== undefined && expected === null) throw new Error("class expression is preserved");
		if (attribute(site, "style")) throw new Error("inline style ownership is outside this probe");
		slot = "class";
	} else if (operation.kind === "attribute") {
		name = operation.attribute;
		const attr = attribute(site, name);
		expected = attr === undefined ? null : (literal(site, name) ?? null);
		if (attr !== undefined && expected === null) throw new Error("attribute expression or boolean is preserved");
		slot = "attribute";
	} else if (operation.kind === "asset") {
		const tag = site.node.openingElement.name;
		if (tag.type !== "JSXIdentifier" || tag.name !== "img") throw new Error("asset target is not an authored img");
		const attr = attribute(site, "src");
		expected = attr === undefined ? null : (literal(site, "src") ?? null);
		if (attr?.value?.type === "JSXExpressionContainer") {
			const expression = attr.value.expression;
			if (expression.type !== "Identifier") throw new Error("image expression is not a direct imported binding");
			const declaration = site.unit.ast.program.body.find(
				(n) =>
					n.type === "ImportDeclaration" &&
					n.specifiers.some((s) => s.type === "ImportDefaultSpecifier" && s.local.name === expression.name),
			);
			if (declaration?.type !== "ImportDeclaration") throw new Error("image identifier is not an imported asset");
			// A local shadow or assignment cannot borrow an import's authority.
			let shadowed = false;
			walkNodes(site.unit.ast, [], (n, ancestors) => {
				if (
					ancestors.some((a) => /Function|Method/.test(a.type)) &&
					(n.type === "VariableDeclarator" || /Function|Method/.test(n.type) || n.type === "CatchClause") &&
					getBindingIdentifiers(n)[expression.name]
				)
					shadowed = true;
			});
			if (shadowed) throw new Error("image binding may be shadowed");
			const specifier = declaration.source.value;
			if (!specifier.startsWith(".") && !specifier.startsWith("shared/"))
				throw new Error("image import is outside the project");
			asset = {
				...sources.asset(specifier.startsWith("shared/") ? specifier : join(dirname(site.unit.path), specifier)),
				identifier: expression.name,
				specifier,
			};
			expected = expression.name;
		} else if (attr?.value && expected === null) throw new Error("image source is unproven");
		slot = "attribute";
		name = "src";
	} else {
		// A component's single returned host is governed by its nearest call;
		// an inner authored child stays in its definition.
		if (
			(site.ancestors.at(-1)?.type === "ReturnStatement" ||
				site.ancestors.at(-1)?.type === "ArrowFunctionExpression") &&
			sites[1]
		) {
			site = sites[1];
			role = "call-site";
		}
		const parent = site.ancestors.at(-1);
		if (parent?.type !== "JSXElement" && parent?.type !== "JSXFragment")
			throw new Error("not a complete authored JSX child; generated rows are refused");
		if (operation.kind === "reorder") {
			const children = parent.children.filter((n) => n.type !== "JSXText" || n.value.trim() !== "");
			if (children.length < 2 || children.some((n) => n.type !== "JSXElement"))
				throw new Error("only complete authored siblings can reorder");
		}
		expected = site.unit.text.slice(site.node.start!, site.node.end!);
		slot = "child";
	}
	return {
		address: address(site),
		source: site.source,
		role,
		slot,
		...(name === undefined ? {} : { attribute: name }),
		expected,
		scope: operation.kind === "property" ? operation.scope : "",
		repeated: [...sites, ...selection.chain.map((call) => sources.site(call.source))].some((s) =>
			mapped(s.ancestors),
		),
		...(asset ? { asset } : {}),
	};
}

export function witnesses(sources: Sources, target: Target) {
	const site = sources.site(target.source);
	const enclosing = owner(site);
	const opening = site.node.openingElement;
	return {
		opening: { start: opening.start!, end: opening.end! },
		enclosing: { start: enclosing.start!, end: enclosing.end! },
		// Snapshot witnesses are discovered, but they do not supply a journal or
		// establish continuity across replacement. Transaction work owns that.
		kind: "snapshot ranges; invalidate on any source revision" as const,
	};
}

function mapped(ancestors: readonly Node[]): boolean {
	return ancestors.some(
		(node) =>
			node.type === "CallExpression" &&
			node.callee.type === "MemberExpression" &&
			node.callee.property.type === "Identifier" &&
			node.callee.property.name === "map",
	);
}

// Dependency candidates and bound references are deliberately different lists.
// This traverses only requested entries, not a persistent library index.
export function reach(sources: Sources, entries: readonly string[], target: Address) {
	const potential: string[] = [];
	const references: { source: string; repeated: boolean; conditional: boolean }[] = [];
	const unknown: string[] = [];
	const scanned = new Set<string>();
	for (const entry of entries) {
		const visited = new Set<string>();
		const visit = (unit: Unit): void => {
			if (visited.has(unit.file)) return;
			visited.add(unit.file);
			for (const statement of unit.ast.program.body) {
				if (
					!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(statement.type) ||
					!("source" in statement) ||
					!statement.source
				)
					continue;
				if (statement.source.value === "react" || statement.source.value === "react-dom") continue;
				try {
					visit(sources.resolve(unit, statement.source.value));
				} catch {
					unknown.push(`${unit.path}: ${statement.source.value}`);
				}
			}
			if (scanned.has(unit.file)) return;
			scanned.add(unit.file);
			walkNodes(unit.ast, [], (node, ancestors) => {
				if (
					node.type !== "JSXElement" ||
					(node.openingElement.name.type !== "JSXMemberExpression" &&
						(node.openingElement.name.type !== "JSXIdentifier" || !/^[A-Z]/.test(node.openingElement.name.name)))
				)
					return;
				const source = `${unit.path}:${node.loc!.start.line}:${node.loc!.start.column + 1}`;
				try {
					const bound = sources.callee({ unit, node, ancestors, source });
					if (bound.unit.file === target.file && bound.fn.start! <= target.start && bound.fn.end! >= target.end)
						references.push({
							source,
							repeated: mapped(ancestors),
							conditional: ancestors.some(
								(n) =>
									n.type === "LogicalExpression" ||
									n.type === "ConditionalExpression" ||
									n.type === "IfStatement",
							),
						});
				} catch {
					unknown.push(source);
				}
			});
		};
		visit(sources.read(entry));
		if (visited.has(target.file)) potential.push(relative("frames", entry));
	}
	return {
		potential,
		references,
		unknown,
		coverage: "requested entries only; other frames and future states unknown",
	};
}
