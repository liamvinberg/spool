import { type ReactNode, useState } from "react";
import { cn } from "shared/lib/utils";
import { EmptyFramesIcon, EmptyState } from "./empty-state";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "./home-actions";
import { CheckIcon, ChevronIcon, CogIcon, FrameIcon, PeopleIcon, PlusIcon } from "./icons";

/**
 * Home's teams, as src/ui/teams.tsx draws them: the switcher, the invite line, and a team's Projects,
 * People and Settings. The daemon's answers are the fixture below.
 */

export type TeamRole = "admin" | "editor" | "viewer";
export interface Team {
	id: string;
	address: string;
	name: string;
	role: TeamRole;
	logo: string | null;
	people: number;
}
export interface Invite {
	id: string;
	team: { address: string; name: string; logo: string | null };
	role: TeamRole;
	invitedBy: string;
}
export interface Person {
	accountId: string;
	email: string;
	role: TeamRole;
	you: boolean;
}
export interface Invited {
	id: string;
	email: string;
	role: TeamRole;
	invitedBy: string;
	left: string | null;
}

export const TEAMS: Team[] = [
	{ id: "h", address: "harbour-bank", name: "Harbour Bank", role: "viewer", logo: null, people: 6 },
	{ id: "n", address: "northlight", name: "Northlight", role: "editor", logo: null, people: 2 },
	{ id: "t", address: "tidemark", name: "Tidemark", role: "admin", logo: null, people: 5 },
];
export const TIDEMARK = TEAMS[2] as Team;
export const INVITE: Invite = {
	id: "i",
	team: { address: "kaffe-co", name: "Kaffe Co", logo: null },
	role: "editor",
	invitedBy: "kim@kaffe.co",
};
export const PEOPLE: Person[] = [
	{ accountId: "ada", email: "ada@tidemark.app", role: "admin", you: true },
	{ accountId: "jonas", email: "jonas@tidemark.app", role: "admin", you: false },
	{ accountId: "mira", email: "mira@tidemark.app", role: "editor", you: false },
	{ accountId: "sam", email: "sam@tidemark.app", role: "editor", you: false },
	{ accountId: "lena", email: "lena@harbourbank.se", role: "viewer", you: false },
];
export const INVITED: Invited[] = [
	{ id: "1", email: "noor@tidemark.app", role: "editor", invitedBy: "ada@tidemark.app", left: "5 days left" },
	{ id: "2", email: "felix@tidemark.app", role: "editor", invitedBy: "jonas@tidemark.app", left: null },
];

export const ROLE_LABEL: Record<TeamRole, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };
const HUES = ["#2E5D70", "#6B4E2E", "#4E3F70", "#2F6150", "#70393F"];
const MENU_ROW = "flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[9px] text-left text-text type-control hover:bg-surface";
const RULE = <div className="mx-[8px] my-[5px] h-px bg-border-raised" />;

export function TeamMark({ team, size = 20 }: { team: { address: string; name: string; logo: string | null }; size?: number }) {
	if (team.logo) return <img src={team.logo} alt="" className="shrink-0 rounded-[5px] object-cover" style={{ width: size, height: size }} />;
	const hue = HUES[[...team.address].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % HUES.length];
	return (
		<span aria-hidden="true" className="grid shrink-0 place-items-center rounded-[5px] font-medium text-[#EDEDED]" style={{ width: size, height: size, background: hue, fontSize: Math.round(size * 0.52) }}>
			{[...team.name][0]?.toUpperCase()}
		</span>
	);
}

function OwnMark() {
	return (
		<span className="grid h-[20px] w-[20px] shrink-0 place-items-center text-muted">
			<FrameIcon className="h-[16px] w-[16px]" />
		</span>
	);
}

export function TeamSwitcher({ current, open: initiallyOpen = false, onSelect }: { current: Team | null; open?: boolean; onSelect?: (team: Team | null) => void }) {
	const [open, setOpen] = useState(initiallyOpen);
	return (
		<div className="pj-team-switch relative mb-[18px]">
			<button
				type="button"
				className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface aria-expanded:bg-surface"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
			>
				{current ? <TeamMark team={current} /> : <OwnMark />}
				<span className="min-w-0 flex-1 truncate type-control">{current ? current.name : "Your projects"}</span>
				<ChevronIcon className="h-[10px] w-[10px] shrink-0 rotate-90 text-muted" />
			</button>
			{open && (
				<div className="absolute top-[calc(100%+6px)] left-0 z-30 w-[260px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]">
					{TEAMS.map((team) => (
						<button
							key={team.id}
							type="button"
							className={cn(MENU_ROW, team.address === current?.address && "bg-surface")}
							onClick={() => {
								setOpen(false);
								if (team.role !== "viewer") onSelect?.(team);
							}}
						>
							<TeamMark team={team} />
							<span className="min-w-0 flex-1 truncate">{team.name}</span>
							<span className="shrink-0 text-muted type-detail">{team.role === "viewer" ? "viewer ↗" : `${team.people} people`}</span>
							{team.address === current?.address && <CheckIcon className="h-[12px] w-[12px] shrink-0" />}
						</button>
					))}
					{RULE}
					<button type="button" className={cn(MENU_ROW, !current && "bg-surface")} onClick={() => { setOpen(false); onSelect?.(null); }}>
						<OwnMark />
						<span className="min-w-0 flex-1 truncate">Your projects</span>
						{!current && <CheckIcon className="h-[12px] w-[12px] shrink-0" />}
					</button>
					{RULE}
					<button type="button" className={MENU_ROW}>
						<span className="grid w-[20px] place-items-center text-muted">
							<PlusIcon className="h-[10px] w-[10px]" />
						</span>
						<span className="flex-1">New team…</span>
					</button>
				</div>
			)}
		</div>
	);
}

export function InviteLine({ invite = INVITE }: { invite?: Invite }) {
	return (
		<div className="pj-invites -mt-[8px] mb-[22px] flex flex-col">
			<div className="pj-invite-line flex min-h-[48px] items-center gap-[12px] border-border border-y py-[8px]">
				<TeamMark team={invite.team} />
				<span className="min-w-0 flex-1 type-control">
					{invite.invitedBy} invited you to {invite.team.name}.{" "}
					<span className="text-muted">{invite.role === "viewer" ? "You’d watch their projects live in the browser." : "You’d join as an editor."}</span>
				</span>
				<button type="button" className="px-[10px] text-muted type-control hover:text-text">
					Decline
				</button>
				<button type="button" className={cn(HOME_ACTION, "min-h-[30px]")}>
					Join {invite.team.name}
				</button>
			</div>
		</div>
	);
}

export type TeamPage = "projects" | "people" | "settings";

export function TeamNav({ team, page, onPage }: { team: Team; page: TeamPage; onPage?: (page: TeamPage) => void }) {
	const item = (to: TeamPage, icon: ReactNode, label: string, count?: number) => (
		<button
			type="button"
			className="pj-navigation-item flex h-[38px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left text-muted type-control [&:hover]:bg-surface [&:hover]:text-text aria-[current=page]:bg-surface aria-[current=page]:text-text [&>svg]:h-[16px] [&>svg]:w-[16px] [&>svg]:shrink-0"
			aria-current={page === to ? "page" : undefined}
			onClick={() => onPage?.(to)}
		>
			{icon}
			<span className="flex-1">{label}</span>
			{count !== undefined && <span className="text-muted type-detail">{count}</span>}
		</button>
	);
	return (
		<>
			{item("projects", <FrameIcon />, "Projects")}
			{item("people", <PeopleIcon />, "People", team.people)}
			{team.role === "admin" && item("settings", <CogIcon />, "Settings")}
		</>
	);
}

/** A team's projects on this Mac, one cover per team project however many local copies it has, and New project in the team. */
export function TeamProjects({
	team,
	notice,
	covers,
	away,
	onNewProject,
}: {
	team: Team;
	notice?: ReactNode;
	covers?: ReactNode;
	/** The team's projects not on this Mac yet, dimmed with "Get it". */
	away?: ReactNode;
	onNewProject?: () => void;
}) {
	return (
		<>
			<header className="pj-heading mb-[31px] flex h-[35px] items-center justify-between gap-[25px]">
				<h1 className="type-page font-medium">Projects</h1>
				<button type="button" className={cn("home-action home-action-primary h-[35px]", HOME_ACTION_PRIMARY)} onClick={onNewProject}>
					<PlusIcon className="h-[10px] w-[10px]" />
					New project…
				</button>
			</header>
			{notice}
			{covers ?? (away ? null : <EmptyState className="min-h-[420px] p-[35px] [&>p]:mt-0" icon={<EmptyFramesIcon />} title={`${team.name} has no projects on this Mac yet`} />)}
			{away}
		</>
	);
}

function Face({ email }: { email: string }) {
	return (
		<span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-control text-text uppercase type-detail" aria-hidden="true">
			{email.slice(0, 1)}
		</span>
	);
}

/** People as an admin sees them; `menu` opens one row's role menu. */
export function TeamPeoplePage({ team, menu = null }: { team: Team; menu?: string | null }) {
	return (
		<div className="pj-team-people max-w-[880px]">
			<header className="pj-heading mb-[10px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">People</h1>
			</header>
			<p className="mb-[22px] text-muted type-detail">{PEOPLE.length} people</p>
			<div className="mb-[22px] flex items-center gap-[10px]">
				<span className="flex h-[38px] min-w-0 flex-1 items-center rounded-[7px] border border-border-raised bg-bg px-[11px] text-muted type-control">Email address</span>
				<span className="flex h-[38px] items-center rounded-[7px] border border-border-raised px-[9px] type-control">as Editor</span>
				<button type="button" className={cn(HOME_ACTION_PRIMARY, "h-[38px]")}>
					Invite
				</button>
			</div>
			<ul className="flex flex-col border-border border-b">
				{PEOPLE.map((person) => (
					<li key={person.accountId} className="flex h-[58px] items-center gap-[14px] border-border border-t">
						<Face email={person.email} />
						<span className="min-w-0 flex-1 truncate type-control">
							{person.email}
							{person.you && <span className="text-muted"> (you)</span>}
						</span>
						<span className="relative shrink-0">
							<button
								type="button"
								aria-expanded={menu === person.accountId}
								className="flex h-[30px] items-center gap-[8px] rounded-[6px] border border-transparent px-[10px] type-control hover:border-border-raised aria-expanded:border-border-raised aria-expanded:bg-raised"
							>
								{ROLE_LABEL[person.role]}
								<ChevronIcon className="h-[9px] w-[9px] rotate-90 text-muted" />
							</button>
							{menu === person.accountId && (
								<div className="absolute top-[36px] right-0 z-30 w-[220px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]">
									{(["admin", "editor", "viewer"] as const).map((role) => (
										<button key={role} type="button" className={MENU_ROW}>
											<span className="w-[14px] shrink-0">{role === person.role && <CheckIcon className="h-[12px] w-[12px]" />}</span>
											{ROLE_LABEL[role]}
										</button>
									))}
									{RULE}
									<button type="button" className={cn(MENU_ROW, "pl-[33px] text-thread")}>
										{person.you ? `Leave ${team.name}` : `Remove from ${team.name}`}
									</button>
								</div>
							)}
						</span>
					</li>
				))}
			</ul>
			<h2 className="mt-[34px] mb-[8px] flex items-baseline gap-[10px] type-title">
				Invited <span className="text-muted type-detail">{INVITED.length}</span>
			</h2>
			<ul className="flex flex-col">
				{INVITED.map((invite) => (
					<li key={invite.id} className="flex h-[58px] items-center gap-[14px] border-border border-t">
						<span className="h-[30px] w-[30px] shrink-0 rounded-full border border-muted/60 border-dashed" />
						<span className="flex min-w-0 flex-1 flex-col">
							<span className={cn("truncate type-control", !invite.left && "text-muted")}>{invite.email}</span>
							<span className="truncate text-muted type-detail">
								{ROLE_LABEL[invite.role].toLowerCase()} · {invite.left ? `sent by ${invite.invitedBy} · ${invite.left}` : "expired"}
							</span>
						</span>
						<button type="button" className="h-[28px] rounded-[6px] px-[8px] text-muted type-control hover:bg-raised hover:text-text">
							Resend
						</button>
						<button type="button" className="h-[28px] rounded-[6px] px-[8px] text-muted type-control hover:bg-raised hover:text-text">
							Cancel
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

export function TeamSettingsPage({ team }: { team: Team }) {
	const row = (label: string, says: string | null, control: ReactNode, top = true) => (
		<div className={cn("flex items-center justify-between gap-[40px] py-[18px]", top && "border-border border-t")}>
			<span className="flex min-w-0 flex-col gap-[4px]">
				<span className="type-control">{label}</span>
				{says && <span className="max-w-[400px] text-muted type-label">{says}</span>}
			</span>
			<span className="flex shrink-0 items-center gap-[8px]">{control}</span>
		</div>
	);
	const field = "h-[34px] rounded-[7px] border border-border-raised bg-bg px-[11px] text-text type-control";
	return (
		<div className="pj-team-settings max-w-[720px]">
			<header className="pj-heading mb-[28px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">Settings</h1>
			</header>
			{row(
				"Logo",
				"Shows in the switcher and on the team’s page.",
				<>
					<TeamMark team={team} size={40} />
					<button type="button" className={cn(HOME_ACTION, "ml-[8px]")}>
						Upload…
					</button>
					<button type="button" className={HOME_ACTION} disabled>
						Remove
					</button>
				</>,
				false,
			)}
			{row(
				"Name",
				null,
				<>
					<span className={cn(field, "flex w-[240px] items-center")}>{team.name}</span>
					<button type="button" className={HOME_ACTION} disabled>
						Save
					</button>
				</>,
			)}
			{row(
				"Address",
				null,
				<>
					<span className={cn(field, "flex w-[260px] items-center")}>
						<span className="text-muted type-value">spool.page/</span>
						<span className="type-value">{team.address}</span>
					</span>
					<button type="button" className={HOME_ACTION} disabled>
						Save
					</button>
				</>,
			)}
			{row(
				"Delete team",
				"Everyone loses access at once. Gone for good after 30 days.",
				<button type="button" className="inline-flex h-[34px] items-center rounded-[7px] border border-thread/50 px-[13px] text-thread type-control hover:bg-thread/10">
					Delete {team.name}…
				</button>,
			)}
		</div>
	);
}
