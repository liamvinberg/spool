import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import { lookupFrame } from "./projection";

/**
 * The claim reader (#34): one AST core for flow derivation. Every navigation
 * site a frame's source declares — data-go attributes and ui.go calls — is
 * read here, never simulated. Literals inside a branch fan out as conditional
 * sites; a target the parser cannot read is an unreadable site, named to the
 * agent instead of papered over. Anchors use the stamp convention (1-based
 * line and column, matching esbuild's jsxDEV triple) so the canvas can find
 * the element carrying the site via its data-spool-source stamp.
 */

export interface NavSite {
	target: string;
	/** how the source spells the walk — markup sugar or the coded call */
	via: "data-go" | "ui.go";
	/** design-relative source file of the site */
	path: string;
	/** 1-based line of the site itself — the attribute or the call */
	line: number;
	/** the site sits under a branch: ternary, if/else, switch, && or || */
	conditional?: true;
	/** stamp position of the element that causes the navigation, when one does */
	anchor?: { line: number; col: number };
}

export interface UnreadableSite {
	path: string;
	line: number;
	/** the element still navigates at runtime — the hint layer wants it (#34) */
	anchor?: { line: number; col: number };
}

export interface NavSites {
	sites: NavSite[];
	unreadable: UnreadableSite[];
}

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/** The frame is its folder — wherever pages put it: every source file in it,
 * nested ones included. An unresolvable name claims no source at all. */
export function frameSourceFiles(root: string, frame: string): string[] {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return [];
	try {
		return readdirSync(found.dir, { withFileTypes: true, recursive: true })
			.filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
			.map((entry) => join(entry.parentPath, entry.name))
			.sort();
	} catch {
		return [];
	}
}

/** Parses survive the daemon's lifetime keyed to content — same drop-on-edit
 * freshness as the compile cache, without re-walking unchanged files. */
const parseCache = new Map<string, { hash: string; result: NavSites }>();

/**
 * Every navigation site a frame's folder declares, site paths design-relative
 * so they match data-spool-source stamps and the selection payload.
 */
export function frameNavSites(root: string, frame: string): NavSites {
	const designDir = join(root, "design");
	const out: NavSites = { sites: [], unreadable: [] };
	for (const file of frameSourceFiles(root, frame)) {
		let content: Buffer;
		try {
			content = readFileSync(file);
		} catch {
			parseCache.delete(file);
			continue;
		}
		const hash = createHash("sha256").update(content).digest("hex");
		let cached = parseCache.get(file);
		if (cached === undefined || cached.hash !== hash) {
			const path = relative(designDir, file).split(sep).join("/");
			cached = { hash, result: parseNavSites(content.toString("utf8"), path) };
			parseCache.set(file, cached);
		}
		out.sites.push(...cached.result.sites);
		out.unreadable.push(...cached.result.unreadable);
	}
	return out;
}

/**
 * The stamps of elements whose code navigates (#34), for the player's hint
 * layer: ui.go carriers — readable or not, they all navigate at runtime —
 * matched by data-spool-source, while data-go carriers are found live in the
 * DOM and need no stamp here.
 */
export function hintStamps(root: string, frame: string): string[] {
	const { sites, unreadable } = frameNavSites(root, frame);
	const stamps = new Set<string>();
	for (const site of sites) {
		if (site.via === "ui.go" && site.anchor !== undefined) {
			stamps.add(`${site.path}:${site.anchor.line}:${site.anchor.col}`);
		}
	}
	for (const site of unreadable) {
		if (site.anchor !== undefined) stamps.add(`${site.path}:${site.anchor.line}:${site.anchor.col}`);
	}
	return [...stamps].sort();
}

/** Read every navigation site the source declares. Never throws: source that
 * does not parse claims nothing — the compile surface owns reporting it. */
export function parseNavSites(source: string, path: string): NavSites {
	const out: NavSites = { sites: [], unreadable: [] };
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return out;
	}
	walk(program, [], (node, ancestors) => {
		if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "data-go") {
			const line = node.loc?.start.line ?? 0;
			const value =
				node.value?.type === "JSXExpressionContainer" && node.value.expression.type !== "JSXEmptyExpression"
					? node.value.expression
					: node.value;
			if (value == null) return;
			pushSites(out, readTargets(value as Node), { via: "data-go", path, line, ancestors });
		}
		if (node.type === "CallExpression" && isUiGo(node.callee as Node)) {
			const line = node.loc?.start.line ?? 0;
			const arg = node.arguments[0] as Node | undefined;
			const read = arg === undefined ? { targets: [], unreadable: true } : readTargets(arg);
			pushSites(out, read, { via: "ui.go", path, line, ancestors });
		}
	});
	return out;
}

/**
 * Fold one site's read into the result: every literal becomes a site —
 * conditional when it came out of a branch in the expression or the site
 * itself sits under one — and a dark remainder is named as unreadable. The
 * anchor is the element whose handler (or attribute) carries the site;
 * children-embedded calls anchor nowhere.
 */
function pushSites(
	out: NavSites,
	read: TargetRead,
	at: { via: NavSite["via"]; path: string; line: number; ancestors: readonly Node[] },
): void {
	const element = nearestOpeningElement(at.ancestors);
	const anchor = element === undefined ? {} : { anchor: stampOf(element) };
	const branched = underBranch(at.ancestors);
	for (const { target, conditional } of read.targets) {
		out.sites.push({
			target,
			via: at.via,
			path: at.path,
			line: at.line,
			...(branched || conditional ? { conditional: true } : {}),
			...anchor,
		});
	}
	if (read.unreadable) out.unreadable.push({ path: at.path, line: at.line, ...anchor });
}

function nearestOpeningElement(ancestors: readonly Node[]): Node | undefined {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		if (ancestors[i]?.type === "JSXOpeningElement") return ancestors[i];
	}
	return undefined;
}

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod"]);
const BRANCHES = new Set(["IfStatement", "ConditionalExpression", "SwitchStatement", "LogicalExpression"]);

/**
 * The locked law (#34): conditional means a branch ancestor between the site
 * and its enclosing function — an if around the whole component guards the
 * component, not the handler defined inside it.
 */
function underBranch(ancestors: readonly Node[]): boolean {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const type = ancestors[i]?.type ?? "";
		if (FUNCTIONS.has(type)) return false;
		if (BRANCHES.has(type)) return true;
	}
	return false;
}

/** The dialect's one coded walk: a plain `ui.go(...)` member call (#5). */
function isUiGo(callee: Node): boolean {
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "ui" &&
		callee.property.type === "Identifier" &&
		callee.property.name === "go"
	);
}

interface TargetRead {
	targets: { target: string; conditional: boolean }[];
	unreadable: boolean;
}

/**
 * What a target expression claims: every literal it can resolve to, and
 * whether any part of it stays dark. Branch forms fan out as conditional
 * targets; only literals count beyond them (#34 out-of-scope: no concat, no
 * lookups). JSXAttribute string values land here too.
 */
function readTargets(node: Node): TargetRead {
	if (node.type === "StringLiteral")
		return { targets: [{ target: node.value, conditional: false }], unreadable: false };
	if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
		const cooked = node.quasis[0]?.value.cooked;
		if (cooked == null) return { targets: [], unreadable: true };
		return { targets: [{ target: cooked, conditional: false }], unreadable: false };
	}
	if (node.type === "ConditionalExpression") {
		return branchRead(readTargets(node.consequent as Node), readTargets(node.alternate as Node));
	}
	if (node.type === "LogicalExpression") {
		// `x && "go"`: the left side is the guard, never a destination;
		// `x || "go"` / `??`: either side may be where the session lands
		const right = readTargets(node.right as Node);
		if (node.operator === "&&") return branchRead(right);
		return branchRead(readTargets(node.left as Node), right);
	}
	return { targets: [], unreadable: true };
}

/** Merge branch arms: every target turns conditional, any dark arm stays named. */
function branchRead(...arms: TargetRead[]): TargetRead {
	return {
		targets: arms.flatMap((arm) => arm.targets.map(({ target }) => ({ target, conditional: true }))),
		unreadable: arms.some((arm) => arm.unreadable),
	};
}

/** A node's position in the stamp convention: 1-based line, 1-based column. */
function stampOf(node: Node): { line: number; col: number } {
	return { line: node.loc?.start.line ?? 0, col: (node.loc?.start.column ?? 0) + 1 };
}

/** Depth-first walk over babel nodes, ancestors outermost-first. */
function walk(node: Node, ancestors: Node[], visit: (node: Node, ancestors: Node[]) => void): void {
	visit(node, ancestors);
	ancestors.push(node);
	for (const key of Object.keys(node)) {
		if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
		const value = (node as unknown as Record<string, unknown>)[key];
		for (const child of Array.isArray(value) ? value : [value]) {
			if (typeof child === "object" && child !== null && typeof (child as Node).type === "string") {
				walk(child as Node, ancestors, visit);
			}
		}
	}
	ancestors.pop();
}
