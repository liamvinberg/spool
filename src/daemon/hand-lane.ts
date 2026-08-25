import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import {
	type ElementRead,
	fingerprintOf,
	type HandOp,
	type PatchRefusal,
	planOps,
	readElements,
	STALE_STAMP,
} from "./hand-write";
import { frameFolder, lookupFrame } from "./projection";
import { parseStamp } from "./selection";

/**
 * Where a patch lands (#253), which is the half of the write lane that knows
 * about the project rather than about JSX.
 *
 * It resolves the ops' stamps to one file, holds v1's scope — the frame's own
 * file and nothing else — checks the fingerprint the canvas formed the op
 * against, and hands back the bytes the file would have. Both the ask and the
 * write run it, so a control greys for exactly the reason a gesture would have
 * been refused, and neither one keeps a mirror of the file: it is read again
 * every time.
 */

export interface LaneDeps {
	/**
	 * The frames whose source graph reaches one design-relative file. Awaited,
	 * because the count is the blast radius a shared-file refusal is mostly
	 * about and it is worth building the graph to say it.
	 */
	framesUsing(path: string): Promise<readonly string[] | undefined>;
}

export type PatchSite =
	| {
			kind: "ok";
			/** the file on disk, resolved through design/'s boundary */
			file: string;
			/** how the canvas spells it: `design/frames/cart/frame.tsx` */
			path: string;
			source: string;
			/** the file as the ops would leave it, byte-identical outside them */
			text: string;
			mapped: boolean;
			fingerprint: string;
	  }
	| { kind: "refusal"; refusal: PatchRefusal }
	| { kind: "error"; status: 400 | 404; message: string };

export async function patchSite(
	root: string,
	frame: string,
	ops: readonly HandOp[],
	deps: LaneDeps,
	fingerprint?: string,
): Promise<PatchSite> {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { kind: "error", status: 404, message: `no frame "${frame}" to edit` };
	const folder = `${frameFolder(frame, found.page)}/`;
	let file: string | undefined;
	let rel: string | undefined;
	for (const op of ops) {
		let stamp: ReturnType<typeof parseStamp>;
		try {
			stamp = parseStamp(root, op.source);
		} catch (error) {
			// a stamp that resolves out of design/ through a symlink is the
			// boundary's answer, not a 500
			if (error instanceof DesignBoundaryError) return { kind: "error", status: 400, message: error.message };
			throw error;
		}
		if (stamp === undefined) return { kind: "refusal", refusal: STALE_STAMP };
		if (!stamp.rel.startsWith(folder)) {
			// v1 scopes writes to the frame's own file: a stamp anywhere else is a
			// definition site, and editing one instance would edit them all
			return { kind: "refusal", refusal: await definedElsewhere(deps, stamp.rel, stamp.line) };
		}
		if (file !== undefined && file !== stamp.file) {
			return { kind: "error", status: 400, message: "one gesture writes one file" };
		}
		file = stamp.file;
		rel = stamp.rel;
	}
	if (file === undefined || rel === undefined) return { kind: "error", status: 400, message: "no ops to apply" };
	let source: string;
	try {
		source = readFileSync(file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	const current = fingerprintOf(source);
	// the fingerprint is what makes an agent and a hand safe in the same file: a
	// mismatch refuses and re-picks rather than landing somewhere wrong
	if (fingerprint !== undefined && fingerprint !== current) {
		return { kind: "refusal", refusal: STALE_FILE };
	}
	const planned = planOps(source, ops);
	if (!planned.ok) return { kind: "refusal", refusal: planned.refusal };
	return {
		kind: "ok",
		file,
		path: `design/${rel}`,
		source,
		text: planned.text,
		mapped: planned.mapped,
		fingerprint: current,
	};
}

export const STALE_FILE: PatchRefusal = { code: "stale-file", says: "the file changed underneath" };

/**
 * One rung as the file has it (#256): what the author called it, the literal
 * it carries, and why no hand may write that literal when none may.
 *
 * The properties rail draws before anything is touched, so it needs the read
 * half of the lane's answer: the crumbs are authored names, the scope bar is
 * the variant chains the literal carries, and the source line is the literal.
 * A rung whose stamp points outside the frame's own folder is still read —
 * the crumbs have to name it — and carries the shared refusal the write would
 * have given, so nothing about it looks adjustable.
 */
export interface RungRead {
	/** the stamp asked about, which is what pairs a reply with its rung */
	source: string;
	/** what the file calls it; absent when the stamp hits nothing any more */
	name?: string;
	/** the literal className, empty when the element carries none */
	className: string;
	/** where it is written: `design/frames/cart/frame.tsx` */
	path?: string;
	line?: number;
	refusal?: PatchRefusal;
	/** the element sits inside a `map`: one literal, every rendered row */
	mapped?: true;
}

export type RungsRead = { kind: "ok"; rungs: RungRead[] } | { kind: "error"; status: 400 | 404; message: string };

export async function readRungs(
	root: string,
	frame: string,
	sources: readonly string[],
	deps: LaneDeps,
): Promise<RungsRead> {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { kind: "error", status: 404, message: `no frame "${frame}" to read` };
	const folder = `${frameFolder(frame, found.page)}/`;
	const stamps = sources.map((source) => {
		try {
			return parseStamp(root, source);
		} catch (error) {
			// a stamp that leaves design/ through a symlink is the boundary's
			// answer, and for a read it is simply a rung with nothing behind it
			if (error instanceof DesignBoundaryError) return undefined;
			throw error;
		}
	});
	// one parse per file rather than one per rung: an ancestry is nearly always
	// the same file over and over
	const byFile = new Map<string, { at: { line: number; column: number }[]; reads: (ElementRead | undefined)[] }>();
	for (const stamp of stamps) {
		if (stamp === undefined) continue;
		const held = byFile.get(stamp.file) ?? { at: [], reads: [] };
		held.at.push({ line: stamp.line, column: stamp.column });
		byFile.set(stamp.file, held);
	}
	for (const [file, held] of byFile) {
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			held.reads = held.at.map(() => undefined);
			continue;
		}
		held.reads = readElements(source, held.at);
	}
	const taken = new Map<string, number>();
	const rungs: RungRead[] = [];
	for (const [index, stamp] of stamps.entries()) {
		const source = sources[index] ?? "";
		if (stamp === undefined) {
			rungs.push({ source, className: "", refusal: STALE_STAMP });
			continue;
		}
		const at = taken.get(stamp.file) ?? 0;
		taken.set(stamp.file, at + 1);
		const read = byFile.get(stamp.file)?.reads[at];
		if (read === undefined) {
			rungs.push({ source, className: "", path: `design/${stamp.rel}`, line: stamp.line, refusal: STALE_STAMP });
			continue;
		}
		// v1 writes the frame's own file and nothing else, so an element defined
		// anywhere else reads whole and adjusts nowhere
		const refusal = stamp.rel.startsWith(folder) ? read.refusal : await definedElsewhere(deps, stamp.rel, stamp.line);
		rungs.push({
			source,
			name: read.name,
			className: read.className,
			path: `design/${stamp.rel}`,
			line: stamp.line,
			...(refusal === undefined ? {} : { refusal }),
			...(read.mapped ? { mapped: true as const } : {}),
		});
	}
	return { kind: "ok", rungs };
}

async function definedElsewhere(deps: LaneDeps, rel: string, line: number): Promise<PatchRefusal> {
	const readers = await deps.framesUsing(rel);
	// the count is the point of the sentence — how much would move if this edit
	// landed — so it is said whenever the graph can say it
	const rendered =
		readers === undefined ? "" : `, rendered by ${readers.length} frame${readers.length === 1 ? "" : "s"}`;
	return { code: "shared-definition", says: `defined in ${rel}:${line}${rendered}` };
}

/**
 * The file a revert names, or why it is not one.
 *
 * A revert carries a path rather than a stamp, so it is the one call where the
 * lane's scope has to be checked against the path itself: frame source, inside
 * design/, and never an app-owned file — `canvas.json` and `.spool/` are
 * spool's, and no patch has any business in them.
 */
export function revertTarget(root: string, path: string): { file: string } | { status: 400 | 404; message: string } {
	if (!path.startsWith("design/frames/")) return { status: 400, message: "a revert puts back frame source" };
	const rel = path.slice("design/".length);
	if (rel.split("/").includes(".spool")) return { status: 400, message: "a revert puts back frame source" };
	try {
		const designDir = realDesignDir(root);
		return { file: resolveDesignPath(designDir, join(designDir, rel), path) };
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { status: 400, message: error.message };
		throw error;
	}
}
