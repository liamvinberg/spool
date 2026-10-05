import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { ProjectGrid } from "shared/ui/spool/home";
import { homeProjects } from "shared/ui/spool/home-fixture";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { AwayCovers, GetItSheet, TIDEMARK_AWAY } from "shared/ui/spool/team-moves";
import { TeamNav, TeamProjects, TeamSwitcher, TIDEMARK } from "shared/ui/spool/teams";

/** "Get it" on a Tidemark project not on this Mac: Ada's checkout of its repo first, the clone command below. */
export default function GetIt() {
	return (
		<SpoolHomeScreen
			onGo={ui.go}
			account={<AccountFoot account={{ state: "signed-in", email: "ada@tidemark.app", accountUrl: "https://spool.page/account" }} />}
			switcher={<TeamSwitcher current={TIDEMARK} />}
			team={{
				nav: <TeamNav team={TIDEMARK} page="projects" />,
				main: (
					<TeamProjects
						team={TIDEMARK}
						covers={<ProjectGrid projects={TIDEMARK_PROJECTS} onOpenProject={() => ui.go("app/spool-canvas")} />}
						away={<AwayCovers projects={TIDEMARK_AWAY} />}
					/>
				),
			}}
			overlay={<GetItSheet team={TIDEMARK} project={TIDEMARK_AWAY[0] as (typeof TIDEMARK_AWAY)[number]} />}
		/>
	);
}

const TIDEMARK_PROJECTS = homeProjects.slice(0, 1).map((project) => ({
	...project,
	root: "~/code/tidemark-app",
	name: "tidemark-app",
	team: { url: "https://spool.page/tidemark/app", team: "tidemark", project: "app" },
}));
