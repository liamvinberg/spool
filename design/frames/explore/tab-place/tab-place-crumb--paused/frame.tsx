import { TROUBLE } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Sync paused on a background tab, the pointer resting on it. */
export default function TabPlaceCrumbPausedFrame() {
	return (
		<TabPlaceWindow
			take="crumb"
			tabs={TROUBLE}
			focused="~/code/spool" hovered="~/code/tidemark-onboarding" card
			frame="tab-place-crumb--paused"
			argues="A pause turns the slash into a pause sign. An ended copy keeps its team struck through until the tab is closed."
		/>
	);
}
