import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--strength — what shipped, and the take the row's own constraint chose.
 *
 * The stroke's own colour, at the 75% it has always been, ramping to full at thirty seconds
 * of one unbroken silence. The travel is untouched. That is the whole of it.
 *
 * **The constraint decided this, not the aesthetics.** The complaint that opened the round
 * was a rail that read as stopped, and the answer to *is this alive* may not be given by
 * moving less. That rules out `slow` on its own terms: slowing the only moving thing in the
 * rail spends the evidence of life exactly when somebody is looking for it. Everything else
 * on this row either spends the one accent this palette has (`warm`), deforms the hairline
 * the composer is built on (`weight`), needs half a minute before it does anything at all
 * (`pair`), or gives up the record the receipt exists to keep (`quiet`).
 *
 * **`slow` also had a fault nothing in a frame could show, and it is worth writing down.**
 * Changing `animation-duration` on a running CSS keyframe animation remaps its phase: the
 * elapsed time stays and the fraction of the cycle it represents shrinks, so the head jumps
 * backwards along the track every time the number moves. On this page that never showed,
 * because the demo turn barely moves the value. In the rail, where the count ticks
 * continuously, it would be the most visible thing in the composer. A take that is one
 * property in a prototype and a rewrite in the product is not one property.
 *
 * **Strength has none of that.** Opacity interpolates continuously, so the ramp is a drift
 * rather than a step and a 400ms transition is the whole implementation. It reads in the
 * direction that helps — a longer silence draws a *more* present line — and it says it
 * without a word, an object, a colour or a millisecond of pace.
 *
 * **Thirty seconds is the top, off the captures rather than off taste.** 22 of the 27
 * thinking blocks measured are 1,050 estimated tokens or fewer, under 18 seconds at the
 * measured rate, so an ordinary turn lives in the bottom of the ramp and never reaches the
 * end of it. The five long ones arrive there and stay. This is the one number that changed
 * on the way to shipping: scaled to the worst thought at 159s the way the rest of this row
 * is scaled, four fifths of the range would be spent on waits almost nobody ever sits
 * through, and the ramp would be flat across every wait anybody does.
 *
 * **What is honestly still wrong with it.** It is the least legible thing on this row. A
 * quarter of a step of opacity on a one-pixel line is not something anybody will name, and
 * nobody is going to learn to read it as a duration. What it is instead is a rail that
 * feels slightly more insistent the longer it has been going, which is the most a
 * peripheral signal should try to be — and the receipt in the log, counting, is where the
 * actual number lives.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="strength"
			title="strength — shipped: brighter, never slower"
			claim="the stroke's own colour, 75% to full at thirty seconds. travel untouched, no accent spent, no object added."
			notes={[
				"chosen on the constraint: the answer to is-this-alive cannot be moving less",
				"slow's hidden fault: animation-duration remaps phase, the head jumps backwards",
				"tops out at 30s — 22 of 27 measured thoughts never get there",
				"least legible take here, and the receipt in the log is where the number lives",
			]}
		/>
	);
}
