import { DockScreen } from "../../../shared/ui/spool-dock-screen";

/**
 * beside — the shipped shape, and the baseline the other four are a diff
 * against.
 *
 * With `agent-panel` off (#238) the column is one 300px properties rail and
 * nothing else. Switch it on and a second rail stands beside it, shut, as a
 * 44px strip: pressing the strip opens that rail and collapses the other, so
 * the column is 344 with properties up and 464 with the agent up. Two open
 * rails were never on the table — `properties-rail.tsx` says why, 300 plus 420
 * leaves 472px of field at 1440.
 *
 * What it gets wrong once the agent is a surface the product ships rather than
 * a flag one machine switched on: the shut one is a rail pretending to be a
 * button, and it moves. Properties sits at the far edge when it is open and one
 * strip in when it is not, so the control that gets you back to it is never
 * twice in the same place.
 *
 * Select an element for the properties side. Press ⏎ to run a turn and watch
 * the strip carry it.
 */
export default function DockBesideFrame() {
	return (
		<DockScreen
			take="beside"
			argues="Two rails share the edge. Whichever is shut becomes the button, so nothing stands still."
		/>
	);
}
