import { PulseFrame } from "../../../shared/ui/spool-pulse-rail";

/**
 * agent-pulse--weight — the stroke thickens, and that is the whole change.
 *
 * One pixel at rest, two at the worst thought ever measured, interpolated in between.
 * Nothing else moves: same track, same cycle, same colour.
 *
 * **It is here because it is the third axis a line has**, and a row that argues about
 * colour and pace without drawing weight has a hole in it rather than a conclusion. It
 * also has one genuine advantage over both: weight survives the two conditions that kill
 * the other graded takes. A reader with `prefers-reduced-motion` gets no cycle at all, so
 * `slow` degrades to nothing and this degrades to a thicker line that still reads. A
 * reader who cannot tell `--color-thread` from `--color-text` gets nothing from `warm` and
 * gets this.
 *
 * **It is also the take most likely to be wrong, and the reason is geometry.** The stroke
 * rides the hairline between the log and the composer — it is not decoration on the border,
 * it *is* the border while it runs. Doubling it does not read as *this is taking a while*,
 * it reads as *this edge got heavier*, and an edge that changes weight while you are typing
 * against it is a layout that looks unstable even though nothing has moved. One pixel to
 * two is a hundred per cent change in the most structural line in the rail, spent to say
 * something about a thing that is not structural at all.
 *
 * **And it is the one take whose range genuinely has nowhere to go.** Colour has a whole
 * ramp and pace has a factor of two and a half. Weight has 1px and 2px, because 3px stops
 * being a hairline and starts being a rule, and at that point the composer has a header.
 * So the resolution of this signal is two states, and two states is what `pair` gets by
 * introducing an object instead of by deforming the frame.
 */
export default function Frame() {
	return (
		<PulseFrame
			take="weight"
			title="weight — the stroke thickens as the wait runs"
			claim="1px → 2px against the worst measured thought. survives reduced motion and colour blindness; deforms the border."
			notes={[
				"the third axis a line has, drawn so the row is not arguing from two",
				"the only graded take that still reads with no motion and no colour",
				"the stroke is the border while it runs — doubling it reads as unstable, not as busy",
				"range is 1px to 2px and no further: 3px is a rule, and the composer has a header",
			]}
		/>
	);
}
