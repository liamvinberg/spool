import { SettingsSheetScreen } from "shared/ui/explore/settings/sheet";
import { EDITED, SHEET_ARGUES } from "shared/ui/explore/settings/takes";

/**
 * Customize open with `thread` mid-edit. The accent is set on the whole screen
 * rather than on the panel, so the tab underline, the switches and the threads
 * on the canvas behind the sheet all carry the new colour at once.
 */
export default function SettingsSheetCustomizeFrame() {
	return <SettingsSheetScreen seed={EDITED} argues={SHEET_ARGUES} />;
}
