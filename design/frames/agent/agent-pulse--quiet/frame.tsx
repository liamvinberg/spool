import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--quiet — the receipt leaves the log and the loader carries all of it.
 *
 * The other half of the request that opened this round: *maybe we revert what we did with
 * "thinking" and don't make a new event.* Drawn literally. The word and the number come out
 * of the transcript and sit on the live edge above the composer, the stroke runs under
 * them, and the log holds nothing but work.
 *
 * **What it buys is real and this frame is the only place on the row you can see it.**
 * Four requests in this turn is four receipts; a full `claude-edits` session is twelve, and
 * the transcript in the screenshot that opened this round has two thinking rows in seven
 * machine rows. Take them out and the log is a record of what was done to the project and
 * nothing else, which is what a log is for. `agent-think--gone` argues exactly this and
 * argues it well, and its evidence was `thinking 0.0s` — a row given a mark, a verb, a
 * duration and 32px of transcript for reporting nothing.
 *
 * **But that evidence is the bug, not the design.** `0.0s` was the old anchor stopping the
 * clock at the top of the thought. After #231 the same row reads `31.2s`, and a row saying
 * *thirty-one seconds went here* is not a row about nothing — it is the only record that
 * the thirty-one seconds happened at all. So the strongest argument for this take was
 * retired by the fix that made this round necessary, and the honest thing is to say so on
 * the frame rather than let it stand.
 *
 * **What it costs is the whole of #212, and the cost is a tense.** A readout on the live
 * edge only ever says *now*. Look away for thirty seconds and there is nothing to come back
 * to; read the thread tomorrow and it is two writes with a gap between them and no account
 * of the gap. Every other take on this row is *the receipt plus something*; this one is
 * *instead of*, and it is the only take here whose `readable after` meter says no.
 *
 * **And it moves the readout to where the eye is not.** The live edge is the bottom of a
 * scrolling column. A reader who has scrolled up to check what the agent did ten steps ago
 * loses the indicator entirely — the log they are reading has no receipt in it and the edge
 * they are not looking at has the only copy.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="quiet"
			title="quiet — no receipt, the loader says it all"
			claim="the word and the number ride the border and the log holds only work. the only take that is instead of rather than plus."
			notes={[
				"buys a transcript of nothing but work: 4 receipts here, 12 in a full session",
				"its best argument was thinking 0.0s, and the fix retired that argument",
				"costs the tense: a live edge only ever says now, and a thread read tomorrow says nothing",
				"and it lives at the bottom of a scrolling column, which is where the eye is not",
			]}
		/>
	);
}
