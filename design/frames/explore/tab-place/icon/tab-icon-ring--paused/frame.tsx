import { TROUBLE_ICON } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Sync paused on a background copy that has an icon, the pointer resting on it. */
export default function TabIconRingPausedFrame() {
	return (
		<TabPlaceWindow
			take="ring"
			tabs={TROUBLE_ICON}
			focused="~/code/spool" hovered="~/code/tidemark-checkout" card
			frame="tab-icon-ring--paused"
			argues="checkout is paused, so its ring breaks into dashes. The icon shrinks by 2px to make room for the ring, and resting on the tab says why."
		/>
	);
}
