import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
	type BillingCycle,
	type CloudAccountState,
	type CloudTeam,
	type CloudTeamInvite,
	type CloudTeamsState,
	daemonTeams,
	type HerePerson,
	type PeopleBilling,
	type TeamPeople,
	type TeamRole,
} from "./api";
import { cn } from "./cn";
import { ConfirmDialog } from "./confirm-dialog";
import { ChevronIcon, CogIcon, FrameIcon, PeopleIcon, PlusIcon } from "./icons";
import { Button } from "./primitives/actions";
import { EmptyFrames, EmptyState } from "./primitives/feedback";
import { Field, TextField } from "./primitives/inputs";
import { NavItem, Tab, Tabs } from "./primitives/navigation";
import { Menu, MenuItem, MenuSeparator } from "./primitives/overlays";
import { BILLING_STATES, money, TeamBilling } from "./team-billing";
import { TeamFailing } from "./team-failing";
import { TeamLapsed } from "./team-lapsed";
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
export type TeamPage = "projects" | "people" | "settings";
/** Settings' tabs: General is the team itself; Billing, for admins, is what it pays. */
export type SettingsTab = "general" | "billing";

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
 * One team at a time: the switcher picks it. On a Mac your own projects are one more entry, and a team you only
 * watch opens in the browser, since its projects never come to this Mac. In a browser every team is a place.
 */
export function TeamSwitcher({
	teams,
	current,
	onSelect,
	onNewTeam,
	onMac = true,
}: {
	teams: ReadyTeams;
	current: CloudTeam | null;
	onSelect: (address: string | null) => void;
	onNewTeam: () => void;
	/** In the Mac app, beside the Mac's own projects; false at spool.page/<team>. */
	onMac?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const choose = (address: string | null) => {
		setOpen(false);
		onSelect(address);
	};
	return (
		<div className="pj-team-switch relative mb-[18px] [@media(max-width:720px)]:hidden">
			<button
				type="button"
				className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-line-strong px-[10px] text-left hover:bg-surface-panel aria-expanded:bg-surface-panel"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={() => setOpen(!open)}
			>
				{current ? <TeamMark team={current} /> : <OwnMark />}
				<span className="min-w-0 flex-1 truncate type-control">{current ? current.name : "Your projects"}</span>
				<span className="h-[10px] w-[10px] shrink-0 rotate-90 text-secondary [&>svg]:h-full [&>svg]:w-full">
					<ChevronIcon />
				</span>
			</button>
			{open && (
				<>
					<button
						type="button"
						className="fixed inset-0 z-20 cursor-default"
						aria-label="Close menu"
						onClick={() => setOpen(false)}
					/>
					<Menu className="absolute top-[calc(100%+6px)] left-0 z-30">
						{teams.teams.map((team) =>
							onMac && team.role === "viewer" ? (
								<MenuItem
									key={team.id}
									href={`${teams.origin}/${team.address}`}
									target="_blank"
									rel="noreferrer"
									icon={<TeamMark team={team} size={16} />}
									label={team.name}
									meta="viewer ↗"
									onClick={() => setOpen(false)}
								/>
							) : (
								<MenuItem
									key={team.id}
									icon={<TeamMark team={team} size={16} />}
									label={team.name}
									meta={`${team.people} ${team.people === 1 ? "person" : "people"}`}
									aria-current={team.address === current?.address || undefined}
									className="aria-[current]:bg-state-selected-strong"
									onClick={() => choose(team.address)}
								/>
							),
						)}
						{onMac && (
							<>
								{teams.teams.length > 0 && <MenuSeparator />}
								<MenuItem
									icon={<FrameIcon className="size-4" />}
									label="Your projects"
									aria-current={!current || undefined}
									className="aria-[current]:bg-state-selected-strong"
									onClick={() => choose(null)}
								/>
							</>
						)}
						{(onMac || teams.teams.length > 0) && <MenuSeparator />}
						<MenuItem
							icon={<PlusIcon />}
							label="New team…"
							onClick={() => {
								setOpen(false);
								onNewTeam();
							}}
						/>
					</Menu>
				</>
			)}
		</div>
	);
}

function OwnMark() {
	return (
		<span className="grid h-[20px] w-[20px] shrink-0 place-items-center text-secondary">
			<FrameIcon className="h-[16px] w-[16px]" />
		</span>
	);
}

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

/** A team's nav under the switcher: Projects, People, and Settings for admins. */
export function TeamNav({ team, page, onPage }: { team: CloudTeam; page: TeamPage; onPage: (page: TeamPage) => void }) {
	const item = (to: TeamPage, icon: ReactNode, label: string, count?: number) => (
		<NavItem icon={icon} label={label} meta={count} current={page === to} onClick={() => onPage(to)} />
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
	setup,
	onOpen,
	empty = `${team.name} has no projects on this Mac yet`,
}: {
	team: CloudTeam;
	/**
	 * Opens Stripe's Checkout from a lapsed team's dialog, or its portal from a failing team's line: this tab in a
	 * browser, the system browser from the Mac.
	 */
	onOpen: (url: string) => void;
	/** What it says with no covers and nothing away. */
	empty?: string;
	notice?: ReactNode;
	/** The covers of the team's projects on this Mac, if there are any. */
	covers?: ReactNode;
	/** The team's projects not on this Mac yet, dimmed with "Get it". */
	away?: ReactNode;
	onNewProject?: (() => void) | undefined;
	/** Where the setup list is drawn, for a new team's admins; no list without it. */
	setup?: SetupHost | undefined;
}) {
	const [listing, setListing] = useState(false);
	return (
		<>
			<header className="pj-heading mb-[31px] flex h-[35px] items-center justify-between gap-[25px]">
				<h1 className="type-page font-medium">Projects</h1>
				{onNewProject && (
					<Button size="lg" variant="primary" icon={<PlusIcon />} onClick={onNewProject}>
						New project…
					</Button>
				)}
			</header>
			<TeamLapsed team={team} onOpen={onOpen} />
			<TeamFailing team={team} onOpen={onOpen} />
			{notice}
			{setup && <TeamSetupList key={team.address} team={team} host={setup} onShowing={setListing} />}
			{covers ??
				(away || listing ? null : (
					<EmptyState className="min-h-[420px] justify-center p-[35px]" art={<EmptyFrames />} title={empty} />
				))}
			{away}
		</>
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
				title: person.you ? "Make yourself a viewer?" : `Make ${person.email} a viewer?`,
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
						title: `Remove ${person.email} from ${team.name}?`,
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
						<Initial email={person.email} />
						<span className="min-w-0 flex-1 truncate type-control">
							{person.email}
							{person.you && <span className="text-secondary"> (you)</span>}
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
 * they join, charged at once for the year's days left or added to the next monthly invoice. Null when it adds none.
 */
export function seatCost(billing: PeopleBilling | undefined, role: TeamRole, email: string): string | null {
	if (!billing || role === "viewer" || billing.cycle === null || billing.seatPrice === null) return null;
	if (!BILLING_STATES[billing.state].paid) return null;
	// the name before the address's first `.`, `_` or `+`: noor.k@ is Noor
	const local = email.trim().split("@")[0]?.split(/[._+]/u)[0] ?? "";
	const who = local ? `${local.charAt(0).toUpperCase()}${local.slice(1)}` : "they";
	const when =
		billing.cycle === "yearly"
			? `charged for the days left this year once ${who} ${local ? "joins" : "join"}`
			: `added to the next invoice once ${who} ${local ? "joins" : "join"}`;
	return `An ${role} is one more seat: ${money(billing.seatPrice)} a month, ${when}.`;
}

function daysLeft(expiresAt: number): string {
	const days = Math.max(1, Math.ceil((expiresAt * 1000 - Date.now()) / 86_400_000));
	return days === 1 ? "1 day left" : `${days} days left`;
}

/** A member's face: the first letter of their address, as there are no display names. */
function Initial({ email }: { email: string }) {
	return (
		<span
			className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-control text-primary uppercase type-detail"
			aria-hidden="true"
		>
			{email.slice(0, 1)}
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
	const cost = seatCost(billing, role, email);
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
				<TeamGeneral team={team} origin={origin} onChanged={onChanged} onMoved={onMoved} onDeleted={onDeleted} />
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
}: {
	team: CloudTeam;
	origin: string;
	onChanged: () => void;
	onMoved: (address: string) => void;
	onDeleted: () => void;
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
				"Shows in the switcher and on the team’s page.",
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
					description="Everyone loses access at once. Gone for good after 30 days."
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

/** "New team…": a name, and spool.page decides whether this account may start one yet. */
export function NewTeamDialog({
	allowed,
	onCreate,
	onClose,
}: {
	allowed: boolean;
	onCreate: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
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
			confirmLabel="Create team"
			disabled={name.trim() === ""}
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

/**
 * Home's teams, wired: reads this Mac's teams once it is signed in, keeps which one Home shows, and hands
 * Home its switcher, its invite lines and, while a team is chosen, that team's nav and page.
 */
export function useTeamHome(
	account: CloudAccountState,
	open: (url: string) => void,
	/** The team Home shows first: one a link at spool.page handed over, with none of its projects here yet. */
	shown: string | null,
	projects?: {
		/** The covers of a team's projects on this Mac, by its address, saying who is inside each; nothing for none. */
		covers: (address: string, here: TeamHere) => ReactNode;
		/** New project, started in this team. */
		onNewProject: (team: CloudTeam) => void;
		/** The team's projects not on this Mac yet, to Get. */
		away?: (team: CloudTeam, here: TeamHere) => ReactNode;
		/** This Mac's own projects, which a new team's setup list offers to move in. */
		own?: readonly OwnProject[];
		/** Today's Move to team… sheet, for this team. */
		onMoveIn?: (team: CloudTeam, project: OwnProject) => void;
		/** Changes when the team's projects on this Mac do, so the setup list reads its facts again. */
		revision?: (address: string) => string;
	},
) {
	const teamActions = useContext(TeamsSourceContext);
	const [teams, setTeams] = useState<CloudTeamsState>({ state: "unreachable" });
	const [scope, setScope] = useState<string | null>(shown);
	const [page, setPage] = useState<TeamPage>("projects");
	const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
	const [creating, setCreating] = useState(false);
	const { toast, onSetUp } = useSetUpToast((team) => {
		setScope(team.address);
		setPage("people");
	});
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
	const current = ready?.teams.find((team) => team.address === scope && team.role !== "viewer") ?? null;
	const here = useTeamHere(current?.address ?? null);
	const select = (address: string | null) => {
		setScope(address);
		setPage("projects");
		setSettingsTab("general");
	};
	if (!ready)
		return {
			switcher: undefined,
			notice: undefined,
			team: undefined,
			teams: new Set<string>(),
			editing: [] as CloudTeam[],
			all: NO_TEAMS,
			toast: undefined,
		};
	const switcher = (
		<>
			<TeamSwitcher teams={ready} current={current} onSelect={select} onNewTeam={() => setCreating(true)} />
			{creating && (
				<NewTeamDialog
					allowed={ready.mayCreateTeam}
					onCreate={async (name) => {
						const created = await teamActions.create(name);
						await refresh();
						select(created.address);
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
							if (joined.role === "viewer") open(`${ready.origin}/${joined.address}`);
							else select(joined.address);
						}}
					/>
				))}
			</div>
		) : undefined;
	const team = current
		? {
				nav: (
					<TeamNav
						team={current}
						page={page}
						onPage={(to) => {
							setPage(to);
							setSettingsTab("general");
						}}
					/>
				),
				main:
					page === "people" ? (
						<TeamPeoplePage key={current.address} team={current} onChanged={() => void refresh()} />
					) : page === "settings" && current.role === "admin" ? (
						<TeamSettingsPage
							key={current.id}
							team={current}
							origin={ready.origin}
							tab={settingsTab}
							onTab={setSettingsTab}
							onOpen={open}
							onChanged={() => void refresh()}
							onMoved={(address) => setScope(address)}
							onDeleted={() => {
								select(null);
								void refresh();
							}}
						/>
					) : (
						<TeamProjects
							team={current}
							notice={notice}
							covers={projects?.covers(current.address, here)}
							away={projects?.away?.(current, here)}
							onNewProject={projects && (() => projects.onNewProject(current))}
							setup={{
								on: "mac",
								you: signedIn ?? "",
								origin: ready.origin,
								own: projects?.own ?? [],
								onMove: (project) => projects?.onMoveIn?.(current, project),
								onOpen: open,
								onSetUp,
								revision: projects?.revision?.(current.address) ?? "",
							}}
							onOpen={open}
						/>
					),
			}
		: undefined;
	/** The teams the switcher offers: their projects are on their own pages, not among this Mac's own. */
	const editing = ready.teams.filter((team) => team.role !== "viewer");
	return {
		switcher,
		notice,
		team,
		teams: new Set(editing.map((team) => team.address)),
		editing,
		all: ready.teams,
		toast,
	};
}
