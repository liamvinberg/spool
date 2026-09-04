import { WINDOW_ARGUES } from "shared/ui/explore/settings/takes";
import { SettingsWindowScreen } from "shared/ui/explore/settings/window";

/** Theme in the window. The tabs ride the top of the window, where a Mac puts them. */
export default function SettingsWindowThemeFrame() {
	return <SettingsWindowScreen seed={{ tab: "theme" }} argues={WINDOW_ARGUES} />;
}
