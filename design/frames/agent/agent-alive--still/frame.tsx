import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--still — the honest null. The mark is there and it never moves, and working is
 * told from resting by strength and by one word.
 *
 * **It is `fold` with the motion taken out, deliberately.** Same three bars, same two words,
 * same slot, same 36px. The bars sit in a staircase rather than at one length, because three
 * equal lines in a 14px box is the menu glyph and a still mark has no motion to distinguish it
 * from one — a cost only this frame pays, since `fold` is only ever that shape at rest. Which makes it the control for the take at the head of this row
 * rather than a tenth idea: if the wave is worth anything, the difference between these two
 * frames is what it is worth, and that difference is watchable side by side on the canvas.
 *
 * **Round one already voted for this shape and was overruled by its own reasoning.** `none`
 * won round one — *i like the none i think most, that you dont see anything* — and the one
 * thing held against it was that the two places spool says a turn is running are both far
 * from where the eye is. This is `none` with that fixed and nothing else added: the eye's own
 * place, one permanent object, no motion.
 *
 * **What it is uniquely good at.** It is the only take here whose `prefers-reduced-motion`
 * rendering *is* the design, so #161's trap cannot fire — there is no fallback to collide
 * with an existing meaning, because there is no fallback. It writes nothing, moves nothing,
 * composites one opacity step at each boundary, and it is the only take whose whole
 * behaviour can be described without reference to a duration. Against a measured 878ms
 * fastest wait, a take with no cycle is the only one that cannot be caught mid-nothing.
 *
 * **What is honestly wrong with it, and it is one thing.** For the median 1970ms and the
 * measured worst 4043ms there is no evidence the process is alive rather than hung. A word at
 * full strength is a claim; motion is a receipt. Claude Code answers this by escalating the
 * words — `thinking` → `still thinking` → `thinking some more`, and `Waiting for API
 * response` on a stall — and that repair needs a clock, which is `agent-wait--line`, which is
 * the take Liam has just turned down. So the honest position is that this take is right if
 * and only if nobody ever needs to know the difference between slow and stuck.
 */
export default function AliveStillFrame() {
	return (
		<AliveFrame
			take="still"
			title="still · present, and never moving"
			claim="fold with the motion taken out: the same mark, the same two words, and nothing animating at any point."
			notes={[
				"the control for the frame at the head of this row.",
				"the only take whose reduced-motion state is the",
				"design, so #161's collision cannot fire at all.",
				"cost: nothing here can tell slow from stuck.",
			]}
		/>
	);
}
