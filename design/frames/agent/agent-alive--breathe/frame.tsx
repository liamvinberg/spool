import { AliveFrame } from "../../../shared/ui/spool-alive-rail";

/**
 * agent-alive--breathe — one disc, scaling and dimming on a slow eased breath.
 *
 * **It is here for two reasons and neither is that it is good.** It is what assistant-ui
 * ships (`one pulsing filled circle, aria-label Assistant is working`) and it is what
 * everybody reaches for first, so a row that fans out without it has a hole in it. And it is
 * the take that walks nearest the one hard ban on this page, which makes it the place to see
 * where that line actually is.
 *
 * **It does not blink, and the reason is precise.** #149 read thirteen chat surfaces at the
 * source and found zero blinking at the live edge; the caret in `spool-say.tsx` is static for
 * that reason, and WCAG 2.2.2 puts blinking under the same five-second trigger as motion with
 * the *essential* exemption unavailable, because a fade is already the liveness signal.
 * Blinking is content going on and off. This has an opacity floor of 0.4, a symmetric
 * ease-in-out and no discontinuity anywhere in the cycle, so there is no off. That is the
 * line: a floor and an easing, not a duration.
 *
 * **It loses on the fallback, which is the whole verdict.** Reduced motion draws a still
 * filled disc, and a still filled disc is already something in this rail — it is #161's
 * `unread` mark, the disc that also sits inside `working`'s ring to mean a thread is waiting
 * on a person. This is #161's own trap firing on a new candidate: that ticket killed a frozen
 * spinner because freezing it was pixel-identical to what reduced motion already renders for a
 * *working* row, and this is the same failure with a different shape. A reduced-motion reader
 * gets an indicator that means *unread* sitting permanently above their composer.
 *
 * **And the cycle is longer than the wait.** 2400ms against a measured median time to first
 * token of 1970ms, so in half of all real waits the disc never completes one breath: what
 * arrives is a fragment of a swell, which is a dim disc that got slightly brighter and then
 * the answer landed. The fastest measured wait is 878ms, which is a third of a breath.
 *
 * **Cheapest thing on the row, for what it is worth.** Scale and opacity, zero writes, fixed
 * box.
 */
export default function AliveBreatheFrame() {
	return (
		<AliveFrame
			take="breathe"
			title="breathe · one disc, and it is not a blink"
			claim="opacity floor 0.4, symmetric ease, no discontinuity anywhere in the cycle. blinking is content going on and off, and there is no off here."
			notes={[
				"reduced motion draws a still filled disc, which is",
				"#161's unread mark: the same trap, a new shape.",
				"2400ms against a 1970ms median wait, so half of all",
				"real waits never complete one breath.",
			]}
		/>
	);
}
