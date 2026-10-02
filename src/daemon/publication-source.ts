import { extname, join } from "node:path";
import traverseModule, { type NodePath } from "@babel/traverse";
import type { Node, ObjectProperty, Program } from "@babel/types";
import { ASSET_EXTENSIONS, TEXT_EXTENSIONS } from "./assets";
import { designRelativePath } from "./design-path";
import type { FrameGraph } from "./flows";
import { createSourcePass, type NavSite, resolveFrameDir, type UnreadableSite } from "./nav-sites";
import { componentInputs, type Mount, targets } from "./publication-values";

// CommonJS with an `exports.default`: Node and the published bundle import the
// whole module object, vitest unwraps it to the function.
const traverse: typeof traverseModule =
	typeof traverseModule === "function"
		? traverseModule
		: (traverseModule as unknown as { default: typeof traverseModule }).default;
/** What kind of source hides navigation, so a diagnostic can name that form and its fix. */
export type UnreadableReason =
	| "destination"
	| "go-value"
	| "ui-value"
	| "spool-namespace"
	| "dynamic-import"
	| "local-namespace"
	| "side-effect-import"
	| "data-go-unread";

export interface PublicationSource {
	sites: NavSite[];
	unreadable: (UnreadableSite & { reason: UnreadableReason })[];
	links: FrameGraph["links"];
	invalidLinks: FrameGraph["invalidLinks"];
	failures: { path: string; line: number; reason: string; remedy: string }[];
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
	const mounts: Mount[] = [];
	const navigations: { file: string; path: NodePath; value: NodePath | undefined; via: NavSite["via"] }[] = [];
	const queue: { file: string; path: NodePath }[] = [];
	function failure(file: string, node: Node | undefined, reason: string, remedy: string) {
		const path = designRelativePath(designDir, file);
		const line = node?.loc?.start.line ?? 1;
		// every use of a broken import reaches it again; it is one problem
		if (out.failures.some((known) => known.path === path && known.line === line && known.reason === reason)) return;
		out.failures.push({ path, line, reason, remedy });
	}
	function module(file: string): NodePath<Program> | undefined {
		const cached = modules.get(file);
		if (cached !== undefined) return cached;
		const program = pass.parsed(file)?.program;
		if (program === undefined) {
			failure(file, undefined, "Source could not be read or parsed.", "Fix the syntax error in this file.");
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
					unknown(file, statement, "side-effect-import");
			}
		}
		return found;
	}
	function imported(file: string, path: NodePath): NodePath | undefined {
		const parent = path.parentPath;
		if (!parent?.isImportDeclaration() || parent.node.importKind === "type") return;
		if (path.isImportSpecifier() && path.node.importKind === "type") return;
		// a `?raw`-style suffix names the same file to esbuild, so it changes nothing here
		const name = parent.node.source.value.replace(/[?#].*$/u, "");
		const extension = extname(name).toLowerCase();
		if (
			ASSET_EXTENSIONS.has(extension) ||
			TEXT_EXTENSIONS.has(extension) ||
			extension === ".json" ||
			extension === ".css"
		)
			return;
		if (name === "spool" || (!name.startsWith(".") && !name.startsWith("shared/"))) return;
		const target = pass.resolve(file, name);
		if (target === undefined) {
			failure(
				file,
				path.node,
				`Import "${name}" could not be resolved.`,
				"Check the import path, or create the file it names.",
			);
			return;
		}
		if (path.isImportNamespaceSpecifier()) {
			unknown(file, path, "local-namespace");
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
					if (target === undefined)
						failure(
							file,
							statement.node,
							"Re-export could not be resolved.",
							"Check the re-export's path, or create the file it names.",
						);
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
		failure(
			file,
			program.node,
			name === "default"
				? "There is no default export in this file."
				: `"${name}" is not exported by name from this file.`,
			name === "default"
				? "Add `export default` to the component the import expects."
				: `Export it directly, as in \`export const ${name} = …\` or \`export { ${name} }\`.`,
		);
	}
	function unknown(file: string, path: NodePath, reason: UnreadableReason, via: NavSite["via"] = "ui.go") {
		out.unreadable.push({
			via,
			reason,
			path: designRelativePath(designDir, file),
			line: path.node.loc?.start.line ?? 1,
		});
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
				unknown(file, path, "spool-namespace");
			if (spoolUI(path)) {
				const parent = path.parentPath;
				if (!parent.isMemberExpression() || parent.node.computed || !parent.get("property").isIdentifier())
					unknown(file, path, "ui-value");
				else if (
					parent.get("property").isIdentifier({ name: "go" }) &&
					!(parent.parentPath.isCallExpression() && parent.key === "callee")
				)
					unknown(file, parent, "go-value");
			}
		}
		if (path.isJSXOpeningElement()) {
			const name = path.get("name");
			if (name.isJSXIdentifier() && /^[A-Z]/.test(name.node.name)) {
				const component = reference(file, name, name.node.name);
				if (component !== undefined) mounts.push({ component, attributes: path.get("attributes") });
			} else if (name.isJSXMemberExpression()) {
				// `<motion.div>` or `<Dialog.Root>` is a value like any other: follow
				// its root binding, which reaches whatever project code it names, and
				// mount what the member names so its props are read like a plain tag's
				const members = [name.node.property.name];
				let object = name.get("object");
				while (object.isJSXMemberExpression()) {
					members.unshift(object.node.property.name);
					object = object.get("object");
				}
				const root = object.isJSXIdentifier() ? reference(file, object, object.node.name) : undefined;
				if (root !== undefined) mounts.push({ component: root, members, attributes: path.get("attributes") });
			}
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
		// data-go reaches an element only by being spelled: in JSX, as a literal
		// object key a spread carries, as a literal setAttribute name or through
		// dataset.go. Those are read where they are spelled; any other spelling of
		// the name, or a dataset write by computed name, cannot be read.
		if (path.isObjectProperty() && dataGoKey(path)) navigation(file, path, path.get("value"), "data-go");
		const dataset = path.isAssignmentExpression() ? datasetWrite(path.get("left")) : undefined;
		if (dataset === "go") navigation(file, path, path.get("right"), "data-go");
		else if (dataset === "unknown") unknown(file, path, "data-go-unread", "data-go");
		if (path.isCallExpression() || path.isOptionalCallExpression()) {
			const [first, second] = path.get("arguments") as NodePath[];
			const method = calledMethod(path);
			if (method === "setAttribute" && first?.isStringLiteral({ value: "data-go" }))
				navigation(file, path, second, "data-go");
			if (method === "assign" && first !== undefined && datasetWrite(first, true) === "unknown")
				unknown(file, path, "data-go-unread", "data-go");
		}
		if (
			((path.isStringLiteral() && path.node.value === "data-go") ||
				(path.isTemplateElement() && path.node.value.raw === "data-go")) &&
			!readDataGo(path)
		)
			unknown(file, path, "data-go-unread", "data-go");
		// Markup built as text reaches the page through an HTML sink. Text the walk
		// can read is checked for the attribute; markup read back from the page was
		// put there by code this walk reads, so other values are not followed.
		const html = htmlSink(path);
		if (html !== undefined && DATA_GO.test(markupText(html))) unknown(file, path, "data-go-unread", "data-go");
		if (path.isCallExpression()) {
			const callee = path.get("callee");
			if (callee.isImport()) unknown(file, path, "dynamic-import");
			if (callee.isMemberExpression() && spoolUI(callee.get("object"))) {
				const prop = callee.get("property");
				if (
					(!callee.node.computed && prop.isIdentifier({ name: "go" })) ||
					(callee.node.computed && prop.isStringLiteral({ value: "go" }))
				)
					navigation(file, path, path.get("arguments")[0], "ui.go");
				else if (callee.node.computed) unknown(file, path, "ui-value");
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
		if (read === undefined || read.includes(undefined)) unknown(file, path, "destination", via);
		for (const target of read ?? []) if (target !== undefined) out.sites.push({ ...site, target });
	}
	return out;
}

const DATA_GO = /\bdata-go\b/u;
/** Calls that only look for an attribute: a selector or a name they read, never write. */
const ATTRIBUTE_READS = new Set([
	"closest",
	"getAttribute",
	"hasAttribute",
	"matches",
	"querySelector",
	"querySelectorAll",
	"removeAttribute",
]);

function htmlSink(path: NodePath): NodePath | undefined {
	if (path.isAssignmentExpression()) {
		const left = path.get("left");
		if (
			left.isMemberExpression() &&
			!left.node.computed &&
			(left.get("property").isIdentifier({ name: "innerHTML" }) ||
				left.get("property").isIdentifier({ name: "outerHTML" }))
		)
			return path.get("right");
	}
	if ((path.isCallExpression() || path.isOptionalCallExpression()) && calledMethod(path) === "insertAdjacentHTML")
		return (path.get("arguments") as NodePath[])[1];
	if (path.isObjectProperty() && !path.node.computed && spelling(path.node.key) === "__html") return path.get("value");
}
/** The text of a literal, a template's fixed parts, or a const holding either. */
function markupText(path: NodePath): string {
	if (path.isStringLiteral()) return path.node.value;
	if (path.isTemplateLiteral()) return path.node.quasis.map((quasi) => quasi.value.raw).join("");
	if (path.isIdentifier()) {
		const binding = path.scope.getBinding(path.node.name);
		if (binding?.kind === "const" && binding.path.isVariableDeclarator()) {
			const init = binding.path.get("init");
			if (init.isStringLiteral() || init.isTemplateLiteral()) return markupText(init);
		}
	}
	return "";
}
function dataGoKey(property: NodePath<ObjectProperty>): boolean {
	const key = property.get("key");
	return property.node.computed ? key.isStringLiteral({ value: "data-go" }) : spelling(key.node) === "data-go";
}
/** A string naming data-go where the walk already reads it, or where nothing is written. */
function readDataGo(path: NodePath): boolean {
	const parent = path.parentPath;
	if (parent?.isObjectProperty() && path.key === "key") return dataGoKey(parent);
	if ((parent?.isCallExpression() || parent?.isOptionalCallExpression()) && path.listKey === "arguments") {
		const method = calledMethod(parent);
		return (method === "setAttribute" && path.key === 0) || (method !== undefined && ATTRIBUTE_READS.has(method));
	}
	return false;
}
function calledMethod(call: NodePath): string | undefined {
	const callee = call.get("callee") as NodePath;
	if (!(callee.isMemberExpression() || callee.isOptionalMemberExpression()) || callee.node.computed) return;
	const property = callee.get("property") as NodePath;
	return property.isIdentifier() ? property.node.name : undefined;
}
/**
 * What a write through `element.dataset` names: `go`, another literal name, or
 * one it cannot tell. With `whole`, the dataset itself is the target, as in
 * `Object.assign(element.dataset, …)`.
 */
function datasetWrite(path: NodePath, whole = false): "go" | "other" | "unknown" | undefined {
	if (!path.isMemberExpression()) return;
	if (whole)
		return path.get("property").isIdentifier({ name: "dataset" }) && !path.node.computed ? "unknown" : undefined;
	const object = path.get("object");
	if (
		!object.isMemberExpression() ||
		object.node.computed ||
		!object.get("property").isIdentifier({ name: "dataset" })
	)
		return;
	const property = path.get("property");
	const name = path.node.computed
		? property.isStringLiteral()
			? property.node.value
			: undefined
		: property.isIdentifier()
			? property.node.name
			: undefined;
	return name === undefined ? "unknown" : name === "go" ? "go" : "other";
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
