import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
	type HomePlace,
	OWN_PLACE,
	pathOf,
	placeOf,
	RECENT_PLACE,
	type SettingsTab,
	type TeamPage,
} from "../home-places";
import { personName } from "../person-name";
import {
	type BillingCycle,
	type CloudAccountState,
	type CloudTeam,
	type CloudTeamInvite,
	type CloudTeamsState,
	type DeletedTeam,
	daemonTeams,
	fetchTeamProjects,
	type HerePerson,
	type NewTeamStart,
	type PeopleBilling,
	type TeamPeople,
	type TeamProjectOnMac,
	type TeamRole,
} from "./api";
import { cn } from "./cn";
import { ConfirmDialog } from "./confirm-dialog";
import { NARROW_NAV, ProjectsHead, type Sort } from "./home-find";
import { ChevronIcon, CogIcon, EyeIcon, FrameIcon, PeopleIcon, PlusIcon } from "./icons";
import { Button } from "./primitives/actions";
import { EmptyFrames, EmptyState } from "./primitives/feedback";
import { Field, TextField } from "./primitives/inputs";
import { NavItem, Tab, Tabs } from "./primitives/navigation";
import { Menu, MenuItem, MenuSeparator } from "./primitives/overlays";
import { Checkbox } from "./primitives/selection";
import { keep, recall } from "./remembered";
import { BILLING_STATES, day, money, TeamBilling } from "./team-billing";
import { type TeamExporter, useTeamExport } from "./team-export";
import { TeamFailing } from "./team-failing";
import { TeamLapsed } from "./team-lapsed";
import { TeamRemoved } from "./team-removed";
import { type OwnProject, type SetupHost, TeamSetupList, useSetUpToast } from "./team-setup";
import { TeamActionRefused, type TeamsSource, teamSays } from "./team-source";

export { teamSays };

/**
 * Home's teams: the switcher at the top of the sidebar, the invite line above the covers, and a team's
 * Projects, People and Settings. spool.page decides every rule; these screens ask and say what it said.
 */

export type ReadyTeams = Extract<CloudTeamsState, { state: "ready" }>;

/** Where the team pages under it read and change teams: the daemon in the Mac app, spool.page in a browser. */
export const TeamsSourceContext = createContext<TeamsSource>(daemonTeams);
/** Said when something on a team's page put one of its projects in the trash: its Removed list reads itself again. */
export const TeamTrashContext = createContext<() => void>(() => {});
export type { SettingsTab, TeamPage };

export const ROLE_LABEL: Record<TeamRole, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

const NO_TEAMS: CloudTeam[] = [];

const HUES = ["#2E5D70", "#6B4E2E", "#4E3F70", "#2F6150", "#70393F"];

/** What a team mark is drawn from. */
export interface MarkTeam {
	address: string;
	name: string;
	logo: string | null;
}

/**
 * The team's logo, or its letter mark.
 *
 * Small, it is the badge a team project's local copy wears in its icon's corner: `cut` is the colour behind it,
 * drawn as a gap round the mark so it reads apart from the icon, and `paused` hollows it while the copy's sync is
 * paused, its letter in muted on the colour behind it, a logo included.
 */
export function TeamMark({
	team,
	size = 20,
	paused = false,
	cut,
}: {
	team: MarkTeam;
	size?: number;
	paused?: boolean;
	cut?: string | undefined;
}) {
	const radius = size >= 18 ? 5 : Math.max(2.5, size / 4);
	const gap = cut === undefined ? undefined : `0 0 0 1.5px ${cut}`;
	if (team.logo && !paused)
		return (
			<img
				src={team.logo}
				alt=""
				data-team-mark="filled"
				className="shrink-0 object-cover"
				style={{ width: size, height: size, borderRadius: radius, boxShadow: gap }}
			/>
		);
	const hue = HUES[[...team.address].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % HUES.length];
	const small = size < 16;
	return (
		<span
			aria-hidden="true"
			data-team-mark={paused ? "hollow" : "filled"}
			className={cn(
				"grid shrink-0 place-items-center",
				small ? "font-semibold leading-none" : "font-medium",
				paused ? "text-secondary" : "text-[#EDEDED]",
			)}
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				background: paused ? (cut ?? "transparent") : hue,
				fontSize: small ? Math.max(6.5, Math.round(size * 0.56)) : Math.round(size * 0.52),
				boxShadow:
					[paused ? "inset 0 0 0 1.25px var(--color-secondary)" : undefined, gap].filter(Boolean).join(", ") ||
					undefined,
			}}
		>
			{[...team.name][0]?.toUpperCase()}
		</span>
	);
}

/**
 * Home's sidebar of places: every team you're in, in spool.page's order (by name), the one you're in open to its
 * pages beneath it. On a Mac a rule follows, then Your projects; New team… comes last. A team you only watch is a
 * place like any other, marked with an eye. Below 720 px each place is its mark, its name on its title.
 */
export function HomePlaces({
	teams,
	deleted = [],
	current,
	page,
	onTeam,
	onPage,
	own,
	onNewTeam,
}: {
	teams: readonly CloudTeam[];
	/** Deleted teams this account is an admin of, each kept until its purge to export from. */
	deleted?: readonly DeletedTeam[] | undefined;
	/** The team you're in, by its address; null in Your projects or Recent. */
	current: string | null;
	/** Its page; null while a place outside the team, such as the search or Account, stands in the page. */
	page: TeamPage | null;
	onTeam: (address: string) => void;
	onPage: (page: TeamPage) => void;
	/** Your projects, on a Mac. */
	own?: { current: boolean; onOwn: () => void } | undefined;
	onNewTeam: () => void;
}) {
	return (
		<div className="pj-places flex flex-col gap-[2px]">
			{teams.map((team) => {
				const chosen = team.address === current;
				return (
					<div key={team.id} className="flex flex-col gap-[2px]" data-place={team.address}>
						<button
							type="button"
							title={team.name}
							aria-current={chosen || undefined}
							className={cn(PLACE, "aria-[current]:text-primary")}
							onClick={() => onTeam(team.address)}
						>
							<TeamMark team={team} />
							<span className={cn("min-w-0 flex-1 truncate", NARROW_HIDDEN)}>{team.name}</span>
							{team.role === "viewer" && (
								<span data-watch="" title="You watch this team" className={cn("shrink-0", NARROW_HIDDEN)}>
									<EyeIcon className="size-[14px] text-secondary" />
								</span>
							)}
						</button>
						{/* the team you're in opens to its pages: rows grow from 0fr, so the places below slide down, never jump */}
						<div
							className={cn(
								"pj-place-pages grid transition-[grid-template-rows,opacity] duration-base ease-out motion-reduce:transition-none",
								chosen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
							)}
							aria-hidden={!chosen || undefined}
							inert={!chosen}
						>
							<div className="flex min-h-0 flex-col gap-[2px] overflow-hidden">
								<div className="mb-[8px] flex flex-col gap-[2px]">
									<TeamNav team={team} page={chosen ? page : null} onPage={onPage} indent />
								</div>
							</div>
						</div>
					</div>
				);
			})}
			{deleted.map((team) => (
				<button
					key={team.address}
					type="button"
					title={`${team.name} · Deleted · gone on ${day(team.purgeAfter)}`}
					data-place={team.address}
					aria-current={team.address === current || undefined}
					className={cn(PLACE, "aria-[current]:text-primary")}
					onClick={() => onTeam(team.address)}
				>
					<TeamMark team={team} paused />
					<span className={cn("min-w-0 flex-1 truncate", NARROW_HIDDEN)}>
						{team.name}
						<span className="block truncate text-tertiary type-detail">
							Deleted · gone on {day(team.purgeAfter)}
						</span>
					</span>
				</button>
			))}
			{(own || teams.length > 0 || deleted.length > 0) && <hr className="mx-3 my-2 border-line-default border-t" />}
			{own && (
				<NavItem
					icon={<FrameIcon />}
					label="Your projects"
					title="Your projects"
					current={own.current}
					className={NARROW_NAV}
					onClick={own.onOwn}
				/>
			)}
			<NavItem icon={<PlusIcon />} label="New team…" title="New team…" className={NARROW_NAV} onClick={onNewTeam} />
		</div>
	);
}

/** A team's row in the sidebar: its mark and name, primary ink while you're in it. */
const PLACE =
	"focus-ring flex h-row-roomy w-full min-w-0 items-center gap-3 rounded-sm px-[10px] text-left text-secondary type-control transition-colors duration-fast ease-out hover:bg-state-hover hover:text-primary motion-reduce:transition-none [@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0";
const NARROW_HIDDEN = "[@media(max-width:720px)]:hidden";

/** An invite is news, so it is one quiet line where you already look: above the covers. */
export function InviteLine({
	invite,
	onJoin,
	onDecline,
}: {
	invite: CloudTeamInvite;
	onJoin: () => Promise<void>;
	onDecline: () => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const run = (action: () => Promise<void>) => {
		setBusy(true);
		setNotice(null);
		action().catch((error: unknown) => {
			setNotice(teamSays(error));
			setBusy(false);
		});
	};
	return (
		<div
			className="pj-invite-line flex min-h-[48px] items-center gap-[12px] border-line-default border-y py-[8px]"
			aria-busy={busy}
		>
			<TeamMark team={invite.team} />
			<span className="min-w-0 flex-1 type-control">
				{invite.invitedBy} invited you to {invite.team.name}.{" "}
				<span className="text-secondary">
					{notice ??
						(invite.role === "viewer"
							? "You’d watch their projects live in the browser."
							: `You’d join as ${invite.role === "admin" ? "an admin" : "an editor"}.`)}
				</span>
			</span>
			<Button variant="ghost" disabled={busy} onClick={() => run(onDecline)}>
				Decline
			</Button>
			<Button disabled={busy} onClick={() => run(onJoin)}>
				Join {invite.team.name}
			</Button>
		</div>
	);
}

/** What watching a team means, said once on its page: a viewer's Mac holds none of its projects. */
function WatchLine({ team }: { team: CloudTeam }) {
	return (
		<p className="pj-watch-line -mt-[14px] mb-[26px] flex items-center gap-[9px] text-secondary type-control">
			<EyeIcon className="size-[15px] shrink-0" />
			You watch {team.name}. A project opens live in your browser, and nothing comes to this Mac.
		</p>
	);
}

/** A team's pages under it in the sidebar: Projects, People, and Settings for admins. `page` null while none stands. */
export function TeamNav({
	team,
	page,
	onPage,
	indent = false,
}: {
	team: CloudTeam;
	page: TeamPage | null;
	onPage: (page: TeamPage) => void;
	/** Set in under the team's row. */
	indent?: boolean;
}) {
	const item = (to: TeamPage, icon: ReactNode, label: string, count?: number) => (
		<NavItem
			icon={icon}
			label={label}
			title={label}
			meta={count}
			current={page === to}
			className={cn(NARROW_NAV, indent && "pl-[30px]")}
			onClick={() => onPage(to)}
		/>
	);
	return (
		<>
			{item("projects", <FrameIcon />, "Projects")}
			{item("people", <PeopleIcon />, "People", team.people)}
			{team.role === "admin" && item("settings", <CogIcon />, "Settings")}
		</>
	);
}

/**
 * A team's projects: on a Mac one cover per team project, however many local copies of it there are, and New
 * project to start another in the team; in a browser, every project the team has.
 */
export function TeamProjects({
	team,
	notice,
	covers,
	away,
	onNewProject,
	onBilling,
	setup,
	onOpen,
	cycle,
	empty = `${team.name} has no projects on this Mac yet`,
	count,
	sort,
	search,
	onRestored,
}: {
	team: CloudTeam;
	/**
	 * Opens Stripe's Checkout from a lapsed team's dialog, or its portal from a failing team's line: this tab in a
	 * browser, the system browser from the Mac.
	 */
	onOpen: (url: string) => void;
	/** The cycle a payment choice here starts on, as the landing's switch showed it; yearly when not said. */
	cycle?: BillingCycle | undefined;
	/** What it says with no covers and nothing away. */
	empty?: string;
	notice?: ReactNode;
	/** The covers of the team's projects on this Mac, if there are any. */
	covers?: ReactNode;
	/** The team's projects not on this Mac yet, dimmed with "Get it". */
	away?: ReactNode;
	onNewProject?: (() => void) | undefined;
	/** Settings › Billing, where the host can go there: a lapsed team's New project points an admin to it. */
	onBilling?: (() => void) | undefined;
	/** Where the setup list is drawn, for a new team's admins; no list without it. */
	setup?: SetupHost | undefined;
	/** How many projects the team has, on this Mac or not, once that is known; with a search, how many it finds. */
	count?: { total: number; shown?: number } | undefined;
	/** The order of the covers, where they have one to choose: on a Mac, by when each was last opened. */
	sort?: { value: Sort; onChange: (sort: Sort) => void } | undefined;
	/** The page's own search, where the sidebar has none. */
	search?: ReactNode;
	/** A project restored from the team's trash: the host reads its projects again. */
	onRestored?: (() => void) | undefined;
}) {
	const [listing, setListing] = useState(false);
	// a restore reads the projects not on this Mac again, as their list reads itself
	const [restored, setRestored] = useState(0);
	// a project moved out from the page reads the trash again
	const [trashed, setTrashed] = useState(0);
	const [refusing, setRefusing] = useState(false);
	const lapsed = team.billing?.state === "lapsed";
	return (
		<>
			<ProjectsHead
				title={team.name}
				count={count}
				sort={sort}
				search={search}
				actions={
					onNewProject && (
						<Button
							size="lg"
							variant="primary"
							icon={<PlusIcon />}
							onClick={lapsed ? () => setRefusing(true) : onNewProject}
						>
							New project…
						</Button>
					)
				}
			/>
			{refusing && lapsed && (
				<LapsedNewProject team={team} onBilling={onBilling} onClose={() => setRefusing(false)} />
			)}
			<TeamLapsed team={team} onOpen={onOpen} cycle={cycle} />
			<TeamFailing team={team} onOpen={onOpen} />
			{notice}
			{setup && <TeamSetupList key={team.address} team={team} host={setup} onShowing={setListing} />}
			{covers ??
				(away || listing ? null : (
					<EmptyState className="min-h-[420px] justify-center p-[35px]" art={<EmptyFrames />} title={empty} />
				))}
			<TeamTrashContext.Provider value={() => setTrashed((n) => n + 1)}>
				<Fragment key={`away:${restored}`}>{away}</Fragment>
			</TeamTrashContext.Provider>
			<TeamRemoved
				key={`removed:${team.address}:${trashed}`}
				team={team}
				onRestored={() => {
					setRestored((n) => n + 1);
					onRestored?.();
				}}
			/>
		</>
	);
}

/**
 * New project in a team with no paid time: spool.page would refuse the project, so this says so before any form.
 * An admin is pointed to Billing, with a way there when the host has one.
 */
function LapsedNewProject({
	team,
	onBilling,
	onClose,
}: {
	team: CloudTeam;
	onBilling?: (() => void) | undefined;
	onClose: () => void;
}) {
	const admin = team.role === "admin";
	const why = team.billing?.hadTime === false ? `${team.name} isn’t paid for yet.` : `${team.name} has gone local.`;
	const go = admin && onBilling !== undefined;
	return (
		<ConfirmDialog
			title="New project"
			description={
				admin
					? `${why} Pay for it in Settings › Billing to add projects.`
					: `${why} An admin can pay for it to add projects.`
			}
			confirmLabel={go ? "Go to Billing" : "OK"}
			onConfirm={async () => {
				if (go) onBilling();
			}}
			onClose={onClose}
		/>
	);
}

type Confirming = { title: string; says: string; label: string; act: () => Promise<void> };

/** One row per member and a role menu for admins. A change that takes something away asks first. */
export function TeamPeoplePage({ team, onChanged }: { team: CloudTeam; onChanged: () => void }) {
	const [people, setPeople] = useState<TeamPeople | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<Confirming | null>(null);
	const [menu, setMenu] = useState<string | null>(null);
	const admin = team.role === "admin";
	const teamActions = useContext(TeamsSourceContext);
	const load = useCallback(async () => {
		try {
			setPeople(await teamActions.people(team.address));
		} catch (error) {
			setNotice(teamSays(error));
		}
	}, [team.address, teamActions]);
	useEffect(() => {
		void load();
	}, [load]);
	const act = async (action: () => Promise<unknown>, done?: string) => {
		setNotice(null);
		try {
			await action();
			if (done) setNotice(done);
		} catch (error) {
			setNotice(peopleSays(error, people?.billing));
		}
		await load();
		onChanged();
	};
	const changeRole = (person: TeamPeople["members"][number], role: TeamRole) => {
		setMenu(null);
		const change = () => teamActions.setRole(team.address, person.accountId, role);
		if (person.role !== "viewer" && role === "viewer")
			setConfirming({
				title: person.you ? "Make yourself a viewer?" : `Make ${personName(person)} a viewer?`,
				says: `${person.you ? "This" : "Their"} Mac stops syncing ${team.name}. The folders stay on it.`,
				label: "Make viewer",
				act: async () => {
					await change();
				},
			});
		else void act(change);
	};
	const remove = (person: TeamPeople["members"][number]) => {
		setMenu(null);
		setConfirming(
			person.you
				? {
						title: `Leave ${team.name}?`,
						says: `The folders stay on this Mac as ordinary projects. Pages ${team.name} shared keep working.`,
						label: `Leave ${team.name}`,
						act: async () => {
							await teamActions.removeMember(team.address, person.accountId);
						},
					}
				: {
						title: `Remove ${personName(person)} from ${team.name}?`,
						says: `They lose ${team.name}’s projects at once. Folders on their Mac stay as ordinary projects.`,
						label: "Remove",
						act: async () => {
							await teamActions.removeMember(team.address, person.accountId);
						},
					},
		);
	};
	return (
		<div className="pj-team-people max-w-[880px]">
			<header className="pj-heading mb-[10px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">People</h1>
			</header>
			<p className="mb-[22px] text-secondary type-detail">{people ? headcount(people, admin) : " "}</p>
			<InviteForm
				admin={admin}
				billing={admin ? people?.billing : undefined}
				onInvite={(email, role) => act(() => teamActions.invite(team.address, email, role), "Invite sent.")}
			/>
			{notice && (
				<p role="status" className="mb-[14px] type-control">
					{notice}
				</p>
			)}
			<ul className="flex flex-col border-line-default border-b">
				{people?.members.map((person) => (
					<li
						key={person.accountId}
						className="flex h-[58px] items-center gap-[14px] border-line-default border-t"
					>
						<Initial name={personName(person)} />
						{/* People is the one place a teammate's address shows, beside their name */}
						<span className="min-w-0 flex-1 truncate type-control">
							{personName(person)}
							{person.you && <span className="text-secondary"> (you)</span>}
							<span className="text-secondary"> · {person.email}</span>
						</span>
						{admin ? (
							<span className="relative shrink-0">
								<button
									type="button"
									className="flex h-[30px] items-center gap-[8px] rounded-[6px] border border-transparent px-[10px] type-control hover:border-line-strong aria-expanded:border-line-strong aria-expanded:bg-surface-raised"
									aria-expanded={menu === person.accountId}
									aria-label={`Role of ${person.email}`}
									onClick={() => setMenu(menu === person.accountId ? null : person.accountId)}
								>
									{ROLE_LABEL[person.role]}
									<span className="h-[9px] w-[9px] rotate-90 text-secondary [&>svg]:h-full [&>svg]:w-full">
										<ChevronIcon />
									</span>
								</button>
								{menu === person.accountId && (
									<>
										<button
											type="button"
											className="fixed inset-0 z-20 cursor-default"
											aria-label="Close menu"
											onClick={() => setMenu(null)}
										/>
										<Menu className="absolute top-[36px] right-0 z-30">
											{(["admin", "editor", "viewer"] as const).map((role) => (
												<MenuItem
													key={role}
													checked={role === person.role}
													label={ROLE_LABEL[role]}
													onClick={() => changeRole(person, role)}
												/>
											))}
											<MenuSeparator />
											<MenuItem
												inset
												destructive
												label={person.you ? `Leave ${team.name}` : `Remove from ${team.name}`}
												onClick={() => remove(person)}
											/>
										</Menu>
									</>
								)}
							</span>
						) : (
							<>
								<span className="w-[86px] shrink-0 text-secondary type-control">{ROLE_LABEL[person.role]}</span>
								<span className="w-[80px] shrink-0 text-right">
									{person.you && <Button onClick={() => remove(person)}>Leave</Button>}
								</span>
							</>
						)}
					</li>
				))}
			</ul>
			{people && people.invites.length > 0 && (
				<>
					<h2 className="mt-[34px] mb-[8px] flex items-baseline gap-[10px] type-title">
						Invited <span className="text-secondary type-detail">{people.invites.length}</span>
					</h2>
					<ul className="flex flex-col">
						{people.invites.map((invite) => (
							<li key={invite.id} className="flex h-[58px] items-center gap-[14px] border-line-default border-t">
								<span className="h-[30px] w-[30px] shrink-0 rounded-full border border-secondary/60 border-dashed" />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className={cn("truncate type-control", invite.expired && "text-secondary")}>
										{invite.email}
									</span>
									<span className="truncate text-secondary type-detail">
										{ROLE_LABEL[invite.role].toLowerCase()} ·{" "}
										{invite.expired
											? "expired"
											: `sent by ${invite.invitedBy} · ${daysLeft(invite.expiresAt)}`}
									</span>
								</span>
								{(admin || invite.role === "viewer") && (
									<>
										<Button
											variant="ghost"
											onClick={() =>
												void act(
													() => teamActions.resendInvite(team.address, invite.id),
													"Invite sent again.",
												)
											}
										>
											Resend
										</Button>
										<Button
											variant="ghost"
											onClick={() => void act(() => teamActions.cancelInvite(team.address, invite.id))}
										>
											Cancel
										</Button>
									</>
								)}
							</li>
						))}
					</ul>
				</>
			)}
			{confirming && (
				<ConfirmDialog
					title={confirming.title}
					description={confirming.says}
					confirmLabel={confirming.label}
					danger
					onConfirm={async () => {
						try {
							await confirming.act();
						} catch (error) {
							throw new Error(teamSays(error));
						} finally {
							await load();
							onChanged();
						}
					}}
					onClose={() => setConfirming(null)}
				/>
			)}
		</div>
	);
}

/** "4 people", and to an admin "4 people · 3 seats". */
function headcount(people: TeamPeople, admin: boolean): string {
	const count = people.members.length;
	const said = `${count} ${count === 1 ? "person" : "people"}`;
	if (!admin || people.seats === undefined) return said;
	return `${said} · ${people.seats} ${people.seats === 1 ? "seat" : "seats"}`;
}

/** A refused invite or role change in words: a trial's editor cap with the number spool.page gives for it. */
export function peopleSays(error: unknown, billing: PeopleBilling | undefined): string {
	const cap = billing?.trialEditorCap;
	if (error instanceof TeamActionRefused && error.code === "trial_editor_cap" && cap != null)
		return `A trial holds up to ${cap} editors. Pay for the team in Settings › Billing to add more.`;
	return teamSays(error);
}

/**
 * What inviting an editor or admin adds to a team with a subscription, said before the invite goes: a seat once
 * they join, charged at once for the billing year's days left or added to the next monthly invoice. Null when it adds none.
 */
export function seatCost(billing: PeopleBilling | undefined, role: TeamRole): string | null {
	if (!billing || role === "viewer" || billing.cycle === null || billing.seatPrice === null) return null;
	if (!BILLING_STATES[billing.state].paid) return null;
	const when =
		billing.cycle === "yearly" ? "charged for the days left this billing year" : "added to the next invoice";
	return `An ${role} is one more seat: ${money(billing.seatPrice)} a month, ${when} once they join.`;
}

function daysLeft(expiresAt: number): string {
	const days = Math.max(1, Math.ceil((expiresAt * 1000 - Date.now()) / 86_400_000));
	return days === 1 ? "1 day left" : `${days} days left`;
}

/** A member's face: the first letter of their name. */
function Initial({ name }: { name: string }) {
	return (
		<span
			className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-control text-primary uppercase type-detail"
			aria-hidden="true"
		>
			{[...name][0]}
		</span>
	);
}

/**
 * An address and a role. Admins invite anyone; everyone else invites viewers. On a paying team an admin reads what
 * an editor costs under the row before sending.
 */
function InviteForm({
	admin,
	billing,
	onInvite,
}: {
	admin: boolean;
	billing?: PeopleBilling | undefined;
	onInvite: (email: string, role: TeamRole) => Promise<void>;
}) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<TeamRole>(admin ? "editor" : "viewer");
	const [busy, setBusy] = useState(false);
	const cost = seatCost(billing, role);
	return (
		<div className="mb-[22px]">
			<form
				className="flex items-center gap-[10px]"
				onSubmit={(event) => {
					event.preventDefault();
					setBusy(true);
					void onInvite(email.trim(), role).finally(() => {
						setBusy(false);
						setEmail("");
					});
				}}
			>
				<TextField
					size="lg"
					className="flex-1"
					value={email}
					onValueChange={setEmail}
					placeholder="Email address"
					label="Email address"
					inputProps={{ type: "email", required: true }}
				/>
				<select
					value={role}
					aria-label="Role"
					onChange={(event) => setRole(event.target.value as TeamRole)}
					className="h-[38px] cursor-pointer rounded-[7px] border border-line-strong bg-transparent px-[9px] text-primary type-control"
				>
					{(admin ? (["admin", "editor", "viewer"] as const) : (["viewer"] as const)).map((option) => (
						<option key={option} value={option} className="bg-surface-panel">
							as {ROLE_LABEL[option]}
						</option>
					))}
				</select>
				<Button type="submit" size="lg" variant="primary" disabled={busy}>
					Invite
				</Button>
			</form>
			{cost && <p className="pj-seat-cost mt-[8px] text-secondary type-label">{cost}</p>}
		</div>
	);
}

/**
 * Settings in two tabs. General: logo, name, address and Delete team, in that order. Billing: what the team pays,
 * for admins only. spool.page refuses anyone else either way.
 */
export function TeamSettingsPage({
	team,
	origin,
	tab = "general",
	onTab,
	onOpen,
	cycle,
	onChanged,
	onMoved,
	onDeleted,
	onExport,
}: {
	team: CloudTeam;
	origin: string;
	tab?: SettingsTab;
	onTab: (tab: SettingsTab) => void;
	/** Opens Stripe's Checkout or portal. */
	onOpen: (url: string) => void;
	/** The cycle Billing's payment choice starts on. */
	cycle?: BillingCycle | undefined;
	onChanged: () => void;
	onMoved: (address: string) => void;
	onDeleted: () => void;
	/** Export all, for an admin: the Mac's own export, or spool.page's hand-off to it. None where it can't be done. */
	onExport?: TeamExporter | undefined;
}) {
	const admin = team.role === "admin";
	const shown = admin ? tab : "general";
	return (
		<div className="pj-team-settings max-w-[720px]">
			<header className="pj-heading mb-[28px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">Settings</h1>
			</header>
			{admin && (
				<Tabs className="mb-[28px]">
					<Tab selected={shown === "general"} onClick={() => onTab("general")}>
						General
					</Tab>
					<Tab selected={shown === "billing"} onClick={() => onTab("billing")}>
						Billing
					</Tab>
				</Tabs>
			)}
			{shown === "billing" ? (
				<TeamBilling team={team} onOpen={onOpen} cycle={cycle} />
			) : (
				<TeamGeneral
					team={team}
					origin={origin}
					onChanged={onChanged}
					onMoved={onMoved}
					onDeleted={onDeleted}
					onExport={admin ? onExport : undefined}
				/>
			)}
		</div>
	);
}

function TeamGeneral({
	team,
	origin,
	onChanged,
	onMoved,
	onDeleted,
	onExport,
}: {
	team: CloudTeam;
	origin: string;
	onChanged: () => void;
	onMoved: (address: string) => void;
	onDeleted: () => void;
	onExport?: TeamExporter | undefined;
}) {
	const [name, setName] = useState(team.name);
	const [address, setAddress] = useState(team.address);
	const [notice, setNotice] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const file = useRef<HTMLInputElement>(null);
	const teamActions = useContext(TeamsSourceContext);
	useEffect(() => {
		setName(team.name);
		setAddress(team.address);
	}, [team.name, team.address]);
	const act = async (action: () => Promise<unknown>) => {
		setNotice(null);
		try {
			await action();
			setNotice("Saved.");
		} catch (error) {
			setNotice(teamSays(error));
		}
		onChanged();
	};
	const row = (label: string, says: string | null, control: ReactNode, top = true) => (
		<div
			className={cn("flex items-center justify-between gap-[40px] py-[18px]", top && "border-line-default border-t")}
		>
			<span className="flex min-w-0 flex-col gap-[4px]">
				<span className="type-control">{label}</span>
				{says && <span className="max-w-[400px] text-secondary type-label">{says}</span>}
			</span>
			<span className="flex shrink-0 items-center gap-[8px]">{control}</span>
		</div>
	);
	return (
		<div className="pj-team-general">
			{notice && (
				<p role="status" className="mb-[14px] type-control">
					{notice}
				</p>
			)}
			{row(
				"Logo",
				"Shows in the sidebar and on the team’s page.",
				<>
					<TeamMark team={team} size={40} />
					<input
						ref={file}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						className="hidden"
						aria-label="Logo"
						onChange={(event) => {
							const chosen = event.target.files?.[0];
							event.target.value = "";
							if (chosen) void act(() => teamActions.setLogo(team.address, chosen));
						}}
					/>
					<Button className="ml-[8px]" onClick={() => file.current?.click()}>
						Upload…
					</Button>
					<Button disabled={!team.logo} onClick={() => void act(() => teamActions.removeLogo(team.address))}>
						Remove
					</Button>
				</>,
				false,
			)}
			{row(
				"Name",
				null,
				<form
					className="flex gap-[8px]"
					onSubmit={(event) => {
						event.preventDefault();
						void act(() => teamActions.update(team.address, { name }));
					}}
				>
					<TextField
						size="lg"
						className="w-[240px]"
						value={name}
						onValueChange={setName}
						label="Name"
						inputProps={{ maxLength: 64 }}
					/>
					<Button type="submit" disabled={name.trim() === team.name}>
						Save
					</Button>
				</form>,
			)}
			{row(
				"Address",
				null,
				<form
					className="flex gap-[8px]"
					onSubmit={(event) => {
						event.preventDefault();
						void act(async () => onMoved((await teamActions.update(team.address, { address })).address));
					}}
				>
					<TextField
						size="lg"
						mono
						className="w-[260px]"
						prefix={`${new URL(origin).host}/`}
						value={address}
						onValueChange={(next) => setAddress(next.toLowerCase())}
						label="Address"
						inputProps={{ maxLength: 40 }}
					/>
					<Button type="submit" disabled={address === team.address}>
						Save
					</Button>
				</form>,
			)}
			{onExport && (
				<ExportAllRow
					says="Every project as a git repository with its history, and a file of the team’s people and shares."
					onExport={() => onExport(team.address)}
					row={row}
				/>
			)}
			{row(
				"Delete team",
				"Everyone loses access at once. Gone for good after 30 days.",
				<Button variant="danger" onClick={() => setDeleting(true)}>
					Delete {team.name}…
				</Button>,
			)}
			{deleting && (
				<ConfirmDialog
					title={`Delete ${team.name}?`}
					description={`Everyone loses access at once. Gone for good after 30 days.${
						team.billing && BILLING_STATES[team.billing.state].paid
							? " Its subscription is cancelled at once."
							: ""
					} Admins can export it until ${day(Date.now() / 1000 + PURGE_DAYS * 86_400)}.`}
					confirmLabel={`Delete ${team.name}`}
					danger
					onConfirm={async () => {
						try {
							await teamActions.delete(team.address);
						} catch (error) {
							throw new Error(teamSays(error));
						}
						onDeleted();
					}}
					onClose={() => setDeleting(false)}
				/>
			)}
		</div>
	);
}

/** How long a deleted team waits before it is purged, and its admins can export it until then. */
const PURGE_DAYS = 30;

/** Export all as a Settings row: the button, and the note a hand-off leaves beside it when there is one. */
function ExportAllRow({
	says,
	onExport,
	row,
}: {
	says: string;
	onExport: () => Promise<ReactNode | null>;
	row: (label: string, says: string | null, control: ReactNode) => ReactNode;
}) {
	const [note, setNote] = useState<ReactNode>(null);
	return (
		<>
			{row(
				"Export",
				says,
				<Button
					onClick={async () => {
						setNote(null);
						setNote(await onExport());
					}}
				>
					Export all…
				</Button>,
			)}
			{note && <p className="-mt-[8px] mb-[14px] text-secondary type-label">{note}</p>}
		</>
	);
}

/**
 * A deleted team, as its admins see it until its purge: what happened, the day it goes for good, and Export all,
 * which is all that is left to do with it.
 */
export function DeletedTeamPage({ team, onExport }: { team: DeletedTeam; onExport: TeamExporter }) {
	const [note, setNote] = useState<ReactNode>(null);
	return (
		<div className="pj-team-deleted max-w-[720px]">
			<header className="pj-heading mb-[28px] flex h-[35px] items-center gap-[10px]">
				<TeamMark team={team} paused />
				<h1 className="type-page font-medium">{team.name}</h1>
			</header>
			<p className="type-control">
				{team.name} was deleted. It’s gone for good on {day(team.purgeAfter)}.
			</p>
			<p className="mt-[6px] mb-[20px] max-w-[480px] text-secondary type-label">
				Until then, export it: every project as a git repository with its history, and a file of the team’s people
				and shares.
			</p>
			<Button
				variant="primary"
				onClick={async () => {
					setNote(null);
					setNote(await onExport(team.address));
				}}
			>
				Export all…
			</Button>
			{note && <p className="mt-[12px] text-secondary type-label">{note}</p>}
		</div>
	);
}

/** What the new team begins as, said before it is made: the account's one trial, free, or paid for from the start. */
const NEW_TEAM_STARTS: Record<NewTeamStart, string> = {
	trial: "It starts your 14-day free trial. No card needed.",
	paid: "You’ve used your free trial, so this team is paid for from the start. You pay first, then invite people. It’s held for an hour while you pay.",
	free: "Teams you start are free.",
};

const LEGAL_LINK = "underline underline-offset-[3px] [&:hover]:text-primary";

/** "New team…": a name, and spool.page decides whether this account may start one yet. */
/** The tick every way to start or pay for a team asks for: Spool Cloud is sold for business use only (spool#209). */
export const BUSINESS_TICK = "I’m buying for my business or work";

export function NewTeamDialog({
	allowed,
	starts,
	origin,
	onCreate,
	onClose,
}: {
	allowed: boolean;
	/** What spool.page says the team begins as; unsaid by an older spool.page. */
	starts?: NewTeamStart | undefined;
	/** spool.page, where the Terms and the DPA that starting a team agrees to live. */
	origin?: string | undefined;
	onCreate: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [business, setBusiness] = useState(false);
	if (!allowed)
		return (
			<ConfirmDialog
				title="New team"
				description="Creating a team isn’t open yet."
				confirmLabel="OK"
				onConfirm={async () => {}}
				onClose={onClose}
			/>
		);
	return (
		<ConfirmDialog
			title="New team"
			{...(starts ? { description: NEW_TEAM_STARTS[starts] } : {})}
			confirmLabel="Create team"
			disabled={name.trim() === "" || !business}
			onConfirm={async () => {
				try {
					await onCreate(name.trim());
				} catch (error) {
					throw new Error(teamSays(error));
				}
			}}
			onClose={onClose}
		>
			<Field label="Name">
				{(id) => <TextField size="lg" value={name} onValueChange={setName} inputProps={{ id, maxLength: 64 }} />}
			</Field>
			{/* Spool Cloud is sold for business use only (spool#209): no team starts without the tick */}
			<Checkbox
				className="mt-[12px] type-label"
				checked={business}
				onCheckedChange={setBusiness}
				label={BUSINESS_TICK}
			/>
			{origin ? (
				<p className="mt-[12px] text-secondary type-detail">
					Starting a team agrees to the{" "}
					<a className={LEGAL_LINK} href={`${origin}/legal/terms`} target="_blank" rel="noreferrer">
						Terms
					</a>{" "}
					and the{" "}
					<a className={LEGAL_LINK} href={`${origin}/legal/dpa`} target="_blank" rel="noreferrer">
						DPA
					</a>
					.
				</p>
			) : null}
		</ConfirmDialog>
	);
}

/** Who is inside each of a team's projects now, by project name. */
export type TeamHere = ReadonlyMap<string, readonly HerePerson[]>;

/** How often Home reads again who is inside the team's projects, while it is on screen. */
export const HERE_MS = 10_000;

/**
 * Who is inside each of the shown team's projects right now (DEV-197), read from spool.page when the team is
 * chosen and again every `HERE_MS` while the window is shown. Nobody is said while spool.page can't say.
 */
export function useTeamHere(address: string | null): TeamHere {
	const source = useContext(TeamsSourceContext);
	const [here, setHere] = useState<TeamHere>(new Map());
	useEffect(() => {
		setHere(new Map());
		if (address === null) return;
		let current = true;
		const read = () => {
			if (document.hidden) return;
			void source.here(address).then((read) => {
				if (current) setHere(read ?? new Map());
			});
		};
		read();
		const timer = setInterval(read, HERE_MS);
		document.addEventListener("visibilitychange", read);
		return () => {
			current = false;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", read);
		};
	}, [address, source]);
	return here;
}

/** Where Home's team is kept between reloads: a team's address, or null for Your projects. */
/**
 * Every team's projects as spool.page lists them, each on this Mac already or not, read again whenever this Mac's
 * team copies change: Home's search finds the ones not here, and a team's page counts them.
 */
export function useTeamLists(teams: readonly CloudTeam[], copies: string) {
	const [lists, setLists] = useState<ReadonlyMap<string, readonly TeamProjectOnMac[]>>(new Map());
	const [asked, setAsked] = useState(0);
	const addresses = teams.map((team) => team.address).join("\n");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the copies and a refresh are why it reads again
	useEffect(() => {
		let current = true;
		const each = addresses === "" ? [] : addresses.split("\n");
		void Promise.all(each.map(async (address) => [address, await fetchTeamProjects(address)] as const)).then(
			(read) => {
				if (!current) return;
				const next = new Map<string, readonly TeamProjectOnMac[]>();
				for (const [address, projects] of read) if (projects !== undefined) next.set(address, projects);
				setLists(next);
			},
		);
		return () => {
			current = false;
		};
	}, [addresses, copies, asked]);
	return { lists, refresh: () => setAsked((n) => n + 1) };
}

const HOME_PLACE = "home.place";
/** A Mac's own places: Account is spool.page's, so a Mac never stands there. */
const macPlace = (path: string): HomePlace | null => {
	const place = placeOf(path);
	return place?.page === "account" ? null : place;
};
const isPlace = (value: unknown): value is string => typeof value === "string" && macPlace(value) !== null;

/**
 * Where Home opens: the team a link at spool.page handed over, else the place the address names, else the place
 * Home was last at on this Mac, and Recent the first time.
 */
function firstPlace(shown: string | null): HomePlace {
	if (shown !== null) return { team: shown, page: "projects" };
	const here = location.pathname === "/" ? null : macPlace(location.pathname);
	if (here !== null) return here;
	const kept = recall(HOME_PLACE, isPlace);
	return (kept === null ? null : macPlace(kept)) ?? RECENT_PLACE;
}

/**
 * Home's teams, wired: reads this Mac's teams once it is signed in, keeps which place Home shows in the address and
 * on this Mac, and hands Home its sidebar of places, its invite lines and, while a team is chosen, that team's page.
 */
export function useTeamHome(
	account: CloudAccountState,
	open: (url: string) => void,
	/** The team Home shows first: one a link at spool.page handed over, with none of its projects here yet. */
	shown: string | null,
	projects?: {
		/** The covers of a team's projects on this Mac, by its address, saying who is inside each; nothing for none. */
		covers: (address: string, here: TeamHere, sort: Sort) => ReactNode;
		/** This Mac's team copies, said as one string: when it changes, every team's list is read again. */
		copies?: string;
		/** New project, started in this team. */
		onNewProject: (team: CloudTeam) => void;
		/** The team's projects not on this Mac yet, to Get, among every team of this account's. */
		away?: (team: CloudTeam, here: TeamHere, teams: readonly CloudTeam[]) => ReactNode;
		/** This Mac's own projects, which a new team's setup list offers to move in. */
		own?: readonly OwnProject[];
		/** Today's Move to team… sheet, for this team. */
		onMoveIn?: (team: CloudTeam, project: OwnProject) => void;
		/** How many of the team's projects are on this Mac: when it changes, the setup list reads its facts again. */
		revision?: (address: string) => number;
		/** A line about a move's commit, kept above the covers until dismissed. */
		note?: ReactNode;
		/** The covers of a team this Mac only watches, as spool.page draws them, from its list; nothing for none. */
		watched?: (team: CloudTeam, listed: readonly TeamProjectOnMac[], here: TeamHere) => ReactNode;
	},
	/** Whether Home stands in the window, so the address is Home's to say; false while a project's tab is in front. */
	front = true,
	/** A team, or one project of it, handed over from spool.page's Export: exported once the teams are read. */
	exportAsked: { team: string; project: string | null } | null = null,
) {
	const teamActions = useContext(TeamsSourceContext);
	const exporting = useTeamExport(teamActions);
	const [teams, setTeams] = useState<CloudTeamsState>({ state: "unreachable" });
	const [place, setPlace] = useState<HomePlace>(() => firstPlace(shown));
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("Recent");
	const listed = teams.state === "ready" ? teams.teams : NO_TEAMS;
	const { lists, refresh: refreshLists } = useTeamLists(listed, projects?.copies ?? "");
	const [creating, setCreating] = useState(false);
	const signedIn = account.state === "signed-in" ? account.email : null;
	const refresh = useCallback(async () => setTeams(await teamActions.list()), [teamActions]);
	useEffect(() => {
		if (!signedIn) {
			setTeams({ state: "signed-out" });
			return;
		}
		void refresh();
		// An invite accepted in the browser, or a change made at spool.page/<team>, shows on coming back.
		const back = () => void refresh();
		window.addEventListener("focus", back);
		return () => window.removeEventListener("focus", back);
	}, [signedIn, refresh]);
	const ready = teams.state === "ready" ? teams : null;
	// the places are Home's once this account is in a team: before, Home is as it always was, at /
	const furnished = ready !== null && (ready.teams.length > 0 || (ready.deletedTeams ?? []).length > 0);
	const path = furnished ? pathOf(place) : "/";
	const frontRef = useRef(front && furnished);
	frontRef.current = front && furnished;
	/** Goes to a place: a new entry in the window's history while Home is in front, so back comes back here. */
	const go = useCallback((next: HomePlace, replace = false) => {
		setPlace(next);
		setQuery("");
		const to = pathOf(next);
		if (frontRef.current && to !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", to);
	}, []);
	// the address says where Home is, once it is in front and has its places
	useEffect(() => {
		if (front && furnished && location.pathname !== path) history.replaceState(null, "", path);
	}, [front, furnished, path]);
	// and this Mac keeps it, for the next launch
	useEffect(() => {
		if (furnished) keep(HOME_PLACE, path);
	}, [furnished, path]);
	// back and forward move between the places visited
	useEffect(() => {
		const moved = () => {
			const at = macPlace(location.pathname);
			if (at !== null) {
				setPlace(at);
				setQuery("");
			}
		};
		window.addEventListener("popstate", moved);
		return () => window.removeEventListener("popstate", moved);
	}, []);
	const { toast, onSetUp } = useSetUpToast((team) => go({ team: team.address, page: "people" }));
	const current = place.team === null ? null : (ready?.teams.find((team) => team.address === place.team) ?? null);
	// a deleted team its admin is looking at, until its purge: its page is Export all alone
	const deleted =
		current === null && place.team !== null
			? (ready?.deletedTeams?.find((team) => team.address === place.team) ?? null)
			: null;
	// a team left, purged or never this account's falls back to Recent
	useEffect(() => {
		if (furnished && place.team !== null && current === null && deleted === null) go(RECENT_PLACE, true);
	}, [furnished, place.team, current, deleted, go]);
	// spool.page's Export, handed over: the team is shown and its export asks for the folder, once
	const asked = useRef(exportAsked);
	useEffect(() => {
		const wanted = asked.current;
		if (wanted === null || ready === null) return;
		asked.current = null;
		const admin =
			ready.teams.some((team) => team.address === wanted.team && team.role === "admin") ||
			(ready.deletedTeams ?? []).some((team) => team.address === wanted.team);
		if (!admin) return;
		go({ team: wanted.team, page: "projects" });
		void exporting.start(wanted.team, wanted.project ?? undefined);
	}, [ready, exporting.start, go]);
	const here = useTeamHere(current?.address ?? null);
	const show = (address: string | null) => go(address === null ? OWN_PLACE : { team: address, page: "projects" });
	const searching = query.trim() !== "";
	if (!ready)
		return {
			places: undefined,
			notice: undefined,
			team: undefined,
			teams: new Set<string>(),
			editing: [] as CloudTeam[],
			all: NO_TEAMS,
			toast: undefined,
			show,
			everywhere: undefined,
			lists,
			refreshLists,
			origin: "",
			path,
			exportTeam: exporting.start,
			exportSurface: exporting.surface,
		};
	const page = current && !searching && place.team !== null ? place.page : null;
	const places = (
		<>
			<HomePlaces
				teams={ready.teams}
				deleted={ready.deletedTeams}
				current={current?.address ?? deleted?.address ?? null}
				page={page}
				onTeam={(address) => go({ team: address, page: "projects" })}
				onPage={(to) => current && go({ team: current.address, page: to })}
				own={{ current: place.page === "own" && !searching, onOwn: () => go(OWN_PLACE) }}
				onNewTeam={() => setCreating(true)}
			/>
			{creating && (
				<NewTeamDialog
					allowed={ready.mayCreateTeam}
					starts={ready.newTeam}
					origin={ready.origin}
					onCreate={async (name) => {
						const created = await teamActions.create(name, true);
						await refresh();
						go({ team: created.address, page: "projects" });
					}}
					onClose={() => setCreating(false)}
				/>
			)}
		</>
	);
	const notice =
		ready.invites.length > 0 ? (
			<div className="pj-invites -mt-[8px] mb-[22px] flex flex-col">
				{ready.invites.map((invite) => (
					<InviteLine
						key={invite.id}
						invite={invite}
						onDecline={async () => {
							await teamActions.decline(invite.id);
							await refresh();
						}}
						onJoin={async () => {
							const joined = await teamActions.accept(invite.id);
							await refresh();
							go({ team: joined.address, page: "projects" });
						}}
					/>
				))}
			</div>
		) : undefined;
	const total = current === null ? undefined : lists.get(current.address)?.length;
	const team =
		current && place.team !== null
			? {
					main:
						place.page === "people" ? (
							<TeamPeoplePage key={current.address} team={current} onChanged={() => void refresh()} />
						) : place.page === "settings" && current.role === "admin" ? (
							<TeamSettingsPage
								key={current.id}
								team={current}
								origin={ready.origin}
								tab={place.tab ?? "general"}
								onTab={(tab) => go({ team: current.address, page: "settings", tab }, true)}
								onOpen={open}
								onChanged={() => void refresh()}
								onMoved={(address) =>
									go({ team: address, page: "settings", ...(place.tab ? { tab: place.tab } : {}) }, true)
								}
								onDeleted={() => {
									go(OWN_PLACE, true);
									void refresh();
								}}
								onExport={exporting.start}
							/>
						) : current.role === "viewer" ? (
							<TeamProjects
								team={current}
								notice={
									<>
										<WatchLine team={current} />
										{notice}
									</>
								}
								covers={projects?.watched?.(current, lists.get(current.address) ?? [], here)}
								count={total === undefined ? undefined : { total }}
								empty={`${current.name} has no projects yet`}
								onOpen={open}
							/>
						) : (
							<TeamProjects
								team={current}
								notice={
									projects?.note ? (
										<>
											{projects.note}
											{notice}
										</>
									) : (
										notice
									)
								}
								covers={projects?.covers(current.address, here, sort)}
								count={total === undefined ? undefined : { total }}
								sort={{ value: sort, onChange: setSort }}
								away={projects?.away?.(current, here, ready.teams)}
								onRestored={refreshLists}
								onNewProject={projects && (() => projects.onNewProject(current))}
								onBilling={
									current.role === "admin"
										? () => go({ team: current.address, page: "settings", tab: "billing" })
										: undefined
								}
								setup={{
									on: "mac",
									you: signedIn ?? undefined,
									origin: ready.origin,
									own: projects?.own ?? [],
									onMove: (project) => projects?.onMoveIn?.(current, project),
									onOpen: open,
									onSetUp,
									revision: projects?.revision?.(current.address) ?? 0,
								}}
								onOpen={open}
							/>
						),
				}
			: deleted
				? { main: <DeletedTeamPage key={deleted.address} team={deleted} onExport={exporting.start} /> }
				: undefined;
	/** The teams this Mac edits in: their projects are on their own pages, not among this Mac's own. */
	const editing = ready.teams.filter((team) => team.role !== "viewer");
	return {
		/** The sidebar of places, once this account is in a team. */
		places: furnished ? places : undefined,
		notice,
		team,
		teams: new Set(editing.map((team) => team.address)),
		editing,
		all: ready.teams,
		toast,
		/** Home shows a team's page, by its address, or Your projects. */
		show,
		/** Every team's projects as spool.page lists them, by address, and a way to read them again. */
		lists,
		refreshLists,
		/** spool.page, where a team's projects open in a browser. */
		origin: ready.origin,
		/** Home's address: the place it shows. */
		path,
		/** A team, or one project of it, exported into a folder this Mac's admin picks. */
		exportTeam: exporting.start,
		/** The export's progress and what it ended in, shown wherever the window is. */
		exportSurface: exporting.surface,
		/** Search and Recent across every place, once this account is in a team. */
		everywhere: furnished
			? {
					recent: place.page === "recent",
					onRecent: () => go(RECENT_PLACE),
					query,
					onQuery: setQuery,
					onOwn: () => go(OWN_PLACE),
				}
			: undefined,
	};
}
