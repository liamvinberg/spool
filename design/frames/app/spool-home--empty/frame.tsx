import { ui } from "spool";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function FirstLaunch() {
	return <SpoolHomeScreen onGo={ui.go} firstLaunch />;
}
