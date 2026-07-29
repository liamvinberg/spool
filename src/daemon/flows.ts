import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { DesignBoundaryError, designRelativePath, realDesignDir, resolveDesignPath } from "./design-path";
import {
	createSourcePass,
	type FrameSource,
	frameSource,
	frameSourceIn,
	type ImportEdge,
	type NavSite,
	resolveFrameDir,
	type SourcePass,
	type UnreadableSite,
} from "./nav-sites";
import { isSafeName } from "./project-files";
import { frameDirectories, frameNames } from "./projection";
import { createRenderedReader, projectScenarios, type RenderedReader, type RenderedTarget } from "./resolved-targets";

/**
 * The link graph (#34, amending #5): the map is read, not walked. Every edge
 * derives from a navigation site the source declares — certainty "will" for
 * an unconditional site, "might" when every site sits in a branch — and a
 * destination the parser cannot read is reported, never guessed. Playing can
 * only confirm: a witnessed walk flips a verified mark on a derived edge,
 * cached in design/.spool keyed to the from-frame's source, dropped on edit.
 * Walks the source never claims are discarded — no robo-simulation, no
 * walk-minted arrows.
 */

/** A site on the wire: the edge's target is the edge itself — everything
 * else about the site travels, one definition with the parser's. */
export type EdgeSite = Omit<NavSite, "target">;

export interface FlowEdge {
	from: string;
	to: string;
	/** will = an unconditional site claims it; might = only branched sites do. */
	certainty: "will" | "might";
	/** Every site claiming this edge, retained behind its single arrow. */
	sites: EdgeSite[];
	/** A real session took this edge since the from-frame last changed. */
	verified?: true;
	/** A declared target no frame answers to — real information for an agent. */
	missing?: true;
	/**
	 * The target came from rendering the frame, not from a literal in source:
	 * true for the scenarios that were rendered, not proven for every state.
	 */
	resolved?: true;
}

export interface FlowUnreadable {
	frame: string;
	path: string;
	line: number;
}

export interface Flows {
	frames: string[];
	edges: FlowEdge[];
	/** Navigation whose destination cannot be read: named, never papered over. */
	unreadable: FlowUnreadable[];
}

/**
 * What a frame's source is, for cache freshness: every source file in its
 * graph, names and bytes. One definition of "this frame changed", shared by
 * verified marks and the resolved-target cache.
 */
export function sourceHash(pass: SourcePass, files: readonly string[]): string {
	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file);
		hash.update("\0");
		hash.update(pass.bytes(file) ?? "absent");
		hash.update("\0");
	}
	return hash.digest("hex");
}

/** What a frame with no readable source hashes to — a name that resolves nowhere. */
const EMPTY_SOURCE_HASH = createHash("sha256").digest("hex");

/** One frame's source hash on a pass of its own — the standalone read. */
export function frameSourceHash(root: string, frame: string): string {
	const at = resolveFrameDir(root, frame);
	if (at === undefined) return EMPTY_SOURCE_HASH;
	const pass = createSourcePass(at.designDir);
	return sourceHash(pass, frameSourceIn(pass, at.frameDir).files);
}

interface VerifiedMark {
	from: string;
	to: string;
	hash: string;
	at: string;
}

function walkedFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "walked.json"));
}

/** Machine-written cache: anything malformed reads as no marks at all. */
function readVerifiedMarks(root: string): VerifiedMark[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(walkedFile(root), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return [];
	}
	if (typeof parsed !== "object" || parsed === null) return [];
	const edges = (parsed as { edges?: unknown }).edges;
	if (!Array.isArray(edges)) return [];
	return edges.filter((edge): edge is VerifiedMark => {
		if (typeof edge !== "object" || edge === null) return false;
		const { from, to, hash, at } = edge as Record<string, unknown>;
		return typeof from === "string" && typeof to === "string" && typeof hash === "string" && typeof at === "string";
	});
}

/** The marks still standing: both ends alive, the from-frame unedited. */
function liveVerifiedMarks(root: string, frames: readonly string[], hashOf: (frame: string) => string): VerifiedMark[] {
	const alive = new Set(frames);
	return readVerifiedMarks(root).filter(
		(edge) => alive.has(edge.from) && alive.has(edge.to) && edge.hash === hashOf(edge.from),
	);
}

/**
 * The witness side, ready to ask one edge at a time: a mark stands when both
 * ends are alive and the from-frame's source is the one that was walked. Asked
 * per edge so a derivation never needs every frame's hash before it starts.
 */
function verifiedWitness(root: string, alive: ReadonlySet<string>): FlowContext["verified"] {
	const marks = new Map<string, string>();
	for (const mark of readVerifiedMarks(root)) {
		if (alive.has(mark.from) && alive.has(mark.to)) marks.set(`${mark.from}\0${mark.to}`, mark.hash);
	}
	return (from, to, hash) => marks.get(`${from}\0${to}`) === hash;
}

/** The lawful targets a frame's folder claims, with the sites claiming them. */
function derivedTargets(sites: readonly NavSite[]): Map<string, NavSite[]> {
	const byTarget = new Map<string, NavSite[]>();
	for (const site of sites) {
		// frame-folder-name targets only (#5) — one rule with the rest of spool
		if (!isSafeName(site.target)) continue;
		const claiming = byTarget.get(site.target);
		if (claiming === undefined) byTarget.set(site.target, [site]);
		else claiming.push(site);
	}
	return byTarget;
}

/**
 * A session really took from → to. Only a derived edge takes the mark —
 * playing confirms the map, it never draws on it (#34). Returns whether a
 * mark recorded; stale marks sweep out with the same write.
 */
export function recordWalk(root: string, from: string, to: string): boolean {
	if (!derivedTargets(frameSource(root, from).sites).has(to)) return false;
	const frames = frameNames(root) ?? [];
	const hashes = new Map<string, string>();
	const hashOf = (frame: string): string => {
		const known = hashes.get(frame);
		if (known !== undefined) return known;
		const hash = frameSourceHash(root, frame);
		hashes.set(frame, hash);
		return hash;
	};
	const kept = liveVerifiedMarks(root, frames, hashOf).filter((edge) => !(edge.from === from && edge.to === to));
	kept.push({ from, to, hash: hashOf(from), at: new Date().toISOString() });
	kept.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
	writeAtomic(walkedFile(root), `${JSON.stringify({ version: 1, edges: kept }, null, "\t")}\n`);
	return true;
}

/**
 * What a render supplied for one frame, folded onto the sites the parser
 * already found. A rendered attribute counts only when its stamp matches an
 * unreadable site's anchor: the parser enumerates the sites, the render fills
 * their values — it never mints a site of its own, exactly as playing never
 * mints an edge. Returns the resolved targets per site anchor, so the caller
 * can both add the edges and stop reporting the sites as dark.
 */
function resolvedBySite(
	read: readonly RenderedTarget[],
	dark: readonly UnreadableSite[],
): Map<string, { targets: Set<string>; site: UnreadableSite }> {
	if (dark.length === 0) return new Map();
	const byAnchor = new Map<string, { targets: Set<string>; site: UnreadableSite }>();
	for (const site of dark) {
		if (site.anchor === undefined) continue;
		byAnchor.set(`${site.path}:${site.anchor.line}:${site.anchor.col}`, { targets: new Set(), site });
	}
	if (byAnchor.size === 0) return new Map();
	for (const filled of read) {
		if (!isSafeName(filled.target)) continue;
		byAnchor.get(`${filled.path}:${filled.line}:${filled.col}`)?.targets.add(filled.target);
	}
	for (const [key, entry] of byAnchor) if (entry.targets.size === 0) byAnchor.delete(key);
	return byAnchor;
}

/** One frame's source, read once and hashed — what the derivation needs of it. */
export interface FrameGraph extends FrameSource {
	frame: string;
	hash: string;
}

/** What the whole project supplies to one frame's decoration. */
export interface FlowContext {
	exists: ReadonlySet<string>;
	verified: (from: string, to: string, hash: string) => boolean;
	rendered: RenderedReader;
	scenarios: string;
}

/**
 * Everything one frame contributes to the graph. The source half — its files
 * and its sites — is the frame's own bytes and nothing else; `missing`,
 * `verified` and `resolved` are set lookups over the project, so a frame that
 * changes never invalidates another frame's read.
 */
function frameFlows(graph: FrameGraph, context: FlowContext): { edges: FlowEdge[]; unreadable: FlowUnreadable[] } {
	const from = graph.frame;
	const edges: FlowEdge[] = [];
	const unreadable: FlowUnreadable[] = [];
	const read = context.rendered(from, graph.hash, context.scenarios);
	const filled = resolvedBySite(read ?? [], graph.unreadable);
	// a resolved value is the site's, so it joins that site's own target list
	const byTarget = derivedTargets(graph.sites);
	const fromRender = new Set<string>();
	for (const { targets, site } of filled.values()) {
		// one site resolving to many targets makes each one uncertain: which
		// row you click decides where you land, and the source never said
		const certain = targets.size === 1 && site.conditional === undefined;
		for (const target of targets) {
			fromRender.add(target);
			const claim: NavSite = {
				target,
				via: "data-go",
				path: site.path,
				line: site.line,
				...(certain ? {} : { conditional: true }),
				...(site.anchor === undefined ? {} : { anchor: site.anchor }),
			};
			const existing = byTarget.get(target);
			if (existing === undefined) byTarget.set(target, [claim]);
			else existing.push(claim);
		}
	}

	for (const [to, sites] of [...byTarget].sort(([a], [b]) => a.localeCompare(b))) {
		edges.push({
			from,
			to,
			certainty: sites.some((site) => site.conditional === undefined) ? "will" : "might",
			sites: sites.map(({ target: _target, ...site }) => site),
			...(context.verified(from, to, graph.hash) ? { verified: true as const } : {}),
			...(context.exists.has(to) ? {} : { missing: true as const }),
			// weaker than a literal: true for the scenarios rendered, not for every state
			...(fromRender.has(to) ? { resolved: true as const } : {}),
		});
	}
	for (const site of graph.unreadable) {
		// a site a render answered is no longer dark, and writing no attribute is
		// an answer too: an optional prop left undefined renders nothing, so there
		// is no walk there to be unable to read (#150). Only an anchored data-go
		// site can be asked — a coded call is invisible to the DOM the pass reads,
		// and a site with no element to stamp has nothing to match against.
		//
		// The question is put per frame rather than per site, because the cache
		// records the carriers that produced an attribute and nothing else, so a
		// stamp absent from it either rendered empty or never mounted. Asking per
		// site would need the render to report stamps it saw as well, and it would
		// still not reach #150's own worked example: the shared component that
		// returns a plain div when its target prop is missing never mounts the
		// stamped element at all. The cost is that a genuinely dark expression on
		// a frame that has been rendered goes unreported; a frame nobody has
		// rendered, and every coded call, still report.
		if (site.via === "data-go" && site.anchor !== undefined && read !== null) continue;
		unreadable.push({ frame: from, path: site.path, line: site.line });
	}
	return { edges, unreadable };
}

/**
 * One frame's source half, kept between reads. Only what the frame's own bytes
 * decide lives here — `missing`, `verified` and `resolved` are set lookups over
 * the project, so a new frame re-decorates every entry rather than voiding them.
 */
interface FrameEntry {
	dir: string;
	/** The frame folder's own files when built — a new one joins the graph. */
	folder: string[];
	files: string[];
	/** Where every import landed — a specifier that starts landing is a move. */
	imports: ImportEdge[];
	/** Names and content digests: the cheap "did any of this move". */
	fingerprint: string;
	/** Names and bytes: what walked.json and resolved.json are keyed to. */
	hash: string;
	sites: NavSite[];
	unreadable: UnreadableSite[];
}

/** Names and digests of a graph — same inputs as the source hash, small enough
 * to recompute per read. Equal fingerprints mean equal bytes, so the hash the
 * persisted caches are keyed to survives untouched. */
function fingerprintOf(pass: SourcePass, files: readonly string[]): string {
	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file);
		hash.update("\0");
		hash.update(pass.digest(file));
		hash.update("\0");
	}
	return hash.digest("hex");
}

function sameFiles(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((file, at) => file === b[at]);
}

/**
 * Every import still lands where it did. The bytes of a graph cannot show a
 * file being written next to it: an import naming a file that did not exist
 * yet — the ordinary order an agent writes two files in — starts landing
 * without a single file in the graph changing. Resolution is memoized per pass,
 * so a project asks this once per folder and specifier however many frames
 * share it.
 */
function sameImports(pass: SourcePass, imports: readonly ImportEdge[]): boolean {
	return imports.every((edge) => pass.resolve(edge.from, edge.specifier) === edge.to);
}

/** One read of the whole project: the wire shape and the source half behind it. */
interface Built {
	flows: Flows;
	graphs: Map<string, FrameGraph>;
}

/** Back to the event loop, so a project-wide build is never one block. */
function handBack(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

/**
 * The graph the daemon keeps (#109). Deriving it fresh per read walked every
 * frame's source four times and held the daemon's only thread for seconds; this
 * keeps each frame's source half and rebuilds only what moved.
 *
 * Freshness is still checked on read, never pushed: the fs watcher is a
 * courtesy (`events.ts`), and the standing law is that the pull side rehashes
 * on request so a missed event costs a refresh and never a stale document.
 * Reading and digesting a whole project is milliseconds — the old cost was
 * doing it once per frame instead of once.
 */
export function createFlowGraph() {
	const kept = new Map<string, Map<string, FrameEntry>>();
	/** design-relative shared/ path → the frames whose graph reaches it. */
	const users = new Map<string, Map<string, string[]>>();
	const running = new Map<string, Promise<Built>>();
	const queued = new Map<string, Promise<Built>>();

	function graphFor(
		pass: SourcePass,
		entries: Map<string, FrameEntry>,
		frame: string,
		frameDir: string | undefined,
	): FrameGraph {
		if (frameDir === undefined) {
			entries.delete(frame);
			return { frame, files: [], folder: [], imports: [], sites: [], unreadable: [], hash: EMPTY_SOURCE_HASH };
		}
		const known = entries.get(frame);
		const folder = pass.folder(frameDir);
		if (
			known !== undefined &&
			known.dir === frameDir &&
			sameFiles(known.folder, folder) &&
			fingerprintOf(pass, known.files) === known.fingerprint &&
			sameImports(pass, known.imports)
		) {
			const { files, imports, sites, unreadable, hash } = known;
			return { frame, files, folder, imports, sites, unreadable, hash };
		}
		const source = frameSourceIn(pass, frameDir);
		const entry: FrameEntry = {
			dir: frameDir,
			folder: source.folder,
			files: source.files,
			imports: source.imports,
			fingerprint: fingerprintOf(pass, source.files),
			hash: sourceHash(pass, source.files),
			sites: source.sites,
			unreadable: source.unreadable,
		};
		entries.set(frame, entry);
		return { frame, ...source, hash: entry.hash };
	}

	/** Which frames a shared file reaches, so an edit there wakes only them. */
	function reindex(root: string, designDir: string, entries: Map<string, FrameEntry>): void {
		const index = new Map<string, string[]>();
		for (const [frame, entry] of entries) {
			for (const file of entry.files) {
				const path = designRelativePath(designDir, file);
				if (!path.startsWith("shared/")) continue;
				const reached = index.get(path);
				if (reached === undefined) index.set(path, [frame]);
				else reached.push(frame);
			}
		}
		users.set(root, index);
	}

	async function build(root: string): Promise<Built> {
		const dirs = frameDirectories(root);
		const frames = [...dirs.keys()];
		const alive = new Set(frames);
		const context: FlowContext = {
			exists: alive,
			verified: verifiedWitness(root, alive),
			rendered: createRenderedReader(root),
			scenarios: projectScenarios(root).hash,
		};
		const pass = createSourcePass(realDesignDir(root));
		const entries = kept.get(root) ?? new Map<string, FrameEntry>();
		kept.set(root, entries);

		const graphs = new Map<string, FrameGraph>();
		const edges: FlowEdge[] = [];
		const unreadable: FlowUnreadable[] = [];
		for (const [frame, dir] of dirs) {
			const graph = graphFor(pass, entries, frame, insideDesign(pass.designDir, dir));
			const derived = frameFlows(graph, context);
			graphs.set(frame, graph);
			edges.push(...derived.edges);
			unreadable.push(...derived.unreadable);
			// one frame, one turn: 5.5 ms of work is what makes the yield sound
			await handBack();
		}
		for (const frame of [...entries.keys()]) if (!alive.has(frame)) entries.delete(frame);
		reindex(root, pass.designDir, entries);
		return { flows: { frames, edges, unreadable }, graphs };
	}

	/**
	 * At most one build running and one waiting, per project.
	 *
	 * No request is ever answered from a pass that began before it arrived — that
	 * would hand back a graph predating the edit that asked for the read — so a
	 * request landing mid-build waits for the next one. But every request landing
	 * during the same build wants the same next build, and one pass serves them
	 * all: a burst of edits costs two reads of the project, not one per event.
	 */
	function queue(root: string): Promise<Built> {
		const inflight = running.get(root);
		if (inflight === undefined) return start(root);
		const waiting = queued.get(root);
		if (waiting !== undefined) return waiting;
		const next = inflight.then(
			() => start(root),
			() => start(root),
		);
		queued.set(root, next);
		return next;
	}

	function start(root: string): Promise<Built> {
		queued.delete(root);
		const run = build(root).finally(() => {
			if (running.get(root) === run) running.delete(root);
		});
		running.set(root, run);
		return run;
	}

	return {
		/** The graph on the wire. */
		flows: (root: string): Promise<Flows> => queue(root).then((built) => built.flows),

		/**
		 * The source half alone, by frame: what a frame's own bytes decide, for
		 * callers that need the sites or the hash without the edges.
		 */
		sources: (root: string): Promise<Map<string, FrameGraph>> => queue(root).then((built) => built.graphs),

		/**
		 * The frames one shared file reaches, or nothing when no build has seen
		 * it. Not knowing is not the same as nobody using it — a caller narrowing
		 * work on this must treat nothing as "every frame".
		 */
		framesUsing(root: string, path: string): string[] | undefined {
			return users.get(root)?.get(path);
		},
	};
}

export type FlowGraph = ReturnType<typeof createFlowGraph>;

/** A frame folder's real path, or nothing when it does not resolve. */
function insideDesign(designDir: string, dir: string): string | undefined {
	try {
		return resolveDesignPath(designDir, dir);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}
