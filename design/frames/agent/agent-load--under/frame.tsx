import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-load--under — the stroke keeps its job, and the sentence takes the slot that had
 * room for it all along.
 *
 * **This take exists because round two lost an argument on the wrong axis.** `fact`
 * proposed a readout that is never blank and never a placeholder: `waiting 2.7s · 3 of 4`
 * while a request is out, `13s turn · 56% waiting` once one lands, `no turns yet` before
 * the first. It was drawn in the composer footer and it was measured there, and the
 * measurement killed it — 389 of 391 at the shipped rail, 118 over at the 300 the ticket
 * had been written against, with the model name paying all of it. That is #184's defect
 * walking back in, and it is a fair thing to reject.
 *
 * But it is a fact about the **footer**, not about the sentence. `agent-wait--fact`'s own
 * note says so in four words at the end of its measurement — "line's slot fits it" — and
 * nothing on that row ever put the two together. `line`'s slot is the transcript's bottom
 * edge, outside the scrolling column, and it costs the footer nothing: 243 of 391, the same
 * as a rail with no readout at all. So this is `fact`'s content in `line`'s place, with the
 * stroke left exactly as it ships.
 *
 * **What that buys.** The stroke goes on saying *alive* in the periphery and the sentence
 * says *what* and *how long* to anybody who looks down. They are not competing, because
 * they are answering different questions and only one of them is moving. The number is
 * `tabular-nums`, so a digit changing changes no width and the line never reflows.
 *
 * **What it costs, and it is the honest objection to this whole family.** Two objects now
 * mean *the machine is working*, nine pixels apart, and the rail has one of them already.
 * `agent-wait--shimmer` priced the counting itself: for a measured 878ms at the fastest and
 * 4,043ms at the slowest, something is ticking in the corner of the screen, and a number
 * that has to be read is a number that asks to be read. That objection survives the move
 * to this slot unchanged. `ride` is the answer to it that keeps the number; `shimmer` is
 * the answer that drops it.
 */
export default function LoadUnderFrame() {
	return (
		<WaitFrame
			take="under"
			title="under · the stroke stays, the sentence moves"
			claim="fact's content in line's slot: what it is doing and how long, with the footer untouched."
			notes={[
				"fact lost on the footer's width, not on what it said.",
				"243 of 391 here against 389 there. line's slot fits it.",
				"the cost is two objects meaning working, nine pixels apart.",
				"tabular-nums, so the digit changes and nothing reflows.",
			]}
		/>
	);
}
