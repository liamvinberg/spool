import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--fold — three threads out of the ribbon's own silhouette, lengthening in a
 * travelling wave. The mark's geometry changes and nothing rotates.
 *
 * **What survived `agent-wait--mark`'s defeat, and what did not.** Round two argued that
 * take down on one finding: of five surfaces read at the source, not one animates its own
 * brand mark, and a logo that means *working* means it everywhere or nowhere. That stands
 * and nothing here is the spool ribbon. But the finding was about a *logo*, never about a
 * glyph, and the ribbon's silhouette is three stacked threads — which is a shape spool can
 * use without spool's mark being in the rail at all.
 *
 * **Why it does not turn.** A rotation is the one thing this rail keeps having to apologise
 * for. `agent-wait--mark` needed a hand-driven angle, a spin-up, a coast and a homing
 * condition purely so the logo would not run backwards or park crooked when the answer
 * landed, and every one of those was the entrance-and-exit problem moved out of the DOM and
 * into a property. A wave has no revolution to finish. Each bar animates `scaleX` between
 * 0.26 and 1 on a 1.4s ease, 160ms apart, and the answer landing just stops it: there is no
 * upright to reach and no direction to reverse, so the wind-down is three bars easing to
 * full length in 300ms and that is all.
 *
 * **It cannot imply progress either.** Nothing accumulates. The three lengths are a
 * standing pattern rather than a fill, so there is no state of the mark that reads as
 * further along than another one.
 *
 * **The word is one gerund and it never leaves.** `working` while anything is out, `idle`
 * when nothing is, crossfaded in place. Two words rather than round two's three, because
 * `waiting` is out and because the distinction `line` drew between *your machine is busy*
 * and *the model is thinking* turned out to need a third word for a difference the person
 * cannot act on either way. Machine text, so lowercase mono.
 *
 * **What it costs and what the meters say.** 36px of transcript on every thread forever,
 * which is the cost every take with a slot pays. Zero writes to the DOM for the whole turn,
 * because `scaleX` is the only thing changing and it is a transform: the compositor does all
 * of it and React does none. The one width step it takes is the word, `idle` to `working`,
 * and nothing sits to its right for that step to push.
 *
 * **The resting shape is a staircase and not three equal lines**, which the first render
 * settled: three bars of one length in a 14px box is the universal menu glyph, and that is
 * what both the rest state and the reduced-motion state would otherwise be. Full, two thirds,
 * one third reads as threads of different lengths and as nothing else in this rail.
 *
 * **Its reduced-motion state is `agent-alive--still`, exactly.** The same staircase, not
 * moving, at working strength. That is not the collision #161 warned about — it is the
 * right degradation, and it means choosing this take is also choosing that one, since
 * somebody who asked for stillness gets the null and the null is a frame on this row that
 * can be looked at.
 */
export default function AliveFoldFrame() {
	return (
		<AliveFrame
			take="fold"
			title="fold · the geometry changes, nothing turns"
			claim="three threads out of the ribbon's silhouette, lengthening in a wave. no revolution to finish, so nothing unwinds and nothing parks crooked."
			notes={[
				"a wave cannot imply progress: nothing accumulates.",
				"scaleX only, so zero dom writes for the whole turn.",
				"reduced motion draws agent-alive--still, three frames",
				"along this row, which is the right degradation.",
			]}
		/>
	);
}
