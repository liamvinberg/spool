import type { PickedHit } from "./protocol";

/**
 * The selection ladder (#254): which rung a gesture lands on, given the
 * ancestry under the pointer and the rung the selection already holds.
 *
 * A frame's component returns one root element, so rung 1 is always the whole
 * screen and looks identical to the frame. Descent does not skip it: the root
 * carries real classes the agent wrote, and every property the agent applies
 * has to be reachable by hand.
 *
 * The scope is the pair the canvas already keeps — the ancestry the last pick
 * was found in, and which element of it is held. Everything here is a walk
 * over selectors, so the whole ladder is decidable without a document.
 */

export interface LadderScope {
	/** the ancestry the held element was found in, the frame's root element first */
	chain: readonly PickedHit[];
	/** the held element, somewhere in that ancestry */
	selector: string;
}

/** The rung the held element sits on, or -1 when the scope no longer holds it. */
export function rungOf(scope: LadderScope | null): number {
	return scope === null ? -1 : scope.chain.findIndex((hit) => hit.selector === scope.selector);
}

/**
 * Figma's scope memory, and what a plain click takes: the element at the held
 * rung under a fresh ancestry — a sibling inside the shared ancestry, the
 * divergence point outside it, the root element when no scope holds.
 */
export function atRung(chain: readonly PickedHit[], scope: LadderScope | null): PickedHit | undefined {
	if (chain.length === 0) return undefined;
	const rung = rungOf(scope);
	if (scope === null || rung < 0) return chain[0];
	let shared = 0;
	while (shared < rung && shared < chain.length && scope.chain[shared]?.selector === chain[shared]?.selector) {
		shared++;
	}
	return chain[Math.min(shared, chain.length - 1)];
}

/** One rung up: the parent of the held element, or nothing at the root element. */
export function oneUp(scope: LadderScope | null): PickedHit | undefined {
	const rung = rungOf(scope);
	return rung > 0 ? scope?.chain[rung - 1] : undefined;
}
