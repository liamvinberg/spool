import type { PickedHit } from "./protocol";

/**
 * The selection ladder (#254): which rung a gesture lands on, given the
 * ancestry under the pointer and the rung the selection already holds.
 *
 * A frame's component returns one root element, and a page's root is a wrapper
 * drawn over the whole frame. A click on it looks like a click that did
 * nothing, so the first rung a pointer takes is the top-level child under it
 * (#321) — Figma's own first click. The wrapper is still a rung: Esc climbs
 * onto it, the crumbs name it, and every class the agent wrote on it is
 * reachable from there.
 *
 * The scope is the pair the canvas already keeps — the ancestry the last pick
 * was found in, and which element of it is held. Everything here is a walk
 * over selectors, so the whole ladder is decidable without a document.
 */

/** The frame's own box, in the frame-local pixels a hit's rect is measured in. */
export interface FrameBox {
	w: number;
	h: number;
}

export interface LadderScope {
	/** the ancestry the held element was found in, the frame's root element first */
	chain: readonly PickedHit[];
	/** the held element, somewhere in that ancestry */
	selector: string;
}

/**
 * Whether this rung is the frame wearing a wrapper: a box over the whole
 * frame, at its origin, with something inside it. Nothing about it is
 * distinguishable from the frame under the pointer, so the pointer goes past.
 */
function coversFrame(rect: PickedHit["rect"], frame: FrameBox): boolean {
	return rect.x <= 1 && rect.y <= 1 && rect.w >= frame.w - 1 && rect.h >= frame.h - 1;
}

/**
 * The rung a pointer takes with no scope open: the top-level child under it,
 * past a root wrapper the size of the frame. No frame box to measure against
 * — the keyboard's own descent — is the root element itself.
 */
export function firstRung(chain: readonly PickedHit[], frame: FrameBox | null): PickedHit | undefined {
	const root = chain[0];
	if (root === undefined) return undefined;
	const child = chain[1];
	return child !== undefined && frame !== null && coversFrame(root.rect, frame) ? child : root;
}

/** The rung the held element sits on, or -1 when the scope no longer holds it. */
export function rungOf(scope: LadderScope | null): number {
	return scope === null ? -1 : scope.chain.findIndex((hit) => hit.selector === scope.selector);
}

/** True while the fresh ancestry runs through the held rung. */
function sharesRung(chain: readonly PickedHit[], scope: LadderScope, rung: number): boolean {
	for (let i = 0; i <= rung; i++) {
		if (scope.chain[i]?.selector !== chain[i]?.selector) return false;
	}
	return true;
}

/**
 * Figma's scope memory, and what a plain click takes: the element at the held
 * rung under a fresh ancestry — a sibling inside the shared ancestry, the
 * divergence point outside it, the top-level child under the pointer when no
 * scope holds.
 *
 * A root wrapper is never what a click takes, whatever the scope says. It has
 * no siblings to move between, so a click that answered with it would answer
 * with it for every point in the frame: press after press on a page that never
 * moves. Esc and the crumbs still reach it, which is where a class on the
 * wrapper is edited from.
 */
export function atRung(
	chain: readonly PickedHit[],
	scope: LadderScope | null,
	frame: FrameBox | null,
): PickedHit | undefined {
	if (chain.length === 0) return undefined;
	const rung = rungOf(scope);
	if (scope === null || rung < 0) return firstRung(chain, frame);
	let shared = 0;
	while (shared < rung && shared < chain.length && scope.chain[shared]?.selector === chain[shared]?.selector) {
		shared++;
	}
	const taken = chain[Math.min(shared, chain.length - 1)];
	return taken === chain[0] ? firstRung(chain, frame) : taken;
}

/** One rung up: the parent of the held element, or nothing at the root element. */
export function oneUp(scope: LadderScope | null): PickedHit | undefined {
	const rung = rungOf(scope);
	return rung > 0 ? scope?.chain[rung - 1] : undefined;
}

/**
 * One rung down this ancestry, which is what a double-click takes in Edit. A
 * scope held on another branch is not a rung on this one, so the descent
 * restarts at the top rather than jumping sideways at depth.
 *
 * A leaf has nothing under it and answers with nothing at all: the two clicks
 * that got there meant the words in it (#321), and a descent that answered
 * with the leaf again would cancel the edit they opened.
 */
export function oneDown(
	chain: readonly PickedHit[],
	scope: LadderScope | null,
	frame: FrameBox | null,
): PickedHit | undefined {
	if (chain.length === 0) return undefined;
	const rung = rungOf(scope);
	if (scope === null || rung < 0 || !sharesRung(chain, scope, rung)) return firstRung(chain, frame);
	return chain[rung + 1];
}
