import { WispFrame } from "../../../shared/ui/spool-wisp-rail";

/**
 * agent-wisp--waist — the taper as a function, and the waist is the only thing that moves.
 *
 * **The find this take is built on is that the logo's taper is one expression.** A gaussian pinch
 * of depth 0.62, centred on the narrowest of five spans sampled out of the mark's own nine,
 * reproduces those five measured widths to within 0.06 of a stroke — printed on the frame as
 * `pinch fits to 0.06` rather than claimed here. Which means the identity's proportion is *one
 * value of one parameter*, so sliding the parameter leaves the proportion intact somewhere else
 * on the cascade. That is what makes a moving waist available at all, and it is why this is not
 * `--fold` again: `--fold` was three bars in a wave and could have belonged to anything, and this
 * is five strokes whose widths are the mark's own numbers, pinched by the mark's own function.
 *
 * Nothing rotates, nothing travels, nothing fades. `scaleX` on five spans, five elements, zero
 * DOM writes for the whole turn.
 *
 *   idle      the pinch at the identity's own waist, still and dim. The cascade, quiet.
 *   sent      the pinch deepens to 0.94 and breathes there, so the cascade is nearly severed at
 *             its middle. The request is out and nothing has come back, drawn as the mark being
 *             the least it can be while still being the mark.
 *   working   the pinch's centre walks 0.6 → 3.4 → 0.6 at the identity's own depth. The waist
 *             travels down the cascade and back over 1,500ms, inside the 1,970ms median wait.
 *   parked    all five at full width, completely still, in the accent. No waist at all, which is
 *             the one arrangement the taper never produces.
 *
 * **It keeps moving while the request is out, and that is deliberate.** The four waits in this
 * script are 7,572ms of a 13,407ms turn: a take that draws `sent` still is a still rail for more
 * than half the turn, which is the complaint the whole map started from. `sent` and `working` are
 * told apart by which shape is moving rather than by whether anything is.
 *
 * **Freeze it and four pictures survive** — the cascade, the cascade cut at the middle, the waist
 * parked low, and a solid block in red. That is `--count`'s standard met at 16px with four
 * elements fewer than half of round four's nine, and it is the reason this ranks first.
 */
export default function WispWaistFrame() {
	return (
		<WispFrame
			take="waist"
			title="waist · the taper is a function, so the waist can move"
			claim="five strokes at the mark's own five sampled widths, pinched by the mark's own function. the state is where the pinch is and how deep."
			notes={[
				"the borrow is a number, not a silhouette: pinch 0.62 fits the spans to 0.06.",
				"sent is not still. 56% of this turn is a request out.",
				"freeze it and four shapes survive, which is what --count set as the bar.",
				"five elements, zero writes, scaleX only.",
			]}
		/>
	);
}
