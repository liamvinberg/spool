import { ui } from "spool";
import { SidebarSection } from "shared/ui/explore/cloud/home/team-home";

export default function Frame() {
	return <SidebarSection onOpen={() => ui.go("app/spool-canvas")} onInvite={() => ui.go("explore/cloud/home/sidebar/sidebar-section--invite")} />;
}
