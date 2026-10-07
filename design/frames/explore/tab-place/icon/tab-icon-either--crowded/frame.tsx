import { CROWDED } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Twelve tabs, more than the strip holds, with a team tab's menu open. */
export default function TabIconEitherCrowdedFrame() {
	return (
		<TabPlaceWindow
			take="either"
			tabs={CROWDED}
			focused="~/code/tidemark-brand-refresh" menu="~/code/tidemark-checkout"
			frame="tab-icon-either--crowded"
			argues="Twelve tabs. Team and solo tabs look the same once both have icons. The menu's second line is the only place the team still shows."
		/>
	);
}
