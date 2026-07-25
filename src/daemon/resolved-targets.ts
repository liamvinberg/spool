import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { isSafeName } from "./project-files";

/**
 * What a render already knows (#34, extending the claim reader): a target the
 * parser reads as dark is often written out in plain source a few boundaries
 * away — `data-go={system.frame}` over a local array of literals. Rather than
 * propagate constants across every prop and array element, spool renders the
 * frame it already knows how to render and reads the attribute React resolved.
 *
 * The law this keeps: **the parser enumerates the sites, the render only
 * supplies values for sites it already found.** A rendered attribute with no
 * unreadable site behind it mints nothing — same rule as playing, which can
 * only confirm an edge the source claims. So the map stays a function of source
 * and scenarios, never of anyone's browsing.
 *
 * A resolved value is a weaker fact than a literal: true for the scenarios that
 * were rendered, not proven for every state. It travels marked.
 */

/** One `[data-go]` carrier a render produced, at the stamp it was authored. */
export interface RenderedTarget {
	target: string;
	/** Design-relative source file of the element carrying the attribute. */
	path: string;
	line: number;
	col: number;
}

interface FrameRecord {
	frame: string;
	/** The frame's source graph when this was read — stale on any edit. */
	hash: string;
	/** The scenario set when this was read — a new scenario re-reads. */
	scenarios: string;
	targets: RenderedTarget[];
	at: string;
}

const CACHE_VERSION = 1;

function cacheFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "resolved.json"));
}

/** Machine-written cache: anything malformed reads as nothing resolved. */
function readRecords(root: string): FrameRecord[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(cacheFile(root), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return [];
	}
	if (typeof parsed !== "object" || parsed === null) return [];
	const frames = (parsed as { frames?: unknown }).frames;
	if (!Array.isArray(frames)) return [];
	return frames.filter(isFrameRecord);
}

function isFrameRecord(value: unknown): value is FrameRecord {
	if (typeof value !== "object" || value === null) return false;
	const { frame, hash, scenarios, targets, at } = value as Record<string, unknown>;
	if (typeof frame !== "string" || typeof hash !== "string" || typeof scenarios !== "string") return false;
	if (typeof at !== "string" || !Array.isArray(targets)) return false;
	return targets.every((target) => {
		if (typeof target !== "object" || target === null) return false;
		const { target: name, path, line, col } = target as Record<string, unknown>;
		return (
			typeof name === "string" && typeof path === "string" && typeof line === "number" && typeof col === "number"
		);
	});
}

/**
 * Every scenario the project declares, and a hash of the set with their bytes.
 * A frame renders once per scenario, so adding or editing one re-reads: the
 * map is a function of source and scenarios, and this is the scenarios half.
 */
export function projectScenarios(root: string): { names: string[]; hash: string } {
	const designDir = realDesignDir(root);
	let dir: string;
	try {
		dir = resolveDesignPath(designDir, join(designDir, "shared", "scenarios"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return { names: [], hash: "none" };
	}
	let names: string[] = [];
	try {
		names = readdirSync(dir)
			.filter((entry) => entry.endsWith(".json"))
			.map((entry) => entry.slice(0, -".json".length))
			.filter((name) => isSafeName(name))
			.sort();
	} catch {
		return { names: [], hash: "none" };
	}
	const hash = createHash("sha256");
	for (const name of names) {
		hash.update(name);
		hash.update("\0");
		try {
			hash.update(readFileSync(join(dir, `${name}.json`)));
		} catch {
			hash.update("absent");
		}
		hash.update("\0");
	}
	return { names, hash: hash.digest("hex") };
}

/**
 * The targets still standing for one frame: read only when both the frame's
 * source and the scenario set are the ones that were rendered. Same drop-on-edit
 * freshness as a verified mark, one file over.
 */
export function liveRenderedTargets(
	root: string,
	frame: string,
	sourceHash: string,
	scenariosHash: string,
): RenderedTarget[] {
	const record = readRecords(root).find((candidate) => candidate.frame === frame);
	if (record === undefined) return [];
	if (record.hash !== sourceHash || record.scenarios !== scenariosHash) return [];
	return record.targets;
}

/**
 * Store one frame's read. Records for frames that no longer exist sweep out
 * with the same write, so the file cannot outgrow the project.
 */
export function recordRenderedTargets(
	root: string,
	frame: string,
	sourceHash: string,
	scenariosHash: string,
	targets: readonly RenderedTarget[],
	alive: readonly string[],
	now: string,
): void {
	const live = new Set(alive);
	const kept = readRecords(root).filter((record) => record.frame !== frame && live.has(record.frame));
	kept.push({
		frame,
		hash: sourceHash,
		scenarios: scenariosHash,
		targets: dedupe(targets),
		at: now,
	});
	kept.sort((a, b) => a.frame.localeCompare(b.frame));
	writeAtomic(cacheFile(root), `${JSON.stringify({ version: CACHE_VERSION, frames: kept }, null, "\t")}\n`);
}

/** One entry per target per stamp: a mapped list renders the same site many
 * times, and the same scenario rendered twice is not two facts. */
function dedupe(targets: readonly RenderedTarget[]): RenderedTarget[] {
	const byKey = new Map<string, RenderedTarget>();
	for (const target of targets) {
		byKey.set(`${target.path}:${target.line}:${target.col}\0${target.target}`, target);
	}
	return [...byKey.values()].sort(
		(a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.col - b.col || a.target.localeCompare(b.target),
	);
}
