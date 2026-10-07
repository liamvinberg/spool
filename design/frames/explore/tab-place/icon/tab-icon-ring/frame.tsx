import { REST } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** At rest: icons on every tab, two Tidemark copies and a Northlight copy among your own. */
export default function TabIconRingFrame() {
	return (
		<TabPlaceWindow
			take="ring"
			tabs={REST}
			focused="~/code/tidemark-checkout"
			frame="tab-icon-ring"
			argues="Every tab leads with its project's icon, and a team copy's icon sits in a ring of the team's colour. Which team it is shows by colour only."
		/>
	);
}
