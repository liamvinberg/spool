import "./thread.css";
import type { ReactNode } from "react";
import {
	type Appearance,
	canvasFrames,
	commandHint,
	drawnSize,
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
} from "shared/lib/explore/identity/world";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * thread: the chrome is quiet greyscale and every active state is the same red line.
 * The thread leaves the spool mark, runs down the pages tree into the open page and the
 * selected frame, outlines the selection, carries the flows, and underlines whatever is
 * chosen: the active tab, the tool, the focused field, the segment. Fills are neutral
 * and only ever mean hover or a primary action. A thread ends in a knot (a 2px dot)
 * where it lands and in an open chevron where it goes on.
 */

const ROW = 28;
const THREAD = 1.5;

/* ---------- icons: one line language, 16px box, 1.25 stroke ---------- */

function Icon({ d, className, dashed }: { d: string; className?: string; dashed?: boolean }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("h-4 w-4 shrink-0", className)} fill="none" aria-hidden="true">
			<path
				d={d}
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeDasharray={dashed ? "2 2" : undefined}
			/>
		</svg>
	);
}

const I = {
	home: "M2.75 7.25 8 3l5.25 4.25V13a.5.5 0 0 1-.5.5h-3.5V10h-2.5v3.5h-3.5a.5.5 0 0 1-.5-.5z",
	plus: "M8 3.25v9.5M3.25 8h9.5",
	play: "M5 3.4v9.2a.4.4 0 0 0 .6.35l7.4-4.6a.4.4 0 0 0 0-.7L5.6 3.05a.4.4 0 0 0-.6.35z",
	share: "M8 2.75v7M5.25 5.25 8 2.5l2.75 2.75M3.5 8.5v4.25h9V8.5",
	search: "M7.25 11.75a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.5 10.5l3 3",
	pointer: "M3.5 3 12.75 7l-4 1.25L7.5 12.5z",
	marquee: "M2.75 2.75h10.5v10.5H2.75z",
	hand: "M5.25 8.5V4.25a1 1 0 0 1 2 0V7.5M7.25 7V3a1 1 0 0 1 2 0v4M9.25 7V4a1 1 0 0 1 2 0v4.75M11.25 6.5a1 1 0 0 1 2 0V9a4.5 4.5 0 0 1-4.5 4.5h-.5a4 4 0 0 1-3.2-1.6L3 9.25a1 1 0 0 1 1.6-1.2l.65.8",
	cog: "M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4M12.4 12.4l-1.05-1.05M4.65 4.65 3.6 3.6",
	chevron: "m5 6.5 3 3 3-3",
	dots: "M3.5 8h.01M8 8h.01M12.5 8h.01",
	close: "m4.5 4.5 7 7M11.5 4.5l-7 7",
} as const;

/* ---------- the thread itself ---------- */

/** a knot: where a thread lands */
function Knot({ className }: { className?: string }) {
	return <span className={cn("block h-1 w-1 shrink-0 rounded-full bg-(--t-thread)", className)} />;
}

/** the mark for "chosen": a thread drawn under the thing */
function Underline({ className }: { className?: string }) {
	return (
		<span
			className={cn("pointer-events-none absolute bottom-0 h-[1.5px] rounded-full bg-(--t-thread)", className)}
		/>
	);
}

/** a flow's glyph: solid for will, dashed for might */
function FlowGlyph({ certainty, tone = "guide" }: { certainty: "will" | "might"; tone?: "guide" | "thread" }) {
	const color = tone === "thread" ? "var(--t-thread)" : "var(--t-muted)";
	return (
		<svg viewBox="0 0 24 8" className="h-2 w-6 shrink-0" fill="none" aria-hidden="true">
			<circle cx="2" cy="4" r="1.5" fill={color} />
			<path
				d="M4 4h16"
				stroke={color}
				strokeWidth={THREAD}
				strokeDasharray={certainty === "might" ? "3 2.5" : undefined}
			/>
			<path d="m18 1.25 3 2.75-3 2.75" stroke={color} strokeWidth={THREAD} strokeLinecap="round" />
		</svg>
	);
}

/* ---------- primitives ---------- */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({
	kind = "secondary",
	children,
	icon,
	className,
}: {
	kind?: ButtonKind;
	children?: ReactNode;
	icon?: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"t-body inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap",
				children ? "px-3" : "w-7 justify-center",
				icon && children ? "pl-2.5" : null,
				kind === "primary" && "bg-(--t-inverse) text-(--t-on-inverse)",
				kind === "secondary" && "border border-(--t-guide) text-(--t-text)",
				kind === "ghost" && "text-(--t-muted)",
				kind === "danger" && "border border-(--t-guide) text-(--t-thread-ink)",
				className,
			)}
		>
			{icon ? <Icon d={icon} className="h-3.5 w-3.5" /> : null}
			{children}
		</span>
	);
}

function IconButton({ d, active, className }: { d: string; active?: boolean; className?: string }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]",
				active ? "text-(--t-text)" : "text-(--t-muted)",
				className,
			)}
		>
			<Icon d={d} />
			{active ? <Underline className="left-2 right-2 bottom-0.5" /> : null}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return <span className="t-micro shrink-0 text-(--t-faint)">{children}</span>;
}

/** fields are lines: a hairline under the value, the thread under it while focused */
function Field({
	prefix,
	value,
	focused,
	placeholder,
	trailing,
	icon,
	mono = true,
	className,
}: {
	prefix?: string;
	value?: string;
	focused?: boolean;
	placeholder?: string;
	trailing?: ReactNode;
	icon?: string;
	mono?: boolean;
	className?: string;
}) {
	return (
		<span className={cn("relative flex h-7 min-w-0 items-center gap-2 px-0.5", className)}>
			<span className={cn("absolute inset-x-0 bottom-0 h-px", focused ? "bg-transparent" : "bg-(--t-guide)")} />
			{focused ? <Underline className="inset-x-0" /> : null}
			{icon ? <Icon d={icon} className="h-3.5 w-3.5 text-(--t-muted)" /> : null}
			{prefix ? <span className="t-micro w-3 shrink-0 text-(--t-faint)">{prefix}</span> : null}
			{value ? (
				<span className={cn(mono ? "t-mono" : "t-body", "min-w-0 flex-1 truncate text-(--t-text)")}>
					{value}
					{focused ? <span className="ml-px inline-block h-3.5 w-px translate-y-[3px] bg-(--t-text)" /> : null}
				</span>
			) : (
				<span className="t-body min-w-0 flex-1 truncate text-(--t-faint)">{placeholder}</span>
			)}
			{trailing}
		</span>
	);
}

function Segmented({ items, active, className }: { items: string[]; active: string; className?: string }) {
	return (
		<span className={cn("inline-flex h-7 items-center rounded-[6px] border border-(--t-guide) px-1", className)}>
			{items.map((item) => (
				<span
					key={item}
					className={cn(
						"t-body relative flex h-full items-center px-2.5",
						item === active ? "text-(--t-text)" : "text-(--t-muted)",
					)}
				>
					{item}
					{item === active ? <Underline className="left-2.5 right-2.5 bottom-[3px]" /> : null}
				</span>
			))}
		</span>
	);
}

/** a toggle is a track drawn in line; on, the track is the thread */
function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full",
				on ? "border-[1.5px] border-(--t-thread)" : "border border-(--t-guide)",
			)}
		>
			<span
				className={cn(
					"absolute h-2 w-2 rounded-full",
					on ? "right-[3px] bg-(--t-text)" : "left-[3px] bg-(--t-muted)",
				)}
			/>
		</span>
	);
}

function Chip({ children, dot }: { children: ReactNode; dot?: "thread" | "neutral" }) {
	return (
		<span className="t-micro inline-flex h-5 items-center gap-1.5 rounded-[6px] border border-(--t-guide) px-1.5 text-(--t-muted)">
			{dot === "thread" ? <Knot /> : null}
			{dot === "neutral" ? <span className="h-1.5 w-1.5 rounded-full bg-(--t-text)" /> : null}
			{children}
		</span>
	);
}

function Avatar({ size = 20 }: { size?: 16 | 20 | 24 }) {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--t-ada) font-mono font-medium text-(--t-text)"
			style={{ width: size, height: size, fontSize: size <= 16 ? 7 : size === 20 ? 8 : 9, letterSpacing: "0.02em" }}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function UnseenDot() {
	return <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-(--t-text)" />;
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
	return (
		<div className="flex h-7 items-center justify-between">
			<span className="t-micro text-(--t-faint)">{children}</span>
			{right}
		</div>
	);
}

/* ---------- the window ---------- */

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-thread flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--t-chrome)"
			data-appearance={appearance}
		>
			<TabStrip />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Properties />
			</div>
		</div>
	);
}

function TabStrip() {
	return (
		<div className="relative flex h-10 shrink-0 items-center border-b border-(--t-line) pr-3">
			<div className="flex w-[76px] shrink-0 items-center gap-2 pl-4">
				<span className="h-3 w-3 rounded-full border border-(--t-guide)" />
				<span className="h-3 w-3 rounded-full border border-(--t-guide)" />
				<span className="h-3 w-3 rounded-full border border-(--t-guide)" />
			</div>
			<div className="flex h-full items-stretch pl-2">
				<Tab name="Home" icon={I.home} />
				<span className="mx-1 my-3 w-px bg-(--t-line)" />
				{tabs.map((tab) => (
					<Tab key={tab.name} name={tab.name} active={tab.active} />
				))}
				<span className="flex items-center pl-1">
					<IconButton d={I.plus} />
				</span>
			</div>
			<div className="ml-auto flex items-center gap-3">
				<span className="flex items-center gap-2">
					<Avatar size={20} />
				</span>
				<span className="h-4 w-px bg-(--t-line)" />
				<span className="t-micro w-9 text-right text-(--t-muted)">{zoom}</span>
				<Button kind="secondary" icon={I.share}>
					Share
				</Button>
				<Button kind="primary" icon={I.play}>
					Play
				</Button>
			</div>
		</div>
	);
}

function Tab({ name, active, icon }: { name: string; active?: boolean; icon?: string }) {
	return (
		<span
			className={cn(
				"t-body relative flex items-center gap-2 px-3",
				active ? "text-(--t-text)" : "text-(--t-muted)",
			)}
		>
			{icon ? <Icon d={icon} className="h-3.5 w-3.5" /> : null}
			{name}
			{active ? <Underline className="left-3 right-3 -bottom-px" /> : null}
		</span>
	);
}

/* ---------- sidebar: the tree is drawn in thread ---------- */

const SIDE_W = 240;
const TREE_TOP = 80;
const SPINE_0 = 20;
const SPINE_1 = 36;
const R = 6;

interface TreeRow {
	kind: "page" | "frame";
	name: string;
	depth: 0 | 1;
	count?: number;
	open?: boolean;
	current?: boolean;
	selected?: boolean;
	unseen?: boolean;
	presence?: boolean;
}

function flatten(): TreeRow[] {
	const rows: TreeRow[] = [];
	for (const page of pages) {
		rows.push({
			kind: "page",
			name: page.name,
			depth: 0,
			count: page.count,
			open: page.open,
			current: page.current,
			presence: page.presence,
		});
		if (page.open) {
			for (const frame of page.frames) {
				rows.push({ kind: "frame", name: frame.name, depth: 1, selected: frame.selected, unseen: frame.unseen });
			}
		}
	}
	return rows;
}

const cy = (i: number) => TREE_TOP + ROW / 2 + ROW * i;

function treePaths(rows: TreeRow[]) {
	const guide: string[] = [];
	const tops = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.depth === 0);
	const lastTop = tops[tops.length - 1]?.i ?? 0;
	guide.push(`M${SPINE_0} 38V${cy(lastTop) - R}`);
	let thread = "";
	let knot: { x: number; y: number } | null = null;
	for (const { r, i } of tops) {
		const y = cy(i);
		if (r.open) {
			const kids = rows.map((k, j) => ({ k, j })).filter(({ k, j }) => k.depth === 1 && j > i);
			const own: { k: TreeRow; j: number }[] = [];
			for (const kid of kids) {
				if (kid.j !== i + 1 + own.length) break;
				own.push(kid);
			}
			const last = own[own.length - 1]?.j ?? i;
			const hook = `M${SPINE_0} ${y - R}Q${SPINE_0} ${y} ${SPINE_0 + R} ${y}H${SPINE_1 - R}Q${SPINE_1} ${y} ${SPINE_1} ${y + R}V${cy(last) - R}`;
			guide.push(hook);
			for (const { k, j } of own) {
				const ky = cy(j);
				guide.push(`M${SPINE_1} ${ky - R}Q${SPINE_1} ${ky} ${SPINE_1 + R} ${ky}H50`);
				if (k.selected && r.current) {
					thread = `M${SPINE_0} 38V${y - R}Q${SPINE_0} ${y} ${SPINE_0 + R} ${y}H${SPINE_1 - R}Q${SPINE_1} ${y} ${SPINE_1} ${y + R}V${ky - R}Q${SPINE_1} ${ky} ${SPINE_1 + R} ${ky}H49`;
					knot = { x: 52, y: ky };
				}
			}
		} else {
			guide.push(`M${SPINE_0} ${y - R}Q${SPINE_0} ${y} ${SPINE_0 + R} ${y}H32`);
		}
	}
	return { guide, thread, knot };
}

function Sidebar() {
	const rows = flatten();
	const { guide, thread, knot } = treePaths(rows);
	const treeH = TREE_TOP + rows.length * ROW + 8;
	return (
		<aside className="flex shrink-0 flex-col border-r border-(--t-line)" style={{ width: SIDE_W }}>
			<div className="relative shrink-0" style={{ height: treeH }}>
				<svg
					className="pointer-events-none absolute inset-0 z-10"
					width={SIDE_W}
					height={treeH}
					fill="none"
					aria-hidden="true"
				>
					{guide.map((d) => (
						<path key={d} d={d} stroke="var(--t-guide)" strokeWidth="1" />
					))}
					{thread ? <path d={thread} stroke="var(--t-thread)" strokeWidth={THREAD} strokeLinecap="round" /> : null}
					{knot ? <circle cx={knot.x} cy={knot.y} r="2" fill="var(--t-thread)" /> : null}
				</svg>

				{/* the project: the spool the thread comes off */}
				<div className="flex h-12 items-center pr-2 pl-3">
					<SpoolMark className="h-5 w-4 shrink-0 text-(--t-thread)" />
					<span className="t-title ml-3 text-(--t-text)">{project.name}</span>
					<span className="t-body ml-2 text-(--t-faint)">{project.team}</span>
					<span className="ml-auto">
						<IconButton d={I.dots} />
					</span>
				</div>
				<div className="flex h-7 items-center justify-between pr-2 pl-10">
					<span className="t-micro text-(--t-faint)">pages</span>
					<IconButton d={I.plus} />
				</div>
				<div className="mt-1">
					{rows.map((row) => (
						<SidebarRow key={`${row.depth}-${row.name}`} row={row} />
					))}
				</div>
			</div>

			<div className="mt-4 px-3">
				<div className="pl-7">
					<SectionLabel>flows</SectionLabel>
				</div>
				{flows.map((flow) => (
					<div key={flow.from + flow.to} className="flex h-7 items-center gap-2 pl-7">
						<span className="t-mono text-(--t-muted)">{flow.from}</span>
						<FlowGlyph certainty={flow.certainty} />
						<span className="t-mono text-(--t-muted)">{flow.to}</span>
						<span className="t-micro ml-auto text-(--t-faint)">{flow.certainty}</span>
					</div>
				))}
			</div>

			<div className="mt-auto flex flex-col gap-2 px-3 pb-3">
				<Field icon={I.search} placeholder="Find a frame" trailing={<Kbd>{commandHint}</Kbd>} />
				<div className="flex h-7 items-center justify-between">
					<span className="t-micro text-(--t-faint)">
						{project.frames} frames · {project.synced}
					</span>
					<IconButton d={I.cog} className="-mr-1.5" />
				</div>
			</div>
		</aside>
	);
}

function SidebarRow({ row, hover }: { row: TreeRow; hover?: boolean }) {
	const lit = row.selected || row.current;
	return (
		<div
			className={cn("relative flex items-center pr-3", row.depth === 0 ? "pl-10" : "pl-[60px]")}
			style={{ height: ROW }}
		>
			{hover ? <span className="absolute inset-y-0.5 right-1.5 left-1.5 rounded-[6px] bg-(--t-hover)" /> : null}
			<span
				className={cn(
					"relative min-w-0 flex-1 truncate",
					row.kind === "page" ? "t-body" : "t-mono",
					lit || hover ? "text-(--t-text)" : "text-(--t-muted)",
					row.kind === "page" && lit ? "font-medium" : null,
				)}
			>
				{row.name}
			</span>
			<span className="relative flex items-center gap-2">
				{row.presence ? <Avatar size={16} /> : null}
				{row.unseen ? <UnseenDot /> : null}
				{row.count !== undefined ? (
					<span className="t-micro w-3 text-right text-(--t-faint)">{row.count}</span>
				) : null}
			</span>
		</div>
	);
}

/* ---------- canvas ---------- */

const FRAME_TOP = 152;
const FRAME_X = [56, 352, 648];

function Canvas() {
	const sel = 1;
	const top = FRAME_TOP;
	const { w, h } = drawnSize;
	const sx = FRAME_X[sel] ?? 0;
	const pad = 3;
	return (
		<main className="t-canvas-dots relative min-w-0 flex-1 overflow-hidden">
			{canvasFrames.map((frame, i) => {
				const x = FRAME_X[i] ?? 0;
				const selected = "selected" in frame && frame.selected;
				const unseen = "unseen" in frame && frame.unseen;
				return (
					<div key={frame.name}>
						<div className="absolute flex h-4 items-center gap-2" style={{ left: x, top: top - 24, width: w }}>
							<span className={cn("t-mono", selected ? "text-(--t-text)" : "text-(--t-muted)")}>{frame.name}</span>
							{unseen ? <UnseenDot /> : null}
							{selected ? (
								<span className="t-micro ml-auto flex items-center gap-1.5 text-(--t-muted)">
									<Icon d={I.play} className="h-3 w-3" />
									play
								</span>
							) : null}
						</div>
						<div className="absolute overflow-hidden" style={{ left: x, top, width: w, height: h }}>
							<CoffeeScreen screen={frame.screen} />
						</div>
					</div>
				);
			})}

			{/* the thread on the canvas: flows, then the selection */}
			<svg className="pointer-events-none absolute inset-0" width="100%" height="100%" fill="none" aria-hidden="true">
				<FlowPath x1={FRAME_X[0]! + w + 4} y1={top + 228} x2={sx - pad - 4} y2={top + 252} certainty="will" />
				<FlowPath
					x1={sx + w + pad + 4}
					y1={top + 276}
					x2={FRAME_X[2]! - 4}
					y2={top + 252}
					certainty="might"
				/>
				<rect
					x={sx - pad}
					y={top - pad}
					width={w + pad * 2}
					height={h + pad * 2}
					stroke="var(--t-thread)"
					strokeWidth={THREAD}
				/>
				{[
					[sx - pad, top - pad],
					[sx + w + pad, top - pad],
					[sx - pad, top + h + pad],
					[sx + w + pad, top + h + pad],
				].map(([hx, hy]) => (
					<rect
						key={`${hx}-${hy}`}
						x={(hx ?? 0) - 3.5}
						y={(hy ?? 0) - 3.5}
						width="7"
						height="7"
						fill="var(--t-canvas)"
						stroke="var(--t-thread)"
						strokeWidth={THREAD}
					/>
				))}
				<path d={`M${sx + w / 2} ${top + h + pad}v12`} stroke="var(--t-thread)" strokeWidth={THREAD} />
			</svg>
			<span
				className="t-micro absolute text-center text-(--t-thread-ink)"
				style={{ left: sx, width: w, top: top + h + pad + 14 }}
			>
				{frameSize.w} × {frameSize.h}
			</span>

			<Toolbar />
		</main>
	);
}

function FlowPath({
	x1,
	y1,
	x2,
	y2,
	certainty,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	certainty: "will" | "might";
}) {
	const mid = (x1 + x2) / 2;
	return (
		<g>
			<circle cx={x1} cy={y1} r="2" fill="var(--t-thread)" />
			<path
				d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
				stroke="var(--t-thread)"
				strokeWidth={THREAD}
				strokeDasharray={certainty === "might" ? "4 3" : undefined}
				strokeLinecap="round"
			/>
			<path
				d={`M${x2 - 5} ${y2 - 4}L${x2} ${y2}L${x2 - 5} ${y2 + 4}`}
				stroke="var(--t-thread)"
				strokeWidth={THREAD}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</g>
	);
}

function Toolbar({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[6px] border border-(--t-line) bg-(--t-float) p-1",
				className,
			)}
		>
			<IconButton d={I.pointer} active />
			<IconButton d={I.marquee} />
			<IconButton d={I.hand} />
		</div>
	);
}

/* ---------- properties ---------- */

function Properties() {
	const inFlow = flows.find((f) => f.to === selection.name);
	const outFlow = flows.find((f) => f.from === selection.name);
	return (
		<aside className="flex w-64 shrink-0 flex-col border-l border-(--t-line) px-4">
			<div className="flex h-12 items-center gap-2">
				<Knot className="-ml-px" />
				<span className="t-title text-(--t-text)">{selection.name}</span>
				<span className="ml-auto -mr-1.5 flex items-center">
					<IconButton d={I.play} />
					<IconButton d={I.dots} />
				</span>
			</div>

			<SectionLabel>frame</SectionLabel>
			<PropRow label="name">
				<Field value={selection.name} focused className="flex-1" />
			</PropRow>
			<div className="mt-3">
				<SectionLabel>path</SectionLabel>
			</div>
			<div className="flex items-center" style={{ height: ROW }}>
				<span className="t-mono whitespace-nowrap text-(--t-muted)">{selection.path}</span>
			</div>

			<div className="mt-3">
				<SectionLabel right={<span className="t-micro text-(--t-faint)">frame.json</span>}>position</SectionLabel>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<Field prefix="x" value={String(selection.x)} />
				<Field prefix="y" value={String(selection.y)} />
			</div>
			<div className="mt-3">
				<SectionLabel>size</SectionLabel>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<Field prefix="w" value={String(selection.w)} />
				<Field prefix="h" value={String(selection.h)} />
			</div>

			<div className="mt-3">
				<SectionLabel right={<span className="t-micro text-(--t-faint)">{selection.flowsIn + selection.flowsOut}</span>}>
					flows
				</SectionLabel>
			</div>
			{inFlow ? (
				<PropRow label="in">
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<FlowGlyph certainty={inFlow.certainty} tone="thread" />
						<span className="t-mono text-(--t-text)">{inFlow.from}</span>
						<span className="t-micro ml-auto text-(--t-faint)">{inFlow.certainty}</span>
					</span>
				</PropRow>
			) : null}
			{outFlow ? (
				<PropRow label="out">
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<FlowGlyph certainty={outFlow.certainty} tone="thread" />
						<span className="t-mono text-(--t-text)">{outFlow.to}</span>
						<span className="t-micro ml-auto text-(--t-faint)">{outFlow.certainty}</span>
					</span>
				</PropRow>
			) : null}

			<div className="mt-3">
				<SectionLabel>scenario</SectionLabel>
			</div>
			<Field value={selection.scenario} trailing={<Icon d={I.chevron} className="h-3.5 w-3.5 text-(--t-muted)" />} />

		</aside>
	);
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-3" style={{ height: ROW }}>
			<span className="t-body w-10 shrink-0 text-(--t-muted)">{label}</span>
			{children}
		</div>
	);
}

/* ---------- parts ---------- */

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px] overflow-hidden">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}

const PALETTE: Record<Appearance, [string, string][]> = {
	dark: [
		["chrome", "#131312"],
		["canvas", "#0d0d0c"],
		["float", "#1b1b1a"],
		["line", "#252523"],
		["guide", "#3a3936"],
		["text", "#ebe9e5"],
		["muted", "#8f8c87"],
		["faint", "#6c6a66"],
		["thread", "#f5391a"],
		["teammate", "#3b82f6"],
	],
	light: [
		["chrome", "#f6f5f2"],
		["canvas", "#eae9e5"],
		["float", "#fdfcfa"],
		["line", "#e2e0db"],
		["guide", "#c9c6c0"],
		["text", "#1c1b19"],
		["muted", "#66635e"],
		["faint", "#8a8781"],
		["thread", "#f5391a"],
		["teammate", "#2f6fe0"],
	],
};

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col", className)}>
			<div className="t-micro mb-2 flex h-4 items-center gap-2 text-(--t-faint)">
				<span>{label}</span>
				<span className="h-px flex-1 bg-(--t-line)" />
			</div>
			{children}
		</section>
	);
}

function Note({ children }: { children: ReactNode }) {
	return <span className="t-micro text-(--t-faint)">{children}</span>;
}

function Board({ appearance }: { appearance: Appearance }) {
	const rows = flatten();
	const app = rows.find((r) => r.name === "app");
	const menu = rows.find((r) => r.name === "menu");
	const cart = rows.find((r) => r.name === "cart");
	const receipt = rows.find((r) => r.name === "receipt");
	return (
		<div
			className={cn(
				"id-thread flex h-full w-[720px] flex-col bg-(--t-chrome) px-6 pt-5",
				appearance === "dark" ? "border-r border-(--t-line)" : null,
			)}
			data-appearance={appearance}
		>
			<header className="mb-5 flex h-7 items-center gap-3">
				<SpoolMark className="h-5 w-4 text-(--t-thread)" />
				<span className="t-title">thread</span>
				<span className="t-micro text-(--t-faint)">{appearance}</span>
				<span className="t-micro ml-auto text-(--t-faint)">4px grid · radius 6 · row 28 · thread 1.5</span>
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-3 gap-6">
				{/* column 1: controls */}
				<div className="flex flex-col gap-5">
					<Spec label="buttons">
						<div className="flex flex-wrap items-center gap-2">
							<Button kind="primary" icon={I.play}>
								Play
							</Button>
							<Button kind="secondary" icon={I.share}>
								Share
							</Button>
							<Button kind="ghost">Cancel</Button>
							<Button kind="secondary" icon={I.plus} />
						</div>
						<div className="mt-2 flex items-center gap-2">
							<Button kind="danger">Move to Trash</Button>
							<IconButton d={I.pointer} active />
						</div>
						<div className="mt-1.5 flex gap-2">
							<Note>primary · secondary · ghost · icon · danger</Note>
						</div>
					</Spec>

					<Spec label="fields">
						<div className="flex flex-col gap-1">
							<Field prefix="x" value="325" />
							<Field value="cart" focused />
							<Field icon={I.search} placeholder="Find a frame" trailing={<Kbd>{commandHint}</Kbd>} />
						</div>
						<div className="mt-1.5">
							<Note>rest · focus · search</Note>
						</div>
					</Spec>

					<Spec label="segmented">
						<Segmented items={["Dark", "Light", "System"]} active={appearance === "dark" ? "Dark" : "Light"} />
					</Spec>

					<Spec label="toggle">
						<div className="flex items-center gap-4">
							<span className="flex items-center gap-2">
								<Toggle on={false} />
								<Note>off</Note>
							</span>
							<span className="flex items-center gap-2">
								<Toggle on />
								<Note>on</Note>
							</span>
						</div>
					</Spec>

					<Spec label="tabs">
						<div className="relative flex h-10 items-stretch border-b border-(--t-line)">
							<Tab name="Home" icon={I.home} />
							<Tab name="kaffe" active />
							<Tab name="tvärsö" />
						</div>
					</Spec>

					<Spec label="chips">
						<div className="flex items-center gap-2">
							<Chip>3</Chip>
							<Chip dot="thread">live</Chip>
							<Chip dot="neutral">unseen</Chip>
						</div>
					</Spec>

					<Spec label="toolbar">
						<div className="relative h-9">
							<Toolbar className="bottom-0 left-0 translate-x-0" />
						</div>
					</Spec>
				</div>

				{/* column 2: rows and floats */}
				<div className="flex flex-col gap-5">
					<Spec label="sidebar row">
						<div className="flex flex-col">
							{menu ? <StateRow row={menu} note="rest" /> : null}
							{menu ? <StateRow row={menu} note="hover" hover /> : null}
							{cart ? <StateRow row={cart} note="selected" /> : null}
							{receipt ? <StateRow row={receipt} note="unseen" /> : null}
							{app ? <StateRow row={{ ...app, current: true }} note="open" page /> : null}
						</div>
					</Spec>

					<Spec label="property row">
						<PropRow label="name">
							<Field value={selection.name} className="flex-1" />
						</PropRow>
						<PropRow label="in">
							<span className="flex min-w-0 flex-1 items-center gap-2">
								<FlowGlyph certainty="will" tone="thread" />
								<span className="t-mono">menu</span>
								<span className="t-micro ml-auto text-(--t-faint)">will</span>
							</span>
						</PropRow>
					</Spec>

					<Spec label="context menu">
						<div className="w-[200px] rounded-[6px] border border-(--t-line) bg-(--t-float) p-1">
							{menuItems.map((item, i) => (
								<div key={item.label}>
									{item.danger ? <div className="mx-2 my-1 h-px bg-(--t-line)" /> : null}
									<div
										className={cn(
											"t-body flex h-7 items-center justify-between rounded-[6px] px-2",
											i === 1 ? "bg-(--t-hover) text-(--t-text)" : null,
											item.danger ? "text-(--t-thread-ink)" : "text-(--t-text)",
										)}
									>
										<span>{item.label}</span>
										{item.key ? <Kbd>{item.key}</Kbd> : null}
									</div>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="toast">
						<div className="relative flex h-10 w-full items-center gap-2 overflow-hidden rounded-[6px] border border-(--t-line) bg-(--t-float) pr-1 pl-3">
							<span className="t-body min-w-0 flex-1 truncate">
								<span className="t-mono">{toast.text.split(" ")[0]}</span>{" "}
								{toast.text.split(" ").slice(1).join(" ")}
							</span>
							<Button kind="ghost" className="text-(--t-text)">
								{toast.action}
							</Button>
							<span className="absolute bottom-0 left-0 h-[1.5px] w-[62%] bg-(--t-thread)" />
						</div>
						<div className="mt-1.5">
							<Note>the thread runs out with the undo window</Note>
						</div>
					</Spec>

					<div className="flex gap-6">
						<Spec label="tooltip">
							<span className="t-body inline-flex h-7 items-center gap-2 self-start whitespace-nowrap rounded-[6px] bg-(--t-inverse) px-2.5 text-(--t-on-inverse)">
								Play from cart
								<span className="t-micro opacity-60">P</span>
							</span>
						</Spec>
						<Spec label="avatar">
							<div className="flex h-7 items-center gap-2">
								<Avatar size={16} />
								<Avatar size={20} />
								<Avatar size={24} />
							</div>
						</Spec>
					</div>
				</div>

				{/* column 3: type, colour, the thread's rules */}
				<div className="flex flex-col gap-5">
					<Spec label="type">
						<div className="flex flex-col gap-2">
							<TypeRow role="display" spec="sans 20/28 500">
								<span className="t-display">kaffe</span>
							</TypeRow>
							<TypeRow role="title" spec="sans 15/20 500">
								<span className="t-title">cart</span>
							</TypeRow>
							<TypeRow role="body" spec="sans 13/20 400">
								<span className="t-body">Play from cart</span>
							</TypeRow>
							<TypeRow role="mono" spec="mono 12/16">
								<span className="t-mono">frames/app/cart</span>
							</TypeRow>
							<TypeRow role="micro" spec="mono 11/16">
								<span className="t-micro text-(--t-muted)">7 frames · saved</span>
							</TypeRow>
						</div>
					</Spec>

					<Spec label="palette">
						<div className="grid grid-cols-2 gap-x-3 gap-y-2">
							{PALETTE[appearance].map(([name, hex]) => (
								<div key={name} className="flex items-center gap-2">
									<span
										className="h-6 w-6 shrink-0 rounded-[6px] border border-(--t-line)"
										style={{ background: hex }}
									/>
									<span className="flex flex-col">
										<span className="t-micro text-(--t-text)">{name}</span>
										<span className="t-micro text-(--t-faint)">{hex}</span>
									</span>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="the thread">
						<ThreadRules />
					</Spec>
				</div>
			</div>
		</div>
	);
}

function TypeRow({ role, spec, children }: { role: string; spec: string; children: ReactNode }) {
	return (
		<div className="flex flex-col border-b border-(--t-line) pb-2">
			<span className="whitespace-nowrap">{children}</span>
			<span className="t-micro flex justify-between text-(--t-faint)">
				<span>{role}</span>
				<span>{spec}</span>
			</span>
		</div>
	);
}

/** a single row with its own stretch of thread, as the tree draws it */
function StateRow({ row, note, hover, page }: { row: TreeRow; note: string; hover?: boolean; page?: boolean }) {
	const lit = row.selected;
	const x = page ? SPINE_0 : SPINE_1;
	const y = ROW / 2;
	const entry = page
		? `M${x} 0V${y - R}Q${x} ${y} ${x + R} ${y}H${SPINE_1 - R}Q${SPINE_1} ${y} ${SPINE_1} ${y + R}V${ROW}`
		: `M${x} 0V${y - R}Q${x} ${y} ${x + R} ${y}H${lit ? 49 : 50}`;
	const tone = lit || page ? "var(--t-thread)" : "var(--t-guide)";
	return (
		<div className="flex items-center">
			<div className="relative w-[160px] shrink-0">
				<svg className="pointer-events-none absolute inset-0 z-10" width="160" height={ROW} fill="none" aria-hidden="true">
					<path d={entry} stroke={tone} strokeWidth={lit || page ? THREAD : 1} strokeLinecap="round" />
					{lit ? <circle cx="52" cy={y} r="2" fill="var(--t-thread)" /> : null}
				</svg>
				<SidebarRow row={row} hover={hover} />
			</div>
			<span className="ml-auto">
				<Note>{note}</Note>
			</span>
		</div>
	);
}

function ThreadRules() {
	const t = "var(--t-thread)";
	const g = "var(--t-guide)";
	return (
		<div className="flex flex-col gap-1">
			<RuleRow note="lands: knot r2">
				<path d="M4 14h40" stroke={t} strokeWidth={THREAD} strokeLinecap="round" />
				<circle cx="48" cy="14" r="2" fill={t} />
			</RuleRow>
			<RuleRow note="goes on: will">
				<circle cx="4" cy="14" r="2" fill={t} />
				<path d="M6 14h42" stroke={t} strokeWidth={THREAD} />
				<path d="m44 10 4 4-4 4" stroke={t} strokeWidth={THREAD} strokeLinecap="round" strokeLinejoin="round" />
			</RuleRow>
			<RuleRow note="goes on: might">
				<circle cx="4" cy="14" r="2" fill={t} />
				<path d="M6 14h42" stroke={t} strokeWidth={THREAD} strokeDasharray="4 3" />
				<path d="m44 10 4 4-4 4" stroke={t} strokeWidth={THREAD} strokeLinecap="round" strokeLinejoin="round" />
			</RuleRow>
			<RuleRow note="turns: radius 6">
				<path d="M4 2v6q0 6 6 6h38" stroke={t} strokeWidth={THREAD} strokeLinecap="round" />
			</RuleRow>
			<RuleRow note="structure: guide 1px">
				<path d="M4 2v6q0 6 6 6h38" stroke={g} strokeWidth="1" />
			</RuleRow>
			<div className="mt-2 flex flex-col gap-1">
				<span className="t-body text-(--t-muted)">
					Red is only ever this line. Fills are neutral and mean hover or the primary action.
				</span>
			</div>
		</div>
	);
}

function RuleRow({ note, children }: { note: string; children: ReactNode }) {
	return (
		<div className="flex h-7 items-center gap-3">
			<svg viewBox="0 0 52 28" className="h-7 w-[52px] shrink-0" fill="none" aria-hidden="true">
				{children}
			</svg>
			<Note>{note}</Note>
		</div>
	);
}
