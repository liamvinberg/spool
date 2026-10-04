import { ui } from "spool";
import { InviteWalk } from "shared/ui/explore/cloud/team/auth/invite-walk";

export default function Frame() {
	return <InviteWalk state="wrong" links={{ page: () => ui.go("explore/cloud/team/invite/invite-walk") }} />;
}
