import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--drift — the cascade shears, and which way it leans is the state.
 *
 * The mark's strands do not sit in a column. Their boxes wander sideways as the shape descends,
 * and at 16px that drift is one of only two things about the logo a reader can still see — the
 * other being the waist, which `--waist` takes. So this take borrows the lean: four strokes at
 * four of the mark's own sampled widths, each offset sideways in proportion to how far down it
 * sits, so the whole stack leans as one. A skein slipping rather than a wave passing.
 *
 * **The reason it is on the row is that a lean is a silhouette.** Round four's `--spin` told
 * thinking from working by the direction the thread ran and admitted in its own notes that frozen,
 * a direction is a lean rather than a shape — a real weakness, honestly printed. Here the lean *is*
 * the entire drawing, so frozen it is the whole silhouette that flips, and the distinction survives
 * the motion being turned off with nothing lost. That is the same objection answered from the
 * inside rather than argued away.
 *
 *   idle      upright, tapered, dim.
 *   sent      leaning left and breathing there.
 *   working   leaning through upright from left to right and back, 1,400ms.
 *   parked    upright, every stroke at full width, still, in the accent.
 *
 * **Where it is weak, and the first still is what found it.** At the logo's own drift — ±1.9px on
 * the deepest stroke — the four frozen swatches were very nearly one picture: the mirror this take
 * is built on existed in the DOM and could not be seen. It is at ±2.6px now, which moves the bottom
 * stroke across a third of the box between the two leans, and that is further than the mark
 * actually drifts. So the borrow had to be exaggerated to survive the size, which is a worse
 * position to be in than `--waist`, whose borrow is exact at 16px because a proportion has no
 * scale. Four strokes at 12px of height is also the tallest mark on the row, for the smallest
 * movement on it.
 */
export default function WispDriftFrame() {
	return (
		<WispFrame
			take="drift"
			title="drift · the cascade leans, and the direction is the state"
			claim="four strokes at four of the mark's own widths, sheared in proportion to their depth. leaning left is a request out, leaning right is something coming back."
			notes={[
				"the borrow is the drift, which is the second of two things visible at 16px.",
				"--spin's own weakness answered: here the lean is the shape, not a phase of one.",
				"freeze it and sent and working are mirror images rather than amounts.",
				"weakest point: the lean had to be exaggerated past the mark's own to be visible.",
			]}
		/>
	);
}
