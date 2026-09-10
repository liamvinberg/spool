import type { Point } from "./camera";
import type { PickedSelection } from "./overlays";
import type { EditedNode } from "./protocol";

/**
 * A reason a gesture does not apply, in the lane's own shape.
 *
 * The lane's own refusals arrive as this and so do the canvas's, which are the
 * ones about the pick rather than about the file: only the canvas knows what
 * the pointer found. Wider than `PatchRefusal` in its code alone, so a daemon
 * refusal passes for one and the daemon's union stays a list of what the
 * daemon actually answers.
 */
export interface Refusal {
	code: string;
	/** the sentence the surface shows */
	says: string;
	/** what the file says instead, when naming it is the whole of the answer */
	expression?: string;
	/** the line the sentence points at, when editing the file there is the answer (#315) */
	line?: number;
}

/** The pick is a box on screen the file has no line for — JS-created DOM (#6). */
export const GENERATED: Refusal = { code: "generated", says: "drawn by code, not written in the file" };

/** The stamp never arrived, so there is nothing to name the element by. */
export const NO_STAMP: Refusal = { code: "stale-stamp", says: "no stamp of its own" };

/** The frame has nothing answering to that selector any more. */
export const GONE: Refusal = { code: "stale-stamp", says: "the element is no longer there" };

/**
 * Where a refusal is shown: on the element it was about, in its own frame.
 * One that refused words the hand had already typed carries them, and that
 * is what the Ask agent action hands the composer (#314).
 */
export interface ShownRefusal {
	frame: string;
	selector: string;
	refusal: Refusal;
	attempted?: string;
	/** what the hand tried, in plain words, when it was not typing words (#315, #317) */
	asked?: string;
	/** the file the refusal points at, for the link that hands its path out (#315) */
	file?: { path: string; line: number };
}

/** What a structural gesture was, said the way a person would say it (#317). */
export function alterAsk(
	act: "delete" | "hide" | "show" | "attribute",
	tag: string,
	attribute?: { name: string; value: string },
): string {
	if (act === "attribute" && attribute !== undefined) {
		return `Set ${attribute.name} to ${JSON.stringify(attribute.value)} on the ${tag}`;
	}
	if (act === "delete") return `Delete the ${tag}`;
	return `${act === "hide" ? "Hide" : "Show"} the ${tag}`;
}

/**
 * An in-place text edit, from the second click to the frame's `edited`.
 *
 * `opening` is one double-click interval after the caret landed: the frame
 * already has the caret, and the words already take the keys, but its
 * pointer stays the canvas's for that long so the second half of a
 * double-click can still descend the ladder (#254) rather than land in the
 * words. `start` is the words the edit began with, and an edit that ends on
 * the same ones writes nothing at all.
 */
export interface HandEdit {
	frame: string;
	selector: string;
	/** the stamp the write is addressed by */
	source: string;
	/** the ask the frame answers; a reply carrying another is a dead edit */
	id: number;
	/** the hash of the file the rung was read out of, once that read has landed */
	fingerprint: string | undefined;
	phase: "opening" | "open";
	start: string;
}

/** How long the frame's pointer stays out here after the caret lands: a double-click's second half. */
export const OPENING_MS = 300;

/**
 * A stamp after a save moved the stamps on its line (#314): every element on
 * that line past a patch shifts by what the patch added or took. The same
 * arithmetic the frame runs over its own document, for the picks out here.
 */
export function restamped(
	source: string,
	file: string,
	shifts: readonly { line: number; column: number; delta: number }[],
): string {
	const match = /^(.*):(\d+):(\d+)$/.exec(source);
	if (match === null || match[1] !== file) return source;
	const line = Number(match[2]);
	const column = Number(match[3]);
	let moved = column;
	for (const shift of shifts) if (shift.line === line && shift.column < column) moved += shift.delta;
	return `${match[1]}:${line}:${moved}`;
}

/** The words of a node list as one string, which is what an ask carries. */
export function wordsOf(nodes: readonly EditedNode[]): string {
	return nodes.map((node) => ("text" in node ? node.text : node.tag === "br" ? "\n" : wordsOf(node.nodes))).join("");
}

/**
 * What the composer opens holding after a refused edit (#314): the change
 * the hand tried, where, and why the hand could not make it. Plain words,
 * because the agent reads them as a request and the person reads them
 * before sending.
 */
export function askText(refused: ShownRefusal, pick: PickedSelection | undefined): string {
	const where = pick?.source ? ` at design/${pick.source}` : "";
	const what = pick === undefined ? "the element" : `the ${pick.tag}`;
	if (refused.asked !== undefined) {
		return `${refused.asked}${where}. ${refused.refusal.says}, so the hand could not do it in place.`;
	}
	return `Change the words of ${what}${where} to ${JSON.stringify(refused.attempted ?? "")}. ${refused.refusal.says}, so the hand could not write it in place.`;
}

/** The stamp a gesture on this pick would act on, or why there is none. */
export function stampOf(pick: PickedSelection): string | Refusal {
	if (pick.generated) return GENERATED;
	if (pick.source === null || pick.source === "") return NO_STAMP;
	return pick.source;
}

/**
 * Whether this press is the second click on what is already held (#255).
 *
 * The gesture that starts a text edit is a click on an element that was
 * selected before the press — the rename idiom, and the one meaning left over
 * on an element with words of its own, since a double-click there has no rung
 * beneath it to descend to. One rung only: a second click has to mean one
 * element, and the press has to land inside the box that element is drawn in,
 * so a click onto a sibling reads as a move of the selection instead.
 */
export function secondClick(
	picks: readonly PickedSelection[],
	frame: string,
	local: Point,
): PickedSelection | undefined {
	const only = picks.length === 1 ? picks[0] : undefined;
	if (only === undefined || only.frame !== frame) return undefined;
	const { x, y, w, h } = only.rect;
	const inside = local.x >= x && local.x <= x + w && local.y >= y && local.y <= y + h;
	return inside ? only : undefined;
}
