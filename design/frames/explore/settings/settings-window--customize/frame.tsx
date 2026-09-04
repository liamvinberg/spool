import { EDITED, WINDOW_ARGUES } from "shared/ui/explore/settings/takes";
import { SettingsWindowScreen } from "shared/ui/explore/settings/window";

/**
 * Customize open with `thread` mid-edit. The window and the canvas window behind
 * it are two documents of the same app, so both wear the new accent.
 */
export default function SettingsWindowCustomizeFrame() {
	return <SettingsWindowScreen seed={EDITED} argues={WINDOW_ARGUES} />;
}
