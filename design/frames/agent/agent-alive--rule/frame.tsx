import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--rule — a bright segment travelling the 1px border the composer already draws.
 *
 * **The only take on this row that spends no pixels.** Every other one takes 36px of
 * transcript away on every thread forever, empty threads included; this one lives inside a
 * line that is already on screen and hands the 36px back. The panel prints it: transcript
 * gives up 0px.
 *
 * **It is not a gradient animation and that distinction is the whole of why it is allowed.**
 * #149 measured an `edge` gradient *freezing mid-sweep* when the wire paused, and #149
 * disqualified `blur` and `soften` because Chromium will not composite them. What is banned
 * is animating paint. The segment here is a gradient painted **once** and carried by a
 * `translateX`, which is the same class of thing as any other transform on this row. Its
 * reset is invisible: it leaves the right edge before it reappears at the left, both outside
 * the clip, so there is no frame in which it jumps.
 *
 * **What is honestly wrong with it is scale.** This is 391px of motion at the edge of the
 * eye, the largest moving thing anywhere in the rail, and it is peripheral by construction —
 * you cannot look at it, only notice it. Whether that is the best or the worst property here
 * is exactly what this frame is for.
 *
 * **And it is an indeterminate progress bar.** That reads two ways and both are true. An
 * indeterminate bar is the one widget in the world whose established meaning is already
 * *nobody knows how long*, which is precisely the claim this rail is entitled to make and
 * the constraint every other take has to be argued into. But it is also a bar on a rail whose
 * every other object is a verb and a subject, and a bar is the most generic thing software
 * does. It borrows an idiom rather than saying anything.
 *
 * **The fallback is the one soft spot.** Reduced motion draws the whole rule one step
 * brighter and still, which is a hair away from a focus ring on the composer — the only other
 * reason a border in this rail changes strength.
 */
export default function AliveRuleFrame() {
	return (
		<AliveFrame
			take="rule"
			title="rule · an edge the rail already has"
			claim="a 44px segment travelling the composer's own 1px border. the transcript gives up nothing, because the line was already there."
			notes={[
				"a gradient painted once and carried by a transform,",
				"not the animated background-position #149 ruled out.",
				"it is an indeterminate bar: the one idiom that means",
				"unknown, and the most generic thing in software.",
			]}
		/>
	);
}
