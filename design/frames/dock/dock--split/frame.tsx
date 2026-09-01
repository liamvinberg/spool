import { DockScreen } from "../../../shared/ui/spool-dock-screen";

/**
 * split — one column, both surfaces, a grip between them.
 *
 * Nothing is ever shut, so nothing has to announce itself: a turn arriving is
 * the lower half moving, and the element you are editing is still on screen
 * while it does. Drag the grip to give the height to whichever half is doing
 * the work.
 *
 * The field pays for that all day. The column is 420 because the agent's
 * composer needs 420, and the properties rows then get 420 they never asked
 * for — 120px of canvas spent on a surface that is idle most of a session. The
 * properties rail is also the taller of the two: its sections run past the fold
 * at any share, so the grip is not a preference, it is rationing.
 *
 * Select an element, press ⏎, and watch both halves stay put.
 */
export default function DockSplitFrame() {
	return (
		<DockScreen
			take="split"
			argues="Both surfaces at once, and the field pays 420 for it whether the agent is working or not."
		/>
	);
}
