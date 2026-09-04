import { SettingsHomeScreen } from "shared/ui/explore/settings/home";
import { HOME_ARGUES } from "shared/ui/explore/settings/takes";

/** Theme on Home: a machine-wide choice on the one screen that is about the machine. */
export default function SettingsHomeThemeFrame() {
	return <SettingsHomeScreen seed={{ tab: "theme" }} argues={HOME_ARGUES} />;
}
