import type { ReactNode } from "react";
import { type Invite, INVITES, PEOPLE, type Person, ROLE_LABEL, ROLE_SAYS, type Role } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { CheckIcon, CloseIcon, DotsIcon } from "shared/ui/spool/icons";

/**
 * DEV-158, where running a team lives: the pieces all three takes draw with, so
 * a row, a role menu or a refusal reads the same wherever it stands and the
 * takes differ only in where they put them.
 *
 * Faces here read the DEV-158 fixture rather than DEV-121's `Face`, because
 * Lena (a viewer) is in this team and not in that one.
 */

/** Every state a take is drawn in. `member` is an ordinary member's Leave confirm, `app` is take three's app side. */
export type WhereState = "base" | "role" | "invite" | "leave" | "member" | "settings" | "viewer" | "app";

/** Where a click walks, handed in by the frame so shared code never imports spool. */
export type Go = Partial<Record<WhereState, () => void>>;

/** The leave state's team: Jonas is an editor, so Ada is the only admin left. */
export const LAST_ADMIN: Person[] = PEOPLE.map((item) => (item.id === "jonas" ? { ...item, role: "editor" } : item));

/** The team folders an editor's Mac holds. */
export const FOLDERS = ["tidemark app", "onboarding", "tidemark site"];

/** Addresses being invited in the invite state, each with its own role. */
export const DRAFT: { email: string; role: Role }[] = [
	{ email: "felix@tidemark.app", role: "editor" },
	{ email: "hanna@harbourbank.se", role: "viewer" },
];

export const ROLES: Role[] = ["admin", "editor", "viewer"];

export function who(id: string, people: Person[] = PEOPLE): Person {
	return people.find((item) => item.id === id) ?? people[0]!;
}

/* ── faces ─────────────────────────────────────────────────── */

export function Avatar({ person, size = 28, ring = false }: { person: Person; size?: number; ring?: boolean }) {
	return (
		<span
			className={cn("inline-grid shrink-0 place-items-center rounded-full font-medium text-[#151515]", ring && "border-2 border-bg")}
			style={{ background: person.hue, width: size, height: size, fontSize: Math.round(size * 0.36) }}
			title={person.name}
		>
			{person.initials}
		</span>
	);
}

export function Avatars({ people = PEOPLE, size = 24 }: { people?: Person[]; size?: number }) {
	return (
		<span className="flex">
			{people.map((item, index) => (
				<span key={item.id} style={{ marginLeft: index === 0 ? 0 : -Math.round(size * 0.22) }}>
					<Avatar person={item} size={size} ring />
				</span>
			))}
		</span>
	);
}

/* ── controls ──────────────────────────────────────────────── */

export function Caret({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 10 10" className={cn("h-[9px] w-[9px] shrink-0", className)} fill="none" aria-hidden="true">
			<path d="m2.5 3.75 2.5 2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function OutIcon({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 12 12" className={cn("h-[10px] w-[10px] shrink-0", className)} fill="none" aria-hidden="true">
			<path d="M4.5 2.5h5v5M9.5 2.5 3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** A role you can change: the word and a caret, quiet until it is open. */
export function RoleButton({ role, open = false, disabled = false, onClick }: { role: Role; open?: boolean; disabled?: boolean; onClick?: (() => void) | undefined }) {
	return (
		<button
			type="button"
			aria-expanded={open}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex h-[30px] items-center gap-[8px] rounded-[6px] border px-[10px] type-control transition-colors duration-150",
				open ? "border-border-raised bg-raised text-text" : "border-transparent text-text hover:border-border-raised",
				disabled && "cursor-not-allowed text-muted hover:border-transparent",
			)}
		>
			{ROLE_LABEL[role]}
			<Caret className="text-muted" />
		</button>
	);
}

export function DotsButton({ open = false, onClick }: { open?: boolean; onClick?: (() => void) | undefined }) {
	return (
		<button
			type="button"
			aria-label="More"
			onClick={onClick}
			className={cn("grid h-[30px] w-[30px] place-items-center rounded-[6px] text-muted hover:bg-raised hover:text-text", open && "bg-raised text-text")}
		>
			<DotsIcon className="h-[14px] w-[14px]" />
		</button>
	);
}

export function TextButton({ children, tone = "muted", onClick }: { children: ReactNode; tone?: "muted" | "text" | "thread"; onClick?: (() => void) | undefined }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"h-[28px] rounded-[6px] px-[8px] type-control transition-colors duration-150 hover:bg-raised",
				tone === "muted" && "text-muted hover:text-text",
				tone === "text" && "text-text",
				tone === "thread" && "text-thread",
			)}
		>
			{children}
		</button>
	);
}

export const DANGER =
	"inline-flex h-[34px] shrink-0 items-center justify-center rounded-[7px] border border-thread/50 px-[13px] text-thread type-control hover:bg-thread/10";
export const DANGER_SOLID = "inline-flex h-[34px] shrink-0 items-center justify-center rounded-[7px] bg-thread px-[13px] text-on-thread type-control";

/* ── the role menu ─────────────────────────────────────────── */

/**
 * Each role with its one line. When the pointer rests on a role that takes the
 * files away, the row says what happens to the person's Mac before anyone
 * commits to it, because that is the part nobody can see from here.
 */
export function RoleMenu({ person, lean, className }: { person: Person; lean?: Role | undefined; className?: string | undefined }) {
	const first = person.name.split(" ")[0];
	const losesFiles = person.role !== "viewer" && lean === "viewer";
	return (
		<div className={cn("z-30 w-[352px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px] text-left", className)}>
			{ROLES.map((role) => (
				<div key={role} className={cn("flex gap-[10px] rounded-[6px] px-[10px] py-[9px]", role === lean && "bg-surface")}>
					<span className="w-[14px] shrink-0 pt-[4px]">{role === person.role && <CheckIcon className="h-[12px] w-[12px] text-text" />}</span>
					<span className="flex min-w-0 flex-col gap-[2px]">
						<span className="type-control">{ROLE_LABEL[role]}</span>
						<span className="text-muted type-label">{ROLE_SAYS[role]}</span>
						{role === lean && losesFiles && (
							<span className="mt-[8px] flex flex-col gap-[6px] border-border-raised border-t pt-[9px] type-label">
								<span>
									{first}’s Mac stops syncing Tidemark. The folders on it stay where they are as ordinary projects, and {first} follows along in the browser from then on.
								</span>
								<span className="text-muted type-detail">tidemark goes from 4 seats to 3</span>
							</span>
						)}
					</span>
				</div>
			))}
			<div className="mx-[8px] my-[5px] h-px bg-border-raised" />
			<div className="flex h-[34px] items-center rounded-[6px] px-[10px] pl-[34px] text-thread type-control hover:bg-surface">Remove from Tidemark</div>
		</div>
	);
}

/* ── rows ──────────────────────────────────────────────────── */

/** One member: face, name over address, then whatever the take puts on the right. */
export function MemberRow({ person, you = false, children, dense = false }: { person: Person; you?: boolean; children?: ReactNode; dense?: boolean }) {
	return (
		<li className={cn("flex items-center gap-[14px] border-border border-t", dense ? "h-[52px]" : "h-[58px]")}>
			<Avatar person={person} size={dense ? 26 : 30} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate type-control">
					{person.name}
					{you && <span className="text-muted"> (you)</span>}
				</span>
				<span className="truncate text-muted type-label">{person.email}</span>
			</span>
			{children}
		</li>
	);
}

/** A role nobody here can change, said as a word. */
export function RoleWord({ role }: { role: Role }) {
	return <span className="w-[86px] shrink-0 text-muted type-control">{ROLE_LABEL[role]}</span>;
}

const sentBy = (invite: Invite) => (invite.invitedBy === "ada" ? "you" : who(invite.invitedBy).name.split(" ")[0]!.toLowerCase());

/** Pending and expired invites. An expired one keeps its row, so resending is one click from where it was. */
export function InviteRows({ invites = INVITES, dense = false }: { invites?: Invite[]; dense?: boolean }) {
	return (
		<ul className="flex flex-col">
			{invites.map((invite) => (
				<li key={invite.email} className={cn("flex items-center gap-[14px] border-border border-t", dense ? "h-[52px]" : "h-[58px]")}>
					<span className={cn("shrink-0 rounded-full border border-dashed", dense ? "h-[26px] w-[26px]" : "h-[30px] w-[30px]", invite.state === "expired" ? "border-border-raised" : "border-muted/60")} />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className={cn("truncate type-control", invite.state === "expired" && "text-muted")}>{invite.email}</span>
						<span className="truncate text-muted type-detail">
							{invite.state === "pending" ? `${ROLE_LABEL[invite.role].toLowerCase()} · sent ${invite.sent} by ${sentBy(invite)} · 5 days left` : `${ROLE_LABEL[invite.role].toLowerCase()} · expired 2 days ago`}
						</span>
					</span>
					<TextButton tone={invite.state === "expired" ? "text" : "muted"}>Resend</TextButton>
					<TextButton>Cancel</TextButton>
				</li>
			))}
		</ul>
	);
}

/** The seat count, quiet: a number in the machine's voice, the rule in a person's. */
export function Seats({ people = PEOPLE, seats = true, className }: { people?: Person[]; seats?: boolean; className?: string | undefined }) {
	const count = people.filter((item) => item.role !== "viewer").length;
	return <span className={cn("text-muted type-detail", className)}>{seats ? `${people.length} people · ${count} seats` : `${people.length} people`}</span>;
}

export function SeatsNote({ className }: { className?: string | undefined }) {
	return <p className={cn("text-muted type-label", className)}>Admins and editors are seats. Viewers are free, so Lena doesn’t count.</p>;
}

/* ── inviting ──────────────────────────────────────────────── */

/**
 * DEV-121's chip field, with a role on every chip. The role picked beside the
 * field is what the next address gets; a chip's own role changes on the chip.
 */
export function InviteField({ draft = DRAFT, typing = "ola@", empty = false, action = "Invite" }: { draft?: { email: string; role: Role }[]; typing?: string; empty?: boolean; action?: string }) {
	return (
		<div className="flex items-start gap-[10px]">
			<div className={cn("flex min-h-[38px] min-w-0 flex-1 flex-wrap items-center gap-[6px] rounded-[7px] border bg-bg px-[7px] py-[6px]", empty ? "border-border-raised" : "border-muted")}>
				{empty ? (
					<span className="px-[4px] text-muted type-control">Email addresses</span>
				) : (
					<>
						{draft.map((item) => (
							<span key={item.email} className="flex h-[26px] items-center gap-[7px] rounded-[5px] bg-raised pr-[7px] pl-[8px] type-control">
								{item.email}
								<span className="flex items-center gap-[4px] border-border-raised border-l pl-[7px] text-muted">
									{ROLE_LABEL[item.role]}
									<Caret />
								</span>
								<CloseIcon className="h-[7px] w-[7px] text-muted" />
							</span>
						))}
						<span className="type-control">{typing}</span>
						<span className="h-[16px] w-px animate-pulse bg-text" />
					</>
				)}
			</div>
			<span className="flex h-[38px] shrink-0 items-center gap-[8px] rounded-[7px] border border-border-raised px-[11px] type-control">
				as Editor
				<Caret className="text-muted" />
			</span>
			<button type="button" className={cn("inline-flex h-[38px] shrink-0 items-center rounded-[7px] px-[14px] type-control", empty ? "bg-raised text-muted" : "bg-text text-bg")}>
				{action}
			</button>
		</div>
	);
}

/** What the draft costs and what it sends, said under the field. */
export function DraftNote({ className }: { className?: string | undefined }) {
	return (
		<p className={cn("text-muted type-label", className)}>
			Felix will be a seat once he accepts. Hanna views for free. Each invite goes by email, shows up in spool if they already have an account, and lasts 7 days.
		</p>
	);
}

/* ── leaving ───────────────────────────────────────────────── */

/** The last admin, told what to do instead. */
export function LastAdmin({ className }: { className?: string | undefined }) {
	return (
		<p className={cn("type-label", className)}>
			You’re the only admin of Tidemark, and a team always needs one. Make someone else an admin first, then you can step down or leave.
		</p>
	);
}

/** What leaving does to an editor's Mac, before they say yes. `here` is the app; the browser says "your Mac". */
export function LeaveSays({ here = true, className }: { here?: boolean; className?: string | undefined }) {
	return (
		<div className={cn("flex flex-col gap-[12px] type-control", className)}>
			<p className="text-muted">
				You lose Tidemark’s projects straight away. The three folders on {here ? "this Mac" : "your Mac"} stay where they are as ordinary projects, and stop syncing with the team.
			</p>
			<ul className="flex flex-col gap-[4px]">
				{FOLDERS.map((folder) => (
					<li key={folder} className="text-text type-value">
						{`~/tidemark/${folder.replace(" ", "-")}`}
					</li>
				))}
			</ul>
			<p className="text-muted">Pages Tidemark has shared keep working for the people they were shared with.</p>
		</div>
	);
}

/** A modal over whatever host it is in. */
export function Dialog({ title, children, actions, width = 460 }: { title: string; children: ReactNode; actions: ReactNode; width?: number }) {
	return (
		<div className="absolute inset-0 z-40 flex items-start justify-center bg-[color-mix(in_oklab,var(--color-bg)_72%,transparent)] pt-[150px]">
			<div className="animate-find-panel-in rounded-[10px] border border-border-raised bg-surface p-[26px]" style={{ width }}>
				<h2 className="mb-[14px] type-heading">{title}</h2>
				{children}
				<div className="mt-[24px] flex justify-end gap-[10px]">{actions}</div>
			</div>
		</div>
	);
}

/* ── settings ──────────────────────────────────────────────── */

export function SettingRow({ label, says, children, top = true }: { label: string; says?: ReactNode; children?: ReactNode; top?: boolean }) {
	return (
		<div className={cn("flex items-start justify-between gap-[40px] py-[18px]", top && "border-border border-t")}>
			<span className="flex min-w-0 flex-col gap-[4px]">
				<span className="type-control">{label}</span>
				{says && <span className="max-w-[400px] text-muted type-label">{says}</span>}
			</span>
			<span className="flex shrink-0 items-center gap-[8px]">{children}</span>
		</div>
	);
}

export function TextField({ value, prefix, width = 240 }: { value: string; prefix?: string; width?: number }) {
	return (
		<span className="flex h-[34px] items-center rounded-[7px] border border-border-raised bg-bg px-[11px]" style={{ width }}>
			{prefix && <span className="text-muted type-value">{prefix}</span>}
			<span className={cn(prefix ? "type-value" : "type-control")}>{value}</span>
		</span>
	);
}

/** Billing, deliberately empty this round: where it will sit, not how it works. */
export function BillingSlot({ className }: { className?: string | undefined }) {
	return (
		<div className={cn("flex h-[92px] flex-col justify-center gap-[4px] rounded-[8px] border border-border-raised border-dashed px-[20px]", className)}>
			<span className="type-control">Billing</span>
			<span className="text-muted type-label">Plan, card and invoices will sit here.</span>
		</div>
	);
}

export function DeleteSays() {
	return <>Everyone loses access at once. spool keeps the cloud copy and its history for 30 days, then deletes them for good. Folders on people’s Macs stay as ordinary projects.</>;
}

/* ── captions ──────────────────────────────────────────────── */

export function Caption({ children }: { children: ReactNode }) {
	return <p className="pointer-events-none absolute bottom-[18px] left-[18px] z-50 max-w-[46ch] rounded-[6px] bg-bg px-[8px] py-[5px] text-muted type-control">{children}</p>;
}
