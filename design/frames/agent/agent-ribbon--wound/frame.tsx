import { RibbonFrame } from "../../../shared/ui/spool-ribbon-rail";

/**
 * agent-ribbon--wound — the strands lay themselves down in order, as if being wound. It is a
 * nine-segment progress bar, and it has no progress.
 *
 * **It is drawn to be killed, and drawn rather than described for one reason.** This is the
 * most obvious thing nine ordered strands suggest, it is the first reading of the word "spool"
 * anybody reaches for, and it is genuinely handsome running. So it will be proposed again by
 * whoever reads this page next, and the argument against it has to be on the canvas where it
 * can be looked at instead of in a note saying it was considered.
 *
 * The strands arrive bottom to top, 180ms apart, hold complete for 400ms, then the whole stack
 * drops back over 260ms and it begins again.
 *
 * **It fails constraint 4: nothing may imply progress it does not have.** Nine discrete steps
 * filling in a fixed order and resetting is a nine-segment bar. Six of nine strands lit means
 * nothing at all — no part of spool knows how far through a turn it is — and it will be read as
 * two thirds, because that is what a thing that fills in order means everywhere else in
 * software. `--spin` is the same instinct done safely: a fixed-length dash on a closed loop
 * never arrives, so it can travel the same path and say nothing false.
 *
 * **It fails constraint 5: the cycle is longer than the wait.** 2,280ms against a median time
 * to first token of 1,970ms, off 50 measured `ttft_ms` values. So in half of all real waits the
 * reader never sees the stack complete, and the only thing they ever see is the partial fill —
 * which is the meaningless state. This is the same measurement that killed `--breathe` (2,400ms)
 * and `--gerund` (2,800ms a word), arrived at from the other side: there it was a cycle nobody
 * saw finish, here it is a *fraction* nobody sees resolve, which is worse because a fraction
 * invites a conclusion.
 *
 * **And its fallback lands on another take.** Frozen, the complete stack is the plain spool
 * logo, which is `agent-ribbon--rest` at idle exactly. So under reduced motion this take draws
 * working and idle as the same picture at two strengths — and `agent-alive--still` already
 * established that strength alone is not a distinction anybody reads. Three failures, two of
 * them measured.
 *
 * **What it does *not* fail is worth recording, because it is the trap this mechanism usually
 * falls into.** All nine elements are mounted from before the first keystroke and only their
 * opacity moves, so churn reads 0 in, 0 out and 100% on screen, exactly like every other take
 * here. Round two's whole finding was that an indicator must not be made and unmade; this take
 * satisfies it completely and is still wrong. Being always-present was the floor, never the
 * answer.
 *
 * Ranked last of the six.
 */
export default function RibbonWoundFrame() {
	return (
		<RibbonFrame
			take="wound"
			title="wound · nine strands laid in order"
			claim="the most obvious thing nine ordered strands suggest, and the one that lies. six of nine lit means nothing and reads as two thirds."
			notes={[
				"fails 4: a fixed order that fills is a percentage. nothing here has one.",
				"fails 5: 2280ms against a 1970ms median, so half of waits see only the fraction.",
				"it passes churn at 0 in / 0 out, and is still wrong. that was the floor.",
			]}
		/>
	);
}
