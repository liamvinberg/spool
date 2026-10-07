import { CROWDED } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Twelve tabs, more than the strip holds, with a team tab's menu open. */
export default function TabPlaceCrumbCrowdedFrame() {
	return (
		<TabPlaceWindow
			take="crumb"
			tabs={CROWDED}
			focused="~/code/tidemark-brand-refresh" menu="~/code/tidemark-checkout"
			frame="tab-place-crumb--crowded"
			argues="The address costs width. Every team tab is about 70px wider, so fewer fit and long names are cut sooner."
		/>
	);
}
