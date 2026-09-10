import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClassEdit, ClassTheme } from "./class-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import {
	type AttributeRead,
	type EditedNode,
	type ElementRead,
	fingerprintOf,
	flatText,
	type PatchRefusal,
	planOps,
	readElements,
	STALE_STAMP,
	type StampShift,
	shiftsOf,
	textOwner,
} from "./hand-write";
import { frameFolder, lookupFrame } from "./projection";
import { parseStamp, type Stamp } from "./selection";

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
		{ rel: string; at: { line: number; column: number }[]; reads: (ElementRead | undefined)[]; fingerprint?: string }
	>();
	for (const stamp of stamps) {
		if (stamp === undefined) continue;
		const held = byFile.get(stamp.file) ?? { rel: stamp.rel, at: [], reads: [] };
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
		held.reads = readElements(source, held.at, held.rel);
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

/** The file moved under the read the op was formed against. */
export const STALE_FILE: PatchRefusal = { code: "stale-file", says: "the file changed underneath" };

/**
 * A text commit as the canvas sends it (#314): the element's stamp, its child
 * nodes as the frame has them now, the call site one owner up when the frame
 * knows it, and the fingerprint of the file the rung was read from.
 */
export interface TextAsk {
	source: string;
	nodes: readonly EditedNode[];
	owner?: string;
	fingerprint: string;
}

export type TextSite =
	| {
			kind: "ok";
			/** the file on disk, resolved through design/'s boundary */
			file: string;
			/** how the canvas spells it: `design/frames/cart/frame.tsx` */
			path: string;
			source: string;
			/** the file as the write leaves it, byte-identical outside the words */
			text: string;
			/** how the stamps on the patched lines moved, or nothing when only a reload can say */
			shifts: StampShift[] | null;
	  }
	| { kind: "refusal"; refusal: PatchRefusal }
	| { kind: "error"; status: 400 | 404; message: string };

/**
 * Where a text write lands (#314).
 *
 * The element's own file decides whose words they are: its own, spliced at
 * the stamp, or a call site's, spliced one owner up. The fingerprint is the
 * element file's — the file the rung was read out of, and the one the DOM
 * the hand edited was rendered from — and a mismatch refuses rather than
 * landing somewhere wrong. Both files are read again here, never mirrored.
 */
export async function textSite(root: string, frame: string, ask: TextAsk, deps: LaneDeps): Promise<TextSite> {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { kind: "error", status: 404, message: `no frame "${frame}" to edit` };
	const folder = `${frameFolder(frame, found.page)}/`;
	const stamp = stampIn(root, ask.source);
	if ("message" in stamp) return { kind: "error", ...stamp };
	if (stamp.stamp === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	const at = stamp.stamp;
	let source: string;
	try {
		source = readFileSync(at.file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	if (fingerprintOf(source) !== ask.fingerprint) return { kind: "refusal", refusal: STALE_FILE };
	const owner = textOwner(source, at.line, at.column);
	if (owner === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	if (owner.kind === "own") {
		// this ticket writes the frame's own file: an element defined anywhere
		// else reads whole and adjusts nowhere yet
		if (!at.rel.startsWith(folder)) {
			return { kind: "refusal", refusal: await definedElsewhere(deps, at.rel, at.line) };
		}
		return planned(at, source, [{ kind: "set-text", source: ask.source, nodes: ask.nodes }]);
	}
	// supplied words: the literal lives at the call site the runtime named
	const expression = {
		code: "expression-text" as const,
		says: `{${owner.prop}} is an expression; edit it in code or ask the agent`,
		expression: `{${owner.prop}}`,
	};
	if (ask.owner === undefined) return { kind: "refusal", refusal: expression };
	const call = stampIn(root, ask.owner);
	if ("message" in call) return { kind: "error", ...call };
	if (call.stamp === undefined) return { kind: "refusal", refusal: expression };
	if (!call.stamp.rel.startsWith(folder)) {
		return { kind: "refusal", refusal: await definedElsewhere(deps, call.stamp.rel, call.stamp.line) };
	}
	let callSource: string;
	try {
		callSource = readFileSync(call.stamp.file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	return planned(call.stamp, callSource, [
		{ kind: "set-supplied", source: ask.owner, prop: owner.prop, text: flatText(ask.nodes) },
	]);
}

/**
 * One class change as the rail sends it (#315): the element's stamp, the
 * tokens it wants on or off under their scopes, and the fingerprint of the
 * file the rung was read from. Several edits are one write, because one
 * gesture can decide two properties.
 */
export interface ClassAsk {
	source: string;
	edits: readonly ClassEdit[];
	fingerprint: string;
}

export type ClassSite =
	| (Extract<TextSite, { kind: "ok" }> & {
			/** the literal before and after, which is what the frame swaps on the element */
			className: { was: string; now: string };
	  })
	| Exclude<TextSite, { kind: "ok" }>;

/**
 * Where a class write lands (#315): the element's own file, at its stamp,
 * through the Tailwind class planner. The frame already shows the change as
 * an inline style; this is the one write behind it, and the answer is the
 * literal as it was and as it is, so the frame can set the attribute and
 * drop the preview without a reload.
 */
export async function classSite(
	root: string,
	frame: string,
	ask: ClassAsk,
	deps: LaneDeps,
	theme: ClassTheme | undefined,
): Promise<ClassSite> {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { kind: "error", status: 404, message: `no frame "${frame}" to edit` };
	const folder = `${frameFolder(frame, found.page)}/`;
	const stamp = stampIn(root, ask.source);
	if ("message" in stamp) return { kind: "error", ...stamp };
	if (stamp.stamp === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	const at = stamp.stamp;
	let source: string;
	try {
		source = readFileSync(at.file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	if (fingerprintOf(source) !== ask.fingerprint) return { kind: "refusal", refusal: STALE_FILE };
	// this ticket writes the frame's own file: an element defined anywhere
	// else reads whole and adjusts nowhere yet
	if (!at.rel.startsWith(folder)) return { kind: "refusal", refusal: await definedElsewhere(deps, at.rel, at.line) };
	const [before] = readElements(source, [{ line: at.line, column: at.column }], at.rel);
	if (before === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	if (before.refusal !== undefined) return { kind: "refusal", refusal: before.refusal };
	const site = planned(
		at,
		source,
		ask.edits.map((edit) => ({ kind: "set-class" as const, source: ask.source, ...edit })),
		theme,
	);
	if (site.kind !== "ok") return site;
	const [after] = readElements(site.text, [{ line: at.line, column: at.column }], at.rel);
	return { ...site, className: { was: before.className, now: after?.className ?? before.className } };
}

function planned(stamp: Stamp, source: string, ops: Parameters<typeof planOps>[1], theme?: ClassTheme): TextSite {
	const plan = planOps(source, ops, theme);
	if (!plan.ok) return { kind: "refusal", refusal: plan.refusal };
	return {
		kind: "ok",
		file: stamp.file,
		path: `design/${stamp.rel}`,
		source,
		text: plan.text,
		shifts: shiftsOf(source, plan.patches),
	};
}

/** A stamp resolved through design/'s boundary: the place, nothing, or the boundary's own no. */
function stampIn(root: string, source: string): { stamp: Stamp | undefined } | { status: 400; message: string } {
	try {
		return { stamp: parseStamp(root, source) };
	} catch (error) {
		// a stamp that resolves out of design/ through a symlink is the
		// boundary's answer, not a 500
		if (error instanceof DesignBoundaryError) return { status: 400, message: error.message };
		throw error;
	}
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
