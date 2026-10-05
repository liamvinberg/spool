import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { MoveToTeamSheet } from "shared/ui/spool/team-moves";
import { TEAMS, TeamSwitcher } from "shared/ui/spool/teams";

/** "Move to team…" from a project's cover menu on Your projects: which team, and what the one commit does. */
export default function MoveToTeam() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />}
			switcher={<TeamSwitcher current={null} />}
			overlay={<MoveToTeamSheet project="tvärsö" teams={TEAMS.filter((team) => team.role !== "viewer")} />}
		/>
	);
}
