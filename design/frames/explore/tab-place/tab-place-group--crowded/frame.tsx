import { CROWDED } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Twelve tabs, more than the strip holds, Northlight folded, a team tab's menu open. */
export default function TabPlaceGroupCrowdedFrame() {
	return (
		<TabPlaceWindow
			take="group"
			tabs={CROWDED}
			focused="~/code/tidemark-brand-refresh" menu="~/code/tidemark-checkout" folded={["northlight"]}
			frame="tab-place-group--crowded"
			argues="Out of room, a group folds into its chip and a count. Tidemark stays open because it holds the focused tab."
		/>
	);
}
