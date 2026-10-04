import { cn } from "shared/lib/utils";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CheckIcon, CloseIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { Count, Faces, Grid, Host, InviteField, Layout, MEMBERS, NavItem, OWN, PeopleList, Search, TEAM, TeamMark, TeamSwitch } from "./parts";

/**
 * DEV-121: the team's home in Spool Cloud, as three questions you pick between
 * one at a time. Each question is its own page under explore/cloud/home/.
 *
 *   sidebar  how a team shows in Home: a section beside your projects, or a switcher
 *   page     what a team's Home shows: its projects as covers, or what is happening now
 *   link     what a team project's link does in a browser: opens spool, or shows the team's page
 *
 * A team project is a folder on every member's Mac (DEV-112), so the app opens it
 * like any project and the browser can only look. Getting a team project onto a
 * new Mac is fog on the map, so "Get it" is drawn and goes nowhere.
 */

export interface TeamWalks {
	onOpen?: (() => void) | undefined;
	onInvite?: (() => void) | undefined;
}

/* ── sidebar: section ──────────────────────────────────────── */

/**
 * Every team you are in is its own block in the sidebar, under your own
 * projects. Two teams are drawn so the cost shows: the sidebar grows with them.
 */
export function SidebarSection({ invite = false, onOpen, onInvite }: { invite?: boolean } & TeamWalks) {
	return (
		<Host host="app">
			<Layout
				nav={
					<>
						<NavItem icon={<FrameIcon />} label="Your projects" count="2" />
						<TeamBlock name="Tidemark" hue="#2E5D70" current />
						<TeamBlock name="Northlight" hue="#6B4E2E" />
					</>
				}
				foot="On this Mac"
			>
				<TeamHeader title="Tidemark" onInvite={onInvite} />
				<Count n={TEAM.length} />
				<Grid projects={TEAM} onOpen={onOpen} />
			</Layout>
			{invite && <InviteSheet />}
		</Host>
	);
}

function TeamBlock({ name, hue, current = false }: { name: string; hue: string; current?: boolean }) {
	return (
		<>
			<div className="mt-[24px] mb-[4px] flex items-center gap-[10px] px-[12px]">
				<span className="grid h-[20px] w-[20px] place-items-center rounded-[5px] text-[11px] font-medium text-[#EDEDED]" style={{ background: hue }}>
					{name[0]}
				</span>
				<span className="type-control">{name}</span>
			</div>
			<NavItem label="Projects" indent current={current} />
			<NavItem label="People" indent count={current ? "4" : "2"} />
		</>
	);
}

/* ── sidebar: switcher ─────────────────────────────────────── */

/**
 * One team at a time. The switcher at the top of the sidebar picks it, and your
 * own projects are one more entry in it, so Home always shows one set of covers.
 */
export function SidebarSwitcher({ state = "home", onOpen, onInvite }: { state?: "home" | "menu" | "invite" } & TeamWalks) {
	return (
		<Host host="app">
			<Layout
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
						<NavItem label="People" count="4" />
					</>
				}
				foot="On this Mac"
			>
				<TeamHeader title="Projects" onInvite={onInvite} />
				<Count n={TEAM.length} />
				<Grid projects={TEAM} onOpen={onOpen} />
			</Layout>
			{state === "menu" && <SwitchMenu />}
			{state === "invite" && <InviteSheet />}
		</Host>
	);
}

function SwitchMenu() {
	return (
		<div className="absolute top-[78px] left-[16px] z-30 w-[260px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]">
			<MenuRow mark={<TeamMark />} label="Tidemark" detail="4 people" checked />
			<MenuRow mark={<span className="grid h-[20px] w-[20px] place-items-center rounded-[5px] bg-[#6B4E2E] text-[11px] font-medium text-[#EDEDED]">N</span>} label="Northlight" detail="2 people" />
			<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
			<MenuRow mark={<FrameIcon className="h-[16px] w-[16px] text-muted" />} label="Your projects" detail={`${OWN.length} on this Mac`} />
			<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
			<MenuRow mark={<PlusIcon className="h-[10px] w-[10px] text-muted" />} label="New team…" />
		</div>
	);
}

function MenuRow({ mark, label, detail, checked = false }: { mark: React.ReactNode; label: string; detail?: string; checked?: boolean }) {
	return (
		<div className={cn("flex h-[36px] items-center gap-[10px] rounded-[6px] px-[9px] hover:bg-surface", checked && "bg-surface")}>
			<span className="grid w-[20px] place-items-center">{mark}</span>
			<span className="flex-1 type-control">{label}</span>
			{detail && <span className="text-muted type-detail">{detail}</span>}
			{checked && <CheckIcon className="h-[12px] w-[12px] text-text" />}
		</div>
	);
}

/* ── shared ────────────────────────────────────────────────── */

function TeamHeader({ title, onInvite }: { title: string; onInvite?: (() => void) | undefined }) {
	return (
		<header className="mb-[31px] flex items-center justify-between gap-[25px]">
			<div className="flex items-center gap-[16px]">
				<h1 className="type-page">{title}</h1>
				<Faces ids={MEMBERS.map((person) => person.id)} />
			</div>
			<div className="flex items-center gap-[13px]">
				<Search placeholder="Search Tidemark" />
				<button type="button" className={HOME_ACTION} onClick={onInvite}>
					Invite
				</button>
				<button type="button" className={HOME_ACTION_PRIMARY}>
					<PlusIcon className="h-[10px] w-[10px]" />
					New project…
				</button>
			</div>
		</header>
	);
}

function InviteSheet() {
	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-[color-mix(in_oklab,var(--color-bg)_72%,transparent)] pt-[110px]">
			<div className="w-[500px] rounded-[10px] border border-border-raised bg-surface p-[26px]">
				<div className="mb-[6px] flex items-center justify-between">
					<h2 className="type-heading">Invite to Tidemark</h2>
					<CloseIcon className="h-[10px] w-[10px] text-muted" />
				</div>
				<p className="mb-[22px] text-muted type-control">They can open and change every Tidemark project.</p>
				<InviteField />
				<div className="mt-[22px] border-border-raised border-t pt-[8px]">
					<PeopleList where />
				</div>
			</div>
		</div>
	);
}

/* ── link: the team's page in a browser ────────────────────── */

/** spool.page/tidemark: the switcher's Home again, minus what only lives on your Mac. */
export function LinkTeamPage({ onOpen }: TeamWalks) {
	return (
		<Host host="web" url="spool.page/tidemark">
			<Layout
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
						<NavItem label="People" count="4" />
					</>
				}
				foot="ada@tidemark.app"
				web
			>
				<header className="mb-[31px] flex items-center justify-between">
					<div className="flex items-center gap-[16px]">
						<h1 className="type-page">Projects</h1>
						<Faces ids={MEMBERS.map((person) => person.id)} />
					</div>
					<button type="button" className={HOME_ACTION}>
						Invite
					</button>
				</header>
				<Count n={TEAM.length} />
				<Grid projects={TEAM} onOpen={onOpen} web />
			</Layout>
		</Host>
	);
}
