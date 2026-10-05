import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { ProjectGrid } from "shared/ui/spool/home";
import { homeProjects } from "shared/ui/spool/home-fixture";
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
				main: (
					<TeamProjects
						team={TIDEMARK}
						covers={<ProjectGrid projects={TIDEMARK_PROJECTS} onOpenProject={() => ui.go("app/spool-canvas")} />}
						onNewProject={() => ui.go("app/spool-home--picker")}
					/>
				),
			}}
		/>
	);
}

/** Tidemark's projects on this Mac: the app's checkout and a lane worktree beside it are one cover. */
const TIDEMARK_PROJECTS = homeProjects.slice(0, 2).map((project, index) => ({
	...project,
	root: `~/code/${index === 0 ? "tidemark-app" : "tidemark-site"}`,
	name: index === 0 ? "tidemark-app" : "tidemark-site",
	...(index === 0 ? { copies: 2 } : {}),
}));
