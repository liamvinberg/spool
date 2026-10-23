import type { PickedHit } from "./protocol";

/**
 * What a pin would point at under the Comment tool: an element of the ancestry under the pointer, `up` levels above
 * the deepest, or the whole frame (`chain` empty) once ↑ has climbed past its top-level element. The frame's label
 * aims at the whole frame from the start.
 */
export interface CommentAim {
	frame: string;
	chain: readonly PickedHit[];
	up: number;
}

/** The element aimed at, or null for the whole frame. */
export function aimedHit(aim: CommentAim): PickedHit | null {
	return aim.chain[aim.chain.length - 1 - aim.up] ?? null;
}

/** A new answer under the pointer: the levels climbed hold while the deepest element is still the same one. */
export function reaim(was: CommentAim | null, frame: string, chain: readonly PickedHit[]): CommentAim {
	const same = was !== null && was.frame === frame && deepestOf(was.chain) === deepestOf(chain);
	return { frame, chain, up: same ? was.up : 0 };
}

/** ↑ one level out, as far as the whole frame; ↓ one level back in, as far as the deepest element. */
export function stepAim(aim: CommentAim, step: "up" | "down"): CommentAim {
	const up = Math.min(aim.chain.length, Math.max(0, aim.up + (step === "up" ? 1 : -1)));
	return up === aim.up ? aim : { ...aim, up };
}

/** The element a pin placed now points at: the aim's, when the press found the ancestry the aim was taken in. */
export function placedHit(aim: CommentAim | null, frame: string, chain: readonly PickedHit[]): PickedHit | null {
	if (aim === null || aim.frame !== frame || deepestOf(aim.chain) !== deepestOf(chain))
		return chain[chain.length - 1] ?? null;
	return aimedHit({ ...aim, chain });
}

function deepestOf(chain: readonly PickedHit[]): string | undefined {
	return chain[chain.length - 1]?.selector;
}
