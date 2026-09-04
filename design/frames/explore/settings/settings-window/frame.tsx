import { WINDOW_ARGUES } from "shared/ui/explore/settings/takes";
import { SettingsWindowScreen } from "shared/ui/explore/settings/window";

/**
 * General, in a window of its own. The canvas window stands behind it at close
 * to real size, so the settings window is judged against the app it belongs to.
 */
export default function SettingsWindowFrame() {
	return <SettingsWindowScreen argues={WINDOW_ARGUES} />;
}
