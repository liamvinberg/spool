import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { InviteLine, TeamSwitcher } from "shared/ui/spool/teams";

export default function Invite() {
	return <SpoolHomeScreen onGo={ui.go} account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />} switcher={<TeamSwitcher current={null} />} invites={<InviteLine />} />;
}
