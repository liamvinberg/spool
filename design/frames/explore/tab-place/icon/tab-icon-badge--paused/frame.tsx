import { TROUBLE_ICON } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Sync paused on a background copy that has an icon, the pointer resting on it. */
export default function TabIconBadgePausedFrame() {
	return (
		<TabPlaceWindow
			take="badge"
			tabs={TROUBLE_ICON}
			focused="~/code/spool" hovered="~/code/tidemark-checkout" card
			frame="tab-icon-badge--paused"
			argues="checkout is paused: its badge goes hollow and the icon stays as it is. Resting on the tab says why. kvitt's project ended for this Mac, so its tab has no badge."
		/>
	);
}
