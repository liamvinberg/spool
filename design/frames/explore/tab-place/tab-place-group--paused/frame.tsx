import { TROUBLE } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Sync paused on a background tab, the pointer resting on it. */
export default function TabPlaceGroupPausedFrame() {
	return (
		<TabPlaceWindow
			take="group"
			tabs={TROUBLE}
			focused="~/code/spool" hovered="~/code/tidemark-onboarding" card
			frame="tab-place-group--paused"
			argues="The paused copy says so in its own tab. Northlight's project ended for this Mac, so kvitt left the group and stands with your own projects."
		/>
	);
}
