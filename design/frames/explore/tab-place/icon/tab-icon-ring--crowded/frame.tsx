import { CROWDED } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Twelve tabs, more than the strip holds, with a team tab's menu open. */
export default function TabIconRingCrowdedFrame() {
	return (
		<TabPlaceWindow
			take="ring"
			tabs={CROWDED}
			focused="~/code/tidemark-brand-refresh" menu="~/code/tidemark-checkout"
			frame="tab-icon-ring--crowded"
			argues="Twelve tabs. The ring makes a team tab 4px wider. At 16px the Tidemark and Northlight rings are hard to tell apart."
		/>
	);
}
