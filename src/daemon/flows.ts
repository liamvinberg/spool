import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { isSafeName } from "./project-files";
import { frameNames } from "./projection";

/**
 * The link graph (#5, #25): declared links are re-derived from source on every
 * read and never stored — a data-go literal anywhere in the frame's folder is
 * the declaration. Coded links (ui.go, computed data-go) cannot be derived, so
 * they exist only once actually walked: real sessions report edges, the cache
 * lives in design/.spool keyed to the from-frame's source, and an edited frame
 * drops its walked edges — the map never claims more than source or witness.
 */

export interface FlowLink {
	from: string;
	to: string;
	kind: "declared" | "walked";
	/** A declared target no frame answers to — real information for an agent. */
	missing?: true;
}

export interface Flows {
	frames: string[];
	links: FlowLink[];
}

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/**
 * data-go targets written as literals: attribute strings and the braced
 * expression forms agents actually emit. Computed targets are invisible here
 * by design — they become walked edges when a session really takes them.
 */
const DATA_GO = /data-go\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\})/g;

/** The frame is its folder: every source file in it, nested ones included. */
function frameSourceFiles(root: string, frame: string): string[] {
	const dir = join(root, "design", "frames", frame);
	try {
		return readdirSync(dir, { withFileTypes: true, recursive: true })
			.filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
			.map((entry) => join(entry.parentPath, entry.name))
			.sort();
	} catch {
		return [];
	}
}

function declaredTargets(root: string, frame: string): string[] {
	const targets = new Set<string>();
	for (const file of frameSourceFiles(root, frame)) {
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		for (const match of source.matchAll(DATA_GO)) {
			const target = match.slice(1).find((group) => group !== undefined);
			// frame-folder-name targets only (#5) — one rule with the rest of spool
			if (target !== undefined && isSafeName(target)) targets.add(target);
		}
	}
	return [...targets].sort();
}

/**
 * What a frame's source is, for edge freshness: every source file in the
 * folder, names and bytes. "Cache dropped when the source frame changes" (#5)
 * — the frame is its folder.
 */
function frameSourceHash(root: string, frame: string): string {
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

interface WalkedEdge {
	from: string;
	to: string;
	hash: string;
	at: string;
}

function walkedFile(root: string): string {
	return join(root, "design", ".spool", "walked.json");
}

/** Machine-written cache: anything malformed reads as no walks at all. */
function readWalkedEdges(root: string): WalkedEdge[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(walkedFile(root), "utf8"));
	} catch {
		return [];
	}
	if (typeof parsed !== "object" || parsed === null) return [];
	const edges = (parsed as { edges?: unknown }).edges;
	if (!Array.isArray(edges)) return [];
	return edges.filter((edge): edge is WalkedEdge => {
		if (typeof edge !== "object" || edge === null) return false;
		const { from, to, hash, at } = edge as Record<string, unknown>;
		return typeof from === "string" && typeof to === "string" && typeof hash === "string" && typeof at === "string";
	});
}

/** The witnessed edges still standing: both ends alive, the from-frame unedited. */
function liveWalkedEdges(root: string, frames: readonly string[]): WalkedEdge[] {
	const alive = new Set(frames);
	const hashes = new Map<string, string>();
	const sourceHash = (frame: string): string => {
		const cached = hashes.get(frame);
		if (cached !== undefined) return cached;
		const hash = frameSourceHash(root, frame);
		hashes.set(frame, hash);
		return hash;
	};
	return readWalkedEdges(root).filter(
		(edge) => alive.has(edge.from) && alive.has(edge.to) && edge.hash === sourceHash(edge.from),
	);
}

/**
 * A session really took from → to: upsert the edge keyed to the from-frame's
 * current source. Stale edges sweep out with the same write.
 */
export function recordWalk(root: string, from: string, to: string): void {
	const frames = frameNames(root) ?? [];
	const kept = liveWalkedEdges(root, frames).filter((edge) => !(edge.from === from && edge.to === to));
	kept.push({ from, to, hash: frameSourceHash(root, from), at: new Date().toISOString() });
	kept.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
	writeAtomic(walkedFile(root), `${JSON.stringify({ version: 1, edges: kept }, null, "\t")}\n`);
}

/** The graph, derived fresh per read: declared from source, walked from witness. */
export function deriveFlows(root: string): Flows {
	const frames = frameNames(root) ?? [];
	const exists = new Set(frames);
	const links: FlowLink[] = [];
	const declared = new Set<string>();

	for (const from of frames) {
		for (const to of declaredTargets(root, from)) {
			declared.add(`${from}\0${to}`);
			links.push(exists.has(to) ? { from, to, kind: "declared" } : { from, to, kind: "declared", missing: true });
		}
	}
	for (const edge of liveWalkedEdges(root, frames)) {
		// an edge the source already declares is drawn solid — the walk adds nothing
		if (declared.has(`${edge.from}\0${edge.to}`)) continue;
		links.push({ from: edge.from, to: edge.to, kind: "walked" });
	}
	return { frames, links };
}
