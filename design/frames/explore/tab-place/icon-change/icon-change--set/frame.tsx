import { KVITT_AFTER } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** The copy landed: the tab reads the new file at once, and its menu can take it out again. */
export default function IconChangeSetFrame() {
	return (
		<TabPlaceWindow
			take="badge"
			tabs={KVITT_AFTER}
			focused="~/code/kvitt"
			menu="~/code/kvitt"
			frame="icon-change--set"
			argues="design/shared/icon.svg is new in git status, the one change. On a team project it reaches the team within a second. Remove icon deletes the file and the letter comes back."
		/>
	);
}
