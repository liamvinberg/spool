import { TROUBLE_ICON } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** Sync paused on a background copy that has an icon, the pointer resting on it. */
export default function TabIconEitherPausedFrame() {
	return (
		<TabPlaceWindow
			take="either"
			tabs={TROUBLE_ICON}
			focused="~/code/spool" hovered="~/code/tidemark-checkout" card
			frame="tab-icon-either--paused"
			argues="checkout is paused, so its icon greys out because there is no mark to hollow. Without an icon, onboarding would hollow its letter the way take 1 does."
		/>
	);
}
