import { ui } from "spool";
import { InviteApp } from "shared/ui/explore/cloud/team/auth/invite-app";

export default function Frame() {
	return <InviteApp take="home" links={{ joined: () => ui.go("explore/cloud/team/invite/invite-app-home--joined") }} />;
}
