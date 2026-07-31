import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--held — the fix and nothing else, which is the floor this row is measured
 * against.
 *
 * **Round three shipped the right pair of objects and anchored one of them to the wrong
 * instant.** The stroke says *alive* in the periphery for free; the receipt says *how
 * long* in the log, permanently. Neither of those decisions is reopened here. What #231
 * changed is one line in the projection: the receipt used to settle on the first token off
 * the wire and now settles on the first thing the log draws.
 *
 * **The bug that change fixes, in one measurement.** A message that begins with a thinking
 * block reaches `message_start` immediately, so the old anchor stopped the clock at the top
 * of the thought. The largest thinking block in the seven captures is 9,500 estimated
 * tokens; at the 16.7ms a token the four sequential captures report, that is two minutes
 * thirty-nine seconds during which the receipt read `thinking 0.0s` and every mark in the
 * rail was at rest. The receipt was at its least useful exactly where the wait was longest,
 * which is the inversion, and it was sitting in the fixtures the whole time: `claude-turn`
 * ends on a long run of thinking deltas and then an error, so its last request is one
 * nothing was ever drawn for.
 *
 * **So this frame is the honest question for the rest of the row.** The number now climbs
 * through the thought — you can watch it reach 31.2s here — and the receipt's own mark
 * turns for the whole of it. That is two live signals in the rail already: the mark in the
 * log and the stroke on the border. Before anything is added to the stroke, this is what
 * having fixed the anchor actually looks like, and it may well be enough.
 *
 * **What is genuinely still wrong with it, stated so the row has something to beat.** The
 * live number is in the log, and the log scrolls. A reader whose eye is on the composer —
 * which is where a reader's eye is, because that is where their hands are — has only the
 * stroke, and the stroke is deliberately flat: `agent-rail.tsx` states it as the design,
 * "a request out, thinking, saying and doing all draw the same laying-and-taking-up". That
 * flatness is correct reasoning about a four-second wait and it is untested against a
 * hundred-and-fifty-nine-second one. Every take to the right of this frame is one property
 * spent on that gap.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="held"
			title="held — the anchor moved, and nothing else did"
			claim="the receipt counts through the thought. the stroke is unchanged and says the same thing at 1s and at 159s."
			notes={[
				"the fix: settle on the first drawn thing, not the first token off the wire",
				"old anchor put thinking 0.0s over a 9,500-token thought = 2m39s of nothing",
				"two live signals already: the receipt's mark in the log, the stroke on the border",
				"the gap it leaves: the number is in the log, and the eye is on the composer",
			]}
		/>
	);
}
