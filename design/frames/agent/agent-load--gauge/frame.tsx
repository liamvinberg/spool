import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-load--gauge — the stroke stops sweeping and starts reading. No word anywhere.
 *
 * **The premise is that a loader which cannot say anything is a loader that has been given
 * the wrong job.** Every other take on this row answers the flatness by putting a second
 * object next to the stroke. This one answers it by making the stroke itself the readout:
 * the sweep comes off, the line becomes determinate, and its length is how long the current
 * wait has run. A thought that runs and runs visibly fills the border; a two-hundred-
 * millisecond read barely marks it. Same object, same pixels, same zero enters and zero
 * leaves, and now it distinguishes the two cases the shipped one deliberately conflates.
 *
 * **It is also the only take here with a lie in it, and the lie is worth looking at rather
 * than arguing about.** A determinate bar promises an end. A request that has not answered
 * has no end to promise, and nothing on the wire predicts one — `AgentThinking` carries a
 * token count and no prose, and there is no progress event of any kind. So the denominator
 * has to be borrowed, and the nearest honest one is the slowest first token this repo has
 * ever measured: 4,043ms of 50 captured, against a median of 1,970 and a floor of 878. The
 * line therefore reads *this wait against the worst one we have seen*, which is a real
 * quantity and is not what a filling bar looks like it means. A thought that outruns the
 * record pins at full and sits there, which is the case that gives the compromise away.
 *
 * **What it wins if the lie is acceptable.** Nothing is added to the rail, nothing new
 * moves, and no word has to be chosen or translated. It is the cheapest possible answer to
 * "how long has this been going" — the answer is a length, read without reading.
 *
 * **What it gives up.** The word. `gauge` can say *how much* and can never say *which*: a
 * request out and a `write` running fill it identically, so the half of the complaint about
 * telling states apart is untouched. It also loses the stroke's one aesthetic asset. The
 * wind is the product's own metaphor — spool means winding thread, its conversations are
 * threads, and the laying-and-taking-up is that said in one line. A percentage bar is a
 * percentage bar.
 */
export default function LoadGaugeFrame() {
	return (
		<WaitFrame
			take="gauge"
			title="gauge · the loader is the number"
			claim="the same hairline, determinate: its length is this wait against the slowest one ever measured."
			notes={[
				"4043ms of 50 captured is the denominator. median is 1970.",
				"a determinate bar promises an end the wire does not have.",
				"it says how much and never which: a wait and a write fill alike.",
				"it also spends the wind, which is the product's own metaphor.",
			]}
		/>
	);
}
