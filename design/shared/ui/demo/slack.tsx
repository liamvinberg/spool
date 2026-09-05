import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

/**
 * Slack, as a frame can hold it: the dark theme, the workspace rail, the
 * channel sidebar, a message column and the composer. It is a representation
 * rather than a replica — enough of Slack that a link pasted into it reads as
 * a link pasted into Slack.
 *
 * It speaks as Slack: Slack's own greys, Slack's own blues, Slack's own words
 * ("Message #design"), never spool's tokens and never spool's voice. Props in,
 * no knowledge — a prototype hands it messages and an unfurl and gets a
 * workspace back.
 */

/* Slack's dark theme, sampled: the workspace rail is darker than the sidebar,
   the sidebar and the message column share a surface, and the active channel
   is the one saturated thing on screen. */
const RAIL = "#121016";
const COLUMN = "#1A1D21";
const LINE = "#35373B";
const RAISED = "#222529";
const TEXT = "#D1D2D3";
const MUTED = "#ABABAD";
const ACTIVE = "#1164A3";
const LINK = "#1D9BD1";
const PRESENCE = "#2BAC76";

export interface SlackRow {
	name: string;
	kind?: "channel" | "dm";
	active?: boolean;
	unread?: number;
	presence?: "active" | "away";
}

export function SlackWindow({
	workspace,
	rows,
	channel,
	topic,
	members,
	you = "LV",
	children,
	composer = `Message #${channel}`,
}: {
	workspace: string;
	rows: readonly SlackRow[];
	channel: string;
	topic?: string;
	members?: number;
	/** the signed-in person's initials, on the rail's avatar */
	you?: string;
	children: ReactNode;
	composer?: string;
}) {
	const channels = rows.filter((row) => (row.kind ?? "channel") === "channel");
	const dms = rows.filter((row) => row.kind === "dm");
	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden font-sans antialiased [font-synthesis:none]"
			style={{ background: RAIL, color: TEXT }}
		>
			<div className="flex h-11 shrink-0 items-center px-3">
				<div className="flex w-[68px] items-center gap-3 pl-1" style={{ color: MUTED }}>
					<HistoryArrow />
					<HistoryArrow className="rotate-180" />
				</div>
				<div
					className="mx-auto flex h-7 w-[420px] items-center gap-2 rounded-md px-3"
					style={{ background: RAISED, color: MUTED }}
				>
					<SearchGlass />
					<span className="text-[13px] leading-none">Search {workspace}</span>
				</div>
				<span className="w-[68px]" />
			</div>

			<div className="flex min-h-0 flex-1">
				<nav className="flex w-[68px] shrink-0 flex-col items-center gap-5 pt-1.5">
					<div
						className="flex h-9 w-9 items-center justify-center rounded-lg font-semibold text-[15px]"
						style={{ background: "#E8912D", color: "#1A1D21" }}
					>
						{workspace.slice(0, 1)}
					</div>
					<div className="flex flex-col items-center gap-4">
						<RailIcon label="Home" active />
						<RailIcon label="DMs" />
						<RailIcon label="Activity" />
					</div>
					<div
						className="mt-auto mb-4 flex h-8 w-8 items-center justify-center rounded-lg font-medium text-[12px]"
						style={{ background: "#4A154B", color: "#FFFFFF" }}
					>
						{you}
					</div>
				</nav>

				<aside
					className="flex w-[248px] shrink-0 flex-col rounded-tl-lg border-t border-l"
					style={{ background: COLUMN, borderColor: LINE }}
				>
					<div className="flex h-[50px] shrink-0 items-center justify-between border-b px-4" style={{ borderColor: LINE }}>
						<span className="font-bold text-[15px] leading-none">{workspace}</span>
						<span
							className="flex h-6 w-6 items-center justify-center rounded-md text-[15px]"
							style={{ background: "#FFFFFF", color: "#1A1D21" }}
						>
							<PencilIcon />
						</span>
					</div>
					<div className="flex min-h-0 flex-1 flex-col gap-4 px-2 pt-3">
						<SidebarSection label="Channels" rows={channels} />
						<SidebarSection label="Direct messages" rows={dms} />
					</div>
				</aside>

				<section className="flex min-w-0 flex-1 flex-col border-t" style={{ background: COLUMN, borderColor: LINE }}>
					<header
						className="flex h-[50px] shrink-0 items-center gap-3 border-b px-5"
						style={{ borderColor: LINE }}
					>
						<span className="font-bold text-[15px] leading-none">
							<span style={{ color: MUTED }}>#</span> {channel}
						</span>
						{members === undefined ? null : (
							<span
								className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] leading-none"
								style={{ color: MUTED, background: RAISED }}
							>
								<PeopleIcon /> {members}
							</span>
						)}
						{topic === undefined ? null : (
							<span className="truncate text-[13px] leading-none" style={{ color: MUTED }}>
								{topic}
							</span>
						)}
					</header>

					<div className="flex min-h-0 flex-1 flex-col justify-end gap-5 px-5 pb-4">{children}</div>

					<div className="shrink-0 px-5 pb-6">
						<div className="overflow-hidden rounded-lg border" style={{ borderColor: "#565856" }}>
							<div className="flex h-8 items-center gap-3 border-b px-3" style={{ borderColor: LINE, color: MUTED }}>
								<span className="font-bold text-[13px]">B</span>
								<span className="text-[13px] italic">I</span>
								<span className="text-[13px] line-through">S</span>
								<span className="text-[13px]">🔗</span>
							</div>
							<div className="flex h-[46px] items-center px-3 text-[15px]" style={{ color: MUTED }}>
								{composer}
							</div>
							<div className="flex h-9 items-center gap-3 px-3" style={{ color: MUTED }}>
								<span className="text-[15px]">＋</span>
								<span className="text-[15px]">😊</span>
								<span className="text-[15px]">@</span>
								<span
									className="ml-auto flex h-6 w-8 items-center justify-center rounded"
									style={{ background: "#2F3136", color: "#696A6D" }}
								>
									<SendIcon />
								</span>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

function SidebarSection({ label, rows }: { label: string; rows: readonly SlackRow[] }) {
	if (rows.length === 0) return null;
	return (
		<div className="flex flex-col">
			<div className="flex h-7 items-center gap-1.5 px-2 text-[13px]" style={{ color: MUTED }}>
				<Caret />
				{label}
			</div>
			{rows.map((row) => (
				<div
					key={row.name}
					className={cn("flex h-[28px] items-center gap-2 rounded-md px-2 text-[15px]")}
					style={{
						background: row.active === true ? ACTIVE : undefined,
						color: row.active === true ? "#FFFFFF" : row.unread === undefined ? MUTED : TEXT,
						fontWeight: row.unread === undefined ? 400 : 700,
					}}
				>
					{row.kind === "dm" ? (
						<span className="flex h-4 w-4 shrink-0 items-center justify-center">
							<span
								className="h-2 w-2 rounded-full"
								style={{
									background: row.presence === "active" ? PRESENCE : "transparent",
									border: row.presence === "active" ? undefined : `1.5px solid ${MUTED}`,
								}}
							/>
						</span>
					) : (
						<span className="w-4 shrink-0 text-center">#</span>
					)}
					<span className="min-w-0 truncate">{row.name}</span>
					{row.unread === undefined ? null : (
						<span
							className="ml-auto shrink-0 rounded-full px-1.5 py-[1px] text-[11px] font-bold leading-none"
							style={{ background: "#CD2553", color: "#FFFFFF" }}
						>
							{row.unread}
						</span>
					)}
				</div>
			))}
		</div>
	);
}

/** One posted message. `tint` colours the avatar tile, which is all an avatar is here. */
export function SlackMessage({
	author,
	initials,
	tint,
	time,
	children,
	reactions = [],
}: {
	author: string;
	initials: string;
	tint: string;
	time: string;
	children: ReactNode;
	reactions?: readonly { emoji: string; count: number; mine?: boolean }[];
}) {
	return (
		<div className="flex gap-3">
			<div
				className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-semibold text-[13px]"
				style={{ background: tint, color: "#FFFFFF" }}
			>
				{initials}
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-baseline gap-2">
					<span className="font-bold text-[15px] leading-none">{author}</span>
					<span className="text-[12px] leading-none" style={{ color: MUTED }}>
						{time}
					</span>
				</div>
				<div className="flex flex-col gap-2 text-[15px] leading-[22px]">{children}</div>
				{reactions.length === 0 ? null : (
					<div className="flex gap-1.5 pt-0.5">
						{reactions.map((reaction) => (
							<span
								key={reaction.emoji}
								className="flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[12px] leading-none"
								style={{
									borderColor: reaction.mine === true ? LINK : LINE,
									background: reaction.mine === true ? "rgba(29,155,209,0.12)" : RAISED,
									color: TEXT,
								}}
							>
								<span className="text-[13px]">{reaction.emoji}</span>
								{reaction.count}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** A link in a message: Slack blue, and pressable when the prototype gives it a target. */
export function SlackLink({ children, onOpen }: { children: ReactNode; onOpen?: (() => void) | undefined }) {
	return (
		<a
			href="#"
			onClick={(event) => {
				event.preventDefault();
				onOpen?.();
			}}
			className="underline-offset-2 hover:underline"
			style={{ color: LINK }}
		>
			{children}
		</a>
	);
}

/**
 * The unfurl: Slack's attachment, a coloured bar down the left and the sending
 * service's own name at the top. Whatever the service put in the card goes in
 * as children, so a spool link carries a still of the frame.
 */
export function SlackUnfurl({
	accent = "#F5391A",
	service,
	serviceMark,
	title,
	onOpen,
	meta,
	description,
	preview,
}: {
	accent?: string;
	service: string;
	serviceMark?: ReactNode;
	title: string;
	onOpen?: (() => void) | undefined;
	meta?: string;
	description?: string;
	preview?: ReactNode;
}) {
	return (
		<div className="flex max-w-[520px] gap-3 pt-0.5 pl-0.5">
			<span className="w-1 shrink-0 rounded-full" style={{ background: accent }} />
			<div className="flex min-w-0 flex-1 gap-4">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<span className="flex items-center gap-1.5 text-[13px] leading-none" style={{ color: MUTED }}>
						{serviceMark}
						{service}
					</span>
					<a
						href="#"
						onClick={(event) => {
							event.preventDefault();
							onOpen?.();
						}}
						className="font-bold text-[15px] leading-[20px] underline-offset-2 hover:underline"
						style={{ color: LINK }}
					>
						{title}
					</a>
					{description === undefined ? null : (
						<span className="text-[13px] leading-[19px]" style={{ color: TEXT }}>
							{description}
						</span>
					)}
					{meta === undefined ? null : (
						<span className="font-mono text-[12px] leading-none" style={{ color: MUTED }}>
							{meta}
						</span>
					)}
				</div>
				{preview === undefined ? null : (
					<div
						className="shrink-0 overflow-hidden rounded-md border"
						style={{ borderColor: LINE, background: RAISED }}
					>
						{preview}
					</div>
				)}
			</div>
		</div>
	);
}

function RailIcon({ label, active = false }: { label: string; active?: boolean }) {
	return (
		<div className="flex w-full flex-col items-center gap-1">
			<span
				className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px]"
				style={{ background: active ? "#2F3136" : "transparent", color: active ? "#FFFFFF" : MUTED }}
			>
				{label === "Home" ? <HomeIcon /> : label === "DMs" ? <ChatIcon /> : <BellIcon />}
			</span>
			<span className="text-[11px] leading-none" style={{ color: active ? "#FFFFFF" : MUTED }}>
				{label}
			</span>
		</div>
	);
}

function HistoryArrow({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("h-4 w-4", className)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="m10 3.5-4.5 4.5 4.5 4.5" />
		</svg>
	);
}

function SearchGlass() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
			<circle cx="7" cy="7" r="4.2" />
			<path d="m10.2 10.2 3 3" strokeLinecap="round" />
		</svg>
	);
}

function PencilIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
			<path d="M10.5 3.2 12.8 5.5 6 12.3l-3 .7.7-3z" />
		</svg>
	);
}

function PeopleIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
			<circle cx="6" cy="5.4" r="2.4" />
			<path d="M1.6 12.6c0-2.2 2-3.6 4.4-3.6s4.4 1.4 4.4 3.6z" />
			<circle cx="11.6" cy="6" r="1.9" opacity="0.7" />
		</svg>
	);
}

function SendIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
			<path d="M2 8 13.5 3 9.8 13 8 9.2z" />
		</svg>
	);
}

function Caret() {
	return (
		<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="m2 4 3 3 3-3" />
		</svg>
	);
}

function HomeIcon() {
	return (
		<svg viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
			<path d="M3 8 9 3l6 5v6.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
		</svg>
	);
}

function ChatIcon() {
	return (
		<svg viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
			<path d="M3 4.5h12v7H8l-3.5 2.6V11.5H3z" />
		</svg>
	);
}

function BellIcon() {
	return (
		<svg viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
			<path d="M4.8 12.5V8a4.2 4.2 0 0 1 8.4 0v4.5l1.1 1.5H3.7z" />
			<path d="M7.4 16h3.2" strokeLinecap="round" />
		</svg>
	);
}
