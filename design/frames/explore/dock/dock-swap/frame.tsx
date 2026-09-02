import { DockScreen } from "shared/ui/spool-dock-screen";

/**
 * swap — the column shows whatever you last acted on.
 *
 * No strip, no glyphs, nothing to press. Picking an element brings properties
 * up, a turn starting brings the agent up, and the footer says which one is on
 * screen and why. The column is one width, 420, and it never resizes.
 *
 * The pin is the escape hatch and it is also the take's confession: a surface
 * that moves on its own is a surface you cannot point at over someone's
 * shoulder, and the moment it guesses wrong the fix is the control the take was
 * built to avoid. It is drawn anyway, because it is the only one where the
 * column costs nothing to operate — the two surfaces are never both wanted in
 * the same instant, and this is what believing that looks like.
 *
 * Select an element, press ⏎ to run a turn, then pin it and select again.
 */
export default function DockSwapFrame() {
	return (
		<DockScreen
			take="swap"
			argues="The column follows attention. Nothing to press, and nothing that stays where you left it."
		/>
	);
}
