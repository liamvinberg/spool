import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import { designRelativePath, realDesignDir } from "./design-path";
import type { FrameGraph } from "./flows";
import { type NavSite, parseNavSites, resolveFrameDir, resolveLocalImport, type UnreadableSite } from "./nav-sites";

export interface PublicationSource {
	sites: NavSite[];
	unreadable: UnreadableSite[];
	links: ReturnType<typeof parseNavSites>["links"];
	invalidLinks: ReturnType<typeof parseNavSites>["invalidLinks"];
	failures: { path: string; line: number; reason: string }[];
}

interface Selection {
	file: string;
	exported: string;
}
interface Range {
	start: number;
	end: number;
}

/** A bounded value-binding slice rooted at the frame's default export. */
export function publicationSource(root: string, frame: string, graph: FrameGraph): PublicationSource {
	const at = resolveFrameDir(root, frame);
	if (at === undefined) return { sites: [], unreadable: [], links: undefined, invalidLinks: undefined, failures: [] };
	const entry = join(at.frameDir, "frame.tsx");
	const designDir = realDesignDir(root);
	const selected = new Map<string, Range[]>();
	const failures: PublicationSource["failures"] = [];
	const queue: Selection[] = [{ file: entry, exported: "default" }];
	const seen = new Set<string>();
	while (queue.length > 0) {
		const item = queue.shift();
		if (item === undefined) continue;
		const key = `${item.file}\0${item.exported}`;
		if (seen.has(key)) continue;
		seen.add(key);
		selectExport(designDir, item, selected, queue, failures);
	}

	const entryPath = designRelativePath(designDir, entry);
	let entryParsed: ReturnType<typeof parseNavSites> = { sites: [], unreadable: [] };
	try {
		entryParsed = parseNavSites(readFileSync(entry, "utf8"), entryPath);
	} catch {
		/* failure is reported below */
	}
	const sites = graph.sites.filter((site) => {
		const file = join(designDir, site.path);
		const attributed =
			selected.get(file)?.some((range) => site.line >= range.start && site.line <= range.end) === true;
		if (!attributed || site.via !== "ui.go") return attributed;
		try {
			return /import\s*{[^}]*\bui\b[^}]*}\s*from\s*["']spool["']/.test(readFileSync(file, "utf8"));
		} catch {
			return false;
		}
	});
	const unreadable = graph.unreadable.filter((site) =>
		selected.get(join(designDir, site.path))?.some((range) => site.line >= range.start && site.line <= range.end),
	);
	return { sites, unreadable, links: entryParsed.links, invalidLinks: entryParsed.invalidLinks, failures };
}

function selectExport(
	designDir: string,
	selection: Selection,
	selected: Map<string, Range[]>,
	queue: Selection[],
	failures: PublicationSource["failures"],
): void {
	let source: string;
	try {
		source = readFileSync(selection.file, "utf8");
	} catch {
		failures.push({
			path: designRelativePath(designDir, selection.file),
			line: 1,
			reason: "Source could not be read.",
		});
		return;
	}
	let program: Extract<Node, { type: "Program" }>;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Extract<
			Node,
			{ type: "Program" }
		>;
	} catch {
		failures.push({
			path: designRelativePath(designDir, selection.file),
			line: 1,
			reason: "Source could not be parsed.",
		});
		return;
	}
	const imports = new Map<string, { file: string; exported: string }>();
	const bindings = new Map<string, Node>();
	let selectedNode: Node | undefined;
	for (const statement of program.body) {
		if (
			statement.type === "ImportDeclaration" &&
			statement.importKind !== "type" &&
			statement.source.type === "StringLiteral"
		) {
			const file = resolveLocalImport(designDir, selection.file, statement.source.value);
			if (file !== undefined)
				for (const specifier of statement.specifiers) {
					if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type")
						imports.set(specifier.local.name, {
							file,
							exported:
								specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value,
						});
					if (specifier.type === "ImportDefaultSpecifier")
						imports.set(specifier.local.name, { file, exported: "default" });
				}
		}
		const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
		if (declaration != null) bindDeclaration(declaration as Node, bindings);
		if (selection.exported === "default" && statement.type === "ExportDefaultDeclaration")
			selectedNode = statement.declaration as Node;
		if (selection.exported !== "default" && statement.type === "ExportNamedDeclaration") {
			if (statement.source?.type === "StringLiteral") {
				for (const specifier of statement.specifiers)
					if (specifier.type === "ExportSpecifier" && exportedName(specifier.exported) === selection.exported) {
						const file = resolveLocalImport(designDir, selection.file, statement.source.value);
						if (file !== undefined) queue.push({ file, exported: exportedName(specifier.local) });
					}
			}
			const bound = bindings.get(selection.exported);
			if (bound !== undefined) selectedNode = bound;
		}
	}
	if (selectedNode === undefined) {
		failures.push({
			path: designRelativePath(designDir, selection.file),
			line: 1,
			reason: `Export "${selection.exported}" could not be attributed.`,
		});
		return;
	}
	const pending = [selectedNode];
	const localSeen = new Set<Node>();
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined || localSeen.has(node)) continue;
		localSeen.add(node);
		const start = node.loc?.start.line;
		const end = node.loc?.end.line;
		if (start !== undefined && end !== undefined) {
			const ranges = selected.get(selection.file) ?? [];
			ranges.push({ start, end });
			selected.set(selection.file, ranges);
		}
		walk(node, (child) => {
			if (child.type !== "Identifier") return;
			const local = bindings.get(child.name);
			if (local !== undefined && !localSeen.has(local)) pending.push(local);
			const imported = imports.get(child.name);
			if (imported !== undefined) queue.push(imported);
		});
	}
}

function bindDeclaration(node: Node, bindings: Map<string, Node>): void {
	if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id != null)
		bindings.set(node.id.name, node);
	if (node.type === "VariableDeclaration")
		for (const item of node.declarations) if (item.id.type === "Identifier") bindings.set(item.id.name, item);
}

function exportedName(node: Node): string {
	return node.type === "Identifier" ? node.name : node.type === "StringLiteral" ? node.value : "";
}

function walk(root: Node, visit: (node: Node) => void): void {
	const stack: unknown[] = [root];
	while (stack.length > 0) {
		const value = stack.pop();
		if (typeof value !== "object" || value === null) continue;
		const node = value as Record<string, unknown>;
		if (typeof node.type === "string") visit(value as Node);
		for (const [key, child] of Object.entries(node)) {
			if (key === "loc" || key === "start" || key === "end") continue;
			if (Array.isArray(child)) stack.push(...child);
			else if (typeof child === "object" && child !== null) stack.push(child);
		}
	}
}
