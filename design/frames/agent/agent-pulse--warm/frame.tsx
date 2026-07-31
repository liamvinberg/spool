import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--warm — the stroke takes on colour the longer the wait runs.
 *
 * The literal reading of the request that opened this round: *if we remove "thinking" and
 * just embed that into the loader, like changing its colour.* The stroke keeps its track,
 * its cycle and its place, and mixes from the text colour it is now toward `--color-thread`
 * in proportion to how far the wait has run against the worst thought ever measured.
 *
 * **What it is uniquely good at.** It is the only take here that a reader can decode
 * without having watched the previous few seconds. Pace has to be compared against a
 * remembered pace and a second head has to be counted, but a colour is a value: glance
 * once, at any instant, and the stroke says roughly how long this has been going. For the
 * case this round exists for — the reader who looked away and came back — that is the
 * whole job.
 *
 * **It spends the one colour in this rail that already means something.** `--color-thread`
 * is the thread accent: it is the bar on the human's own words, it is the chip's leading
 * rule, it is what a hot meter turns on every frame of this page. Putting it on the loader
 * gives it a second meaning — *this has been going a while* — and the two are not related.
 * That is the same failure `agent-alive--breathe` was killed for, one property over: a
 * reduced-motion reader there got the shape that already meant `unread`, and a reader here
 * gets the colour that already means `you`.
 *
 * **And red is worse, not better, which is worth stating because red is the instinct.** A
 * long thought is not an error. Opus reasoning for ninety seconds on a hard question is
 * the product working, and a rail that reddens while it does is a rail telling a person
 * something is wrong on the one occasion they should be reassured. If this take wins, it
 * wins on a colour that means *warm* rather than *bad*, and this frame draws it that way
 * on purpose so the choice is visible rather than assumed.
 *
 * **The denominator is the honest problem underneath all three graded takes.** The scale
 * runs against 9,500 tokens, so the 29-second thought this turn plays reaches about a
 * fifth and looks like almost nothing. Fitted to the demo it would look decisive and prove
 * nothing. The `of worst` meter prints the number either way.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="warm"
			title="warm — the colour is the length of the wait"
			claim="mixes toward --color-thread as the wait runs. readable at a glance with no memory of the last few seconds."
			notes={[
				"the only graded take that needs no comparison against a remembered state",
				"costs the accent: --color-thread already means the human's own thread",
				"not red on purpose — a long thought is the product working, not a fault",
				"scale runs to the worst measured thought, so this turn only reaches a fifth",
			]}
		/>
	);
}
