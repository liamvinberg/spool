import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--slit — three slots cut in the surface, and light passing behind them.
 *
 * Round four's `--aperture` was the one mechanism the brief said might survive shrinking, and this
 * is the test of that. The ribbon is not the moving object at all: three tapered slots are a
 * `mask-image` built from the mark's own sampled spans and painted once, and what moves is a single
 * element carrying a single static gradient, translated. Two DOM nodes at any size.
 *
 * **It is structurally immune to the bug that killed the alternative.** #149 found that `blur` and
 * `soften` do not composite in Chromium and that an `edge` gradient *freezes mid-sweep* when the
 * wire pauses. Nothing here animates a paint, so there is no sweep to freeze — the immunity is a
 * property of the construction rather than of anyone remembering the rule.
 *
 * **And the taper does the rhythm for free, which is the reason to keep the borrow.** The band
 * crosses the full width of slot 0, 40% of it on the waist, and 100% again at the bottom, so a pass
 * dwells on the wide slots and flicks past the middle without a single number saying it should. The
 * cascade's own proportion becomes the timing.
 *
 * **It loses the fallback, and it is drawn so the loss is on the canvas rather than in a
 * paragraph.** Freeze it and `sent` and `working` are a thin bright patch and a wide one in the same
 * place: an amount, not a shape. That is precisely the collapse `--count` was built to beat and the
 * reason it beat four of round four's six. Four states while the motion runs, two when it does not.
 *
 *   idle      the slots at 24%, no band. Cut but unlit.
 *   sent      a thin band passing, 1,400ms.
 *   working   a wide band passing, same rate.
 *   parked    the slots at full strength, no band, still, in the accent.
 *
 * Kept on the row because the mechanism is worth having drawn at 16px, and because the next person
 * to read this page will propose it again if the reason it lost is only written down.
 */
export default function WispSlitFrame() {
	return (
		<WispFrame
			take="slit"
			title="slit · three tapered slots, and light behind them"
			claim="the mark is a mask painted once and the band is a static gradient translated. the taper makes the pass dwell wide and skim the waist, for free."
			notes={[
				"two nodes at any size, and immune to #149's frozen gradient by construction.",
				"the pass's rhythm is the cascade's own proportion, not a tuning.",
				"it loses the fallback: frozen, sent and working differ by band width only.",
				"drawn rather than described, because the mechanism will be proposed again.",
			]}
		/>
	);
}
