import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { parse } from "@babel/parser";
import {
	type ArrowFunctionExpression,
	type CallExpression,
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
import type { LazyChoice } from "./lazy-witness";
import { type Binding, ModuleBindings } from "./module-bindings";
import { elementAt, sourceTarget } from "./targets";
import type { ValueSnapshot } from "./value-flow";

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
export interface Creation extends Omit<Site, "node"> {
	node: JSXElement | CallExpression;
}
export interface Call {
	source: string;
	occurrence: string;
	passedChild?: boolean;
	element?: number;
	retainedProps?: boolean;
	renderedSource?: string;
	values?: ValueSnapshot | undefined;
	renderedValues?: ValueSnapshot | undefined;
	transportedFields?: string[];
	lazyResolved?: boolean;
	lazyChoice?: LazyChoice;
}
export interface Selection {
	generation: string;
	occurrence: string;
	source: string;
	element?: number;
	values?: ValueSnapshot | undefined;
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
	syntax?: "react-call";
	asset?: Revision & { identifier: string; specifier: string };
}

export function address(site: Site): Address {
	return { file: site.unit.file, start: site.node.start!, end: site.node.end! };
}
type Component = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression | ClassMethod;
type Definition = { unit: Unit; fn: Component; lazy?: boolean };
function owner(site: Pick<Site, "ancestors">): Component {
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
	directoryEntries: string[] | undefined;
	retainDirectory(): void {
		const entries = readdirSync(realDesignDir(this.root), { recursive: true }).map(String).sort();
		if (this.directoryEntries && JSON.stringify(this.directoryEntries) !== JSON.stringify(entries))
			throw new Error("dynamic import directory membership changed");
		this.directoryEntries = entries;
	}
	readonly bindings = new ModuleBindings<Unit>((unit, specifier) => this.resolve(unit, specifier));
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
	creation(source: string): Creation {
		const path = source.replace(/:\d+:\d+$/, "");
		if (!this.units.has(sourceTarget(this.root, path).file))
			throw new Error("creation is outside compiled source evidence");
		const unit = this.read(path);
		let found: Creation | undefined;
		walkNodes(unit.ast, [], (node, ancestors) => {
			if (
				(node.type === "JSXElement" || node.type === "CallExpression") &&
				`${path}:${node.loc!.start.line}:${node.loc!.start.column + 1}` === source
			)
				found = { unit, node, ancestors: [...ancestors], source };
		});
		if (!found) throw new Error("authored creation site was not found");
		return found;
	}
	valueCallee(source: string): Definition {
		const site = this.creation(source);
		if (site.node.type === "JSXElement") return this.callee({ ...site, node: site.node });
		verifyFactory(site, "create");
		const type = site.node.arguments[0];
		if (type?.type !== "Identifier")
			throw new Error("createElement type needs a verified authored component binding");
		let shadowed = false;
		walkNodes(site.unit.ast, [], (node, ancestors) => {
			if (
				ancestors.some((n) => /Function|Method/.test(n.type)) &&
				(node.type === "VariableDeclarator" || /Function|Method/.test(node.type) || node.type === "CatchClause") &&
				getBindingIdentifiers(node)[type.name]
			)
				shadowed = true;
		});
		if (shadowed) throw new Error("created component binding may be shadowed");
		return this.component(site.unit, type, new Set());
	}
	assertEntry(site: Creation): void {
		const entry = this.exported(site.unit, "default");
		if (entry.unit.file !== site.unit.file || entry.fn.start !== owner(site).start)
			throw new Error("factory ancestry does not reach the authored entry");
	}
	private component(unit: Unit, node: Node, seen: Set<string>, choice?: LazyChoice): Definition {
		if (
			node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression"
		)
			return { unit, fn: node };
		if (node.type === "Identifier") return this.local(unit, node.name, seen, choice);
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
			const method = node.body.body.find(
				(n) => n.type === "ClassMethod" && n.key.type === "Identifier" && n.key.name === "render" && !n.static,
			);
			if (method?.type === "ClassMethod") return { unit, fn: method };
		}
		if (node.type === "CallExpression" && node.callee.type === "Identifier") {
			const name = node.callee.name;
			const imported = unit.ast.program.body
				.flatMap((statement) =>
					statement.type === "ImportDeclaration" &&
					statement.source.value === "react" &&
					statement.importKind !== "type"
						? statement.specifiers
						: [],
				)
				.find(
					(binding) =>
						binding.type === "ImportSpecifier" && binding.importKind !== "type" && binding.local.name === name,
				);
			if (imported?.type === "ImportSpecifier" && imported.imported.type === "Identifier" && node.arguments[0]) {
				if (imported.imported.name === "lazy") {
					if (choice) {
						if (
							choice.loader.file !== unit.path ||
							choice.loader.start !== node.start ||
							choice.loader.end !== node.end
						)
							throw new Error("executed loader witness belongs to another source binding");
						if (!this.units.has(sourceTarget(this.root, choice.module).file))
							throw new Error("executed module is outside the admitted compiler inputs");
						const module = this.read(choice.module);
						return { ...this.exported(module, choice.export, seen), lazy: true };
					}
					return { ...this.lazyDefinition(unit, node.arguments[0], seen), lazy: true };
				}
				if (["memo", "forwardRef"].includes(imported.imported.name))
					return this.component(unit, node.arguments[0], seen, choice);
			}
		}
		throw new Error("wrapped, lazy or indirect definition is unproven");
	}
	private lazyDefinition(unit: Unit, loader: Node, seen: Set<string>): Definition {
		if (loader.type !== "ArrowFunctionExpression" || loader.params.length || loader.async)
			throw new Error("lazy loader must be a verified zero-argument expression");
		let body: Node = loader.body;
		let member = "default";
		if (
			body.type === "CallExpression" &&
			body.callee.type === "MemberExpression" &&
			!body.callee.computed &&
			body.callee.property.type === "Identifier" &&
			body.callee.property.name === "then"
		) {
			const projection = body.arguments[0];
			if (
				body.arguments.length !== 1 ||
				projection?.type !== "ArrowFunctionExpression" ||
				projection.async ||
				projection.params.length !== 1 ||
				projection.params[0]?.type !== "Identifier" ||
				projection.body.type !== "ObjectExpression" ||
				projection.body.properties.length !== 1
			)
				throw new Error("lazy export projection is unproven");
			const property = projection.body.properties[0];
			if (
				property?.type !== "ObjectProperty" ||
				property.computed ||
				property.key.type !== "Identifier" ||
				property.key.name !== "default" ||
				property.value.type !== "MemberExpression" ||
				property.value.computed ||
				property.value.object.type !== "Identifier" ||
				property.value.object.name !== projection.params[0].name ||
				property.value.property.type !== "Identifier"
			)
				throw new Error("lazy export projection is unproven");
			member = property.value.property.name;
			body = body.callee.object;
		}
		if (
			body.type === "CallExpression" &&
			body.callee.type === "Import" &&
			body.arguments.length === 1 &&
			body.arguments[0]?.type === "StringLiteral"
		)
			return this.exported(this.resolve(unit, body.arguments[0].value), member, seen);
		if (
			body.type === "CallExpression" &&
			body.callee.type === "MemberExpression" &&
			!body.callee.computed &&
			body.callee.object.type === "Identifier" &&
			body.callee.object.name === "Promise" &&
			body.callee.property.type === "Identifier" &&
			body.callee.property.name === "resolve" &&
			body.arguments.length === 1 &&
			body.arguments[0]?.type === "Identifier"
		) {
			if (unit.ast.program.body.some((statement) => getBindingIdentifiers(statement).Promise))
				throw new Error("lazy Promise binding is shadowed");
			const binding = this.bindings.require(this.bindings.local(unit, body.arguments[0].name));
			if (binding.kind !== "namespace") throw new Error("lazy resolved value is not a verified namespace");
			return this.exported(binding.unit, member, seen);
		}
		throw new Error("conditional, dynamic or transformed lazy loader is unproven");
	}
	private local(unit: Unit, name: string, seen: Set<string>, choice?: LazyChoice): Definition {
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
				return this.component(unit, declaration, seen, choice);
			if (declaration?.type === "VariableDeclaration") {
				const variable = declaration.declarations.find((n) => n.id.type === "Identifier" && n.id.name === name);
				if (variable) {
					if (declaration.kind !== "const" || !variable.init)
						throw new Error("component variable is not immutable");
					return this.component(unit, variable.init, seen, choice);
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
			return this.exported(this.resolve(unit, statement.source.value), exported, seen, choice);
		}
		throw new Error("component binding is unresolved");
	}
	private definition(binding: Binding<Unit>, seen = new Set<string>(), choice?: LazyChoice): Definition {
		if (binding.kind === "namespace") throw new Error("namespace is not a component definition");
		return binding.kind === "default"
			? this.component(binding.unit, binding.node, seen, choice)
			: this.local(binding.unit, binding.name, seen, choice);
	}
	private exported(unit: Unit, name: string, seen = new Set<string>(), choice?: LazyChoice): Definition {
		return this.definition(this.bindings.require(this.bindings.exported(unit, name)), seen, choice);
	}
	callee(site: Site, choice?: LazyChoice): Definition {
		const tag = site.node.openingElement.name;
		const members: string[] = [];
		let base = tag;
		while (base.type === "JSXMemberExpression") {
			members.unshift(base.property.name);
			base = base.object;
		}
		const name = base.type === "JSXIdentifier" ? base.name : undefined;
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
		if (members.length) {
			let binding = this.bindings.require(this.bindings.local(site.unit, name));
			for (const member of members) {
				if (binding.kind !== "namespace") throw new Error("member is not a verified namespace import");
				binding = this.bindings.require(this.bindings.exported(binding.unit, member));
			}
			return this.definition(binding, new Set(), choice);
		}
		return this.local(site.unit, name, new Set(), choice);
	}
	chain(selection: Selection): Site[] {
		if (selection.refusal) throw new Error(selection.refusal);
		const leaf = this.site(selection.source);
		let current = leaf;
		let transported = leaf;
		const sites: Site[] = [leaf];
		for (const call of [...selection.chain].reverse()) {
			const site = this.site(call.source);
			const actual = this.callee(site, call.lazyChoice);
			if (actual.lazy && !call.lazyResolved) throw new Error("lazy export lacks a committed resolved-type witness");
			if (actual.unit.file !== current.unit.file || actual.fn.start !== owner(current).start) {
				// Transport is separate from authorship. Prove both the exact
				// incoming element identity and the bounded source forwarding form.
				const direct =
					call.passedChild &&
					site.node.children.some(
						(child) => child.start === transported.node.start && child.end === transported.node.end,
					) &&
					passesChildren(actual.fn);
				const slot = call.transportedFields?.length === 1 ? call.transportedFields[0] : undefined;
				const indirect =
					slot !== undefined &&
					!call.retainedProps &&
					passesSlot(actual.fn, slot) &&
					containsSlot(site, transported, slot);
				if (site.unit.file !== transported.unit.file || (!direct && !indirect)) {
					const returned = actual.fn.body.type === "BlockStatement" ? actual.fn.body.body.at(-1) : undefined;
					if (
						returned?.type === "ReturnStatement" &&
						returned.argument?.type === "MemberExpression" &&
						returned.argument.object.type === "Identifier" &&
						returned.argument.object.name === "globalThis"
					)
						throw new Error(
							"cache return lacks committed read-to-occurrence and uninterrupted slot-lifetime evidence",
						);
					throw new Error("mounted call relationship is not a verified children passthrough");
				}
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
			if (this.directoryEntries) this.retainDirectory();
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
	return passesSlot(fn, "children", false);
}
function passesSlot(fn: Component, slot: string, conditional = true): boolean {
	if (fn.type === "ClassMethod" || fn.params.length !== 1) return false;
	const param = fn.params[0];
	let local: string | undefined;
	if (param?.type === "ObjectPattern") {
		const child = param.properties.find(
			(p) => p.type === "ObjectProperty" && !p.computed && p.key.type === "Identifier" && p.key.name === slot,
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
				node.property.name === slot)
		) {
			count++;
			return true;
		}
		if (conditional && node.type === "ConditionalExpression") {
			// Only inspect the branches for slot transport. Conditions may read a
			// parameter, but cannot call code or mutate the transported inputs.
			const parameterField = (part: Node): boolean =>
				param?.type === "ObjectPattern"
					? part.type === "Identifier" &&
						param.properties.some(
							(p) =>
								p.type === "ObjectProperty" &&
								!p.computed &&
								p.value.type === "Identifier" &&
								p.value.name === part.name,
						)
					: param?.type === "Identifier" &&
						part.type === "MemberExpression" &&
						!part.computed &&
						part.object.type === "Identifier" &&
						part.object.name === param.name &&
						part.property.type === "Identifier";
			const safe = parameterField(node.test) && parameterField(node.consequent) && parameterField(node.alternate);
			const before = count;
			const matches = visit(node.consequent);
			const firstCount = count;
			count = before;
			const other = visit(node.alternate);
			count = Math.max(firstCount, count);
			return (
				safe &&
				(matches || other) &&
				[node.consequent, node.alternate].every((n) => n.type === "Identifier" || n.type === "MemberExpression")
			);
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

function containsSlot(call: Site, transported: Site, slot: string): boolean {
	const matches = (node: Node): boolean => {
		if (node.start === transported.node.start && node.end === transported.node.end) return true;
		if (node.type === "JSXExpressionContainer") return matches(node.expression);
		if (node.type === "ConditionalExpression") return matches(node.consequent) || matches(node.alternate);
		return false;
	};
	if (slot === "children") return call.node.children.some(matches);
	const attr = attribute(call, slot);
	return attr?.value?.type === "JSXExpressionContainer" && matches(attr.value.expression);
}

function retainedLiteral(call: Call | undefined, field: string, site: Site): boolean {
	if (!call?.retainedProps) return true;
	const current = call.values?.fields[field];
	const rendered = call.renderedValues?.fields[field];
	const text = literal(site, field === "children" ? undefined : field);
	// Same expression in the same admitted source snapshot, plus exact render
	// input ancestry. A different equal-valued call never passes this proof.
	return (
		text !== undefined &&
		current?.origin.kind === "jsx" &&
		rendered?.origin.kind === "jsx" &&
		current.origin.source === site.source &&
		rendered.origin.source === site.source &&
		current.value === text &&
		rendered.value === text
	);
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

function verifyFactory(site: Creation, kind: "clone" | "create" | "key"): void {
	if (site.node.type !== "CallExpression") throw new Error("React factory witness does not name a call expression");
	const callee = site.node.callee;
	const name =
		callee.type === "Identifier"
			? callee.name
			: callee.type === "MemberExpression" &&
					!callee.computed &&
					callee.object.type === "Identifier" &&
					callee.property.type === "Identifier" &&
					callee.property.name === "toArray"
				? callee.object.name
				: undefined;
	const expected = kind === "clone" ? "cloneElement" : kind === "create" ? "createElement" : "Children";
	const imported = site.unit.ast.program.body.some(
		(n) =>
			n.type === "ImportDeclaration" &&
			n.source.value === "react" &&
			n.specifiers.some(
				(s) =>
					s.type === "ImportSpecifier" &&
					s.local.name === name &&
					s.imported.type === "Identifier" &&
					s.imported.name === expected,
			),
	);
	if (!imported) throw new Error("React factory source binding is unproved");
	let shadowed = false;
	walkNodes(site.unit.ast, [], (node) => {
		if (
			name &&
			(node.type === "VariableDeclarator" || /Function|Method/.test(node.type) || node.type === "CatchClause") &&
			getBindingIdentifiers(node)[name]
		)
			shadowed = true;
	});
	if (shadowed) throw new Error("React factory binding may be shadowed");
}

function verifyFactoryInput(sources: Sources, value: ValueSnapshot, carrier: Call | undefined): void {
	if (value.kind !== "clone" && value.kind !== "key" && value.kind !== "create") return;
	if (value.kind === "create" && value.type.origin.source === value.source) return;
	const site = sources.creation(value.source);
	verifyFactory(site, value.kind);
	if (site.node.type !== "CallExpression") throw new Error("copy is not an authored factory call");
	const argument = site.node.arguments[0];
	const input =
		value.kind === "create" &&
		argument?.type === "MemberExpression" &&
		!argument.computed &&
		argument.property.type === "Identifier" &&
		argument.property.name === "type"
			? argument.object
			: argument;
	const typeSource = value.type?.origin.source;
	if (!input || !typeSource) throw new Error("copy has no authored input relationship");
	const original = sources.creation(typeSource);
	if (input.type === "JSXElement" && original.node.start === input.start && original.unit.file === site.unit.file)
		return;
	const fn = owner(site);
	const body =
		fn.body.type === "BlockStatement"
			? fn.body.body.length === 1 && fn.body.body[0]?.type === "ReturnStatement"
				? fn.body.body[0].argument
				: undefined
			: fn.body;
	if (body?.type !== "CallExpression" || body.start !== site.node.start || input.type !== "Identifier")
		throw new Error("copied input needs an immutable direct carrier proof");
	let effect = false;
	walkNodes(body, [], (node) => {
		if (
			["AssignmentExpression", "UpdateExpression", "NewExpression", "AwaitExpression", "YieldExpression"].includes(
				node.type,
			) ||
			(node.type === "CallExpression" && node.start !== body.start)
		)
			effect = true;
	});
	if (effect) throw new Error("copy arguments may mutate or replace the incoming field");
	const param = fn.params[0];
	if (param?.type !== "ObjectPattern") throw new Error("copied input is not a direct carrier parameter");
	const binding = param.properties.find(
		(p) => p.type === "ObjectProperty" && !p.computed && p.value.type === "Identifier" && p.value.name === input.name,
	);
	const field = binding?.type === "ObjectProperty" && binding.key.type === "Identifier" ? binding.key.name : undefined;
	if (!field || !carrier?.transportedFields?.includes(field) || carrier.retainedProps)
		throw new Error("copy has no committed incoming-slot relationship");
	const call = sources.creation(carrier.source);
	if (
		call.node.type !== "JSXElement" ||
		original.node.type !== "JSXElement" ||
		!containsSlot({ ...call, node: call.node }, { ...original, node: original.node }, field) ||
		call.unit.file !== original.unit.file
	)
		throw new Error("copy input author is not the verified authored slot child");
}

function factoryLiteral(site: Creation, field: string, kind: "clone" | "create"): string | undefined {
	verifyFactory(site, kind);
	if (site.node.type !== "CallExpression") return undefined;
	const args = site.node.arguments;
	if (args.some((arg) => arg.type === "SpreadElement"))
		throw new Error("spread factory arguments need evaluated slot evidence");
	if (field === "children" && args.length > 2)
		return args.length === 3 && args[2]?.type === "StringLiteral" ? args[2].value : undefined;
	const config = args[1];
	if (!config || config.type === "NullLiteral") return undefined;
	if (config.type !== "ObjectExpression")
		throw new Error("indirect factory config needs an authored field transport proof");
	if (config.properties.some((p) => p.type !== "ObjectProperty" || p.computed))
		throw new Error("factory spread, method or computed property needs an authored field transport proof");
	const fields = config.properties.filter(
		(p) =>
			p.type === "ObjectProperty" &&
			((p.key.type === "Identifier" && p.key.name === field) ||
				(p.key.type === "StringLiteral" && p.key.value === field)),
	);
	if (fields.length !== 1) throw new Error("factory field is absent or duplicated");
	const value = fields[0];
	return value?.type === "ObjectProperty" && value.value.type === "StringLiteral" ? value.value.value : undefined;
}

function factoryRead(sources: Sources, selection: Selection, operation: Operation): Target {
	if (selection.refusal) throw new Error(selection.refusal);
	const leaf = selection.values!;
	const calls = [...selection.chain].reverse();
	verifyFactoryInput(sources, leaf, calls[0]);
	calls.forEach((call, index) => {
		if (call.values) verifyFactoryInput(sources, call.values, calls[index + 1]);
	});
	let current = sources.creation(leaf.source);
	// Validate the creation's mounted owner separately from each field's author.
	// cloneElement preserves type; its creation lives in the carrier, while a
	// preserved field can still live at the original JSX in a different caller.
	for (const call of calls) {
		const value = call.values;
		if (!value) throw new Error("mounted creation has no per-field record");
		const type = value.type?.origin;
		if (!type?.source) throw new Error("mounted type has no authored creation relationship");
		const definition = sources.valueCallee(type.source);
		if (definition.unit.file !== current.unit.file || definition.fn.start !== owner(current).start) {
			const slot = call.transportedFields?.length === 1 ? call.transportedFields[0] : undefined;
			const field = slot ? value.fields[slot] : undefined;
			if (!slot || !field || call.retainedProps || !passesSlot(definition.fn, slot))
				throw new Error("factory output needs a verified slot or cache transport relationship");
			const author = sources.creation(field.origin.source);
			let contains = false;
			if (author.node.type === "JSXElement" && current.node.type === "JSXElement")
				contains = containsSlot({ ...author, node: author.node }, { ...current, node: current.node }, slot);
			else if (field.origin.kind === "clone" && author.node.type === "CallExpression") {
				verifyFactory(author, "clone");
				const config = author.node.arguments[1];
				if (
					config?.type === "ObjectExpression" &&
					config.properties.every((p) => p.type === "ObjectProperty" && !p.computed)
				) {
					const fields = config.properties.filter(
						(p) => p.type === "ObjectProperty" && p.key.type === "Identifier" && p.key.name === slot,
					);
					const entry = fields.length === 1 ? fields[0] : undefined;
					contains =
						entry?.type === "ObjectProperty" &&
						entry.value.type === "JSXElement" &&
						entry.value.start === current.node.start;
				}
			}
			if (!contains || author.unit.file !== current.unit.file)
				throw new Error("forwarded slot has no verified authored field edge");
			continue;
		}
		current = sources.creation(value.source);
		if (value.kind === "clone" || value.kind === "create" || value.kind === "key") verifyFactory(current, value.kind);
	}
	sources.assertEntry(current);
	if (operation.kind === "delete" || operation.kind === "reorder")
		throw new Error("factory structure needs an authored removal/reorder proof; removing a clone input can throw");
	if (operation.kind === "asset") throw new Error("factory assets need an imported-value source proof");
	let field =
		operation.kind === "text" ? "children" : operation.kind === "attribute" ? operation.attribute : "className";
	let cell = leaf.fields[field];
	let role: Target["role"] = "definition";
	// A direct immutable component parameter is the sole demonstrated bridge
	// from a rendered host field to that component's committed render inputs.
	const leafSite = sources.creation(leaf.source);
	if (
		operation.kind === "text" &&
		leafSite.node.type === "JSXElement" &&
		literal({ ...leafSite, node: leafSite.node }) === undefined
	) {
		const parameter = directBinding({ ...leafSite, node: leafSite.node });
		if (!parameter) throw new Error("text is not a direct immutable parameter or literal");
		const call = calls[0];
		if (!call) throw new Error("text has no committed input call");
		if (call.retainedProps) {
			const incoming = call.values?.fields[parameter],
				rendered = call.renderedValues?.fields[parameter];
			if (
				call.values?.type.origin.source !== call.renderedValues?.type.origin.source ||
				!incoming ||
				!rendered ||
				incoming.origin.source !== rendered.origin.source ||
				incoming.origin.kind !== rendered.origin.kind ||
				incoming.origin.field !== rendered.origin.field ||
				incoming.value !== rendered.value ||
				JSON.stringify(incoming.origin.via.map((e) => [e.kind, e.source, e.replaced])) !==
					JSON.stringify(rendered.origin.via.map((e) => [e.kind, e.source, e.replaced]))
			)
				throw new Error(
					"retained factory inputs differ in authored field ancestry; writable owner remains unproved",
				);
			if (call.renderedValues) verifyFactoryInput(sources, call.renderedValues, calls[1]);
		}
		field = parameter;
		cell = call.renderedValues?.fields[field];
		role = "call-site";
	}
	if (!cell?.origin.source || cell.origin.kind === "unknown")
		throw new Error("selected field has no authored value origin");
	// Validate every actual replacement along this field's path, even when the
	// final source is JSX. No equality-based copy inference enters this path.
	for (const edge of cell.origin.via)
		if (edge.kind === "clone" || edge.kind === "create" || edge.kind === "key")
			verifyFactory(sources.creation(edge.source), edge.kind);
	const origin = sources.creation(cell.origin.source);
	let expected: string | undefined;
	if (origin.node.type === "JSXElement")
		expected = literal({ ...origin, node: origin.node }, field === "children" ? undefined : field);
	else if (cell.origin.kind === "clone" || cell.origin.kind === "create")
		expected = factoryLiteral(origin, field, cell.origin.kind);
	if (expected === undefined)
		throw new Error("authored field is not a supported literal; expression and inline-style ownership is preserved");
	if (cell.value !== expected) throw new Error("committed input differs from the authored field literal");
	// An overriding clone field belongs to the carrier definition; a preserved
	// JSX prop stays at its own authored call site.
	if (cell.origin.kind === "clone") role = "definition";
	return {
		address: { file: origin.unit.file, start: origin.node.start!, end: origin.node.end! },
		source: origin.source,
		role,
		slot: operation.kind === "property" ? "class" : field === "children" ? "text" : "attribute",
		...(field === "children" ? {} : { attribute: field }),
		expected,
		scope: operation.kind === "property" ? operation.scope : "",
		repeated: [origin, current, ...calls.map((c) => sources.creation(c.source))].some((s) => mapped(s.ancestors)),
		...(origin.node.type === "CallExpression" ? { syntax: "react-call" as const } : {}),
	};
}

export function sourceRead(sources: Sources, selection: Selection, operation: Operation): Target {
	if (
		selection.values &&
		[selection.values, ...selection.chain.map((call) => call.values)].some((value) => value && value.kind !== "jsx")
	)
		return factoryRead(sources, selection, operation);
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
			if (
				!retainedLiteral(
					selection.chain.find((call) => call.source === sites[i]!.source),
					parameter,
					sites[i]!,
				)
			)
				throw new Error("committed call is known but retained render props need a per-value origin proof");
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
	const site = sources.creation(target.source);
	const enclosing = owner(site);
	const opening = site.node.type === "JSXElement" ? site.node.openingElement : site.node;
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
