import { SettingsHomeScreen } from "shared/ui/explore/settings/home";
import { EDITED, HOME_ARGUES } from "shared/ui/explore/settings/takes";

/**
 * Customize open with `thread` mid-edit. Home has no canvas to recolour, so the
 * only preview is the panel itself and the dark plate above the token list.
 */
export default function SettingsHomeCustomizeFrame() {
	return <SettingsHomeScreen seed={EDITED} argues={HOME_ARGUES} />;
}
