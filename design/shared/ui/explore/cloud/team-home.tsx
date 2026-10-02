import { cn } from "shared/lib/utils";
import type { ReactNode } from "react";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import type { Artwork } from "shared/ui/demo/home-data";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { Arrow } from "shared/ui/spool/home";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { ChevronIcon, CloseIcon, FrameIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * DEV-121: where a team lives, in the app and in the browser.
 *
 * Three takes on one question, each drawn in three states:
 *   section  the app is the team's home; the team is a section beside your own
 *            projects, and the browser is only a door into the app
 *   web      spool.page is the team's home; the app lists team projects with your
 *            own and sends you to the web to manage people
 *   same     one home in both places, scoped by a team switcher; the browser
 *            copy is the app's Home without the folders on your Mac
 *
 * A team project is still a folder on every member's Mac (DEV-112), so the app
 * opens it like any project. The browser can only look. Joining a project that
 * is not on this Mac yet is fog on the map, so "Get it" is drawn and goes nowhere.
 */

export type TeamTake = "section" | "web" | "same";

interface Member {
	name: string;
	initials: string;
	hue: string;
	email: string;
	role: "Owner" | "Member";
}

interface TeamProject {
	name: string;
	art: Artwork;
	frames: number;
	edited: string;
	here: string[];
	onMac: boolean;
}

const MEMBERS: Member[] = [
	{ name: "Ada Lind", initials: "AL", hue: "#C98B5E", email: "ada@tidemark.app", role: "Owner" },
	{ name: "Jonas Berg", initials: "JB", hue: "#6F9BC9", email: "jonas@tidemark.app", role: "Member" },
	{ name: "Mira Koskinen", initials: "MK", hue: "#8DB07A", email: "mira@tidemark.app", role: "Member" },
	{ name: "Sam Okafor", initials: "SO", hue: "#B48BC4", email: "sam@tidemark.app", role: "Member" },
];

const TEAM_PROJECTS: TeamProject[] = [
	{ name: "tidemark app", art: "studio", frames: 64, edited: "Jonas, just now", here: ["JB", "MK"], onMac: true },
	{ name: "tidemark site", art: "system", frames: 21, edited: "you, 2 hours ago", here: [], onMac: true },
	{ name: "onboarding", art: "notes", frames: 14, edited: "Mira, yesterday", here: ["SO"], onMac: true },
	{ name: "brand refresh", art: "slack", frames: 9, edited: "Sam, 3 days ago", here: [], onMac: false },
];

const OWN_PROJECTS: TeamProject[] = [
	{ name: "tvärsö", art: "coast", frames: 24, edited: "today", here: [], onMac: true },
	{ name: "kaffe", art: "coffee", frames: 18, edited: "yesterday", here: [], onMac: true },
];

export function TeamHome({
	take,
	host,
	invite = false,
	onOpen,
	onInvite,
	onWeb,
}: {
	take: TeamTake;
	host: "app" | "web";
	invite?: boolean;
	onOpen?: (() => void) | undefined;
	onInvite?: (() => void) | undefined;
	onWeb?: (() => void) | undefined;
}) {
	const body =
		take === "section" ? (
			host === "app" ? <SectionApp onOpen={onOpen} onInvite={onInvite} /> : <SectionDoor />
		) : take === "web" ? (
			host === "app" ? <WebApp onOpen={onOpen} onWeb={onWeb} /> : <WebDashboard invite={invite} onInvite={onInvite} />
		) : (
			<SameHome host={host} onOpen={onOpen} onInvite={onInvite} />
		);
	const sheet = invite && take !== "web" ? <InviteSheet /> : null;

	if (host === "web") {
		return (
			<PlayedTab title="Tidemark · spool" url={take === "web" && invite ? "spool.page/tidemark/people" : "spool.page/tidemark"} sibling="Slack">
				<div className="relative h-full bg-bg text-text">
					{body}
					{sheet}
				</div>
			</PlayedTab>
		);
	}
	return (
		<SpoolShell canvasControls={false} tabs={["tidemark app", "kaffe"]}>
			<div className="relative h-full">
				{body}
				{sheet}
			</div>
		</SpoolShell>
	);
}

/* ── take: section ─────────────────────────────────────────── */

function SectionApp({ onOpen, onInvite }: { onOpen?: (() => void) | undefined; onInvite?: (() => void) | undefined }) {
	return (
		<Layout
			nav={
				<>
					<NavItem icon={<FrameIcon />} label="Projects" />
					<div className="mt-[26px] mb-[8px] flex items-center gap-[10px] px-[12px]">
						<TeamMark />
						<span className="type-control text-text">Tidemark</span>
					</div>
					<NavItem label="Projects" indent current />
					<NavItem label="People" indent count="4" />
				</>
			}
			foot="On this Mac"
		>
			<header className="mb-[31px] flex items-center justify-between gap-[25px]">
				<div className="flex items-center gap-[16px]">
					<h1 className="type-page">Tidemark</h1>
					<Faces ids={MEMBERS.map((member) => member.initials)} />
				</div>
				<div className="flex items-center gap-[13px]">
					<Search placeholder="Search Tidemark" />
					<button type="button" className={HOME_ACTION} onClick={onInvite}>
						Invite
					</button>
					<button type="button" className={HOME_ACTION_PRIMARY}>
						<PlusIcon className="h-[10px] w-[10px]" />
						New team project…
					</button>
				</div>
			</header>
			<Count n={TEAM_PROJECTS.length} />
			<Grid projects={TEAM_PROJECTS} onOpen={onOpen} />
		</Layout>
	);
}

function SectionDoor() {
	return (
		<div className="flex h-full items-start justify-center overflow-auto px-[48px] pt-[96px]">
			<div className="w-[560px]">
				<div className="mb-[40px] flex items-center gap-[10px] [font:var(--type-mark)] tracking-[-1px]">
					<SpoolMark className="h-[25px] w-[19px] text-thread" />
					<span>spool</span>
				</div>
				<div className="flex items-center gap-[12px]">
					<TeamMark size="lg" />
					<h1 className="type-page">Tidemark</h1>
				</div>
				<p className="mt-[14px] text-muted [font:var(--type-body)]">
					Tidemark's projects open in the spool app on your Mac. Here you can look at one without opening it.
				</p>
				<ul className="mt-[36px] border-border border-t">
					{TEAM_PROJECTS.map((project) => (
						<li key={project.name} className="flex h-[64px] items-center gap-[16px] border-border border-b">
							<div className="h-[40px] w-[72px] shrink-0 overflow-hidden rounded-[5px] bg-canvas">
								<ProjectArtwork kind={project.art} className="h-full w-full object-cover object-top" />
							</div>
							<div className="min-w-0 flex-1">
								<strong className="block truncate type-title font-[500]">{project.name}</strong>
								<span className="text-muted type-detail">{project.frames} frames · {project.edited}</span>
							</div>
							<button type="button" className="text-muted type-control hover:text-text">
								Look
							</button>
							<button type="button" className={HOME_ACTION}>
								Open in spool
							</button>
						</li>
					))}
				</ul>
				<p className="mt-[28px] text-muted type-detail">ada@tidemark.app · invites and people live in the app</p>
			</div>
		</div>
	);
}

/* ── take: web ─────────────────────────────────────────────── */

function WebApp({ onOpen, onWeb }: { onOpen?: (() => void) | undefined; onWeb?: (() => void) | undefined }) {
	const all = [...TEAM_PROJECTS.filter((project) => project.onMac), ...OWN_PROJECTS];
	return (
		<Layout
			nav={<NavItem icon={<FrameIcon />} label="Projects" current />}
			foot={
				<button type="button" className="flex items-center gap-[10px] pl-[12px] text-muted type-control hover:text-text" onClick={onWeb}>
					<TeamMark />
					Manage Tidemark
					<Arrow />
				</button>
			}
		>
			<header className="mb-[31px] flex items-center justify-between gap-[25px]">
				<h1 className="type-page">Projects</h1>
				<div className="flex items-center gap-[13px]">
					<Search placeholder="Search projects" />
					<button type="button" className={HOME_ACTION}>
						Open…
					</button>
					<button type="button" className={HOME_ACTION_PRIMARY}>
						<PlusIcon className="h-[10px] w-[10px]" />
						New project…
					</button>
				</div>
			</header>
			<Count n={all.length} />
			<Grid projects={all} onOpen={onOpen} teamChip />
		</Layout>
	);
}

function WebDashboard({ invite, onInvite }: { invite: boolean; onInvite?: (() => void) | undefined }) {
	return (
		<Layout
			nav={
				<>
					<TeamSwitch />
					<div className="h-[18px]" />
					<NavItem label="Projects" current={!invite} />
					<NavItem label="People" count="4" current={invite} />
					<NavItem label="Plan" />
				</>
			}
			foot="ada@tidemark.app"
			web
		>
			{invite ? (
				<People />
			) : (
				<>
					<header className="mb-[31px] flex items-center justify-between gap-[25px]">
						<div className="flex items-center gap-[16px]">
							<h1 className="type-page">Projects</h1>
							<Faces ids={MEMBERS.map((member) => member.initials)} />
						</div>
						<div className="flex items-center gap-[13px]">
							<Search placeholder="Search Tidemark" />
							<button type="button" className={HOME_ACTION} onClick={onInvite}>
								Invite
							</button>
						</div>
					</header>
					<Count n={TEAM_PROJECTS.length} />
					<Grid projects={TEAM_PROJECTS} web />
				</>
			)}
		</Layout>
	);
}

function People() {
	return (
		<div className="max-w-[760px]">
			<h1 className="mb-[10px] type-page">People</h1>
			<p className="mb-[30px] text-muted [font:var(--type-body)]">Everyone here can open and change every Tidemark project.</p>
			<InviteField />
			<ul className="mt-[34px] border-border border-t">
				{MEMBERS.map((member) => (
					<li key={member.email} className="flex h-[58px] items-center gap-[14px] border-border border-b">
						<Face id={member.initials} />
						<span className="w-[180px] type-control">{member.name}</span>
						<span className="flex-1 text-muted type-detail">{member.email}</span>
						<span className="text-muted type-control">{member.role}</span>
					</li>
				))}
				<li className="flex h-[58px] items-center gap-[14px] border-border border-b">
					<span className="grid h-[26px] w-[26px] place-items-center rounded-full border border-border-raised border-dashed" />
					<span className="w-[180px] text-muted type-control">noor@tidemark.app</span>
					<span className="flex-1 text-muted type-detail">invited 2 days ago</span>
					<button type="button" className="text-muted type-control hover:text-text">
						Resend
					</button>
				</li>
			</ul>
		</div>
	);
}

/* ── take: same ────────────────────────────────────────────── */

function SameHome({
	host,
	onOpen,
	onInvite,
}: {
	host: "app" | "web";
	onOpen?: (() => void) | undefined;
	onInvite?: (() => void) | undefined;
}) {
	return (
		<Layout
			nav={
				<>
					<TeamSwitch />
					<div className="h-[18px]" />
					<NavItem icon={<FrameIcon />} label="Projects" current />
					<NavItem label="People" count="4" />
				</>
			}
			foot={host === "app" ? "On this Mac" : "ada@tidemark.app"}
			web={host === "web"}
		>
			<header className="mb-[31px] flex items-center justify-between gap-[25px]">
				<div className="flex items-center gap-[16px]">
					<h1 className="type-page">Projects</h1>
					<Faces ids={MEMBERS.map((member) => member.initials)} />
				</div>
				<div className="flex items-center gap-[13px]">
					<Search placeholder="Search Tidemark" />
					<button type="button" className={HOME_ACTION} onClick={onInvite}>
						Invite
					</button>
					{host === "app" && (
						<button type="button" className={HOME_ACTION_PRIMARY}>
							<PlusIcon className="h-[10px] w-[10px]" />
							New project…
						</button>
					)}
				</div>
			</header>
			<Count n={TEAM_PROJECTS.length} />
			<Grid projects={TEAM_PROJECTS} onOpen={onOpen} web={host === "web"} />
		</Layout>
	);
}

/* ── invite ────────────────────────────────────────────────── */

function InviteSheet() {
	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-[color-mix(in_oklab,var(--color-bg)_70%,transparent)] pt-[120px]">
			<div className="w-[520px] rounded-[10px] border border-border-raised bg-surface p-[28px]">
				<div className="mb-[8px] flex items-center justify-between">
					<h2 className="type-heading">Invite to Tidemark</h2>
					<CloseIcon className="h-[10px] w-[10px] text-muted" />
				</div>
				<p className="mb-[24px] text-muted type-control">They can open and change every Tidemark project.</p>
				<InviteField />
				<div className="mt-[26px] flex items-center justify-between border-border-raised border-t pt-[18px]">
					<span className="text-muted type-detail">4 people · 1 invited</span>
					<button type="button" className="text-muted type-control hover:text-text">
						Copy invite link
					</button>
				</div>
			</div>
		</div>
	);
}

function InviteField() {
	return (
		<div className="flex items-center gap-[10px]">
			<div className="flex h-[38px] min-w-0 flex-1 items-center gap-[6px] rounded-[7px] border border-muted bg-bg px-[8px]">
				<span className="flex h-[24px] items-center gap-[6px] rounded-[5px] bg-raised px-[8px] type-control">
					noor@tidemark.app
					<CloseIcon className="h-[7px] w-[7px] text-muted" />
				</span>
				<span className="type-control text-text">eli@</span>
				<span className="h-[16px] w-px animate-pulse bg-text" />
			</div>
			<button type="button" className={HOME_ACTION_PRIMARY}>
				Send invites
			</button>
		</div>
	);
}

/* ── parts ─────────────────────────────────────────────────── */

function Layout({
	nav,
	foot,
	web = false,
	children,
}: {
	nav: ReactNode;
	foot: ReactNode;
	web?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="h-full overflow-auto bg-bg text-text">
			<div className="grid min-h-full grid-cols-[208px_minmax(0,1fr)]">
				<aside className="sticky top-0 flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
					<div className="mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
						<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
						<span>spool</span>
						{web && <span className="ml-auto text-muted type-detail tracking-normal">web</span>}
					</div>
					<nav className="flex flex-col gap-[2px]">{nav}</nav>
					<div className="mt-auto text-muted type-detail [&>span]:block [&>span]:pl-[12px]">{typeof foot === "string" ? <span>{foot}</span> : foot}</div>
				</aside>
				<main className="min-w-0 px-[48px] pt-[46px] pb-[30px]">{children}</main>
			</div>
		</div>
	);
}

function NavItem({
	label,
	icon,
	current = false,
	indent = false,
	count,
}: {
	label: string;
	icon?: ReactNode;
	current?: boolean;
	indent?: boolean;
	count?: string;
}) {
	return (
		<button
			type="button"
			aria-current={current ? "page" : undefined}
			className={cn(
				"flex h-[36px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left type-control [&>svg]:h-[16px] [&>svg]:w-[16px]",
				current ? "bg-surface text-text" : "text-muted hover:text-text",
				indent && "pl-[42px]",
			)}
		>
			{icon}
			<span className="flex-1">{label}</span>
			{count && <span className="type-detail text-muted">{count}</span>}
		</button>
	);
}

function TeamSwitch() {
	return (
		<button type="button" className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface">
			<TeamMark />
			<span className="flex-1 type-control">Tidemark</span>
			<ChevronIcon className="h-[10px] w-[10px] text-muted" />
		</button>
	);
}

function TeamMark({ size = "sm" }: { size?: "sm" | "lg" }) {
	return (
		<span
			className={cn(
				"grid shrink-0 place-items-center rounded-[5px] bg-[#2F5F73] font-medium text-[#E6F1F5]",
				size === "sm" ? "h-[20px] w-[20px] text-[11px]" : "h-[34px] w-[34px] text-[17px]",
			)}
		>
			T
		</span>
	);
}

function Face({ id, live = false }: { id: string; live?: boolean }) {
	const member = MEMBERS.find((item) => item.initials === id);
	return (
		<span className="relative inline-grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full border-2 border-bg text-[9.5px] tracking-[-0.2px] font-medium text-[#141414]" style={{ background: member?.hue }}>
			{id}
			{live && <span className="absolute -right-[2px] -bottom-[2px] h-[9px] w-[9px] rounded-full border-2 border-bg bg-thread" />}
		</span>
	);
}

function Faces({ ids, live = false }: { ids: string[]; live?: boolean }) {
	return (
		<span className="flex [&>*+*]:-ml-[5px]">
			{ids.map((id) => (
				<Face key={id} id={id} live={live} />
			))}
		</span>
	);
}

function Search({ placeholder }: { placeholder: string }) {
	return (
		<label className="flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted">
			<SearchIcon className="h-3 w-3 shrink-0" />
			<span className="flex-1 type-control">{placeholder}</span>
			<kbd className="type-detail">/</kbd>
		</label>
	);
}

function Count({ n }: { n: number }) {
	return <p className="mb-[24px] text-muted type-detail">{n} projects</p>;
}

function Grid({
	projects,
	onOpen,
	web = false,
	teamChip = false,
}: {
	projects: TeamProject[];
	onOpen?: (() => void) | undefined;
	web?: boolean;
	teamChip?: boolean;
}) {
	return (
		<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
			{projects.map((project) => (
				<Tile key={project.name} project={project} onOpen={onOpen} web={web} teamChip={teamChip} />
			))}
		</div>
	);
}

function Tile({
	project,
	onOpen,
	web,
	teamChip,
}: {
	project: TeamProject;
	onOpen?: (() => void) | undefined;
	web: boolean;
	teamChip: boolean;
}) {
	const team = TEAM_PROJECTS.includes(project);
	const away = !web && !project.onMac;
	return (
		<article className="group/tile min-w-0">
			<button type="button" className="block w-full text-left" onClick={away ? undefined : onOpen}>
				<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
					<ProjectArtwork kind={project.art} className={cn("h-full w-full object-cover object-top", away && "opacity-40")} />
					{project.here.length > 0 && (
						<span className="absolute top-[10px] left-[10px]">
							<Faces ids={project.here} live />
						</span>
					)}
					{away && (
						<span className="absolute right-[12px] bottom-[12px] rounded-[6px] border border-border-raised bg-bg px-[10px] py-[5px] type-control">
							Get it
						</span>
					)}
					{web && (
						<span className="absolute right-[12px] bottom-[12px] flex gap-[8px] opacity-0 group-hover/tile:opacity-100">
							<span className="rounded-[6px] border border-border-raised bg-bg px-[10px] py-[5px] type-control">Look</span>
							<span className="rounded-[6px] bg-text px-[10px] py-[5px] text-bg type-control">Open in spool</span>
						</span>
					)}
				</div>
				<div className="flex items-baseline justify-between gap-[9px] pt-[15px]">
					<strong className="flex min-w-0 items-center gap-[8px] truncate type-title font-[500]">
						{teamChip && team && <TeamMark />}
						{project.name}
					</strong>
					<span className="shrink-0 text-muted type-detail">{project.frames} frames</span>
				</div>
				<span className="mt-[7px] block text-muted type-detail">{away ? "not on this Mac yet" : project.edited}</span>
			</button>
		</article>
	);
}
