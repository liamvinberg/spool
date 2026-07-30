import { RibbonFrame } from "../../../shared/ui/spool-ribbon-rail";

/**
 * agent-ribbon--rest — the ribbon at rest is the logo, in the accent, always. Work is the coil
 * twisting.
 *
 * **It starts from the other end of the problem, and that is the take.** Every indicator this
 * map has drawn is a thing that means *working* and happens to be quiet the rest of the time.
 * This one is spool's mark sitting above the composer — which is a reasonable thing for it to
 * be doing at three in the morning with nothing running, on an empty thread, before the first
 * keystroke — and it *becomes* motion when work starts. Round two settled that the indicator is
 * always mounted; this is the only take that asks what an always-mounted thing should be when
 * it is doing nothing, and answers "the logo".
 *
 * **The motion is a standing twist and not a wave**, which keeps it a different idea from
 * `--wind` rather than a different tuning of one. Even strands slide one way, odd strands the
 * other, both on the same 1,500ms ease with no stagger anywhere, so nothing travels and nothing
 * has a direction. It reads as a coil under tension. Amplitude is the taper inverted — the
 * waist bends most at 1.7px and the wide ends least at about 0.8px — because the waist is the
 * thinnest part of the shape, and it is the one place the physics of the drawing and the
 * geometry of the logo agree.
 *
 * **This is the accent's A side, and it exists to be lost or won on the numbers.** The mark is
 * `text-thread` in every state. The rail's standing rule is that state is motion and the one
 * accent belongs to the selection, so this take is that rule's counter-example drawn at full
 * strength — and it is drawn nine pixels above a composer chip whose own bar is
 * `bg-thread/55`, which is the thing it would be competing with. The frame measures both:
 * the mark's ink is rasterised off the mask at its drawn size, the chip's bar is 2px by 12px
 * and therefore 24 square pixels. Two reds in forty pixels is a quantity, so it is printed
 * rather than argued.
 *
 * **My own read, and it is a recommendation rather than a finding.** An always-red mark loses
 * this argument, and not because of the ink. The selection's red *appears* — it is there
 * because you pointed at something and it goes when you stop — and a red that is always there
 * spends the accent on a constant. Once the mark is red at idle, red no longer means
 * "something changed", which is the whole job the colour has in this rail. `--count` is the
 * other half of that thought: same red, spent only on the one state that needs a person.
 *
 * **Two states and it says so.** Moving or not, plus parked. It is the most honest reading of
 * the state question available, and the frame's dwell meter is why it is defensible: the four
 * "something is out" states are one long stretch of a turn broken by a third of a second of
 * words. A take with a two-word vocabulary is not necessarily a worse take than one with five
 * pictures, and this frame is where that gets tested against `--count` side by side.
 *
 * **Reduced motion holds the twist rather than releasing it** — even strands offset one way,
 * odd the other, frozen. A static zigzag ribbon is not this take's own idle state, which is
 * straight, and it is nothing else in the rail. Freezing to the straight logo would have made
 * working and idle the same picture, which is `--wound`'s failure and the trap #161 named.
 */
export default function RibbonRestFrame() {
	return (
		<RibbonFrame
			take="rest"
			title="rest · the logo at rest, the coil twisting at work"
			claim="the mark is just there, in the accent, doing nothing, until work twists it. a standing shear with no travel and no direction. the accent's A side."
			notes={[
				"even strands one way, odd the other, no stagger: it twists, it does not travel.",
				"amplitude is the taper inverted, so the waist gives most.",
				"the ink readout beside the chip's 24px² is the accent argument, measured.",
				"reduced motion holds the shear, so still-working is not still-idle.",
			]}
		/>
	);
}
