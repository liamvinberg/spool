import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-load--row — the thought goes back in the log, and this time it stays there.
 *
 * **`b4aef45` deleted the wrong half of this.** Its own changeset gives two reasons and
 * they are not the same reason. The first is about content: the wire carries no thinking
 * text, every thinking field in every capture is empty, so the line could only ever be a
 * duration and the ordinary reading was `thinking 0.0s`. The second is about behaviour:
 * "The wait was also the one line the log ever removed, and removing it dragged everything
 * above it down 38.3px at the moment an answer landed."
 *
 * The second reason kills a line that is **taken back out**. It says nothing at all about a
 * line that is written once and left alone. This take is that: a thought enters with the
 * rest of the turn, the log follows it exactly the way it follows a tool row, and when the
 * answer lands nothing is spliced and nothing moves. The shift meter beside the frame is
 * the claim — every other row in this transcript already enters and stays, and there is no
 * reason a thought cannot be one of them.
 *
 * **The first reason is answered by not overreaching.** This draws a duration and never
 * pretends to a thought, because a duration is what exists. `thinking 4.0s` in the tool
 * row's own grammar — a mark, a verb, and what it was about — which is the grammar the log
 * already uses for every other thing that took time. And `thinking 0.0s` was only the
 * ordinary reading because the old beat opened on the *thinking* event; opened on the wait,
 * the four real times to first token in this script are 878ms to 4,043ms, which are numbers
 * worth printing.
 *
 * **What it buys that nothing else on this row can.** It survives the turn. Every other
 * take here is live-only: look away for thirty seconds and the rail has no memory of where
 * the time went, because a permanent slot only ever shows *now*. A receipt can be read back
 * an hour later, and a transcript where two writes are eleven seconds apart with nothing
 * between them is a transcript missing its explanation. This is also the only take that
 * answers the complaint in its own words — the thinking is not visible anywhere, and here
 * it is a line you can point at.
 *
 * **What it costs.** Rows. Twelve waits in an ordinary `claude-edits` turn is twelve lines
 * of log spent on durations, against a transcript whose whole design is that it holds
 * receipts worth keeping, and `agent-rail.tsx` is explicit that a wait "was the absence of
 * an answer rather than a thing that happened". Counting runs the way the tool rows already
 * count runs of writes would take twelve to one or two, and is the obvious next frame if
 * this direction wins. The stroke is deleted here, because a log that says what is
 * happening does not also need a border that says something is.
 */
export default function LoadRowFrame() {
	return (
		<WaitFrame
			take="row"
			title="row · the thought is a receipt, and receipts do not leave"
			claim="the wait back in the log in the tool row's grammar, written once and never removed. no stroke."
			notes={[
				"b4aef45 killed a line that was taken out again. this one stays.",
				"so the 38.3px it measured cannot happen: nothing is spliced.",
				"real ttft is 878 to 4043ms. thinking 0.0s was the wrong event.",
				"the cost is rows: twelve a turn until runs are counted.",
			]}
		/>
	);
}
