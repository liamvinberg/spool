import { type ReactNode, useEffect, useRef } from "react";
import { PEOPLE, type Person } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { Host, Layout, NavItem, TeamMark, TeamSwitch } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION } from "shared/ui/spool/home-actions";
import { FrameIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import {
	Avatar,
	Avatars,
	BillingSlot,
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
	OutIcon,
	RoleButton,
	RoleMenu,
	RoleWord,
	Seats,
	SeatsNote,
	SettingRow,
	TextField,
	type WhereState,
	who,
} from "./parts";

/**
 * Take three, the most radical: the app only shows who is in the team, and
 * every change happens at spool.page/tidemark/people in the system browser,
 * where the team is run as an account-style settings page, one centred column
 * the way Linear or Vercel run theirs.
 *
 * It bets that spool stays a design tool. Administering a team is rare, it
 * touches billing, and it belongs beside the account (sign-in, passkeys, this
 * Mac's session) rather than beside the canvas. The app's People view spends
 * its room on where people are, which is the thing you want while designing.
 */

const CAPTION = "Web. The app shows who is in the team and where they are, and every change happens at spool.page/tidemark in the browser.";

export function PeopleWeb({ state = "base", go = {} }: { state?: WhereState; go?: Go }) {
	if (state === "app") return <AppPeople go={go} />;
	const you = state === "viewer" ? "lena" : state === "member" ? "mira" : "ada";
	const admin = you === "ada";
	const page = state === "settings" ? "general" : "people";
	return (
		<Host host="web" url={page === "general" ? "spool.page/tidemark/settings" : "spool.page/tidemark/people"}>
			<div className="flex h-full flex-col bg-bg text-text">
				<TopBar you={who(you)} />
				<Scroll to={state === "role" ? 250 : state === "leave" || state === "member" || state === "viewer" ? "end" : 0}>
					<div className="mx-auto grid w-[1000px] grid-cols-[200px_minmax(0,1fr)] gap-[56px] pt-[44px] pb-[80px]">
						<SideNav admin={admin} page={page} go={go} />
						<div className="min-w-0">{page === "general" ? <General /> : <People state={state} you={you} go={go} />}</div>
					</div>
				</Scroll>
			</div>
			<Caption>{CAPTION}</Caption>
		</Host>
	);
}

/** The page scrolled to where the state happens: Sam's row for the role menu, the foot for your own Leave. */
function Scroll({ to, children }: { to: number | "end"; children: ReactNode }) {
	const box = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (box.current) box.current.scrollTop = to === "end" ? box.current.scrollHeight : to;
	}, [to]);
	return (
		<div ref={box} className="min-h-0 flex-1 overflow-y-auto">
			{children}
		</div>
	);
}

function TopBar({ you }: { you: Person }) {
	return (
		<header className="flex h-[56px] shrink-0 items-center justify-between border-border border-b px-[28px]">
			<span className="flex items-center gap-[12px]">
				<SpoolMark className="h-[20px] w-[15px] text-thread" />
				<span className="text-muted type-control">/</span>
				<TeamMark size={20} />
				<span className="type-control">Tidemark</span>
			</span>
			<span className="flex items-center gap-[22px]">
				<span className="text-muted type-control">Projects</span>
				<Avatar person={you} size={28} />
			</span>
		</header>
	);
}

function SideNav({ admin, page, go }: { admin: boolean; page: "general" | "people"; go: Go }) {
	return (
		<nav className="sticky top-[44px] flex flex-col gap-[2px] self-start">
			<span className="mb-[6px] px-[12px] text-muted type-label">Tidemark</span>
			{admin && <Link label="General" on={page === "general"} onClick={go.settings} />}
			<Link label="People" on={page === "people"} onClick={go.base} />
			<span className="mt-[26px] mb-[6px] px-[12px] text-muted type-label">Your account</span>
			<Link label="Profile" on={false} />
			<Link label="Sign-in and passkeys" on={false} />
			<Link label="Signed-in Macs" on={false} />
		</nav>
	);
}

function Link({ label, on, onClick }: { label: string; on: boolean; onClick?: (() => void) | undefined }) {
	return (
		<button type="button" onClick={onClick} className={cn("flex h-[34px] items-center rounded-[7px] px-[12px] text-left type-control", on ? "bg-surface text-text" : "text-muted hover:text-text")}>
			{label}
		</button>
	);
}

/* ── people ────────────────────────────────────────────────── */

function People({ state, you, go }: { state: WhereState; you: string; go: Go }) {
	const admin = you === "ada";
	const people = state === "leave" ? LAST_ADMIN : PEOPLE;
	return (
		<div className="flex flex-col">
			<h1 className="type-page">People</h1>
			<Seats people={people} seats={admin} className="mt-[6px] mb-[30px] block" />

			{admin && (
				<Section title="Invite people" says="They get an email, and see the invite in spool if they already have an account.">
					<div onClick={state === "base" ? go.invite : undefined}>
						<InviteField empty={state !== "invite"} />
					</div>
					{state === "invite" && <DraftNote className="mt-[10px]" />}
				</Section>
			)}

			<h2 className="mb-[6px] type-title">Members</h2>
			<ul className="flex flex-col border-border border-b">
				{people.map((person) => (
					<MemberRow key={person.id} person={person} you={person.id === you} dense>
						{admin ? <AdminCells person={person} state={state} go={go} /> : <RoleWord role={person.role} />}
					</MemberRow>
				))}
			</ul>
			{admin && <SeatsNote className="mt-[10px]" />}

			{admin && (
				<>
					<h2 className="mt-[36px] mb-[6px] type-title">Invites</h2>
					<InviteRows dense />
				</>
			)}

			<Leave state={state} go={go} />
		</div>
	);
}

function AdminCells({ person, state, go }: { person: Person; state: WhereState; go: Go }) {
	const open = state === "role" && person.id === "sam";
	return (
		<>
			<span className="w-[110px] shrink-0 text-muted type-detail">{person.via}</span>
			<span className="relative w-[104px] shrink-0">
				<RoleButton role={person.role} open={open} disabled={state === "leave" && person.id === "ada"} onClick={person.id === "sam" ? go.role : undefined} />
				{open && <RoleMenu person={person} lean="viewer" className="absolute top-[36px] right-[-120px]" />}
			</span>
			<DotsButton />
		</>
	);
}

function Section({ title, says, children }: { title: string; says: string; children: ReactNode }) {
	return (
		<section className="mb-[36px] rounded-[9px] border border-border p-[20px]">
			<h2 className="type-title">{title}</h2>
			<p className="mt-[2px] mb-[16px] text-muted type-label">{says}</p>
			{children}
		</section>
	);
}

/** Your own way out, at the foot of the page, in whichever state the person is in. */
function Leave({ state, go }: { state: WhereState; go: Go }) {
	if (state === "member") {
		return (
			<section className="mt-[40px] rounded-[9px] border border-thread/40 p-[20px]">
				<h2 className="mb-[12px] type-title">Leave Tidemark?</h2>
				<LeaveSays here={false} />
				<div className="mt-[18px] flex justify-end gap-[10px]">
					<button type="button" className={HOME_ACTION} onClick={go.base}>
						Stay
					</button>
					<button type="button" className={DANGER_SOLID}>
						Leave Tidemark
					</button>
				</div>
			</section>
		);
	}
	const says =
		state === "leave" ? null : state === "viewer" ? "You stop seeing Tidemark’s projects straight away. Nothing of the team’s is on your Mac." : "You lose Tidemark’s projects straight away. Folders on your Mac stay as ordinary projects.";
	return (
		<section className="mt-[40px] flex items-start justify-between gap-[40px] rounded-[9px] border border-border p-[20px]">
			<span className="flex flex-col gap-[4px]">
				<span className="type-title">Leave Tidemark</span>
				{says ? <span className="text-muted type-label">{says}</span> : <LastAdmin className="max-w-[440px] text-muted" />}
			</span>
			<button type="button" disabled={state === "leave"} onClick={go.leave} className={cn(state === "leave" ? cn(HOME_ACTION, "cursor-not-allowed text-muted hover:bg-transparent") : DANGER)}>
				Leave
			</button>
		</section>
	);
}

/* ── general ───────────────────────────────────────────────── */

function General() {
	return (
		<div className="flex flex-col">
			<h1 className="mb-[30px] type-page">General</h1>
			<SettingRow label="Name" says="What the switcher and everyone’s Home call the team." top={false}>
				<TextField value="Tidemark" />
			</SettingRow>
			<SettingRow label="Address" says="This page and the team’s projects live under it. Changing it stops the old address working.">
				<TextField prefix="spool.page/" value="tidemark" width={260} />
			</SettingRow>
			<div className="border-border border-t py-[18px]">
				<BillingSlot />
			</div>
			<section className="mt-[18px] flex items-start justify-between gap-[40px] rounded-[9px] border border-thread/40 p-[20px]">
				<span className="flex flex-col gap-[4px]">
					<span className="type-title">Delete Tidemark</span>
					<span className="max-w-[440px] text-muted type-label">
						<DeleteSays />
					</span>
				</span>
				<button type="button" className={DANGER}>
					Delete team…
				</button>
			</section>
		</div>
	);
}

/* ── the app side ──────────────────────────────────────────── */

/**
 * The app's People view: who is here and where, read-only. The one button
 * hands over to the browser, which is where anything about the team changes.
 */
function AppPeople({ go }: { go: Go }) {
	return (
		<Host host="app">
			<Layout
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" count="4" />
						<NavItem label="People" count="5" current />
					</>
				}
			>
				<div className="max-w-[880px]">
					<header className="mb-[10px] flex items-center justify-between">
						<span className="flex items-center gap-[16px]">
							<h1 className="type-page">People</h1>
							<Avatars />
						</span>
						<button type="button" className={HOME_ACTION} onClick={go.base}>
							Manage on spool.page
							<OutIcon className="text-muted" />
						</button>
					</header>
					<p className="mb-[26px] text-muted type-detail">5 people · 4 here now</p>
					<ul className="flex flex-col border-border border-b">
						{PEOPLE.map((person) => (
							<MemberRow key={person.id} person={person} you={person.id === "ada"}>
								<span className={cn("w-[200px] shrink-0 type-detail", person.here ? "text-text" : "text-muted")}>
									{person.here ? `in ${person.here}` : "away"}
								</span>
								<RoleWord role={person.role} />
							</MemberRow>
						))}
					</ul>
					<p className="mt-[14px] max-w-[560px] text-muted type-label">
						Invites, roles and leaving are on Tidemark’s page at spool.page/tidemark/people, which opens in your browser.
					</p>
				</div>
			</Layout>
			<Caption>{CAPTION}</Caption>
		</Host>
	);
}
