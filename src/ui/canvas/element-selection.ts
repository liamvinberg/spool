import type { Refusal } from "./hand-edit";
import type { PickedSelection } from "./overlays";
import type { PickedHit } from "./protocol";

/**
 * The selection the Edit tool keeps (#339), as the decisions it makes.
 *
 * A click takes the deepest element under the pointer. Everything after that
 * is a step from what is held: Esc or ⇧⏎ to the parent, Tab round the
 * siblings, ⌘A to all of them, and Enter or a double-click into the words or
 * the children. The canvas, the properties rail and the element tree are three
 * readers of the one selection, so the rules live here rather than in any of
 * them. The document is the frame's, so each step that needs one asks the
 * frame; what is decidable from the ancestry already held is decided here.
 */

/** What a selection holds: the elements, and the ancestry of the last one. */
export interface HeldElements {
	picks: readonly PickedSelection[];
	/** the ancestry the anchor (the last pick) was found in, root element first */
	chain: { frame: string; chain: readonly PickedHit[] } | null;
}

/** The deepest element of an ancestry, which is what a click takes. */
export function deepest(chain: readonly PickedHit[]): PickedHit | undefined {
	return chain[chain.length - 1];
}

/**
 * The parent of what is held: the element one up, with the ancestry down to
 * and including it, or the frame (`hit: null`) above a top-level element. Several held
 * elements climb together only when they share that parent; anything else has
 * no one parent, which is `undefined`, and the canvas drops to their frames.
 *
 * A multi-pick shares a parent when every selector is a direct child of the
 * anchor's parent, read off the selectors the frame handed out. An element
 * that carries an id is named by it alone, so a row of those says nothing
 * about its parent and drops to the frame rather than guessing.
 */
export function parentOf(
	held: HeldElements,
): { frame: string; chain: readonly PickedHit[]; hit: PickedHit | null } | undefined {
	const anchor = held.picks[held.picks.length - 1];
	const chain = held.chain;
	if (anchor === undefined || chain === null || chain.frame !== anchor.frame) return undefined;
	const at = chain.chain.findIndex((hit) => hit.selector === anchor.selector);
	if (at < 0) return undefined;
	const parent = at > 0 ? (chain.chain[at - 1] ?? null) : null;
	if (held.picks.length > 1) {
		const prefix = parent === null ? "" : `${parent.selector} > `;
		const together = held.picks.every(
			(pick) =>
				pick.frame === anchor.frame &&
				pick.selector.startsWith(prefix) &&
				!pick.selector.slice(prefix.length).includes(" > "),
		);
		if (!together) return undefined;
	}
	return { frame: anchor.frame, chain: chain.chain.slice(0, at), hit: parent };
}

/**
 * What Enter and a double-click do with one held element (#339): open its
 * words, say why they cannot be opened, or step into its children.
 *
 * Words of its own decide it. An element with some opens them, unless the file
 * has already said a hand cannot write them (the selection read's `words`), which
 * is said on the element before anything is typed. A group has no words and
 * holds elements, so the step goes into them.
 */
export type Opening = { kind: "words" } | { kind: "refused"; refusal: Refusal } | { kind: "children" };

export function openingOf(pick: PickedSelection, read: { source: string; words?: Refusal } | undefined): Opening {
	if (pick.words !== true) return { kind: "children" };
	if (read !== undefined && read.source === pick.source && read.words !== undefined) {
		return { kind: "refused", refusal: read.words };
	}
	return { kind: "words" };
}

/** The attempt a refusal hands the agent, in plain words: what the hand tried, on what. */
export function wordsAsk(pick: PickedSelection): string {
	return `Change the words of the ${pick.tag}`;
}
