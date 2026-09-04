import { SettingsSheetScreen } from "shared/ui/explore/settings/sheet";
import { SHEET_ARGUES } from "shared/ui/explore/settings/takes";

/**
 * General: the whole of what a person may change, in two bands headed by the
 * file each one writes. History is the project's and it is off, which is what
 * shipped today; the other three are the machine's.
 */
export default function SettingsSheetFrame() {
	return <SettingsSheetScreen argues={SHEET_ARGUES} />;
}
