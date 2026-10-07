import { REST } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** At rest: icons on every tab, two Tidemark copies and a Northlight copy among your own. */
export default function TabIconEitherFrame() {
	return (
		<TabPlaceWindow
			take="either"
			tabs={REST}
			focused="~/code/tidemark-checkout"
			frame="tab-icon-either"
			argues="The project's icon if it has one, otherwise the team's mark. checkout and atlas lose their team. onboarding keeps it only because nobody set an icon."
		/>
	);
}
