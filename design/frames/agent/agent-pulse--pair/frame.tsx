import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--pair — a second head joins the track once the wait passes thirty seconds.
 *
 * The three takes to the left of this one are continuous: they map a duration onto a
 * property and ask the reader to estimate. This one refuses the mapping and draws a
 * threshold instead. Under thirty seconds it is the shipped stroke, unchanged and
 * unarguable. Over thirty seconds a second head is travelling half a cycle behind the
 * first, and *that* is a fact rather than an estimate.
 *
 * **Thirty seconds is not a taste number.** Of the 27 thinking blocks in the seven
 * captures, 22 are 1,050 tokens or fewer — under eighteen seconds at the measured rate —
 * and would never reach this at all. The five above it are the ones the round exists for.
 * So the second head is rare by construction, and a signal that fires on a fifth of long
 * thoughts and never on an ordinary turn is a signal that still means something the
 * hundredth time somebody sees it. Every continuous take is at some non-zero value on
 * every single request, which is the quiet reason they fade into the furniture.
 *
 * **The second element exists from boot and is transparent until it is wanted**, which is
 * the whole of how this take stays inside round two's bar. Nothing enters and nothing
 * leaves; an opacity changes. That distinction sounds like bookkeeping and it is not: the
 * entire complaint that opened round two was *"with others it moves up and down"*, an
 * object being created and destroyed, and a fade-in is that object arriving as far as the
 * eye is concerned even if the DOM disagrees.
 *
 * **What is wrong with it is that it doubles the moving thing in the rail.** The stroke's
 * own source prices itself honestly — "420px of peripheral travel every 1.6s at 0.26px/ms,
 * the largest moving thing in the rail" — and this makes that two, at the exact moment a
 * person has been waiting long enough to be irritated. It is also the only take here that
 * cannot be described in one clause: *it goes redder* and *it slows down* are sentences,
 * and *a second stroke joins at thirty seconds* is a rule you have to be told once. Nothing
 * else on this row needs telling.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="pair"
			title="pair — a second head past thirty seconds"
			claim="a threshold rather than a ramp: unchanged under 30s, two heads over it. rare by construction, so it keeps meaning something."
			notes={[
				"30s ≈ 1,800 tokens: 22 of the 27 measured thoughts never reach it",
				"the second span exists from boot and changes opacity — nothing enters, nothing leaves",
				"a fact rather than an estimate: the other three ask you to judge a value",
				"doubles the largest moving thing in the rail, and needs telling once",
			]}
		/>
	);
}
