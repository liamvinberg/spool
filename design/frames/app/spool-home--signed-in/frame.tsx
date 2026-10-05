import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { TeamSwitcher } from "shared/ui/spool/teams";

export default function SignedIn() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			switcher={<TeamSwitcher current={null} onSelect={(team) => team && ui.go("app/spool-home--team")} />}
			account={
				<AccountFoot
					account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }}
					menu
				/>
			}
		/>
	);
}
