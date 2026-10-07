import { REST } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** At rest: icons on every tab, two Tidemark copies and a Northlight copy among your own. */
export default function TabIconBadgeFrame() {
	return (
		<TabPlaceWindow
			take="badge"
			tabs={REST}
			focused="~/code/tidemark-checkout"
			frame="tab-icon-badge"
			argues="Every tab leads with its project's icon, and a team copy wears the team's mark in the icon's corner. onboarding has no icon, so it gets its letter, lowercase on a tint."
		/>
	);
}
