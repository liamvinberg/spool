import { REST } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** At rest: your own projects plain, team copies named by address, a Tidemark copy focused. */
export default function TabPlaceCrumbFrame() {
	return (
		<TabPlaceWindow
			take="crumb"
			tabs={REST}
			focused="~/code/tidemark-checkout"
			frame="tab-place-crumb"
			argues="A team project's tab is named by its address, the path its spool.page link ends in. Your own projects keep a bare name."
		/>
	);
}
