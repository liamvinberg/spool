import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { homeProjects } from "shared/ui/spool/home-fixture";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { TeamSwitcher } from "shared/ui/spool/teams";

/** Your projects after kaffe stopped syncing with Tidemark while its canvas was closed: its cover goes on saying so. */
export default function HomeEnded() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			projects={homeProjects.map((project, index) => (index === 1 ? { ...project, ended: "tidemark" } : project))}
			account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />}
			switcher={<TeamSwitcher current={null} />}
		/>
	);
}
