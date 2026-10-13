import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AccountFoot } from "../account-foot";
import type { BillingCycle, CloudTeam, CloudTeamsState } from "../api";
import { CoverTile, HOME_MAIN, HomeShell, MenuBackdrop } from "../home";
import { FindNav, FoundHead, finds, useFoundPlace } from "../home-find";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { Button } from "../primitives/actions";
import { EmptyFrames, EmptyState } from "../primitives/feedback";
import { MenuItem } from "../primitives/overlays";
import { ProjectIconView } from "../project-icon";
import { type MoveDone, MoveTeamSheet, mayMoveFrom, moveTargets, teamMoveDone, useMovedToast } from "../team-move";
import { type SetupHost, useSetUpToast } from "../team-setup";
import type { ListedTeamProject, TeamsSource } from "../team-source";
import {
	InviteLine,
	NewTeamDialog,
	type SettingsTab,
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
import { AccountPage } from "./account-page";
import { type AccountSource, cloudAccount } from "./account-source";
import { cloudTeams } from "./team-source";

/**
 * What spool.page tells Home in a browser, in a `<script id="spool-home" type="application/json">`: who is signed
 * in. Which team and page it shows is the address: `/<team>`, `/<team>/people`, `/<team>/settings` and
 * `/<team>/settings/billing`, or `/account`, the account's own page.
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

/** `?cycle=monthly|yearly`, as spool.page/start passes on the landing's choice. */
export function cycleOf(search: string): BillingCycle | undefined {
	const cycle = new URLSearchParams(search).get("cycle");
	return cycle === "monthly" || cycle === "yearly" ? cycle : undefined;
}

/** Where Home is, read from its address: one of a team's pages, or the account, which is no team's. */
export type HomePlace =
	| {
			team: string;
			page: TeamPage;
			/** Settings' tab; General when absent. */
			tab?: SettingsTab;
	  }
	| { team: null; page: "account" };

/** spool.page/account. `account` is a reserved team address, so no team stands there. */
export const ACCOUNT_PLACE: HomePlace = { team: null, page: "account" };

export function placeOf(path: string): HomePlace | null {
	const [team, page, tab, ...rest] = path.split("/").filter(Boolean);
	if (team === "account" && page === undefined) return ACCOUNT_PLACE;
	if (team === undefined || rest.length > 0) return null;
	if (page === undefined) return { team, page: "projects" };
	if (page === "settings" && tab === "billing") return { team, page, tab };
	if (tab !== undefined) return null;
	return page === "people" || page === "settings" ? { team, page } : null;
}

export function pathOf(place: HomePlace): string {
	if (place.team === null) return "/account";
	if (place.page === "settings" && place.tab === "billing") return `/${place.team}/settings/billing`;
	return place.page === "projects" ? `/${place.team}` : `/${place.team}/${place.page}`;
}

/**
 * Home at spool.page/<team>: the Mac app's Home with no tabs above it and no Mac beside it. The same switcher, nav,
 * covers, People and Settings, read and changed at spool.page with this browser's session. Every team is a place
 * here, a viewer's included, and each project opens as the read-only canvas.
 */
export function BrowserHome({
	config,
	source = cloudTeams,
	account = cloudAccount,
}: {
	config: HomeConfig;
	source?: TeamsSource;
	account?: AccountSource;
}) {
	return (
		<TeamsSourceContext.Provider value={source}>
			<Home account={config.account} source={source} accountSource={account} />
		</TeamsSourceContext.Provider>
	);
}

function Home({
	account,
	source,
	accountSource,
}: {
	account: string;
	source: TeamsSource;
	accountSource: AccountSource;
}) {
	const [place, setPlace] = useState<HomePlace | null>(() => placeOf(location.pathname));
	// the team Account was opened from stays in the sidebar while it is open
	const [lastTeam, setLastTeam] = useState<string | null>(null);
	const [teams, setTeams] = useState<CloudTeamsState | null>(null);
	const [creating, setCreating] = useState(false);
	const [joined] = useState(() => new URLSearchParams(location.search).get("joined") === "viewer");
	// the cycle the landing's switch showed, when spool.page/start sent this team here: the payment choice starts on it
	const [cycle] = useState(() => cycleOf(location.search));
	const refresh = useCallback(async () => setTeams(await source.list()), [source]);
	// the search in the sidebar reaches every team; going to any place puts it away
	const [query, setQuery] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const needle = query.trim().toLowerCase();
	const go = useCallback((next: HomePlace, replace = false) => {
		const path = pathOf(next);
		if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
		setPlace(next);
		setQuery("");
	}, []);
	useEffect(
		() =>
			attachHotkeyLayer({
				scope: "home",
				handlers: {
					"home.search": (event) => {
						event?.preventDefault();
						searchRef.current?.focus();
					},
				},
			}),
		[],
	);
	useEffect(() => {
		if (place?.team) setLastTeam(place.team);
	}, [place]);
	const { toast, onSetUp } = useSetUpToast((team) => go({ team: team.address, page: "people" }));
	const moved = useMovedToast();
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
	const onAccount = place?.page === "account";
	const current = onAccount
		? (ready?.teams.find((team) => team.address === lastTeam) ?? ready?.teams[0] ?? null)
		: (ready?.teams.find((team) => team.address === place?.team) ?? null);
	const signIn = useCallback(() => location.assign(`/sign-in?next=${encodeURIComponent(location.pathname)}`), []);
	const signOut = useCallback(() => {
		void fetch("/sign-out", { method: "POST", credentials: "same-origin" }).finally(() =>
			location.assign("/sign-in"),
		);
	}, []);
	// a team left, deleted or never this account's: the next one it is in, or the account page when none
	useEffect(() => {
		if (teams?.state === "signed-out") signIn();
		if (ready === null || current !== null || onAccount) return;
		const next = ready.teams[0];
		go(next === undefined ? ACCOUNT_PLACE : { team: next.address, page: "projects" }, true);
	}, [teams, ready, current, onAccount, go, signIn]);
	useEffect(() => {
		if (onAccount) document.title = "Account · spool";
		else if (current !== null) document.title = `${current.name} · spool`;
	}, [current, onAccount]);
	const tab = place?.team ? place.tab : undefined;
	const page: TeamPage | null =
		place === null || place.page === "account"
			? onAccount
				? null
				: "projects"
			: place.page === "settings" && current?.role !== "admin"
				? "projects"
				: place.page;
	return (
		<HomeShell
			underTabs={false}
			switcher={
				ready && (
					<>
						{ready.teams.length === 0 ? (
							<div className="pj-team-switch mb-[18px] flex flex-col gap-[10px] [@media(max-width:720px)]:hidden">
								<p className="pl-[2px] text-secondary type-label">You’re not in a team yet.</p>
								<Button className="w-full justify-start" onClick={() => location.assign("/start")}>
									Start a team…
								</Button>
							</div>
						) : (
							<>
								<FindNav query={query} onQuery={setQuery} inputRef={searchRef} />
								<TeamSwitcher
									teams={ready}
									current={current}
									onMac={false}
									onSelect={(address) => address !== null && go({ team: address, page: "projects" })}
									onNewTeam={() => setCreating(true)}
								/>
							</>
						)}
						{creating && (
							<NewTeamDialog
								allowed={ready.mayCreateTeam}
								starts={ready.newTeam}
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
				current && (
					<TeamNav
						team={current}
						page={needle === "" ? page : null}
						onPage={(to) => go({ team: current.address, page: to })}
					/>
				)
			}
			foot={
				<AccountFoot
					inBrowser
					account={{ state: "signed-in", email: account, accountUrl: "/account" }}
					onAccount={() => go(ACCOUNT_PLACE)}
					onSignIn={() => {}}
					onReopen={() => {}}
					onCancel={() => {}}
					onSignOut={signOut}
				/>
			}
		>
			<main className={HOME_MAIN} aria-busy={onAccount ? undefined : current === null}>
				{onAccount ? (
					<AccountPage
						source={accountSource}
						teams={ready?.teams.map((team) => team.name)}
						onSignedOut={signIn}
						onSignOut={signOut}
					/>
				) : current === null || ready === null ? null : needle !== "" ? (
					<CloudFound teams={ready.teams} needle={needle} query={query} onClear={() => setQuery("")} />
				) : page === "people" ? (
					<TeamPeoplePage key={current.address} team={current} onChanged={() => void refresh()} />
				) : page === "settings" ? (
					<TeamSettingsPage
						key={current.id}
						team={current}
						origin={ready.origin}
						tab={tab ?? "general"}
						onTab={(tab) => go({ team: current.address, page: "settings", tab })}
						// Stripe's pages come back to /<team>/settings/billing, so they open in this tab
						onOpen={(url) => location.assign(url)}
						cycle={cycle}
						onChanged={() => void refresh()}
						onMoved={(address) => go({ team: address, page: "settings", tab: tab ?? "general" }, true)}
						onDeleted={() => void refresh()}
					/>
				) : (
					<Projects
						key={current.address}
						team={current}
						teams={ready.teams}
						onMoved={(done) => {
							moved.say(done.toast);
							if (typeof done.show === "string") go({ team: done.show, page: "projects" });
						}}
						setup={{
							on: "browser",
							you: account,
							origin: ready.origin,
							onOpen: (url) => location.assign(url),
							cycle,
							onSetUp,
						}}
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
			{toast}
			{moved.toast}
		</HomeShell>
	);
}

/**
 * The team's projects, every one of them, each a cover that opens its read-only canvas. An admin can move one to
 * another team here; the moves that touch a Mac's folders are the app's.
 */
function Projects({
	team,
	teams,
	notice,
	setup,
	onMoved,
}: {
	team: CloudTeam;
	/** Every team of this account's, for where a project can move. */
	teams: readonly CloudTeam[];
	notice: ReactNode;
	setup: SetupHost;
	onMoved: (done: MoveDone) => void;
}) {
	const source = useContext(TeamsSourceContext);
	const here = useTeamHere(team.address);
	const [projects, setProjects] = useState<ListedTeamProject[] | undefined>();
	const [menu, setMenu] = useState<string | null>(null);
	const [moving, setMoving] = useState<ListedTeamProject | null>(null);
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
			setup={setup}
			cycle={setup.cycle}
			empty={`${team.name} has no projects yet`}
			count={{ total: projects.length }}
			// Stripe's Checkout comes back to /<team>/settings/billing, so it opens in this tab
			onOpen={(url) => location.assign(url)}
			covers={
				projects.length === 0 ? undefined : (
					<>
						<CloudCovers
							covers={[...projects]
								.sort((a, b) => a.name.localeCompare(b.name))
								.map((project) => ({ team, project }))}
							here={here}
							menu={menu}
							onMenu={setMenu}
							onMove={mayMoveFrom(teams, team.address) ? setMoving : undefined}
						/>
						{moving !== null && (
							<MoveTeamSheet
								from={team}
								project={moving}
								targets={moveTargets(teams, team.address)}
								onMoved={(outcome, to) => onMoved(teamMoveDone(moving.name, outcome, to))}
								onClose={() => setMoving(null)}
							/>
						)}
					</>
				)
			}
		/>
	);
}

function CloudCovers({
	covers,
	here,
	said = false,
	menu,
	onMenu,
	onMove,
}: {
	/** Each cover's project and the team it is in. */
	covers: readonly { team: CloudTeam; project: ListedTeamProject }[];
	/** Who is inside each, by its name, where every cover is one team's. */
	here?: TeamHere | undefined;
	/** Each cover names its team, where the covers come from several. */
	said?: boolean;
	menu: string | null;
	onMenu: (url: string | null) => void;
	/** "Move to team…", for an admin with another team to move a project to. */
	onMove?: ((project: ListedTeamProject) => void) | undefined;
}) {
	return (
		<>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
				{covers.map(({ team, project }) => {
					const at = `/${team.address}/${encodeURIComponent(project.name)}`;
					return (
						<CoverTile
							key={project.url}
							name={project.name}
							open={{ href: at }}
							here={here?.get(project.name)}
							art={<CloudCover team={team.address} project={project.name} />}
							line={
								<span className="mt-[5px] block truncate text-secondary type-detail">
									{[said && team.name, project.repo ?? "no repo linked"].filter(Boolean).join(" · ")}
								</span>
							}
							menuOpen={menu === project.url}
							onToggleMenu={() => onMenu(menu === project.url ? null : project.url)}
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
									{onMove && (
										<MenuItem
											label="Move to team…"
											onClick={() => {
												close();
												onMove(project);
											}}
										/>
									)}
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
 * What the search in the sidebar found: every team's projects whose name or repo it finds, by name, with a tab per
 * team to narrow them to one. Each team's list is read once the search starts.
 */
function CloudFound({
	teams,
	needle,
	query,
	onClear,
}: {
	teams: readonly CloudTeam[];
	needle: string;
	query: string;
	onClear: () => void;
}) {
	const source = useContext(TeamsSourceContext);
	const [lists, setLists] = useState<ReadonlyMap<string, readonly ListedTeamProject[]> | undefined>();
	const [menu, setMenu] = useState<string | null>(null);
	useEffect(() => {
		let current = true;
		void Promise.all(
			teams.map(async (team) => [team.address, (await source.projects(team.address)) ?? []] as const),
		).then((read) => {
			if (current) setLists(new Map(read));
		});
		return () => {
			current = false;
		};
	}, [source, teams]);
	const found = teams.flatMap((team) =>
		(lists?.get(team.address) ?? [])
			.filter((project) => finds(needle, project.name, project.repo ?? ""))
			.map((project) => ({ team, project })),
	);
	const places = teams
		.map((team) => ({
			key: team.address,
			name: team.name,
			count: found.filter((each) => each.team.address === team.address).length,
		}))
		.filter((place) => place.count > 0);
	const [only, setOnly] = useFoundPlace(places);
	if (lists === undefined) return null;
	if (places.length === 0)
		return (
			<>
				<FoundHead places={places} only={null} onOnly={setOnly} />
				<EmptyState
					className="min-h-[420px] justify-center p-[35px]"
					art={<EmptyFrames />}
					title={`Nothing matches “${query}”`}
					description="It looked in every team you’re in."
					actions={
						<Button size="lg" onClick={onClear}>
							Clear search
						</Button>
					}
				/>
			</>
		);
	return (
		<>
			<FoundHead places={places} only={only} onOnly={setOnly} />
			<CloudCovers
				covers={found
					.filter((each) => only === null || each.team.address === only)
					.sort((a, b) => a.project.name.localeCompare(b.project.name))}
				said={teams.length > 1}
				menu={menu}
				onMenu={setMenu}
			/>
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
