import { SpunFrame } from "../../../shared/ui/spool-spun-rail";

/**
 * agent-spun--hair — the stroke is the boundary, so at rest there is nothing extra on screen.
 *
 * The zero-cost rest state drawn literally. Every take in this row replaces the composer's
 * `border-t` with a 1px span of exactly `--color-border`; this one does nothing else. Its own
 * drawing is two strokes over that span which part **from the centre** and return, so a still
 * of the rail at rest is byte-identical to the rail as it ships and the transcript gives up
 * nothing, ever, on any thread, including the empty one.
 *
 * **Out of the centre is what keeps it out of the idiom.** Every bar in software fills from an
 * end. Two strokes leaving the middle is a line being pulled taut from where it is held, and
 * neither half ever reaches its end — the reach is capped at 62%, so 260px of the 420 is the
 * most that is ever lit and the plain hairline is visible past both of them at all times.
 * There is no picture of this take that is full.
 *
 * **It tells two states apart, and it is honest about why.** It has exactly one dimension to
 * spend — how far the halves reach — and reach is the least readable property a line has at the
 * edge of the eye, so spending it on `thinking` against `doing` would be spending it on
 * nothing a reader could recover. `asking` breaks the line at the exact point the two strokes
 * leave from, which is the one place the eye is already going.
 *
 * **Its soft spot is the fallback, and it is inherited.** Reduced motion holds both halves at
 * full reach, which is a brighter border, and a brighter border is one step from a focus ring
 * — the only other reason a border in this rail changes strength. `agent-alive--rule` had the
 * same problem and the frame prints it rather than arguing it away.
 */
export default function SpunHairFrame() {
	return (
		<SpunFrame
			take="hair"
			title="hair · the border is the stroke"
			claim="the composer's own 1px line, with two strokes parting from its centre and returning. nothing is added and nothing is reserved."
			notes={[
				"at rest it is pixel-identical to the rail as it ships.",
				"no bar parts from the middle, and neither half reaches",
				"its end: the hairline shows past both at all times.",
				"reduced motion is a brighter border, which is rule's own risk.",
			]}
		/>
	);
}
