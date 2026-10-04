import { cn } from "shared/lib/utils";
import type { ReactNode } from "react";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import type { Artwork } from "shared/ui/demo/home-data";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { ChevronIcon, CloseIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The fake team every take on the team's home draws: Tidemark, four people, four
 * team projects, two of Ada's own. Ada is "you". Where someone is right now is
 * part of the fixture because every take has to say it somewhere.
 */

export interface Member {
	id: string;
	name: string;
	first: string;
	initials: string;
	hue: string;
	email: string;
	role: "Owner" | "Member";
}

export interface Presence {
	who: string;
	/** the frame they are on, or what their agent is doing */
	on: string;
	agent?: boolean;
}

export interface TeamProject {
	name: string;
	art: Artwork;
	frames: number;
	edited: string;
	here: Presence[];
	onMac: boolean;
	team: boolean;
	today?: string;
}

export const MEMBERS: Member[] = [
	{ id: "ada", name: "Ada Lind", first: "you", initials: "AL", hue: "#D59A6A", email: "ada@tidemark.app", role: "Owner" },
	{ id: "jonas", name: "Jonas Berg", first: "jonas", initials: "JB", hue: "#7FA7D4", email: "jonas@tidemark.app", role: "Member" },
	{ id: "mira", name: "Mira Koskinen", first: "mira", initials: "MK", hue: "#9DBE86", email: "mira@tidemark.app", role: "Member" },
	{ id: "sam", name: "Sam Okafor", first: "sam", initials: "SO", hue: "#C49AD3", email: "sam@tidemark.app", role: "Member" },
];

export const TEAM: TeamProject[] = [
	{
		name: "tidemark app",
		art: "studio",
		frames: 64,
		edited: "jonas · now",
		here: [
			{ who: "jonas", on: "cart" },
			{ who: "mira", on: "menu" },
			{ who: "jonas", on: "writing receipt", agent: true },
		],
		onMac: true,
		team: true,
		today: "11 frames changed today",
	},
	{ name: "onboarding", art: "notes", frames: 14, edited: "sam · now", here: [{ who: "sam", on: "welcome" }], onMac: true, team: true, today: "3 frames changed today" },
	{ name: "tidemark site", art: "system", frames: 21, edited: "you · 2 h ago", here: [], onMac: true, team: true },
	{ name: "brand refresh", art: "slack", frames: 9, edited: "sam · 3 days ago", here: [], onMac: false, team: true },
];

export const OWN: TeamProject[] = [
	{ name: "tvärsö", art: "coast", frames: 24, edited: "today", here: [], onMac: true, team: false },
	{ name: "kaffe", art: "coffee", frames: 18, edited: "yesterday", here: [], onMac: true, team: false },
];

export const member = (id: string): Member => MEMBERS.find((item) => item.id === id) ?? MEMBERS[0]!;

/** People in a project, once each, agents folded into their owner. */
export const people = (project: TeamProject): string[] => [...new Set(project.here.map((item) => item.who))];

/* ── hosts ─────────────────────────────────────────────────── */

/** The app window (tab strip over everything) or a browser tab on spool.page. */
export function Host({
	host,
	url = "spool.page/tidemark",
	tabs = ["tidemark app", "kaffe"],
	active,
	accessory,
	children,
}: {
	host: "app" | "web";
	url?: string;
	tabs?: string[];
	active?: string | undefined;
	accessory?: ReactNode;
	children: ReactNode;
}) {
	if (host === "web") {
		return (
			<PlayedTab title="Tidemark · spool" url={url} sibling="Slack">
				<div className="relative h-full bg-bg text-text">{children}</div>
			</PlayedTab>
		);
	}
	return (
		<SpoolShell canvasControls={active !== undefined} activeTab={active} tabs={tabs} headerAccessory={accessory}>
			<div className="relative h-full">{children}</div>
		</SpoolShell>
	);
}

/* ── people ────────────────────────────────────────────────── */

export function Face({ id, size = 24, ring = "border-bg" }: { id: string; size?: number; ring?: string }) {
	const person = member(id);
	return (
		<span
			className={cn("inline-grid shrink-0 place-items-center rounded-full border-2 font-medium text-[#151515]", ring)}
			style={{ background: person.hue, width: size, height: size, fontSize: Math.round(size * 0.36) }}
			title={person.name}
		>
			{person.initials}
		</span>
	);
}

export function Faces({ ids, size = 24, ring }: { ids: string[]; size?: number; ring?: string }) {
	return (
		<span className="flex" style={{ gap: 0 }}>
			{ids.map((id, index) => (
				<span key={id} style={{ marginLeft: index === 0 ? 0 : -Math.round(size * 0.22) }}>
					<Face id={id} size={size} {...(ring ? { ring } : {})} />
				</span>
			))}
		</span>
	);
}

/** Someone's pointer, resting where they are. Name in their own colour, lowercase like every chip. */
export function Cursor({ id, x, y, label }: { id: string; x: number; y: number; label?: string }) {
	const person = member(id);
	return (
		<span className="pointer-events-none absolute z-10 flex items-start" style={{ left: x, top: y }}>
			<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
				<path d="M1 1 13 8.2 7.4 9.3 4.6 14.6Z" fill={person.hue} stroke="#111" strokeWidth="1" strokeLinejoin="round" />
			</svg>
			<span className="mt-[12px] -ml-[2px] rounded-[4px] px-[6px] py-[1px] text-[#151515] type-detail" style={{ background: person.hue }}>
				{label ?? person.first}
			</span>
		</span>
	);
}

export function TeamMark({ size = 20 }: { size?: number }) {
	return (
		<span
			className="grid shrink-0 place-items-center rounded-[5px] bg-[#2E5D70] font-medium text-[#E4F0F4]"
			style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
		>
			T
		</span>
	);
}

export function InviteField({ wide = false }: { wide?: boolean }) {
	return (
		<div className={cn("flex items-center gap-[10px]", wide && "w-full")}>
			<div className="flex h-[38px] min-w-0 flex-1 items-center gap-[6px] rounded-[7px] border border-muted bg-bg px-[7px]">
				<span className="flex h-[24px] items-center gap-[6px] rounded-[5px] bg-raised px-[8px] type-control">
					noor@tidemark.app
					<CloseIcon className="h-[7px] w-[7px] text-muted" />
				</span>
				<span className="type-control">eli@</span>
				<span className="h-[16px] w-px animate-pulse bg-text" />
			</div>
			<button type="button" className={HOME_ACTION_PRIMARY}>
				Invite
			</button>
		</div>
	);
}

export function PeopleList({ where = false }: { where?: boolean }) {
	const location = (id: string) => [...TEAM].find((project) => people(project).includes(id))?.name;
	return (
		<ul className="flex flex-col">
			{MEMBERS.map((person) => (
				<li key={person.id} className="flex h-[46px] items-center gap-[12px]">
					<Face id={person.id} size={26} />
					<span className="min-w-0 flex-1 truncate type-control">
						{person.name}
						{person.id === "ada" && <span className="text-muted"> (you)</span>}
					</span>
					{where ? (
						<span className="text-muted type-detail">{location(person.id) ? `in ${location(person.id)}` : person.id === "ada" ? "here" : "away"}</span>
					) : (
						<span className="text-muted type-control">{person.role}</span>
					)}
				</li>
			))}
			<li className="flex h-[46px] items-center gap-[12px]">
				<span className="h-[26px] w-[26px] shrink-0 rounded-full border border-border-raised border-dashed" />
				<span className="flex-1 text-muted type-control">noor@tidemark.app</span>
				<span className="text-muted type-detail">invited · resend</span>
			</li>
		</ul>
	);
}

/* ── home layout ───────────────────────────────────────────── */

export function Layout({ nav, foot, web = false, children }: { nav: ReactNode; foot?: ReactNode; web?: boolean; children: ReactNode }) {
	return (
		<div className="h-full overflow-hidden bg-bg text-text">
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)]">
				<aside className="flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
					<div className="mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
						<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
						<span>spool</span>
					</div>
					<nav className="flex flex-col gap-[2px]">{nav}</nav>
					<div className="mt-auto pl-[12px] text-muted type-detail">{foot}</div>
				</aside>
				<main className={cn("min-w-0 overflow-hidden px-[48px] pt-[46px] pb-[30px]", web && "pt-[40px]")}>{children}</main>
			</div>
		</div>
	);
}

export function NavItem({ label, icon, current = false, indent = false, count }: { label: string; icon?: ReactNode; current?: boolean; indent?: boolean; count?: string }) {
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
			{count && <span className="text-muted type-detail">{count}</span>}
		</button>
	);
}

export function TeamSwitch() {
	return (
		<button type="button" className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface">
			<TeamMark />
			<span className="flex-1 type-control">Tidemark</span>
			<ChevronIcon className="h-[10px] w-[10px] text-muted" />
		</button>
	);
}

export function Search({ placeholder }: { placeholder: string }) {
	return (
		<label className="flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted">
			<SearchIcon className="h-3 w-3 shrink-0" />
			<span className="flex-1 type-control">{placeholder}</span>
			<kbd className="type-detail">/</kbd>
		</label>
	);
}

export function Count({ n, label = "projects" }: { n: number; label?: string }) {
	return <p className="mb-[24px] text-muted type-detail">{n} {label}</p>;
}

export function Grid({ projects, onOpen, web = false, mark = false }: { projects: TeamProject[]; onOpen?: (() => void) | undefined; web?: boolean; mark?: boolean }) {
	return (
		<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
			{projects.map((project) => (
				<Tile key={project.name} project={project} onOpen={onOpen} web={web} mark={mark} />
			))}
		</div>
	);
}

/**
 * Home's cover tile, with the team's people where they are. Faces sit on the
 * cover's foot rather than its corner so they read as "inside", and a project
 * that is not on this Mac is dimmed with the one verb it has.
 */
export function Tile({ project, onOpen, web = false, mark = false }: { project: TeamProject; onOpen?: (() => void) | undefined; web?: boolean; mark?: boolean }) {
	const away = !web && !project.onMac;
	const inside = people(project);
	return (
		<article className="group/tile min-w-0">
			<button type="button" className="block w-full text-left" onClick={away ? undefined : onOpen}>
				<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
					<ProjectArtwork kind={project.art} className={cn("h-full w-full object-cover object-top", away && "opacity-35 grayscale")} />
					{inside.length > 0 && (
						<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
							<Faces ids={inside} size={22} ring="border-bg" />
							<span className="type-detail">{inside.length === 1 ? `${member(inside[0]!).first} is here` : `${inside.length} here`}</span>
						</span>
					)}
					{away && (
						<span className="absolute inset-0 grid place-items-center">
							<span className="rounded-[7px] border border-border-raised bg-bg px-[12px] py-[6px] type-control">Get it</span>
						</span>
					)}
					{web && (
						<span className="absolute right-[10px] bottom-[10px] flex gap-[6px]">
							<span className="rounded-[6px] border border-border-raised bg-bg px-[10px] py-[5px] type-control">Look</span>
							<span className="rounded-[6px] bg-text px-[10px] py-[5px] text-bg type-control">Open in spool</span>
						</span>
					)}
				</div>
				<div className="flex items-baseline justify-between gap-[9px] pt-[14px]">
					<strong className="flex min-w-0 items-center gap-[8px] truncate type-title font-[500]">
						{mark && project.team && <TeamMark size={18} />}
						{project.name}
					</strong>
					<span className="shrink-0 text-muted type-detail">{project.frames} frames</span>
				</div>
				<span className="mt-[6px] block text-muted type-detail">{away ? "not on this Mac yet" : project.edited}</span>
			</button>
		</article>
	);
}
