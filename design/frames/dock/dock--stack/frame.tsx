import { DockScreen } from "../../../shared/ui/spool-dock-screen";

/**
 * stack — one strip on the edge, the surfaces listed down it. The take that won.
 *
 * The 44px strip stops belonging to a rail and becomes the column's index: it
 * is always there, always in the same place, and the glyphs in it are what the
 * column can hold. The lit one is what the panel shows. Press it again and the
 * column shuts to the strip alone, which is the state that hands the field its
 * full width back without hiding what it gave up.
 *
 * The panel keeps each surface's own width — 300 for properties, 420 for the
 * agent — so the column is 344, 464 or 44. Nothing about the strip changes when
 * the panel does, which is the whole difference from `--beside`.
 *
 * A third surface costs a glyph. That is worth saying out loud: connections
 * left the rail when the agent took it, and the component library page (#189)
 * is a surface with nowhere to stand today.
 *
 * **The motion.** Three things move and they are all the column's, never a
 * rail's insides:
 *
 *   the edge, 300ms on `cubic-bezier(0.23,1,0.32,1)`, which is the curve and
 *   the duration both shipped rails already wear for width (`sidebar.tsx`
 *   calls it the house curve). Opening, shutting and swapping are one gesture,
 *   so they are one number.
 *
 *   the cross, 120ms and no more. Both surfaces stand in the panel at the width
 *   they will settle at and the column clips them, so the arriving rail never
 *   re-lays: the alternative is watching the properties rows squash through
 *   120px on their way in, which is a whole surface reflowing to say a button
 *   was pressed. Faster than the edge on purpose — the content is done before
 *   the column stops, so the movement reads as the edge travelling rather than
 *   as a card being dealt.
 *
 *   the marks. A glyph takes colour in 140ms and gives 10% under the press, the
 *   shipped rails' own numbers; the unread dot grows in from 0.4 over 200ms,
 *   which is the canvas's own unseen mark (`--animate-unseen-in`). It arrives
 *   and then holds still: a finished turn wants noticing on the next glance,
 *   not dealing with now, so nothing pulses.
 *
 * Every transition is off under `prefers-reduced-motion`. The two siblings are
 * the same take with the motion changed: `--fixed` never moves the edge,
 * `--cut` has none of this at all.
 *
 * Press the glyphs. Press ⏎ to run a turn with the agent shut and watch the
 * mark arrive on the glyph.
 */
export default function DockStackFrame() {
	return (
		<DockScreen
			take="stack"
			motion="eased"
			argues="The edge travels for 300ms and nothing inside the rails moves at all."
		/>
	);
}
