import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--hank — two marks, and the thread moves from one to the other.
 *
 * Derived from the word rather than from the shape, which is the one direction on this row that
 * owes the logo nothing at all. To spool is to wind thread off one thing and onto another; nothing
 * about that requires a silhouette. Two strokes, the top one anchored at its left and the bottom
 * one at its right, and what leaves the first arrives at the second. The total is conserved while
 * work is happening, so the pair is one quantity in two places rather than two quantities.
 *
 * **This is the aggressively minimal take that still survives its own fallback, and that pairing
 * is the whole claim.** `--nib` is smaller — one element — and its four states are four lengths of
 * one stroke, which is an amount. This is 16 × 6px, two elements, and its four states are
 * top-heavy, balanced, bottom-heavy and both-full, which are four silhouettes. So it is the
 * cheapest drawing on the row that meets `--count`'s standard, and the answer to "the complaint is
 * bulk" that does not pay for the smallness with the state model.
 *
 *   idle      balanced, dim. The thread is halfway and nothing is moving it.
 *   sent      top-heavy and barely moving. It is all still on the first bundle.
 *   working   the thread crossing over and back, 1,600ms.
 *   parked    both bundles full at once, still, in the accent. The conservation is broken, which is
 *             the honest picture of a thing that has stopped: the rule the mark has been obeying
 *             all turn is the one thing that fails.
 *
 * **What it costs.** Two bars stacked is the least *specific* drawing here. It is unmistakably
 * winding once you have watched it move, and it is unmistakably nothing in a still — which is the
 * inverse of `--waist`, whose still reads as the mark and whose motion is subtler. Whether spool's
 * identity lives in the shape or in the verb is the actual choice between those two, and that is
 * not a question a measurement settles.
 */
export default function WispHankFrame() {
	return (
		<WispFrame
			take="hank"
			title="hank · thread leaving one bundle for another"
			claim="two strokes with opposite anchors, and what leaves the first arrives at the second. the total is conserved until the turn stops, and then it is not."
			notes={[
				"derived from the word: to spool is to wind off one thing onto another.",
				"two elements, and all four states are still different silhouettes.",
				"parked breaks the conservation the mark obeyed all turn. that is the signal.",
				"the honest cost: unmistakable in motion, generic in a still.",
			]}
		/>
	);
}
