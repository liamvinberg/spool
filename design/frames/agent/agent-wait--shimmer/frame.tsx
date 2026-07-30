import { WaitFrame } from "../../../shared/ui/spool-wait-rail";

/**
 * agent-wait--shimmer — the same permanent word, alive because the light moves across it
 * rather than because a number is changing.
 *
 * **This one is the research's, not mine.** It exists because reading Claude Desktop and
 * ChatGPT's Codex webview at the source turned up the shape round two was looking for
 * already shipping in both, and it is neither a spinner nor a counter. Both keep a word
 * mounted and sweep a gradient across it while work is out: Claude's `shimmertext`
 * animates `background-position` over `bg-clip-text` from `100% 0` to `0 0`, arriving at
 * 65% of the duration and holding; Codex's does the same in `steps(48, end)`, and on a
 * cadence rather than continuously — 600ms of delay, one second of sweep, once every four
 * seconds. Neither remounts anything. Codex's is `classList.add` and `classList.remove`
 * on a node that is always there, and it skips the whole thing under
 * `prefers-reduced-motion`.
 *
 * **What it proposes here.** `agent-wait--line`'s slot and `agent-wait--line`'s three
 * words — `idle`, `working`, `waiting` — with the counter taken out and the sweep put in.
 * The word says which of three things is happening; the light says it is still happening.
 * Nothing enters, nothing leaves, and nothing in the box changes width at any point,
 * because the sweep is a paint over the glyphs that are already there.
 *
 * **What it wins against `line`.** `line` proves it is alive with a digit that changes
 * every hundred milliseconds. That is a real cost nobody has priced: for a measured
 * 878ms at the fastest and 4,043ms at the slowest, something is counting in the corner of
 * the screen, and a number that has to be read is a number that asks to be read. The
 * sweep asks for nothing. It is the difference between a stopwatch and a pulse.
 *
 * **What it loses.** The number. `line` and `fact` both hand back the fact that a request
 * took 2.7 seconds and this take does not, so it shares exactly `none`'s blind spot: a
 * slow session is felt and never read. It is also the only take on this row whose
 * animation is **not compositable** — `background-position` is a paint property, so
 * Chromium repaints on the main thread, which is the class of thing #149 disqualified
 * `blur` for on `agent-say-arrive`. The difference is what is being repainted: that was a
 * per-word filter over 3,372 characters re-rendering sixty times a second, and this is
 * one seven-letter word. Both shipped surfaces accept the same cost.
 *
 * **The open question, and it is Codex's rather than Claude's.** Codex sweeps for one
 * second in every four and is still for the other three. Claude sweeps continuously. A
 * cadence is less motion than a spinner by a long way and it is the only option on this
 * page that is *intermittently* still while work is genuinely happening, which may read
 * as the thing having stopped. This frame runs continuously, because that is the version
 * that can be judged against a spinner at all. If it wins, the cadence is the next thing
 * to draw.
 */
export default function WaitShimmerFrame() {
	return (
		<WaitFrame
			take="shimmer"
			title="shimmer · the word is alive, and nothing counts"
			claim="the same slot and the same three words as line, with the digit taken out and a sweep put in."
			notes={[
				"claude desktop and codex both ship this: a mounted word with",
				"light moving over it, class-toggled and never remounted.",
				"it gives up the number, which is none's own blind spot.",
				"the sweep is paint, so chromium repaints it. one word.",
			]}
		/>
	);
}
