import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	canvasFrames,
	commandHint,
	flows,
	frameSize,
	menuItems,
	pages,
	project,
	selection,
	tabs,
	teammate,
	toast,
	zoom,
	type Appearance,
} from "shared/lib/explore/identity/world";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";
import {
	ChevronIcon,
	CheckIcon,
	CloseIcon,
	DotsIcon,
	FolderIcon,
	FrameIcon,
	HandIcon,
	PlayIcon,
	PlusIcon,
	SearchIcon,
	SelectIcon,
} from "shared/ui/spool/icons";
import "./islands.css";

/* ── the rules ─────────────────────────────────────────────────────────────
 * inset 8 from the window, gap 8 between islands, 6 inside an island.
 * radius 14 for an island, 8 for anything inside it (14 − 6), full for people and chips.
 * every row and control is 28 tall. One shadow: --k-float, islands only.
 * thread red is for: the selection, the primary action, flows, unseen. Nothing else. */

const ROW = "h-7";

/* ── icons this direction draws itself ───────────────────────────────────── */

function HomeIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path
				d="M2.75 7.1 8 2.75l5.25 4.35v5.65a.5.5 0 0 1-.5.5h-3v-3.5h-3.5v3.5h-3a.5.5 0 0 1-.5-.5z"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function MarqueeIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect
				x="2.5"
				y="2.5"
				width="11"
				height="11"
				rx="2"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeDasharray="2.4 2.2"
			/>
		</svg>
	);
}

function SidebarIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2.25" stroke="currentColor" strokeWidth="1.3" />
			<path d="M6.25 3v10" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

function DownIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="m3 4.75 3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** a flow's certainty as a stroke: solid will, dashed might. */
function Stroke({ might, className }: { might?: boolean; className?: string }) {
	return (
		<svg viewBox="0 0 14 4" className={cn("h-1 w-3.5", className)} aria-hidden="true">
			<path
				d="M1 2h12"
				stroke="var(--k-thread)"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeDasharray={might ? "2 2.5" : undefined}
			/>
		</svg>
	);
}

/* ── primitives ──────────────────────────────────────────────────────────── */

function Island({ className, children, style }: { className?: string; children: ReactNode; style?: React.CSSProperties }) {
	return (
		<div className={cn("k-island p-1.5", className)} style={style}>
			{children}
		</div>
	);
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind = "secondary", children, className }: { kind?: ButtonKind; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"k-control inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 font-medium",
				ROW,
				kind === "primary" && "bg-(--k-thread) text-(--k-on-thread)",
				kind === "secondary" && "bg-(--k-fill) text-(--k-text)",
				kind === "ghost" && "text-(--k-muted)",
				kind === "danger" && "bg-(--k-thread-soft) text-(--k-thread-ink)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function IconButton({ children, active, className }: { children: ReactNode; active?: boolean; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
				active ? "bg-(--k-fill) text-(--k-text)" : "text-(--k-muted)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="k-micro inline-flex h-5 items-center rounded-md bg-(--k-fill) px-1.5 text-(--k-muted)">{children}</span>
	);
}

function Count({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("k-micro tabular-nums text-(--k-faint)", className)}>{children}</span>;
}

type ChipKind = "count" | "live" | "unseen" | "will" | "might";

function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
	return (
		<span
			className={cn(
				"k-micro inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2",
				kind === "count" && "min-w-5 justify-center bg-(--k-fill) px-1.5 text-(--k-muted)",
				kind === "live" && "bg-(--k-fill) text-(--k-text)",
				kind === "unseen" && "bg-(--k-thread-soft) text-(--k-thread-ink)",
				(kind === "will" || kind === "might") && "bg-(--k-fill) text-(--k-muted)",
			)}
		>
			{kind === "live" ? <span className="size-1.5 rounded-full bg-(--k-thread)" /> : null}
			{kind === "unseen" ? <span className="size-1.5 rounded-full bg-(--k-thread)" /> : null}
			{kind === "will" ? <Stroke /> : null}
			{kind === "might" ? <Stroke might /> : null}
			{children}
		</span>
	);
}

function Avatar({ size = 24, ring }: { size?: 16 | 20 | 24; ring?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
				ring && "ring-2 ring-(--k-solid)",
			)}
			style={{
				width: size,
				height: size,
				background: teammate.color,
				fontSize: size === 24 ? 10 : size === 20 ? 9 : 7,
				letterSpacing: "0.02em",
			}}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function UnseenDot() {
	return <span className="size-1.5 shrink-0 rounded-full bg-(--k-thread)" />;
}

function Divider({ className }: { className?: string }) {
	return <div className={cn("mx-2 h-px bg-(--k-line)", className)} />;
}

function SearchField({ wide }: { wide?: boolean }) {
	return (
		<div className={cn("flex items-center gap-2 rounded-lg bg-(--k-well) pr-1 pl-2", ROW, wide && "w-full")}>
			<SearchIcon className="size-3.5 text-(--k-faint)" />
			<span className="k-control flex-1 text-(--k-faint)">Find frames</span>
			<Kbd>{commandHint}</Kbd>
		</div>
	);
}

function Field({ letter, value, focus }: { letter?: string; value: string; focus?: boolean }) {
	return (
		<div
			className={cn(
				"flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-(--k-well) px-2",
				ROW,
				focus && "shadow-[inset_0_0_0_1px_var(--k-thread)]",
			)}
		>
			{letter ? <span className="k-micro w-2 text-(--k-faint)">{letter}</span> : null}
			<span className="k-value tabular-nums text-(--k-text)">{value}</span>
			{focus ? <span className="-ml-1.5 h-3.5 w-px bg-(--k-thread)" /> : null}
		</div>
	);
}

function Segmented({ options, active }: { options: string[]; active: number }) {
	return (
		<div className={cn("flex items-center gap-0.5 rounded-lg bg-(--k-well) p-0.5", ROW)}>
			{options.map((o, i) => (
				<span
					key={o}
					className={cn(
						"k-label flex h-6 flex-1 items-center justify-center rounded-md px-2.5",
						i === active ? "bg-(--k-fill) text-(--k-text)" : "text-(--k-muted)",
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
				"relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full p-0.5",
				on ? "bg-(--k-thread)" : "bg-(--k-fill)",
			)}
		>
			<span className={cn("size-3.5 rounded-full bg-(--k-knob)", on && "translate-x-3.5")} />
		</span>
	);
}

function Tab({ name, active, home }: { name?: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"k-control inline-flex shrink-0 items-center gap-2 rounded-lg",
				ROW,
				home ? "w-7 justify-center" : "px-2.5",
				active ? "bg-(--k-fill) text-(--k-text)" : "text-(--k-muted)",
			)}
		>
			{home ? <HomeIcon className="size-4" /> : name}
			{active ? <CloseIcon className="-mr-0.5 size-3 text-(--k-faint)" /> : null}
		</span>
	);
}

/* ── the sidebar row: the one list row, in every state ───────────────────── */

type RowState = "rest" | "hover" | "selected" | "unseen";

function PageRow({ name, count, open, presence, state = "rest" }: { name: string; count: number; open?: boolean; presence?: boolean; state?: RowState }) {
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-lg pr-2 pl-1.5",
				ROW,
				state === "hover" && "bg-(--k-hover)",
			)}
		>
			<ChevronIcon open={open} className="size-3 text-(--k-faint)" />
			<FolderIcon className={cn("size-3.5", open ? "text-(--k-text)" : "text-(--k-muted)")} />
			<span className="k-value flex-1 truncate text-(--k-text)">{name}</span>
			{presence ? <Avatar size={16} /> : null}
			<Count className="w-4 text-right">{count}</Count>
		</div>
	);
}

/** A frame under its page. The gutter holds the thread: one node per frame,
 * joined by the flows between them, solid where it will, dashed where it might. */
function FrameRow({
	name,
	state = "rest",
	above,
	below,
}: {
	name: string;
	state?: RowState;
	above?: "will" | "might";
	below?: "will" | "might";
}) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"relative flex items-center gap-2 rounded-lg pr-1 pl-11",
				ROW,
				selected && "bg-(--k-thread-soft)",
				state === "hover" && "bg-(--k-hover)",
			)}
		>
			<svg className="absolute top-0 left-[25px] h-7 w-3 overflow-visible" viewBox="0 0 12 28" aria-hidden="true">
				{above ? (
					<path
						d="M6 0V10"
						stroke="var(--k-thread)"
						strokeWidth="1.5"
						strokeDasharray={above === "might" ? "2 2.5" : undefined}
					/>
				) : null}
				{below ? (
					<path
						d="M6 18V28"
						stroke="var(--k-thread)"
						strokeWidth="1.5"
						strokeDasharray={below === "might" ? "2 2.5" : undefined}
					/>
				) : null}
				<circle
					cx="6"
					cy="14"
					r="3.25"
					fill={selected ? "var(--k-thread)" : "var(--k-solid)"}
					stroke={selected ? "var(--k-thread)" : "var(--k-faint)"}
					strokeWidth="1.25"
				/>
			</svg>
			<span
				className={cn(
					"k-value flex-1 truncate",
					selected ? "text-(--k-text)" : state === "unseen" ? "text-(--k-text)" : "text-(--k-muted)",
				)}
			>
				{name}
			</span>
			{selected ? (
				<span className="inline-flex size-5 items-center justify-center rounded-md text-(--k-thread-ink)">
					<PlayIcon className="size-2.5" />
				</span>
			) : null}
			{state === "unseen" ? (
				<span className="inline-flex size-5 items-center justify-center">
					<UnseenDot />
				</span>
			) : null}
		</div>
	);
}

function SectionHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
	return (
		<div className={cn("flex items-center justify-between pr-0.5 pl-2", ROW)}>
			<span className="k-label text-(--k-muted)">{children}</span>
			{right}
		</div>
	);
}

/* ── islands of the canvas screen ────────────────────────────────────────── */

function TopIsland() {
	return (
		<Island className="flex items-center gap-1">
			<span className="flex size-7 items-center justify-center">
				<SpoolMark className="h-4.5 w-3.5 text-(--k-thread)" />
			</span>
			<span className="mx-1 h-4 w-px bg-(--k-line)" />
			<Tab home />
			{tabs.map((t) => (
				<Tab key={t.name} name={t.name} active={t.active} />
			))}
			<IconButton>
				<PlusIcon className="size-3.5" />
			</IconButton>
		</Island>
	);
}

function ActionIsland() {
	return (
		<Island className="flex items-center gap-1">
			<span className="flex h-7 items-center px-1">
				<Avatar size={24} />
			</span>
			<span className="mx-1 h-4 w-px bg-(--k-line)" />
			<span className={cn("k-value inline-flex items-center gap-1 rounded-lg pr-1.5 pl-2 tabular-nums text-(--k-muted)", ROW)}>
				{zoom}
				<DownIcon className="size-3 text-(--k-faint)" />
			</span>
			<span className="flex-1" />
			<Button kind="secondary">Share</Button>
			<Button kind="primary" className="pl-2.5">
				<PlayIcon className="size-2.5" />
				Play
			</Button>
		</Island>
	);
}

function Sidebar() {
	const app = pages[0];
	const rest = pages.slice(1);
	return (
		<Island className="flex max-h-full flex-col">
			<div className={cn("flex items-center gap-2 pr-0 pl-2", ROW)}>
				<span className="k-title">{project.name}</span>
				<span className="k-label text-(--k-faint)">{project.team}</span>
				<span className="flex-1" />
				<IconButton>
					<SidebarIcon className="size-4" />
				</IconButton>
			</div>
			<div className="mt-1.5">
				<SearchField wide />
			</div>
			<Divider className="my-1.5" />
			<SectionHead
				right={
					<IconButton className="size-6">
						<PlusIcon className="size-3" />
					</IconButton>
				}
			>
				Pages
			</SectionHead>
			<PageRow name={app.name} count={app.count} open />
			{app.frames.map((f, i) => (
				<FrameRow
					key={f.name}
					name={f.name}
					state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"}
					above={i > 0 ? flows[i - 1]?.certainty : undefined}
					below={flows[i]?.certainty}
				/>
			))}
			{rest.map((p) => (
				<PageRow key={p.name} name={p.name} count={p.count} presence={p.presence} />
			))}
			<Divider className="my-1.5" />
			<SectionHead right={<Count className="pr-2">{flows.length}</Count>}>Flows</SectionHead>
			{flows.map((f) => (
				<div key={f.from} className={cn("flex items-center gap-2 rounded-lg pr-1 pl-2", ROW)}>
					<span className="k-value flex-1 truncate text-(--k-muted)">
						{f.from} <span className="text-(--k-faint)">→</span> {f.to}
					</span>
					<Chip kind={f.certainty}>{f.certainty}</Chip>
				</div>
			))}
			<Divider className="my-1.5" />
			<div className={cn("flex items-center gap-2 pr-2 pl-2", ROW)}>
				<CheckIcon className="size-3.5 text-(--k-muted)" />
				<span className="k-micro text-(--k-muted)">{project.synced}</span>
				<span className="flex-1" />
				<span className="k-micro text-(--k-faint)">{project.frames} frames</span>
			</div>
		</Island>
	);
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className={cn("flex items-center gap-1.5 pl-2", ROW)}>
			<span className="k-label w-16 shrink-0 text-(--k-muted)">{label}</span>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
		</div>
	);
}

function FlowValue({ name, certainty }: { name: string; certainty: "will" | "might" }) {
	return (
		<div className="flex flex-1 items-center justify-between pr-1">
			<span className="k-value text-(--k-text)">{name}</span>
			<Chip kind={certainty}>{certainty}</Chip>
		</div>
	);
}

function ScenarioSelect() {
	return (
		<div className={cn("flex flex-1 items-center justify-between rounded-lg bg-(--k-well) pr-1.5 pl-2", ROW)}>
			<span className="k-value text-(--k-text)">{selection.scenario}</span>
			<DownIcon className="size-3 text-(--k-faint)" />
		</div>
	);
}

function PropertiesBody() {
	return (
		<div className="flex flex-col gap-1">
			<PropRow label="Position">
				<Field letter="x" value={String(selection.x)} />
				<Field letter="y" value={String(selection.y)} />
			</PropRow>
			<PropRow label="Size">
				<Field letter="w" value={String(selection.w)} />
				<Field letter="h" value={String(selection.h)} />
			</PropRow>
		</div>
	);
}

function Properties() {
	const into = flows.find((f) => f.to === selection.name);
	const out = flows.find((f) => f.from === selection.name);
	return (
		<Island className="flex flex-col">
			<div className={cn("flex items-center gap-2 pl-2", ROW)}>
				<FrameIcon className="size-3.5 text-(--k-thread)" />
				<span className="k-title flex-1">{selection.name}</span>
				<IconButton>
					<DotsIcon className="size-4" />
				</IconButton>
			</div>
			<div className="k-micro truncate px-2 pb-1.5 text-(--k-muted)">{selection.path}</div>
			<Divider className="mb-1.5" />
			<PropertiesBody />
			<Divider className="my-1.5" />
			<PropRow label="Flows in">{into ? <FlowValue name={into.from} certainty={into.certainty} /> : null}</PropRow>
			<PropRow label="Flows out">{out ? <FlowValue name={out.to} certainty={out.certainty} /> : null}</PropRow>
			<Divider className="my-1.5" />
			<PropRow label="Scenario">
				<ScenarioSelect />
			</PropRow>
		</Island>
	);
}

function Toolbar() {
	return (
		<Island className="flex items-center gap-1">
			<IconButton active>
				<SelectIcon className="size-4" />
			</IconButton>
			<IconButton>
				<MarqueeIcon className="size-4" />
			</IconButton>
			<IconButton>
				<HandIcon className="size-4" />
			</IconButton>
		</Island>
	);
}

/* ── the canvas ─────────────────────────────────────────────────────────── */

const FRAME_TOP = 196;
const FRAME_X = [280, 600, 920];
const FW = 240;
const FH = 520;

function FrameLabel({ name, x, selected, unseen }: { name: string; x: number; selected?: boolean; unseen?: boolean }) {
	return (
		<div className="absolute flex h-5 items-center gap-1.5" style={{ left: x, top: FRAME_TOP - 28, width: FW }}>
			{unseen ? <UnseenDot /> : null}
			<span className={cn("k-value", selected ? "text-(--k-thread-ink)" : "text-(--k-muted)")}>{name}</span>
			<span className="flex-1" />
			{unseen ? <span className="k-micro text-(--k-thread-ink)">unseen</span> : null}
			{selected ? (
				<span className="k-micro inline-flex h-5 items-center gap-1 rounded-full bg-(--k-thread-soft) pr-2 pl-1.5 text-(--k-thread-ink)">
					<PlayIcon className="size-2.5" />
					play
				</span>
			) : null}
		</div>
	);
}

function Selection({ x }: { x: number }) {
	const handles = [
		[x, FRAME_TOP],
		[x + FW, FRAME_TOP],
		[x, FRAME_TOP + FH],
		[x + FW, FRAME_TOP + FH],
	];
	return (
		<>
			<div
				className="pointer-events-none absolute rounded-[9px] shadow-[0_0_0_1.5px_var(--k-thread)]"
				style={{ left: x - 1, top: FRAME_TOP - 1, width: FW + 2, height: FH + 2 }}
			/>
			{handles.map(([hx, hy]) => (
				<span
					key={`${hx}-${hy}`}
					className="absolute size-2 rounded-full border-[1.5px] border-(--k-thread) bg-white"
					style={{ left: hx - 4, top: hy - 4 }}
				/>
			))}
			<div className="absolute flex justify-center" style={{ left: x, top: FRAME_TOP + FH + 10, width: FW }}>
				<span className="k-micro inline-flex h-5 items-center rounded-full bg-(--k-thread) px-2 tabular-nums text-(--k-on-thread)">
					{frameSize.w} × {frameSize.h}
				</span>
			</div>
		</>
	);
}

function FlowArrows() {
	const y0 = FRAME_TOP + 236;
	const y1 = FRAME_TOP + 276;
	const a = { x0: FRAME_X[0] + FW, x1: FRAME_X[1] - 6 };
	const b = { x0: FRAME_X[1] + FW + 3, x1: FRAME_X[2] - 6 };
	const curve = (x0: number, x1: number) =>
		`M${x0} ${y0} C${x0 + 40} ${y0}, ${x1 - 44} ${y1}, ${x1} ${y1}`;
	const head = (x1: number) => `M${x1 - 1} ${y1 - 4.5} L${x1 + 5} ${y1} L${x1 - 1} ${y1 + 4.5} Z`;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
			<path d={curve(a.x0, a.x1)} fill="none" stroke="var(--k-thread)" strokeWidth="1.5" />
			<path d={head(a.x1)} fill="var(--k-thread)" />
			<circle cx={a.x0} cy={y0} r="3" fill="var(--k-thread)" />
			<path d={curve(b.x0, b.x1)} fill="none" stroke="var(--k-thread)" strokeWidth="1.5" strokeDasharray="4 4" />
			<path d={head(b.x1)} fill="var(--k-thread)" />
			<circle cx={b.x0} cy={y0} r="3" fill="var(--k-canvas)" stroke="var(--k-thread)" strokeWidth="1.5" />
		</svg>
	);
}

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-islands relative h-full w-full overflow-hidden" data-appearance={appearance}>
			<div className="k-canvas absolute inset-0">
				{canvasFrames.map((f, i) => (
					<div
						key={f.name}
						className="absolute"
						style={{ left: FRAME_X[i], top: FRAME_TOP, width: FW, height: FH }}
					>
						<CoffeeScreen screen={f.screen} />
					</div>
				))}
				{canvasFrames.map((f, i) => (
					<FrameLabel
						key={f.name}
						name={f.name}
						x={FRAME_X[i] ?? 0}
						selected={"selected" in f && f.selected}
						unseen={"unseen" in f && f.unseen}
					/>
				))}
				<FlowArrows />
				<Selection x={FRAME_X[1] ?? 0} />
			</div>

			<div className="absolute top-2 left-2">
				<TopIsland />
			</div>
			<div className="absolute top-14 bottom-2 left-2 flex w-62 flex-col">
				<Sidebar />
			</div>
			<div className="absolute top-2 right-2 w-62">
				<ActionIsland />
			</div>
			<div className="absolute top-14 right-2 w-62">
				<Properties />
			</div>
			<div className="absolute bottom-2 left-1/2 -translate-x-1/2">
				<Toolbar />
			</div>
		</div>
	);
}

/* ── parts ───────────────────────────────────────────────────────────────── */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<Island className={cn("flex flex-col gap-1.5", className)}>
			<span className="k-micro px-1.5 pt-0.5 text-(--k-faint)">{label}</span>
			{children}
		</Island>
	);
}

function StateRow({ state, children }: { state: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-1">
			<span className="k-micro w-17 shrink-0 pl-1.5 text-(--k-faint)">{state}</span>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}

const TYPE: { role: string; spec: string; cls: string; sample: string }[] = [
	{ role: "display", spec: "22/28", cls: "k-display", sample: "kaffe" },
	{ role: "title", spec: "13/20", cls: "k-title", sample: "Pages" },
	{ role: "control", spec: "13/20", cls: "k-control", sample: "Rename" },
	{ role: "label", spec: "12/16", cls: "k-label", sample: "Position" },
	{ role: "value", spec: "12/16", cls: "k-value", sample: "app/cart" },
	{ role: "micro", spec: "11/14", cls: "k-micro", sample: "390 × 844" },
];

const SWATCHES: Record<Appearance, { name: string; hex: string; bg: string }[]> = {
	dark: [
		{ name: "canvas", hex: "#141312", bg: "var(--k-canvas)" },
		{ name: "island", hex: "#1f1e1c · 86", bg: "var(--k-solid)" },
		{ name: "fill", hex: "#ffffff · 9", bg: "var(--k-fill)" },
		{ name: "line", hex: "#ffffff · 7.5", bg: "var(--k-line)" },
		{ name: "text", hex: "#f2f0ec", bg: "var(--k-text)" },
		{ name: "muted", hex: "#a29e97", bg: "var(--k-muted)" },
		{ name: "faint", hex: "#7a766f", bg: "var(--k-faint)" },
		{ name: "thread", hex: "#f5391a", bg: "var(--k-thread)" },
		{ name: "thread-ink", hex: "#ff6b4f", bg: "var(--k-thread-ink)" },
		{ name: "teammate", hex: "#3b82f6", bg: "var(--k-teammate)" },
	],
	light: [
		{ name: "canvas", hex: "#e9e7e2", bg: "var(--k-canvas)" },
		{ name: "island", hex: "#fdfcfa · 88", bg: "var(--k-solid)" },
		{ name: "fill", hex: "#3c2d1e · 8", bg: "var(--k-fill)" },
		{ name: "line", hex: "#3c2d1e · 9", bg: "var(--k-line)" },
		{ name: "text", hex: "#1d1b18", bg: "var(--k-text)" },
		{ name: "muted", hex: "#6a665f", bg: "var(--k-muted)" },
		{ name: "faint", hex: "#8a857d", bg: "var(--k-faint)" },
		{ name: "thread", hex: "#f5391a", bg: "var(--k-thread)" },
		{ name: "thread-ink", hex: "#c92d0e", bg: "var(--k-thread-ink)" },
		{ name: "teammate", hex: "#3b82f6", bg: "var(--k-teammate)" },
	],
};

/** the shape rule, drawn: canvas, an island 8 in, a row 6 in. */
function ShapeRule() {
	return (
		<div className="flex flex-col gap-2 px-1.5 pb-1">
			<div className="k-canvas relative h-[84px] rounded-lg shadow-[inset_0_0_0_1px_var(--k-line)]">
				<div className="k-island absolute inset-2 flex flex-col gap-1 p-1.5">
					<div className={cn("flex items-center rounded-lg bg-(--k-thread-soft) px-2", ROW)}>
						<span className="k-micro text-(--k-thread-ink)">row · h28 r8</span>
					</div>
					<div className="k-micro px-2 text-(--k-faint)">island · r14 p6</div>
				</div>
			</div>
			<div className="k-micro flex flex-col gap-0.5 text-(--k-muted)">
				<span>inset 8, gap 8, pad 6</span>
				<span>r14 island, r8 inside</span>
				<span>r-full for chips and people</span>
				<span>one shadow: --k-float</span>
				<span>islands hug what they hold</span>
			</div>
		</div>
	);
}

function SelectionSpecimen() {
	return (
		<div className="relative h-12 w-20">
			<div className="absolute inset-0 rounded-[9px] shadow-[0_0_0_1.5px_var(--k-thread)]" />
			{[
				[0, 0],
				[80, 0],
				[0, 48],
				[80, 48],
			].map(([hx, hy]) => (
				<span
					key={`${hx}-${hy}`}
					className="absolute size-2 rounded-full border-[1.5px] border-(--k-thread) bg-white"
					style={{ left: (hx ?? 0) - 4, top: (hy ?? 0) - 4 }}
				/>
			))}
		</div>
	);
}

function PartsBoard({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-islands relative h-full w-1/2 overflow-hidden" data-appearance={appearance}>
			<div className="k-canvas flex h-full flex-col gap-3 p-4">
				<div className="flex items-center justify-between px-1">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-4 text-(--k-thread)" />
						<span className="k-display">islands</span>
					</div>
					<span className="k-micro text-(--k-faint)">{appearance}</span>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-[204px_1fr_1fr] items-start gap-3">
					{/* column one: controls */}
					<div className="flex flex-col gap-3">
						<Spec label="button">
							<div className="flex flex-wrap gap-1.5">
								<Button kind="primary" className="pl-2.5">
									<PlayIcon className="size-2.5" />
									Play
								</Button>
								<Button kind="secondary">Share</Button>
								<Button kind="ghost">Cancel</Button>
								<IconButton active>
									<DotsIcon className="size-4" />
								</IconButton>
								<Button kind="danger">Move to Trash</Button>
							</div>
						</Spec>
						<Spec label="input · search">
							<div className="flex">
								<Field value="cart" focus />
							</div>
							<SearchField wide />
						</Spec>
						<Spec label="segmented · toggle · tab">
							<Segmented options={["Dark", "Light", "System"]} active={appearance === "dark" ? 0 : 1} />
							<div className={cn("flex items-center gap-2 px-1.5", ROW)}>
								<Toggle on />
								<Toggle />
								<span className="k-label ml-1 text-(--k-muted)">Snap to grid</span>
							</div>
							<div className="flex items-center gap-1">
								<Tab home />
								<Tab name="kaffe" active />
								<Tab name="tvärsö" />
							</div>
						</Spec>
						<Spec label="chip">
							<div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-0.5">
								<Chip kind="count">3</Chip>
								<Chip kind="live">live</Chip>
								<Chip kind="unseen">unseen</Chip>
								<Chip kind="will">will</Chip>
								<Chip kind="might">might</Chip>
							</div>
						</Spec>
						<Spec label="avatar · tooltip">
							<div className="flex items-center gap-2 px-1.5 pb-0.5">
								<Avatar size={24} />
								<Avatar size={20} />
								<Avatar size={16} />
								<span className="flex-1" />
								<span className="k-float k-label inline-flex h-7 items-center gap-2 pr-1 pl-2.5">
									Hand
									<Kbd>H</Kbd>
								</span>
							</div>
						</Spec>
						<Spec label="toolbar · selection">
							<div className="flex items-center justify-between px-1.5 pt-1">
								<Toolbar />
								<SelectionSpecimen />
							</div>
						</Spec>
					</div>

					{/* column two: rows */}
					<div className="flex flex-col gap-3">
						<Spec label="sidebar row">
							<StateRow state="rest">
								<FrameRow name="menu" below="will" />
							</StateRow>
							<StateRow state="hover">
								<FrameRow name="menu" state="hover" above="will" below="will" />
							</StateRow>
							<StateRow state="selected">
								<FrameRow name="cart" state="selected" above="will" below="might" />
							</StateRow>
							<StateRow state="unseen">
								<FrameRow name="receipt" state="unseen" above="might" />
							</StateRow>
							<StateRow state="page">
								<PageRow name="app" count={3} open />
							</StateRow>
							<StateRow state="presence">
								<PageRow name="site" count={2} presence />
							</StateRow>
						</Spec>
						<Spec label="property row">
							<PropertiesBody />
							<PropRow label="Flows out">
								<FlowValue name="receipt" certainty="might" />
							</PropRow>
							<PropRow label="Scenario">
								<ScenarioSelect />
							</PropRow>
						</Spec>
						<Spec label="shape">
							<ShapeRule />
						</Spec>
						<Spec label="sidebar · frames only">
							<div className={cn("flex items-center gap-2 pr-0 pl-2", ROW)}>
								<span className="k-value text-(--k-muted)">{project.name}</span>
								<span className="k-value text-(--k-faint)">/</span>
								<span className="k-value flex-1 text-(--k-text)">{pages[0].name}</span>
								<IconButton>
									<SidebarIcon className="size-4" />
								</IconButton>
							</div>
							<div>
								{pages[0].frames.map((f, i) => (
									<FrameRow
										key={f.name}
										name={f.name}
										state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"}
										above={i > 0 ? flows[i - 1]?.certainty : undefined}
										below={flows[i]?.certainty}
									/>
								))}
							</div>
						</Spec>
					</div>

					{/* column three: floats, type, colour */}
					<div className="flex flex-col gap-3">
						<Spec label="context menu">
							<div className="flex flex-col">
								{menuItems.map((m, i) => (
									<div key={m.label}>
										{m.danger ? <Divider className="my-1" /> : null}
										<div
											className={cn(
												"k-control flex items-center justify-between rounded-lg px-2",
												ROW,
												i === 0 && "bg-(--k-fill)",
												m.danger ? "text-(--k-thread-ink)" : "text-(--k-text)",
											)}
										>
											<span>{m.label}</span>
											<span className="k-micro text-(--k-faint)">{m.key}</span>
										</div>
									</div>
								))}
							</div>
						</Spec>
						<Island className="flex items-center gap-2 pl-3">
							<span className="k-control flex-1">
								<span className="k-value">{toast.text.split(" ")[0]}</span>{" "}
								{toast.text.split(" ").slice(1).join(" ")}
							</span>
							<Button kind="secondary">{toast.action}</Button>
						</Island>
						<Spec label="type · sans · mono">
							<div className="flex flex-col gap-1 px-1.5 pb-0.5">
								{TYPE.map((t) => (
									<div key={t.role} className="flex items-baseline justify-between gap-2">
										<span className={cn(t.cls, "truncate")}>{t.sample}</span>
										<span className="k-micro shrink-0 text-(--k-faint)">
											{t.role} {t.spec}
										</span>
									</div>
								))}
							</div>
						</Spec>
						<Spec label="colour">
							<div className="flex flex-col gap-1 px-1.5">
								{SWATCHES[appearance].map((s) => (
									<div key={s.name} className="flex h-5 items-center gap-2">
										<span
											className="size-4 shrink-0 rounded-[5px] shadow-[inset_0_0_0_1px_var(--k-line)]"
											style={{ background: s.bg }}
										/>
										<span className="k-micro flex-1 text-(--k-text)">{s.name}</span>
										<span className="k-micro text-(--k-faint)">{s.hex}</span>
									</div>
								))}
							</div>
						</Spec>
					</div>
				</div>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-full w-full">
			<PartsBoard appearance="dark" />
			<PartsBoard appearance="light" />
		</div>
	);
}
