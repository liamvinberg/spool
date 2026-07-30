import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-wait--line — one word at the transcript's edge, always there, saying which of
 * three things the rail is doing.
 *
 * **What it proposes.** A mark cannot say what it is. A word can, so this is a word:
 * `idle` before anything is asked, `working` while spool's own tools are running, and
 * `waiting 1.4s` while a request is out and nothing has come back. It is pinned to the
 * bottom edge of the transcript, outside the scrolling column, and it is mounted before
 * the first keystroke and still mounted after the last row. Zero enters, zero leaves,
 * on screen 100%.
 *
 * **Why the edge rather than the footer.** This is `none`'s stated cost answered
 * directly. `none` is fine except that the two places spool already says a turn is
 * running are both far from where the eye is, and where the eye is is the live end of
 * the log. So the one take that puts words there puts them at the bottom of the
 * transcript, not in the composer. It is the same pixels round one's `footer` take
 * used, and the difference is the whole of round two: that one faded in when a request
 * went out and faded out when it landed, so it was an object arriving and leaving in
 * the corner of your eye with a measured zero movement. This one never goes.
 *
 * **The 24px inset is a constant, not a reserve.** The column carries it whether or not
 * a turn is running, on an empty thread and a full one, so it cannot move anything —
 * which is the same answer round one gave and it survives unchanged. #145's reserve was
 * a message's own height, appearing while it streamed and going when it settled.
 *
 * **The one thing on this line that moves is a digit.** `waiting` carries the elapsed
 * count and it is `tabular-nums`, so a digit changing changes no width and pushes
 * nothing. The word itself changes by crossfade in place. Nothing is laid out twice.
 * Whether a live counter is a second kind of motion nobody asked for is a real question
 * and this frame is where to look at it: it runs for a measured 878ms at the fastest
 * and 4,043ms at the slowest, which is the range over which a number is either useful
 * or fidgety.
 *
 * **Three states rather than two, and that is what makes it worth its pixels.** Round
 * one only ever asked what to draw while a request is out. A rail that is always
 * telling you what it is doing has to answer the other 44% too, and `working` is a
 * thing `none` never says and today's beat never says: with the beat spliced out, a
 * finished row reading `done` is the only thing on screen while a tool runs for two
 * seconds. This take is the only one on the row that distinguishes *the model is
 * thinking* from *your machine is busy*.
 *
 * **What it costs.** 24px of transcript on every thread forever, a permanent word in a
 * surface whose whole argument is that it holds only what happened, and a third live
 * region in a rail that already has the stop and the thread mark. And it is the take
 * furthest from anything the research found: every surface read at the source puts its
 * indicator *in* the flow, so an always-present line outside the flow has no precedent
 * anywhere — which cuts both ways, since none of them solved this either.
 *
 * **What it beats.** `mark`, by saying what it means, and `fact`, by having somewhere
 * to say it — the footer measurement on that frame is what rules a sentence out of the
 * composer row. It beats `none` only if a word at the edge is worth 24 permanent pixels,
 * which is the question to answer while watching it rest.
 */
export default function WaitLineFrame() {
	return (
		<WaitFrame
			take="line"
			title="line · one word at the edge, idle / working / waiting"
			claim="pinned outside the scrolling column, mounted before the first keystroke. only the word inside it changes."
			notes={[
				"the only take that says working, so a tool running for two",
				"seconds stops looking like nothing happening.",
				"the 24px inset is constant, on an empty thread and a full one.",
				"the elapsed count is tabular-nums: a digit moves no width.",
			]}
		/>
	);
}
