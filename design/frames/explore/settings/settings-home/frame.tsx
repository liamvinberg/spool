import { SettingsHomeScreen } from "shared/ui/explore/settings/home";
import { HOME_ARGUES } from "shared/ui/explore/settings/takes";

/**
 * General, on Home. The machine band reads the same as it does everywhere; the
 * project band grows a picker, because Home has no project behind it.
 */
export default function SettingsHomeFrame() {
	return <SettingsHomeScreen argues={HOME_ARGUES} />;
}
