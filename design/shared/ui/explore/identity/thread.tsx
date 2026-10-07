import "./thread.css";
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

/**
 * thread: the chrome is quiet warm greyscale and every active state is the same red line,
 * 1.5px. It underlines the active tab, tool and toggle, stands on the leading edge of the
 * active item in a vertical list, runs down the pages tree from the current page into the
 * selected frame, outlines the selection, carries the flows, and underlines a focused field.
 * Fills stay neutral and mean hover or the primary action. The one red fill is a chip that
 * labels a red outline (the size chip, the kind tag).
 */

const THREAD = 1.5;

/* ---------- icons: one line language, 16px box, 1.25 stroke ---------- */

const ring = (cx: number, cy: number, r: number) =>
	`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const I = {
	home: "M2.75 7 8 2.75 13.25 7v6.25h-3.5V9.75h-3.5v3.5h-3.5z",
	plus: "M8 3.5v9M3.5 8h9",
	close: "m4.75 4.75 6.5 6.5M11.25 4.75l-6.5 6.5",
	left: "m9.5 4-4 4 4 4",
	right: "m6.5 4 4 4-4 4",
	down: "m4.5 6.25 3.5 3.5 3.5-3.5",
	folder: "M2.25 4.25h4l1.25 1.5h6.25v6.5H2.25z",
	file: "M4 2.25h5l3 3v8.5H4zM9 2.25v3h3",
	flows: `${ring(4.5, 4.5, 1.75)}${ring(11.5, 11.5, 1.75)}M5.85 5.85l4.3 4.3`,
	select: "M3.5 2.75 12.75 7l-4 1.5-1.75 4.25z",
	edit: "M2.75 5.5V2.75H5.5M10.5 2.75h2.75V5.5M2.75 10.5v2.75H5.5M8.25 8.25l5 2-2.25.75-.75 2.25z",
	hand: "M5.25 8.5V4.25a1 1 0 0 1 2 0V7.5M7.25 7V3a1 1 0 0 1 2 0v4M9.25 7V4a1 1 0 0 1 2 0v4.75M11.25 6.5a1 1 0 0 1 2 0V9a4.5 4.5 0 0 1-4.5 4.5h-.5a4 4 0 0 1-3.2-1.6L3 9.25a1 1 0 0 1 1.6-1.2l.65.8",
	properties: `M5.25 2.75v2.5M5.25 8.75v4.5M10.75 2.75v5.5M10.75 11.75v1.5${ring(5.25, 7, 1.75)}${ring(10.75, 10, 1.75)}`,
	agent: `M7 5h6.25M7 11h4.25${ring(3.75, 5, 1)}${ring(3.75, 11, 1)}`,
	help: "M6 6.25a2 2 0 1 1 2.75 1.85c-.45.2-.75.6-.75 1.1v.55M8 11.75v.01",
	cog: `M13.23 6.66 14.93 7.01v1.98l-1.7.35-.58 1.41.95 1.45-1.4 1.4-1.45-.95-1.41.58-.35 1.7H7.01l-.35-1.7-1.41-.58-1.45.95-1.4-1.4.95-1.45-.58-1.41-1.7-.35V7.01l1.7-.35.58-1.41-.95-1.45 1.4-1.4 1.45.95 1.41-.58.35-1.7h1.98l.35 1.7 1.41.58 1.45-.95 1.4 1.4-.95 1.45.58 1.41Z${ring(8, 8, 2)}`,
	dots: "M3.5 8h.01M8 8h.01M12.5 8h.01",
	search: `${ring(7, 7, 4.25)}M10.25 10.25l3.25 3.25`,
	grid: "M2.75 2.75h4.25v4.25H2.75zM9 2.75h4.25v4.25H9zM2.75 9h4.25v4.25H2.75zM9 9h4.25v4.25H9z",
} as const;

function Icon({ d, className }: { d: string; className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("h-4 w-4 shrink-0", className)} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function PlayGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 8 8" className={cn("h-2 w-2 shrink-0", className)} aria-hidden="true">
			<path d="M2 1.25v5.5L6.75 4z" fill="currentColor" />
		</svg>
	);
}

/* ---------- the thread's marks ---------- */

/** chosen, in a horizontal set: the thread under it */
function Under({ className }: { className?: string }) {
	return <span className={cn("pointer-events-none absolute h-[1.5px] rounded-full bg-(--t-thread)", className)} />;
}

/** chosen, in a vertical list: the thread on the pane's leading edge */
function Edge({ className }: { className?: string }) {
	return (
		<span
			className={cn("pointer-events-none absolute top-1/2 left-0 h-4 w-[1.5px] -translate-y-1/2 bg-(--t-thread)", className)}
		/>
	);
}

/** the selection chip's tick: a stub of thread */
function Tick() {
	return <span className="block h-2.5 w-[1.5px] shrink-0 rounded-full bg-(--t-thread)" />;
}

function UnseenDot() {
	return <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-(--t-text)" />;
}

/* ---------- primitives ---------- */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind = "secondary", children, className }: { kind?: ButtonKind; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"t-body inline-flex h-7 shrink-0 items-center rounded-[6px] px-3 font-medium whitespace-nowrap",
				kind === "primary" && "bg-(--t-inverse) text-(--t-on-inverse)",
				kind === "secondary" && "border border-(--t-guide) text-(--t-text)",
				kind === "ghost" && "text-(--t-muted)",
				kind === "danger" && "border border-(--t-guide) text-(--t-thread-ink)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function IconButton({
	d,
	active,
	hover,
	bordered,
	size = 28,
	className,
}: {
	d: string;
	active?: boolean;
	hover?: boolean;
	bordered?: boolean;
	size?: 24 | 28;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center rounded-[6px]",
				size === 28 ? "h-7 w-7" : "h-6 w-6",
				active ? "text-(--t-text)" : "text-(--t-muted)",
				hover && "bg-(--t-hover) text-(--t-text)",
				bordered && "border border-(--t-guide)",
				className,
			)}
		>
			<Icon d={d} />
			{active ? <Under className="bottom-0.5 left-1/2 w-3 -translate-x-1/2" /> : null}
		</span>
	);
}

/** a field is a quiet fill; focused, the thread runs along its bottom edge */
function Field({
	value,
	placeholder,
	focused,
	icon,
	trailing,
	mono,
	className,
}: {
	value?: string;
	placeholder?: string;
	focused?: boolean;
	icon?: string;
	trailing?: ReactNode;
	mono?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"relative flex h-7 min-w-0 items-center gap-2 rounded-[6px] bg-(--t-hover) px-2",
				className,
			)}
		>
			{icon ? <Icon d={icon} className="text-(--t-faint)" /> : null}
			{value ? (
				<span className={cn(mono ? "t-mono" : "t-body", "min-w-0 flex-1 truncate text-(--t-text)")}>
					{value}
					{focused ? <span className="ml-px inline-block h-3.5 w-px translate-y-[2px] bg-(--t-text)" /> : null}
				</span>
			) : (
				<span className="t-body min-w-0 flex-1 truncate text-(--t-faint)">{placeholder}</span>
			)}
			{trailing}
			{focused ? <Under className="bottom-0 left-1.5 right-1.5" /> : null}
		</span>
	);
}

function Key({ children }: { children: ReactNode }) {
	return <span className="t-key shrink-0 text-(--t-faint)">{children}</span>;
}

function Segmented({ items, active }: { items: string[]; active: string }) {
	return (
		<span className="inline-flex h-7 items-center self-start rounded-[6px] border border-(--t-guide) px-0.5">
			{items.map((item) => (
				<span
					key={item}
					className={cn(
						"t-body relative flex h-full items-center px-2.5 whitespace-nowrap",
						item === active ? "text-(--t-text)" : "text-(--t-muted)",
					)}
				>
					{item}
					{item === active ? <Under className="bottom-[3px] left-2.5 right-2.5" /> : null}
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
					on ? "right-[2.5px] bg-(--t-text)" : "left-[3px] bg-(--t-faint)",
				)}
			/>
		</span>
	);
}

/** the chip that labels a red outline: the one red fill */
function RedChip({ children }: { children: ReactNode }) {
	return (
		<span className="t-micro inline-flex h-5 items-center rounded-[4px] bg-(--t-thread-fill) px-1.5 whitespace-nowrap text-white">
			{children}
		</span>
	);
}

function SelectionChip() {
	return (
		<span className="t-micro inline-flex h-5 items-center gap-1.5 rounded-[4px] border border-(--t-guide) pr-1 pl-1.5 whitespace-nowrap text-(--t-text)">
			<Tick />
			{element.chip}
			<Icon d={I.close} className="h-3 w-3 text-(--t-faint)" />
		</span>
	);
}

/* ---------- the window ---------- */

type Panel = "properties" | "agent";

const RAIL_W = 240;
const ICON_RAIL_W = 44;
const PANEL_W: Record<Panel, number> = { properties: 264, agent: 360 };

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: Panel }) {
	const editing = panel === "agent";
	return (
		<div
			className="id-thread flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--t-chrome)"
			data-appearance={appearance}
		>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<PagesRail />
				<div className="relative min-w-0 flex-1 overflow-hidden">
					<Canvas editing={editing} panelW={PANEL_W[panel]} />
					<aside
						className="absolute inset-y-0 right-0 flex flex-col border-l border-(--t-line) bg-(--t-chrome)"
						style={{ width: PANEL_W[panel] }}
					>
						{panel === "properties" ? <PropertiesPanel /> : <AgentPanel />}
					</aside>
				</div>
				<IconRail panel={panel} />
			</div>
		</div>
	);
}

/* ---------- window top bar ---------- */

function TopBar({ home: onHome }: { home?: boolean }) {
	return (
		<header className="flex h-10 shrink-0 items-stretch border-b border-(--t-line) pr-3 pl-2">
			<WindowTab name="Home" icon={I.home} active={onHome} />
			<span className="mx-1 my-3 w-px bg-(--t-line)" />
			{tabs.map((tab) => (
				<WindowTab key={tab.name} name={tab.name} active={!onHome && tab.active} closable={!onHome && tab.active} />
			))}
			<span className="flex items-center pl-1">
				<IconButton d={I.plus} size={24} />
			</span>
			{onHome ? null : (
				<span className="ml-auto flex items-center gap-2">
					<IconButton d={I.flows} active />
					<span className="t-micro w-8 text-right text-(--t-muted)">{zoom}</span>
				</span>
			)}
		</header>
	);
}

function WindowTab({
	name,
	icon,
	active,
	closable,
}: {
	name: string;
	icon?: string;
	active?: boolean;
	closable?: boolean;
}) {
	return (
		<span
			className={cn(
				"t-body relative flex items-center gap-2 px-3",
				active ? "text-(--t-text)" : "text-(--t-muted)",
			)}
		>
			{icon ? <Icon d={icon} /> : null}
			<span>{name}</span>
			{closable ? <Icon d={I.close} className="h-3.5 w-3.5 text-(--t-faint)" /> : null}
			{active ? <Under className="-bottom-px left-3 right-3" /> : null}
		</span>
	);
}

/* ---------- pages rail: the tree is drawn in thread ---------- */

const TREE_PAD = 8;
const GUIDE_X = 32.5;
const cy = (i: number) => TREE_PAD + 14 + 28 * i;

interface TreeRow {
	kind: "page" | "frame";
	name: string;
	count?: number;
	open?: boolean;
	current?: boolean;
	selected?: boolean;
	unseen?: boolean;
	last?: boolean;
}

function flatten(): TreeRow[] {
	const rows: TreeRow[] = [];
	for (const page of pages) {
		rows.push({ kind: "page", name: page.name, count: page.count, open: page.open, current: page.current });
		if (page.open) {
			page.frames.forEach((frame, i) => {
				rows.push({
					kind: "frame",
					name: frame.name,
					selected: frame.selected && page.current,
					unseen: frame.unseen,
					last: i === page.frames.length - 1,
				});
			});
		}
	}
	return rows;
}

function treePaths(rows: TreeRow[]) {
	const guide: string[] = [];
	let thread = "";
	rows.forEach((row, i) => {
		if (row.kind !== "page" || !row.open) return;
		let j = i + 1;
		while (rows[j]?.kind === "frame") {
			const y = cy(j) + 0.5;
			const kid = rows[j];
			guide.push(`M${GUIDE_X} ${y - 6}Q${GUIDE_X} ${y} ${GUIDE_X + 6} ${y}H42`);
			if (kid?.last) guide.push(`M${GUIDE_X} ${cy(i) + 8}V${y - 6}`);
			if (kid?.selected && row.current) {
				thread = `M${GUIDE_X} ${cy(i) + 8}V${y - 6}Q${GUIDE_X} ${y} ${GUIDE_X + 6} ${y}H42`;
			}
			j++;
		}
	});
	return { guide, thread };
}

function PagesRail() {
	const rows = flatten();
	const { guide, thread } = treePaths(rows);
	const treeH = TREE_PAD * 2 + rows.length * 28;
	return (
		<aside className="flex shrink-0 flex-col border-r border-(--t-line)" style={{ width: RAIL_W }}>
			<PaneHeader>
				<span className="t-title text-(--t-text)">Pages</span>
				<span className="t-micro ml-2 text-(--t-faint)">{pages.length}</span>
				<span className="-mr-1 ml-auto flex items-center">
					<IconButton d={I.plus} size={24} />
					<IconButton d={I.close} size={24} />
					<IconButton d={I.left} size={24} />
				</span>
			</PaneHeader>
			<div className="relative" style={{ height: treeH, paddingTop: TREE_PAD }}>
				<svg className="pointer-events-none absolute inset-0" width={RAIL_W} height={treeH} fill="none" aria-hidden="true">
					{guide.map((d) => (
						<path key={d} d={d} stroke="var(--t-guide)" strokeWidth="1" />
					))}
					{thread ? <path d={thread} stroke="var(--t-thread)" strokeWidth={THREAD} strokeLinecap="round" /> : null}
				</svg>
				{rows.map((row) => (
					<RailRow key={`${row.kind}-${row.name}`} row={row} />
				))}
			</div>
			<div className="mt-auto flex h-8 items-center border-t border-(--t-line) px-3">
				<span className="t-micro text-(--t-faint)">{railHint}</span>
			</div>
		</aside>
	);
}

function PaneHeader({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex h-10 shrink-0 items-center border-b border-(--t-line) px-3", className)}>{children}</div>
	);
}

function RailRow({ row, hover, showCount }: { row: TreeRow; hover?: boolean; showCount?: boolean }) {
	const lit = row.selected || row.current;
	const page = row.kind === "page";
	const count = page && (showCount || !row.open) ? row.count : undefined;
	return (
		<div className="relative flex h-7 items-center pr-3">
			{hover ? <span className="absolute inset-y-0 right-1.5 left-1.5 rounded-[6px] bg-(--t-hover)" /> : null}
			{page ? (
				<>
					<span className="relative flex w-6 justify-end pr-0.5 text-(--t-faint)">
						<Icon d={row.open ? I.down : I.right} className="h-3 w-3" />
					</span>
					<span className={cn("relative ml-0.5", row.current ? "text-(--t-thread-ink)" : "text-(--t-muted)")}>
						<Icon d={I.folder} className="h-3.5 w-3.5" />
					</span>
				</>
			) : (
				<span className={cn("relative ml-[42px]", row.selected ? "text-(--t-thread-ink)" : "text-(--t-faint)")}>
					<Icon d={I.file} className="h-3.5 w-3.5" />
				</span>
			)}
			<span
				className={cn(
					"t-mono relative ml-2 min-w-0 flex-1 truncate",
					lit || hover ? "text-(--t-text)" : "text-(--t-muted)",
				)}
			>
				{row.name}
			</span>
			{row.unseen ? <UnseenDot /> : null}
			{count !== undefined ? <span className="t-micro relative text-(--t-faint)">{count}</span> : null}
		</div>
	);
}

/* ---------- canvas ---------- */

const FRAME_TOP = 144;
const FRAME_X = { cart: 40, menu: 328, receipt: 616 } as const;
const PAD = 3;

function Canvas({ editing, panelW }: { editing: boolean; panelW: number }) {
	const { w, h } = drawnSize;
	const top = FRAME_TOP;
	const cartX = FRAME_X.cart;
	const bottom = top + h;
	return (
		<main className="absolute inset-0 bg-(--t-canvas)">
			{canvasFrames.map((frame) => {
				const x = FRAME_X[frame.name];
				const selected = !editing && "selected" in frame && frame.selected;
				const unseen = "unseen" in frame && frame.unseen;
				const holds = editing && frame.name === element.frame;
				return (
					<div key={frame.name}>
						<div className="absolute flex h-4 items-center gap-2" style={{ left: x, top: top - 24, width: w }}>
							<span
								className={cn(
									"t-mono",
									selected ? "text-(--t-thread-ink)" : holds ? "text-(--t-text)" : "text-(--t-muted)",
								)}
							>
								{frame.name}
							</span>
							{unseen ? <UnseenDot /> : null}
							{selected ? (
								<span className="t-micro ml-auto flex items-center gap-1 text-(--t-muted)">
									<PlayGlyph />
									play
								</span>
							) : null}
						</div>
						<div className="absolute" style={{ left: x, top, width: w, height: h }}>
							<CoffeeScreen screen={frame.screen} />
						</div>
					</div>
				);
			})}

			<svg className="pointer-events-none absolute inset-0" width="100%" height="100%" fill="none" aria-hidden="true">
				{/* menu → cart (Checkout) */}
				<Flow x1={FRAME_X.menu - 4} y1={bottom - 30} x2={cartX + w + PAD + 4} y2={bottom - 112} />
				{/* receipt → menu, might */}
				<Flow x1={FRAME_X.receipt - 4} y1={top + 236} x2={FRAME_X.menu + w + 4} y2={top + 196} dashed />
				{/* cart → receipt (Pay), under menu */}
				<path
					d={`M${cartX + w - 32} ${bottom + PAD + 4}C${cartX + w - 32} ${bottom + 76} ${FRAME_X.receipt + 40} ${bottom + 76} ${FRAME_X.receipt + 40} ${bottom + 4}`}
					stroke="var(--t-thread)"
					strokeWidth={THREAD}
					strokeLinecap="round"
				/>
				<circle cx={cartX + w - 32} cy={bottom + PAD + 4} r="2" fill="var(--t-thread)" />
				<path
					d={`M${FRAME_X.receipt + 36} ${bottom + 9}L${FRAME_X.receipt + 40} ${bottom + 4}L${FRAME_X.receipt + 44} ${bottom + 9}`}
					stroke="var(--t-thread)"
					strokeWidth={THREAD}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>

				{editing ? null : (
					<g>
						<rect
							x={cartX - PAD}
							y={top - PAD}
							width={w + PAD * 2}
							height={h + PAD * 2}
							stroke="var(--t-thread)"
							strokeWidth={THREAD}
						/>
						{[
							[cartX - PAD, top - PAD],
							[cartX + w + PAD, top - PAD],
							[cartX - PAD, bottom + PAD],
							[cartX + w + PAD, bottom + PAD],
						].map(([hx = 0, hy = 0]) => (
							<rect
								key={`${hx}-${hy}`}
								x={hx - 3}
								y={hy - 3}
								width="6"
								height="6"
								fill="var(--t-canvas)"
								stroke="var(--t-thread)"
								strokeWidth={THREAD}
							/>
						))}
					</g>
				)}
			</svg>

			{editing ? (
				<div className="absolute" style={{ left: cartX, top, width: w, height: h }}>
					<span
						className="absolute rounded-[7px] border-[1.5px] border-(--t-thread)"
						style={{ left: 13, top: 45, width: 214, height: 34 }}
					/>
					<span className="absolute" style={{ right: 13, top: 25 }}>
						<RedChip>{element.kind}</RedChip>
					</span>
				</div>
			) : (
				<span className="absolute flex justify-center" style={{ left: cartX, width: w, top: bottom + PAD + 9 }}>
					<RedChip>
						{frameSize.w} × {frameSize.h}
					</RedChip>
				</span>
			)}

			<div className="absolute bottom-6 flex justify-center" style={{ left: 0, right: panelW }}>
				<Toolbar active={editing ? "edit" : "select"} />
			</div>
		</main>
	);
}

function Flow({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
	const mid = (x1 + x2) / 2;
	const dir = x2 < x1 ? 1 : -1;
	return (
		<g>
			<circle cx={x1} cy={y1} r="2" fill="var(--t-thread)" />
			<path
				d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
				stroke="var(--t-thread)"
				strokeWidth={THREAD}
				strokeDasharray={dashed ? "4 3" : undefined}
				strokeLinecap="round"
			/>
			<path
				d={`M${x2 + 5 * dir} ${y2 - 4}L${x2} ${y2}L${x2 + 5 * dir} ${y2 + 4}`}
				stroke="var(--t-thread)"
				strokeWidth={THREAD}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</g>
	);
}

const TOOL_ICON: Record<string, string> = { select: I.select, edit: I.edit, hand: I.hand };

function Toolbar({ active }: { active: string }) {
	return (
		<div className="flex items-center gap-1 rounded-[8px] border border-(--t-line) bg-(--t-float) p-1 shadow-(--t-shadow)">
			{tools.map((tool) => (
				<IconButton key={tool.name} d={TOOL_ICON[tool.name] ?? I.select} active={tool.name === active} />
			))}
		</div>
	);
}

/* ---------- right side ---------- */

function IconRail({ panel }: { panel: Panel }) {
	return (
		<nav
			className="flex shrink-0 flex-col items-center border-l border-(--t-line) py-2"
			style={{ width: ICON_RAIL_W }}
		>
			<RailIcon d={I.properties} active={panel === "properties"} />
			<RailIcon d={I.agent} active={panel === "agent"} />
			<span className="mt-auto" />
			<RailIcon d={I.help} />
			<RailIcon d={I.cog} />
		</nav>
	);
}

function RailIcon({ d, active }: { d: string; active?: boolean }) {
	return (
		<span className="relative flex h-8 w-full items-center justify-center">
			{active ? <Edge className="-left-px" /> : null}
			<span className={active ? "text-(--t-text)" : "text-(--t-muted)"}>
				<Icon d={d} />
			</span>
		</span>
	);
}

function PropertiesPanel() {
	return (
		<>
			<PaneHeader className="pr-2">
				<span className="t-title text-(--t-text)">{selection.name}</span>
				<span className="ml-auto flex items-center">
					<IconButton d={I.dots} size={24} />
					<IconButton d={I.right} size={24} />
				</span>
			</PaneHeader>
			<div className="flex flex-col py-2">
				<SectionRow name="position" source={selection.source} />
				<PropRow k="x" value={selection.x} />
				<PropRow k="y" value={selection.y} />
				<div className="mx-3 my-2 h-px bg-(--t-line)" />
				<SectionRow name="size" source={selection.source} />
				<PropRow k="w" value={selection.w} />
				<PropRow k="h" value={selection.h} />
			</div>
		</>
	);
}

function SectionRow({ name, source }: { name: string; source: string }) {
	return (
		<div className="flex h-7 items-center justify-between px-3">
			<span className="t-micro text-(--t-muted)">{name}</span>
			<span className="t-micro text-(--t-faint)">{source}</span>
		</div>
	);
}

function PropRow({ k, value, focused }: { k: string; value: number; focused?: boolean }) {
	return (
		<div className="flex h-7 items-center gap-2 px-3">
			<span className="t-micro w-4 shrink-0 text-(--t-faint)">{k}</span>
			<span
				className={cn(
					"relative flex h-6 flex-1 items-center rounded-[6px] bg-(--t-hover) px-2",
				)}
			>
				<span className="t-mono flex-1 text-(--t-text)">
					{value}
					{focused ? <span className="ml-px inline-block h-3.5 w-px translate-y-[2px] bg-(--t-text)" /> : null}
				</span>
				<span className="t-micro text-(--t-faint)">px</span>
				{focused ? <Under className="bottom-0 left-1.5 right-1.5" /> : null}
			</span>
		</div>
	);
}

function AgentPanel() {
	const turn = agent.turn;
	const edit = turn.edits[0];
	return (
		<>
			<PaneHeader className="pr-2">
				<span className="t-title text-(--t-text)">{agent.title}</span>
				<Icon d={I.down} className="ml-1 h-3.5 w-3.5 text-(--t-faint)" />
				<span className="ml-auto flex items-center">
					<IconButton d={I.plus} size={24} />
				</span>
			</PaneHeader>
			<div className="flex h-8 shrink-0 items-center border-b border-(--t-line) px-3">
				<span className="t-mono text-(--t-text)">{agent.model}</span>
				<Icon d={I.right} className="ml-0.5 h-3 w-3 text-(--t-faint)" />
				<span className="t-caption ml-auto text-(--t-faint)">{agent.scope}</span>
			</div>

			<div className="flex min-h-0 flex-1 flex-col justify-end gap-4 px-3 pb-4">
				<div className="ml-auto max-w-[272px] rounded-[8px] bg-(--t-hover) px-3 py-2">
					<p className="t-body text-(--t-text)">{turn.ask}</p>
				</div>
				<div className="flex flex-col gap-2">
					<span className="t-micro text-(--t-faint)">{agent.model}</span>
					<p className="t-body text-(--t-text)">{turn.said}</p>
					{edit ? (
						<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(--t-line) px-2">
							<Icon d={I.file} className="h-3.5 w-3.5 text-(--t-faint)" />
							<span className="t-mono min-w-0 flex-1 truncate text-(--t-muted)">{edit.path}</span>
							<span className="t-micro text-(--t-text)">+{edit.added}</span>
							<span className="t-micro text-(--t-faint)">−{edit.removed}</span>
						</div>
					) : null}
				</div>
			</div>

			<div className="shrink-0 px-3 pb-2">
				<div className="relative flex h-[104px] flex-col gap-2 rounded-[8px] border border-(--t-guide) bg-(--t-float) p-2">
					<span className="self-start">
						<SelectionChip />
					</span>
					<span className="t-body px-0.5 text-(--t-faint)">
						<span className="mr-px inline-block h-3.5 w-px translate-y-[2px] bg-(--t-text)" />
						{agent.placeholder}
					</span>
					<Under className="-bottom-px left-2 right-2" />
				</div>
				<div className="flex h-7 items-center px-0.5">
					<span className="t-caption text-(--t-muted)">{agent.account}</span>
					<span className="t-micro ml-auto flex items-center text-(--t-muted)">
						{agent.mode}
						<Icon d={I.right} className="ml-0.5 h-3 w-3 text-(--t-faint)" />
					</span>
				</div>
			</div>
		</>
	);
}

/* ---------- home ---------- */

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-thread flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--t-chrome)"
			data-appearance={appearance}
		>
			<TopBar home />
			<div className="flex min-h-0 flex-1">
				<nav className="flex shrink-0 flex-col border-r border-(--t-line) pb-2" style={{ width: RAIL_W }}>
					<div className="flex h-10 items-center gap-2.5 px-3">
						<SpoolMark className="h-5 w-4 shrink-0 text-(--t-thread)" />
						<span className="t-title text-(--t-text)">spool</span>
					</div>
					<div className="mt-2 flex flex-col">
						{home.nav.map((item) => (
							<NavRow key={item} icon={I.grid} label={item} active />
						))}
					</div>
					<div className="mt-auto">
						<NavRow icon={I.cog} label={home.foot} />
					</div>
				</nav>
				<main className="min-w-0 flex-1 bg-(--t-canvas) px-12 pt-8">
					<div className="flex h-8 items-center">
						<h1 className="t-display text-(--t-text)">{home.title}</h1>
						<span className="ml-auto flex items-center gap-2">
							<Field
								icon={I.search}
								placeholder={home.search}
								trailing={<Key>{home.searchKey}</Key>}
								className="w-56"
							/>
							<Button>{home.actions[0]}</Button>
							<Button>{home.actions[1]}</Button>
							<Button kind="primary">{home.actions[2]}</Button>
						</span>
					</div>
					<div className="mt-6 flex h-5 items-center">
						<span className="t-micro text-(--t-muted)">{home.count}</span>
						<span className="ml-auto flex items-center gap-1.5">
							<span className="t-caption text-(--t-faint)">Sort by</span>
							<span className="t-caption text-(--t-text)">{home.sort}</span>
							<Icon d={I.down} className="h-3 w-3 text-(--t-muted)" />
						</span>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-8">
						{projects.map((p) => (
							<div key={p.name} className="flex flex-col">
								<div className="h-[220px] overflow-hidden rounded-[8px] border border-(--t-line) bg-(--t-float)">
									<ProjectArtwork kind={p.art} className="h-full w-full" />
								</div>
								<div className="mt-3 flex h-5 items-baseline">
									<span className="t-title text-(--t-text)">{p.name}</span>
									<span className="t-micro ml-auto text-(--t-faint)">{p.frames} frames</span>
								</div>
								<span className="t-micro text-(--t-faint)">{p.when}</span>
							</div>
						))}
					</div>
				</main>
			</div>
		</div>
	);
}

function NavRow({ icon, label, active, hover }: { icon: string; label: string; active?: boolean; hover?: boolean }) {
	return (
		<div className="relative flex h-7 items-center px-2">
			{active ? <Edge /> : null}
			<span
				className={cn(
					"flex h-7 flex-1 items-center gap-2.5 rounded-[6px] px-1.5",
					active ? "text-(--t-text)" : "text-(--t-muted)",
					hover && "bg-(--t-hover)",
				)}
			>
				<Icon d={icon} />
				<span className="t-body">{label}</span>
			</span>
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

const PALETTE: Record<Appearance, [string, string, string][]> = {
	dark: [
		["chrome", "#131312", "bars, rails, panels"],
		["canvas", "#1a1a18", "the canvas, Home"],
		["float", "#1f1f1d", "what floats"],
		["line", "#282725", "pane edges"],
		["guide", "#3d3c39", "control edges, tree"],
		["text", "#edebe7", "titles, values"],
		["muted", "#9d9a95", "rest labels"],
		["faint", "#76736e", "hints, keys, units"],
		["thread", "#f5391a", "every active state"],
		["thread-ink", "#f5391a", "red words"],
	],
	light: [
		["chrome", "#f6f5f2", "bars, rails, panels"],
		["canvas", "#e9e8e4", "the canvas, Home"],
		["float", "#fdfcfa", "what floats"],
		["line", "#e1dfda", "pane edges"],
		["guide", "#c9c6c0", "control edges, tree"],
		["text", "#1c1b19", "titles, values"],
		["muted", "#62605b", "rest labels"],
		["faint", "#7c7973", "hints, keys, units"],
		["thread", "#f5391a", "every active state"],
		["thread-ink", "#cf2f12", "red words, chips"],
	],
};

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col", className)}>
			<div className="mb-2 flex h-4 items-center gap-2">
				<span className="t-micro text-(--t-faint)">{label}</span>
				<span className="h-px flex-1 bg-(--t-line)" />
			</div>
			{children}
		</section>
	);
}

function Note({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("t-micro text-(--t-faint)", className)}>{children}</span>;
}

function Board({ appearance }: { appearance: Appearance }) {
	const rows = flatten();
	const app = rows.find((r) => r.name === "app");
	const cart = rows.find((r) => r.name === "cart");
	const menu = rows.find((r) => r.name === "menu");
	const receipt = rows.find((r) => r.name === "receipt");
	return (
		<div
			className={cn(
				"id-thread flex h-full w-[720px] flex-col bg-(--t-chrome) px-6 pt-4",
				appearance === "dark" ? "border-r border-(--t-line)" : null,
			)}
			data-appearance={appearance}
		>
			<header className="mb-4 flex h-7 items-center gap-2.5">
				<SpoolMark className="h-5 w-4 text-(--t-thread)" />
				<span className="t-title">thread</span>
				<Note>{appearance}</Note>
				<Note className="ml-auto">4px grid · radius 4 6 8 · row 28 · thread 1.5</Note>
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-3 gap-6">
				<div className="flex flex-col gap-4">
					<Spec label="buttons · 28">
						<div className="flex flex-wrap items-center gap-2">
							<Button kind="primary">New project…</Button>
							<Button>Open…</Button>
							<Button kind="ghost">Cancel</Button>
						</div>
						<div className="mt-2 flex items-center gap-2">
							<IconButton d={I.plus} bordered />
							<IconButton d={I.select} active />
							<Button kind="danger">Move to Trash</Button>
						</div>
						<Note className="mt-1.5">primary · secondary · ghost · icon · danger</Note>
					</Spec>

					<Spec label="fields · 28">
						<div className="flex flex-col gap-2">
							<Field value="390" mono trailing={<Key>px</Key>} />
							<Field value="cart" mono focused />
							<Field icon={I.search} placeholder={home.search} trailing={<Key>{home.searchKey}</Key>} />
						</div>
						<Note className="mt-1.5">rest · focused · search</Note>
					</Spec>

					<Spec label="segmented · toggle">
						<Segmented items={["Ask", "Only this Mac"]} active="Ask" />
						<div className="mt-2 flex h-7 items-center gap-2">
							<Toggle on={false} />
							<Note>off</Note>
							<span className="ml-2" />
							<Toggle on />
							<Note>on</Note>
						</div>
					</Spec>

					<Spec label="tabs">
						<div className="flex h-10 items-stretch border-b border-(--t-line)">
							<WindowTab name="Home" icon={I.home} />
							<WindowTab name="kaffe" active closable />
						</div>
						<div className="mt-2 flex h-8 items-stretch gap-4 border-b border-(--t-line)">
							<PanelTab name="General" active />
							<PanelTab name="Appearance" />
						</div>
						<Note className="mt-1.5">window tab · panel tab</Note>
					</Spec>

					<Spec label="chips · 20">
						<div className="flex flex-wrap items-center gap-2">
							<span className="flex items-center gap-1.5">
								<span className="t-title">Pages</span>
								<span className="t-micro text-(--t-faint)">3</span>
							</span>
							<RedChip>
								{frameSize.w} × {frameSize.h}
							</RedChip>
							<RedChip>{element.kind}</RedChip>
						</div>
						<div className="mt-2">
							<SelectionChip />
						</div>
						<Note className="mt-1.5">count · size · kind · selection</Note>
					</Spec>
				</div>

				<div className="flex flex-col gap-4">
					<Spec label="pages rail row · 28">
						<div className="flex flex-col">
							{app ? <StateRow row={app} note="current" /> : null}
							{cart ? <StateRow row={cart} note="selected" first /> : null}
							{menu ? <StateRow row={{ ...menu, last: false }} note="rest" /> : null}
							{menu ? <StateRow row={{ ...menu, last: false }} note="hover" hover /> : null}
							{receipt ? <StateRow row={receipt} note="unseen" /> : null}
						</div>
					</Spec>

					<Spec label="property row · 28">
						<SectionRow name="position" source={selection.source} />
						<PropRow k="x" value={selection.x} />
						<PropRow k="y" value={selection.y} focused />
					</Spec>

					<Spec label="context menu">
						<div className="w-[200px] rounded-[8px] border border-(--t-line) bg-(--t-float) p-1 shadow-(--t-shadow)">
							{menuItems.map((item, i) => (
								<div key={item.label}>
									{item.danger ? <div className="mx-2 my-1 h-px bg-(--t-line)" /> : null}
									<div
										className={cn(
											"t-body flex h-7 items-center justify-between rounded-[6px] px-2",
											i === 1 && "bg-(--t-hover)",
											item.danger ? "text-(--t-thread-ink)" : "text-(--t-text)",
										)}
									>
										<span>{item.label}</span>
										<Key>{item.key}</Key>
									</div>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="toast · tooltip">
						<div className="relative flex h-10 items-center gap-2 overflow-hidden rounded-[8px] border border-(--t-line) bg-(--t-float) pr-1 pl-3 shadow-(--t-shadow)">
							<span className="t-body min-w-0 flex-1 truncate text-(--t-text)">
								<span className="t-mono">{toast.text.split(" ")[0]}</span> {toast.text.split(" ").slice(1).join(" ")}
							</span>
							<Button kind="ghost" className="text-(--t-text)">
								{toast.action}
							</Button>
							<span className="absolute bottom-0 left-0 h-[1.5px] w-[62%] bg-(--t-thread)" />
						</div>
						<Note className="mt-1.5">the thread runs out with the undo window</Note>
						<span className="t-body mt-3 inline-flex h-7 items-center gap-2 self-start rounded-[6px] bg-(--t-inverse) px-2.5 text-(--t-on-inverse) shadow-(--t-shadow)">
							Edit
							<span className="t-micro opacity-60">E</span>
						</span>
					</Spec>

					<Spec label="the thread · 1.5">
						<ThreadRules />
					</Spec>
				</div>

				<div className="flex flex-col gap-4">
					<Spec label="settings row">
						<div className="flex items-start gap-4 border-b border-(--t-line) pb-3">
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="t-body text-(--t-text)">{settingsRow.title}</span>
								<span className="t-caption text-(--t-muted)">{settingsRow.detail}</span>
							</span>
							<span className="pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>

					<Spec label="type">
						<div className="flex flex-col gap-1.5">
							<TypeRow role="display" spec="sans 24/32 500">
								<span className="t-display">Projects</span>
							</TypeRow>
							<TypeRow role="title" spec="sans 14/20 500">
								<span className="t-title">New chat</span>
							</TypeRow>
							<TypeRow role="body" spec="sans 13/20">
								<span className="t-body">Check for updates</span>
							</TypeRow>
							<TypeRow role="caption" spec="sans 12/16">
								<span className="t-caption text-(--t-muted)">For this new chat</span>
							</TypeRow>
							<TypeRow role="mono" spec="mono 12/16">
								<span className="t-mono">frames/app/cart</span>
							</TypeRow>
							<TypeRow role="micro" spec="mono 11/16">
								<span className="t-micro text-(--t-muted)">6 projects · 54%</span>
							</TypeRow>
						</div>
					</Spec>

					<Spec label="palette">
						<div className="flex flex-col">
							{PALETTE[appearance].map(([name, hex]) => (
								<div key={name} className="flex h-6 items-center gap-2">
									<span
										className="h-4 w-4 shrink-0 rounded-[4px] border border-(--t-line)"
										style={{ background: hex }}
									/>
									<span className="t-micro flex-1 text-(--t-text)">{name}</span>
									<span className="t-micro text-(--t-muted)">{hex}</span>
								</div>
							))}
						</div>
					</Spec>
				</div>
			</div>
		</div>
	);
}

function ThreadRules() {
	const t = "var(--t-thread)";
	const rule = (note: string, mark: ReactNode) => (
		<div key={note} className="flex h-6 items-center gap-3">
			<svg viewBox="0 0 48 24" className="h-6 w-12 shrink-0" fill="none" aria-hidden="true">
				{mark}
			</svg>
			<Note>{note}</Note>
		</div>
	);
	return (
		<div className="flex flex-col">
			{rule("chosen in a row", <path d="M12 16h24" stroke={t} strokeWidth={THREAD} strokeLinecap="round" />)}
			{rule("chosen in a list", <path d="M4 4v16" stroke={t} strokeWidth={THREAD} />)}
			{rule(
				"page into frame",
				<path d="M8 2v8q0 6 6 6h10" stroke={t} strokeWidth={THREAD} strokeLinecap="round" />,
			)}
			{rule(
				"flow · might dashed",
				<>
					<circle cx="4" cy="12" r="2" fill={t} />
					<path d="M6 12h36M37 8l5 4-5 4" stroke={t} strokeWidth={THREAD} strokeLinecap="round" strokeLinejoin="round" />
				</>,
			)}
			{rule("selection, offset 3", <rect x="6" y="4" width="36" height="16" stroke={t} strokeWidth={THREAD} />)}
		</div>
	);
}

function PanelTab({ name, active }: { name: string; active?: boolean }) {
	return (
		<span className={cn("t-body relative flex items-center", active ? "text-(--t-text)" : "text-(--t-muted)")}>
			{name}
			{active ? <Under className="-bottom-px inset-x-0" /> : null}
		</span>
	);
}

function TypeRow({ role, spec, children }: { role: string; spec: string; children: ReactNode }) {
	return (
		<div className="flex flex-col border-b border-(--t-line) pb-1.5">
			<span className="whitespace-nowrap">{children}</span>
			<span className="flex justify-between">
				<Note>{role}</Note>
				<Note>{spec}</Note>
			</span>
		</div>
	);
}

/** one rail row with its own stretch of tree, as the rail draws it */
function StateRow({ row, note, hover, first }: { row: TreeRow; note: string; hover?: boolean; first?: boolean }) {
	const page = row.kind === "page";
	const x = GUIDE_X;
	const lit = row.selected;
	const d = page ? `M${x} 22V28` : `M${x} ${first ? 0 : 0}V8Q${x} 14.5 ${x + 6} 14.5H42`;
	return (
		<div className="flex items-center">
			<div className="relative w-[148px] shrink-0">
				<svg className="pointer-events-none absolute inset-0" width="148" height="28" fill="none" aria-hidden="true">
					{page ? (
						row.current ? (
							<path d={d} stroke="var(--t-thread)" strokeWidth={THREAD} strokeLinecap="round" />
						) : null
					) : (
						<>
							{!row.last ? <path d={`M${x} 0V28`} stroke="var(--t-guide)" strokeWidth="1" /> : null}
							<path
								d={d}
								stroke={lit ? "var(--t-thread)" : "var(--t-guide)"}
								strokeWidth={lit ? THREAD : 1}
								strokeLinecap="round"
							/>
						</>
					)}
				</svg>
				<RailRow row={{ ...row, open: page ? true : row.open }} hover={hover} />
			</div>
			<Note className="ml-auto">{note}</Note>
		</div>
	);
}
