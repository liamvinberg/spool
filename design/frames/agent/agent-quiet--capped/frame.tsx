import { QuietFrame } from "../../../shared/ui/spool-quiet-rail";

/**
 * agent-quiet--capped — the same log with `agent-think--run-cap` still on it, to find out
 * whether the cap has anything left to do.
 *
 * **Why this frame exists.** `--run-cap` was recommended last round for a reason that had
 * nothing to do with thinking: a run of consecutive machine rows was pushing the agent's
 * sentence off the top of the transcript, so the run got a 202px viewport of its own and
 * scrolled inside it. That question was left undecided. Removing the thinking rows makes
 * the run shorter, so the cap has to be re-measured rather than assumed, and this is the
 * only frame on the row that can answer it: same turn, same rail, same clock, cap on.
 *
 * **The measurement, and it is the answer.** 202px holds six whole rows and 16px of a
 * seventh, so the cap bites at seven.
 *
 *   with thinking, at the screenshot     7 rows, 218px — over, by one row
 *   without thinking, at the screenshot  5 rows, 154px — under, by 48px
 *
 * So at the exact moment the complaint was made, **removing the thinking rows removes the
 * need for the cap.** The frame prints both numbers live: `run now` shows what is drawn
 * against what the rows wanted, read off a hidden uncapped copy, and while the cap is not
 * biting those two numbers are identical and the meter stays quiet.
 *
 * **But it does not remove it forever, and this frame is honest about where it comes
 * back.** The turn carries on past the screenshot, and by the eighth request the run is
 * nine tool rows — 282px — so the cap engages and the second scrollbar appears. The
 * thinking rows were buying it four rows and three requests of earlier onset, no more.
 * The right reading is therefore: **thinking rows were making the cap look necessary
 * sooner than it is, and they were never the reason it might be.**
 *
 * **What that leaves the cap arguing about is a longer turn than anybody has drawn.**
 * `claude-edits.json` holds twelve requests and 24 tool calls, `claude-plan.json` 32; at
 * nine rows the cap is already on, so on a real session it is on for most of the turn.
 * Which means the decision is unchanged in substance and only moved in time, and its cost
 * is unchanged too: a second scroll region inside a scrolling log, where a wheel over the
 * run moves the run and a wheel two pixels above it moves the transcript with nothing on
 * screen saying which. `spool-thread-strip.tsx` refused a scrollbar on a 420px rail on the
 * grounds that "a trough across the top of a 420px rail is the loudest object in a
 * near-black interface", and this puts one inside the log.
 *
 * **What it beats.** Nothing on this row, and it is not trying to. It is here to retire an
 * open question with a number: the cap is not needed for the screenshot, and taking the
 * thinking rows out is a better fix for the screenshot than capping was.
 */
export default function AgentQuietCappedFrame() {
	return (
		<QuietFrame
			take="capped"
			title="capped · 202px still on, with nothing left to cap"
			claim="five rows want 154px against a 202px cap: it never bites here."
			after="Same as gone: no. The cap is about height, not about time, and removing the thinking rows was the better fix for the height it was aimed at."
			notes={[
				"it comes back at seven rows, which is request five, not request one.",
				"the cost is unchanged: a scroll region inside a scrolling log.",
			]}
		/>
	);
}
