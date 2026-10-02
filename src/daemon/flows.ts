import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { writeAtomic } from "../atomic-write";
import { isFramePath } from "../page-path";
import {
	DesignBoundaryError,
	designPathResolver,
	designRelativePath,
	realDesignDir,
	resolveDesignPath,
} from "./design-path";
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
import { frameDirectories, frameNames } from "./projection";
import {
	createRenderedReader,
	projectScenarios,
	type RenderedReader,
	type RenderedTarget,
	readRenderedText,
} from "./resolved-targets";
import { createLooks, diskNow, type Looks, type SourceWitness, witnessHolds, witnessSource } from "./source-witness";

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

/** The marks file as written, or nothing when it cannot be read. */
function readWalkedText(root: string): string | undefined {
	try {
		return readFileSync(walkedFile(root), "utf8");
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}

function readVerifiedMarks(root: string): VerifiedMark[] {
	return parseVerifiedMarks(readWalkedText(root));
}

/** Machine-written cache: anything malformed reads as no marks at all. */
function parseVerifiedMarks(text: string | undefined): VerifiedMark[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text ?? "");
	} catch {
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
function verifiedWitness(walked: string | undefined, alive: ReadonlySet<string>): FlowContext["verified"] {
	const marks = new Map<string, string>();
	for (const mark of parseVerifiedMarks(walked)) {
		if (alive.has(mark.from) && alive.has(mark.to)) marks.set(`${mark.from}\0${mark.to}`, mark.hash);
	}
	return (from, to, hash) => marks.get(`${from}\0${to}`) === hash;
}

/** The lawful targets a frame's folder claims, with the sites claiming them. */
function derivedTargets(sites: readonly NavSite[]): Map<string, NavSite[]> {
	const byTarget = new Map<string, NavSite[]>();
	for (const site of sites) {
		// frame names only (#5, #336), one rule with the rest of spool
		if (!isFramePath(site.target)) continue;
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
		if (!isFramePath(filled.target)) continue;
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
	/** What vouches for all of the above without a read, when a stat can. */
	witness: SourceWitness | undefined;
	/** The half as callers receive it, handed out again while it stands. */
	graph: FrameGraph;
	/** The frame's edges against one project context, while both stand. */
	derived?: { context: ProjectContext; edges: FlowEdge[]; unreadable: FlowUnreadable[] };
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

/**
 * What the whole project supplies to every frame's edges, and the bytes it was
 * read from. Read in full every time: the marks, the rendered reads and the
 * scenarios are three small files and a folder. While those bytes and the
 * frame set stand, it is the same context, and a frame whose source half
 * stands too keeps the edges it derived against it.
 */
interface ProjectContext {
	key: string;
	flow: FlowContext;
}

/** The context as of now, the one kept when nothing it is read from moved. */
function readContext(root: string, frames: readonly string[], previous: ProjectContext | undefined): ProjectContext {
	const walked = readWalkedText(root);
	const rendered = readRenderedText(root);
	const scenarios = projectScenarios(root).hash;
	// \u0001 cannot appear in a frame name or in JSON a writer produced unescaped
	const key = [walked ?? "\u0001", rendered ?? "\u0001", scenarios, ...frames].join("\u0001\u0000");
	if (previous?.key === key) return previous;
	const alive = new Set(frames);
	return {
		key,
		flow: {
			exists: alive,
			verified: verifiedWitness(walked, alive),
			rendered: createRenderedReader(root, { text: rendered }),
			scenarios,
		},
	};
}

/**
 * What one read of the project asks the disk through: the bytes when a frame
 * has to be proven by them, the stats when a witness can vouch, and the file
 * system's time when the read began, which is what a witness taken during it
 * is measured against. `full` is a read that proves every frame by its bytes.
 */
interface ReadPass {
	pass: SourcePass;
	looks: Looks;
	/** The boundary, asked of a frame whose folder is about to be read. */
	inside: (file: string) => string;
	since: number | undefined;
	full: boolean;
}

/**
 * Frames proven by their witness between two turns. Such a frame costs a few
 * stats, so a turn apiece spent more on the loop than on the frames; a frame
 * proven by its bytes still gets a turn of its own.
 */
const WITNESSED_PER_TURN = 64;

/**
 * How often a project's frames are proven by their bytes whatever their
 * witnesses say. A stat has never been the proof the bytes are, so whatever
 * one misses heals within this; a full read is a few hundred milliseconds of
 * yielding work, once a minute and only for a project somebody is reading.
 */
const FULL_PROOF_MS = 60_000;

/** One read of the whole project: the wire shape and the source half behind it. */
interface Built {
	flows: Flows;
	graphs: Map<string, FrameGraph>;
	context: ProjectContext;
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
 * courtesy (`events.ts`), and the standing law is that the pull side checks
 * on request so a missed event costs a refresh and never a stale document.
 * The check is a stat per path wherever a witness can vouch for a frame
 * (`source-witness.ts`), and the frame's bytes wherever it cannot, and for
 * every frame at least once a minute.
 *
 * `clock` tells the file system's time as a read begins, a seam for tests
 * that need files written a moment ago to count as settled.
 */
export function createFlowGraph(options: { clock?: (designDir: string) => number | undefined } = {}) {
	const clock = options.clock ?? diskNow;
	const kept = new Map<string, Map<string, FrameEntry>>();
	/** design-relative shared/ path → the frames whose graph reaches it. */
	const users = new Map<string, Map<string, string[]>>();
	/**
	 * Projects whose kept entries moved since the last build that finished. A
	 * build that throws part way has already replaced some entries, and the
	 * next one sees them stand; this is what still knows the shared index and
	 * the last result predate them.
	 */
	const moved = new Set<string>();
	const results = new Map<string, Built>();
	/** When each project's frames were last all proven by their bytes. */
	const provenFully = new Map<string, number>();
	const running = new Map<string, Promise<Built>>();
	const queued = new Map<string, Promise<Built>>();

	/**
	 * One frame's source half, and whether proving it took a read from disk. A
	 * witness that still holds is the whole proof; without one, or when it no
	 * longer holds, the frame is proven by its bytes exactly as before
	 * witnesses, and a fresh witness is taken for the next read.
	 */
	function entryFor(
		root: string,
		disk: ReadPass,
		entries: Map<string, FrameEntry>,
		frame: string,
		dir: string,
	): { entry: FrameEntry | undefined; fromDisk: boolean } {
		const { pass, looks, since } = disk;
		const known = entries.get(frame);
		// discovery spells a frame by its real folder, so a kept entry's own folder
		// is the one discovered; the witness vouches it is still no link, and then
		// nothing is read for the boundary to refuse
		if (!disk.full && known?.witness !== undefined && known.dir === dir && witnessHolds(known.witness, looks)) {
			return { entry: known, fromDisk: false };
		}
		const frameDir = insideDesign(disk.inside, dir);
		if (frameDir === undefined) {
			if (entries.delete(frame)) moved.add(root);
			return { entry: undefined, fromDisk: false };
		}
		const listing = pass.listing(frameDir);
		if (
			known !== undefined &&
			known.dir === frameDir &&
			sameFiles(known.folder, listing.files) &&
			fingerprintOf(pass, known.files) === known.fingerprint &&
			sameImports(pass, known.imports)
		) {
			known.witness = witnessSource(pass.designDir, frameDir, listing, known, since, looks);
			return { entry: known, fromDisk: true };
		}
		const source = frameSourceIn(pass, frameDir);
		const hash = sourceHash(pass, source.files);
		const entry: FrameEntry = {
			dir: frameDir,
			folder: source.folder,
			files: source.files,
			imports: source.imports,
			fingerprint: fingerprintOf(pass, source.files),
			hash,
			witness: witnessSource(pass.designDir, frameDir, listing, source, since, looks),
			graph: { frame, ...source, hash },
		};
		entries.set(frame, entry);
		moved.add(root);
		return { entry, fromDisk: true };
	}

	/** Which frames a shared file reaches, so an edit there wakes only them. */
	function reindex(root: string, designDir: string, entries: Map<string, FrameEntry>): void {
		const index = new Map<string, string[]>();
		const sharedDir = join(designDir, "shared") + sep;
		// a shared file is in hundreds of graphs, and spelled once
		const spelled = new Map<string, string>();
		for (const [frame, entry] of entries) {
			for (const file of entry.files) {
				// graph files are real paths inside design/, so the folder alone says
				// which are shared, and only those need spelling out
				if (!file.startsWith(sharedDir)) continue;
				let path = spelled.get(file);
				if (path === undefined) {
					path = designRelativePath(designDir, file);
					spelled.set(file, path);
				}
				const reached = index.get(path);
				if (reached === undefined) index.set(path, [frame]);
				else reached.push(frame);
			}
		}
		users.set(root, index);
	}

	async function build(root: string): Promise<Built> {
		const designDir = realDesignDir(root);
		// before anything is read: a path that changed after this is never witnessed
		const since = clock(designDir);
		const startedAt = performance.now();
		const full = startedAt - (provenFully.get(root) ?? Number.NEGATIVE_INFINITY) >= FULL_PROOF_MS;
		const dirs = frameDirectories(root);
		const frames = [...dirs.keys()];
		const last = results.get(root);
		const context = readContext(root, frames, last?.context);
		const pass = createSourcePass(designDir);
		const disk: ReadPass = { pass, looks: createLooks(), inside: designPathResolver(designDir), since, full };
		const entries = kept.get(root) ?? new Map<string, FrameEntry>();
		kept.set(root, entries);
		if (!users.has(root)) moved.add(root);

		const graphs = new Map<string, FrameGraph>();
		const edges: FlowEdge[] = [];
		const unreadable: FlowUnreadable[] = [];
		let witnessed = 0;
		for (const [frame, dir] of dirs) {
			const { entry, fromDisk } = entryFor(root, disk, entries, frame, dir);
			if (entry === undefined) {
				const graph = {
					frame,
					files: [],
					folder: [],
					imports: [],
					sites: [],
					unreadable: [],
					hash: EMPTY_SOURCE_HASH,
				};
				graphs.set(frame, graph);
				const derived = frameFlows(graph, context.flow);
				edges.push(...derived.edges);
				unreadable.push(...derived.unreadable);
				continue;
			}
			graphs.set(frame, entry.graph);
			if (entry.derived?.context !== context) {
				entry.derived = { context, ...frameFlows(entry.graph, context.flow) };
			}
			edges.push(...entry.derived.edges);
			unreadable.push(...entry.derived.unreadable);
			// a frame read from disk is one turn: 5.5 ms of work is what makes the
			// yield sound; a witnessed one is microseconds, and shares its turn
			if (fromDisk || ++witnessed % WITNESSED_PER_TURN === 0) await handBack();
		}
		for (const frame of [...entries.keys()]) if (!dirs.has(frame) && entries.delete(frame)) moved.add(root);
		if (full) provenFully.set(root, startedAt);
		// nothing moved and the context stands: the last result is this one
		if (!moved.has(root) && last !== undefined && last.context === context) return last;
		reindex(root, designDir, entries);
		moved.delete(root);
		const built = { flows: { frames, edges, unreadable }, graphs, context };
		results.set(root, built);
		return built;
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
function insideDesign(inside: (file: string) => string, dir: string): string | undefined {
	try {
		return inside(dir);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}
