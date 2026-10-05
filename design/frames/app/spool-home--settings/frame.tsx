import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { TeamNav, TeamSettingsPage, TeamSwitcher, TIDEMARK } from "shared/ui/spool/teams";

export default function Settings() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />}
			switcher={<TeamSwitcher current={TIDEMARK} />}
			team={{
				nav: <TeamNav team={TIDEMARK} page="settings" onPage={(page) => page !== "settings" && ui.go(page === "projects" ? "app/spool-home--team" : `app/spool-home--${page}`)} />,
				main: <TeamSettingsPage team={TIDEMARK} />,
			}}
		/>
	);
}
