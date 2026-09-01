import { DockScreen } from "../../../shared/ui/spool-dock-screen";

/**
 * stack, one width — the edge never moves.
 *
 * Both surfaces are laid out at the agent's 420, so pressing a glyph changes
 * what the column holds and nothing else: the field's width is decided when you
 * open the column and stays decided until you shut it. The only motion left is
 * the cross, and it can be slower for it.
 *
 * What it buys is the strongest form of the take's own claim. The strip is the
 * index and the panel is a slot, so switching surfaces is switching a slot's
 * contents rather than resizing the window; go back and forth ten times and the
 * canvas never shifts under you once.
 *
 * What it costs is 120px of field whenever properties is up, which is most of a
 * session, spent so that the agent's composer has room on the occasions it is
 * up. That is the same bill `--split` pays, without `--split` getting both
 * surfaces for it.
 *
 * Hold this against `dock--stack` by pressing the glyphs in both.
 */
export default function DockStackFixedFrame() {
	return (
		<DockScreen
			take="stack"
			motion="fixed"
			argues="One width for both surfaces. The column never resizes, and properties carries the agent's 420."
		/>
	);
}
