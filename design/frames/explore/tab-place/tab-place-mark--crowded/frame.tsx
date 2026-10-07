import { CROWDED } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Twelve tabs, more than the strip holds, with a team tab's menu open. */
export default function TabPlaceMarkCrowdedFrame() {
	return (
		<TabPlaceWindow
			take="mark"
			tabs={CROWDED}
			focused="~/code/tidemark-brand-refresh" menu="~/code/tidemark-checkout"
			frame="tab-place-mark--crowded"
			argues="Twelve tabs. The mark stands ahead of the name, so a cut name keeps it, and the menu opens on the team and the folder."
		/>
	);
}
