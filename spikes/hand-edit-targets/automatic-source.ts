import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parse } from "@babel/parser";
import { type File, type FunctionDeclaration, getBindingIdentifiers, type JSXElement, type Node } from "@babel/types";
import { fingerprintOf } from "../../src/daemon/hand-write";
import { walkNodes } from "../../src/daemon/jsx-walk";
import { directParameter, elementAt, sourceTarget } from "./targets";

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
}
export interface Selection {
	generation: string;
	occurrence: string;
	source: string;
	chain: Call[];
}
export type Operation = { kind: "text" | "delete" | "reorder" } | { kind: "property"; property: string; scope: string };
export interface Target {
	address: Address;
	source: string;
	role: "definition" | "call-site";
	slot: "text" | "attribute" | "child" | "class";
	attribute?: string;
	expected: string | null;
	scope: string;
	repeated: boolean;
}

export function address(site: Site): Address {
	return { file: site.unit.file, start: site.node.start!, end: site.node.end! };
}
function owner(site: Site): FunctionDeclaration {
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
		throw new Error("only named function declarations and map callbacks have a proven owner");
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
	constructor(readonly root: string) {}
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
	callee(site: Site): { unit: Unit; fn: FunctionDeclaration } {
		const tag = site.node.openingElement.name;
		if (tag.type !== "JSXIdentifier" || !/^[A-Z]/.test(tag.name)) throw new Error("not a direct component binding");
		const name = tag.name;
		// Refuse possible local shadowing conservatively, even in another block.
		let shadowed = false;
		walkNodes(site.unit.ast, [], (node, ancestors) => {
			if (!ancestors.some((n) => /Function|Method/.test(n.type))) return;
			if (
				(node.type === "VariableDeclarator" || /Function|Method/.test(node.type) || node.type === "CatchClause") &&
				getBindingIdentifiers(node)[name]
			)
				shadowed = true;
		});
		for (const ancestor of site.ancestors) {
			if (/Function|Method/.test(ancestor.type) && getBindingIdentifiers(ancestor)[name]) shadowed = true;
		}
		if (shadowed) throw new Error("component binding may be shadowed");
		for (const statement of site.unit.ast.program.body) {
			const local =
				statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
					? statement.declaration
					: statement;
			if (local?.type === "FunctionDeclaration" && local.id?.name === name) return { unit: site.unit, fn: local };
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
			const unit = this.resolve(site.unit, statement.source.value);
			for (const declaration of unit.ast.program.body) {
				if (
					declaration.type === "ExportDefaultDeclaration" &&
					exported === "default" &&
					declaration.declaration.type === "FunctionDeclaration"
				)
					return { unit, fn: declaration.declaration };
				if (
					declaration.type === "ExportNamedDeclaration" &&
					declaration.declaration?.type === "FunctionDeclaration" &&
					declaration.declaration.id?.name === exported
				)
					return { unit, fn: declaration.declaration };
			}
			throw new Error("re-export, wrapped or indirect definition is unknown");
		}
		throw new Error("component binding is unresolved");
	}
	chain(selection: Selection): Site[] {
		const leaf = this.site(selection.source);
		let current = leaf;
		const sites: Site[] = [leaf];
		for (const call of [...selection.chain].reverse()) {
			const site = this.site(call.source);
			const actual = this.callee(site);
			if (actual.unit.file !== current.unit.file || actual.fn.start !== owner(current).start)
				throw new Error("mounted call relationship does not match the lexical binding");
			current = site;
			sites.push(site);
		}
		// The uninstrumented createElement entry must end at the frame export.
		const fn = owner(current);
		if (
			!current.unit.ast.program.body.some(
				(n) => n.type === "ExportDefaultDeclaration" && n.declaration.start === fn.start,
			)
		)
			throw new Error("call ancestry is incomplete");
		return sites;
	}
	valid(): boolean {
		try {
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

export function sourceRead(sources: Sources, selection: Selection, operation: Operation): Target {
	const sites = sources.chain(selection);
	let site = sites[0]!;
	let role: Target["role"] = "definition";
	let slot: Target["slot"] = "text";
	let name: string | undefined;
	let expected: string | null;
	if (operation.kind === "text") {
		let value = literal(site);
		for (let i = 1; value === undefined && i < sites.length; i++) {
			const parameter = directParameter(site.unit.text, site.source, name);
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
	} else {
		// A component's single returned host is governed by its nearest call;
		// an inner authored child stays in its definition.
		if (site.ancestors.at(-1)?.type === "ReturnStatement" && sites[1]) {
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
		repeated: sites.some((s) =>
			s.ancestors.some((n) => n.type === "CallExpression" || n.type === "ArrowFunctionExpression"),
		),
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
				if (statement.type !== "ImportDeclaration") continue;
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
					node.openingElement.name.type !== "JSXIdentifier" ||
					!/^[A-Z]/.test(node.openingElement.name.name)
				)
					return;
				const source = `${unit.path}:${node.loc!.start.line}:${node.loc!.start.column + 1}`;
				try {
					const bound = sources.callee({ unit, node, ancestors, source });
					if (bound.unit.file === target.file && bound.fn.start! <= target.start && bound.fn.end! >= target.end)
						references.push({
							source,
							repeated: ancestors.some((n) => n.type === "CallExpression"),
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
