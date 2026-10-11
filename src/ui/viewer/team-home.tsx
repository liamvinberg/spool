import { type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { AccountFoot } from "../account-foot";
import type { CloudTeam, CloudTeamsState } from "../api";
import { CoverTile, HOME_MAIN, HomeShell, MenuBackdrop } from "../home";
import { MenuItem } from "../primitives/overlays";
import { ProjectIconView } from "../project-icon";
import type { ListedTeamProject, TeamsSource } from "../team-source";
import {
	InviteLine,
	NewTeamDialog,
	type TeamHere,
	TeamNav,
	type TeamPage,
	TeamPeoplePage,
	TeamProjects,
	TeamSettingsPage,
	TeamSwitcher,
	TeamsSourceContext,
	useTeamHere,
} from "../teams";
import { cloudTeams } from "./team-source";

/**
 * What spool.page tells Home in a browser, in a `<script id="spool-home" type="application/json">`: who is signed
 * in. Which team and page it shows is the address: `/<team>`, `/<team>/people`, `/<team>/settings`.
 */
export interface HomeConfig {
	account: string;
}

export function readHomeConfig(): HomeConfig {
	const script = document.getElementById("spool-home");
	const config = JSON.parse(script?.textContent ?? "null") as Partial<HomeConfig> | null;
	if (typeof config?.account !== "string") throw new Error("spool home: no config");
	return { account: config.account };
}

/** Where Home is, read from its address. */
export interface HomePlace {
	team: string;
	page: TeamPage;
}

export function placeOf(path: string): HomePlace | null {
	const [team, page, ...rest] = path.split("/").filter(Boolean);
	if (team === undefined || rest.length > 0) return null;
	if (page === undefined) return { team, page: "projects" };
	return page === "people" || page === "settings" ? { team, page } : null;
}

export function pathOf(place: HomePlace): string {
	return place.page === "projects" ? `/${place.team}` : `/${place.team}/${place.page}`;
}

/**
 * Home at spool.page/<team>: the Mac app's Home with no tabs above it and no Mac beside it. The same switcher, nav,
 * covers, People and Settings, read and changed at spool.page with this browser's session. Every team is a place
 * here, a viewer's included, and each project opens as the read-only canvas.
 */
export function BrowserHome({ config, source = cloudTeams }: { config: HomeConfig; source?: TeamsSource }) {
	return (
		<TeamsSourceContext.Provider value={source}>
			<Home account={config.account} source={source} />
		</TeamsSourceContext.Provider>
	);
}

function Home({ account, source }: { account: string; source: TeamsSource }) {
	const [place, setPlace] = useState<HomePlace | null>(() => placeOf(location.pathname));
	const [teams, setTeams] = useState<CloudTeamsState | null>(null);
	const [creating, setCreating] = useState(false);
	const [joined] = useState(() => new URLSearchParams(location.search).get("joined") === "viewer");
	const refresh = useCallback(async () => setTeams(await source.list()), [source]);
	const go = useCallback((next: HomePlace, replace = false) => {
		const path = pathOf(next);
		if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
		setPlace(next);
	}, []);
	useEffect(() => {
		void refresh();
		const back = () => void refresh();
		const moved = () => setPlace(placeOf(location.pathname));
		window.addEventListener("focus", back);
		window.addEventListener("popstate", moved);
		return () => {
			window.removeEventListener("focus", back);
			window.removeEventListener("popstate", moved);
		};
	}, [refresh]);
	const ready = teams?.state === "ready" ? teams : null;
	const current = ready?.teams.find((team) => team.address === place?.team) ?? null;
	// a team left, deleted or never this account's: the next one it is in, or the account page when none
	useEffect(() => {
		if (teams?.state === "signed-out") location.assign(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
		if (ready === null || current !== null) return;
		const next = ready.teams[0];
		if (next === undefined) location.assign("/account");
		else go({ team: next.address, page: "projects" }, true);
	}, [teams, ready, current, go]);
	useEffect(() => {
		if (current !== null) document.title = `${current.name} · spool`;
	}, [current]);
	const page = place?.page === "settings" && current?.role !== "admin" ? "projects" : (place?.page ?? "projects");
	return (
		<HomeShell
			underTabs={false}
			switcher={
				ready && (
					<>
						<TeamSwitcher
							teams={ready}
							current={current}
							onMac={false}
							onSelect={(address) => address !== null && go({ team: address, page: "projects" })}
							onNewTeam={() => setCreating(true)}
						/>
						{creating && (
							<NewTeamDialog
								allowed={ready.mayCreateTeam}
								onCreate={async (name) => {
									const created = await source.create(name);
									await refresh();
									go({ team: created.address, page: "projects" });
								}}
								onClose={() => setCreating(false)}
							/>
						)}
					</>
				)
			}
			nav={
				current && <TeamNav team={current} page={page} onPage={(to) => go({ team: current.address, page: to })} />
			}
			foot={
				<AccountFoot
					inBrowser
					account={{ state: "signed-in", email: account, accountUrl: "/account" }}
					onSignIn={() => {}}
					onReopen={() => {}}
					onCancel={() => {}}
					onSignOut={() => {
						void fetch("/sign-out", { method: "POST", credentials: "same-origin" }).finally(() =>
							location.assign("/sign-in"),
						);
					}}
				/>
			}
		>
			<main className={HOME_MAIN} aria-busy={current === null}>
				{current === null || ready === null ? null : page === "people" ? (
					<TeamPeoplePage key={current.address} team={current} onChanged={() => void refresh()} />
				) : page === "settings" ? (
					<TeamSettingsPage
						key={current.id}
						team={current}
						origin={ready.origin}
						onChanged={() => void refresh()}
						onMoved={(address) => go({ team: address, page: "settings" }, true)}
						onDeleted={() => void refresh()}
					/>
				) : (
					<Projects
						key={current.address}
						team={current}
						notice={
							<>
								{joined && (
									<p className="mb-[22px] text-secondary type-control">
										You joined {current.name} as a viewer. Its projects show here, live, as the team makes
										them.
									</p>
								)}
								{ready.invites.length > 0 && (
									<div className="pj-invites -mt-[8px] mb-[22px] flex flex-col">
										{ready.invites.map((invite) => (
											<InviteLine
												key={invite.id}
												invite={invite}
												onDecline={async () => {
													await source.decline(invite.id);
													await refresh();
												}}
												onJoin={async () => {
													const joined = await source.accept(invite.id);
													await refresh();
													go({ team: joined.address, page: "projects" });
												}}
											/>
										))}
									</div>
								)}
							</>
						}
					/>
				)}
			</main>
		</HomeShell>
	);
}

/** The team's projects, every one of them, each a cover that opens its read-only canvas. */
function Projects({ team, notice }: { team: CloudTeam; notice: ReactNode }) {
	const source = useContext(TeamsSourceContext);
	const here = useTeamHere(team.address);
	const [projects, setProjects] = useState<ListedTeamProject[] | undefined>();
	const [menu, setMenu] = useState<string | null>(null);
	useEffect(() => {
		let current = true;
		void source.projects(team.address).then((listed) => {
			if (current) setProjects(listed ?? []);
		});
		return () => {
			current = false;
		};
	}, [source, team.address]);
	if (projects === undefined) return null;
	return (
		<TeamProjects
			team={team}
			notice={notice}
			empty={`${team.name} has no projects yet`}
			covers={
				projects.length === 0 ? undefined : (
					<CloudCovers team={team} projects={projects} here={here} menu={menu} onMenu={setMenu} />
				)
			}
		/>
	);
}

function CloudCovers({
	team,
	projects,
	here,
	menu,
	onMenu,
}: {
	team: CloudTeam;
	projects: readonly ListedTeamProject[];
	here: TeamHere;
	menu: string | null;
	onMenu: (name: string | null) => void;
}) {
	return (
		<>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
				{[...projects]
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((project) => {
						const at = `/${team.address}/${encodeURIComponent(project.name)}`;
						return (
							<CoverTile
								key={project.url}
								name={project.name}
								open={{ href: at }}
								here={here.get(project.name)}
								art={<CloudCover team={team.address} project={project.name} />}
								line={
									<span className="mt-[5px] block truncate text-secondary type-detail">
										{project.repo ?? "no repo linked"}
									</span>
								}
								menuOpen={menu === project.name}
								onToggleMenu={() => onMenu(menu === project.name ? null : project.name)}
								onCloseMenu={() => onMenu(null)}
								menu={({ close }) => (
									<>
										<MenuItem label="Open" href={at} onClick={close} />
										{project.repo !== null && (
											<MenuItem
												label="Copy clone command"
												onClick={() => {
													close();
													void navigator.clipboard?.writeText(`git clone https://${project.repo}.git`);
												}}
											/>
										)}
										<MenuItem
											label="Copy link"
											onClick={() => {
												close();
												void navigator.clipboard?.writeText(new URL(at, location.origin).toString());
											}}
										/>
									</>
								)}
							/>
						);
					})}
			</div>
			{menu !== null && <MenuBackdrop onClose={() => onMenu(null)} />}
		</>
	);
}

/**
 * A team project's cover as spool.page keeps it: the still of its top-left frame a member's Mac took, or its letter
 * while it has none.
 */
function CloudCover({ team, project }: { team: string; project: string }) {
	const [none, setNone] = useState(false);
	if (none) return <ProjectIconView project={project} name={project} size="md" />;
	return (
		<img
			src={`/api/teams/${encodeURIComponent(team)}/projects/${encodeURIComponent(project)}/cover`}
			alt=""
			draggable={false}
			className="h-full w-full object-contain"
			onError={() => setNone(true)}
		/>
	);
}
