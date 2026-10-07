import { CROWDED } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Twelve tabs, more than the strip holds, with a team tab's menu open. */
export default function TabIconBadgeCrowdedFrame() {
	return (
		<TabPlaceWindow
			take="badge"
			tabs={CROWDED}
			focused="~/code/tidemark-brand-refresh" menu="~/code/tidemark-checkout"
			frame="tab-icon-badge--crowded"
			argues="Twelve tabs. Icon and badge stay ahead of a cut name. The menu opens on the project, with “Change icon…” first."
		/>
	);
}
