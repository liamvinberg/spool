import { ui } from "spool";
import { InviteWalk } from "shared/ui/explore/cloud/team/auth/invite-walk";

export default function Frame() {
	return <InviteWalk links={{ joined: () => ui.go("explore/cloud/team/invite/invite-walk--joined") }} />;
}
