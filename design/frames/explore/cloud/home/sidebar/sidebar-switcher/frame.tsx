import { ui } from "spool";
import { SidebarSwitcher } from "shared/ui/explore/cloud/home/team-home";

export default function Frame() {
	return <SidebarSwitcher onOpen={() => ui.go("app/spool-canvas")} onInvite={() => ui.go("explore/cloud/home/sidebar/sidebar-switcher--invite")} />;
}
