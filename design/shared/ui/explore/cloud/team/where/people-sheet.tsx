import type { ReactNode } from "react";
import { PEOPLE, type Person } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { Count, Host, Layout, NavItem, TEAM, TeamMark, TeamSwitch, type TeamProject } from "shared/ui/explore/cloud/home/parts";
import { SidebarSwitcher } from "shared/ui/explore/cloud/home/team-home";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { HOME_ACTION } from "shared/ui/spool/home-actions";
import { CheckIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import {
	Avatars,
	Caption,
	DANGER,
	DANGER_SOLID,
	DeleteSays,
	DotsButton,
	DraftNote,
	type Go,
	InviteField,
	InviteRows,
	LAST_ADMIN,
	LastAdmin,
	LeaveSays,
	MemberRow,
	RoleButton,
	RoleMenu,
	RoleWord,
	Seats,
	SettingRow,
	TextButton,
	TextField,
	type WhereState,
} from "./parts";

/**
 * Take two: the team is run from one sheet over Home, the way spool's own
 * settings already are. Tabs for People, Team and Billing, and esc closes it.
 * It opens from the switcher menu ("Tidemark settings…") and from the faces in
 * Home's header, and the browser opens the same sheet over spool.page/tidemark.
 *
 * It bets that running a team is an errand rather than a place: you come in to
 * change one thing and go back to the covers, so Home keeps exactly the two
 * items DEV-121 decided and nothing grows in the sidebar.
 */

export type SheetState = WhereState | "menu";

const CAPTION = "People sheet. The team is run from one sheet over Home, opened from the switcher or the faces, gone on esc.";

export function PeopleSheet({ state = "base", go = {} }: { state?: SheetState; go?: Go }) {
	if (state === "menu") return <Opening go={go} />;
	const viewer = state === "viewer";
	const member = state === "member";
	const admin = !viewer && !member;
	return (
		<div className="relative h-full w-full overflow-hidden">
			{viewer ? <TeamPage /> : <SidebarSwitcher />}
			<div className="absolute inset-0 z-30 animate-find-in bg-bg/60 backdrop-blur-[2px]" />
			<div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center pt-[96px]">
				<div
					role="dialog"
					aria-label="Tidemark"
					className="pointer-events-auto flex w-[760px] animate-find-panel-in flex-col rounded-lg border border-border-raised bg-surface text-text"
				>
					<header className="flex h-12 shrink-0 items-center justify-between border-border border-b px-7">
						<span className="flex items-center gap-[10px]">
							<TeamMark size={18} />
							<span className="font-semibold text-md text-text tracking-tight leading-md">Tidemark</span>
						</span>
						<span className="font-mono text-2xs text-muted leading-3">esc closes</span>
					</header>
					{admin && <Tabs tab={state === "settings" ? "team" : "people"} go={go} />}
					<div className="px-7 pt-5 pb-6">{state === "settings" ? <TeamTab /> : <PeopleTab state={state} go={go} />}</div>
					<Foot state={state} go={go} />
				</div>
			</div>
			<Caption>{CAPTION}</Caption>
		</div>
	);
}

function Tabs({ tab, go }: { tab: "people" | "team"; go: Go }) {
	return (
		<div className="flex h-10 shrink-0 items-stretch gap-6 border-border border-b px-7">
			<Tab label="People" on={tab === "people"} onClick={go.base} />
			<Tab label="Team" on={tab === "team"} onClick={go.settings} />
			<Tab label="Billing" on={false} note="empty" />
		</div>
	);
}

function Tab({ label, on, note, onClick }: { label: string; on: boolean; note?: string; onClick?: (() => void) | undefined }) {
	return (
		<button type="button" onClick={onClick} className={cn("relative flex items-center gap-[8px] text-base leading-base", on ? "text-text" : "text-muted hover:text-text")}>
			{label}
			{note && <span className="font-mono text-2xs text-muted/70 leading-3">{note}</span>}
			{on && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" />}
		</button>
	);
}

/* ── people ────────────────────────────────────────────────── */

function PeopleTab({ state, go }: { state: WhereState; go: Go }) {
	const admin = state !== "viewer" && state !== "member";
	const people = state === "leave" ? LAST_ADMIN : PEOPLE;
	const you = state === "viewer" ? "lena" : state === "member" ? "mira" : "ada";
	return (
		<div className="flex flex-col">
			{admin && (
				<div className="mb-[18px]" onClick={state === "base" ? go.invite : undefined}>
					<InviteField empty={state !== "invite"} />
					{state === "invite" && <DraftNote className="mt-[10px]" />}
				</div>
			)}
			<ul className="flex flex-col">
				{people.map((person) => (
					<MemberRow key={person.id} person={person} you={person.id === you} dense>
						{admin ? <AdminCells person={person} state={state} go={go} /> : <RoleWord role={person.role} />}
					</MemberRow>
				))}
			</ul>
			{admin && state !== "invite" && (
				<div className="mt-[6px]">
					<InviteRows dense />
				</div>
			)}
		</div>
	);
}

function AdminCells({ person, state, go }: { person: Person; state: WhereState; go: Go }) {
	const open = state === "role" && person.id === "sam";
	const stuck = state === "leave" && person.id === "ada";
	return (
		<>
			<span className="relative w-[112px] shrink-0">
				<RoleButton role={person.role} open={open} disabled={stuck} onClick={person.id === "sam" ? go.role : undefined} />
				{open && <RoleMenu person={person} lean="viewer" className="absolute top-[36px] right-[-40px]" />}
			</span>
			<DotsButton />
		</>
	);
}

/* ── the foot: seats, and your own way out ─────────────────── */

function Foot({ state, go }: { state: WhereState; go: Go }) {
	if (state === "leave") {
		return (
			<footer className="flex items-center justify-between gap-[30px] rounded-b-lg border-border border-t bg-bg/40 px-7 py-[16px]">
				<LastAdmin className="max-w-[460px]" />
				<button type="button" disabled className={cn(HOME_ACTION, "cursor-not-allowed text-muted hover:bg-transparent")}>
					Leave Tidemark
				</button>
			</footer>
		);
	}
	if (state === "member") {
		return (
			<footer className="flex flex-col gap-[18px] rounded-b-lg border-border border-t bg-bg/40 px-7 py-[20px]">
				<span className="type-title">Leave Tidemark?</span>
				<LeaveSays />
				<span className="flex justify-end gap-[10px]">
					<button type="button" className={HOME_ACTION} onClick={go.base}>
						Stay
					</button>
					<button type="button" className={DANGER_SOLID}>
						Leave Tidemark
					</button>
				</span>
			</footer>
		);
	}
	if (state === "settings") return null;
	const viewer = state === "viewer";
	return (
		<footer className="flex h-[52px] items-center justify-between rounded-b-lg border-border border-t px-7">
			{viewer ? <span className="text-muted type-label">You’re a viewer. Ada and Jonas run the team.</span> : <Seats />}
			<span className="-mr-[8px]">
				<TextButton onClick={go.leave}>Leave Tidemark</TextButton>
			</span>
		</footer>
	);
}

/* ── team ──────────────────────────────────────────────────── */

function TeamTab() {
	return (
		<div className="flex flex-col">
			<SettingRow label="Name" says="What the switcher and everyone’s Home call the team." top={false}>
				<TextField value="Tidemark" />
			</SettingRow>
			<SettingRow label="Address" says="The team’s page in a browser. Changing it stops the old address working.">
				<TextField prefix="spool.page/" value="tidemark" width={260} />
			</SettingRow>
			<SettingRow label="Delete team" says={<DeleteSays />}>
				<button type="button" className={DANGER}>
					Delete Tidemark…
				</button>
			</SettingRow>
		</div>
	);
}

/* ── where it opens from ───────────────────────────────────── */

/** Home with the switcher open: the team's own settings sit beside the team, and the faces open the same sheet. */
function Opening({ go }: { go: Go }) {
	return (
		<div className="relative h-full w-full overflow-hidden">
			<SidebarSwitcher />
			<div className="absolute top-[184px] left-[16px] z-30 w-[260px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px] text-text">
				<MenuRow mark={<TeamMark />} label="Tidemark" detail="5 people" checked />
				<MenuRow mark={<span className="grid h-[20px] w-[20px] place-items-center rounded-[5px] bg-[#6B4E2E] text-[11px] font-medium text-[#EDEDED]">N</span>} label="Northlight" detail="2 people" />
				<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
				<MenuRow mark={<FrameIcon className="h-[16px] w-[16px] text-muted" />} label="Your projects" detail="2 on this Mac" />
				<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
				<MenuRow label="Tidemark settings…" hover onClick={go.base} />
				<MenuRow mark={<PlusIcon className="h-[10px] w-[10px] text-muted" />} label="New team…" />
			</div>
			<button
				type="button"
				onClick={go.base}
				className="absolute top-[132px] left-[372px] z-30 animate-menu-in rounded-[6px] border border-border-raised bg-raised px-[9px] py-[4px] text-text type-label"
			>
				People and settings
			</button>
			<Caption>{CAPTION}</Caption>
		</div>
	);
}

function MenuRow({ mark, label, detail, checked = false, hover = false, onClick }: { mark?: ReactNode; label: string; detail?: string; checked?: boolean; hover?: boolean; onClick?: (() => void) | undefined }) {
	return (
		<div onClick={onClick} className={cn("flex h-[36px] items-center gap-[10px] rounded-[6px] px-[9px] hover:bg-surface", (checked || hover) && "bg-surface")}>
			<span className="grid w-[20px] place-items-center">{mark}</span>
			<span className="flex-1 type-control">{label}</span>
			{detail && <span className="text-muted type-detail">{detail}</span>}
			{checked && <CheckIcon className="h-[12px] w-[12px] text-text" />}
		</div>
	);
}

/* ── the team's page in a browser, for Lena ────────────────── */

/** spool.page/tidemark as a viewer has it: covers to look at, and nothing that hands over files. */
function TeamPage() {
	return (
		<Host host="web" url="spool.page/tidemark">
			<Layout
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
					</>
				}
				web
			>
				<header className="mb-[31px] flex items-center gap-[16px]">
					<h1 className="type-page">Projects</h1>
					<Avatars />
				</header>
				<Count n={TEAM.length} />
				<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
					{TEAM.map((project) => (
						<Cover key={project.name} project={project} />
					))}
				</div>
			</Layout>
		</Host>
	);
}

function Cover({ project }: { project: TeamProject }) {
	return (
		<article className="min-w-0">
			<div className="aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
				<ProjectArtwork kind={project.art} className="h-full w-full object-cover object-top" />
			</div>
			<div className="flex items-baseline justify-between pt-[14px]">
				<strong className="type-title font-[500]">{project.name}</strong>
				<span className="text-muted type-detail">{project.frames} frames</span>
			</div>
		</article>
	);
}
