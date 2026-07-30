import { RibbonFrame } from "../../../shared/ui/spool-ribbon-rail";

/**
 * agent-ribbon--aperture — the mark is not the object. It is the window, and light passes
 * behind it.
 *
 * **The first of the two new mechanisms on this row, and the novelty is what is moving.** The
 * whole ribbon becomes a `mask-image` built from `STRANDS`, painted once and never touched.
 * What animates is a single ordinary element carrying a single static gradient, translated
 * across. The logo does not move at all.
 *
 * **That inverts #149's hardest constraint into a property of the construction.** The finding
 * was specific: animating a gradient's own paint is what Chromium refuses, and
 * `agent-say-arrive` measured an `edge` gradient *freezing* mid-sweep the moment the wire
 * paused. A take built this way cannot have that bug, because there is no gradient paint to
 * animate — the mask is static, the band's fill is static, and a transform carries it. It is
 * `agent-alive--rule`'s trick applied to the identity instead of to the composer's border,
 * which is also why it stays off that border: the border is a parallel exploration's, and this
 * one wanted the mark anyway.
 *
 * **The taper does the design work, and this is the argument for using the real path rather
 * than any band of light.** A band sweeping left to right crosses 446 units of strand 8 and
 * 165 units of strand 5. So it dwells on the wide strands and flicks past the waist, and the
 * rhythm of the sweep is the logo's own geometry with no number anywhere saying it should be.
 * Draw the same band behind a rectangle and it is a shimmer; draw it behind this shape and it
 * is the ribbon catching light.
 *
 * **It cannot imply progress.** The band is a fixed 62% of the mark's width and leaves the
 * right edge before it re-enters at the left, both outside the mask. Nothing accumulates, so
 * no state of it is further along than another. This matters more here than anywhere else on
 * the row, because a left-to-right sweep is the gesture a progress bar makes — what saves it
 * is that the *lit thing* is constant width and the thing it moves through never fills.
 *
 * **Three states, and it argues that is correct for a mechanism with one moving part.** A
 * second band, or a slower one, would be a vocabulary rather than a signal. The dwell meter on
 * the frame is the supporting evidence: the four "something is out" states in this turn are one
 * long stretch broken by a third of a second of words, and the reader's job does not change
 * across them.
 *
 * Parked is the exception every take here makes, on #161's own reasoning: the band goes out and
 * the ribbon holds whole at 0.95 and still. It is the only time the mark is fully lit and not
 * moving, so the one thing that needs a person looks unlike everything that does not.
 *
 * **Reduced motion parks the band a third of the way across at full strength**, which leaves a
 * static asymmetric highlight over the upper strands. It is deliberately not the parked
 * picture — that one is even — and it is not any mark this rail has.
 *
 * Monochrome. The accent question is `--rest` and `--count`'s to answer.
 */
export default function RibbonApertureFrame() {
	return (
		<RibbonFrame
			take="aperture"
			title="aperture · the mark is the window, not the object"
			claim="the ribbon is a mask painted once and a band of light passes behind it. the taper makes the rhythm: it dwells on the wide strands and skims the waist."
			notes={[
				"nothing about the gradient animates, so nothing can freeze mid-sweep.",
				"the band is a fixed 62% of the width and never fills anything.",
				"one moving element and one static mask: 2 nodes, not 9.",
				"reduced motion holds the band off-centre, which is nothing else here.",
			]}
		/>
	);
}
