import { QuietFrame } from "../../../shared/ui/spool-quiet-rail";

/**
 * agent-quiet--clock — the accounting lives on the fixed line, so it costs no row at all.
 *
 * **What it proposes.** `gone`, plus one thing: the fixed line already there is also
 * where the turn's cost is kept. While the turn runs it reads the state and the running
 * split beside it — `thinking 18s · waited 7.6s · thought 18.0s · worked 3.7s` — and when
 * the turn lands the state word drops away and the split stays, alone on the line, until
 * the next send replaces it.
 *
 * **Why this is the interesting one.** It answers the where-did-the-time-go question
 * without putting anything in the log. The two beats leave, the row count stays at five,
 * `moved down` stays at 0px, the live edge stays at zero enters and zero leaves — every
 * number `gone` wins on, this one wins on identically — and the accounting is still
 * there. Nothing was added to the rail: the line exists in every take but `now`, and this
 * take spends the rest of its width rather than a new object.
 *
 * **What it costs, and it is the one thing that decides between this and `--receipt`.**
 * The record is *not durable*. It describes the turn that just ran, so the moment you
 * send again it is gone, and it was never per-turn scrollback — read the thread back next
 * week and there is nothing. So this take is worth more than `receipt` if what you want
 * the number for is *deciding what to do next* ("that took 47 seconds, most of it
 * waiting, I should ask for less") and worth less if what you want it for is
 * reconstructing a session.
 *
 * The second cost is the width. At the shipped 420 the box is 392 and the whole split is
 * 46 characters of Fragment Mono, so it fits with the state word in front of it — but the
 * rail drags to 200, where it does not, and the honest behaviour there is that the split
 * truncates and the state word never does. State first, cost second, cut from the right:
 * what is happening now outranks what it has cost so far, at every width.
 *
 * **The numbers are capture time and the frame says so.** A wait is real — the binary
 * measures `ttft_ms` itself — and a thought's clock is what today's row already prints.
 * Tool time is unioned per answer rather than summed, because three calls sent together
 * cost the span they cover: summing them reads this turn's first answer as 4.8s where it
 * cost 2.2s. That correction is worth 2.6s on one answer and it is why the split is
 * computed in `quiet-turn.ts` rather than added up in the rail.
 *
 * **What it beats.** `receipt`, on cost: same information, no row, no entry, no scrollback
 * to maintain. What it loses to `receipt` on is the only thing that matters if the answer
 * to "does anyone need this" turns out to be yes tomorrow rather than now.
 */
export default function AgentQuietClockFrame() {
	return (
		<QuietFrame
			take="clock"
			title="clock · the split rides the line the state is already on"
			claim="the whole accounting, and not one row of the log spent on it."
			after="Yes, while the thread is on screen: the line holds the split after the turn lands. Not tomorrow, and not per turn once you send again. Free in rows, worthless as an archive."
			notes={[
				"state first, cost second, cut from the right at a narrow rail.",
				"tool time is unioned per answer: summing is 2.6s wrong on one.",
			]}
		/>
	);
}
