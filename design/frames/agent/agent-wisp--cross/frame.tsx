import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--cross — two threads lying across each other, and the crossing is the state.
 *
 * The second new mechanism. Two tapered strokes, both the full 16px, both pinned at the box's
 * middle, and the only properties that ever move are `rotate` and `translateY`. Thread that is not
 * under tension *lies* — it crosses itself — so the drawing is a picture of two things touching
 * with no vocabulary to learn, and the tips taper toward their far ends so the crossing thickens
 * as it travels inward.
 *
 * **It is not a spinner and cannot be mistaken for one.** Neither stroke ever completes a
 * revolution: the rotation swings between 4° and 17° and comes back, and the pair is symmetric, so
 * there is no direction of travel. That matters because a frozen spinner is pixel-identical to
 * what reduced motion already renders for a *working* row, which is the trap #161 found and the
 * reason two candidates died there.
 *
 *   idle      parallel and aligned, dim. Two threads lying flat against each other.
 *   sent      parallel and offset, sliding past without meeting. Nothing has crossed yet.
 *   working   scissoring through each other over 1,500ms, the crossing point travelling.
 *   parked    a hard symmetric X, still, in the accent.
 *
 * **Its accent claim is the second smallest on the row** — 36px² against the composer chip's own
 * 24px² nine pixels below — because two tapered strokes is almost nothing to fill. That is worth
 * saying out loud: the objection to a red mark was never the colour, it was how much of it sits
 * beside a selection that also uses red, and this take makes the quantity comparable rather than
 * arguable.
 *
 * **And then the first still killed it, which is why it is drawn.** `parked` is a hard X in the
 * accent, and a cross is *already taken in this rail*: #142's failed row is drawn as two strokes
 * crossing, against a check drawn as two strokes meeting, and #165 added a fifth row state as one
 * flat stroke precisely to stay out of that pair. So the loudest state this take has says *failed*
 * in the vocabulary the transcript nine pixels above it is using — the exact class of collision
 * #161 found when it tried freezing a spinner and landed on reduced motion's *working* row. It
 * is not fixable by tuning the angle, because every angle is a cross.
 *
 * `working` frozen has the smaller version of the same problem: two tapered strokes meeting at
 * the left is a chevron, and the model row's own trigger draws one twelve pixels below.
 *
 * **What survives the failure is the mechanism, and it is worth keeping on the page for that.**
 * Two elements, 36px² of accent against the composer chip's own 24px², rotate and translateY only,
 * and four genuinely different silhouettes — every measurement is good and the take still loses,
 * which is the kind of thing only a drawn frame catches. Ranked sixth, and it is here so nobody
 * proposes scissoring strokes again without the collision in front of them.
 */
export default function WispCrossFrame() {
	return (
		<WispFrame
			take="cross"
			title="cross · two threads lying across each other"
			claim="two tapered strokes scissoring through each other. how they cross is the state, and neither of them ever completes a turn."
			notes={[
				"thread that is not under tension lies across itself. that is the whole borrow.",
				"not a spinner: no revolution, and the pair is symmetric.",
				"36px² of accent at parked against the chip's 24, nine pixels below.",
				"and it dies here: a cross in the accent is what a failed row already draws.",
			]}
		/>
	);
}
