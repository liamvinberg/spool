import "./tidy.css";

import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	type Appearance,
	agent,
	canvasFrames,
	drawnSize,
	element,
	frameSize,
	home,
	menuItems,
	pages,
	railHint,
	selection,
	settingsRow,
	tabs,
	toast,
	tools,
	zoom,
} from "shared/lib/explore/identity/world";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { projects } from "shared/ui/demo/home-data";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";
import {
	AgentIcon,
	ChevronIcon,
	CloseIcon,
	CogIcon,
	ConnectionsIcon,
	DotsIcon,
	EditIcon,
	FolderIcon,
	FrameIcon,
	HandIcon,
	PanelCaret,
	PlayIcon,
	PlusIcon,
	PropertiesIcon,
	SearchIcon,
	SelectIcon,
} from "shared/ui/spool/icons";

/**
 * tidy: today's spool with its rules written down, and nothing else changed.
 *   space   4px steps; panels pad 12 (a 4 inset plus a row's 8)
 *   heights bar 44 (window bar, panel headers) · strip 36 (a row in 4 padding: rail foot, model line) · control 32 (tabs, buttons, inputs, tools)
 *           · row 28 (rail rows, property rows, menu rows) · bit 20 (chips, keys)
 *   radius  by what it is: a float that holds controls 10, a control or a row 6, a bit
 *           inside a control 4; round only for state (toggle, dot)
 *   line    one hairline token; a shadow only under what floats, one token
 *   type    display 24 · title 13 · body 13 · label 12 sans; value 12 · detail 11 mono.
 *           Sans is what a person reads, mono is what the machine prints.
 *   colour  the thread marks what is selected, current, unseen or on; nothing else is red
 */

const BAR = 44;
const RAIL = 240;
const PANEL = 320;
const STRIP = 40;
const CANVAS_W = 1440 - RAIL - PANEL - STRIP;

// ── primitives ──────────────────────────────────────────────────────────────

function IconButton({
	children,
	active,
	size = 24,
	className,
}: {
	children: ReactNode;
	active?: boolean;
	size?: 24 | 32;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-[6px]",
				active ? "bg-(--t-select) text-(--t-text)" : "text-(--t-muted)",
				className,
			)}
			style={{ width: size, height: size }}
		>
			{children}
		</span>
	);
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind = "secondary", icon, children }: { kind?: ButtonKind; icon?: ReactNode; children: ReactNode }) {
	return (
		<span
			className={cn(
				"t-title inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-3",
				kind === "primary" && "border-transparent bg-(--t-ink) text-(--t-on-ink)",
				kind === "secondary" && "border-(--t-line) bg-(--t-surface) text-(--t-text)",
				kind === "ghost" && "border-transparent text-(--t-muted)",
				kind === "danger" && "border-transparent bg-(--t-thread-wash) text-(--t-thread-text)",
				icon ? "pl-2.5" : "",
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="t-detail inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[4px] border border-(--t-line) px-1 text-(--t-muted)">
			{children}
		</span>
	);
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "solid" }) {
	return (
		<span
			className={cn(
				"t-detail inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1.5",
				tone === "neutral" && "border border-(--t-line) bg-(--t-surface) text-(--t-text)",
				tone === "solid" && "bg-(--t-thread-fill) text-(--t-on-thread)",
			)}
		>
			{children}
		</span>
	);
}

/** The selection as the composer carries it: a thread tick, the address, a way out. */
function SelectionChip() {
	return (
		<Chip>
			<span className="h-2.5 w-0.5 rounded-full bg-(--t-thread)" />
			{element.chip}
			<CloseIcon className="size-2.5 text-(--t-muted)" />
		</Chip>
	);
}

function Dot() {
	return <span className="inline-block size-1.5 shrink-0 rounded-full bg-(--t-thread)" />;
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full",
				on ? "bg-(--t-thread-fill)" : "bg-(--t-raised) ring-1 ring-(--t-line) ring-inset",
			)}
		>
			<span
				className={cn(
					"absolute size-3 rounded-full",
					on ? "left-[14px] bg-[#ffffff]" : "left-[2px] bg-(--t-muted)",
				)}
			/>
		</span>
	);
}

function HouseIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path
				d="M2.75 7 8 2.75 13.25 7v6.25h-3.5V9.5h-3.5v3.75h-3.5z"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function HelpIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path
				d="M5.75 6a2.25 2.25 0 1 1 3.4 1.94c-.7.4-1.15.9-1.15 1.7v.36"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
			<circle cx="8" cy="12.4" r="0.9" fill="currentColor" />
		</svg>
	);
}

function Line({ vertical, className }: { vertical?: boolean; className?: string }) {
	return <span className={cn("block shrink-0 bg-(--t-line)", vertical ? "w-px" : "h-px w-full", className)} />;
}

// ── the window bar ──────────────────────────────────────────────────────────

function WindowTab({ name, active }: { name: string; active?: boolean }) {
	return (
		<span
			className={cn(
				"t-value flex h-8 shrink-0 items-center gap-3 rounded-[6px] border px-2",
				active
					? "border-(--t-line) bg-(--t-surface) text-(--t-text)"
					: "border-transparent text-(--t-muted)",
			)}
		>
			<span className="truncate">{name}</span>
			{active ? <CloseIcon className="size-2.5 text-(--t-muted)" /> : null}
		</span>
	);
}

function HomeTab({ active }: { active?: boolean }) {
	return (
		<span
			className={cn(
				"t-body flex h-8 shrink-0 items-center gap-2 rounded-[6px] border px-2",
				active
					? "border-(--t-line) bg-(--t-surface) text-(--t-text)"
					: "border-transparent text-(--t-muted)",
			)}
		>
			<HouseIcon className="size-4" />
			Home
		</span>
	);
}

function WindowBar({ at }: { at: "home" | "project" }) {
	return (
		<header
			className="absolute inset-x-0 top-0 flex items-center gap-1 border-b border-(--t-line) bg-(--t-bg) pl-1"
			style={{ height: BAR }}
		>
			<HomeTab active={at === "home"} />
			<Line vertical className="mx-1 h-4" />
			{tabs.map((t) => (
				<WindowTab key={t.name} name={t.name} active={at === "project" && t.active} />
			))}
			<IconButton size={32}>
				<PlusIcon className="size-3.5" />
			</IconButton>
			<span className="flex-1" />
			{at === "project" ? (
				<>
					<IconButton size={32} active>
						<ConnectionsIcon className="size-4" />
					</IconButton>
					<span className="t-detail flex h-8 w-10 items-center justify-center text-(--t-muted)">{zoom}</span>
				</>
			) : null}
		</header>
	);
}

// ── the pages rail ──────────────────────────────────────────────────────────

type RowState = "rest" | "hover" | "selected";

/** One rail row, 28 tall, inset 4 from the rail with a radius of 6. */
function RailRow({
	kind,
	name,
	state = "rest",
	open,
	count,
	current,
	unseen,
	guide,
}: {
	kind: "page" | "frame";
	name: string;
	state?: RowState;
	open?: boolean;
	count?: number;
	current?: boolean;
	unseen?: boolean;
	guide?: "mid" | "last";
}) {
	const selected = state === "selected";
	return (
		<div className="relative px-1">
			{current ? <span className="absolute top-1.5 left-0 h-4 w-0.5 rounded-r-full bg-(--t-thread)" /> : null}
			<div
				className={cn(
					"relative flex h-7 items-center rounded-[6px] pr-2",
					kind === "page" ? "pl-2" : "pl-6",
					state === "hover" && "bg-(--t-hover)",
					selected && "bg-(--t-select)",
				)}
			>
				{kind === "frame" ? (
					<span
						className={cn("absolute left-[13.5px] w-px bg-(--t-line)", guide === "last" ? "top-0 h-3.5" : "inset-y-0")}
					/>
				) : null}
				{kind === "page" ? (
					<>
						<ChevronIcon open={open} className="size-3 shrink-0 text-(--t-muted)" />
						<FolderIcon className="ml-1 size-3.5 shrink-0 text-(--t-muted)" />
					</>
				) : (
					<FrameIcon className={cn("size-3.5 shrink-0", selected ? "text-(--t-thread)" : "text-(--t-muted)")} />
				)}
				<span className="t-value ml-2 min-w-0 flex-1 truncate text-(--t-text)">{name}</span>
				{unseen ? <Dot /> : null}
				{count !== undefined ? <span className="t-detail ml-2 text-(--t-muted)">{count}</span> : null}
			</div>
		</div>
	);
}

function PagesRail() {
	return (
		<aside
			className="absolute left-0 flex flex-col border-r border-(--t-line) bg-(--t-bg)"
			style={{ top: BAR, bottom: 0, width: RAIL }}
		>
			<div className="flex shrink-0 items-center border-b border-(--t-line) pr-2 pl-3" style={{ height: BAR }}>
				<span className="flex items-baseline gap-2">
					<span className="t-title text-(--t-text)">Pages</span>
					<span className="t-detail text-(--t-muted)">{pages.length}</span>
				</span>
				<span className="flex-1" />
				<IconButton>
					<PlusIcon className="size-3.5" />
				</IconButton>
				<IconButton>
					<CloseIcon className="size-2.5" />
				</IconButton>
				<IconButton>
					<PanelCaret dir="left" className="h-4 w-3" />
				</IconButton>
			</div>
			<div className="flex flex-1 flex-col py-1">
				{pages.map((page) => (
					<div key={page.name} className="flex flex-col">
						<RailRow kind="page" name={page.name} open={page.open} count={page.count} current={page.current} />
						{page.open
							? page.frames.map((f, i) => (
									<RailRow
										key={f.name}
										kind="frame"
										name={f.name}
										state={f.selected ? "selected" : "rest"}
										unseen={f.unseen}
										guide={i === page.frames.length - 1 ? "last" : "mid"}
									/>
								))
							: null}
					</div>
				))}
			</div>
			<div className="flex h-9 shrink-0 items-center border-t border-(--t-line) px-3">
				<span className="t-detail text-(--t-muted)">{railHint}</span>
			</div>
		</aside>
	);
}

// ── the canvas ──────────────────────────────────────────────────────────────

const FRAME_Y = 176;
const GAP = 40;
const X0 = 20;
const frameX = (i: number) => X0 + i * (drawnSize.w + GAP);

function Handle({ className }: { className: string }) {
	return <span className={cn("absolute size-1.5 border border-(--t-thread) bg-[#ffffff]", className)} />;
}

function CanvasFrame({
	index,
	name,
	screen,
	selected,
	unseen,
	picked,
}: {
	index: number;
	name: string;
	screen: "menu" | "cart" | "receipt";
	selected?: boolean;
	unseen?: boolean;
	picked?: boolean;
}) {
	const x = frameX(index);
	return (
		<>
			<div
				className="absolute flex h-4 items-center justify-between"
				style={{ left: x, top: FRAME_Y - 24, width: drawnSize.w }}
			>
				<span
					className={cn(
						"t-value flex items-center gap-1.5",
						selected ? "text-(--t-thread-text)" : "text-(--t-muted)",
					)}
				>
					{name}
					{unseen ? <Dot /> : null}
				</span>
				{selected ? (
					<span className="t-value flex items-center gap-1 text-(--t-thread-text)">
						<PlayIcon className="size-2" />
						play
					</span>
				) : null}
			</div>
			<div className="absolute" style={{ left: x, top: FRAME_Y, width: drawnSize.w, height: drawnSize.h }}>
				<CoffeeScreen screen={screen} />
				{selected ? (
					<>
						<span className="pointer-events-none absolute -inset-[3px] rounded-[10px] border border-(--t-thread)" />
						<Handle className="-top-[6px] -left-[6px]" />
						<Handle className="-top-[6px] -right-[6px]" />
						<Handle className="-bottom-[6px] -left-[6px]" />
						<Handle className="-right-[6px] -bottom-[6px]" />
						<span className="absolute left-1/2 -translate-x-1/2" style={{ top: drawnSize.h + 10 }}>
							<Chip tone="solid">
								{frameSize.w} × {frameSize.h}
							</Chip>
						</span>
					</>
				) : null}
				{picked ? (
					<>
						<span className="pointer-events-none absolute rounded-[7px] border border-(--t-thread)" style={{ left: 14, top: 48, width: 212, height: 32 }} />
						<span className="absolute" style={{ right: 14, top: 28 }}>
							<span className="t-detail inline-flex h-5 items-center rounded-t-[4px] bg-(--t-thread-fill) px-1.5 text-(--t-on-thread)">
								{element.kind}
							</span>
						</span>
					</>
				) : null}
			</div>
		</>
	);
}

function Arrowhead({ x, y, dir }: { x: number; y: number; dir: "left" | "up" }) {
	const d =
		dir === "left" ? `M${x} ${y} l7 -3.5 v7 z` : `M${x} ${y} l-3.5 7 h7 z`;
	return <path d={d} fill="var(--t-thread)" />;
}

function Flows() {
	const bottom = FRAME_Y + drawnSize.h;
	const cart = frameX(0);
	const menu = frameX(1);
	const receipt = frameX(2);
	const w = drawnSize.w;
	return (
		<svg className="pointer-events-none absolute inset-0" width={CANVAS_W} height={900 - BAR} aria-hidden="true">
			<g fill="none" stroke="var(--t-thread)" strokeWidth="1.25" strokeLinecap="round">
				{/* menu → cart, from Checkout */}
				<path d={`M${menu} ${bottom - 31} C${menu - 24} ${bottom - 31} ${cart + w + 24} ${bottom - 96} ${cart + w + 7} ${bottom - 96}`} />
				{/* cart → receipt, from Pay, under menu */}
				<path d={`M${cart + 200} ${bottom} C${cart + 200} ${bottom + 84} ${receipt + 60} ${bottom + 84} ${receipt + 60} ${bottom + 7}`} />
				{/* receipt → menu, might */}
				<path
					strokeDasharray="4 3"
					d={`M${receipt} ${FRAME_Y + 150} C${receipt - 20} ${FRAME_Y + 150} ${receipt - 20} ${FRAME_Y + 120} ${menu + w + 7} ${FRAME_Y + 120}`}
				/>
			</g>
			<Arrowhead x={cart + w} y={bottom - 96} dir="left" />
			<Arrowhead x={receipt + 60} y={bottom} dir="up" />
			<Arrowhead x={menu + w} y={FRAME_Y + 120} dir="left" />
		</svg>
	);
}

const toolIcon = {
	select: <SelectIcon className="size-4" />,
	edit: <EditIcon className="size-4" />,
	hand: <HandIcon className="size-4" />,
};

function Toolbar({ active }: { active: string }) {
	return (
		<div className="flex items-center gap-1 rounded-[10px] border border-(--t-line) bg-(--t-surface) p-1 shadow-(--t-float)">
			{tools.map((t) => (
				<IconButton key={t.name} size={32} active={t.name === active}>
					{toolIcon[t.name as keyof typeof toolIcon]}
				</IconButton>
			))}
		</div>
	);
}

function Canvas({ mode }: { mode: "select" | "edit" }) {
	return (
		<main
			className="absolute overflow-hidden bg-(--t-canvas)"
			style={{ top: BAR, left: RAIL, width: CANVAS_W, bottom: 0 }}
		>
			<Flows />
			{canvasFrames.map((f, i) => (
				<CanvasFrame
					key={f.name}
					index={i}
					name={f.name}
					screen={f.screen}
					selected={mode === "select" && "selected" in f && f.selected}
					unseen={"unseen" in f && f.unseen}
					picked={mode === "edit" && f.name === element.frame}
				/>
			))}
			<div className="absolute bottom-4 left-1/2 -translate-x-1/2">
				<Toolbar active={mode} />
			</div>
		</main>
	);
}

// ── the right side ──────────────────────────────────────────────────────────

function PanelHeader({ children, actions }: { children: ReactNode; actions: ReactNode }) {
	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-(--t-line) pr-2 pl-3" style={{ height: BAR }}>
			{children}
			<span className="flex-1" />
			<span className="flex items-center">{actions}</span>
		</div>
	);
}

function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
	return (
		<div className="flex h-7 items-center justify-between px-2">
			<span className="t-label text-(--t-muted)">{children}</span>
			{aside ? <span className="t-detail text-(--t-faint)">{aside}</span> : null}
		</div>
	);
}

function PropRow({ label, value, unit, state }: { label: string; value: ReactNode; unit?: string; state?: "hover" }) {
	return (
		<div
			className={cn(
				"flex h-7 items-center rounded-[6px] px-2",
				state === "hover" && "bg-(--t-hover)",
			)}
		>
			<span className="t-label w-8 shrink-0 text-(--t-muted)">{label}</span>
			<span className="t-value flex-1 text-(--t-text)">{value}</span>
			{unit ? <span className="t-detail text-(--t-faint)">{unit}</span> : null}
		</div>
	);
}

function PropSection({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
	return (
		<div className="flex flex-col border-b border-(--t-line) p-1">
			<SectionLabel aside={aside}>{title}</SectionLabel>
			{children}
		</div>
	);
}

function Collapse() {
	return (
		<IconButton>
			<PanelCaret dir="right" className="h-4 w-3" />
		</IconButton>
	);
}

function PropertiesPanel() {
	return (
		<>
			<PanelHeader
				actions={
					<>
						<IconButton>
							<DotsIcon className="size-3.5" />
						</IconButton>
						<Collapse />
					</>
				}
			>
				<FrameIcon className="size-3.5 text-(--t-thread)" />
				<span className="t-value text-(--t-text)">{selection.name}</span>
			</PanelHeader>
			<PropSection title="Position" aside={selection.source}>
				<PropRow label="X" value={selection.x} unit="px" />
				<PropRow label="Y" value={selection.y} unit="px" />
			</PropSection>
			<PropSection title="Size" aside={selection.source}>
				<PropRow label="W" value={selection.w} unit="px" />
				<PropRow label="H" value={selection.h} unit="px" />
			</PropSection>
		</>
	);
}

function Composer() {
	return (
		<div className="flex flex-col gap-1 p-3 pt-0">
			<div className="flex min-h-[112px] flex-col gap-2 rounded-[6px] border border-(--t-line) bg-(--t-surface) p-2">
				<span className="flex">
					<SelectionChip />
				</span>
				<span className="t-body px-0.5 text-(--t-faint)">{agent.placeholder}</span>
			</div>
			<div className="flex h-7 items-center justify-between">
				<span className="t-label text-(--t-muted)">{agent.account}</span>
				<span className="t-value flex items-center gap-1 text-(--t-muted)">
					{agent.mode}
					<ChevronIcon className="size-3" />
				</span>
			</div>
		</div>
	);
}

function AgentPanel() {
	const edit = agent.turn.edits[0];
	return (
		<>
			<PanelHeader
				actions={
					<>
						<IconButton>
							<PlusIcon className="size-3.5" />
						</IconButton>
						<Collapse />
					</>
				}
			>
				<span className="t-title text-(--t-text)">{agent.title}</span>
			</PanelHeader>
			<div className="flex h-9 shrink-0 items-center justify-between border-b border-(--t-line) px-3">
				<span className="t-value flex items-center gap-1 text-(--t-text)">
					{agent.model}
					<ChevronIcon className="size-3 text-(--t-muted)" />
				</span>
				<span className="t-label text-(--t-muted)">{agent.scope}</span>
			</div>
			<div className="flex flex-1 flex-col gap-3 p-3">
				<div className="t-body ml-8 self-end rounded-[6px] bg-(--t-raised) px-3 py-1.5 text-(--t-text)">
					{agent.turn.ask}
				</div>
				<p className="t-body text-(--t-text)">{agent.turn.said}</p>
				{edit ? (
					<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(--t-line) px-2">
						<FrameIcon className="size-3.5 shrink-0 text-(--t-muted)" />
						<span className="t-value min-w-0 flex-1 truncate text-(--t-text)">{edit.path}</span>
						<span className="t-detail text-(--t-text)">+{edit.added}</span>
						<span className="t-detail text-(--t-muted)">−{edit.removed}</span>
					</div>
				) : null}
			</div>
			<Composer />
		</>
	);
}

function IconStrip({ panel }: { panel: "properties" | "agent" }) {
	return (
		<nav
			className="absolute right-0 flex flex-col items-center gap-1 border-l border-(--t-line) bg-(--t-bg) py-1.5"
			style={{ top: BAR, bottom: 0, width: STRIP }}
		>
			<IconButton size={32} active={panel === "properties"}>
				<PropertiesIcon className="size-4" />
			</IconButton>
			<IconButton size={32} active={panel === "agent"}>
				<AgentIcon className="size-4" />
			</IconButton>
			<span className="flex-1" />
			<IconButton size={32}>
				<HelpIcon className="size-4" />
			</IconButton>
			<IconButton size={32}>
				<CogIcon className="size-4" />
			</IconButton>
		</nav>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	return (
		<div className="id-tidy relative h-[900px] w-[1440px] overflow-hidden" data-appearance={appearance}>
			<WindowBar at="project" />
			<PagesRail />
			<Canvas mode={panel === "agent" ? "edit" : "select"} />
			<aside
				className="absolute flex flex-col border-l border-(--t-line) bg-(--t-bg)"
				style={{ top: BAR, bottom: 0, right: STRIP, width: PANEL }}
			>
				{panel === "agent" ? <AgentPanel /> : <PropertiesPanel />}
			</aside>
			<IconStrip panel={panel} />
		</div>
	);
}

// ── Home ────────────────────────────────────────────────────────────────────

function SearchField({ width = 240 }: { width?: number }) {
	return (
		<span
			className="flex h-8 shrink-0 items-center gap-2 rounded-[6px] border border-(--t-line) bg-(--t-surface) pr-1.5 pl-2.5"
			style={{ width }}
		>
			<SearchIcon className="size-3.5 text-(--t-muted)" />
			<span className="t-body flex-1 text-(--t-faint)">{home.search}</span>
			<Kbd>{home.searchKey}</Kbd>
		</span>
	);
}

function NavRow({ icon, label, selected }: { icon: ReactNode; label: string; selected?: boolean }) {
	return (
		<div
			className={cn(
				"t-body flex h-7 items-center gap-2 rounded-[6px] px-2",
				selected ? "bg-(--t-select) text-(--t-text)" : "text-(--t-muted)",
			)}
		>
			<span className="flex size-4 items-center justify-center">{icon}</span>
			{label}
		</div>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	const [importLabel, openLabel, newLabel] = home.actions;
	return (
		<div className="id-tidy relative h-[900px] w-[1440px] overflow-hidden" data-appearance={appearance}>
			<WindowBar at="home" />
			<aside
				className="absolute left-0 flex flex-col border-r border-(--t-line) bg-(--t-bg) p-1"
				style={{ top: BAR, bottom: 0, width: RAIL }}
			>
				<div className="flex h-8 items-center gap-2 px-2" style={{ marginTop: 28 }}>
					<SpoolMark className="h-6 w-5 text-(--t-thread)" />
					<span className="t-display text-(--t-text)">spool</span>
				</div>
				<div className="mt-6 flex flex-col">
					{home.nav.map((n) => (
						<NavRow key={n} icon={<FrameIcon className="size-3.5" />} label={n} selected />
					))}
				</div>
				<span className="flex-1" />
				<NavRow icon={<CogIcon className="size-3.5" />} label={home.foot} />
			</aside>
			<main className="absolute overflow-hidden bg-(--t-bg)" style={{ top: BAR, left: RAIL, right: 0, bottom: 0 }}>
				<div className="flex flex-col px-9" style={{ paddingTop: 32 }}>
					<div className="flex h-8 items-center gap-2">
						<h1 className="t-display flex-1 text-(--t-text)">{home.title}</h1>
						<SearchField />
						<Button>{importLabel}</Button>
						<Button>{openLabel}</Button>
						<Button kind="primary" icon={<PlusIcon className="size-3.5" />}>
							{newLabel}
						</Button>
					</div>
					<div className="mt-4 flex h-7 items-center justify-between">
						<span className="t-detail text-(--t-muted)">{home.count}</span>
						<span className="flex items-center gap-1.5">
							<span className="t-label text-(--t-muted)">Sort by</span>
							<span className="t-label flex items-center gap-1 text-(--t-text)">
								{home.sort}
								<ChevronIcon open className="size-3 text-(--t-muted)" />
							</span>
						</span>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-8">
						{projects.map((p) => (
							<article key={p.name} className="flex min-w-0 flex-col">
								<div className="relative h-[198px] overflow-hidden rounded-[6px] border border-(--t-line) bg-(--t-canvas)">
									<ProjectArtwork kind={p.art} className="absolute inset-0 h-full w-full" />
								</div>
								<div className="mt-3 flex items-baseline justify-between gap-2">
									<span className="t-value truncate text-(--t-text)">{p.name}</span>
									<span className="t-detail shrink-0 text-(--t-muted)">
										{p.frames ? `${p.frames} frames` : "no frames yet"}
									</span>
								</div>
								<span className="t-detail mt-1 text-(--t-muted)">{p.when}</span>
							</article>
						))}
					</div>
				</div>
			</main>
		</div>
	);
}

// ── Parts ───────────────────────────────────────────────────────────────────

function Spec({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<div className="flex h-4 items-baseline justify-between">
				<span className="t-label text-(--t-muted)">{title}</span>
				{note ? <span className="t-detail text-(--t-faint)">{note}</span> : null}
			</div>
			{children}
		</section>
	);
}

const roles = [
	{ cls: "t-display", name: "display", spec: "24/32 sans 500", sample: "Projects" },
	{ cls: "t-title", name: "title", spec: "13/20 sans 500", sample: "New chat" },
	{ cls: "t-body", name: "body", spec: "13/20 sans", sample: "Say what to change." },
	{ cls: "t-label", name: "label", spec: "12/16 sans", sample: "Position" },
	{ cls: "t-value", name: "value", spec: "12/16 mono", sample: "frames/app/cart" },
	{ cls: "t-detail", name: "detail", spec: "11/16 mono", sample: "390 × 844 · ⌘D" },
];

const swatches = [
	["bg", "--t-bg"],
	["canvas", "--t-canvas"],
	["surface", "--t-surface"],
	["raised", "--t-raised"],
	["hover", "--t-hover"],
	["select", "--t-select"],
	["line", "--t-line"],
	["faint", "--t-faint"],
	["muted", "--t-muted"],
	["text", "--t-text"],
	["thread", "--t-thread"],
	["thread-text", "--t-thread-text"],
	["thread-fill", "--t-thread-fill"],
] as const;

const hex: Record<Appearance, Record<string, string>> = {
	dark: {
		"--t-bg": "#0e0e0e",
		"--t-canvas": "#161616",
		"--t-surface": "#1c1c1c",
		"--t-raised": "#282828",
		"--t-hover": "#181818",
		"--t-select": "#2a2a2a",
		"--t-line": "#262626",
		"--t-faint": "#75726e",
		"--t-muted": "#94918d",
		"--t-text": "#f0efed",
		"--t-thread": "#f5391a",
		"--t-thread-text": "#f5391a",
		"--t-thread-fill": "#df300e",
	},
	light: {
		"--t-bg": "#f0efec",
		"--t-canvas": "#e6e5e1",
		"--t-surface": "#faf9f6",
		"--t-raised": "#ffffff",
		"--t-hover": "#e9e8e4",
		"--t-select": "#e2e0db",
		"--t-line": "#dcdad5",
		"--t-faint": "#807d78",
		"--t-muted": "#696662",
		"--t-text": "#1a1917",
		"--t-thread": "#f5391a",
		"--t-thread-text": "#c42d0f",
		"--t-thread-fill": "#df300e",
	},
};

function ContextMenu() {
	const plain = menuItems.filter((m) => !m.danger);
	const danger = menuItems.filter((m) => m.danger);
	const row = (m: (typeof menuItems)[number], hover?: boolean) => (
		<div
			key={m.label}
			className={cn(
				"t-body flex h-7 items-center justify-between rounded-[6px] px-2",
				hover && "bg-(--t-hover)",
				m.danger ? "text-(--t-thread-text)" : "text-(--t-text)",
			)}
		>
			{m.label}
			<span className="t-detail text-(--t-muted)">{m.key}</span>
		</div>
	);
	return (
		<div className="flex flex-col rounded-[10px] border border-(--t-line) bg-(--t-surface) p-1 shadow-(--t-float)">
			{plain.map((m, i) => row(m, i === 1))}
			<Line className="my-1" />
			{danger.map((m) => row(m))}
		</div>
	);
}

function PartsHalf({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-tidy relative flex h-[900px] w-[720px] flex-col gap-5 overflow-hidden px-6 py-5"
			data-appearance={appearance}
		>
			<header className="flex h-8 items-center justify-between gap-4 border-b border-(--t-line) pb-3">
				<span className="flex items-center gap-2">
					<SpoolMark className="h-4 w-3.5 text-(--t-thread)" />
					<span className="t-title text-(--t-text)">tidy</span>
					<span className="t-detail text-(--t-muted)">{appearance}</span>
				</span>
				<span className="t-detail text-(--t-muted)">
					space 4 · bar 44 · strip 36 · control 32 · row 28 · bit 20 · radius 10/6/4
				</span>
			</header>
			<div className="grid flex-1 grid-cols-3 gap-6">
				{/* column one: type, colour, buttons */}
				<div className="flex flex-col gap-5">
					<Spec title="Type" note="sans read · mono printed">
						<div className="flex flex-col">
							{roles.map((r) => (
								<div key={r.name} className="flex flex-col border-b border-(--t-line) py-1.5 last:border-b-0">
									<span className={cn(r.cls, "truncate text-(--t-text)")}>{r.sample}</span>
									<span className="t-detail text-(--t-muted)">
										{r.name} <span className="text-(--t-faint)">{r.spec}</span>
									</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec title="Colour" note="by role">
						<div className="grid grid-cols-1 gap-y-1">
							{swatches.map(([name, v]) => (
								<div key={v} className="flex h-5 items-center gap-2">
									<span
										className="size-4 shrink-0 rounded-[4px] border border-(--t-line)"
										style={{ background: `var(${v})` }}
									/>
									<span className="t-value flex-1 text-(--t-text)">{name}</span>
									<span className="t-detail text-(--t-muted)">{hex[appearance][v]}</span>
								</div>
							))}
						</div>
					</Spec>
				</div>

				{/* column two: controls */}
				<div className="flex flex-col gap-5">
					<Spec title="Buttons" note="32 · radius 6">
						<div className="flex flex-wrap gap-2">
							<Button kind="primary" icon={<PlusIcon className="size-3.5" />}>
								New project…
							</Button>
							<Button>Open…</Button>
							<Button kind="ghost">Cancel</Button>
							<Button kind="danger">Move to Trash</Button>
							<span className="flex items-center gap-1">
								<IconButton size={32} active>
									<ConnectionsIcon className="size-4" />
								</IconButton>
								<IconButton size={32}>
									<CogIcon className="size-4" />
								</IconButton>
								<IconButton>
									<PlusIcon className="size-3.5" />
								</IconButton>
								<IconButton>
									<DotsIcon className="size-3.5" />
								</IconButton>
							</span>
						</div>
					</Spec>
					<Spec title="Inputs" note="32">
						<span className="t-value flex h-8 items-center rounded-[6px] border border-(--t-line) bg-(--t-surface) px-2.5 text-(--t-text)">
							kaffe
							<span className="ml-px h-4 w-px bg-(--t-thread)" />
						</span>
						<SearchField width={208} />
					</Spec>
					<Spec title="Segmented · toggle" note="32 · 4 inside">
						<div className="flex flex-col gap-2">
							<span className="flex h-8 items-center gap-0.5 self-start whitespace-nowrap rounded-[6px] border border-(--t-line) bg-(--t-bg) p-0.5">
								<span className="t-body flex h-[26px] items-center rounded-[4px] bg-(--t-raised) px-2.5 text-(--t-text)">
									Ask
								</span>
								<span className="t-body flex h-[26px] items-center rounded-[4px] px-2.5 text-(--t-muted)">
									Only this Mac
								</span>
							</span>
							<span className="flex h-7 items-center gap-2">
								<Toggle />
								<span className="t-detail text-(--t-faint)">off</span>
								<span className="w-2" />
								<Toggle on />
								<span className="t-detail text-(--t-faint)">on</span>
							</span>
						</div>
					</Spec>
					<Spec title="Tabs" note="window · panel">
						<div className="flex items-center gap-1 rounded-[6px] bg-(--t-bg)">
							<WindowTab name="kaffe" active />
							<WindowTab name="tvärsö" />
						</div>
						<div className="flex h-8 items-stretch gap-4 border-b border-(--t-line)">
							<span className="t-body relative flex items-center text-(--t-text)">
								General
								<span className="absolute inset-x-0 -bottom-px h-0.5 bg-(--t-thread)" />
							</span>
							<span className="t-body flex items-center text-(--t-muted)">Appearance</span>
						</div>
					</Spec>
					<Spec title="Chips" note="20 · radius 4">
						<div className="flex flex-wrap items-center gap-2">
							<span className="t-detail text-(--t-muted)">3</span>
							<Chip tone="solid">390 × 844</Chip>
							<Chip tone="solid">{element.kind}</Chip>
							<Kbd>/</Kbd>
							<Kbd>⌘D</Kbd>
							<SelectionChip />
						</div>
					</Spec>
					<Spec title="Floats" note="radius 10 · one shadow">
						<div className="flex items-center gap-3">
							<Toolbar active="select" />
							<span className="t-label flex h-6 items-center gap-2 rounded-[6px] border border-(--t-line) bg-(--t-surface) px-2 text-(--t-text) shadow-(--t-float)">
								Edit
								<span className="t-detail text-(--t-muted)">E</span>
							</span>
						</div>
						<div className="flex h-10 items-center gap-1 rounded-[10px] border border-(--t-line) bg-(--t-surface) py-1 pr-1 pl-3 shadow-(--t-float)">
							<span className="t-body flex-1 truncate text-(--t-text)">{toast.text}</span>
							<Button kind="ghost">{toast.action}</Button>
						</div>
					</Spec>
				</div>

				{/* column three: rows */}
				<div className="flex flex-col gap-5">
					<Spec title="Rail rows" note="28 · radius 6">
						<div className="-mx-1 flex flex-col">
							{[
								{ label: "rest", el: <RailRow kind="frame" name="menu" guide="mid" /> },
								{ label: "hover", el: <RailRow kind="frame" name="menu" state="hover" guide="mid" /> },
								{ label: "selected", el: <RailRow kind="frame" name="cart" state="selected" guide="mid" /> },
								{ label: "unseen", el: <RailRow kind="frame" name="receipt" unseen guide="last" /> },
								{ label: "current", el: <RailRow kind="page" name="app" open current count={3} /> },
							].map((r) => (
								<div key={r.label} className="flex items-center">
									<span className="t-detail w-16 shrink-0 pl-1 text-(--t-faint)">{r.label}</span>
									<div className="min-w-0 flex-1">{r.el}</div>
								</div>
							))}
						</div>
					</Spec>
					<Spec title="Property rows" note="28">
						<div className="-mx-1 flex flex-col">
							<SectionLabel aside={selection.source}>Position</SectionLabel>
							<PropRow label="X" value={selection.x} unit="px" />
							<PropRow label="Y" value={selection.y} unit="px" state="hover" />
						</div>
					</Spec>
					<Spec title="Menu" note="rows 28 · float 10">
						<ContextMenu />
					</Spec>
					<Spec title="Panel header" note="bar 44 · pad 12">
						<div className="-mx-1 flex h-11 items-center gap-2 border-y border-(--t-line) pr-1 pl-3">
							<FrameIcon className="size-3.5 text-(--t-thread)" />
							<span className="t-value text-(--t-text)">{selection.name}</span>
							<span className="flex-1" />
							<IconButton>
								<DotsIcon className="size-3.5" />
							</IconButton>
							<Collapse />
						</div>
					</Spec>
					<Spec title="Settings row">
						<div className="flex items-start gap-4 border-y border-(--t-line) py-3">
							<span className="flex flex-1 flex-col">
								<span className="t-body text-(--t-text)">{settingsRow.title}</span>
								<span className="t-label text-(--t-muted)">{settingsRow.detail}</span>
							</span>
							<span className="pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>
				</div>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px]">
			<PartsHalf appearance="dark" />
			<PartsHalf appearance="light" />
		</div>
	);
}
