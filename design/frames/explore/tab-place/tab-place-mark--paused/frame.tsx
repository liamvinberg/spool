import { TROUBLE } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Sync paused on a background tab, the pointer resting on it. */
export default function TabPlaceMarkPausedFrame() {
	return (
		<TabPlaceWindow
			take="mark"
			tabs={TROUBLE}
			focused="~/code/spool" hovered="~/code/tidemark-onboarding" card
			frame="tab-place-mark--paused"
			argues="A paused copy hollows its mark, and resting on the tab says why. Northlight's project ended for this Mac, so kvitt's tab is plain again."
		/>
	);
}
