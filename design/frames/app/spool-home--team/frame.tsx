import { ui } from "spool";
import { AccountFoot } from "shared/ui/spool/account-foot";
import { ProjectGrid } from "shared/ui/spool/home";
import { PROJECT_ICONS } from "shared/lib/spool/project-icon";
import { homeProjects } from "shared/ui/spool/home-fixture";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { AwayCovers, TIDEMARK_AWAY } from "shared/ui/spool/team-moves";
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
						covers={<ProjectGrid projects={TIDEMARK_PROJECTS} here={HERE} onOpenProject={() => ui.go("app/spool-canvas")} />}
						away={<AwayCovers projects={TIDEMARK_AWAY} here={HERE} onGet={() => ui.go("app/spool-home--get-it")} />}
						onNewProject={() => ui.go("app/spool-home--picker")}
					/>
				),
			}}
		/>
	);
}

/** Who is inside Tidemark's projects right now (DEV-197): two in the app, and sam in one this Mac doesn't hold. */
const HERE = {
	app: [
		{ name: "ben", color: "#7aa7ff" },
		{ name: "cleo", color: "#eaa94a" },
	],
	onboarding: [{ name: "sam", color: "#4cc495" }],
};

/** Tidemark's projects on this Mac: the app's checkout and a lane worktree beside it are one cover. */
const TIDEMARK_PROJECTS = homeProjects.slice(0, 2).map((project, index) => ({
	...project,
	root: `~/code/${index === 0 ? "tidemark-app" : "tidemark-site"}`,
	name: index === 0 ? "tidemark-app" : "tidemark-site",
	icon: PROJECT_ICONS[index === 0 ? "tidemark-app" : "tidemark-site"],
	...(index === 0 ? { copies: 2 } : { syncPaused: "this project took 120 saves in the last minute" }),
	team: { url: `https://spool.page/tidemark/${index === 0 ? "app" : "site"}`, team: "tidemark", project: index === 0 ? "app" : "site" },
}));
