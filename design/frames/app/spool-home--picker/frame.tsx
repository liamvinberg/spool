import { ui } from "spool";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function SpoolPickerFrame() {
	return <SpoolHomeScreen onGo={ui.go} initialPicker="start" />;
}
