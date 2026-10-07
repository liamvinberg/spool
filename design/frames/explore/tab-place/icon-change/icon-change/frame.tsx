import { KVITT_BEFORE } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Right-click on kvitt, a project of your own with no icon yet: "Change icon…" leads the tab's menu. */
export default function IconChangeFrame() {
	return (
		<TabPlaceWindow
			take="badge"
			tabs={KVITT_BEFORE}
			focused="~/code/kvitt"
			menu="~/code/kvitt"
			lit="Change icon…"
			frame="icon-change"
			argues="kvitt has no icon, so its tab shows a k on a colour picked from its name. Right-click the tab and “Change icon…” is the first row."
		/>
	);
}
