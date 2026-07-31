import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--slow — the stroke's pace is the length of the wait.
 *
 * Same track, same colour, same one pixel. The cycle stretches from the shipped 1600ms
 * toward 4200ms as the wait runs long, so a quick answer sweeps and a long thought crawls.
 *
 * **It is the only take here that spends nothing.** No colour is claimed, no second object
 * is introduced, no pixel of the transcript or the border is taken. The change is one
 * `animation-duration` on an element that already exists, which means there is no state it
 * can be caught in that looks like anything other than the loader it already is. Against a
 * row where every other proposal has a cost paragraph, that is the strongest thing on this
 * page.
 *
 * **And the metaphor is the product's own.** Spool means winding thread; the composer's
 * border is a thread being laid out and taken up. Thread being drawn slowly is a thing
 * that reads as effort without anybody having to be taught it, which is more than can be
 * said for a colour ramp.
 *
 * **What is wrong with it is the direction, and it is a real objection.** Slower reads as
 * *less happening*, and the truth is the opposite: a model reasoning for two minutes is
 * doing more work than one that answers in one second, not less. There is a version of
 * this take that runs the other way — faster the longer it goes — and it was not drawn
 * because it reads as panic and because a stroke sweeping the border every 400ms is the
 * largest moving thing in the rail by a distance. The floor at 4200ms is the same worry
 * from the other end: below about a quarter of a hertz a peripheral sweep stops reading as
 * motion at all, and a loader that has slowed to a stop is the exact failure this round is
 * fixing.
 *
 * **It cannot be read at a glance.** A pace only means something against another pace, so
 * a reader who looks over once has nothing — they see a stroke moving, which is what
 * `held` already gives them for free. That is the trade against `warm`, and it is the
 * whole trade: `warm` is legible and spends the accent, `slow` spends nothing and needs
 * two looks.
 *
 * **It lost, on the objection above and on one this page could not have shown.** The
 * direction is the first reason: the round exists because a rail read as stopped, and
 * answering *is this alive* by moving less spends the evidence at the moment it is being
 * asked for. The second is mechanical. `animation-duration` on a running CSS keyframe
 * animation remaps the phase — elapsed time stays, the fraction it represents shrinks — so
 * the head jumps backwards along the track every time the number moves. Here it never
 * shows, because the demo turn barely moves the value across its own range. In the rail,
 * where the count ticks continuously, it would be the most visible thing in the composer.
 * `strength` is what shipped instead.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="slow"
			title="slow — the pace is the length of the wait"
			claim="the cycle stretches 1600ms → 4200ms as the wait runs. one property, nothing claimed, nothing added."
			notes={[
				"the only take on this row with no cost paragraph: one animation-duration",
				"thread drawn slowly reads as effort without having to be taught",
				"the objection: slower reads as less happening, and the truth is the opposite",
				"floor at 4200ms — below a quarter hertz a peripheral sweep stops reading as motion",
			]}
		/>
	);
}
