import { readFileSync } from "node:fs";
import { DesignBoundaryError } from "./design-path";
import {
	type AttributeRead,
	type ElementRead,
	fingerprintOf,
	type PatchRefusal,
	readElements,
	STALE_STAMP,
} from "./hand-write";
import { frameFolder, lookupFrame } from "./projection";
import { parseStamp } from "./selection";

/**
 * What the rail's read needs from the project (#256): the frames whose source
 * graph reaches one design-relative file. Awaited, because the count is the
 * blast radius a shared-file refusal is mostly about.
 */
export interface LaneDeps {
	framesUsing(path: string): Promise<readonly string[] | undefined>;
}

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
	/** every other attribute the tag carries, as the file writes it (#260) */
	attributes?: AttributeRead[];
	/**
	 * The hash of the file this rung was read out of.
	 *
	 * A gesture that forms its op from what a row shows carries this, so the
	 * write is measured against the file the rail actually drew — the same
	 * promise every other op keeps, made from the read rather than from a
	 * second round trip (#260).
	 */
	fingerprint?: string;
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
	const byFile = new Map<
		string,
		{ at: { line: number; column: number }[]; reads: (ElementRead | undefined)[]; fingerprint?: string }
	>();
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
		held.fingerprint = fingerprintOf(source);
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
		const held = byFile.get(stamp.file);
		const read = held?.reads[at];
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
			...(read.attributes.length === 0 ? {} : { attributes: read.attributes }),
			...(held?.fingerprint === undefined ? {} : { fingerprint: held.fingerprint }),
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
