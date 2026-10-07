import type { ReactNode } from "react";
import {
	type Appearance,
	agent,
	element,
	home,
	menuItems,
	pages,
	railHint,
	selection,
	settingsRow,
	tabs,
	toast,
	zoom,
} from "shared/lib/explore/identity/world";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { projects } from "shared/ui/demo/home-data";
import {
	AgentIcon,
	ChevronIcon,
	CogIcon,
	EdgeIcon,
	EditIcon,
	FoldIcon,
	FolderIcon,
	FrameIcon,
	HandIcon,
	PanelCaret,
	PropertiesIcon,
	SelectIcon,
} from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import "./current.css";

/**
 * The baseline row: spool 0.31.1 redrawn as it ships, read off src/ui (ui.css,
 * typography.css, sidebar.tsx, dock.tsx, properties-rail.tsx, rail-fields.tsx,
 * agent-rail.tsx, overlays.tsx, frame-label.tsx, tab-strip.tsx, home.tsx) and the
 * 1440×900 screenshots. Every size here is the shipped one, uneven where the app
 * is uneven, so the other identity takes read as a diff against it. The Parts
 * sheet names those unevennesses as drift.
 */

type Panel = "properties" | "agent";

function Root({ appearance, className, children }: { appearance: Appearance; className?: string; children: ReactNode }) {
	return (
		<div data-appearance={appearance} className={cn("id-current relative overflow-hidden bg-bg text-text", className)}>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ icons -- */
/* src/ui/icons.tsx and sidebar.tsx draw these at their own sizes; kept verbatim. */

function HomeGlyph() {
	return (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
			<path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
		</svg>
	);
}

/** src/ui/icons.tsx PlusIcon: the tab strip's + and Home's New project. */
function AppPlus() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
			<path d="M5 1 L5 9 M1 5 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/** sidebar.tsx PlusIcon: a second plus, at another weight. */
function RailPlus({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path d="M5 .75v8.5M.75 5h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function AppClose() {
	return (
		<svg width="8" height="8" viewBox="0 0 16 16" aria-hidden="true">
			<path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
		</svg>
	);
}

function SearchGlyph() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
			<path d="m10.3 10.3 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

function StateCheck() {
	return (
		<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" aria-hidden="true">
			<path d="m3.4 7.2 2.4 2.4 4.8-5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function PlayTriangle() {
	return (
		<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
			<path d="M2 1.2 8.4 5 2 8.8Z" />
		</svg>
	);
}

function Unseen({ className }: { className?: string }) {
	return (
		<span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			<span className="block h-[5px] w-[5px] rounded-full bg-text/85" />
		</span>
	);
}

/* ------------------------------------------------------------- window bar -- */

function WindowBar({ project }: { project: boolean }) {
	return (
		<header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']">
			<div className="flex h-full min-w-0 flex-1 items-center">
				<div className="relative mr-[12px] flex h-full shrink-0 items-center pr-[16px] after:absolute after:right-0 after:h-[18px] after:w-px after:bg-border-raised after:content-['']">
					<span className={cn("flex h-[32px] items-center gap-[9px] pr-1 pl-1.5 type-control", project ? "text-muted" : "text-text")}>
						<HomeGlyph />
						<span>Home</span>
					</span>
				</div>
				<div className="flex h-full items-center gap-[2px] px-[2px]">
					{tabs.map((tab) => {
						const on = project && tab.active === true;
						return (
							<div key={tab.name} className="relative h-[36px] w-max min-w-[112px] shrink-0">
								{on ? (
									<span className="absolute inset-[0_0_-4px] rounded-t-[8px] border-border border-x border-t bg-canvas" />
								) : null}
								<span className={cn("relative flex h-full items-center pr-[38px] pl-3 type-control", on ? "text-text" : "text-muted")}>
									{tab.name}
								</span>
								{on ? (
									<span className="absolute top-1.5 right-[4px] flex h-[24px] w-[24px] items-center justify-center text-muted">
										<AppClose />
									</span>
								) : null}
							</div>
						);
					})}
					<span className="ml-[6px] flex h-[30px] w-[32px] items-center justify-center text-muted">
						<AppPlus />
					</span>
				</div>
			</div>
			{project ? (
				<div className="flex h-full shrink-0 items-center gap-4">
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-text">
						<EdgeIcon className="h-4 w-4" />
					</span>
					<span className="min-w-9 text-right text-muted type-detail">{zoom}</span>
				</div>
			) : null}
		</header>
	);
}

/* ------------------------------------------------------------- pages rail -- */

function PagesRail({ editing }: { editing: boolean }) {
	return (
		<aside className="flex h-full w-[248px] shrink-0 flex-col border-border border-r bg-bg">
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<span className="font-semibold type-control">Pages</span>
					<span className="text-muted type-detail">{pages.length}</span>
				</div>
				<div className="flex items-center">
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<RailPlus className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<FoldIcon className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
			</div>
			<div className="min-h-0 flex-1 py-2">
				{pages.map((page) => (
					<div key={page.name}>
						<PageRow name={page.name} count={page.count} open={page.open === true} current={page.current === true} />
						{page.open
							? page.frames.map((frame, index) => (
									<FrameRow
										key={frame.name}
										name={frame.name}
										selected={!editing && frame.selected === true}
										unseen={frame.unseen === true}
										last={index === page.frames.length - 1}
									/>
								))
							: null}
					</div>
				))}
			</div>
			<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 text-muted type-detail">{railHint}</div>
		</aside>
	);
}

function PageRow({
	name,
	count,
	open,
	current,
	hover,
}: {
	name: string;
	count: number;
	open: boolean;
	current: boolean;
	hover?: boolean;
}) {
	return (
		<div className={cn("relative flex h-8 items-center pr-1.5", current && "bg-surface", hover && "bg-surface/60")}>
			{current ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span className="flex h-full w-6 shrink-0 items-center justify-center text-muted">
				<ChevronIcon open={open} className="h-2.5 w-2.5" />
			</span>
			<span className="flex h-full min-w-0 flex-1 items-center gap-2 pr-3">
				<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", current ? "text-(--color-thread-strong)" : "text-muted")} />
				<span className={cn("min-w-0 flex-1 truncate type-value", current ? "text-text" : "text-muted")}>{name}</span>
			</span>
			{open ? null : <span className="shrink-0 text-muted type-detail">{count}</span>}
		</div>
	);
}

function FrameRow({
	name,
	selected,
	unseen,
	last,
	hover,
}: {
	name: string;
	selected: boolean;
	unseen: boolean;
	last: boolean;
	hover?: boolean;
}) {
	return (
		<div className={cn("relative flex h-7 items-center pr-1.5", selected && "bg-surface", hover && "bg-surface/60")}>
			<span className="absolute w-px bg-border-raised" style={{ left: 18, top: 0, height: last ? 22 : 28 }} />
			<span className="absolute h-px w-2.5 bg-border-raised" style={{ left: 18, top: 14 }} />
			<span className="flex h-full w-full min-w-0 items-center gap-2 pr-3" style={{ paddingLeft: 34 }}>
				<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-(--color-thread-strong)" : "text-muted")} />
				<span className={cn("min-w-0 flex-1 truncate type-value", selected || unseen ? "text-text" : "text-muted")}>
					{name}
				</span>
				{unseen ? <Unseen /> : null}
			</span>
		</div>
	);
}

/* ----------------------------------------------------------------- canvas -- */

/** 390×844 at 54%, the drawn size on the shipped screenshots. */
const FW = 211;
const FH = 456;
const FY = 244;
const FX = { cart: 312, menu: 566, receipt: 821 } as const;
const FRAME_ORDER = ["cart", "menu", "receipt"] as const;
const SHRINK = FW / 240;
/** world.element: the "1 × Cortado" row inside cart, in screen pixels */
const PICK = { x: 325, y: 287, w: 185, h: 27 };

function CanvasField({ panel, right }: { panel: Panel; right: number }) {
	const editing = panel === "agent";
	return (
		<div className="absolute top-[44px] bottom-0 left-[248px] overflow-hidden bg-canvas" style={{ right }}>
			<div className="absolute top-[-44px] left-[-248px] h-[900px] w-[1440px]">
				<FlowArrows />
				{FRAME_ORDER.map((name) => (
					<div key={name}>
						<div
							className="absolute flex items-center gap-1.5 whitespace-nowrap"
							style={{ left: FX[name], top: FY - 10 - 18, width: FW, height: 18 }}
						>
							{name === "receipt" ? <Unseen className="-ml-0.5" /> : null}
							<span
								className={cn(
									"min-w-0 truncate type-value",
									name === "cart" && !editing
										? "text-(--color-thread-strong)"
										: name === "receipt"
											? "text-text"
											: "text-muted",
								)}
							>
								{name}
							</span>
							{name === "cart" && !editing ? (
								<span className="ml-auto flex shrink-0 items-center gap-1 rounded-xs px-1 text-muted type-detail">
									<PlayTriangle />
									play
								</span>
							) : null}
						</div>
						<div className="absolute overflow-hidden rounded-[12px] bg-white" style={{ left: FX[name], top: FY, width: FW, height: FH }}>
							<div style={{ width: 240, height: 520, transform: `scale(${SHRINK})`, transformOrigin: "0 0" }}>
								<CoffeeScreen screen={name} />
							</div>
						</div>
					</div>
				))}
				{editing ? <ElementPick /> : <FrameSelection />}
			</div>
			<Tools active={editing ? "edit" : "select"} />
		</div>
	);
}

function FlowArrows() {
	return (
		<svg className="pointer-events-none absolute inset-0" width="1440" height="900" aria-hidden="true">
			{/* cart → receipt, from Pay; it runs under menu as the shipped layer does */}
			<g fill="none" stroke="var(--color-thread)" strokeWidth="1.5">
				<path d="M523 673 C 640 673, 700 472, 811 472" />
				<path d="M821 472 L811 467.5 L811 476.5 Z" fill="var(--color-thread)" stroke="none" />
			</g>
			{/* menu → cart, from Checkout */}
			<g fill="none" stroke="var(--color-thread)" strokeWidth="1.5">
				<path d="M566 680 C 528 690, 480 742, 478 711" />
				<path d="M478 701 L473.5 711 L482.5 711 Z" fill="var(--color-thread)" stroke="none" />
			</g>
			{/* receipt → menu, a might edge: faint (flow-arrows.tsx FAINT_OPACITY) */}
			<g fill="none" stroke="var(--color-thread)" strokeWidth="1.5" opacity="0.4">
				<path d="M904 700 C 904 750, 726 752, 722 711" />
				<path d="M722 701 L717.5 711 L726.5 711 Z" fill="var(--color-thread)" stroke="none" />
			</g>
		</svg>
	);
}

function FrameSelection() {
	const x = FX.cart;
	const corners = [
		[x - 3, FY - 3],
		[x + FW + 3, FY - 3],
		[x - 3, FY + FH + 3],
		[x + FW + 3, FY + FH + 3],
	];
	return (
		<>
			<div className="absolute rounded-[13px] border-[1.5px] border-thread" style={{ left: x - 2, top: FY - 2, width: FW + 4, height: FH + 4 }} />
			{corners.map(([cx, cy]) => (
				<div key={`${cx}-${cy}`} className="absolute flex h-4 w-4 items-center justify-center" style={{ left: (cx ?? 0) - 8, top: (cy ?? 0) - 8 }}>
					<div className="h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread" />
				</div>
			))}
			<div className="absolute flex justify-center" style={{ left: x, top: FY + FH + 12, width: FW }}>
				<span className="rounded-xs bg-(--color-thread-strong) px-2 py-[3px] text-on-thread type-detail">
					{selection.w} × {selection.h}
				</span>
			</div>
		</>
	);
}

function ElementPick() {
	return (
		<div className="absolute rounded-[4px] border border-thread" style={{ left: PICK.x - 2, top: PICK.y - 2, width: PICK.w + 4, height: PICK.h + 4 }}>
			<span className="absolute top-[-1px] left-[-1px] -translate-y-full whitespace-nowrap rounded-t-[3px] bg-thread px-1.5 py-px text-on-thread type-detail">
				{element.kind}
			</span>
		</div>
	);
}

function Tools({ active }: { active: "select" | "edit" | "hand" }) {
	const list = [
		{ id: "select", Icon: SelectIcon },
		{ id: "edit", Icon: EditIcon },
		{ id: "hand", Icon: HandIcon },
	] as const;
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1">
				{list.map(({ id, Icon }) => (
					<span
						key={id}
						className={cn("flex h-9 w-9 items-center justify-center rounded-md", active === id ? "bg-raised text-text" : "text-muted")}
					>
						<Icon className="h-[18px] w-[18px]" />
					</span>
				))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------- dock -- */

function DockStrip({ lit }: { lit: Panel }) {
	const glyph = (on: boolean) =>
		cn("relative flex h-8 w-8 items-center justify-center rounded-sm", on ? "bg-(--color-control) text-text" : "text-muted/70");
	return (
		<div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5">
			<span className={glyph(lit === "properties")}>
				<PropertiesIcon className="h-4 w-4" />
			</span>
			<span className={glyph(lit === "agent")}>
				<AgentIcon className="h-4 w-4" />
			</span>
			<div className="mt-auto mb-1.5 flex flex-col items-center gap-1">
				<span className={cn(glyph(false), "text-[15px]")}>?</span>
				<span className={glyph(false)}>
					<CogIcon className="h-4 w-4" />
				</span>
			</div>
		</div>
	);
}

function PropertiesPanel() {
	const rows = [
		{ of: "position", axes: [["x", selection.x], ["y", selection.y]] },
		{ of: "size", axes: [["w", selection.w], ["h", selection.h]] },
	] as const;
	return (
		<div className="flex h-full w-[300px] shrink-0 flex-col border-border border-l bg-bg">
			<div className="shrink-0 border-border border-b">
				<div className="flex h-9 items-center gap-2 px-2.5">
					<span className="min-w-0 flex-1 truncate type-value">{selection.name}</span>
					<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-text type-value">⋯</span>
					<span className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-muted/50">
						<PanelCaret dir="right" className="h-3.5 w-2.5" />
					</span>
				</div>
			</div>
			{rows.map((section, index) => (
				<div key={section.of} className={cn(index > 0 && "border-border-raised border-t")}>
					<div className="flex h-6 items-center gap-2 px-2.5">
						<span className="shrink-0 text-muted type-detail">{section.of}</span>
						<span className="ml-auto min-w-0 truncate text-muted type-detail">{selection.source}</span>
					</div>
					{section.axes.map(([axis, value]) => (
						<PropertyRow key={axis} name={axis} value={String(value)} />
					))}
				</div>
			))}
		</div>
	);
}

function PropertyRow({ name, value }: { name: string; value: string }) {
	return (
		<div className="grid h-7 grid-cols-[92px_1fr] items-center gap-2 border-border/80 border-b px-2.5">
			<span className="truncate text-muted type-detail">{name}</span>
			<span className="flex min-w-0 flex-1 items-center gap-1 rounded-xs border border-transparent px-1">
				<span className="min-w-0 flex-1 text-text type-value">{value}</span>
				<span className="shrink-0 text-muted type-detail">px</span>
			</span>
		</div>
	);
}

function LockGlyph() {
	return (
		<svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-muted/65" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
			<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
			<path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" />
		</svg>
	);
}

function SelectionChip() {
	return (
		<span className="flex h-6 w-fit min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-1 pl-2">
			<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread" />
			<span className="min-w-0 truncate text-text type-value">{element.chip}</span>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50">
				<AppClose />
			</span>
		</span>
	);
}

function AgentPanel() {
	const edit = agent.turn.edits[0];
	return (
		<div className="flex h-full w-[420px] shrink-0 flex-col border-border border-l bg-bg">
			{/* the plate: once a chat has a turn, it is named by its ask (agent-rail.tsx) */}
			<div className="relative shrink-0 border-border border-b bg-bg">
				<div className="flex h-11 items-center gap-1 px-3.5">
					<span className="-ml-1.5 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5">
						<span className="min-w-0 flex-1 truncate text-text type-label">{agent.turn.ask}</span>
						<ChevronIcon className="h-2.5 w-2.5 shrink-0 text-muted/45" />
					</span>
					<span className="-mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45">
						<AppPlus />
					</span>
				</div>
				{/* a started chat keeps its agent: the lock, and no "For this new chat" */}
				<div className="flex h-8 items-center justify-between px-3.5 pb-2">
					<span className="flex items-center gap-1.5 text-muted type-detail">
						<LockGlyph />
						{agent.model}
					</span>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col px-3.5 pt-6 pb-4">
				<div className="mt-auto flex flex-col">
					<div className="relative flex flex-col gap-1.5 pl-3.5">
						<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
						<p className="text-text type-body">{agent.turn.ask}</p>
						<span className="truncate text-muted type-detail">{element.chip}</span>
					</div>
					<div className="mt-[14px] -mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5">
						<StateCheck />
						<span className="flex min-w-0 items-baseline gap-1.5">
							<span className="shrink-0 text-muted type-value">write</span>
							<span className="min-w-0 truncate text-text type-value">{selection.name}</span>
							<span className="shrink-0 text-muted tabular-nums type-detail">
								+{edit?.added} −{edit?.removed}
							</span>
						</span>
					</div>
					<div className="mt-[14px] flex flex-col gap-2 text-text type-body">
						<p>{agent.turn.said}</p>
					</div>
				</div>
			</div>
			<div className="relative flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
				<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5">
					<SelectionChip />
					<p className="text-muted type-body" style={{ minHeight: 60 }}>
						{agent.placeholder}
					</p>
				</div>
				<div className="relative flex h-[18px] min-w-0 items-center justify-between gap-2.5">
					<span className="text-muted type-detail">{agent.account}</span>
					<span className="flex items-center gap-1 py-1 text-muted type-detail">
						{agent.mode}
						<ChevronIcon className="h-2 w-2 shrink-0" />
					</span>
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ the window -- */

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: Panel }) {
	const right = panel === "agent" ? 420 + 44 : 300 + 44;
	return (
		<Root appearance={appearance} className="flex h-[900px] w-[1440px] flex-col">
			<WindowBar project={true} />
			<div className="relative flex min-h-0 flex-1">
				<PagesRail editing={panel === "agent"} />
				<div className="min-w-0 flex-1" />
				{panel === "agent" ? <AgentPanel /> : <PropertiesPanel />}
				<DockStrip lit={panel} />
			</div>
			<CanvasField panel={panel} right={right} />
		</Root>
	);
}

/* ------------------------------------------------------------------- home -- */

const HOME_BUTTON =
	"inline-flex h-[35px] shrink-0 items-center justify-center gap-[9px] rounded-[7px] border px-[13px] whitespace-nowrap type-control";

function NavItem({ icon, label, current }: { icon: ReactNode; label: string; current?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-[38px] w-full items-center gap-[12px] rounded-[7px] px-[12px] type-control [&>svg]:h-[16px] [&>svg]:w-[16px] [&>svg]:shrink-0",
				current ? "bg-surface text-text" : "text-muted",
			)}
		>
			{icon}
			<span>{label}</span>
		</span>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<Root appearance={appearance} className="flex h-[900px] w-[1440px] flex-col">
			<WindowBar project={false} />
			<div className="grid min-h-0 flex-1 grid-cols-[208px_minmax(0,1fr)]">
				<aside className="flex h-full flex-col border-border border-r bg-bg px-[16px] pt-[32px] pb-[22px]">
					<div className="mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] tracking-[-1px] [font:var(--type-mark)]">
						<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
						<span>spool</span>
					</div>
					<nav className="flex flex-col gap-[4px]">
						{home.nav.map((item) => (
							<NavItem key={item} icon={<FrameIcon />} label={item} current={true} />
						))}
					</nav>
					<div className="mt-auto flex flex-col gap-[4px]">
						<NavItem icon={<CogIcon />} label={home.foot} />
					</div>
				</aside>
				<main className="min-w-0 px-[48px] pt-[46px] pb-[30px]">
					<header className="mb-[31px] flex items-center justify-between gap-[25px]">
						<h1 className="font-medium type-page">{home.title}</h1>
						<div className="flex items-center gap-[13px]">
							<span className="flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted">
								<SearchGlyph />
								<span className="min-w-0 flex-1 type-control">{home.search}</span>
								<span className="type-detail">{home.searchKey}</span>
							</span>
							{home.actions.map((label, index) =>
								index === home.actions.length - 1 ? (
									<span key={label} className={cn(HOME_BUTTON, "border-transparent bg-text text-bg")}>
										<AppPlus />
										{label}
									</span>
								) : (
									<span key={label} className={cn(HOME_BUTTON, "border-border-raised text-text")}>
										{label}
									</span>
								),
							)}
						</div>
					</header>
					<div className="mb-[24px] flex h-[23px] items-center justify-between text-muted type-caption">
						<span className="type-detail">{home.count}</span>
						<span className="flex items-center gap-[4px]">
							Sort by
							<span className="flex items-center gap-1 pt-[3px] pr-[2px] pb-[3px] pl-[5px] text-text type-caption">
								{home.sort}
								<ChevronIcon className="h-2.5 w-2.5 rotate-90" />
							</span>
						</span>
					</div>
					<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
						{projects.map((project) => (
							<div key={project.name} className="relative min-w-0">
								<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
									<ProjectArtwork kind={project.art} className="absolute inset-0" />
								</div>
								<div className="flex items-baseline justify-between gap-[9px] pt-[15px] pr-[32px]">
									<strong className="truncate font-[500] type-title">{project.name}</strong>
									<span className="shrink-0 text-muted type-detail">{project.frames} frames</span>
								</div>
								<span className="mt-[7px] block text-muted type-detail">{project.when}</span>
							</div>
						))}
					</div>
				</main>
			</div>
		</Root>
	);
}

/* ------------------------------------------------------------------ parts -- */

function Drift({ children }: { children: ReactNode }) {
	return <p className="mt-1.5 font-mono text-[10px] text-(--color-thread-strong) leading-[14px]">drift · {children}</p>;
}

function Spec({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex min-w-0 flex-col", className)}>
			<h3 className="mb-2 border-border border-b pb-1 text-muted type-detail">{name}</h3>
			{children}
		</section>
	);
}

function Tag({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[10px] text-muted leading-[14px]">{children}</span>;
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 text-muted type-detail">
			{children}
		</span>
	);
}

function Switch({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"flex h-4 w-7 shrink-0 items-center rounded-full border",
				on ? "border-thread bg-thread" : "border-border-raised bg-raised",
			)}
		>
			<span className={cn("h-2.5 w-2.5 rounded-full", on ? "translate-x-[14px] bg-on-thread" : "translate-x-[2px] bg-muted")} />
		</span>
	);
}

const ROLES = [
	{ name: "page", cls: "type-page", spec: "28/36 · 500 sans", sample: "Projects" },
	{ name: "heading", cls: "type-heading", spec: "18/26 · 500 sans", sample: "Open a folder" },
	{ name: "title", cls: "type-title", spec: "14/22 · 500 sans", sample: "Settings" },
	{ name: "body", cls: "type-body", spec: "14/22 · 400 sans", sample: "say what to change" },
	{ name: "control", cls: "type-control", spec: "13/20 · 400 sans", sample: "New project…" },
	{ name: "label", cls: "type-label", spec: "12/18 · 400 sans", sample: "New chat" },
	{ name: "caption", cls: "type-caption", spec: "11/16 · 400 sans", sample: "Sort by" },
	{ name: "value", cls: "type-value", spec: "12/18 · 400 mono", sample: "frames/app/cart" },
	{ name: "detail", cls: "type-detail", spec: "11/16 · 400 mono", sample: "folder switches page" },
] as const;

const SWATCHES = [
	{ name: "bg", dark: "#0e0e0e", light: "#f0efec" },
	{ name: "canvas", dark: "#161616", light: "#e6e5e1" },
	{ name: "surface", dark: "#1c1c1c", light: "#faf9f6" },
	{ name: "raised", dark: "#282828", light: "#ffffff" },
	{ name: "border", dark: "#262626", light: "#dcdad5" },
	{ name: "border-raised", dark: "#363636", light: "#c2c0ba" },
	{ name: "text", dark: "#f0efed", light: "#1a1917" },
	{ name: "muted", dark: "#94918d", light: "#696662" },
	{ name: "thread", dark: "#f5391a", light: "#f5391a" },
	{ name: "thread-strong", dark: "#f5391a", light: "#bf2c14" },
	{ name: "danger", dark: "#ff604b", light: "#bb2614" },
] as const;

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<Root appearance={appearance} className="h-[900px] w-[720px] px-5 pt-5 pb-5">
			<div className="mb-4 flex items-baseline justify-between">
				<span className="font-semibold type-control">
					spool 0.31.1 <span className="font-normal text-muted">as it ships</span>
				</span>
				<span className="text-muted type-detail">{appearance} · src/ui/ui.css</span>
			</div>
			<div className="grid grid-cols-[204px_204px_240px] gap-x-4">
				{/* column one */}
				<div className="flex flex-col gap-3">
					<Spec name="buttons">
						<div className="flex items-center gap-2 whitespace-nowrap">
							<span className={cn(HOME_BUTTON, "border-transparent bg-text text-bg")}>
								<AppPlus />
								New project…
							</span>
							<span className={cn(HOME_BUTTON, "border-border-raised text-text")}>Open…</span>
						</div>
						<div className="mt-2 flex items-center gap-1.5 whitespace-nowrap">
							<span className="flex h-8 items-center justify-center rounded-sm bg-(--color-thread-strong) px-4 font-medium text-on-thread type-control">
								Export
							</span>
							<span className="flex h-[30px] items-center rounded-sm bg-surface px-3 text-(--color-danger) type-control">
								Hide from Spool
							</span>
						</div>
						<div className="mt-2 flex items-center gap-2">
							<span className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-text">
								<SelectIcon className="h-[18px] w-[18px]" />
							</span>
							<span className="flex h-8 w-8 items-center justify-center rounded-sm bg-(--color-control) text-text">
								<PropertiesIcon className="h-4 w-4" />
							</span>
							<span className="flex h-7 w-7 items-center justify-center rounded-sm text-text">
								<EdgeIcon className="h-4 w-4" />
							</span>
							<span className="flex h-6 w-6 items-center justify-center rounded-sm text-muted/45">
								<AppPlus />
							</span>
							<span className="flex items-center gap-1 rounded-xs px-1 text-muted type-detail">
								<PlayTriangle />
								play
							</span>
						</div>
						<Drift>heights 35 32 30 · 36 32 28 24; radius 7 off-scale; two primaries</Drift>
					</Spec>
					<Spec name="input · search · keys">
						<span className="flex h-[35px] w-full items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted">
							<SearchGlyph />
							<span className="min-w-0 flex-1 type-control">{home.search}</span>
							<span className="type-detail">{home.searchKey}</span>
						</span>
						<div className="mt-2 flex items-center gap-3">
							<span className="text-muted type-detail">/</span>
							<Kbd>V</Kbd>
							<span className="text-muted type-label">⌘D</span>
							<span className="text-muted type-value">⌘Z</span>
						</div>
						<Drift>four key-hint styles</Drift>
					</Spec>
					<Spec name="segmented · toggle">
						<div className="flex items-center gap-3 whitespace-nowrap">
							<span className="flex h-7 items-stretch rounded-sm border border-border p-px">
								<span className="flex items-center rounded-[5px] bg-(--color-control) px-2.5 text-text type-value">Ask</span>
								<span className="flex items-center rounded-[5px] px-2.5 text-muted type-value">Only this Mac</span>
							</span>
						</div>
						<div className="mt-2 flex items-center gap-2">
							<Switch on={true} />
							<Switch on={false} />
						</div>
						<Drift>human words set in mono</Drift>
					</Spec>
					<Spec name="tabs · window, panel">
						<div className="flex h-[40px] items-end border-border border-b">
							<div className="relative h-[36px] min-w-[112px]">
								<span className="absolute inset-[0_0_-1px] rounded-t-[8px] border-border border-x border-t bg-canvas" />
								<span className="relative flex h-full items-center pr-[38px] pl-3 text-text type-control">kaffe</span>
								<span className="absolute top-1.5 right-[4px] flex h-[24px] w-[24px] items-center justify-center text-muted">
									<AppClose />
								</span>
							</div>
							<span className="flex h-[36px] items-center pl-3 text-muted type-control">tvärsö</span>
						</div>
						<div className="mt-2 flex h-10 items-stretch gap-6 border-border border-b">
							<span className="relative flex items-center text-text type-control">
								General
								<span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" />
							</span>
							<span className="flex items-center text-muted type-control">Appearance</span>
						</div>
					</Spec>
				</div>

				{/* column two */}
				<div className="flex flex-col gap-3">
					<Spec name="chips">
						<div className="flex items-center gap-2.5 whitespace-nowrap">
							<span className="flex items-baseline gap-2">
								<span className="font-semibold type-control">Pages</span>
								<span className="text-muted type-detail">3</span>
							</span>
							<span className="rounded-xs bg-(--color-thread-strong) px-2 py-[3px] text-on-thread type-detail">390 × 844</span>
							<span className="rounded-t-[3px] bg-thread px-1.5 py-px text-on-thread type-detail">{element.kind}</span>
						</div>
						<div className="mt-2">
							<SelectionChip />
						</div>
						<Drift>radius 6, 4, 3; two reds</Drift>
					</Spec>
					<Spec name="pages rail · rows">
						<div className="-mx-1 flex flex-col">
							<RowLabel label="current">
								<PageRow name="app" count={3} open={true} current={true} />
							</RowLabel>
							<RowLabel label="selected">
								<FrameRow name="cart" selected={true} unseen={false} last={false} />
							</RowLabel>
							<RowLabel label="unseen">
								<FrameRow name="receipt" selected={false} unseen={true} last={true} />
							</RowLabel>
							<RowLabel label="rest">
								<PageRow name="directing" count={1} open={false} current={false} />
							</RowLabel>
							<RowLabel label="hover">
								<PageRow name="site" count={2} open={false} current={false} hover={true} />
							</RowLabel>
						</div>
						<Drift>page row 32, frame row 28</Drift>
					</Spec>
					<Spec name="property row">
						<div className="-mx-1">
							<div className="flex h-6 items-center gap-2 px-2.5">
								<span className="text-muted type-detail">position</span>
								<span className="ml-auto text-muted type-detail">{selection.source}</span>
							</div>
							<PropertyRow name="x" value={String(selection.x)} />
						</div>
						<Drift>heads 36 mono, 44 sans</Drift>
					</Spec>
					<Spec name="tooltip">
						<span className="flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 text-muted type-detail">
							select
							<Kbd>V</Kbd>
						</span>
						<Drift>dock glyphs: native titles</Drift>
					</Spec>
				</div>

				{/* column three */}
				<div className="flex flex-col gap-3">
					<Spec name="context menu">
						<div className="flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-1">
							{menuItems.map((item, index) => (
								<div key={item.label}>
									{item.danger === true && index > 0 ? <div className="mx-auto my-1 h-px w-[176px] bg-border-raised" /> : null}
									<div
										className={cn(
											"flex h-[30px] items-center justify-between gap-3 rounded-sm px-3 text-text type-control",
											index === 0 && "bg-surface",
										)}
									>
										<span className="truncate">{item.label}</span>
										<span className="shrink-0 text-muted type-label">{item.key}</span>
									</div>
								</div>
							))}
						</div>
						<Drift>Trash plain here, red on Home</Drift>
					</Spec>
					<Spec name="toast">
						<div className="flex w-fit items-center gap-4 whitespace-nowrap rounded-md border border-border-raised bg-raised px-3.5 py-2.5">
							<span className="text-text type-control">{toast.text}</span>
							<span className="font-medium text-(--color-thread-strong) type-control">{toast.action}</span>
							<span className="text-muted type-value">⌘Z</span>
						</div>
					</Spec>
					<Spec name="settings row">
						<div className="flex items-start justify-between gap-4 py-1.5">
							<span className="flex min-w-0 flex-col gap-1">
								<span className="text-text type-control">{settingsRow.title}</span>
								<span className="text-muted type-label">{settingsRow.detail}</span>
							</span>
							<span className="pt-0.5">
								<Switch on={true} />
							</span>
						</div>
						<Drift>height follows its words</Drift>
					</Spec>
				</div>
			</div>

			<div className="mt-4 grid grid-cols-[1fr_240px] gap-x-4">
				<Spec name="type roles · typography.css">
					<div className="grid grid-cols-[52px_1fr_auto] items-baseline gap-x-3">
						{ROLES.map((role) => (
							<div key={role.name} className="contents">
								<span className="text-muted type-detail">{role.name}</span>
								<span className={cn("truncate", role.cls)}>{role.sample}</span>
								<Tag>{role.spec}</Tag>
							</div>
						))}
					</div>
					<Drift>9 roles; "Pages" at 600 and "?" at 15px sit off them</Drift>
				</Spec>
				<Spec name="palette">
					<div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
						{SWATCHES.map((swatch) => (
							<div key={swatch.name} className="flex items-center gap-2">
								<span
									className="h-6 w-6 shrink-0 rounded-xs border border-border-raised"
									style={{ background: appearance === "dark" ? swatch.dark : swatch.light }}
								/>
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-mono text-[10px] text-text leading-[13px]">{swatch.name}</span>
									<span className="font-mono text-[10px] text-muted leading-[13px]">
										{appearance === "dark" ? swatch.dark : swatch.light}
									</span>
								</span>
							</div>
						))}
					</div>
					<Drift>danger off-token; 5 icon alphas</Drift>
				</Spec>
			</div>
		</Root>
	);
}

function RowLabel({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[1fr_52px] items-center">
			<div className="min-w-0">{children}</div>
			<span className="pl-2 text-right font-mono text-[10px] text-muted leading-[14px]">{label}</span>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px]">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}
