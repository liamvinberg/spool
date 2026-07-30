import { SpunFrame } from "../../../shared/ui/spool-spun-rail";

/**
 * agent-spun--wind — `agent-alive--rule` with the two ends untied.
 *
 * The seed take was a 44px gradient segment carried along the composer's border at a
 * constant length. This is the same border and the same one-transform cost, and the
 * difference is that the head and the tail move on their own schedules: the stroke is
 * **drawn out of the left edge**, carries at its full 172px, and is **taken up into the
 * right edge** as the head waits there for the tail to arrive. `translateX(tail)
 * scaleX(length)` about a left origin is one matrix, so two independent ends cost exactly
 * what one travelling segment costs.
 *
 * **What that buys over the seed, and it is not a re-timing.** A gradient has no ends, so it
 * reads as light passing over a track and the track is the object. A solid stroke has two,
 * so it reads as a thread with a beginning. And the length is 0 at both ends of the cycle,
 * which means the reset happens **on screen and is invisible** — `rule` had to carry its
 * segment off the right edge and back in from outside the clip to hide the same moment.
 *
 * **The progress question, answered by the arithmetic rather than by taste.** The stroke
 * peaks at 0.41 of the track and its length falls for the whole second half of the cycle.
 * There is no state of it that is full, and nothing about it accumulates.
 *
 * **It tells two states apart and says so.** Working and idle. The argument is that a stroke
 * travelling the boundary is answering *is it alive*, and a reader watching the edge of their
 * own eye learns nothing from the difference between a request being out and a `read` being
 * open, because the answer to *do I need to do anything* is no in both. The one state that is
 * a call to act gets a shape instead: the stroke stops where it was and an 18px break opens in
 * the line.
 *
 * **What is still honestly wrong with it** is the thing that was wrong with the seed: 420px of
 * peripheral travel every 1.6 seconds is the largest moving thing in the rail, and this take
 * changes what is moving rather than how much of it moves.
 */
export default function SpunWindFrame() {
	return (
		<SpunFrame
			take="wind"
			title="wind · laid down and taken up"
			claim="the head leaves the left edge first and the tail follows a fifth of a cycle later. one matrix, two ends, no state of it full."
			notes={[
				"against rule: a stroke has ends, a gradient does not,",
				"and the reset is on screen because the length is zero there.",
				"unchanged from rule: 420px of peripheral travel, which is",
				"the largest moving thing anywhere in the rail.",
			]}
		/>
	);
}
