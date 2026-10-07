import { KVITT_BEFORE } from "shared/lib/explore/tab-place/tabs";
import { TabPlaceWindow } from "shared/ui/explore/tab-place/place-window";

/** The Mac's open panel, as a sheet, opened in the project's own folder and limited to images. */
export default function IconChangePickerFrame() {
	return (
		<TabPlaceWindow
			take="badge"
			tabs={KVITT_BEFORE}
			focused="~/code/kvitt"
			picker="~/code/kvitt"
			frame="icon-change--picker"
			argues="It opens in the project's folder, so a logo the repo already has is one click away. Choose copies the file into design/ and leaves the original where it was."
		/>
	);
}
