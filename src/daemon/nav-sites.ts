import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
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
	/** how the source spells the walk — markup sugar or a dialect's coded call */
	via: "data-go" | "ui.go" | "term.go";
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
	/** How the source spells it — only a `data-go` site is one a render can answer. */
	via: NavSite["via"];
	path: string;
	line: number;
	anchor?: { line: number; col: number };
	/** The site sits under a branch — carried so a value found later inherits it. */
	conditional?: true;
}

export interface NavSites {
	sites: NavSite[];
	unreadable: UnreadableSite[];
}

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/** Files in the frame's own folder — the roots of its source graph. */
function frameFolderFiles(designDir: string, frameDir: string): string[] {
	try {
		return readdirSync(frameDir, { withFileTypes: true, recursive: true })
			.filter(
				(entry) =>
					(entry.isFile() || entry.isSymbolicLink()) && SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)),
			)
			.flatMap((entry) => {
				const file = join(entry.parentPath, entry.name);
				try {
					const resolved = resolveDesignPath(designDir, file);
					return statSync(resolved).isFile() ? [resolved] : [];
				} catch (error) {
					if (error instanceof DesignBoundaryError) throw error;
					return [];
				}
			});
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return [];
	}
}

/**
 * Where one relative specifier lands, or nothing. Bare specifiers are packages
 * — "react", "spool" — and never project source. Extensionless imports try the
 * source extensions then the directory's index, matching how the authored
 * imports in design/ are actually spelled.
 */
function resolveLocalImport(designDir: string, fromFile: string, specifier: string): string | undefined {
	if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
	const base = join(dirname(fromFile), specifier);
	const candidates = [
		base,
		...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`),
		...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
	];
	for (const candidate of candidates) {
		if (!SOURCE_EXTENSIONS.some((ext) => candidate.endsWith(ext))) continue;
		try {
			const resolved = resolveDesignPath(designDir, candidate);
			if (statSync(resolved).isFile()) return resolved;
		} catch (error) {
			// a specifier escaping design/ is not project source: skip it rather
			// than fail the whole graph, the boundary has already refused the read
			if (error instanceof DesignBoundaryError) continue;
		}
	}
	return undefined;
}

/** Parses survive the daemon's lifetime keyed to content — same drop-on-edit
 * freshness as the compile cache, without re-walking unchanged files. */
const parseCache = new Map<string, { hash: string; result: ParsedSource }>();

/** A file no read could reach: one spelling for the hash and the digest. */
const ABSENT = "absent";

interface FileRead {
	/** The file's bytes, or nothing when no read could reach it. */
	bytes: Buffer | undefined;
	digest: string;
	parsed?: ParsedSource | undefined;
}

/**
 * One read per file, one resolution per specifier, one listing per folder, for
 * as long as the caller holds the pass (#109).
 *
 * Frames overlap heavily — every frame mounting a shared nav bar walks the same
 * files — so a project-wide read that made its own reads per frame did 8,412
 * `readFileSync` calls over 199 files. A pass collapses that to one each.
 *
 * The memo is also a snapshot: a file edited mid-pass reads as the bytes the
 * pass started with, so one derivation sees one consistent project. The next
 * pass reads the edit.
 */
export function createSourcePass(designDir: string) {
	const files = new Map<string, FileRead>();
	const specifiers = new Map<string, string | undefined>();
	const folders = new Map<string, string[]>();

	function read(file: string): FileRead {
		const known = files.get(file);
		if (known !== undefined) return known;
		let bytes: Buffer | undefined;
		try {
			bytes = readFileSync(file);
		} catch {
			bytes = undefined;
		}
		const fresh: FileRead = {
			bytes,
			digest: bytes === undefined ? ABSENT : createHash("sha256").update(bytes).digest("hex"),
		};
		files.set(file, fresh);
		return fresh;
	}

	return {
		designDir,

		/** The file's bytes, or nothing — the input the source hash is defined over. */
		bytes: (file: string): Buffer | undefined => read(file).bytes,

		/** The file's content hash, `absent` when unreadable — the cheap identity. */
		digest: (file: string): string => read(file).digest,

		/** One parse per file per content, shared by the graph walk and the sites. */
		parsed(file: string): ParsedSource | undefined {
			const found = read(file);
			if (found.bytes === undefined) {
				parseCache.delete(file);
				return undefined;
			}
			if (found.parsed !== undefined) return found.parsed;
			const cached = parseCache.get(file);
			const result =
				cached !== undefined && cached.hash === found.digest
					? cached.result
					: parseSource(found.bytes.toString("utf8"), relative(designDir, file).split(sep).join("/"));
			parseCache.set(file, { hash: found.digest, result });
			found.parsed = result;
			return result;
		},

		/** Where one import lands, resolved once per importing folder. */
		resolve(fromFile: string, specifier: string): string | undefined {
			const key = `${dirname(fromFile)}\0${specifier}`;
			const known = specifiers.get(key);
			if (known !== undefined || specifiers.has(key)) return known;
			const found = resolveLocalImport(designDir, fromFile, specifier);
			specifiers.set(key, found);
			return found;
		},

		/** The frame folder's own source files, sorted — the roots of its graph. */
		folder(frameDir: string): string[] {
			const known = folders.get(frameDir);
			if (known !== undefined) return known;
			const found = frameFolderFiles(designDir, frameDir).sort();
			folders.set(frameDir, found);
			return found;
		},
	};
}

export type SourcePass = ReturnType<typeof createSourcePass>;

/** Where one import landed, or that it landed nowhere. */
export interface ImportEdge {
	/** The importing file — resolution is relative to its folder. */
	from: string;
	specifier: string;
	to: string | undefined;
}

/** One frame's source graph, read once: the files and everything they declare. */
export interface FrameSource extends NavSites {
	/** Every source file in the graph, sorted. */
	files: string[];
	/** The frame folder's own files, sorted — a new one joins the graph. */
	folder: string[];
	/**
	 * Every import the walk followed, landing or not. A specifier that starts
	 * landing somewhere — the file it names finally written, or a nearer
	 * candidate appearing beside the one it found — moves the graph in a way no
	 * file already in it can show.
	 */
	imports: ImportEdge[];
}

/**
 * The frame is its folder plus everything it imports from inside design/ (#34,
 * amending #5). A shared nav bar's data-go belongs to every frame that mounts
 * it: the site lives in one file and the walk happens on every page carrying
 * it. Cycles terminate on the visited set; anything resolving outside design/
 * is a package, not source. The bundler owns the real closure — this is the
 * sync reading of it, over the relative specifiers design/ is authored with.
 *
 * The files and the sites come out of one walk: they are the same parse read
 * twice, and separating them cost a project-wide read four walks per frame.
 */
export function frameSourceIn(pass: SourcePass, frameDir: string): FrameSource {
	const folder = pass.folder(frameDir);
	const seen = new Set(folder);
	const queue = [...folder];
	const imports: ImportEdge[] = [];
	for (let at = 0; at < queue.length; at++) {
		const file = queue[at];
		if (file === undefined) continue;
		for (const specifier of pass.parsed(file)?.imports ?? []) {
			const to = pass.resolve(file, specifier);
			imports.push({ from: file, specifier, to });
			if (to === undefined || seen.has(to)) continue;
			seen.add(to);
			queue.push(to);
		}
	}
	// sites read in sorted-file order, so a graph reached by two routes still
	// reports its sites in one order
	const files = [...seen].sort();
	const source: FrameSource = { files, folder, imports, sites: [], unreadable: [] };
	for (const file of files) {
		const parsed = pass.parsed(file);
		if (parsed === undefined) continue;
		source.sites.push(...parsed.sites);
		source.unreadable.push(...parsed.unreadable);
	}
	return source;
}

/** Where a frame's folder really sits, or nothing when the name does not resolve. */
export function resolveFrameDir(root: string, frame: string): { designDir: string; frameDir: string } | undefined {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return undefined;
	try {
		const designDir = realDesignDir(root);
		return { designDir, frameDir: resolveDesignPath(designDir, found.dir) };
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}

/** One frame's graph on a pass of its own — the standalone read. */
export function frameSource(root: string, frame: string): FrameSource {
	const at = resolveFrameDir(root, frame);
	if (at === undefined) return { files: [], folder: [], imports: [], sites: [], unreadable: [] };
	return frameSourceIn(createSourcePass(at.designDir), at.frameDir);
}

/** Read every navigation site the source declares. Never throws: source that
 * does not parse claims nothing — the compile surface owns reporting it. */
export function parseNavSites(source: string, path: string): NavSites {
	const { sites, unreadable } = parseSource(source, path);
	return { sites, unreadable };
}

/** What one file contributes to a frame: the walks it declares and the files
 * it pulls in. Both come out of the single parse. */
interface ParsedSource extends NavSites {
	/** Every specifier the file imports, raw — resolution happens per importer. */
	imports: string[];
}

function parseSource(source: string, path: string): ParsedSource {
	const out: ParsedSource = { sites: [], unreadable: [], imports: [] };
	let program: Node;
	try {
		program = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	} catch {
		return out;
	}
	walk(program, [], (node, ancestors) => {
		// static import/export-from and dynamic import(): every way a file names
		// another file, type-only imports included — they carry no walk of their
		// own but the graph is cheaper to keep whole than to prune
		if (
			(node.type === "ImportDeclaration" ||
				node.type === "ExportNamedDeclaration" ||
				node.type === "ExportAllDeclaration") &&
			node.source?.type === "StringLiteral"
		) {
			out.imports.push(node.source.value);
		}
		if (node.type === "CallExpression" && node.callee.type === "Import") {
			const arg = node.arguments[0] as Node | undefined;
			if (arg?.type === "StringLiteral") out.imports.push(arg.value);
		}
		if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "data-go") {
			const line = node.loc?.start.line ?? 0;
			const value =
				node.value?.type === "JSXExpressionContainer" && node.value.expression.type !== "JSXEmptyExpression"
					? node.value.expression
					: node.value;
			if (value == null) return;
			pushSites(out, readTargets(value as Node), { via: "data-go", path, line, ancestors });
		}
		if (node.type === "CallExpression") {
			const via = codedWalk(node.callee as Node);
			if (via !== undefined) {
				const line = node.loc?.start.line ?? 0;
				const arg = node.arguments[0] as Node | undefined;
				const read = arg === undefined ? { targets: [], unreadable: true } : readTargets(arg);
				pushSites(out, read, { via, path, line, ancestors });
			}
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
	if (read.unreadable) {
		out.unreadable.push({
			via: at.via,
			path: at.path,
			line: at.line,
			...anchor,
			...(branched ? { conditional: true } : {}),
		});
	}
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

/**
 * Each dialect's one coded walk: `ui.go(...)` in HTML frames (#5) and
 * `term.go(...)` in terminal frames (#42) — plain member calls, matched
 * syntactically like everything else here.
 */
function codedWalk(callee: Node): "ui.go" | "term.go" | undefined {
	if (
		callee.type !== "MemberExpression" ||
		callee.computed ||
		callee.object.type !== "Identifier" ||
		callee.property.type !== "Identifier" ||
		callee.property.name !== "go"
	) {
		return undefined;
	}
	if (callee.object.name === "ui") return "ui.go";
	if (callee.object.name === "term") return "term.go";
	return undefined;
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
