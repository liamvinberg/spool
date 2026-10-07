import { REST } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** At rest: your own projects plain, Tidemark and Northlight copies marked, a Tidemark copy focused. */
export default function TabPlaceMarkFrame() {
	return (
		<TabPlaceWindow
			take="mark"
			tabs={REST}
			focused="~/code/tidemark-checkout"
			frame="tab-place-mark"
			argues="A team project's tab leads with its team's mark, the letter Home's switcher shows. Your own projects keep the tab as it ships."
		/>
	);
}
