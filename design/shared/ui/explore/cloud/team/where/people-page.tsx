import { PEOPLE, type Person, ROLE_LABEL } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { Host, Layout, NavItem, TeamMark, TeamSwitch } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CheckIcon, FrameIcon } from "shared/ui/spool/icons";
import {
	Caption,
	DANGER,
	DANGER_SOLID,
	Dialog,
	DotsButton,
	type Go,
	InviteField,
	InviteRows,
	LAST_ADMIN,
	MemberRow,
	RoleButton,
	ROLES,
	RoleWord,
	Seats,
	SettingRow,
	TextField,
	type WhereState,
} from "./parts";

/**
 * Take one, the smallest diff: running the team is two more pages under the
 * switcher in Home's sidebar. Projects, People, and Settings for admins.
 *
 * It bets that a team is a place like a project is, so it gets pages rather
 * than a dialog, and that one component can stand in both hosts: the app draws
 * these pages for Ada, and spool.page/tidemark/people draws the same ones in a
 * browser for anyone in the team, viewers included.
 *
 * Round two is about clutter: the page shows and stops. A row is a face, a name
 * and a role; the cost of a change is said once, in the confirm that asks for
 * it, never in a menu or under a list.
 */

export type PageState = WhereState | "role-confirm";
export type PageGo = Go & { confirm?: (() => void) | undefined };

const CAPTION = "People page. Running the team is two pages under the switcher, and spool.page/tidemark/people is the same pages in a browser.";

export function PeoplePage({ state = "base", go = {} }: { state?: PageState; go?: PageGo }) {
	if (state === "viewer") return <Viewer />;
	if (state === "member") return <Member go={go} />;
	const admin = state !== "settings";
	return (
		<Host host="app">
			<Layout nav={<Nav current={admin ? "people" : "settings"} settings go={go} />}>
				{state === "settings" ? <Settings /> : <People state={state} go={go} />}
			</Layout>
			{state === "role-confirm" && <MakeViewer go={go} />}
			<Caption>{CAPTION}</Caption>
		</Host>
	);
}

function Nav({ current, settings = false, go = {} }: { current: "people" | "settings"; settings?: boolean; go?: Go }) {
	return (
		<>
			<TeamSwitch />
			<div className="h-[18px]" />
			<NavItem icon={<FrameIcon />} label="Projects" count="4" />
			<span onClick={go.base} className="contents">
				<NavItem label="People" count="5" current={current === "people"} />
			</span>
			{settings && (
				<span onClick={go.settings} className="contents">
					<NavItem label="Settings" current={current === "settings"} />
				</span>
			)}
		</>
	);
}

/* ── people, as Ada ────────────────────────────────────────── */

function People({ state, go }: { state: PageState; go: PageGo }) {
	const people = state === "leave" ? LAST_ADMIN : PEOPLE;
	return (
		<div className="max-w-[880px]">
			<header className="mb-[10px] flex items-center justify-between">
				<h1 className="type-page">People</h1>
				<button type="button" className={cn(state === "invite" ? HOME_ACTION : HOME_ACTION_PRIMARY)} onClick={go.invite}>
					Invite
				</button>
			</header>
			<Seats people={people} className="mb-[22px] block" />

			{state === "invite" && (
				<section className="mb-[26px] rounded-[9px] border border-border-raised bg-surface p-[18px]">
					<InviteField />
				</section>
			)}

			<ul className="flex flex-col border-border border-b">
				{people.map((person) => (
					<Row key={person.id} person={person} state={state} go={go} />
				))}
			</ul>

			<h2 className="mt-[34px] mb-[8px] flex items-baseline gap-[10px] type-title">
				Invited
				<span className="text-muted type-detail">2</span>
			</h2>
			<InviteRows />
		</div>
	);
}

function Row({ person, state, go }: { person: Person; state: PageState; go: PageGo }) {
	const you = person.id === "ada";
	const roleOpen = state === "role" && person.id === "sam";
	const menuOpen = state === "leave" && you;
	return (
		<MemberRow person={person} you={you}>
			<span className="relative w-[112px] shrink-0">
				<RoleButton role={person.role} open={roleOpen} disabled={menuOpen} onClick={person.id === "sam" ? go.role : undefined} />
				{roleOpen && <RoleMenu person={person} onViewer={go.confirm} />}
			</span>
			<span className="relative">
				<DotsButton open={menuOpen} onClick={you ? go.leave : undefined} />
				{menuOpen && <OwnMenu />}
			</span>
		</MemberRow>
	);
}

/** The three roles by name, the current one checked, and Remove. Nothing explained here. */
function RoleMenu({ person, onViewer }: { person: Person; onViewer?: (() => void) | undefined }) {
	return (
		<div className="absolute top-[36px] right-0 z-30 w-[220px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]">
			{ROLES.map((role) => (
				<button
					key={role}
					type="button"
					onClick={role === "viewer" ? onViewer : undefined}
					className={cn("flex h-[34px] w-full items-center gap-[10px] rounded-[6px] px-[10px] text-left type-control hover:bg-surface", role === "viewer" && "bg-surface")}
				>
					<span className="w-[14px] shrink-0">{role === person.role && <CheckIcon className="h-[12px] w-[12px] text-text" />}</span>
					{ROLE_LABEL[role]}
				</button>
			))}
			<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
			<div className="flex h-[34px] items-center rounded-[6px] pr-[10px] pl-[34px] text-thread type-control hover:bg-surface">Remove from Tidemark</div>
		</div>
	);
}

/** The one place the cost of Editor to Viewer is said. */
function MakeViewer({ go }: { go: PageGo }) {
	return (
		<Dialog
			title="Make Sam a viewer?"
			width={400}
			actions={
				<>
					<button type="button" className={HOME_ACTION} onClick={go.role}>
						Cancel
					</button>
					<button type="button" className={HOME_ACTION_PRIMARY} onClick={go.base}>
						Make viewer
					</button>
				</>
			}
		>
			<p className="text-muted type-control">Sam’s Mac stops syncing Tidemark. The folders stay on it.</p>
		</Dialog>
	);
}

/** Ada's own row menu with nothing in it she may do yet, and why. */
function OwnMenu() {
	return (
		<div className="absolute top-[36px] right-0 z-30 w-[280px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]">
			<div className="flex h-[34px] items-center rounded-[6px] px-[10px] text-muted/60 type-control">Step down to editor</div>
			<div className="flex h-[34px] items-center rounded-[6px] px-[10px] text-muted/60 type-control">Leave Tidemark</div>
			<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
			<p className="px-[10px] pt-[4px] pb-[8px] type-label">You’re the only admin. Make someone else an admin first.</p>
		</div>
	);
}

/* ── an ordinary member leaving, on Mira's Mac ─────────────── */

function Member({ go }: { go: Go }) {
	return (
		<Host host="app">
			<Layout nav={<Nav current="people" />}>
				<ReadOnly you="mira" people={PEOPLE} />
			</Layout>
			<Dialog
				title="Leave Tidemark?"
				width={420}
				actions={
					<>
						<button type="button" className={HOME_ACTION} onClick={go.base}>
							Stay
						</button>
						<button type="button" className={DANGER_SOLID}>
							Leave Tidemark
						</button>
					</>
				}
			>
				<p className="text-muted type-control">The folders stay on this Mac as ordinary projects. Pages Tidemark shared keep working.</p>
			</Dialog>
			<Caption>{CAPTION}</Caption>
		</Host>
	);
}

/** People as anyone who isn't an admin sees them: roles as words, Leave on their own row. */
function ReadOnly({ you, people }: { you: string; people: Person[] }) {
	return (
		<div className="max-w-[880px]">
			<header className="mb-[10px] flex h-[34px] items-center">
				<h1 className="type-page">People</h1>
			</header>
			<Seats people={people} seats={false} className="mb-[22px] block" />
			<ul className="flex flex-col border-border border-b">
				{people.map((person) => (
					<MemberRow key={person.id} person={person} you={person.id === you}>
						<RoleWord role={person.role} />
						<span className="w-[120px] shrink-0 text-right">
							{person.id === you && (
								<button type="button" className={HOME_ACTION}>
									Leave
								</button>
							)}
						</span>
					</MemberRow>
				))}
			</ul>
		</div>
	);
}

/* ── settings ──────────────────────────────────────────────── */

function Settings() {
	return (
		<div className="max-w-[720px]">
			<h1 className="mb-[28px] type-page">Settings</h1>
			<SettingRow label="Logo" says="Shows in the switcher and on the team’s page." top={false}>
				<TeamMark size={40} />
				<button type="button" className={cn(HOME_ACTION, "ml-[8px]")}>
					Upload…
				</button>
				<button type="button" disabled className={cn(HOME_ACTION, "text-muted")}>
					Remove
				</button>
			</SettingRow>
			<SettingRow label="Name">
				<TextField value="Tidemark" />
			</SettingRow>
			<SettingRow label="Address">
				<TextField prefix="spool.page/" value="tidemark" width={260} />
			</SettingRow>
			<SettingRow label="Billing">
				<span className="flex h-[34px] w-[260px] items-center rounded-[7px] border border-border-raised border-dashed px-[11px] text-muted type-control">Not yet</span>
			</SettingRow>
			<SettingRow label="Delete team" says="Everyone loses access at once. Gone for good after 30 days.">
				<button type="button" className={DANGER}>
					Delete Tidemark…
				</button>
			</SettingRow>
		</div>
	);
}

/* ── Lena, in a browser ────────────────────────────────────── */

function Viewer() {
	return (
		<Host host="web" url="spool.page/tidemark/people">
			<Layout nav={<Nav current="people" />} web>
				<ReadOnly you="lena" people={PEOPLE} />
			</Layout>
			<Caption>{CAPTION}</Caption>
		</Host>
	);
}
