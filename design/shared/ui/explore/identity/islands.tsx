import type { CSSProperties, ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
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
	type Appearance,
} from "shared/lib/explore/identity/world";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { projects } from "shared/ui/demo/home-data";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
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
import "./islands.css";

/* ── the rules ─────────────────────────────────────────────────────────────
 * spacing on a 4px base. Islands sit 8 from the window and 8 from each other, 4 inside.
 * radius: 12 an island, 8 anything inside one, 4 a chip or a key.
 * every row and every control is 28 tall (h-7); chips and keys are 20 (h-5).
 * colour by role: neutrals carry everything, red marks where you are and what is acted
 * on (the selection, the current page, the picked element, the flows). Active controls
 * are a neutral fill, never red. One shadow, --i-float, on what floats.
 * type: words are sans, names and numbers are mono. */

const ROW = "h-7";

/* ── icons this take draws itself, in the shared set's 16-grid and 1.5 stroke ── */

function HomeIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path
				d="M2.75 7 8 2.75 13.25 7v5.75a.5.5 0 0 1-.5.5H9.5V9.75h-3v3.5H3.25a.5.5 0 0 1-.5-.5z"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function HelpIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.4" />
			<path
				d="M6.35 6.4a1.7 1.7 0 0 1 3.3.45c0 1.15-1.65 1.3-1.65 2.4"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
			<circle cx="8" cy="11.1" r="0.8" fill="currentColor" />
		</svg>
	);
}

function DownIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function NextIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="m4.5 3 3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/* ── primitives ──────────────────────────────────────────────────────────── */

function Island({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
	return (
		<div className={cn("i-island", className)} style={style}>
			{children}
		</div>
	);
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind = "secondary", children, className }: { kind?: ButtonKind; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"i-body inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 font-medium whitespace-nowrap",
				ROW,
				kind === "primary" && "bg-(--i-ink) text-(--i-on-ink)",
				kind === "secondary" && "bg-(--i-fill) text-(--i-text)",
				kind === "ghost" && "text-(--i-muted)",
				kind === "danger" && "bg-(--i-thread-soft) text-(--i-thread-ink)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function IconButton({
	children,
	active,
	className,
}: {
	children: ReactNode;
	active?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
				active ? "bg-(--i-fill) text-(--i-text)" : "text-(--i-muted)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="i-micro inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-(--i-fill) px-1 text-(--i-muted)">
			{children}
		</span>
	);
}

function Count({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("i-micro tabular-nums text-(--i-faint)", className)}>{children}</span>;
}

/** red solid chip: what spool is pointing at (the size of the selection, the picked element's kind) */
function MarkChip({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
	return (
		<span
			className={cn(
				"i-micro inline-flex h-5 items-center rounded-[4px] bg-(--i-thread) px-1.5 whitespace-nowrap text-(--i-on-thread) tabular-nums",
				className,
			)}
			style={style}
		>
			{children}
		</span>
	);
}

/** the selection as the composer carries it: a red tick, the address, a way out */
function SelectionChip() {
	return (
		<span className="inline-flex h-5 items-center gap-1.5 rounded-[4px] bg-(--i-fill) pr-1 pl-1.5">
			<span className="h-3 w-0.5 rounded-full bg-(--i-thread)" />
			<span className="i-micro whitespace-nowrap text-(--i-text)">{element.chip}</span>
			<CloseIcon className="size-3 text-(--i-faint)" />
		</span>
	);
}

function UnseenDot() {
	return (
		<span className="flex size-3.5 shrink-0 items-center justify-center">
			<span className="size-[5px] rounded-full bg-(--i-text) opacity-85" />
		</span>
	);
}

function Divider({ className }: { className?: string }) {
	return <div className={cn("-mx-1 my-1 h-px bg-(--i-line)", className)} />;
}

function SearchField({ placeholder, className }: { placeholder: string; className?: string }) {
	return (
		<div className={cn("flex items-center gap-2 rounded-lg bg-(--i-well) pr-1 pl-2.5", ROW, className)}>
			<SearchIcon className="size-3.5 text-(--i-faint)" />
			<span className="i-body flex-1 truncate text-(--i-faint)">{placeholder}</span>
			<Kbd>{home.searchKey}</Kbd>
		</div>
	);
}

function ValueField({
	axis,
	value,
	focus,
	className,
}: {
	axis: string;
	value: string | number;
	focus?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-w-0 shrink-0 items-center gap-2 rounded-lg bg-(--i-well) px-2",
				ROW,
				focus && "shadow-[inset_0_0_0_1px_var(--i-thread)]",
				className,
			)}
		>
			<span className="i-micro w-2 text-(--i-faint)">{axis}</span>
			<span className="i-name flex-1 tabular-nums text-(--i-text)">{value}</span>
			<span className="i-micro text-(--i-faint)">px</span>
		</div>
	);
}

function Segmented({ options, active }: { options: string[]; active: number }) {
	return (
		<div className={cn("inline-flex items-center gap-0.5 rounded-lg bg-(--i-well) p-0.5", ROW)}>
			{options.map((o, i) => (
				<span
					key={o}
					className={cn(
						"i-label flex h-6 items-center justify-center rounded-md px-2.5 whitespace-nowrap",
						i === active ? "bg-(--i-fill) text-(--i-text)" : "text-(--i-muted)",
					)}
				>
					{o}
				</span>
			))}
		</div>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-5 w-8 shrink-0 items-center rounded-full p-0.5",
				on ? "bg-(--i-thread)" : "bg-(--i-fill)",
			)}
		>
			<span className={cn("size-4 rounded-full bg-(--i-knob) shadow-[0_1px_2px_rgb(0_0_0/0.2)]", on && "translate-x-3")} />
		</span>
	);
}

function WindowTab({ name, active, home: isHome }: { name?: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-2 rounded-lg",
				ROW,
				isHome ? "pr-2.5 pl-2" : active ? "pr-1.5 pl-2.5" : "px-2.5",
				active ? "bg-(--i-fill) text-(--i-text)" : "text-(--i-muted)",
			)}
		>
			{isHome ? (
				<>
					<HomeIcon className="size-4" />
					<span className="i-body">Home</span>
				</>
			) : (
				<span className="i-name">{name}</span>
			)}
			{active && !isHome ? <CloseIcon className="size-3 text-(--i-faint)" /> : null}
		</span>
	);
}

/* ── the one list row ──────────────────────────────────────────────────────
 * 28 tall, radius 8. rest: nothing. hover: --i-hover. selected: --i-fill and a red
 * icon. current page: a red folder. unseen: a dot at the right end. */

type RowState = "rest" | "hover" | "selected" | "current" | "unseen";

function PageRow({ name, count, open, state = "rest" }: { name: string; count: number; open?: boolean; state?: RowState }) {
	return (
		<div
			className={cn(
				"flex items-center gap-1 rounded-lg pr-2 pl-1",
				ROW,
				state === "hover" && "bg-(--i-hover)",
				state === "selected" && "bg-(--i-fill)",
			)}
		>
			<span className="flex w-4 justify-center">
				<ChevronIcon open={open} className="size-3 text-(--i-faint)" />
			</span>
			<span className="flex w-4 justify-center">
				<FolderIcon
					className={cn("size-3.5", state === "current" || state === "selected" ? "text-(--i-thread)" : "text-(--i-muted)")}
				/>
			</span>
			<span className="i-name ml-1 flex-1 truncate text-(--i-text)">{name}</span>
			<Count>{count}</Count>
		</div>
	);
}

function FrameRow({ name, state = "rest" }: { name: string; state?: RowState }) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-lg pr-2 pl-9",
				ROW,
				selected && "bg-(--i-fill)",
				state === "hover" && "bg-(--i-hover)",
			)}
		>
			<FrameIcon className={cn("size-3.5 shrink-0", selected ? "text-(--i-thread)" : "text-(--i-muted)")} />
			<span className="i-name flex-1 truncate text-(--i-text)">{name}</span>
			{state === "unseen" ? <UnseenDot /> : null}
		</div>
	);
}

/* ── the islands of the project window ───────────────────────────────────── */

function TabsIsland({ onHome }: { onHome?: boolean }) {
	return (
		<Island className="flex items-center gap-1">
			<WindowTab home active={onHome} />
			<span className="mx-1 h-4 w-px bg-(--i-line)" />
			{tabs.map((t) => (
				<WindowTab key={t.name} name={t.name} active={!onHome && t.active} />
			))}
			<IconButton>
				<PlusIcon className="size-3.5" />
			</IconButton>
		</Island>
	);
}

function ViewIsland() {
	return (
		<Island className="flex items-center gap-1">
			<IconButton active>
				<ConnectionsIcon className="size-4" />
			</IconButton>
			<span className={cn("i-name flex items-center px-2 tabular-nums text-(--i-muted)", ROW)}>{zoom}</span>
		</Island>
	);
}

function PagesIsland() {
	return (
		<Island className="flex flex-col">
			<div className={cn("flex items-center gap-2 pl-2", ROW)}>
				<span className="flex items-baseline gap-2">
					<span className="i-title">Pages</span>
					<Count>{pages.length}</Count>
				</span>
				<span className="flex-1" />
				<IconButton>
					<PlusIcon className="size-3.5" />
				</IconButton>
				<IconButton className="-ml-2">
					<CloseIcon className="size-3.5" />
				</IconButton>
				<IconButton className="-ml-2">
					<PanelCaret dir="left" className="h-4 w-3" />
				</IconButton>
			</div>
			<Divider />
			{pages.map((p) => (
				<div key={p.name} className="flex flex-col">
					<PageRow name={p.name} count={p.count} open={p.open} state={p.current ? "current" : "rest"} />
					{p.open
						? p.frames.map((f) => (
								<FrameRow key={f.name} name={f.name} state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"} />
							))
						: null}
				</div>
			))}
			<Divider />
			<div className={cn("flex items-center px-2", ROW)}>
				<span className="i-micro text-(--i-faint)">{railHint}</span>
			</div>
		</Island>
	);
}

/** the panel's own header row: the switcher as icon tabs, help and settings, collapse */
function PanelSwitcher({ panel }: { panel: "properties" | "agent" }) {
	return (
		<div className="flex items-center gap-1">
			<IconButton active={panel === "properties"}>
				<PropertiesIcon className="size-4" />
			</IconButton>
			<IconButton active={panel === "agent"}>
				<AgentIcon className="size-4" />
			</IconButton>
			<span className="flex-1" />
			<IconButton>
				<HelpIcon className="size-4" />
			</IconButton>
			<IconButton>
				<CogIcon className="size-4" />
			</IconButton>
			<span className="mx-0.5 h-4 w-px bg-(--i-line)" />
			<IconButton>
				<PanelCaret dir="right" className="h-4 w-3" />
			</IconButton>
		</div>
	);
}

function SectionHead({ children, source }: { children: ReactNode; source?: string }) {
	return (
		<div className={cn("flex items-center justify-between px-2", ROW)}>
			<span className="i-label text-(--i-muted)">{children}</span>
			{source ? <span className="i-micro text-(--i-faint)">{source}</span> : null}
		</div>
	);
}

function PropertiesIsland() {
	return (
		<Island className="flex flex-col">
			<PanelSwitcher panel="properties" />
			<Divider />
			<div className={cn("flex items-center gap-2 pl-2", ROW)}>
				<FrameIcon className="size-3.5 text-(--i-thread)" />
				<span className="i-name flex-1 text-(--i-text)">{selection.name}</span>
				<IconButton>
					<DotsIcon className="size-4" />
				</IconButton>
			</div>
			<Divider />
			<SectionHead source={selection.source}>Position</SectionHead>
			<div className="flex gap-1">
				<ValueField axis="x" value={selection.x} className="flex-1" />
				<ValueField axis="y" value={selection.y} className="flex-1" />
			</div>
			<div className="h-1" />
			<SectionHead source={selection.source}>Size</SectionHead>
			<div className="flex gap-1">
				<ValueField axis="w" value={selection.w} className="flex-1" />
				<ValueField axis="h" value={selection.h} className="flex-1" />
			</div>
		</Island>
	);
}

function EditedFile({ path, added, removed }: { path: string; added: number; removed: number }) {
	return (
		<div className={cn("flex items-center gap-2 rounded-lg bg-(--i-well) px-2", ROW)}>
			<FrameIcon className="size-3.5 shrink-0 text-(--i-muted)" />
			<span className="i-name min-w-0 flex-1 truncate text-(--i-text)">{path}</span>
			<span className="i-micro tabular-nums text-(--i-text)">+{added}</span>
			<span className="i-micro tabular-nums text-(--i-faint)">−{removed}</span>
		</div>
	);
}

function AgentIsland() {
	const edit = agent.turn.edits[0];
	return (
		<Island className="flex h-full flex-col">
			<PanelSwitcher panel="agent" />
			<Divider />
			<div className={cn("flex items-center gap-1 pl-2", ROW)}>
				<span className="i-title">{agent.title}</span>
				<DownIcon className="size-3 text-(--i-faint)" />
				<span className="flex-1" />
				<IconButton>
					<PlusIcon className="size-3.5" />
				</IconButton>
			</div>
			<div className={cn("flex items-center gap-1 px-2", ROW)}>
				<span className="i-name text-(--i-text)">{agent.model}</span>
				<NextIcon className="size-3 text-(--i-faint)" />
				<span className="flex-1" />
				<span className="i-label text-(--i-muted)">{agent.scope}</span>
			</div>
			<Divider />
			<div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-1 pb-3">
				<div className="ml-10 rounded-lg bg-(--i-fill) px-3 py-2">
					<p className="i-body text-(--i-text)">{agent.turn.ask}</p>
				</div>
				<div className="flex flex-col gap-2">
					<span className="i-micro px-2 text-(--i-faint)">{agent.model}</span>
					<p className="i-body px-2 text-(--i-text)">{agent.turn.said}</p>
					{edit ? <EditedFile path={edit.path} added={edit.added} removed={edit.removed} /> : null}
				</div>
			</div>
			<div className="flex flex-col gap-2 rounded-lg bg-(--i-well) p-2">
				<div>
					<SelectionChip />
				</div>
				<p className="i-body h-10 px-0.5 text-(--i-faint)">{agent.placeholder}</p>
			</div>
			<div className={cn("mt-1 flex items-center justify-between", ROW)}>
				<Button kind="ghost" className="px-2">
					<span className="i-label">{agent.account}</span>
				</Button>
				<span className={cn("flex items-center gap-1 rounded-lg px-2 text-(--i-muted)", ROW)}>
					<span className="i-micro">{agent.mode}</span>
					<NextIcon className="size-3" />
				</span>
			</div>
		</Island>
	);
}

function ToolbarIsland({ active }: { active: string }) {
	const icon = (name: string) =>
		name === "select" ? (
			<SelectIcon className="size-4" />
		) : name === "edit" ? (
			<EditIcon className="size-4" />
		) : (
			<HandIcon className="size-4" />
		);
	return (
		<Island className="flex items-center gap-1">
			{tools.map((t) => (
				<IconButton key={t.name} active={t.name === active}>
					{icon(t.name)}
				</IconButton>
			))}
		</Island>
	);
}

/* ── the canvas ──────────────────────────────────────────────────────────── */

const FW = drawnSize.w;
const FH = drawnSize.h;
const TOP = 188;
const XS = [284, 580, 876] as const;
const BOTTOM = TOP + FH;

function FrameLabel({ name, x, selected, unseen }: { name: string; x: number; selected?: boolean; unseen?: boolean }) {
	return (
		<div className="absolute flex h-5 items-center gap-1.5" style={{ left: x, top: TOP - 28, width: FW }}>
			<span className={cn("i-name", selected ? "text-(--i-thread-ink)" : "text-(--i-muted)")}>{name}</span>
			<span className="flex-1" />
			{unseen ? <UnseenDot /> : null}
			{selected ? (
				<span className="inline-flex items-center gap-1 text-(--i-thread-ink)">
					<PlayIcon className="size-2" />
					<span className="i-micro">play</span>
				</span>
			) : null}
		</div>
	);
}

function FrameSelection({ x }: { x: number }) {
	const corners = [
		[x, TOP],
		[x + FW, TOP],
		[x, BOTTOM],
		[x + FW, BOTTOM],
	] as const;
	return (
		<>
			<div
				className="pointer-events-none absolute rounded-[9px] shadow-[0_0_0_1.5px_var(--i-thread)]"
				style={{ left: x - 1, top: TOP - 1, width: FW + 2, height: FH + 2 }}
			/>
			{corners.map(([hx, hy]) => (
				<span
					key={`${hx}-${hy}`}
					className="absolute size-1.5 border border-(--i-thread) bg-white"
					style={{ left: hx - 3, top: hy - 3 }}
				/>
			))}
			<div className="absolute flex justify-center" style={{ left: x, top: BOTTOM + 8, width: FW }}>
				<MarkChip>
					{frameSize.w} × {frameSize.h}
				</MarkChip>
			</div>
		</>
	);
}

/** the picked element in edit mode: the cart's first row, its kind on its shoulder */
function ElementPick() {
	const x = XS[0] + 17;
	const y = TOP + 49;
	const w = FW - 34;
	const h = 28;
	return (
		<>
			<div
				className="pointer-events-none absolute rounded-[6px] shadow-[0_0_0_1.5px_var(--i-thread)]"
				style={{ left: x - 1, top: y - 1, width: w + 2, height: h + 2 }}
			/>
			<div className="absolute flex justify-end" style={{ left: x - 1, top: y - 25, width: w + 2 }}>
				<MarkChip>{element.kind}</MarkChip>
			</div>
		</>
	);
}

function Flows() {
	const [cart, menu, receipt] = XS;
	// cart → receipt: from Pay, under menu, into receipt
	const payY = BOTTOM - 31;
	const rY = TOP + FH / 2;
	const a = `M${cart + FW} ${payY} C${cart + FW + 120} ${payY}, ${receipt - 140} ${rY}, ${receipt - 7} ${rY}`;
	// menu → cart: from Checkout's left, down, into cart's foot
	const coY = BOTTOM - 31;
	const cx = cart + 64;
	const b = `M${menu} ${coY} C${menu - 32} ${coY + 12}, ${menu - 60} ${BOTTOM + 70}, ${menu - 130} ${BOTTOM + 70} S${cx} ${BOTTOM + 52}, ${cx} ${BOTTOM + 8}`;
	// receipt → menu (might): from receipt's foot back to menu's foot
	const rx = receipt + FW / 2;
	const mx = menu + FW / 2 + 20;
	const c = `M${rx} ${BOTTOM} C${rx} ${BOTTOM + 70}, ${mx} ${BOTTOM + 70}, ${mx} ${BOTTOM + 8}`;
	const right = (x: number, y: number) => `M${x} ${y - 4} L${x + 7} ${y} L${x} ${y + 4} Z`;
	const up = (x: number, y: number) => `M${x - 4} ${y} L${x} ${y - 7} L${x + 4} ${y} Z`;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
			<g fill="none" stroke="var(--i-thread)" strokeWidth="1.5" strokeLinecap="round">
				<path d={a} />
				<path d={b} />
				<path d={c} strokeDasharray="4 4" />
			</g>
			<g fill="var(--i-thread)">
				<path d={right(receipt - 7, rY)} />
				<path d={up(cx, BOTTOM + 8)} />
				<path d={up(mx, BOTTOM + 8)} />
			</g>
		</svg>
	);
}

function Canvas({ edit }: { edit: boolean }) {
	return (
		<div className="absolute inset-0 bg-(--i-canvas)">
			<Flows />
			{canvasFrames.map((f, i) => (
				<div key={f.name} className="absolute" style={{ left: XS[i], top: TOP, width: FW, height: FH }}>
					<CoffeeScreen screen={f.screen} />
				</div>
			))}
			{canvasFrames.map((f, i) => (
				<FrameLabel
					key={f.name}
					name={f.name}
					x={XS[i] ?? 0}
					selected={!edit && "selected" in f && f.selected}
					unseen={"unseen" in f && f.unseen}
				/>
			))}
			{edit ? <ElementPick /> : <FrameSelection x={XS[0]} />}
		</div>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	const edit = panel === "agent";
	return (
		<div className="id-islands relative h-full w-full overflow-hidden" data-appearance={appearance}>
			<Canvas edit={edit} />
			<div className="absolute top-2 left-2">
				<TabsIsland />
			</div>
			<div className="absolute top-2 right-2">
				<ViewIsland />
			</div>
			<div className="absolute top-[52px] left-2 w-60">
				<PagesIsland />
			</div>
			{edit ? (
				<div className="absolute top-[52px] right-2 bottom-2 w-90">
					<AgentIsland />
				</div>
			) : (
				<div className="absolute top-[52px] right-2 w-70">
					<PropertiesIsland />
				</div>
			)}
			<div className="absolute bottom-2 left-1/2 -translate-x-1/2">
				<ToolbarIsland active={edit ? "edit" : "select"} />
			</div>
		</div>
	);
}

/* ── Home ────────────────────────────────────────────────────────────────── */

function NavItem({ icon, label, selected }: { icon: ReactNode; label: string; selected?: boolean }) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-lg px-2",
				ROW,
				selected ? "bg-(--i-fill) text-(--i-text)" : "text-(--i-muted)",
			)}
		>
			{icon}
			<span className="i-body">{label}</span>
		</div>
	);
}

function ProjectTile({ p }: { p: (typeof projects)[number] }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="aspect-[16/10] overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--i-line)]">
				<ProjectArtwork kind={p.art} className="h-full w-full" />
			</div>
			<div className="flex flex-col px-1">
				<div className="flex h-5 items-center justify-between">
					<span className="i-name text-(--i-text)">{p.name}</span>
					<Count>{p.frames} frames</Count>
				</div>
				<span className="i-micro text-(--i-faint)">{p.when}</span>
			</div>
		</div>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-islands relative h-full w-full overflow-hidden" data-appearance={appearance}>
			<div className="absolute top-2 left-2">
				<TabsIsland onHome />
			</div>
			<div className="absolute top-[52px] bottom-2 left-2 w-60">
				<Island className="flex h-full flex-col">
					<div className="flex h-7 items-center gap-2 px-2">
						<SpoolMark className="h-5 w-4 text-(--i-thread)" />
						<span className="i-wordmark">spool</span>
					</div>
					<Divider />
					<NavItem
						icon={<FolderIcon className="size-4 text-(--i-thread)" />}
						label={home.nav[0] ?? "Projects"}
						selected
					/>
					<span className="flex-1" />
					<NavItem icon={<CogIcon className="size-4" />} label={home.foot} />
				</Island>
			</div>
			<div className="absolute top-[52px] right-2 bottom-2 left-[256px]">
				<Island className="h-full">
					<div className="flex h-full flex-col px-7 pt-6">
						<div className="flex items-center gap-2">
							<h1 className="i-display flex-1">{home.title}</h1>
							<SearchField placeholder={home.search} className="w-56" />
							<Button kind="secondary">{home.actions[0]}</Button>
							<Button kind="secondary">{home.actions[1]}</Button>
							<Button kind="primary" className="pl-2.5">
								<PlusIcon className="size-3.5" />
								{home.actions[2]}
							</Button>
						</div>
						<div className={cn("mt-5 mb-3 flex items-center justify-between", ROW)}>
							<Count className="text-(--i-muted)">{home.count}</Count>
							<span className="flex items-center gap-1.5">
								<span className="i-label text-(--i-muted)">Sort by</span>
								<span className={cn("flex items-center gap-1 rounded-lg pr-1.5 pl-2 text-(--i-text)", ROW)}>
									<span className="i-label">{home.sort}</span>
									<DownIcon className="size-3 text-(--i-faint)" />
								</span>
							</span>
						</div>
						<div className="grid grid-cols-3 gap-x-4 gap-y-6">
							{projects.map((p) => (
								<ProjectTile key={p.name} p={p} />
							))}
						</div>
					</div>
				</Island>
			</div>
		</div>
	);
}

/* ── Parts ───────────────────────────────────────────────────────────────── */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<span className="i-micro px-1 text-(--i-faint)">{label}</span>
			{children}
		</div>
	);
}

function StateLabel({ children }: { children: ReactNode }) {
	return <span className="i-micro w-14 shrink-0 text-(--i-faint)">{children}</span>;
}

const typeRoles = [
	{ cls: "i-display", name: "display", spec: "sans 600 22/28", sample: "Projects" },
	{ cls: "i-title", name: "title", spec: "sans 600 13/20", sample: "New chat" },
	{ cls: "i-body", name: "body", spec: "sans 450 13/20", sample: "Say what to change." },
	{ cls: "i-label", name: "label", spec: "sans 450 12/16", sample: "Position" },
	{ cls: "i-name", name: "name", spec: "mono 12/16", sample: "frames/app/cart" },
	{ cls: "i-micro", name: "micro", spec: "mono 11/16", sample: "390 × 844" },
];

const palette: Record<Appearance, { name: string; hex: string }[]> = {
	dark: [
		{ name: "canvas", hex: "#151514" },
		{ name: "island", hex: "#1e1d1c" },
		{ name: "fill", hex: "#fff 8%" },
		{ name: "text", hex: "#f0efed" },
		{ name: "muted", hex: "#a19e99" },
		{ name: "faint", hex: "#7c7974" },
		{ name: "thread", hex: "#f5391a" },
	],
	light: [
		{ name: "canvas", hex: "#e7e5e0" },
		{ name: "island", hex: "#fcfbf9" },
		{ name: "fill", hex: "#302418 7.5%" },
		{ name: "text", hex: "#1a1917" },
		{ name: "muted", hex: "#625f5a" },
		{ name: "faint", hex: "#8a867f" },
		{ name: "thread", hex: "#f5391a" },
	],
};

const swatchBg: Record<string, string> = {
	canvas: "bg-(--i-canvas)",
	island: "bg-(--i-solid)",
	fill: "bg-(--i-fill)",
	text: "bg-(--i-text)",
	muted: "bg-(--i-muted)",
	faint: "bg-(--i-faint)",
	thread: "bg-(--i-thread)",
};

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-islands relative flex h-full flex-col gap-3 overflow-hidden p-4" data-appearance={appearance}>
			<div className="flex h-5 items-center gap-2 px-1">
				<SpoolMark className="h-4 w-3 text-(--i-thread)" />
				<span className="i-micro text-(--i-muted)">islands · {appearance}</span>
			</div>

			{/* controls */}
			<div className="grid grid-cols-3 gap-3">
				<Island className="flex flex-col gap-1.5 p-3">
					<Spec label="button · 28">
						<div className="flex items-center gap-1.5">
							<Button kind="primary">New project…</Button>
							<Button kind="secondary">Open…</Button>
						</div>
						<div className="flex items-center gap-1.5">
							<Button kind="ghost">Import…</Button>
							<Button kind="danger">Move to Trash</Button>
						</div>
						<div className="flex items-center gap-1.5">
							<IconButton>
								<PlusIcon className="size-3.5" />
							</IconButton>
							<IconButton active>
								<SelectIcon className="size-4" />
							</IconButton>
							<span className="i-micro pl-1 text-(--i-faint)">icon</span>
						</div>
					</Spec>
				</Island>
				<Island className="flex flex-col gap-3 p-3">
					<Spec label="input · search">
						<ValueField axis="w" value={selection.w} focus />
						<SearchField placeholder={home.search} />
					</Spec>
					<Spec label="segmented · toggle">
						<Segmented options={["Ask", "Only this Mac"]} active={0} />
						<div className="flex h-7 items-center gap-2">
							<Toggle on />
							<Toggle />
						</div>
					</Spec>
				</Island>
				<Island className="flex flex-col gap-3 p-3">
					<Spec label="tab · window">
						<div className="flex items-center gap-1">
							<WindowTab home />
							<WindowTab name="kaffe" active />
						</div>
						<div className="flex items-center gap-1">
							<WindowTab name="tvärsö" />
							<WindowTab name="fieldnotes" />
						</div>
					</Spec>
					<Spec label="tab · panel">
						<div className="flex items-center gap-1">
							<IconButton active>
								<PropertiesIcon className="size-4" />
							</IconButton>
							<IconButton>
								<AgentIcon className="size-4" />
							</IconButton>
						</div>
					</Spec>
				</Island>
			</div>

			{/* rows and what floats */}
			<div className="grid grid-cols-3 gap-3">
				<Island className="flex flex-col p-3">
					<Spec label="row · 28 · pages rail">
						<div className="flex flex-col">
							{(
								[
									["rest", <FrameRow key="r" name="menu" />],
									["hover", <FrameRow key="h" name="menu" state="hover" />],
									["selected", <FrameRow key="s" name="cart" state="selected" />],
									["current", <PageRow key="c" name="app" count={3} open state="current" />],
									["unseen", <FrameRow key="u" name="receipt" state="unseen" />],
								] as const
							).map(([label, row]) => (
								<div key={label} className="flex items-center gap-1">
									<StateLabel>{label}</StateLabel>
									<div className="min-w-0 flex-1">{row}</div>
								</div>
							))}
						</div>
					</Spec>
				</Island>
				<div className="flex flex-col gap-3">
					<Island className="flex flex-col p-3">
						<Spec label="property row">
							<div className="-mx-1 flex flex-col">
								<SectionHead source={selection.source}>Position</SectionHead>
								<div className="flex gap-1">
									<ValueField axis="x" value={selection.x} className="flex-1" />
									<ValueField axis="y" value={selection.y} className="flex-1" />
								</div>
							</div>
						</Spec>
					</Island>
					<Island className="flex flex-col p-3">
						<Spec label="chip · 20">
							<div className="flex items-center gap-1.5">
								<Kbd>3</Kbd>
								<Kbd>⌘D</Kbd>
								<MarkChip>
									{frameSize.w} × {frameSize.h}
								</MarkChip>
								<MarkChip>{element.kind}</MarkChip>
							</div>
							<div>
								<SelectionChip />
							</div>
						</Spec>
					</Island>
				</div>
				<div className="flex flex-col gap-3">
					<Spec label="menu · float">
						<div className="i-pop flex flex-col p-1">
							{menuItems.map((m, i) => (
								<div key={m.label}>
									{m.danger ? <div className="-mx-1 my-1 h-px bg-(--i-line)" /> : null}
									<div className={cn("flex items-center justify-between rounded-md px-2", ROW, i === 1 && "bg-(--i-fill)")}>
										<span className={cn("i-body", m.danger ? "text-(--i-thread-ink)" : "text-(--i-text)")}>
											{m.label}
										</span>
										<span className="i-micro text-(--i-faint)">{m.key}</span>
									</div>
								</div>
							))}
						</div>
					</Spec>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-3">
				<Island className="col-span-2 flex flex-col p-3">
					<Spec label="settings row">
						<div className="flex items-start gap-6 px-1">
							<div className="flex flex-1 flex-col">
								<span className="i-body text-(--i-text)">{settingsRow.title}</span>
								<span className="i-label text-(--i-muted)">{settingsRow.detail}</span>
							</div>
							<div className="pt-0.5">
								<Toggle on />
							</div>
						</div>
					</Spec>
				</Island>
				<div className="flex flex-col gap-3">
					<Spec label="toast · tooltip">
						<div className="i-pop flex h-9 items-center gap-3 pr-1 pl-3">
							<span className="i-body flex-1 text-(--i-text)">{toast.text}</span>
							<Button kind="ghost" className="px-2 text-(--i-text)">
								{toast.action}
							</Button>
						</div>
						<div className="i-pop mt-1.5 flex h-7 w-fit items-center gap-2 pr-1 pl-2">
							<span className="i-label text-(--i-text)">Select</span>
							<Kbd>V</Kbd>
						</div>
					</Spec>
				</div>
			</div>

			<Island className="flex h-9 items-center gap-4 px-3">
				{[
					["space", "4"],
					["inset", "8"],
					["gap", "8"],
					["radius", "12 · 8 · 4"],
					["row", "28"],
					["chip", "20"],
					["shadow", "one, on what floats"],
				].map(([k, v]) => (
					<span key={k} className="i-micro whitespace-nowrap">
						<span className="text-(--i-faint)">{k}</span> <span className="text-(--i-muted)">{v}</span>
					</span>
				))}
			</Island>

			{/* type and colour */}
			<div className="grid grid-cols-[1fr_244px] gap-3">
				<Island className="p-3">
					<Spec label="type · 6 roles · words sans, names mono">
						<div className="flex flex-col">
							{typeRoles.map((r) => (
								<div key={r.name} className="flex h-8 items-center gap-3 px-1">
									<span className={cn(r.cls, "w-36 shrink-0 truncate text-(--i-text)")}>{r.sample}</span>
									<span className="i-micro w-14 shrink-0 text-(--i-muted)">{r.name}</span>
									<span className="i-micro text-(--i-faint)">{r.spec}</span>
								</div>
							))}
						</div>
					</Spec>
				</Island>
				<Island className="p-3">
					<Spec label="colour">
						<div className="flex flex-col">
							{palette[appearance].map((s) => (
								<div key={s.name} className="flex h-7 items-center gap-2 px-1">
									<span className={cn("size-4 shrink-0 rounded-[4px] shadow-[0_0_0_1px_var(--i-line)]", swatchBg[s.name])} />
									<span className="i-micro w-14 text-(--i-muted)">{s.name}</span>
									<span className="i-micro text-(--i-faint)">{s.hex}</span>
								</div>
							))}
						</div>
					</Spec>
				</Island>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="grid h-full w-full grid-cols-2">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}
