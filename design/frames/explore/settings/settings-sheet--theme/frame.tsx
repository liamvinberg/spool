import { SettingsSheetScreen } from "shared/ui/explore/settings/sheet";
import { SHEET_ARGUES } from "shared/ui/explore/settings/takes";

/** Theme: dark as it ships, light as an option that exists, customize shut. */
export default function SettingsSheetThemeFrame() {
	return <SettingsSheetScreen seed={{ tab: "theme" }} argues={SHEET_ARGUES} />;
}
