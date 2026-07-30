import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--churn — a loom shuttle whose rate is the wire's backlog, not a timer's.
 *
 * **Every other animation on this row runs at a number nobody chose for a reason.** 1.4s,
 * 2s, 2.4s, 720ms: they are all decoration, and decoration is what makes a spinner the
 * weakest object in this rail. This one borrows the shape `say-pace.ts` already ships for
 * the words — **rate proportional to the backlog, bounded by a floor** — so the motion is a
 * readout. One crossing takes `max(320ms, 1200ms ÷ backlog)`, and the panel prints the
 * current traverse and the current backlog live rather than claiming it.
 *
 * What that looks like in the real script: three tool calls sent together and the shuttle
 * crosses every 400ms; one long thought and it takes 1.2s; a request out with nothing else
 * open and it is the same 1.2s; the answer lands and everything closes and it coasts to the
 * end of its channel and stops. Nothing has to be timed, because the thing being drawn is
 * the thing being measured.
 *
 * **Why a shuttle and not a spinner.** It crosses and comes back, which is what a loom does
 * and what a spool is for. A reversal was ruled out for `agent-wait--mark` because a logo
 * running backwards reads as an unwind; a shuttle returning is the same pass in the other
 * direction and reads as work. And a channel has two ends rather than a lap, so there is no
 * position in it that means 40%.
 *
 * **No word at all.** The rate is what this take says, and a word beside it would be
 * claiming a second thing. This is the one take on the row where wordlessness is the design
 * rather than an omission — everything else that says nothing is just a spinner that says
 * nothing.
 *
 * **The honest risk, and it is the long thought.** `claude-edits` ends on 18 seconds of
 * thinking at a backlog of one, so for the last quarter of the turn the shuttle crosses
 * slowly, and slow is exactly what a hung process looks like. The repair is the one Claude
 * Code ships — escalate the words when the turn drags — and this take has no words to
 * escalate. The second risk is that a rate the eye can read is a rate the eye will
 * interpret: fast reads as urgent, and three parallel `read` calls are not urgent, they are
 * just three.
 *
 * **Compositor, and zero writes.** One `translateX` on a 5px bar in a 16px channel. Nothing
 * in the DOM changes for the whole turn and the box never changes width.
 */
export default function AliveChurnFrame() {
	return (
		<AliveFrame
			take="churn"
			title="churn · the rate is the wire's, not a timer's"
			claim="one crossing takes max(320ms, 1200ms ÷ backlog), on say-pace.ts's own shape. the panel prints the traverse and the backlog live."
			notes={[
				"three calls sent together cross in 400ms. one long",
				"thought crosses in 1.2s. the panel prints both.",
				"risk: 18s of thinking at a backlog of one is slow,",
				"and slow is what a hung process looks like.",
			]}
		/>
	);
}
