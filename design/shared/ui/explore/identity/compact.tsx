import type { ReactNode } from "react";
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
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { projects } from "shared/ui/demo/home-data";
import { SpoolMark } from "shared/ui/spool/mark";
import "./compact.css";

/*
 * compact: a dense pro tool for somebody with 300 frames, built from four numbers.
 *   grid    4px. Panels keep an 8px gutter, boxes an 8px inner pad, so every
 *           label in a panel starts on the same 16px line.
 *   height  24px for every row and every control, 20px for chips, 16px for the
 *           tags drawn on the canvas, 32px for a panel header and the toolbar.
 *   radius  4px on anything you click, 6px on anything that floats.
 *   type    12px base. Inter for what a person reads, Fragment Mono for what lives
 *           in the project (pages, frames, paths, values, counts, keys).
 * Red is the thread and nothing else: the selection, the current page, unseen,
 * focus, on, and the flows. Buttons never fill red; the primary is inverted.
 */

const RAIL = 264;
const PANEL = 248;
const AGENT_PANEL = 320;
const FRAME_X0 = 36;
const FRAME_GAP = 48;
const FRAME_TOP = 148;
const frameX = (i: number) => FRAME_X0 + i * (drawnSize.w + FRAME_GAP);

/* ---------- icons: one set, 14px, 1.2px stroke, round joins ---------- */

function Ic({
	children,
	vb = 14,
	className,
	fill,
}: {
	children: ReactNode;
	vb?: number;
	className?: string;
	fill?: boolean;
}) {
	return (
		<svg
			viewBox={`0 0 ${vb} ${vb}`}
			className={cn("size-3.5 shrink-0", className)}
			fill={fill ? "currentColor" : "none"}
			stroke={fill ? "none" : "currentColor"}
			strokeWidth={(1.2 * vb) / 14}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

type IcProps = { className?: string };
const IcHome = (p: IcProps) => (
	<Ic {...p}>
		<path d="M2.25 6.25 7 2.25l4.75 4v5.5h-3.25v-3.25h-3v3.25H2.25z" />
	</Ic>
);
const IcPlus = (p: IcProps) => (
	<Ic {...p}>
		<path d="M7 2.75v8.5M2.75 7h8.5" />
	</Ic>
);
const IcClose = (p: IcProps) => (
	<Ic {...p}>
		<path d="m3.75 3.75 6.5 6.5m0-6.5-6.5 6.5" />
	</Ic>
);
const IcChevron = ({ dir = "right", className }: IcProps & { dir?: "right" | "down" | "left" }) => (
	<Ic className={className}>
		<path
			d={
				dir === "right" ? "m5.5 3.5 3.5 3.5-3.5 3.5" : dir === "left" ? "M8.5 3.5 5 7l3.5 3.5" : "m3.5 5.5 3.5 3.5 3.5-3.5"
			}
		/>
	</Ic>
);
const IcFolder = (p: IcProps) => (
	<Ic {...p}>
		<path d="M1.75 3.25h3.5l1.25 1.5h5.75v6H1.75z" />
	</Ic>
);
const IcFile = (p: IcProps) => (
	<Ic {...p}>
		<path d="M3.25 1.75h4.5l3 3v7.5h-7.5z" />
		<path d="M7.75 1.75v3h3" />
	</Ic>
);
const IcDots = (p: IcProps) => (
	<Ic {...p} fill>
		<circle cx="3" cy="7" r="1" />
		<circle cx="7" cy="7" r="1" />
		<circle cx="11" cy="7" r="1" />
	</Ic>
);
const IcFlows = (p: IcProps) => (
	<Ic {...p}>
		<circle cx="3.75" cy="4" r="1.75" />
		<circle cx="10.25" cy="10" r="1.75" />
		<path d="m5.1 5.25 3.8 3.5" />
	</Ic>
);
const IcProperties = (p: IcProps) => (
	<Ic {...p}>
		<path d="M4.5 2v2.25M4.5 7.75V12M9.5 2v5.25M9.5 10.75V12" />
		<circle cx="4.5" cy="6" r="1.5" />
		<circle cx="9.5" cy="9" r="1.5" />
	</Ic>
);
const IcAgent = (p: IcProps) => (
	<Ic {...p}>
		<path d="M5.25 4h6.25M5.25 7h6.25M5.25 10h4" />
		<path d="M2.5 4h.01M2.5 7h.01M2.5 10h.01" strokeWidth={1.8} />
	</Ic>
);
const IcHelp = (p: IcProps) => (
	<Ic {...p}>
		<path d="M5.1 5.1a1.95 1.95 0 1 1 2.9 1.7c-.6.33-1 .75-1 1.4v.3" />
		<path d="M7 10.9h.01" strokeWidth={1.8} />
	</Ic>
);
const IcCog = (p: IcProps) => (
	<Ic {...p} vb={16}>
		<path d="M13.23 6.66 14.93 7.01v1.98l-1.7.35-.58 1.41.95 1.45-1.4 1.4-1.45-.95-1.41.58-.35 1.7H7.01l-.35-1.7-1.41-.58-1.45.95-1.4-1.4.95-1.45-.58-1.41-1.7-.35V7.01l1.7-.35.58-1.41-.95-1.45 1.4-1.4 1.45.95 1.41-.58.35-1.7h1.98l.35 1.7 1.41.58 1.45-.95 1.4 1.4-.95 1.45.58 1.41Z" />
		<circle cx="8" cy="8" r="2.1" />
	</Ic>
);
const IcSelect = (p: IcProps) => (
	<Ic {...p} vb={14} fill>
		<path d="M3 2.4a.4.4 0 0 1 .55-.37l8.1 3.3a.4.4 0 0 1-.04.75l-3.2.86a1.2 1.2 0 0 0-.85.85l-.86 3.2a.4.4 0 0 1-.75.04L2.63 2.95A.4.4 0 0 1 3 2.4z" />
	</Ic>
);
const IcEdit = (p: IcProps) => (
	<Ic {...p}>
		<path d="M2 4V3a1 1 0 0 1 1-1h1M7 2h1M2 7v1M10 2h1a1 1 0 0 1 1 1v1M4 12H3a1 1 0 0 1-1-1v-1" />
		<path
			d="M6.4 6.65a.25.25 0 0 1 .33-.33l5.1 2a.25.25 0 0 1-.02.47l-1.95.6a.6.6 0 0 0-.4.4l-.6 1.95a.25.25 0 0 1-.47.02z"
			fill="currentColor"
			stroke="none"
		/>
	</Ic>
);
const IcHand = (p: IcProps) => (
	<Ic {...p} vb={24}>
		<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
		<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
	</Ic>
);
const IcSearch = (p: IcProps) => (
	<Ic {...p}>
		<circle cx="6.25" cy="6.25" r="3.75" />
		<path d="m9 9 3 3" />
	</Ic>
);
const IcPlay = (p: IcProps) => (
	<Ic {...p} fill>
		<path d="M4 2.75v8.5L11 7z" />
	</Ic>
);
const IcTrash = (p: IcProps) => (
	<Ic {...p}>
		<path d="M2.5 4h9M5.5 4V2.5h3V4M3.75 4l.6 7.75h5.3L10.25 4" />
	</Ic>
);

const toolIcon = { select: IcSelect, edit: IcEdit, hand: IcHand } as const;

/* ---------- primitives ---------- */

function Key({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("c-mono-sm text-(--c-text-3)", className)}>{children}</span>;
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
				"flex size-6 shrink-0 items-center justify-center rounded-[4px] text-(--c-text-2)",
				active && "bg-(--c-selected) text-(--c-text)",
				className,
			)}
		>
			{children}
		</span>
	);
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";
function Button({
	kind = "secondary",
	children,
	icon,
	className,
}: {
	kind?: ButtonKind;
	children: ReactNode;
	icon?: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"c-body inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 font-medium",
				kind === "primary" && "bg-(--c-invert) text-(--c-on-invert)",
				kind === "secondary" && "bg-(--c-field) text-(--c-text) shadow-[inset_0_0_0_1px_var(--c-line)]",
				kind === "ghost" && "text-(--c-text-2)",
				kind === "danger" && "text-(--c-thread-ink)",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function CountChip({ children }: { children: ReactNode }) {
	return (
		<span className="c-mono-sm flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-(--c-field) px-1 pt-px text-(--c-text-2)">
			{children}
		</span>
	);
}

function SelectionChip() {
	return (
		<span className="c-mono-sm inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[4px] bg-(--c-raised) pr-1 pl-1.5 text-(--c-text) shadow-[inset_0_0_0_1px_var(--c-line-2)]">
			<span className="h-3 w-0.5 rounded-full bg-(--c-thread)" />
			{element.chip}
			<IcClose className="size-3 text-(--c-text-3)" />
		</span>
	);
}

function SizeTag() {
	return (
		<span className="c-mono-sm flex h-4 items-center whitespace-nowrap rounded-[4px] bg-(--c-thread) px-1 text-(--c-on-thread)">
			{frameSize.w} × {frameSize.h}
		</span>
	);
}

function KindTag() {
	return (
		<span className="c-small flex h-4 items-center whitespace-nowrap rounded-[4px] bg-(--c-thread) px-1 font-medium text-(--c-on-thread)">
			{element.kind}
		</span>
	);
}

function Field({ prefix, value, unit, focus }: { prefix?: string; value: string; unit?: string; focus?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-6 min-w-0 items-center gap-2 rounded-[4px] bg-(--c-field) px-2",
				focus && "shadow-[inset_0_0_0_1px_var(--c-thread)]",
			)}
		>
			{prefix && <span className="c-mono-sm w-2 text-(--c-text-3)">{prefix}</span>}
			<span className="c-mono min-w-0 flex-1 truncate text-(--c-text)">{value}</span>
			{unit && <span className="c-mono-sm text-(--c-text-3)">{unit}</span>}
		</span>
	);
}

function SearchField({ className }: { className?: string }) {
	return (
		<span className={cn("flex h-6 items-center gap-2 rounded-[4px] bg-(--c-field) px-2", className)}>
			<IcSearch className="text-(--c-text-3)" />
			<span className="c-body flex-1 text-(--c-text-3)">{home.search}</span>
			<Key>{home.searchKey}</Key>
		</span>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full",
				on ? "bg-(--c-thread)" : "bg-(--c-line-2)",
			)}
		>
			<span className={cn("absolute top-0.5 size-3 rounded-full bg-[#fff]", on ? "left-3.5" : "left-0.5")} />
		</span>
	);
}

function Segmented({ items, active }: { items: string[]; active: number }) {
	return (
		<span className="inline-flex h-6 items-center gap-0.5 rounded-[4px] bg-(--c-field) p-0.5">
			{items.map((item, i) => (
				<span
					key={item}
					className={cn(
						"c-body flex h-5 items-center rounded-[3px] px-2",
						i === active
							? "bg-(--c-raised) text-(--c-text) shadow-[0_0_0_1px_var(--c-line-2)]"
							: "text-(--c-text-2)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

function WindowTab({
	label,
	icon,
	active,
	closable,
}: {
	label: string;
	icon?: ReactNode;
	active?: boolean;
	closable?: boolean;
}) {
	return (
		<span
			className={cn(
				"c-body flex h-6 shrink-0 items-center gap-2 rounded-[4px] px-2 text-(--c-text-2)",
				active && "bg-(--c-selected) text-(--c-text)",
			)}
		>
			{icon}
			<span className={cn(closable && "min-w-14")}>{label}</span>
			{closable && <IcClose className="size-3 text-(--c-text-3)" />}
		</span>
	);
}

function PanelTab({ label, active }: { label: string; active?: boolean }) {
	return (
		<span
			className={cn(
				"c-body relative flex h-8 items-center text-(--c-text-2)",
				active && "font-medium text-(--c-text)",
			)}
		>
			{label}
			{active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-(--c-text)" />}
		</span>
	);
}

/** A 32px header: the one shape every panel and rail opens with. */
function PanelHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
	return (
		<div className="flex h-8 shrink-0 items-center gap-2 border-b border-(--c-line) pr-2 pl-4">
			{children}
			<span className="ml-auto flex items-center">{actions}</span>
		</div>
	);
}

/* ---------- pages rail ---------- */

type RowState = "rest" | "hover" | "selected";
function RailRow({
	kind,
	name,
	count,
	open,
	current,
	unseen,
	state = "rest",
}: {
	kind: "page" | "frame";
	name: string;
	count?: number;
	open?: boolean;
	current?: boolean;
	unseen?: boolean;
	state?: RowState;
}) {
	const page = kind === "page";
	return (
		<div
			className={cn(
				"relative flex h-6 items-center rounded-[4px] pr-2",
				page ? "pl-2" : "pl-6",
				state === "hover" && "bg-(--c-hover)",
				state === "selected" && "bg-(--c-selected)",
			)}
		>
			{current && <span className="absolute top-1 -left-2 h-4 w-0.5 rounded-r-full bg-(--c-thread)" />}
			<span className="flex w-3 justify-center text-(--c-text-3)">
				{page && <IcChevron dir={open ? "down" : "right"} className="size-3" />}
			</span>
			{page ? (
				<IcFolder className={cn("ml-1", current ? "text-(--c-text-2)" : "text-(--c-text-3)")} />
			) : (
				<IcFile className={cn("ml-1", state === "selected" ? "text-(--c-text-2)" : "text-(--c-text-3)")} />
			)}
			<span
				className={cn(
					"c-mono ml-2 min-w-0 flex-1 truncate",
					state === "selected" || current ? "text-(--c-text)" : "text-(--c-text-2)",
					state === "hover" && "text-(--c-text)",
				)}
			>
				{name}
			</span>
			{unseen ? (
				<span className="mr-1 size-1.5 rounded-full bg-(--c-thread)" />
			) : count !== undefined ? (
				<span className="c-mono-sm text-(--c-text-3)">{count}</span>
			) : null}
		</div>
	);
}

function PagesRail() {
	return (
		<aside className="flex shrink-0 flex-col border-r border-(--c-line) bg-(--c-chrome)" style={{ width: RAIL }}>
			<PanelHeader
				actions={
					<>
						<IconButton>
							<IcPlus />
						</IconButton>
						<IconButton>
							<IcClose />
						</IconButton>
						<IconButton>
							<IcChevron dir="left" />
						</IconButton>
					</>
				}
			>
				<span className="c-heading">Pages</span>
				<CountChip>{pages.length}</CountChip>
			</PanelHeader>
			<div className="flex flex-col p-2">
				{pages.map((page) => (
					<div key={page.name} className="flex flex-col">
						<RailRow kind="page" name={page.name} count={page.count} open={page.open} current={page.current} />
						{page.open &&
							page.frames.map((f) => (
								<RailRow
									key={f.name}
									kind="frame"
									name={f.name}
									unseen={f.unseen}
									state={f.selected ? "selected" : "rest"}
								/>
							))}
					</div>
				))}
			</div>
			<div className="flex-1" />
			<div className="c-mono-sm flex h-8 items-center border-t border-(--c-line) px-4 text-(--c-text-3)">
				{railHint}
			</div>
		</aside>
	);
}

/* ---------- right side ---------- */

function SectionLabel({ label, source }: { label: string; source?: string }) {
	return (
		<div className="flex h-6 items-center px-2">
			<span className="c-small text-(--c-text-2)">{label}</span>
			{source && <span className="c-mono-sm ml-auto text-(--c-text-3)">{source}</span>}
		</div>
	);
}

function PropertyGroup({
	label,
	a,
	b,
}: {
	label: string;
	a: [string, number];
	b: [string, number];
}) {
	return (
		<div className="flex flex-col">
			<SectionLabel label={label} source={selection.source} />
			<div className="grid grid-cols-2 gap-1">
				<Field prefix={a[0]} value={String(a[1])} unit="px" />
				<Field prefix={b[0]} value={String(b[1])} unit="px" />
			</div>
		</div>
	);
}

function PropertiesPanel() {
	return (
		<aside className="flex shrink-0 flex-col border-l border-(--c-line) bg-(--c-chrome)" style={{ width: PANEL }}>
			<PanelHeader
				actions={
					<>
						<IconButton>
							<IcDots />
						</IconButton>
						<IconButton>
							<IcChevron dir="right" />
						</IconButton>
					</>
				}
			>
				<span className="c-mono text-(--c-text)">{selection.name}</span>
			</PanelHeader>
			<div className="flex flex-col gap-2 p-2">
				<PropertyGroup label="Position" a={["x", selection.x]} b={["y", selection.y]} />
				<PropertyGroup label="Size" a={["w", selection.w]} b={["h", selection.h]} />
			</div>
		</aside>
	);
}

function AgentPanel() {
	const edit = agent.turn.edits[0]!;
	return (
		<aside
			className="flex shrink-0 flex-col border-l border-(--c-line) bg-(--c-chrome)"
			style={{ width: AGENT_PANEL }}
		>
			<PanelHeader
				actions={
					<>
						<IconButton>
							<IcChevron dir="right" />
						</IconButton>
						<IconButton>
							<IcPlus />
						</IconButton>
					</>
				}
			>
				<span className="c-heading">{agent.title}</span>
			</PanelHeader>
			<div className="flex h-6 shrink-0 items-center border-b border-(--c-line) px-4">
				<span className="c-mono-sm flex items-center gap-0.5 text-(--c-text-2)">
					{agent.model}
					<IcChevron className="size-3 text-(--c-text-3)" />
				</span>
				<span className="c-small ml-auto text-(--c-text-3)">{agent.scope}</span>
			</div>

			<div className="flex flex-1 flex-col justify-end gap-3 p-2 pb-3">
				<div className="c-body ml-8 self-end rounded-[4px] bg-(--c-field) px-2 py-2 text-(--c-text)">
					{agent.turn.ask}
				</div>
				<div className="flex flex-col gap-2 px-2">
					<span className="c-mono-sm text-(--c-text-3)">{agent.model}</span>
					<p className="c-body text-(--c-text)">{agent.turn.said}</p>
				</div>
				<div className="flex h-6 items-center gap-2 rounded-[4px] px-2 shadow-[inset_0_0_0_1px_var(--c-line)]">
					<IcFile className="text-(--c-text-3)" />
					<span className="c-mono-sm min-w-0 flex-1 truncate text-(--c-text-2)">{edit.path}</span>
					<span className="c-mono-sm text-(--c-text)">+{edit.added}</span>
					<span className="c-mono-sm text-(--c-text-3)">−{edit.removed}</span>
				</div>
			</div>

			<div className="flex shrink-0 flex-col gap-1 px-2 pb-2">
				<div className="flex h-[88px] flex-col gap-2 rounded-[4px] bg-(--c-field) p-2 shadow-[inset_0_0_0_1px_var(--c-line-2)]">
					<span className="flex">
						<SelectionChip />
					</span>
					<span className="c-body text-(--c-text-3)">{agent.placeholder}</span>
				</div>
				<div className="flex h-6 items-center px-2">
					<span className="c-small text-(--c-text-2)">{agent.account}</span>
					<span className="c-mono-sm ml-auto flex items-center gap-0.5 text-(--c-text-2)">
						{agent.mode}
						<IcChevron className="size-3 text-(--c-text-3)" />
					</span>
				</div>
			</div>
		</aside>
	);
}

function PanelStrip({ active }: { active: "properties" | "agent" }) {
	return (
		<nav className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-(--c-line) bg-(--c-chrome) py-1">
			<IconButton active={active === "properties"}>
				<IcProperties />
			</IconButton>
			<IconButton active={active === "agent"}>
				<IcAgent />
			</IconButton>
			<span className="flex-1" />
			<IconButton>
				<IcHelp />
			</IconButton>
			<IconButton>
				<IcCog />
			</IconButton>
		</nav>
	);
}

/* ---------- window bar ---------- */

function WindowBar({ atHome }: { atHome?: boolean }) {
	return (
		<header className="flex h-9 shrink-0 items-center gap-1 border-b border-(--c-line) bg-(--c-chrome) px-2">
			<WindowTab label="Home" icon={<IcHome className="text-(--c-text-2)" />} active={atHome} />
			<span className="mx-1 h-4 w-px bg-(--c-line-2)" />
			{tabs.map((t) => (
				<WindowTab key={t.name} label={t.name} active={!atHome && t.active} closable={!atHome && t.active} />
			))}
			<IconButton>
				<IcPlus />
			</IconButton>
			<span className="flex-1" />
			{!atHome && (
				<>
					<IconButton active>
						<IcFlows />
					</IconButton>
					<span className="c-mono-sm w-10 pr-1 text-right text-(--c-text-2)">{zoom}</span>
				</>
			)}
		</header>
	);
}

/* ---------- canvas ---------- */

type Pt = [number, number];
function Flow({ d, end, from, dashed }: { d: string; end: Pt; from: Pt; dashed?: boolean }) {
	const a = Math.atan2(end[1] - from[1], end[0] - from[0]);
	const h = 6;
	const s = 0.5;
	const p1: Pt = [end[0] - h * Math.cos(a - s), end[1] - h * Math.sin(a - s)];
	const p2: Pt = [end[0] - h * Math.cos(a + s), end[1] - h * Math.sin(a + s)];
	return (
		<g stroke="var(--c-thread)" fill="none" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
			<path d={d} strokeDasharray={dashed ? "4 4" : undefined} />
			<path d={`M${p1[0]} ${p1[1]}L${end[0]} ${end[1]}L${p2[0]} ${p2[1]}`} />
		</g>
	);
}

function Flows() {
	const [cart, menu, receipt] = [frameX(0), frameX(1), frameX(2)];
	const bottom = FRAME_TOP + drawnSize.h;
	const cr = cart + drawnSize.w;
	const mr = menu + drawnSize.w;
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
			{/* menu → cart, from Checkout */}
			<Flow d={`M${menu} 620C${menu - 24} 620 ${cr + 22} 588 ${cr + 2} 588`} from={[cr + 22, 588]} end={[cr + 2, 588]} />
			{/* cart → receipt, from Pay, under menu */}
			<Flow
				d={`M${cr + 2} 640C${cr + 64} 760 ${receipt + 40} ${bottom + 112} ${receipt + 40} ${bottom + 4}`}
				from={[receipt + 40, bottom + 112]}
				end={[receipt + 40, bottom + 4]}
			/>
			{/* receipt → menu, might */}
			<Flow
				d={`M${receipt} 400C${receipt - 22} 400 ${mr + 22} 372 ${mr + 2} 372`}
				from={[mr + 22, 372]}
				end={[mr + 2, 372]}
				dashed
			/>
		</svg>
	);
}

function FrameOnCanvas({
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
		<div className="absolute" style={{ left: x, top: FRAME_TOP, width: drawnSize.w, height: drawnSize.h }}>
			<div className="absolute inset-x-0 -top-7 flex h-4 items-center gap-1.5">
				<span className={cn("c-mono-sm", selected ? "text-(--c-thread-ink)" : "text-(--c-text-2)")}>{name}</span>
				{unseen && <span className="size-1.5 rounded-full bg-(--c-thread)" />}
				{selected && (
					<span className="c-mono-sm ml-auto flex items-center gap-1 text-(--c-thread-ink)">
						<IcPlay className="size-2.5" />
						play
					</span>
				)}
			</div>
			<CoffeeScreen screen={screen} />
			{selected && (
				<>
					<span className="pointer-events-none absolute -inset-0.5 rounded-[9px] border border-(--c-thread)" />
					{[
						["-left-[5px] -top-[5px]"],
						["-right-[5px] -top-[5px]"],
						["-left-[5px] -bottom-[5px]"],
						["-right-[5px] -bottom-[5px]"],
					].map(([pos]) => (
						<span key={pos} className={cn("absolute size-1.5 border border-(--c-thread) bg-[#fff]", pos)} />
					))}
					<span className="absolute inset-x-0 -bottom-7 flex justify-center">
						<SizeTag />
					</span>
				</>
			)}
			{picked && (
				<span className="absolute" style={{ left: 16, top: 49, width: 208, height: 28 }}>
					<span className="absolute -inset-px rounded-[6px] border border-(--c-thread)" />
					<span className="absolute -top-[17px] -right-px">
						<KindTag />
					</span>
				</span>
			)}
		</div>
	);
}

function Toolbar({ active }: { active: string }) {
	return (
		<div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[6px] bg-(--c-raised) p-1 shadow-(--c-float)">
			{tools.map((t) => {
				const Icon = toolIcon[t.name as keyof typeof toolIcon];
				const on = t.name === active;
				return (
					<span
						key={t.name}
						className={cn(
							"flex h-6 w-12 items-center justify-center gap-2 rounded-[4px] text-(--c-text-2)",
							on && "bg-(--c-selected) text-(--c-text)",
						)}
					>
						<Icon />
						<Key className={cn(on && "text-(--c-text-2)")}>{t.key}</Key>
					</span>
				);
			})}
		</div>
	);
}

function Canvas({ mode }: { mode: "select" | "edit" }) {
	return (
		<main className="relative min-w-0 flex-1 overflow-hidden bg-(--c-canvas)">
			<Flows />
			{canvasFrames.map((f, i) => (
				<FrameOnCanvas
					key={f.name}
					index={i}
					name={f.name}
					screen={f.screen}
					selected={mode === "select" && "selected" in f && f.selected}
					unseen={"unseen" in f && f.unseen}
					picked={mode === "edit" && f.name === element.frame}
				/>
			))}
			<Toolbar active={mode} />
		</main>
	);
}

/* ---------- screens ---------- */

function Window({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
	return (
		<div
			className="id-compact relative flex h-[900px] w-[1440px] flex-col overflow-hidden"
			data-appearance={appearance}
		>
			{children}
		</div>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	return (
		<Window appearance={appearance}>
			<WindowBar />
			<div className="flex min-h-0 flex-1">
				<PagesRail />
				<Canvas mode={panel === "agent" ? "edit" : "select"} />
				{panel === "agent" ? <AgentPanel /> : <PropertiesPanel />}
				<PanelStrip active={panel} />
			</div>
		</Window>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<Window appearance={appearance}>
			<WindowBar atHome />
			<div className="flex min-h-0 flex-1">
				<nav className="flex shrink-0 flex-col border-r border-(--c-line) p-2 pt-6" style={{ width: RAIL }}>
					<div className="flex h-8 items-center gap-2 px-2">
						<SpoolMark className="h-4 w-[13px] text-(--c-thread)" />
						<span className="c-heading">spool</span>
					</div>
					<div className="mt-4 flex h-6 items-center gap-2 rounded-[4px] bg-(--c-selected) px-2">
						<IcFolder className="text-(--c-text-2)" />
						<span className="c-body text-(--c-text)">{home.nav[0]}</span>
					</div>
					<span className="flex-1" />
					<div className="flex h-6 items-center gap-2 rounded-[4px] px-2">
						<IcCog className="text-(--c-text-3)" />
						<span className="c-body text-(--c-text-2)">{home.foot}</span>
					</div>
				</nav>
				<main className="min-w-0 flex-1 px-6 pt-6">
					<div className="flex h-8 items-center gap-2">
						<h1 className="c-display mr-auto">{home.title}</h1>
						<SearchField className="w-60" />
						<Button kind="secondary">{home.actions[0]}</Button>
						<Button kind="secondary">{home.actions[1]}</Button>
						<Button kind="primary" icon={<IcPlus className="size-3" />}>
							{home.actions[2]}
						</Button>
					</div>
					<div className="mt-4 flex h-6 items-center">
						<span className="c-mono-sm text-(--c-text-3)">{home.count}</span>
						<span className="ml-auto flex items-center gap-1">
							<span className="c-small text-(--c-text-3)">Sort by</span>
							<span className="c-body flex items-center gap-0.5 text-(--c-text)">
								{home.sort}
								<IcChevron dir="down" className="size-3 text-(--c-text-3)" />
							</span>
						</span>
					</div>
					<div className="mt-2 grid grid-cols-3 gap-3">
						{projects.map((p) => (
							<div key={p.name} className="flex flex-col gap-2">
								<div className="aspect-[16/10] overflow-hidden rounded-[4px] shadow-[0_0_0_1px_var(--c-line)]">
									<ProjectArtwork kind={p.art} className="h-full w-full" />
								</div>
								<div className="flex h-4 items-center gap-2">
									<span className="c-body font-medium text-(--c-text)">{p.name}</span>
									<span className="c-mono-sm ml-auto text-(--c-text-3)">
										{p.frames} frames · {p.when}
									</span>
								</div>
							</div>
						))}
					</div>
				</main>
			</div>
		</Window>
	);
}

/* ---------- parts ---------- */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col", className)}>
			<div className="c-mono-sm flex h-6 items-center text-(--c-text-3)">{label}</div>
			{children}
		</section>
	);
}

const typeRoles = [
	{ name: "display", cls: "c-display", sample: "Projects", spec: "Inter 600 20/24" },
	{ name: "heading", cls: "c-heading", sample: "Pages", spec: "Inter 600 12/16" },
	{ name: "body", cls: "c-body", sample: "Check for updates", spec: "Inter 400 12/16" },
	{ name: "small", cls: "c-small", sample: "For this new chat", spec: "Inter 400 11/16" },
	{ name: "mono", cls: "c-mono", sample: "frames/app/cart", spec: "Fragment 12/16" },
	{ name: "mono-sm", cls: "c-mono-sm", sample: "390 × 844 · ⌘D", spec: "Fragment 11/16" },
];

const swatches = {
	dark: [
		["chrome", "#0f0f0e"],
		["canvas", "#171716"],
		["field", "#1d1c1b"],
		["raised", "#222120"],
		["line", "#252422"],
		["line-2", "#34322f"],
		["text", "#ecebe8"],
		["text-2", "#a29f99"],
		["text-3", "#74716b"],
		["thread", "#f5391a"],
		["thread-ink", "#ff5636"],
		["on-thread", "#ffffff"],
	],
	light: [
		["chrome", "#f6f5f2"],
		["canvas", "#e9e8e4"],
		["field", "#ebeae6"],
		["raised", "#ffffff"],
		["line", "#e1dfda"],
		["line-2", "#cfccc6"],
		["text", "#1b1a18"],
		["text-2", "#5d5a55"],
		["text-3", "#85817b"],
		["thread", "#f5391a"],
		["thread-ink", "#c8290d"],
		["on-thread", "#ffffff"],
	],
} as const;

function ContextMenu() {
	return (
		<div className="flex w-52 flex-col rounded-[6px] bg-(--c-raised) p-1 shadow-(--c-float)">
			{menuItems.map((m, i) => (
				<div key={m.label} className="flex flex-col">
					{m.danger && <span className="mx-2 my-1 h-px bg-(--c-line)" />}
					<span
						className={cn(
							"c-body flex h-6 items-center rounded-[4px] px-2",
							m.danger ? "text-(--c-thread-ink)" : "text-(--c-text)",
							i === 1 && "bg-(--c-selected)",
						)}
					>
						{m.label}
						<Key className="ml-auto">{m.key}</Key>
					</span>
				</div>
			))}
		</div>
	);
}

function ToolbarSpec() {
	return (
		<div className="flex w-fit items-center gap-0.5 rounded-[6px] bg-(--c-raised) p-1 shadow-(--c-float)">
			{tools.map((t) => {
				const Icon = toolIcon[t.name as keyof typeof toolIcon];
				return (
					<span
						key={t.name}
						className={cn(
							"flex h-6 w-12 items-center justify-center gap-2 rounded-[4px] text-(--c-text-2)",
							t.active && "bg-(--c-selected) text-(--c-text)",
						)}
					>
						<Icon />
						<Key className={cn(t.active && "text-(--c-text-2)")}>{t.key}</Key>
					</span>
				);
			})}
		</div>
	);
}

const icons = [
	IcHome,
	IcPlus,
	IcClose,
	IcChevron,
	IcFolder,
	IcFile,
	IcFlows,
	IcProperties,
	IcAgent,
	IcHelp,
	IcCog,
	IcSelect,
	IcEdit,
	IcHand,
	IcSearch,
	IcDots,
	IcPlay,
	IcTrash,
];

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-compact flex h-[900px] w-[720px] flex-col p-5" data-appearance={appearance}>
			<div className="flex h-8 shrink-0 items-center gap-2 border-b border-(--c-line)">
				<SpoolMark className="h-4 w-[13px] text-(--c-thread)" />
				<span className="c-heading">compact</span>
				<span className="c-mono-sm text-(--c-text-3)">{appearance}</span>
				<span className="c-mono-sm ml-auto text-(--c-text-3)">
					grid 4 · row 24 · chip 20 · tag 16 · header 32 · radius 4, floats 6
				</span>
			</div>
			<div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-x-6">
				{/* left column */}
				<div className="flex flex-col gap-3">
					<Spec label="type">
						{typeRoles.map((r) => (
							<div key={r.name} className="flex h-6 items-center gap-2">
								<span className="c-mono-sm w-14 text-(--c-text-3)">{r.name}</span>
								<span className={cn(r.cls, "flex-1 truncate")}>{r.sample}</span>
								<span className="c-mono-sm text-(--c-text-3)">{r.spec}</span>
							</div>
						))}
					</Spec>
					<Spec label="colour">
						<div className="grid grid-cols-4 gap-x-2 gap-y-1">
							{swatches[appearance].map(([name, hex]) => (
								<div key={name} className="flex flex-col">
									<span
										className="h-4 rounded-[4px] shadow-[inset_0_0_0_1px_var(--c-line-2)]"
										style={{ background: hex }}
									/>
									<span className="c-mono-sm mt-0.5 truncate text-(--c-text-2)">{name}</span>
									<span className="c-mono-sm -mt-0.5 text-(--c-text-3)">{hex}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="button · 24">
						<div className="flex flex-wrap items-center gap-2">
							<Button kind="primary" icon={<IcPlus className="size-3" />}>
								{home.actions[2]}
							</Button>
							<Button kind="secondary">{home.actions[0]}</Button>
							<Button kind="ghost">{agent.account}</Button>
							<Button kind="danger" icon={<IcTrash className="size-3" />}>
								Move to Trash
							</Button>
							<IconButton className="shadow-[inset_0_0_0_1px_var(--c-line)]">
								<IcPlus />
							</IconButton>
						</div>
					</Spec>
					<Spec label="input focused · search">
						<div className="grid grid-cols-[1fr_1.5fr] gap-2">
							<Field prefix="x" value={String(selection.x)} unit="px" focus />
							<SearchField />
						</div>
					</Spec>
					<Spec label="segmented · toggle on, off">
						<div className="flex items-center gap-3">
							<Segmented items={["Ask", "Only this Mac"]} active={0} />
							<Toggle on />
							<Toggle />
						</div>
					</Spec>
					<Spec label="tab · window, panel">
						<div className="flex items-center gap-1">
							<WindowTab label="Home" icon={<IcHome className="text-(--c-text-2)" />} />
							<WindowTab label="kaffe" active closable />
							<WindowTab label="tvärsö" />
						</div>
						<div className="mt-1 flex items-center gap-4 border-b border-(--c-line)">
							<PanelTab label="General" active />
							<PanelTab label="Appearance" />
						</div>
					</Spec>
					<Spec label="chip · count, selection · tag · size, kind">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<CountChip>3</CountChip>
							<SelectionChip />
							<SizeTag />
							<KindTag />
						</div>
					</Spec>
				</div>

				{/* right column */}
				<div className="flex flex-col gap-3">
					<Spec label="header · 32">
						<div className="shadow-[inset_0_0_0_1px_var(--c-line)] rounded-[4px]">
							<PanelHeader
								actions={
									<>
										<IconButton>
											<IcPlus />
										</IconButton>
										<IconButton>
											<IcClose />
										</IconButton>
										<IconButton>
											<IcChevron dir="left" />
										</IconButton>
									</>
								}
							>
								<span className="c-heading">Pages</span>
								<CountChip>{pages.length}</CountChip>
							</PanelHeader>
						</div>
					</Spec>
					<Spec label="rail row · 24">
						<div className="grid grid-cols-[1fr_56px] items-center gap-x-2 pl-2">
							<RailRow kind="page" name="directing" count={1} />
							<Key className="text-right">rest</Key>
							<RailRow kind="page" name="site" count={2} state="hover" />
							<Key className="text-right">hover</Key>
							<RailRow kind="frame" name="cart" state="selected" />
							<Key className="text-right">selected</Key>
							<RailRow kind="page" name="app" count={3} open current />
							<Key className="text-right">current</Key>
							<RailRow kind="frame" name="receipt" unseen />
							<Key className="text-right">unseen</Key>
						</div>
					</Spec>
					<Spec label="property row · two fields">
						<PropertyGroup label="Position" a={["x", selection.x]} b={["y", selection.y]} />
					</Spec>
					<div className="flex gap-4">
						<Spec label="menu · keys inline">
							<ContextMenu />
						</Spec>
						<div className="flex flex-col gap-3">
							<Spec label="tooltip">
								<span className="flex h-6 w-fit items-center gap-2 rounded-[6px] bg-(--c-raised) px-2 shadow-(--c-float)">
									<span className="c-body">Edit</span>
									<Key>E</Key>
								</span>
							</Spec>
						</div>
					</div>
					<Spec label="toast">
						<div className="flex h-8 w-fit items-center gap-3 rounded-[6px] bg-(--c-raised) pr-1 pl-3 shadow-(--c-float)">
							<span className="c-body">
								<span className="c-mono">cart</span> moved to Trash
							</span>
							<Button kind="ghost" className="text-(--c-text)">
								{toast.action}
							</Button>
						</div>
					</Spec>
					<Spec label="settings row">
						<div className="flex items-start gap-4 border-y border-(--c-line) py-2">
							<div className="flex flex-col">
								<span className="c-body text-(--c-text)">{settingsRow.title}</span>
								<span className="c-small text-balance text-(--c-text-2)">{settingsRow.detail}</span>
							</div>
							<span className="ml-auto pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>
					<Spec label="toolbar · keys inline">
						<ToolbarSpec />
					</Spec>
					<Spec label="icon · 14, stroke 1.2">
						<div className="flex flex-wrap gap-1 text-(--c-text-2)">
							{icons.map((I, i) => (
								<IconButton key={i}>
									<I />
								</IconButton>
							))}
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
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}
