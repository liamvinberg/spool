import { DockScreen } from "../../../shared/ui/spool-dock-screen";

/**
 * stack — one strip on the edge, the surfaces listed down it.
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
 * Select an element, then press ⏎ to run a turn: the agent glyph carries the
 * running mark, and a dot once the turn lands unread.
 */
export default function DockStackFrame() {
	return (
		<DockScreen
			take="stack"
			argues="One strip, two glyphs. The column's index sits still while what it shows changes."
		/>
	);
}
