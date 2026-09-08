import type { SourceRead } from "../../source-edit";
import type { Point } from "./camera";
import type { PickedSelection } from "./overlays";
import type { SourceIntent } from "./source-intent";

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
}

/** The pick is a box on screen the file has no line for — JS-created DOM (#6). */
export const GENERATED: Refusal = { code: "generated", says: "drawn by code, not written in the file" };

/** The stamp never arrived, so there is nothing to name the element by. */
export const NO_STAMP: Refusal = { code: "stale-stamp", says: "no stamp of its own" };

/** The frame has nothing answering to that selector any more. */
export const GONE: Refusal = { code: "stale-stamp", says: "the element is no longer there" };

/**
 * One in-place text edit, from the ask to the write (#255).
 *
 * `asking` is the moment between the gate answering yes and the frame saying
 * it has opened: the frame already owns the pointer then, so a press over it
 * must not be read as a fresh selection. `start` is the words the edit began
 * with, and an edit that ends on the same ones writes nothing at all.
 */
export interface HandEdit {
	frame: string;
	selector: string;
	/** the stamp the `set-text` op will carry */
	source: string;
	/** the ask the frame answers; a reply carrying another is a dead edit */
	id: number;
	/** the hash of the file the gate answered against */
	fingerprint: string;
	read?: SourceRead;
	intent?: SourceIntent;
	phase: "asking" | "open";
	start: string;
}

/** Where a refusal is shown: on the element it was about, in its own frame. */
export interface ShownRefusal {
	frame: string;
	selector: string;
	refusal: Refusal;
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
