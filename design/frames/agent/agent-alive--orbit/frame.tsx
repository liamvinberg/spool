import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--orbit — a dot travelling a closed path, so it can never imply progress.
 *
 * **The argument is one sentence.** Nothing in this rail knows how long a turn will take, so
 * nothing in it may draw a quantity. A bar that fills says 40% whether or not anything knows
 * that; a dot going round a closed path says only that it is still going round, which is the
 * entire claim an indicator is entitled to make here. It is the constraint at the centre of
 * this row, drawn as directly as it can be drawn.
 *
 * **The path is not visible, and that is the design.** A drawn track invites reading the dot's
 * position along it, which puts the percentage straight back in through the other door. So the
 * only thing on screen is a 3px dot and the 18×8 stadium it happens to trace: closed, so it
 * returns; smooth, so there is no corner that reads as a step; and small enough that the
 * whole path is inside foveal vision at once, which is what stops the eye from tracking it.
 *
 * When the answer lands it coasts to the top of the path and stops, so the resting state is
 * one dot in one place rather than a dot wherever it happened to be. That homing is the one
 * piece of machinery `agent-wait--mark` needed and this take still needs, because a path has a
 * canonical rest position the way a rotation has an upright.
 *
 * **No word.** Which is also its weakness: this is the unnamed spinner the whole complaint
 * started with, in a nicer shape. Round one's one point of agreement was that an unlabelled
 * indicator is the weakest object in this rail, because every other row in it is a verb and a
 * subject.
 *
 * **What the meters say.** Zero writes, `x` and `y` only, a fixed 18px box. 2000ms a lap
 * against a median 1970ms wait, so the median wait sees almost exactly one lap — which is
 * either fine or an argument that the cycle should be faster than any real wait so that the
 * loop is never the unit being perceived.
 */
export default function AliveOrbitFrame() {
	return (
		<AliveFrame
			take="orbit"
			title="orbit · a closed path, so no percentage exists"
			claim="one 3px dot on an undrawn 18×8 stadium. a closed path returns, so no position in it can mean 40%."
			notes={[
				"the track is invisible on purpose: a drawn one lets",
				"the dot's position be read as progress again.",
				"one lap is 2000ms against a median 1970ms wait.",
				"cost: it is the unnamed spinner, in a better shape.",
			]}
		/>
	);
}
