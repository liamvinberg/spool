import { ui } from "spool";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

export default function SpoolHomeFrame() {
	return <SpoolHomeScreen onGo={ui.go} canvasTarget="spool-canvas" emptyTarget="spool-empty-project" />;
}
