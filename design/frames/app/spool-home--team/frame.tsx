import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { TeamNav, TeamProjects, TeamSwitcher, TIDEMARK } from "shared/ui/spool/teams";

export default function Team() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />}
			switcher={<TeamSwitcher current={TIDEMARK} onSelect={(team) => !team && ui.go("app/spool-home--signed-in")} />}
			team={{
				nav: <TeamNav team={TIDEMARK} page="projects" onPage={(page) => page !== "projects" && ui.go(`app/spool-home--${page}`)} />,
				main: <TeamProjects team={TIDEMARK} />,
			}}
		/>
	);
}
