import type { ReactNode } from "react";
import { person, SHARES, type Share } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { CanvasTools } from "shared/ui/spool/canvas-tools";
import { AgentIcon, ChevronIcon, FolderIcon, FrameIcon, PanelCaret, PropertiesIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * DEV-158, who a project is shared with: what the three takes draw on.
 *
 * tidemark app has two shares in the fixture. Mira shared `checkout` with two
 * people at Harbour Bank, and Jonas made one link that carries `onboarding`
 * and `receipt`. Both are Tidemark's, so Mira can change or stop Jonas's link.
 * The canvas, the rail and the faces here are the shipped canvas and the
 * read-only browser canvas (DEV-114) at the size these takes need.
 */

export const PROJECT = "tidemark app";
export const APP_SHARES = SHARES.filter((share) => share.project === PROJECT);
export const PEOPLE_SHARE = APP_SHARES.find((share) => share.kind === "people") as Share;
export const LINK_SHARE = APP_SHARES.find((share) => share.kind === "link") as Share;
export const LINK_URL = "tidemark-k3v9.onspool.page";
/** the person Mira adds to the checkout share in the `--manage` states */
export const ADDED = "maja.l@harbourbank.se";

export type Who = "mira" | "lena";

export interface CanvasPage {
	name: string;
	frames: string[];
	share?: Share["kind"] | undefined;
}

/** tidemark app's pages. Three of them are shared, by two shares. */
export const PAGES: CanvasPage[] = [
	{ name: "onboarding", frames: ["welcome", "sign in", "allow location"], share: "link" },
	{ name: "menu", frames: ["menu", "item"] },
	{ name: "checkout", frames: ["cart", "paid"], share: "people" },
	{ name: "receipt", frames: ["receipt"], share: "link" },
	{ name: "account", frames: ["profile", "orders"] },
];

const SCREENS: Record<string, CoffeeScreenName> = { cart: "cart", paid: "receipt", receipt: "receipt", menu: "menu" };

export const shareOf = (page: string) => APP_SHARES.find((share) => share.pages.includes(page));

/* ── faces ─────────────────────────────────────────────────── */

/** A Tidemark member, by fixture id. */
export function Face({ id, size = 22, ring = "border-bg" }: { id: string; size?: number; ring?: string }) {
	const someone = person(id);
	return (
		<span
			className={cn("inline-grid shrink-0 place-items-center rounded-full border-2 font-medium text-[#151515]", ring)}
			style={{ background: someone.hue, width: size, height: size, fontSize: Math.round(size * 0.36) }}
			title={someone.name}
		>
			{someone.initials}
		</span>
	);
}

export function Faces({ ids, size = 22 }: { ids: string[]; size?: number }) {
	return (
		<span className="flex">
			{ids.map((id, index) => (
				<span key={id} style={{ marginLeft: index === 0 ? 0 : -Math.round(size * 0.22) }}>
					<Face id={id} size={size} />
				</span>
			))}
		</span>
	);
}

/** Someone outside the team. Only an address, so only its first letter, and no colour of a member's. */
export function Outsider({ email, size = 22 }: { email: string; size?: number }) {
	return (
		<span
			className="inline-grid shrink-0 place-items-center rounded-full border border-border-raised bg-surface text-muted"
			style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
		>
			{email[0]?.toUpperCase()}
		</span>
	);
}

export function PeopleGlyph({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", className)} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
			<circle cx="6" cy="5.5" r="2.3" />
			<path d="M1.8 13c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6" strokeLinecap="round" />
			<path d="M10.4 3.4a2.3 2.3 0 0 1 0 4.3M12 9.7c1.2.5 2 1.6 2.3 3.3" strokeLinecap="round" />
		</svg>
	);
}

export function LinkGlyph({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", className)} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
			<path d="M7 9a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
			<path d="M9 7a2.6 2.6 0 0 0-3.7 0L3.1 9.2a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
		</svg>
	);
}

export function KindGlyph({ kind, className }: { kind: Share["kind"]; className?: string | undefined }) {
	return kind === "people" ? <PeopleGlyph className={className} /> : <LinkGlyph className={className} />;
}

/* ── small parts ───────────────────────────────────────────── */

/** the take and its bet, two sentences at most, in the frame's bottom-left corner */
export function Caption({ left = 24, children }: { left?: number; children: ReactNode }) {
	return (
		<p className="pointer-events-none absolute bottom-6 z-40 max-w-[46ch] text-base text-muted leading-base" style={{ left }}>
			{children}
		</p>
	);
}

export function Pages({ names }: { names: string[] }) {
	return (
		<span className="flex flex-wrap gap-1">
			{names.map((name) => (
				<span key={name} className="flex h-5 items-center rounded-xs bg-surface px-1.5 text-text type-detail">
					{name}
				</span>
			))}
		</span>
	);
}

export function TextButton({ children, danger = false, onClick }: { children: ReactNode; danger?: boolean; onClick?: (() => void) | undefined }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn("cursor-pointer text-muted type-label transition-colors", danger ? "hover:text-thread" : "hover:text-text")}
		>
			{children}
		</button>
	);
}

export function SmallButton({ children, primary = false, onClick }: { children: ReactNode; primary?: boolean; onClick?: (() => void) | undefined }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"h-6 shrink-0 cursor-pointer rounded-xs px-2.5 type-label transition-[transform,background-color] active:scale-[0.97]",
				primary ? "bg-thread text-on-thread" : "bg-surface text-text hover:bg-border-raised",
			)}
		>
			{children}
		</button>
	);
}

/** The shipped address field with its chips, caught mid-typing. */
export function AddressField({ emails, typing }: { emails: string[]; typing?: string }) {
	return (
		<div className="flex min-h-8 flex-wrap items-center gap-1 rounded-sm border border-muted bg-surface px-1.5 py-1">
			{emails.map((email) => (
				<span key={email} className="flex h-5 items-center gap-1 rounded-xs bg-raised pr-1 pl-1.5 text-text type-detail">
					{email}
					<span className="text-muted">×</span>
				</span>
			))}
			{typing === undefined ? null : <span className="px-1 text-text type-detail">{typing}</span>}
			<span className="h-3.5 w-px animate-pulse bg-text" />
		</div>
	);
}

/* ── the canvas, in the app or in a browser ────────────────── */

/**
 * tidemark app open on one page. In the app it is the shipped canvas, Mira
 * signed in as an editor; on the web it is the read-only canvas Lena gets as a
 * viewer, with no tools, no dock and no Open in spool.
 */
export function ProjectCanvas({
	who,
	page,
	rail,
	corner,
	children,
}: {
	who: Who;
	page: string;
	/** the pages rail, handed in so a take can mark it */
	rail: ReactNode;
	/** the canvas's top-right corner: faces, and whatever control a take puts there */
	corner?: ReactNode;
	children?: ReactNode;
}) {
	const body = (
		<div className="flex h-full w-full overflow-hidden bg-bg text-text">
			{rail}
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				<Field page={page} />
				<div className="absolute top-3.5 right-4 z-20 flex items-center gap-3">{corner}</div>
				{who === "mira" ? <CanvasTools tool="select" /> : null}
				{children}
			</div>
			{who === "mira" ? <DockStrip /> : null}
		</div>
	);
	if (who === "lena") {
		return (
			<PlayedTab title="tidemark app · spool" url={`spool.page/tidemark/tidemark-app/${page}`} sibling="Slack">
				{body}
			</PlayedTab>
		);
	}
	return (
		<SpoolShell activeTab={PROJECT} tabs={[PROJECT, "kaffe"]} zoom="64%">
			{body}
		</SpoolShell>
	);
}

function DockStrip() {
	return (
		<aside className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5">
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted">
				<PropertiesIcon className="h-4 w-4" />
			</span>
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted">
				<AgentIcon className="h-4 w-4" />
			</span>
		</aside>
	);
}

/** The page's frames, with the shipped label chip on every frame of a shared page. */
function Field({ page }: { page: string }) {
	const frames = PAGES.find((item) => item.name === page)?.frames ?? [];
	const shared = shareOf(page) !== undefined;
	return (
		<>
			{frames.map((frame, index) => (
				<div key={frame} className="absolute flex flex-col gap-1.5" style={{ left: 120 + index * 330, top: 120 + (index % 2) * 28 }}>
					<div className="flex h-4 items-center gap-2 type-value">
						<span className="text-muted">{frame}</span>
						{shared ? (
							<span className="flex items-center gap-1.5 text-text type-detail">
								<span className="h-1.5 w-1.5 rounded-full bg-thread" />
								shared
							</span>
						) : null}
					</div>
					<div className="h-[560px] w-[258px]">
						<CoffeeScreen screen={SCREENS[frame] ?? "menu"} />
					</div>
				</div>
			))}
		</>
	);
}

/* ── the pages rail ────────────────────────────────────────── */

export const RAIL_W = 248;

/**
 * The shipped pages rail, drawn here so a take can put a mark on a row and
 * hang something off its foot. `marks` false draws it exactly as it ships.
 */
export function PagesRail({
	who,
	page,
	marks = false,
	foot,
}: {
	who: Who;
	page: string;
	marks?: boolean;
	foot?: ReactNode;
}) {
	return (
		<aside className="flex h-full shrink-0 flex-col border-border border-r bg-bg" style={{ width: RAIL_W }}>
			{who === "mira" ? (
				<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
					<div className="flex items-baseline gap-2">
						<h1 className="font-semibold type-control">Pages</h1>
						<span className="text-muted type-value">{PAGES.length}</span>
					</div>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
			) : (
				<div className="flex h-12 shrink-0 items-center gap-2.5 border-border border-b px-4">
					<span className="grid h-5 w-5 place-items-center rounded-[5px] bg-[#2E5D70] font-medium text-[#E4F0F4] text-[11px]">T</span>
					<span className="type-control">{PROJECT}</span>
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{PAGES.map((row) => (
					<PageRow key={row.name} row={row} active={row.name === page} mark={marks} />
				))}
			</div>
			{foot}
			{who === "lena" ? (
				<div className="flex h-11 shrink-0 items-center border-border border-t px-4 text-muted type-detail">lena.holm@gmail.com</div>
			) : null}
		</aside>
	);
}

function PageRow({ row, active, mark }: { row: CanvasPage; active: boolean; mark: boolean }) {
	return (
		<div>
			<div className={cn("relative flex h-8 items-center pr-2.5", active && "bg-surface")}>
				{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
				<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
					<ChevronIcon open={active} className="h-2.5 w-2.5" />
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
					<span className={cn("min-w-0 flex-1 truncate type-value", active ? "text-text" : "text-muted")}>{row.name}</span>
				</span>
				{mark && row.share !== undefined ? (
					<span className={cn("mr-2.5", active ? "text-text" : "text-muted")} title={row.share === "people" ? "shared with people" : "shared by link"}>
						<KindGlyph kind={row.share} className="h-3 w-3" />
					</span>
				) : null}
				<span className="text-muted type-detail">{row.frames.length}</span>
			</div>
			{active ? (
				<div className="relative pb-0.5">
					<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
					{row.frames.map((frame) => (
						<div key={frame} className="relative flex h-7 items-center">
							<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
							<span className="flex min-w-0 flex-1 items-center gap-2 pl-[34px]">
								<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
								<span className="min-w-0 flex-1 truncate text-muted type-value">{frame}</span>
							</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

/** Who made a share and when, the way a chip says it. */
export function madeBy(share: Share, who: Who) {
	return `${share.by === who ? "you" : person(share.by).name.split(" ")[0]?.toLowerCase()} · ${share.when}`;
}
