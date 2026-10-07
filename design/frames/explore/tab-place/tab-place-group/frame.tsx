import { REST } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** At rest: Tidemark's and Northlight's copies gathered behind their chips, a Tidemark copy focused. */
export default function TabPlaceGroupFrame() {
	return (
		<TabPlaceWindow
			take="group"
			tabs={REST}
			focused="~/code/tidemark-checkout"
			frame="tab-place-group"
			argues="A team's open copies sit together behind its chip. Your own projects stand outside every group, where you left them."
		/>
	);
}
