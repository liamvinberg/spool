import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--weight — the word itself thickening on an axis this document does not have.
 *
 * **Drawn to be killed, and it takes three independent facts to do it.** It is on the row
 * because a weight axis is a genuinely different idea about how type can be alive — no glyph,
 * no object, no travel, just the letters getting heavier and lighter — and because the reasons
 * it cannot happen here are facts rather than taste, which is the only kind of argument that
 * settles anything on this page.
 *
 * *One: the register has one weight.* `design/AGENTS.md`'s rule is that machine text is
 * lowercase mono, and a status line is machine text. `fonts.css` loads **Fragment Mono at
 * weight 400 only**, because that is all the family has. So this take cannot exist in the
 * register it belongs to. What this frame does instead is move the status word into the sans,
 * visibly, so the cost is on screen rather than in a note: that is a status line in Familjen
 * Grotesk at 14px sitting where every other frame on this row puts mono at 12px, and it looks
 * like what it is, which is the rail talking in the wrong voice.
 *
 * *Two: the axis is not an axis.* `fonts.css` imports Familjen Grotesk as
 * `wght@400;500;600;700` — four static instances, not a variable font. An animated weight
 * therefore does not sweep, it **steps four times**, and the steps are visible at this size.
 * A real variable axis would need a self-hosted variable file, which is a `@font-face` and up
 * to 1MB in every frame document, spent so a word can get bolder.
 *
 * *Three: weight is geometry.* Glyph advances change with weight, so every step **lays out**
 * and the word's own box changes width. The slot meter reads that directly: the widest step
 * and the number of steps are both non-zero here and zero for every transform take on the row.
 * Nothing sits to the right of the word in this slot, so nothing is pushed — but a take whose
 * mechanism is a reflow has no safe place to grow into, and the composer footer #184 measured
 * to the pixel is nine pixels below it.
 *
 * **What survives.** The idea that the word can be the animation rather than carrying one is
 * good, and the version of it that works on this stack is a crossfade or an opacity sweep over
 * a fixed-metric word — which is `agent-wait--shimmer`, already drawn one row up, already
 * measured as the one thing on that row Chromium repaints, and already the take Liam's
 * redirection moved away from.
 */
export default function AliveWeightFrame() {
	return (
		<AliveFrame
			take="weight"
			title="weight · an axis this document does not have"
			claim="fragment mono ships one weight, so the status line has to leave its own register to do this at all. it is in the sans here, visibly."
			notes={[
				"familjen grotesk is four static instances here, so",
				"the axis is four visible steps, not a sweep.",
				"weight is glyph metrics, so every step lays out and",
				"the word's own box changes width. the meter reads it.",
			]}
		/>
	);
}
