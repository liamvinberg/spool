import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--nib — one tapered stroke, and nothing else.
 *
 * The floor. The complaint that opened this round was bulk, so somebody has to draw the smallest
 * thing that borrows anything from the mark at all and let it be judged. One tapered wedge, 16 by
 * 2.2, anchored at its root, and the only thing that ever happens is how far the thread is paid
 * out. **One element. Zero DOM writes. A 16 × 3px box, which is smaller than the composer chip's
 * own accent bar is tall.**
 *
 *   idle      half out, dim.
 *   sent      drawn nearly in, twitching at the root.
 *   working   paying out and back over 1,500ms.
 *   parked    fully out, still, in the accent — 25px² of red against the composer chip's own 24px²
 *             bar nine pixels below it. The accent question has no quantity left in it at this
 *             size: the mark and the chip are the same amount of red.
 *
 * **It fails the fallback, on purpose, and the frame says so in red.** Its four states are four
 * lengths of one stroke, which is an amount rather than four pictures: frozen, `idle` at 0.5 and
 * `working` at 0.72 are one picture at two strengths, which is the exact collapse `--count` was
 * built to beat and `--still` had already established nobody reads.
 *
 * **What it is actually measuring is how much of "spool" survives having only the taper, and the
 * answer is: not much.** It is a wedge. There is no waist, because one stroke cannot have a middle;
 * there is no winding, because nothing goes anywhere; there is no cascade, because there is one of
 * it. Every other take on this row is more than one mark for a reason, and this frame is the
 * evidence for that reason rather than a candidate. It is ranked last and it is the most honest
 * thing here: if the bulk objection means *this* small, then the identity is not available at all
 * and the rail should draw something that is not trying to be spool.
 */
export default function WispNibFrame() {
	return (
		<WispFrame
			take="nib"
			title="nib · one tapered stroke, the fewest marks there are"
			claim="one wedge paying out and drawing back. the smallest thing on this row and the measurement of what is left of spool when only the taper is borrowed."
			notes={[
				"one element, zero writes, a 16 × 3px box.",
				"25px² of accent at parked against the chip's 24. the same amount of red.",
				"it fails the fallback: four lengths of one stroke is an amount, not four shapes.",
				"drawn as the floor, not as a candidate. a wedge is not a spool.",
			]}
		/>
	);
}
