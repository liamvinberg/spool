import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { TeamSwitcher } from "shared/ui/spool/teams";

export default function Switcher() {
	return <SpoolHomeScreen onGo={ui.go} account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />} switcher={<TeamSwitcher current={null} open onSelect={(team) => team && ui.go("app/spool-home--team")} />} />;
}
