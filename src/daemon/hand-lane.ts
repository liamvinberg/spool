import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, designRelativePath, realDesignDir, resolveDesignPath } from "./design-path";
import {
	type EditedNode,
	type ElementRead,
	fingerprintOf,
	flatText,
	mappedArrayAt,
	type PatchRefusal,
	planItemRemoval,
	planOps,
	readElements,
	STALE_STAMP,
	type StampShift,
	shiftsOf,
	textOwner,
} from "./hand-write";
import { resolveLocalImport } from "./nav-sites";
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
 * One rung as the file has it (#256): what the author called it, where it is
 * written, and the file a write about it is measured against.
 *
 * The properties rail draws before anything is touched, so it needs the read
 * half of the lane's answer: the crumbs are authored names. A rung whose stamp
 * points outside the frame's own folder is a shared definition (#318): it
 * reads and writes exactly as the frame's own do, and says how many frames
 * render it, because that is how far an edit reaches.
 */
export interface RungRead {
	/** the stamp asked about, which is what pairs a reply with its rung */
	source: string;
	/** what the file calls it; absent when the stamp hits nothing any more */
	name?: string;
	/** where it is written: `design/frames/cart/frame.tsx` */
	path?: string;
	line?: number;
	/** the stamp hits nothing any more */
	refusal?: PatchRefusal;
	/** why its words may not be typed into, when the file alone says so (#339) */
	words?: PatchRefusal;
	/**
	 * The stamp's file is outside the frame's own folder (#318), and the frames
	 * the import graph reaches it from: how far an edit reaches, and who has to
	 * reload for it. Absent when the graph has never seen the file, which is
	 * not the same as nobody rendering it.
	 */
	shared?: { frames?: string[] };
	/**
	 * The hash of the file this rung was read out of.
	 *
	 * A write carries this, so it is measured against the file the surface
	 * actually drew — the same promise every other op keeps, made from the read
	 * rather than from a second round trip (#260).
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
	const folder = `${frameFolder(frame)}/`;
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
			rungs.push({ source, refusal: STALE_STAMP });
			continue;
		}
		const at = taken.get(stamp.file) ?? 0;
		taken.set(stamp.file, at + 1);
		const held = byFile.get(stamp.file);
		const read = held?.reads[at];
		if (read === undefined) {
			rungs.push({ source, path: `design/${stamp.rel}`, line: stamp.line, refusal: STALE_STAMP });
			continue;
		}
		rungs.push({
			source,
			name: read.name,
			path: `design/${stamp.rel}`,
			line: stamp.line,
			...(read.words === undefined ? {} : { words: read.words }),
			...(stamp.rel.startsWith(folder) ? {} : { shared: await sharedUse(deps, stamp.rel) }),
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
 * One structural change as the canvas sends it (#317): what to do, where, and
 * the fingerprint of the file the rung was read from.
 */
export interface ElementAsk {
	act: "delete";
	/**
	 * The stamps the gesture is about (#323).
	 *
	 * Several when a multi-pick is deleted. They are one file's, because one
	 * write is one fingerprint and one span — the lane's own law — and
	 * `planOps` orders the patches itself, so nothing here has to sort them
	 * bottom-up to keep the later stamps from shifting under the earlier ones.
	 */
	sources: readonly string[];
	fingerprint: string;
	/**
	 * The row a delete is about (#324).
	 *
	 * A `.map()` renders one JSX element once per entry, so the stamp under the
	 * pointer is every row at once and deleting its characters would take the
	 * row off all of them. Only the running document can say which entry was
	 * picked: this is the stamp of the element the map renders, where in the
	 * array it stood, and the fingerprint of the file that stamp is in. The
	 * write lands on the array literal rather than on the JSX.
	 */
	item?: { source: string; index: number; fingerprint: string };
}

/**
 * Where a delete lands (#317).
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
	const [first] = ask.sources;
	if (first === undefined) return { kind: "error", status: 400, message: "an element write names a stamp" };
	const place = siteAt(root, frame, first, ask.fingerprint);
	if ("kind" in place) return place;
	const { at, source } = place;
	if (ask.item !== undefined) return itemSite(root, frame, ask.item);
	const here = planOps(
		source,
		ask.sources.map((stamped) => ({ kind: "delete" as const, source: stamped })),
	);
	if (!here.ok) return { kind: "refusal", refusal: here.refusal };
	return spliced(at, source, here);
}

/**
 * Where deleting one row of a list lands (#324).
 *
 * Not on the JSX the stamp names — that literal is every row — but on the
 * array the `.map()` runs over: the entry at the index the document reported,
 * out of its literal, with its comma and its own line. The array is written
 * beside the map or imported from another file under design/, and an import is
 * followed to the file the entry actually lives in, which is the one the patch
 * comes back against. Anything the file cannot show as an array literal — a
 * call, a fetched value, a prop — is named and refused.
 *
 * A stamp that turns out not to be inside a `.map()` at all is not a row, so
 * the ordinary delete of that element is the honest answer and it gets it.
 */
function itemSite(
	root: string,
	frame: string,
	item: { source: string; index: number; fingerprint: string },
): WriteSite {
	const place = siteAt(root, frame, item.source, item.fingerprint);
	if ("kind" in place) return place;
	const { at, source } = place;
	const held = mappedArrayAt(source, { line: at.line, column: at.column }, at.rel);
	if (held.kind === "refusal") return { kind: "refusal", refusal: held.refusal };
	if (held.kind === "plain") return planned(at, source, [{ kind: "delete", source: item.source }]);
	if (held.kind === "here") {
		const plan = planItemRemoval(source, held.name, item.index);
		if ("refusal" in plan) return { kind: "refusal", refusal: plan.refusal };
		return spliced(at, source, {
			ok: true,
			text: applyAll(source, plan.patches),
			patches: plan.patches,
			mapped: true,
		});
	}
	const file = importedFile(root, at.file, held.specifier);
	if (file === undefined) {
		return {
			kind: "refusal",
			refusal: {
				code: "mapped-expression",
				says: `these rows come from \`${held.callee}\`, imported from outside design/; ask the agent`,
				expression: held.callee,
			},
		};
	}
	let arraySource: string;
	try {
		arraySource = readFileSync(file.file, "utf8");
	} catch {
		return { kind: "refusal", refusal: STALE_STAMP };
	}
	const plan = planItemRemoval(arraySource, held.name, item.index);
	if ("refusal" in plan) return { kind: "refusal", refusal: plan.refusal };
	return spliced({ ...file, line: 1, column: 1 }, arraySource, {
		ok: true,
		text: applyAll(arraySource, plan.patches),
		patches: plan.patches,
		mapped: true,
	});
}

/** The file one relative specifier in a design/ source lands on, inside design/. */
function importedFile(root: string, from: string, specifier: string): { file: string; rel: string } | undefined {
	let designDir: string;
	try {
		designDir = realDesignDir(root);
	} catch {
		return undefined;
	}
	const file = resolveLocalImport(designDir, from, specifier);
	if (file === undefined) return undefined;
	return { file, rel: designRelativePath(designDir, file) };
}

/** The patches over the text, from the back, so an earlier one never moves a later one. */
function applyAll(source: string, patches: readonly { start: number; end: number; text: string }[]): string {
	let text = source;
	for (const patch of [...patches].sort((a, b) => b.start - a.start)) {
		text = text.slice(0, patch.start) + patch.text + text.slice(patch.end);
	}
	return text;
}

/** The ops planned against one file, the frame's own or a shared definition's alike (#318). */
function planned(stamp: Stamp, source: string, ops: Parameters<typeof planOps>[1]): WriteSite {
	const plan = planOps(source, ops);
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
