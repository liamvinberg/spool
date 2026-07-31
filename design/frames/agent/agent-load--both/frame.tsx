import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-load--both — the receipt and the pulse, and this is the one the row settled on.
 *
 * **It is not a compromise between `row` and `stroke`. They answer different questions.**
 * The stroke answers *is anything happening*, in the periphery, for free, without asking to
 * be read. The receipt answers *what happened and how long did it take*, in the log, on
 * purpose, an hour later if you like. Every other take on this row tried to make one object
 * do both jobs, and each of them gave something up to do it: `under` and `ride` can say
 * what is happening now and remember nothing; `gauge` can say how much and never which;
 * `row` alone loses the one thing the stroke is genuinely good at, which is saying *alive*
 * while your eyes are somewhere else entirely.
 *
 * **The thing that makes the pair legal is that neither of them enters or leaves.** Round
 * two's whole finding was that the complaint is objects that come and go — "twelve times in
 * an ordinary `claude-edits` turn, and a zero on the shift meter does not make it stop
 * blinking". The stroke is one element for the life of the rail, and a receipt is written
 * once and never removed. The meter beside this frame says it: the stroke never moves, and
 * the rows enter the way every other row in the transcript enters and then stay. `leaves`
 * is zero and `moved down` is zero, which is the pair of numbers `b4aef45` deleted the old
 * beat over.
 *
 * **What `b4aef45` was right about, and what it took with it.** It was right that the wire
 * carries no thought: `AgentThinking` has a token count and no prose, every thinking field
 * in every capture is the empty string, and a line pretending to a thought would be
 * inventing one. So this draws a duration and nothing else. But `thinking 0.0s` was the
 * *thinking block's* duration, and the number worth having is the wait: 878ms at the
 * fastest and 4,043ms at the slowest across 50 measured here, which is exactly the range
 * where a rail with no readout reads as stuck.
 *
 * **The open question, and it is the only one left.** Twelve waits in an ordinary turn is
 * twelve rows spent on durations, in a transcript whose whole claim is that it holds
 * receipts worth keeping. The log already counts runs of writes rather than repeating them,
 * and the same rule takes twelve rows to one or two. That is the next frame, and it is a
 * refinement of this rather than an alternative to it: nothing above changes if a run of
 * thoughts collapses into one line carrying a count.
 */
export default function LoadBothFrame() {
	return (
		<WaitFrame
			take="both"
			title="both · the receipt and the pulse"
			claim="the thought stays in the log as a line you can read back, and the stroke keeps saying alive in the corner."
			notes={[
				"two objects, two jobs. neither enters and neither leaves.",
				"the stroke is the only thing that works while you look away.",
				"the receipt is the only thing that is still there tomorrow.",
				"open: twelve waits a turn until runs are counted into one.",
			]}
		/>
	);
}
