import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { Count, Face, Grid, Host, Layout, NavItem, OWN, TEAM, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { ChevronIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * DEV-158: the pieces signing in and accepting an invite draw with. spool.page
 * pages are the sharing beta's plain 400px dark column; the app is DEV-121's
 * Home, assembled from its parts, because a signed-out Home and a Home with an
 * invite in it are states that question never drew.
 */

export type Links<K extends string> = Partial<Record<K, () => void>>;

export const BUTTON = HOME_ACTION;
export const PRIMARY = HOME_ACTION_PRIMARY;
export const WIDE = "h-[40px] w-full";

/* ── the browser ───────────────────────────────────────────── */

/** A spool.page page in the browser: the beta's 400px column, centred. */
export function WebPage({
	url,
	title,
	caption,
	overlay,
	head,
	sibling = "Slack",
	children,
}: {
	url: string;
	/** the tab beside this one: where the person came from */
	sibling?: string;
	title: string;
	caption?: string | undefined;
	overlay?: ReactNode;
	/** what sits over the heading: spool's brand, or the team being joined */
	head?: ReactNode;
	children: ReactNode;
}) {
	return (
		<PlayedTab title={`${title} · spool`} url={url} sibling={sibling}>
			<div className="relative h-full overflow-hidden bg-bg text-text">
				<div className="flex h-full items-center justify-center pb-[56px]">
					<main className="flex w-[400px] flex-col gap-[24px]">
						{head ?? <Brand />}
						{children}
					</main>
				</div>
				{overlay}
				{caption && <Caption text={caption} />}
			</div>
		</PlayedTab>
	);
}

export function Brand() {
	return (
		<p className="flex items-center gap-[8px] type-title">
			<SpoolMark className="h-[18px] w-[14px] text-thread" />
			spool
		</p>
	);
}

export function Title({ children }: { children: ReactNode }) {
	return <h1 className="type-page">{children}</h1>;
}

export function Says({ children, className }: { children: ReactNode; className?: string }) {
	return <p className={cn("text-muted type-body", className)}>{children}</p>;
}

export function Small({ children, className }: { children: ReactNode; className?: string }) {
	return <p className={cn("text-muted type-label", className)}>{children}</p>;
}

/** The take and its bet, bottom left. In the app it clears the sidebar, whose foot is often the subject. */
export function Caption({ text, left = 24 }: { text: string; left?: number }) {
	return (
		<p className="pointer-events-none absolute bottom-[24px] z-40 max-w-[42ch] text-muted type-control" style={{ left }}>
			{text}
		</p>
	);
}

/** An input the way the beta draws it. `focus` puts the caret at the end of the value. */
export function Field({
	label,
	value,
	placeholder,
	focus = false,
	fixed = false,
	trail,
	children,
}: {
	label?: string | undefined;
	value?: string | undefined;
	placeholder?: string | undefined;
	focus?: boolean;
	/** an address that is not yours to change */
	fixed?: boolean;
	trail?: ReactNode;
	/** what hangs under the field, like the browser's autofill */
	children?: ReactNode;
}) {
	return (
		<label className="relative flex flex-col gap-[8px] type-control">
			{label && <span>{label}</span>}
			<span
				className={cn(
					"flex h-[40px] items-center gap-[8px] rounded-[6px] border bg-bg px-[12px] type-body",
					focus ? "border-muted" : "border-border-raised",
					fixed && "bg-surface",
				)}
			>
				<span className={cn("min-w-0 truncate", !value && "text-muted")}>{value ?? placeholder}</span>
				{focus && <span className="-ml-[6px] h-[18px] w-px animate-pulse bg-text" />}
				<span className="ml-auto flex items-center gap-[8px]">{trail}</span>
			</span>
			{children}
		</label>
	);
}

export function Or() {
	return (
		<div className="flex items-center gap-[12px] text-muted type-detail">
			<span className="h-px flex-1 bg-border" />
			or
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}

export function GoogleMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 18 18" className={cn("h-[16px] w-[16px] shrink-0", className)} aria-hidden="true">
			<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
			<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
			<path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z" />
			<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
		</svg>
	);
}

/** The fingerprint the Mac draws for Touch ID, in line weight. */
export function TouchId({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" className={cn("h-[32px] w-[32px]", className)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
			<path d="M8.5 7.5A11 11 0 0 1 27 16" />
			<path d="M5 13a11 11 0 0 1 1.6-3.6" />
			<path d="M5.3 20.5A11 11 0 0 1 5 17" />
			<path d="M10 25.5c-1-2-1.6-4.6-1.6-8.5a7.6 7.6 0 0 1 15.2 0v1" />
			<path d="M14 27c-1-2.4-1.8-5.6-1.8-10a3.8 3.8 0 0 1 7.6 0c0 4.4 1 7 2.2 9" />
			<path d="M16 17c0 4.4.8 7.6 2.4 10.4" />
			<path d="M23.6 22c.3 1.6.8 3 1.4 4" />
		</svg>
	);
}

/** Six boxes for the emailed code. `typed` is how many digits are in. */
export function CodeBoxes({ digits = "481902", typed = 4, wrong = false }: { digits?: string; typed?: number; wrong?: boolean }) {
	return (
		<div className="flex gap-[8px]">
			{digits.split("").map((digit, index) => (
				<span
					key={index}
					className={cn(
						"grid h-[56px] flex-1 place-items-center rounded-[6px] border bg-bg text-[22px] [font-family:var(--font-mono)]",
						index === typed ? "border-muted" : "border-border-raised",
						wrong && "border-thread",
						index === 2 && "mr-[10px]",
					)}
				>
					{index < typed ? digit : index === typed ? <span className="h-[24px] w-px animate-pulse bg-text" /> : ""}
				</span>
			))}
		</div>
	);
}

/**
 * The browser's own passkey sheet, hung under the address bar the way Chrome
 * draws it on a Mac. It is the browser speaking, so it wears the browser's grey.
 */
export function PasskeySheet({ email }: { email: string }) {
	return (
		<div className="absolute top-[8px] right-[64px] z-30 w-[340px] animate-menu-in rounded-[10px] border border-[#3A3A40] bg-[#2A2A2E] p-[20px] text-[#E6E6E8]">
			<p className="type-title">Use your passkey for spool.page</p>
			<div className="my-[18px] flex items-center gap-[14px]">
				<TouchId className="text-[#F07B6A]" />
				<span className="flex flex-col">
					<span className="type-control">{email}</span>
					<span className="text-[#9A9AA0] type-label">Touch ID to continue</span>
				</span>
			</div>
			<div className="flex justify-end">
				<span className="rounded-[6px] border border-[#46464C] px-[12px] py-[4px] type-control">Cancel</span>
			</div>
		</div>
	);
}

/* ── the app ───────────────────────────────────────────────── */

/** The switcher's own button, drawn for states DEV-121's TeamSwitch never needed. */
export function Switch({ mark, label, dot = false, open = false }: { mark: ReactNode; label: string; dot?: boolean; open?: boolean }) {
	return (
		<button
			type="button"
			className={cn("flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface", open && "bg-surface")}
		>
			{mark}
			<span className="flex-1 type-control">{label}</span>
			{dot && <span className="h-[7px] w-[7px] rounded-full bg-thread" />}
			<ChevronIcon className="h-[10px] w-[10px] text-muted" />
		</button>
	);
}

export const OwnMark = () => (
	<span className="grid h-[20px] w-[20px] place-items-center">
		<FrameIcon className="h-[16px] w-[16px] text-muted" />
	</span>
);

export function LetterMark({ letter, hue, size = 20 }: { letter: string; hue: string; size?: number }) {
	return (
		<span
			className="grid shrink-0 place-items-center rounded-[5px] font-medium text-[#EDEDED]"
			style={{ background: hue, width: size, height: size, fontSize: Math.round(size * 0.52) }}
		>
			{letter}
		</span>
	);
}

export const TidemarkMark = TeamMark;

/** A menu hanging from the switcher. */
export function SwitchMenu({ children, width = 260 }: { children: ReactNode; width?: number }) {
	return (
		<div className="absolute top-[140px] left-[16px] z-30 animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]" style={{ width }}>
			{children}
		</div>
	);
}

export function MenuRow({
	mark,
	label,
	detail,
	checked = false,
	quiet = false,
	onClick,
}: {
	mark?: ReactNode;
	label: ReactNode;
	detail?: ReactNode;
	checked?: boolean;
	quiet?: boolean;
	onClick?: (() => void) | undefined;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn("flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[9px] text-left hover:bg-surface", checked && "bg-surface")}
		>
			{mark !== undefined && <span className="grid w-[20px] shrink-0 place-items-center">{mark}</span>}
			<span className={cn("min-w-0 flex-1 truncate type-control", quiet && "text-muted")}>{label}</span>
			{detail && <span className="shrink-0 text-muted type-detail">{detail}</span>}
		</button>
	);
}

export const MenuRule = () => <div className="mx-[8px] my-[5px] h-px bg-border-raised" />;

export const MenuPlus = () => <PlusIcon className="h-[10px] w-[10px] text-muted" />;

/** One line of confirmation, the canvas toast's shape. */
export function AppToast({ children }: { children: ReactNode }) {
	return (
		<div role="status" className="absolute bottom-[120px] left-1/2 z-30 -translate-x-1/2 animate-toast-in rounded-md border border-border-raised bg-raised px-[14px] py-[10px] type-control">
			{children}
		</div>
	);
}

/**
 * Home, one set of covers under the switcher. `team` puts Tidemark's projects
 * in it, otherwise it is your own. Everything the takes change rides in as a
 * slot: the switcher, the sidebar's foot, a line above the covers, an overlay.
 */
export function AppHome({
	switcher,
	foot,
	team = false,
	people = false,
	notice,
	overlay,
	caption,
	tabs = ["kaffe"],
}: {
	switcher: ReactNode;
	foot?: ReactNode;
	team?: boolean;
	/** a team has People under Projects; your own projects do not */
	people?: boolean;
	notice?: ReactNode;
	overlay?: ReactNode;
	caption?: string | undefined;
	tabs?: string[];
}) {
	const projects = team ? TEAM : OWN;
	return (
		<Host host="app" tabs={tabs}>
			<Layout
				nav={
					<>
						{switcher}
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
						{people && <NavItem label="People" count="5" />}
					</>
				}
				foot={foot}
			>
				<header className="mb-[31px] flex items-center justify-between gap-[25px]">
					<h1 className="type-page">Projects</h1>
					<div className="flex items-center gap-[13px]">
						{team && (
							<button type="button" className={HOME_ACTION}>
								Invite
							</button>
						)}
						<button type="button" className={HOME_ACTION_PRIMARY}>
							<PlusIcon className="h-[10px] w-[10px]" />
							New project…
						</button>
					</div>
				</header>
				{notice}
				<Count n={projects.length} />
				<Grid projects={projects} />
			</Layout>
			{overlay}
			{caption && <Caption text={caption} left={256} />}
		</Host>
	);
}

/** Ada's face and address, the way the account shows once she is signed in. */
export function Account({ email = "ada@tidemark.app", compact = false }: { email?: string; compact?: boolean }) {
	return (
		<span className="flex min-w-0 items-center gap-[10px]">
			<Face id="ada" size={compact ? 22 : 26} />
			<span className="flex min-w-0 flex-col">
				{!compact && <span className="truncate text-text type-control">Ada Lind</span>}
				<span className="truncate text-muted type-detail">{email}</span>
			</span>
		</span>
	);
}
