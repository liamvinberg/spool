import { SpunFrame } from "../../../shared/ui/spool-spun-rail";

/**
 * agent-spun--wound — the composer is the spool, and the thread winds around it.
 *
 * The one take that leaves the top edge, and it is here to be measured against the ones that
 * do not. The field a person types in is a box with a border; a 64px stroke travelling that
 * border on a closed loop is the plainest drawing of winding onto a spool, and it puts the
 * motion around the thing the eye is already resting on rather than at the boundary above it.
 *
 * **A closed path cannot be a percentage.** That is `agent-alive--orbit`'s argument and it is
 * the strongest answer to the progress problem anywhere in this round: there is no end of the
 * track to arrive at, because the track returns. The measured cycle constraint dissolves for
 * the same reason — nothing is incomplete when there is nothing to complete, so a 3.3-second
 * lap against an 878ms floor costs this take nothing where 2,400ms killed `--breathe`.
 *
 * **The measurement the brief asked for is on the frame.** The field's perimeter is about
 * 1,000px against the top edge's 420: **2.4× the peripheral motion for the same one bit of
 * information**, and it is drawn around the composer rather than above it, so the motion is
 * inside the region a person is looking at while typing rather than at the edge of it. It is
 * also the only take here that is not compositor work — a segment on a closed path is
 * `stroke-dashoffset`, which Chromium runs on the main thread, and the dash array is owned in
 * px rather than through motion's `pathOffset` so a 64px stroke stays 64px across the rail's
 * whole 200–480 range.
 *
 * **And it is one step from a widget everybody has seen.** A soft beam travelling a rounded
 * rectangle is the border-beam every AI product shipped in 2025. What keeps this one out of
 * that is a hard-ended 1px stroke instead of a glowing gradient, and being off at rest.
 * Whether that is enough is exactly what the frame is for, and the honest answer is that it is
 * the closest thing in this round to something spool would be accused of copying.
 *
 * **Three states.** Working, idle, and a break in the field's own border at the top centre for
 * `asking`. It cannot tell `out` from `doing` without changing speed, which on a closed loop
 * reads as a different animation rather than a different state.
 */
export default function SpunWoundFrame() {
	return (
		<SpunFrame
			take="wound"
			title="wound · the field is the spool"
			claim="a 64px stroke travelling the composer field's own closed border. a lap has no end, so nothing about it can be a percentage."
			notes={[
				"about 1,000px of track against the top edge's 420:",
				"2.4× the peripheral motion for the same one bit.",
				"the only take here that is not compositor work.",
				"and the closest thing in the round to the 2025 border-beam.",
			]}
		/>
	);
}
