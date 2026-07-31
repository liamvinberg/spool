import type { Camera } from "../api";
import type { PickedSelection } from "./overlays";

/**
 * The jump list: vim's ctrl-o/ctrl-i carried to the canvas (#166). A move that
 * takes you somewhere — a finder pick, a walk, a connection row, a page
 * switch, a sidebar flight — records the spot it left; a move that reframes
 * where you already are — pan, zoom, fit, enter — never does. Two stacks
 * replay the departures: back hands the present to forward, and a fresh jump
 * voids forward — the browser's rule, neovim's `jumpoptions=stack`, chosen
 * over vim's default append because nobody predicts the append. The stacks
 * live like the geometry ones (history.ts): per window, in memory, gone on
 * reload.
 *
 * A spot is where you stood, not just what you saw: the frame you were inside
 * and what you had chosen travel with the camera, so coming back puts you back
 * rather than in front of it.
 */

export interface JumpEntry {
	page: string;
	camera: Camera;
	/** The frame you were live inside, null out on the canvas. */
	entered: string | null;
	/** The frames you had chosen. Never a place, only what came with you. */
	selected: readonly string[];
	/** The elements you had chosen, including the geometry that draws their outlines. */
	picked: readonly PickedSelection[];
}

export interface JumpList {
	back: readonly JumpEntry[];
	forward: readonly JumpEntry[];
}

export const JUMP_LIMIT = 100;

export function emptyJumps(): JumpList {
	return { back: [], forward: [] };
}

/**
 * The same spot as a hand would judge it: one page, a camera within a pixel,
 * standing in the same place. Inside a frame and in front of it are two spots
 * at one camera — going between them is a move worth landing on. What was
 * selected is not part of the answer: choosing something moves nobody.
 */
function sameSpot(a: JumpEntry, b: JumpEntry): boolean {
	return (
		a.page === b.page &&
		a.entered === b.entered &&
		Math.round(a.camera.x) === Math.round(b.camera.x) &&
		Math.round(a.camera.y) === Math.round(b.camera.y) &&
		Math.abs(a.camera.k - b.camera.k) < 1e-3
	);
}

/** A departure: pushed unless it repeats the top, capped — and forward is
 * voided either way, because the jump itself happened. */
export function recordJump(jumps: JumpList, from: JumpEntry): JumpList {
	const top = jumps.back[jumps.back.length - 1];
	const back = top !== undefined && sameSpot(top, from) ? jumps.back : [...jumps.back, from].slice(-JUMP_LIMIT);
	return { back, forward: [] };
}

export interface JumpTaken {
	jumps: JumpList;
	entry: JumpEntry;
}

/** Back: the newest departure still worth landing on, the present kept for
 * forward. A deleted page has nowhere to land and the spot already underfoot
 * is no move at all — both are discarded and the older one serves. */
export function takeBack(jumps: JumpList, from: JumpEntry, pages: ReadonlySet<string>): JumpTaken | undefined {
	const back = [...jumps.back];
	while (true) {
		const entry = back.pop();
		if (entry === undefined) return undefined;
		if (!pages.has(entry.page) || sameSpot(entry, from)) continue;
		return { jumps: { back, forward: [...jumps.forward, from] }, entry };
	}
}

export function takeForward(jumps: JumpList, from: JumpEntry, pages: ReadonlySet<string>): JumpTaken | undefined {
	const forward = [...jumps.forward];
	while (true) {
		const entry = forward.pop();
		if (entry === undefined) return undefined;
		if (!pages.has(entry.page) || sameSpot(entry, from)) continue;
		return { jumps: { back: [...jumps.back, from], forward }, entry };
	}
}
