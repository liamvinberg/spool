import { createRequire } from "node:module";
import { join } from "node:path";
import type { NodePath, default as Traverse } from "@babel/traverse";
import type { Node, Program } from "@babel/types";
import { designRelativePath } from "./design-path";
import type { FrameGraph } from "./flows";
import { createSourcePass, type NavSite, resolveFrameDir, type UnreadableSite } from "./nav-sites";
import { componentInputs, targets } from "./publication-values";

const { default: traverse } = createRequire(import.meta.url)("@babel/traverse") as { default: typeof Traverse };
export interface PublicationSource {
	sites: NavSite[];
	unreadable: UnreadableSite[];
	links: FrameGraph["links"];
	invalidLinks: FrameGraph["invalidLinks"];
	failures: { path: string; line: number; reason: string }[];
}

/** A bounded lexical slice. Dynamic values require the frame's enforced links set. */
export function publicationSource(root: string, frame: string, _graph: FrameGraph): PublicationSource {
	const out: PublicationSource = {
		sites: [],
		unreadable: [],
		links: undefined,
		invalidLinks: undefined,
		failures: [],
	};
	const at = resolveFrameDir(root, frame);
	if (at === undefined) return out;
	const designDir = at.designDir;
	const pass = createSourcePass(designDir);
	const entry = join(at.frameDir, "frame.tsx");
	const parsed = pass.parsed(entry);
	out.links = parsed?.links;
	out.invalidLinks = parsed?.invalidLinks;
	const modules = new Map<string, NodePath<Program>>();
	const visited = new Set<Node>();
	const exports = new Map<string, NodePath | undefined>();
	const mounts: { component: NodePath; attributes: NodePath[] }[] = [];
	const navigations: { file: string; path: NodePath; value: NodePath | undefined; via: NavSite["via"] }[] = [];
	const queue: { file: string; path: NodePath }[] = [];
	function failure(file: string, node: Node | undefined, reason: string) {
		out.failures.push({ path: designRelativePath(designDir, file), line: node?.loc?.start.line ?? 1, reason });
	}
	function module(file: string): NodePath<Program> | undefined {
		const cached = modules.get(file);
		if (cached !== undefined) return cached;
		const program = pass.parsed(file)?.program;
		if (program === undefined) {
			failure(file, undefined, "Source could not be read or parsed.");
			return;
		}
		let found: NodePath<Program> | undefined;
		traverse(
			{ type: "File", program, comments: null, tokens: null },
			{
				Program(path) {
					found = path;
				},
			},
		);
		if (found !== undefined) {
			modules.set(file, found);
			for (const statement of found.get("body")) {
				if (statement.isExpressionStatement()) queue.push({ file, path: statement });
				const declaration = statement.isExportNamedDeclaration() ? statement.get("declaration") : statement;
				if (declaration.isVariableDeclaration())
					for (const item of declaration.get("declarations"))
						if (item.get("init").isCallExpression()) queue.push({ file, path: item });
				if (
					statement.isImportDeclaration() &&
					statement.node.specifiers.length === 0 &&
					pass.resolve(file, statement.node.source.value) !== undefined
				)
					unknown(file, statement);
			}
		}
		return found;
	}
	function imported(file: string, path: NodePath): NodePath | undefined {
		const parent = path.parentPath;
		if (!parent?.isImportDeclaration() || parent.node.importKind === "type") return;
		if (path.isImportSpecifier() && path.node.importKind === "type") return;
		const name = parent.node.source.value;
		if (name === "spool" || (!name.startsWith(".") && !name.startsWith("shared/"))) return;
		const target = pass.resolve(file, name);
		if (target === undefined) {
			failure(file, path.node, `Import "${name}" could not be resolved.`);
			return;
		}
		if (path.isImportNamespaceSpecifier()) {
			unknown(file, path);
			return;
		}
		return select(
			target,
			path.isImportDefaultSpecifier() ? "default" : path.isImportSpecifier() ? spelling(path.node.imported) : "",
		);
	}
	function reference(file: string, path: NodePath, name: string): NodePath | undefined {
		const binding = path.scope.getBinding(name);
		if (binding === undefined) return;
		if (
			binding.path.isImportSpecifier() ||
			binding.path.isImportDefaultSpecifier() ||
			binding.path.isImportNamespaceSpecifier()
		)
			return imported(file, binding.path);
		queue.push({ file, path: binding.path });
		return binding.path;
	}
	function select(file: string, name: string): NodePath | undefined {
		const key = `${file}\0${name}`;
		if (exports.has(key)) return exports.get(key);
		exports.set(key, undefined);
		const program = module(file);
		if (program === undefined) return;
		for (const statement of program.get("body")) {
			if (statement.isExportDefaultDeclaration() && name === "default") {
				const selected = statement.get("declaration");
				queue.push({ file, path: selected });
				exports.set(key, selected);
				return selected;
			}
			if (!statement.isExportNamedDeclaration() || statement.node.exportKind === "type") continue;
			const declaration = statement.get("declaration");
			if (declaration.node != null && name in declaration.getBindingIdentifiers()) {
				const binding = program.scope.getBinding(name);
				if (binding !== undefined) queue.push({ file, path: binding.path });
				exports.set(key, binding?.path);
				return binding?.path;
			}
			for (const specifier of statement.get("specifiers")) {
				if (!specifier.isExportSpecifier() || spelling(specifier.node.exported) !== name) continue;
				if (statement.node.source !== null && statement.node.source !== undefined) {
					const target = pass.resolve(file, statement.node.source.value);
					if (target === undefined) failure(file, statement.node, "Re-export could not be resolved.");
					else {
						const selected = select(target, spelling(specifier.node.local));
						exports.set(key, selected);
						return selected;
					}
				} else {
					const selected = reference(file, specifier, spelling(specifier.node.local));
					exports.set(key, selected);
					return selected;
				}
				return;
			}
		}
		failure(file, program.node, `Export "${name}" could not be attributed. Use a direct value export.`);
	}
	function unknown(file: string, path: NodePath, via: NavSite["via"] = "ui.go") {
		out.unreadable.push({ via, path: designRelativePath(designDir, file), line: path.node.loc?.start.line ?? 1 });
	}
	function navigation(file: string, path: NodePath, value: NodePath | undefined, via: NavSite["via"]) {
		navigations.push({ file, path, value, via });
	}

	function visit(file: string, path: NodePath) {
		if (visited.has(path.node)) {
			path.skip();
			return;
		}
		visited.add(path.node);
		if (path.isTSType()) {
			path.skip();
			return;
		}
		if (path.isReferencedIdentifier()) {
			reference(file, path, path.node.name);
			const binding = path.scope.getBinding(path.node.name)?.path;
			if (
				(binding?.isImportNamespaceSpecifier() || binding?.isImportDefaultSpecifier()) &&
				binding.parentPath.isImportDeclaration() &&
				binding.parentPath.node.source.value === "spool"
			)
				unknown(file, path);
			if (spoolUI(path)) {
				const parent = path.parentPath;
				if (!parent.isMemberExpression() || parent.node.computed || !parent.get("property").isIdentifier())
					unknown(file, path);
				else if (
					parent.get("property").isIdentifier({ name: "go" }) &&
					!(parent.parentPath.isCallExpression() && parent.key === "callee")
				)
					unknown(file, parent);
			}
		}
		if (path.isJSXOpeningElement()) {
			const name = path.get("name");
			if (name.isJSXIdentifier() && /^[A-Z]/.test(name.node.name)) {
				const component = reference(file, name, name.node.name);
				if (component !== undefined) mounts.push({ component, attributes: path.get("attributes") });
			} else if (name.isJSXMemberExpression()) unknown(file, name);
		}
		if (path.isJSXAttribute() && path.get("name").isJSXIdentifier({ name: "data-go" })) {
			const value = path.get("value");
			navigation(
				file,
				path,
				value.isJSXExpressionContainer()
					? value.get("expression")
					: value.node == null
						? undefined
						: (value as NodePath),
				"data-go",
			);
		}
		if (path.isJSXSpreadAttribute()) unknown(file, path, "data-go");
		if (path.isCallExpression()) {
			const callee = path.get("callee");
			if (callee.isImport()) unknown(file, path);
			if (callee.isMemberExpression() && spoolUI(callee.get("object"))) {
				const prop = callee.get("property");
				if (
					(!callee.node.computed && prop.isIdentifier({ name: "go" })) ||
					(callee.node.computed && prop.isStringLiteral({ value: "go" }))
				)
					navigation(file, path, path.get("arguments")[0], "ui.go");
				else if (callee.node.computed) unknown(file, path);
			}
		}
	}
	select(entry, "default");
	for (let i = 0; i < queue.length; i++) {
		const item = queue[i];
		if (item === undefined || visited.has(item.path.node)) continue;
		visit(item.file, item.path);
		item.path.traverse({
			enter(path) {
				if (
					path.isFunctionDeclaration() ||
					(path.isVariableDeclarator() &&
						(path.get("init").isArrowFunctionExpression() || path.get("init").isFunctionExpression()))
				) {
					path.skip();
					return;
				}
				visit(item.file, path);
			},
		});
	}
	const inputs = componentInputs(mounts);
	for (const { file, path, value, via } of navigations) {
		const read = value === undefined ? undefined : targets(value, new Set(), inputs);
		const site = { via, path: designRelativePath(designDir, file), line: path.node.loc?.start.line ?? 1 };
		if (read === undefined || read.includes(undefined)) unknown(file, path, via);
		for (const target of read ?? []) if (target !== undefined) out.sites.push({ ...site, target });
	}
	return out;
}

function spelling(node: Node): string {
	return node.type === "Identifier" ? node.name : node.type === "StringLiteral" ? node.value : "";
}
function spoolUI(path: NodePath): boolean {
	if (!path.isIdentifier()) return false;
	const binding = path.scope.getBinding(path.node.name)?.path;
	return (
		binding?.isImportSpecifier() === true &&
		spelling(binding.node.imported) === "ui" &&
		binding.node.importKind !== "type" &&
		binding.parentPath.isImportDeclaration() &&
		binding.parentPath.node.importKind !== "type" &&
		binding.parentPath.node.source.value === "spool"
	);
}
