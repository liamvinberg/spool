import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { frameNavSites, frameSourceFiles, type NavSite, type UnreadableSite } from "./nav-sites";
import { isSafeName } from "./project-files";
import { frameNames } from "./projection";
import { liveRenderedTargets, projectScenarios } from "./resolved-targets";

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
export function frameSourceHash(root: string, frame: string): string {
	const hash = createHash("sha256");
	for (const file of frameSourceFiles(root, frame)) {
		hash.update(file);
		hash.update("\0");
		try {
			hash.update(readFileSync(file));
		} catch {
			hash.update("absent");
		}
		hash.update("\0");
	}
	return hash.digest("hex");
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
function liveVerifiedMarks(root: string, frames: readonly string[]): VerifiedMark[] {
	const alive = new Set(frames);
	const hashes = new Map<string, string>();
	const sourceHash = (frame: string): string => {
		const cached = hashes.get(frame);
		if (cached !== undefined) return cached;
		const hash = frameSourceHash(root, frame);
		hashes.set(frame, hash);
		return hash;
	};
	return readVerifiedMarks(root).filter(
		(edge) => alive.has(edge.from) && alive.has(edge.to) && edge.hash === sourceHash(edge.from),
	);
}

/** The lawful targets a frame's folder claims, with the sites claiming them. */
function derivedTargets(root: string, frame: string): Map<string, NavSite[]> {
	const byTarget = new Map<string, NavSite[]>();
	for (const site of frameNavSites(root, frame).sites) {
		// frame-folder-name targets only (#5) — one rule with the rest of spool
		if (!isSafeName(site.target)) continue;
		const sites = byTarget.get(site.target);
		if (sites === undefined) byTarget.set(site.target, [site]);
		else sites.push(site);
	}
	return byTarget;
}

/**
 * A session really took from → to. Only a derived edge takes the mark —
 * playing confirms the map, it never draws on it (#34). Returns whether a
 * mark recorded; stale marks sweep out with the same write.
 */
export function recordWalk(root: string, from: string, to: string): boolean {
	if (!derivedTargets(root, from).has(to)) return false;
	const frames = frameNames(root) ?? [];
	const kept = liveVerifiedMarks(root, frames).filter((edge) => !(edge.from === from && edge.to === to));
	kept.push({ from, to, hash: frameSourceHash(root, from), at: new Date().toISOString() });
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
	root: string,
	frame: string,
	sourceHash: string,
	scenariosHash: string,
): Map<string, { targets: Set<string>; site: UnreadableSite }> {
	const dark = frameNavSites(root, frame).unreadable;
	if (dark.length === 0) return new Map();
	const byAnchor = new Map<string, { targets: Set<string>; site: UnreadableSite }>();
	for (const site of dark) {
		if (site.anchor === undefined) continue;
		byAnchor.set(`${site.path}:${site.anchor.line}:${site.anchor.col}`, { targets: new Set(), site });
	}
	if (byAnchor.size === 0) return new Map();
	for (const rendered of liveRenderedTargets(root, frame, sourceHash, scenariosHash)) {
		if (!isSafeName(rendered.target)) continue;
		byAnchor.get(`${rendered.path}:${rendered.line}:${rendered.col}`)?.targets.add(rendered.target);
	}
	for (const [key, entry] of byAnchor) if (entry.targets.size === 0) byAnchor.delete(key);
	return byAnchor;
}

/** The graph, derived fresh per read: edges from source, values from source or
 * a render, verified from witness. */
export function deriveFlows(root: string): Flows {
	const frames = frameNames(root) ?? [];
	const exists = new Set(frames);
	const edges: FlowEdge[] = [];
	const unreadable: FlowUnreadable[] = [];
	const verified = new Set(liveVerifiedMarks(root, frames).map((mark) => `${mark.from}\0${mark.to}`));
	const scenarios = projectScenarios(root).hash;

	for (const from of frames) {
		const filled = resolvedBySite(root, from, frameSourceHash(root, from), scenarios);
		// a resolved value is the site's, so it joins that site's own target list
		const byTarget = derivedTargets(root, from);
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
				...(verified.has(`${from}\0${to}`) ? { verified: true as const } : {}),
				...(exists.has(to) ? {} : { missing: true as const }),
				// weaker than a literal: true for the scenarios rendered, not for every state
				...(fromRender.has(to) ? { resolved: true as const } : {}),
			});
		}
		for (const site of frameNavSites(root, from).unreadable) {
			// a site a render answered is no longer dark — do not report it twice
			if (site.anchor !== undefined && filled.has(`${site.path}:${site.anchor.line}:${site.anchor.col}`)) continue;
			unreadable.push({ frame: from, path: site.path, line: site.line });
		}
	}
	return { frames, edges, unreadable };
}
