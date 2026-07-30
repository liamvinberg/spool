import { QuietFrame } from "../../../shared/ui/spool-quiet-rail";

/**
 * agent-quiet--gone — neither beat is a row, and the log holds only work with a noun on it.
 *
 * **What it proposes.** The literal answer to the question. No wait beat and no thinking
 * row ever enters the log. One fixed line above the composer says which of four things
 * the rail is doing — `idle`, `waiting 1.4s`, `thinking 18s`, `working` — and it is
 * mounted before the first keystroke and still mounted after the last row.
 *
 * **The look of that line is not this frame's and is deliberately not designed here.**
 * It belongs to `agent-alive--`, drawn in parallel. What is here is the plainest possible
 * placeholder: one weight of mono at one opacity, no glyph, no spinner, no fade, a fixed
 * 22px whether a turn runs or not. Everything this take claims survives whatever that row
 * picks, because the claim is about the log rather than about the indicator.
 *
 * **What the screenshot becomes.** Seven rows go to five and 218px to 154px. Every row
 * left names something: `read site-punch-sheet--door-twice`, `run List shared libs and
 * site frames`, `run Read project instructions`, `read site-punch-sheet--patch`, `read
 * site-punch-press.ts`. Zero rows say nothing. The meter prints it.
 *
 * **And the log stops moving backwards.** This is the quieter win and the measured one:
 * nothing is ever removed from the transcript, so the splice that drops the words above
 * it by 26px eight times cannot happen. `moved down` reads 0px, and the live edge reads
 * zero enters, zero leaves, on screen 100%, because the only thing that says the rail is
 * busy was already there.
 *
 * **What is lost, plainly, and it is real.** The turn's own accounting. Read this thread
 * back tomorrow and five `read`s and two `run`s sit in a row with nothing saying that
 * 38.8 of the 47.6 seconds between them went on waiting and thinking. In capture time
 * **82% of this turn is the two things this take stops recording**, and over the
 * screenshot's own four requests it is 88%. So the honest description of this frame is
 * not "the log gets cleaner", it is "the log stops being a timesheet".
 *
 * **The answer to whether anyone minds is: mostly no, and the corpus says why.** The
 * record being lost is not one legible number per turn, it is one row per block, and
 * blocks are tiny — 22 of the 36 thoughts in the seven fixtures carry two deltas or
 * fewer and seven carry none. A log of `thinking 0.0s · thinking 0.1s · thinking 0.0s`
 * is not an audit trail, it is noise that happens to contain an audit trail twice in
 * thirty-six. If the accounting is worth keeping it is worth keeping *once per turn*,
 * which is `--receipt`, or *while it matters*, which is `--clock`.
 *
 * **What it beats.** `now`, on every number the meter prints. What it does not beat is
 * either of those two, and the whole point of drawing all three is that this one is the
 * floor they have to earn their line against.
 */
export default function AgentQuietGoneFrame() {
	return (
		<QuietFrame
			take="gone"
			title="gone · both beats leave, one fixed line stays"
			claim="nothing is removed, so nothing above the edge can move down."
			after="No. Five rows with nouns on them and no record that 82% of the turn was waiting and thinking. That is the cost, and the corpus argues it is worth paying: 22 of 36 thoughts carry two deltas or fewer."
			notes={[
				"the fixed line's look belongs to agent-alive--, not to this frame.",
				"22px, constant, so it can never move anything.",
			]}
		/>
	);
}
