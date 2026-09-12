import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ClassEdit, ClassTheme } from "./class-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { assetChosen, assetDestination, assetName, identifierHint, overBudget, specifierFrom } from "./hand-asset";
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
 * What the rail's read needs from the project (#256, #318): the frames whose
 * source graph reaches one design-relative file. Awaited, because they are
 * how far an edit to a shared file reaches, and whose paint the canvas holds
 * when one lands.
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
 * A rung whose stamp points outside the frame's own folder is a shared
 * definition (#318): it reads and writes exactly as the frame's own do, and
 * says how many frames render it, because that is how far an edit reaches.
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
	/**
	 * The stamp's file is outside the frame's own folder (#318), and the frames
	 * the import graph reaches it from: how far an edit reaches, and who has to
	 * reload for it. Absent when the graph has never seen the file, which is
	 * not the same as nobody rendering it.
	 */
	shared?: { frames?: string[] };
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
		rungs.push({
			source,
			name: read.name,
			className: read.className,
			path: `design/${stamp.rel}`,
			line: stamp.line,
			...(read.refusal === undefined ? {} : { refusal: read.refusal }),
			...(read.mapped ? { mapped: true as const } : {}),
			...(stamp.rel.startsWith(folder) ? {} : { shared: await sharedUse(deps, stamp.rel) }),
			...(read.attributes.length === 0 ? {} : { attributes: read.attributes }),
			...(held?.fingerprint === undefined ? {} : { fingerprint: held.fingerprint }),
		});
	}
	return { kind: "ok", rungs };
}

/** How far an edit to a shared file reaches, said whenever the graph can say it. */
async function sharedUse(deps: LaneDeps, rel: string): Promise<{ frames?: string[] }> {
	const readers = await deps.framesUsing(rel);
	return readers === undefined ? {} : { frames: [...readers] };
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
	/**
	 * The hash of the call site's own file, when the canvas holds one.
	 *
	 * A supplied word lands one owner up, in a second file, and that file is
	 * owed the same promise as the element's: the write is measured against
	 * what the surface read. The canvas holds it whenever the call site is a
	 * rung it read or a file it just saved; where it holds none the daemon's
	 * own read of the call is the first anybody has seen of that file, and
	 * there is nothing for it to have moved from.
	 */
	ownerFingerprint?: string;
}

export type WriteSite =
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
 * the stamp, or a call site's, spliced one owner up. Each file is measured
 * against the fingerprint the surface read it out of — the element's always,
 * the call site's whenever the canvas holds one — and a mismatch refuses
 * rather than landing somewhere wrong. Both files are read again here, never
 * mirrored. A shared definition's own words are written in the shared file
 * (#318).
 */
export function textSite(root: string, frame: string, ask: TextAsk): WriteSite {
	const place = siteAt(root, frame, ask.source, ask.fingerprint);
	if ("kind" in place) return place;
	const { at, source } = place;
	const owner = textOwner(source, at.line, at.column);
	if (owner === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	if (owner.kind === "own") return planned(at, source, [{ kind: "set-text", source: ask.source, nodes: ask.nodes }]);
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
	let callSource: string;
	try {
		callSource = readFileSync(call.stamp.file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	if (ask.ownerFingerprint !== undefined && fingerprintOf(callSource) !== ask.ownerFingerprint) {
		return { kind: "refusal", refusal: STALE_FILE };
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
	/**
	 * The stamps the same edits land on (#323).
	 *
	 * One for a single rung, several when a multi-pick writes a row: the same
	 * tokens go to each held element, and they are one file's, so the whole of
	 * it is one write, one span and one press of undo.
	 */
	sources: readonly string[];
	edits: readonly ClassEdit[];
	fingerprint: string;
}

export type ClassSite =
	| (Extract<WriteSite, { kind: "ok" }> & {
			/** the literal before and after per stamp, which is what the frame swaps on each element */
			classNames: readonly { source: string; was: string; now: string }[];
	  })
	| Exclude<WriteSite, { kind: "ok" }>;

/**
 * Where a class write lands (#315): the element's file, at its stamp, through
 * the Tailwind class planner — the frame's own or a shared definition's
 * (#318), which is the same write with more frames behind it. The frame
 * already shows the change as an inline style; this is the one write behind
 * it, and the answer is the literal as it was and as it is, so the frame can
 * set the attribute and drop the preview without a reload.
 */
export function classSite(root: string, frame: string, ask: ClassAsk, theme: ClassTheme | undefined): ClassSite {
	const first = ask.sources[0];
	if (first === undefined) return { kind: "error", status: 400, message: "a class edit names a stamp" };
	const place = siteAt(root, frame, first, ask.fingerprint);
	if ("kind" in place) return place;
	const { at, source } = place;
	const places = ask.sources.map((stamped) => parseStamp(root, stamped));
	const marks = places.map((stamp) => ({ line: stamp?.line ?? 0, column: stamp?.column ?? 0 }));
	const before = readElements(source, marks, at.rel);
	for (const read of before) {
		if (read === undefined) return { kind: "refusal", refusal: STALE_STAMP };
		if (read.refusal !== undefined) return { kind: "refusal", refusal: read.refusal };
	}
	const site = planned(
		at,
		source,
		ask.sources.flatMap((stamped) =>
			ask.edits.map((edit) => ({ kind: "set-class" as const, source: stamped, ...edit })),
		),
		theme,
	);
	if (site.kind !== "ok") return site;
	// the stamps on a line move with what the write put there, so each literal
	// is read back where the shifts say it now stands
	const moved = marks.map((mark) => ({ line: mark.line, column: shiftedColumn(mark, site.shifts ?? []) }));
	const after = readElements(site.text, moved, at.rel);
	return {
		...site,
		classNames: ask.sources.map((stamped, index) => ({
			source: stamped,
			was: before[index]?.className ?? "",
			now: after[index]?.className ?? before[index]?.className ?? "",
		})),
	};
}

/** Where a stamp's column stands after a write moved the ones before it on its line (#323). */
function shiftedColumn(at: { line: number; column: number }, shifts: readonly StampShift[]): number {
	let moved = at.column;
	for (const shift of shifts) {
		if (shift.line === at.line && shift.column + shift.taken <= moved) moved += shift.delta;
	}
	return moved;
}

/**
 * One structural change as the canvas sends it (#317): what to do, where, and
 * the fingerprint of the file the rung was read from.
 */
export interface ElementAsk {
	act: "delete" | "hide" | "show" | "attribute";
	/**
	 * The stamps the gesture is about (#323).
	 *
	 * One for every act but a delete, which a multi-pick makes several of. They
	 * are one file's, because one write is one fingerprint and one span — the
	 * lane's own law — and `planOps` orders the patches itself, so nothing here
	 * has to sort them bottom-up to keep the later stamps from shifting under
	 * the earlier ones.
	 */
	sources: readonly string[];
	/** the attribute an `attribute` ask writes, and what it writes there */
	name?: string;
	value?: string;
	fingerprint: string;
}

/**
 * Where a delete, a hide, a show or an attribute lands (#317).
 *
 * The same promise every other write in the lane makes: the file is parsed
 * fresh at the stamp, measured against the fingerprint the surface read it out
 * of, and spliced or refused. A shared definition is written where it is
 * defined, exactly as the frame's own is (#318). A delete of something that is
 * all of a component refuses like any other: no body can lose its whole
 * return, and the honest next gesture — deleting the call that renders it — is
 * one the person makes, on the call's own stamp and against the call's own
 * file, rather than one this quietly makes for them.
 */
export function elementSite(root: string, frame: string, ask: ElementAsk): WriteSite {
	const [first, ...rest] = ask.sources;
	if (first === undefined) return { kind: "error", status: 400, message: "an element write names a stamp" };
	if (rest.length > 0 && ask.act !== "delete") {
		return { kind: "error", status: 400, message: "only a delete is about more than one element" };
	}
	const place = siteAt(root, frame, first, ask.fingerprint);
	if ("kind" in place) return place;
	const { at, source } = place;
	if (ask.act === "delete") {
		const here = planOps(
			source,
			ask.sources.map((stamped) => ({ kind: "delete" as const, source: stamped })),
		);
		if (!here.ok) return { kind: "refusal", refusal: here.refusal };
		return spliced(at, source, here);
	}
	if (ask.act === "attribute") {
		const { name, value } = ask;
		if (name === undefined || value === undefined) {
			return { kind: "error", status: 400, message: "an attribute write names one and says what it holds" };
		}
		return planned(at, source, [{ kind: "set-attribute", source: first, name, value }]);
	}
	return planned(at, source, [{ kind: "set-hidden", source: first, hidden: ask.act === "hide" }]);
}

/** The ops planned against one file, the frame's own or a shared definition's alike (#318). */
function planned(stamp: Stamp, source: string, ops: Parameters<typeof planOps>[1], theme?: ClassTheme): WriteSite {
	const plan = planOps(source, ops, theme);

	if (!plan.ok) return { kind: "refusal", refusal: plan.refusal };
	return spliced(stamp, source, plan);
}

function spliced(stamp: Stamp, source: string, plan: Extract<ReturnType<typeof planOps>, { ok: true }>): WriteSite {
	return {
		kind: "ok",
		file: stamp.file,
		path: `design/${stamp.rel}`,
		source,
		text: plan.text,
		shifts: shiftsOf(source, plan.patches),
	};
}

/* ---------- the picture on an image (#260, back on the lane for #317) ---------- */

/** Whether an import written into this file lands on something still inside design/. */
function reachesAsset(root: string, file: string, specifier: string): boolean {
	try {
		const designDir = realDesignDir(root);
		resolveDesignPath(designDir, resolve(dirname(file), specifier));
		return true;
	} catch (error) {
		if (error instanceof DesignBoundaryError) return false;
		throw error;
	}
}

/** The picture an asset swap points at: bytes a hand just dropped, or a file the project already holds. */
export type AssetPut = { kind: "new"; name: string; bytes: Buffer } | { kind: "held"; path: string };

export type AssetSite =
	| (Extract<WriteSite, { kind: "ok" }> & {
			/** the picture, and whether its bytes still have to be put on disk */
			asset: { file: string; path: string; write: boolean; bytes: Buffer | undefined };
	  })
	| { kind: "refusal"; refusal: PatchRefusal }
	| { kind: "error"; status: 400 | 404; message: string };

/**
 * The asset swap, from the picture to the characters (#260).
 *
 * Everything the write lane cannot know: where the file goes, what the import
 * may be called, and whether one document can carry it. What comes back is the
 * file as the swap would leave it and the bytes still owed to disk, so the
 * caller writes the picture first and the source second — a document that
 * reloads between them must never find an import of a file that is not there
 * yet. A shared definition's picture is swapped where it is defined (#318);
 * the file itself still lands beside the frame the hand was in.
 */
export function assetSite(
	root: string,
	frame: string,
	stampedAt: string,
	put: AssetPut,
	fingerprint: string,
): AssetSite {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { kind: "error", status: 404, message: `no frame "${frame}" to edit` };
	const place = siteAt(root, frame, stampedAt, fingerprint);
	if ("kind" in place) return place;
	const { at, source } = place;

	const asset = resolveAsset(root, found.dir, put);
	if ("refusal" in asset) return { kind: "refusal", refusal: asset.refusal };
	if ("message" in asset) return { kind: "error", status: asset.status, message: asset.message };
	const specifier = specifierFrom(at.file, asset.file);
	// a specifier is a path, and every path a hand names is checked against
	// design/'s own boundary before anything is written through it
	if (!reachesAsset(root, at.file, specifier)) {
		return { kind: "error", status: 400, message: "an import reaches a project asset" };
	}
	const site = planned(at, source, [
		{ kind: "set-asset", source: stampedAt, specifier, hint: identifierHint(asset.name) },
	]);
	if (site.kind !== "ok") return site;
	return { ...site, asset: { file: asset.file, path: asset.path, write: asset.write, bytes: asset.bytes } };
}

type ResolvedAsset =
	| { file: string; path: string; name: string; write: boolean; bytes: Buffer | undefined }
	| { refusal: PatchRefusal }
	| { status: 400 | 404; message: string };

function resolveAsset(root: string, frameDir: string, put: AssetPut): ResolvedAsset {
	try {
		if (put.kind === "held") {
			const chosen = assetChosen(root, put.path);
			if (chosen === undefined) return { status: 404, message: `no image at design/${put.path}` };
			const over = overBudget(chosen.bytes);
			if (over !== undefined) return { refusal: over };
			const name = put.path.split("/").at(-1) ?? put.path;
			return { file: chosen.file, path: put.path, name, write: false, bytes: undefined };
		}
		const name = assetName(put.name);
		if (name === undefined) return { status: 400, message: `"${put.name}" is not an image spool writes` };
		const over = overBudget(put.bytes.length);
		if (over !== undefined) return { refusal: over };
		const where = assetDestination(root, frameDir, name, put.bytes);
		return { ...where, name, bytes: where.write ? put.bytes : undefined };
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { status: 400, message: error.message };
		throw error;
	}
}

/**
 * Where a write is about to land, or why it is not landing (#314–#318).
 *
 * Every op in the lane opens the same way: the frame has to exist, the stamp
 * has to resolve inside design/, the file has to be there, and it has to be
 * the file the surface read the rung out of. Four gestures asked those four
 * questions in four places, and a gate written four times is four gates.
 */
type Site =
	| { at: Stamp; source: string }
	| { kind: "refusal"; refusal: PatchRefusal }
	| { kind: "error"; status: 400 | 404; message: string };

function siteAt(root: string, frame: string, stamped: string, fingerprint: string): Site {
	const found = lookupFrame(root, frame);
	if (found.kind !== "found") return { kind: "error", status: 404, message: `no frame "${frame}" to edit` };
	const stamp = stampIn(root, stamped);
	if ("message" in stamp) return { kind: "error", ...stamp };
	if (stamp.stamp === undefined) return { kind: "refusal", refusal: STALE_STAMP };
	let source: string;
	try {
		source = readFileSync(stamp.stamp.file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	if (fingerprintOf(source) !== fingerprint) return { kind: "refusal", refusal: STALE_FILE };
	return { at: stamp.stamp, source };
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
 * lane's scope has to be checked against the path itself: source under
 * `frames/` or `shared/` (#318), inside design/, and never an app-owned file
 * — `canvas.json` and `.spool/` are spool's, and no patch has any business in
 * them.
 */
export function revertTarget(root: string, path: string): { file: string } | { status: 400 | 404; message: string } {
	if (!path.startsWith("design/frames/") && !path.startsWith("design/shared/")) {
		return { status: 400, message: "a revert puts back frame source" };
	}
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
