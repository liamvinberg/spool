import "./blueprint.css";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	type Appearance,
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
} from "shared/lib/explore/identity/world";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * blueprint: spool as a drafting sheet. Square corners, hairlines over fills,
 * condensed lettering for what a person says and mono for what the machine
 * prints. Red is redline: the selection and what it measures, what changed
 * unseen, and play. The current mode (tool, tab, segment) is an ink fill.
 */

/* ------------------------------------------------------------------ palette */

const palette = {
	dark: {
		ground: "#121315",
		sheet: "#17181a",
		raised: "#1e1f22",
		hover: "#25272b",
		rule: "#212326",
		line: "#2d3034",
		lineStrong: "#41454b",
		grid: "#1c1d20",
		gridMajor: "#232529",
		ink: "#e7e8e9",
		ink2: "#a2a6ab",
		ink3: "#787d84",
		thread: "#f5391a",
		threadInk: "#f5391a",
		wash: "#f5391a1a",
		onThread: "#ffffff",
		teammate: teammate.color,
	},
	light: {
		ground: "#eff1f2",
		sheet: "#f8f9f9",
		raised: "#ffffff",
		hover: "#e5e8ea",
		rule: "#e2e6e9",
		line: "#d2d7db",
		lineStrong: "#adb5bc",
		grid: "#eef1f3",
		gridMajor: "#dfe4e8",
		ink: "#14181c",
		ink2: "#4b545e",
		ink3: "#69727c",
		thread: "#f5391a",
		threadInk: "#cf2f10",
		wash: "#f5391a14",
		onThread: "#ffffff",
		teammate: teammate.color,
	},
} as const;

type Swatch = keyof (typeof palette)["dark"];

const swatchNames: Record<Swatch, string> = {
	ground: "ground",
	sheet: "sheet",
	raised: "raised",
	hover: "hover",
	rule: "rule",
	line: "line",
	lineStrong: "line-strong",
	grid: "grid",
	gridMajor: "grid-major",
	ink: "ink",
	ink2: "ink-2",
	ink3: "ink-3",
	thread: "thread",
	threadInk: "thread-ink",
	wash: "wash",
	onThread: "on-thread",
	teammate: "teammate",
};

function vars(appearance: Appearance): CSSProperties {
	const p = palette[appearance];
	const out: Record<string, string> = {};
	for (const key of Object.keys(p) as Swatch[]) out[`--bp-${swatchNames[key]}`] = p[key];
	return out as CSSProperties;
}

/* -------------------------------------------------------------------- icons */
/* One icon language: a 16 grid, 1.25 strokes, square caps, nothing rounded. */

function Icon({ d, className, fill }: { d: string; className?: string; fill?: boolean }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true">
			<path
				d={d}
				fill={fill ? "currentColor" : "none"}
				stroke={fill ? "none" : "currentColor"}
				strokeWidth="1.25"
				strokeLinecap="square"
				strokeLinejoin="miter"
			/>
		</svg>
	);
}

const glyph = {
	play: "M5 3.5 12.5 8 5 12.5Z",
	plus: "M8 3.5v9M3.5 8h9",
	close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
	check: "M3.5 8.5 6.5 11.5 12.5 4.5",
	chevronRight: "M6.5 4.5 10 8l-3.5 3.5",
	chevronDown: "M4.5 6.5 8 10l3.5-3.5",
	search: "M7 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7ZM9.75 9.75 12.5 12.5",
	home: "M3.5 7.5 8 3.5l4.5 4v5h-9Z M6.75 12.5v-3h2.5v3",
	select: "M4 3v9.5l2.75-2.5 1.75 3.75 1.5-.75L8.25 9.25H12Z",
	hand: "M5.5 8V4.25a1 1 0 0 1 2 0V7.5M7.5 7V3.25a1 1 0 0 1 2 0V7.5M9.5 7.5V4.5a1 1 0 0 1 2 0v5.25A3.75 3.75 0 0 1 7.75 13.5h-.5A3.5 3.5 0 0 1 4.6 12.3L2.8 10.2a1 1 0 0 1 1.45-1.35L5.5 10",
	cog: "M8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 1 0 0-4.5ZM8 2v1.75M8 12.25V14M2 8h1.75M12.25 8H14M3.75 3.75 5 5M11 11l1.25 1.25M3.75 12.25 5 11M11 5l1.25-1.25",
	minus: "M3.5 8h9",
};

function Marquee({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true">
			<rect
				x="3"
				y="3"
				width="10"
				height="10"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeDasharray="2 2"
			/>
		</svg>
	);
}

/** unseen: a revision delta, the drafter's mark for "this changed since you looked" */
function Delta({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={cn("size-2.5 shrink-0 text-(--bp-thread)", className)} aria-hidden="true">
			<path d="M5 1.25 9 8.75H1Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="miter" />
		</svg>
	);
}

/** a flow's line, as the legend and the panel draw it */
function FlowLine({ certainty, className }: { certainty: "will" | "might"; className?: string }) {
	return (
		<svg viewBox="0 0 24 8" className={cn("h-2 w-6 shrink-0", className)} aria-hidden="true">
			<path
				d="M1 4h17"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeDasharray={certainty === "might" ? "3 2" : undefined}
			/>
			<path d="M17 1.5 22 4l-5 2.5Z" fill="currentColor" />
		</svg>
	);
}

/** a dimension: extension lines, a line between arrowheads */
function Dimension({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 8" className={cn("h-2 w-6 shrink-0 text-(--bp-thread)", className)} aria-hidden="true">
			<path d="M1.5 0v8M22.5 0v8M2 4h20" fill="none" stroke="currentColor" strokeWidth="1" />
			<path d="M2 4l4-2v4ZM22 4l-4-2v4Z" fill="currentColor" />
		</svg>
	);
}

/* --------------------------------------------------------------- primitives */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({
	kind = "secondary",
	children,
	icon,
	className,
}: {
	kind?: ButtonKind;
	children?: ReactNode;
	icon?: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"bp-body-strong inline-flex h-7 shrink-0 items-center gap-1.5 border px-3",
				kind === "primary" && "border-(--bp-thread) bg-(--bp-thread) text-(--bp-on-thread)",
				kind === "secondary" && "border-(--bp-line-strong) bg-(--bp-raised) text-(--bp-ink)",
				kind === "ghost" && "border-transparent text-(--bp-ink-2)",
				kind === "danger" && "border-(--bp-thread) text-(--bp-thread-ink)",
				icon !== undefined && children !== undefined && "pl-2",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({ d, on, className }: { d: string; on?: boolean; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center border",
				on ? "border-(--bp-ink) bg-(--bp-ink) text-(--bp-ground)" : "border-(--bp-line-strong) text-(--bp-ink-2)",
				className,
			)}
		>
			<Icon d={d} />
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="bp-caption inline-flex h-4 items-center border border-(--bp-line) px-1 text-(--bp-ink-3)">
			{children}
		</span>
	);
}

function Avatar({ size = 20, ring }: { size?: 16 | 20 | 24; ring?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full bg-(--bp-teammate) text-white",
				ring && "outline-1 outline-offset-1 outline-(--bp-teammate)",
			)}
			style={{
				width: size,
				height: size,
				font: `500 ${size === 16 ? 8 : size === 20 ? 9 : 10}px/1 "Fragment Mono", monospace`,
			}}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function Chip({ kind, children }: { kind: "count" | "live" | "unseen"; children: ReactNode }) {
	return (
		<span
			className={cn(
				"bp-caption inline-flex h-4 shrink-0 items-center gap-1 border px-1",
				kind === "count" && "border-(--bp-line-strong) text-(--bp-ink-2)",
				kind === "live" && "border-(--bp-ink) bg-(--bp-ink) text-(--bp-ground)",
				kind === "unseen" && "border-(--bp-thread) text-(--bp-thread-ink)",
			)}
		>
			{kind === "live" ? <span className="size-1 bg-(--bp-thread)" /> : null}
			{kind === "unseen" ? <Delta className="size-2" /> : null}
			{children}
		</span>
	);
}

function SearchField({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex h-7 items-center gap-2 border border-(--bp-line-strong) bg-(--bp-raised) pr-1.5 pl-2 text-(--bp-ink-3)",
				className,
			)}
		>
			<Icon d={glyph.search} className="size-3.5" />
			<span className="bp-body flex-1 text-(--bp-ink-3)">Find a frame</span>
			<Kbd>{commandHint}</Kbd>
		</div>
	);
}

/* -------------------------------------------------------------- sheet index */

const letters = ["A", "B", "C", "D"];
const sheetNo = (page: number, frame: number) => `${letters[page]}-${String(frame + 1).padStart(2, "0")}`;

type RowState = "rest" | "hover" | "selected" | "unseen";

/** a frame row in the sheet index: number, name, marks. 28 tall, ruled. */
function FrameRow({ no, name, state }: { no: string; name: string; state: RowState }) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"relative flex h-7 items-center pr-3",
				state === "hover" && "bg-(--bp-hover)",
				selected && "bg-(--bp-wash)",
			)}
		>
			<span className="absolute right-0 bottom-0 left-6 h-px bg-(--bp-rule)" />
			{selected ? <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-(--bp-thread)" /> : null}
			<span
				className={cn(
					"bp-caption w-[60px] shrink-0 pl-6",
					selected ? "text-(--bp-thread-ink)" : "text-(--bp-ink-3)",
				)}
			>
				{no}
			</span>
			<span className={cn("bp-label min-w-0 flex-1 truncate", selected ? "text-(--bp-ink)" : "text-(--bp-ink-2)")}>
				{name}
			</span>
			{state === "unseen" ? <Delta /> : null}
			{selected ? <Icon d={glyph.play} fill className="size-3 text-(--bp-thread)" /> : null}
		</div>
	);
}

function PageRow({
	letter,
	name,
	count,
	open,
	current,
	presence,
}: {
	letter: string;
	name: string;
	count: number;
	open?: boolean;
	current?: boolean;
	presence?: boolean;
}) {
	return (
		<div className="relative flex h-7 items-center border-b border-(--bp-line) pr-3">
			<Icon
				d={open ? glyph.chevronDown : glyph.chevronRight}
				className="absolute top-1.5 left-1 size-4 text-(--bp-ink-3)"
			/>
			<span className="w-[60px] shrink-0 pl-6">
				<span
					className={cn(
						"bp-caption inline-flex size-4 items-center justify-center border",
						current
							? "border-(--bp-ink) bg-(--bp-ink) text-(--bp-ground)"
							: "border-(--bp-line-strong) text-(--bp-ink-2)",
					)}
				>
					{letter}
				</span>
			</span>
			<span className="bp-label flex-1 text-(--bp-ink)">{name}</span>
			{presence ? (
				<span className="mr-3 flex items-center gap-1.5">
					<Avatar size={16} />
				</span>
			) : null}
			<span className="bp-caption w-4 text-right text-(--bp-ink-3)">{count}</span>
		</div>
	);
}

function Sidebar() {
	return (
		<aside className="flex w-[240px] shrink-0 flex-col border-r border-(--bp-line) bg-(--bp-ground)">
			<div className="flex flex-col gap-1 border-b border-(--bp-line) px-3 pt-3 pb-3">
				<div className="flex items-center justify-between">
					<span className="bp-title">{project.name}</span>
					<span className="bp-caption flex items-center gap-1 text-(--bp-ink-3)">
						<Icon d={glyph.check} className="size-3" />
						{project.synced}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="bp-body text-(--bp-ink-2)">{project.team}</span>
					<span className="bp-caption text-(--bp-ink-3)">{project.frames} frames</span>
				</div>
			</div>
			<div className="border-b border-(--bp-line) p-3">
				<SearchField />
			</div>
			<div className="flex h-8 items-center justify-between pr-2 pl-3">
				<span className="bp-caption text-(--bp-ink-2)">pages</span>
				<span className="inline-flex size-6 items-center justify-center text-(--bp-ink-3)">
					<Icon d={glyph.plus} className="size-3.5" />
				</span>
			</div>
			<div className="bp-caption flex h-5 items-center border-y border-(--bp-line) pr-3 text-(--bp-ink-3)">
				<span className="w-[60px] pl-6">sheet</span>
				<span className="flex-1">name</span>
				<span>frames</span>
			</div>
			{pages.map((page, p) => (
				<div key={page.name}>
					<PageRow
						letter={letters[p] ?? ""}
						name={page.name}
						count={page.count}
						open={page.open}
						current={page.current}
						presence={page.presence}
					/>
					{page.open
						? page.frames.map((frame, f) => (
								<FrameRow
									key={frame.name}
									no={sheetNo(p, f)}
									name={frame.name}
									state={frame.selected ? "selected" : frame.unseen ? "unseen" : "rest"}
								/>
							))
						: null}
				</div>
			))}
			<div className="mt-4 flex h-8 items-center justify-between pr-3 pl-3">
				<span className="bp-caption text-(--bp-ink-2)">flows</span>
				<span className="bp-caption text-(--bp-ink-3)">{flows.length}</span>
			</div>
			<div className="border-t border-(--bp-line)">
				{flows.map((flow) => (
					<div key={`${flow.from}-${flow.to}`} className="relative flex h-7 items-center pr-3">
						<span className="absolute right-0 bottom-0 left-6 h-px bg-(--bp-rule)" />
						<span className="bp-caption w-[60px] shrink-0 pl-6 text-(--bp-ink-3)">
							F-{String(flows.indexOf(flow) + 1).padStart(2, "0")}
						</span>
						<span className="bp-label flex-1 text-(--bp-ink-2)">
							{flow.from} <span className="text-(--bp-ink-3)">→</span> {flow.to}
						</span>
						<span className="bp-caption text-(--bp-ink-3)">{flow.certainty}</span>
					</div>
				))}
			</div>
			<div className="flex-1" />
			<Legend />
		</aside>
	);
}

function Legend() {
	return (
		<div className="border-t border-(--bp-line) px-3 pt-2 pb-3">
			<div className="bp-caption mb-2 text-(--bp-ink-3)">legend</div>
			<div className="grid grid-cols-2 gap-y-1.5">
				<span className="bp-caption flex items-center gap-2 text-(--bp-ink-2)">
					<FlowLine certainty="will" className="text-(--bp-ink-2)" />
					will
				</span>
				<span className="bp-caption flex items-center gap-2 text-(--bp-ink-2)">
					<FlowLine certainty="might" className="text-(--bp-ink-2)" />
					might
				</span>
				<span className="bp-caption flex items-center gap-2 text-(--bp-ink-2)">
					<Dimension />
					selected
				</span>
				<span className="bp-caption flex items-center gap-2 text-(--bp-ink-2)">
					<span className="flex w-6 justify-center">
						<Delta />
					</span>
					unseen
				</span>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ top bar */

function TabCell({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<div
			className={cn(
				"relative flex h-10 items-center gap-2 border-r border-(--bp-line) px-3",
				active ? "bg-(--bp-sheet) text-(--bp-ink)" : "text-(--bp-ink-2)",
			)}
		>
			{active ? <span className="absolute top-0 right-0 left-0 h-0.5 bg-(--bp-ink)" /> : null}
			{active ? <span className="absolute right-0 -bottom-px left-0 h-px bg-(--bp-sheet)" /> : null}
			{home ? <Icon d={glyph.home} className="size-3.5" /> : null}
			<span className={home ? "bp-body" : "bp-label"}>{name}</span>
			{active ? <Icon d={glyph.close} className="ml-2 size-3 text-(--bp-ink-3)" /> : null}
		</div>
	);
}

function TopBar() {
	return (
		<header className="relative flex h-10 shrink-0 items-stretch border-b border-(--bp-line) bg-(--bp-ground)">
			<div className="flex w-10 items-center justify-center border-r border-(--bp-line)">
				<SpoolMark className="h-5 w-4 text-(--bp-thread)" />
			</div>
			<TabCell name="Home" home />
			{tabs.map((tab) => (
				<TabCell key={tab.name} name={tab.name} active={tab.active} />
			))}
			<div className="flex w-10 items-center justify-center text-(--bp-ink-3)">
				<Icon d={glyph.plus} className="size-3.5" />
			</div>
			<div className="flex-1" />
			<div className="flex items-center gap-2 pr-3">
				<div className="flex h-7 items-stretch border border-(--bp-line-strong)">
					<span className="flex w-6 items-center justify-center text-(--bp-ink-3)">
						<Icon d={glyph.minus} className="size-3" />
					</span>
					<span className="bp-label flex w-11 items-center justify-center border-x border-(--bp-line) text-(--bp-ink)">
						{zoom}
					</span>
					<span className="flex w-6 items-center justify-center text-(--bp-ink-3)">
						<Icon d={glyph.plus} className="size-3" />
					</span>
				</div>
				<span className="mx-1 h-4 w-px bg-(--bp-line)" />
				<Avatar size={24} />
				<Button kind="secondary">Share</Button>
				<Button kind="primary" icon={<Icon d={glyph.play} fill className="size-3" />}>
					Play
				</Button>
			</div>
		</header>
	);
}

/* ------------------------------------------------------------------- canvas */

const CANVAS = { w: 952, h: 860, ruler: 20 };
const K = 240 / frameSize.w; // screen px per canvas unit
const TOP = 140;
const LEFTS = [42, 366, 690] as const;
const FW = 240;
const FH = 520;
const cartLeft = LEFTS[1];
const ux = (u: number) => cartLeft + (u - selection.x) * K;
const uy = (v: number) => TOP + (v - selection.y) * K;

function range(from: number, to: number, step: number) {
	const out: number[] = [];
	for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
	return out;
}

function Grid() {
	const r = CANVAS.ruler;
	const xs = range(-300, 1400, 20).map((u) => ({ u, x: Math.round(ux(u)) + 0.5 })).filter((t) => t.x > r);
	const ys = range(-300, 1400, 20).map((v) => ({ v, y: Math.round(uy(v)) + 0.5 })).filter((t) => t.y > r);
	return (
		<svg className="absolute inset-0" width={CANVAS.w} height={CANVAS.h} aria-hidden="true">
			{xs.map(({ u, x }) => (
				<line
					key={`x${u}`}
					x1={x}
					x2={x}
					y1={r}
					y2={CANVAS.h}
					style={{ stroke: u % 100 === 0 ? "var(--bp-grid-major)" : "var(--bp-grid)" }}
				/>
			))}
			{ys.map(({ v, y }) => (
				<line
					key={`y${v}`}
					y1={y}
					y2={y}
					x1={r}
					x2={CANVAS.w}
					style={{ stroke: v % 100 === 0 ? "var(--bp-grid-major)" : "var(--bp-grid)" }}
				/>
			))}
		</svg>
	);
}

function Rulers() {
	const r = CANVAS.ruler;
	const xs = range(-300, 1400, 10).map((u) => ({ u, x: Math.round(ux(u)) + 0.5 })).filter((t) => t.x > r + 1);
	const ys = range(-300, 1400, 10).map((v) => ({ v, y: Math.round(uy(v)) + 0.5 })).filter((t) => t.y > r + 1);
	const tick = (n: number) => (n % 100 === 0 ? 9 : n % 50 === 0 ? 5 : 3);
	/* a figure gives way to the selection's own edge when they would touch */
	const clearX = (u: number) => [selection.x, selection.x + selection.w].every((e) => u > e || u < e - 34);
	const clearY = (v: number) => [selection.y, selection.y + selection.h].every((e) => v > e || v < e - 44);
	const selX = [ux(selection.x), ux(selection.x + selection.w)];
	const selY = [uy(selection.y), uy(selection.y + selection.h)];
	return (
		<svg className="absolute inset-0" width={CANVAS.w} height={CANVAS.h} aria-hidden="true">
			<rect x={0} y={0} width={CANVAS.w} height={r} style={{ fill: "var(--bp-ground)" }} />
			<rect x={0} y={0} width={r} height={CANVAS.h} style={{ fill: "var(--bp-ground)" }} />
			{/* the selection's extent, redlined on both rulers */}
			<rect
				x={selX[0]}
				y={r - 2}
				width={(selX[1] ?? 0) - (selX[0] ?? 0)}
				height={2}
				style={{ fill: "var(--bp-thread)" }}
			/>
			<rect
				x={r - 2}
				y={selY[0]}
				width={2}
				height={(selY[1] ?? 0) - (selY[0] ?? 0)}
				style={{ fill: "var(--bp-thread)" }}
			/>
			{xs.map(({ u, x }) => (
				<g key={`x${u}`}>
					<line x1={x} x2={x} y1={r} y2={r - tick(u)} style={{ stroke: "var(--bp-line-strong)" }} />
					{u % 100 === 0 && clearX(u) ? (
						<text
							x={x + 3}
							y={9}
							style={{ fill: "var(--bp-ink-3)", font: '400 9px "Fragment Mono", monospace' }}
						>
							{u}
						</text>
					) : null}
				</g>
			))}
			{ys.map(({ v, y }) => (
				<g key={`y${v}`}>
					<line y1={y} y2={y} x1={r} x2={r - tick(v)} style={{ stroke: "var(--bp-line-strong)" }} />
					{v % 100 === 0 && clearY(v) ? (
						<text
							transform={`translate(9 ${y + 3}) rotate(-90)`}
							textAnchor="end"
							style={{ fill: "var(--bp-ink-3)", font: '400 9px "Fragment Mono", monospace' }}
						>
							{v}
						</text>
					) : null}
				</g>
			))}
			{[selection.x, selection.x + selection.w].map((u) => (
				<line
					key={`sx${u}`}
					x1={Math.round(ux(u)) + 0.5}
					x2={Math.round(ux(u)) + 0.5}
					y1={0}
					y2={r}
					style={{ stroke: "var(--bp-thread)" }}
				/>
			))}
			{[selection.y, selection.y + selection.h].map((v) => (
				<line
					key={`sy${v}`}
					y1={Math.round(uy(v)) + 0.5}
					y2={Math.round(uy(v)) + 0.5}
					x1={0}
					x2={r}
					style={{ stroke: "var(--bp-thread)" }}
				/>
			))}
			<line x1={0} x2={CANVAS.w} y1={r - 0.5} y2={r - 0.5} style={{ stroke: "var(--bp-line)" }} />
			<line x1={r - 0.5} x2={r - 0.5} y1={0} y2={CANVAS.h} style={{ stroke: "var(--bp-line)" }} />
			<rect x={0} y={0} width={r - 1} height={r - 1} style={{ fill: "var(--bp-ground)" }} />
			<path
				d={`M${r / 2} 5v${r - 10}M5 ${r / 2}h${r - 10}`}
				style={{ stroke: "var(--bp-ink-3)" }}
				strokeWidth={1}
			/>
		</svg>
	);
}

/** arrowhead pointing in direction (dx, dy) with its tip at (x, y) */
function arrow(x: number, y: number, dx: number, dy: number, len = 7, half = 2.75) {
	const bx = x - dx * len;
	const by = y - dy * len;
	return `M${x} ${y}L${bx - dy * half} ${by + dx * half}L${bx + dy * half} ${by - dx * half}Z`;
}

/** the drawing's markup: selection, dimensions, flows, leaders */
function Markup() {
	const L = cartLeft;
	const R = cartLeft + FW;
	const T = TOP;
	const B = TOP + FH;
	const dimY = T - 18;
	const dimX = R + 22;
	const red = { stroke: "var(--bp-thread)" };
	const redFill = { fill: "var(--bp-thread)" };
	const ink = { stroke: "var(--bp-ink-2)" };
	const inkFill = { fill: "var(--bp-ink-2)" };
	const lane = B + 28;
	const flowPaths = flows.map((flow) => {
		const from = canvasFrames.findIndex((f) => f.name === flow.from);
		const to = canvasFrames.findIndex((f) => f.name === flow.to);
		const sx = (LEFTS[from] ?? 0) + FW - 40;
		const ex = (LEFTS[to] ?? 0) + 40;
		return { flow, sx, ex, mid: ((LEFTS[from] ?? 0) + FW + (LEFTS[to] ?? 0)) / 2 };
	});
	return (
		<svg className="pointer-events-none absolute inset-0" width={CANVAS.w} height={CANVAS.h} aria-hidden="true">
			{/* leaders from every callout to its frame */}
			{canvasFrames.map((frame, i) => {
				const x = (LEFTS[i] ?? 0) - 12 + 0.5;
				const style = frame.name === selection.name ? red : { stroke: "var(--bp-ink-3)" };
				return (
					<g key={frame.name}>
						<path d={`M${x} ${T - 38}V${T + 16.5}H${(LEFTS[i] ?? 0) - 1}`} fill="none" style={style} />
						<circle
							cx={LEFTS[i]}
							cy={T + 16.5}
							r={2.25}
							style={frame.name === selection.name ? redFill : { fill: "var(--bp-ink-3)" }}
						/>
					</g>
				);
			})}

			{/* every frame is drawn in object line; the selection is redlined over it */}
			{canvasFrames.map((frame, i) =>
				frame.name === selection.name ? null : (
					<rect
						key={frame.name}
						x={(LEFTS[i] ?? 0) - 0.5}
						y={T - 0.5}
						width={FW + 1}
						height={FH + 1}
						fill="none"
						style={{ stroke: "var(--bp-line-strong)" }}
					/>
				),
			)}
			{/* selection: a redline outline; the dimensions below say its size */}
			<rect x={L - 0.5} y={T - 0.5} width={FW + 1} height={FH + 1} fill="none" style={red} />

			{/* width: extension lines, a dimension line with arrowheads, the figure */}
			<path d={`M${L - 0.5} ${T - 5}V${T - 26}M${R + 0.5} ${T - 5}V${T - 26}`} style={red} />
			<path d={`M${L + 1} ${dimY + 0.5}H${R - 1}`} style={red} />
			<path d={arrow(L + 1, dimY + 0.5, -1, 0)} style={redFill} />
			<path d={arrow(R - 1, dimY + 0.5, 1, 0)} style={redFill} />
			<rect x={(L + R) / 2 - 16} y={dimY - 6} width={32} height={13} style={{ fill: "var(--bp-sheet)" }} />
			<text
				x={(L + R) / 2}
				y={dimY + 4.5}
				textAnchor="middle"
				style={{ fill: "var(--bp-thread-ink)", font: '400 11px "Fragment Mono", monospace' }}
			>
				{selection.w}
			</text>

			{/* height */}
			<path d={`M${R + 5} ${T - 0.5}H${R + 30}M${R + 5} ${B + 0.5}H${R + 30}`} style={red} />
			<path d={`M${dimX + 0.5} ${T + 1}V${B - 1}`} style={red} />
			<path d={arrow(dimX + 0.5, T + 1, 0, -1)} style={redFill} />
			<path d={arrow(dimX + 0.5, B - 1, 0, 1)} style={redFill} />
			<rect x={dimX - 6} y={(T + B) / 2 - 16} width={13} height={32} style={{ fill: "var(--bp-sheet)" }} />
			<text
				transform={`translate(${dimX + 4.5} ${(T + B) / 2}) rotate(-90)`}
				textAnchor="middle"
				style={{ fill: "var(--bp-thread-ink)", font: '400 11px "Fragment Mono", monospace' }}
			>
				{selection.h}
			</text>

			{/* flows run in a lane under the sheet: out of the action, into the next frame */}
			{flowPaths.map(({ flow, sx, ex, mid }) => (
				<g key={`${flow.from}-${flow.to}`}>
					<path
						d={`M${sx + 0.5} ${B + 3}V${lane + 0.5}H${ex + 0.5}V${B + 8}`}
						fill="none"
						strokeWidth={1.25}
						strokeDasharray={flow.certainty === "might" ? "4 3" : undefined}
						style={ink}
					/>
					<circle cx={sx + 0.5} cy={B + 3} r={2.25} style={inkFill} />
					<path d={arrow(ex + 0.5, B + 2, 0, -1)} style={inkFill} />
					<rect
						x={mid - 22}
						y={lane - 6}
						width={44}
						height={13}
						style={{ fill: "var(--bp-sheet)" }}
					/>
					<text
						x={mid}
						y={lane + 4}
						textAnchor="middle"
						style={{ fill: "var(--bp-ink-2)", font: '400 10px "Fragment Mono", monospace', letterSpacing: "0.04em" }}
					>
						{flow.certainty}
					</text>
				</g>
			))}
		</svg>
	);
}

function Callout({ index }: { index: number }) {
	const frame = canvasFrames[index];
	if (!frame) return null;
	const selected = "selected" in frame && frame.selected;
	const unseen = "unseen" in frame && frame.unseen;
	const left = (LEFTS[index] ?? 0) - 12;
	return (
		<div className="absolute flex items-end justify-between" style={{ left, top: TOP - 58, width: FW + 12, height: 20 }}>
			<span
				className={cn(
					"flex h-5 items-center gap-2 border-b pr-2",
					selected ? "border-(--bp-thread)" : "border-(--bp-ink-3)",
				)}
			>
				<span className={cn("bp-caption", selected ? "text-(--bp-thread-ink)" : "text-(--bp-ink-3)")}>
					{sheetNo(0, index)}
				</span>
				<span className="bp-label text-(--bp-ink)">{frame.name}</span>
				{unseen ? <Delta /> : null}
			</span>
			{selected ? (
				<span className="bp-caption flex h-5 items-center gap-1 border border-(--bp-thread) pr-1.5 pl-1 text-(--bp-thread-ink)">
					<Icon d={glyph.play} fill className="size-3" />
					play
				</span>
			) : null}
		</div>
	);
}

function TitleBlock() {
	const cell = (label: string, value: ReactNode, className?: string) => (
		<div className={cn("flex flex-col justify-center gap-0.5 px-2", className)}>
			<span className="bp-caption text-(--bp-ink-3)">{label}</span>
			<span className="bp-label text-(--bp-ink)">{value}</span>
		</div>
	);
	return (
		<div
			className="absolute grid border border-(--bp-line-strong) bg-(--bp-sheet)"
			style={{
				right: 16,
				bottom: 16,
				gridTemplateColumns: "48px 76px 76px 84px",
				gridTemplateRows: "36px 36px",
			}}
		>
			<div className="row-span-2 flex items-center justify-center border-r border-(--bp-line-strong)">
				<SpoolMark className="h-6 w-5 text-(--bp-thread)" />
			</div>
			{cell("project", project.name, "border-r border-b border-(--bp-line)")}
			{cell("page", "app", "border-r border-b border-(--bp-line)")}
			{cell("sheet", <span className="text-(--bp-thread-ink)">A-02</span>, "border-b border-(--bp-line)")}
			{cell("scale", zoom, "border-r border-(--bp-line)")}
			{cell("status", project.synced, "border-r border-(--bp-line)")}
			{cell(
				"drawn by",
				<span className="flex items-center gap-1.5">
					<Avatar size={16} />
					<span className="bp-body text-(--bp-ink)">{teammate.name.split(" ")[0]}</span>
				</span>,
			)}
		</div>
	);
}

function Toolbar() {
	return (
		<div className="absolute flex border border-(--bp-line-strong) bg-(--bp-raised)" style={{ left: 36, bottom: 16 }}>
			<span className="flex size-8 items-center justify-center bg-(--bp-ink) text-(--bp-ground)">
				<Icon d={glyph.select} />
			</span>
			<span className="flex size-8 items-center justify-center border-l border-(--bp-line) text-(--bp-ink-2)">
				<Marquee />
			</span>
			<span className="flex size-8 items-center justify-center border-l border-(--bp-line) text-(--bp-ink-2)">
				<Icon d={glyph.hand} />
			</span>
		</div>
	);
}

function Canvas() {
	return (
		<main className="relative shrink-0 overflow-hidden bg-(--bp-sheet)" style={{ width: CANVAS.w, height: CANVAS.h }}>
			<Grid />
			{canvasFrames.map((frame, i) => (
				<div key={frame.name} className="absolute" style={{ left: LEFTS[i], top: TOP, width: FW, height: FH }}>
					<CoffeeScreen screen={frame.screen} />
				</div>
			))}
			<Markup />
			{canvasFrames.map((frame, i) => (
				<Callout key={frame.name} index={i} />
			))}
			<Rulers />
			<Toolbar />
			<TitleBlock />
		</main>
	);
}

/* ------------------------------------------------------------- properties */

function SectionHead({ label, aside }: { label: string; aside?: ReactNode }) {
	return (
		<div className="flex h-6 items-center justify-between border-b border-(--bp-line) bg-(--bp-raised) px-3">
			<span className="bp-caption text-(--bp-ink-2)">{label}</span>
			{aside !== undefined ? <span className="bp-caption text-(--bp-ink-3)">{aside}</span> : null}
		</div>
	);
}

function PropCell({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
	return (
		<div className={cn("flex h-7 flex-1 items-center justify-between px-3", className)}>
			<span className="bp-caption text-(--bp-ink-3)">{label}</span>
			<span className="bp-label text-(--bp-ink)">{value}</span>
		</div>
	);
}

function PropPair({ a, b }: { a: [string, ReactNode]; b: [string, ReactNode] }) {
	return (
		<div className="flex border-b border-(--bp-line)">
			<PropCell label={a[0]} value={a[1]} className="border-r border-(--bp-line)" />
			<PropCell label={b[0]} value={b[1]} />
		</div>
	);
}

function FlowRow({ dir, other, certainty }: { dir: "in" | "out"; other: string; certainty: "will" | "might" }) {
	return (
		<div className="flex h-7 items-center gap-2 border-b border-(--bp-line) px-3">
			<span className="bp-caption w-6 text-(--bp-ink-3)">{dir}</span>
			<span className="bp-label flex-1 text-(--bp-ink)">{other}</span>
			<FlowLine certainty={certainty} className="text-(--bp-ink-2)" />
			<span className="bp-caption w-10 text-right text-(--bp-ink-2)">{certainty}</span>
		</div>
	);
}

function Properties() {
	const flowIn = flows.find((f) => f.to === selection.name);
	const flowOut = flows.find((f) => f.from === selection.name);
	return (
		<aside className="flex w-[248px] shrink-0 flex-col border-l border-(--bp-line) bg-(--bp-ground)">
			<div className="flex h-10 items-center gap-2 border-b border-(--bp-line) pr-2 pl-3">
				<span className="bp-caption flex h-4 items-center border border-(--bp-thread) px-1 text-(--bp-thread-ink)">
					A-02
				</span>
				<span className="bp-title flex-1">{selection.name}</span>
				<IconButton d={glyph.play} />
			</div>
			<div className="flex flex-col gap-1 border-b border-(--bp-line) px-3 py-2">
				<span className="bp-caption text-(--bp-ink-3)">path</span>
				<span className="bp-label text-(--bp-ink-2)">{selection.path}</span>
			</div>
			<SectionHead label="position" aside="frame.json" />
			<PropPair a={["x", selection.x]} b={["y", selection.y]} />
			<SectionHead label="size" aside="frame.json" />
			<PropPair a={["w", selection.w]} b={["h", selection.h]} />
			<SectionHead label="flows" aside={`${selection.flowsIn} in · ${selection.flowsOut} out`} />
			{flowIn ? <FlowRow dir="in" other={flowIn.from} certainty={flowIn.certainty} /> : null}
			{flowOut ? <FlowRow dir="out" other={flowOut.to} certainty={flowOut.certainty} /> : null}
			<SectionHead label="scenario" />
			<div className="p-3">
				<div className="flex h-7 items-center justify-between border border-(--bp-line-strong) bg-(--bp-raised) pr-1.5 pl-2">
					<span className="bp-label text-(--bp-ink)">{selection.scenario}</span>
					<Icon d={glyph.chevronDown} className="size-3.5 text-(--bp-ink-3)" />
				</div>
			</div>
			<div className="flex-1" />
			<div className="flex h-10 items-center justify-between border-t border-(--bp-line) px-3">
				<span className="bp-caption text-(--bp-ink-3)">
					{frameSize.w} × {frameSize.h} at {zoom}
				</span>
				<Icon d={glyph.cog} className="text-(--bp-ink-3)" />
			</div>
		</aside>
	);
}

/* ------------------------------------------------------------------- screen */

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-blueprint flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--bp-ground)"
			data-appearance={appearance}
			style={vars(appearance)}
		>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Properties />
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------- parts */

function Zone({
	n,
	label,
	className,
	children,
}: {
	n: string;
	label: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section className={cn("flex flex-col gap-3 border-r border-b border-(--bp-line) p-3", className)}>
			<header className="bp-caption flex items-center gap-2 text-(--bp-ink-3)">
				<span className="text-(--bp-ink-2)">{n}</span>
				<span>{label}</span>
			</header>
			{children}
		</section>
	);
}

function Spec({ children }: { children: ReactNode }) {
	return <span className="bp-caption text-(--bp-ink-3)">{children}</span>;
}

const typeRoles = [
	{ role: "title", spec: "plex cond 600 16/20", cls: "bp-title", sample: "kaffe" },
	{ role: "body", spec: "plex cond 400 13/16", cls: "bp-body", sample: "Move to page…" },
	{ role: "body-strong", spec: "plex cond 500 13/16", cls: "bp-body-strong", sample: "Share" },
	{ role: "label", spec: "fragment mono 11/16", cls: "bp-label", sample: "frames/app/cart" },
	{ role: "caption", spec: "fragment mono 10/12 +4%", cls: "bp-caption", sample: "position · frame.json" },
	{ role: "figure", spec: "fragment mono 11/12 red", cls: "bp-figure text-(--bp-thread-ink)", sample: "390 · 844" },
];

function Board({ appearance }: { appearance: Appearance }) {
	const p = palette[appearance];
	return (
		<div
			className="id-blueprint flex h-[900px] w-[720px] flex-col bg-(--bp-ground) p-6"
			data-appearance={appearance}
			style={vars(appearance)}
		>
			<div className="mb-3 flex items-center gap-3">
				<SpoolMark className="h-5 w-4 text-(--bp-thread)" />
				<span className="bp-title">spool</span>
				<span className="bp-caption text-(--bp-ink-3)">blueprint · {appearance}</span>
				<span className="flex-1" />
				<span className="bp-caption text-(--bp-ink-3)">radius 0 · grid 4 · row 28 · hairline 1</span>
			</div>
			<div className="grid flex-1 grid-cols-3 border-t border-l border-(--bp-line) bg-(--bp-sheet)">
				<Zone n="01" label="button" className="col-span-2">
					<div className="flex items-end gap-3">
						{(
							[
								["primary", <Button key="p" kind="primary" icon={<Icon d={glyph.play} fill className="size-3" />}>Play</Button>],
								["secondary", <Button key="s" kind="secondary">Share</Button>],
								["ghost", <Button key="g" kind="ghost">Cancel</Button>],
								["icon", <IconButton key="i" d={glyph.plus} />],
								["icon on", <IconButton key="o" d={glyph.select} on />],
								["danger", <Button key="d" kind="danger">Move to Trash</Button>],
							] as const
						).map(([name, node]) => (
							<div key={name} className="flex flex-col items-start gap-1.5">
								{node}
								<Spec>{name}</Spec>
							</div>
						))}
					</div>
				</Zone>
				<Zone n="02" label="field">
					<div className="flex h-7 items-center justify-between border border-(--bp-ink) bg-(--bp-raised) px-2">
						<span className="bp-label">cart</span>
						<span className="h-3.5 w-px bg-(--bp-thread)" />
					</div>
					<SearchField />
				</Zone>

				<Zone n="03" label="segment · toggle">
					<div className="flex h-7 border border-(--bp-line-strong)">
						{["Dark", "Light", "System"].map((s) => {
							const on = s.toLowerCase() === appearance;
							return (
								<span
									key={s}
									className={cn(
										"bp-body flex flex-1 items-center justify-center border-r border-(--bp-line) last:border-r-0",
										on ? "bg-(--bp-ink) text-(--bp-ground)" : "text-(--bp-ink-2)",
									)}
								>
									{s}
								</span>
							);
						})}
					</div>
					<div className="flex items-center justify-between">
						<span className="bp-body text-(--bp-ink-2)">Show rulers</span>
						<span className="flex gap-2">
							<span className="flex h-4 w-7 items-center justify-end border border-(--bp-ink) bg-(--bp-ink) p-0.5">
								<span className="size-2.5 bg-(--bp-ground)" />
							</span>
							<span className="flex h-4 w-7 items-center border border-(--bp-line-strong) p-0.5">
								<span className="size-2.5 bg-(--bp-ink-3)" />
							</span>
						</span>
					</div>
				</Zone>
				<Zone n="04" label="tab">
					<div className="flex border-b border-(--bp-line)">
						<span className="relative flex h-8 items-center gap-1.5 border-r border-(--bp-line) px-2.5 text-(--bp-ink-2)">
							<Icon d={glyph.home} className="size-3.5" />
							<span className="bp-body">Home</span>
						</span>
						<span className="relative flex h-8 items-center gap-1.5 border-r border-(--bp-line) bg-(--bp-ground) px-2.5">
							<span className="absolute top-0 right-0 left-0 h-0.5 bg-(--bp-ink)" />
							<span className="bp-label">kaffe</span>
							<Icon d={glyph.close} className="size-3 text-(--bp-ink-3)" />
						</span>
						<span className="flex h-8 items-center px-2.5 text-(--bp-ink-2)">
							<span className="bp-label">tvärsö</span>
						</span>
					</div>
					<Spec>active: ink rule, ground fill</Spec>
				</Zone>
				<Zone n="05" label="chip">
					<div className="flex items-center gap-2">
						<Chip kind="count">3</Chip>
						<Chip kind="live">live</Chip>
						<Chip kind="unseen">unseen</Chip>
					</div>
					<Spec>16 tall · square · caption type</Spec>
				</Zone>

				<Zone n="06" label="index row">
					<div className="-mx-3 flex flex-col">
						{(
							[
								["rest", "A-01", "menu"],
								["hover", "A-01", "menu"],
								["selected", "A-02", "cart"],
								["unseen", "A-03", "receipt"],
							] as const
						).map(([state, no, name]) => (
							<div key={state} className="relative">
								<FrameRow no={no} name={name} state={state} />
								<span className="bp-caption absolute top-2 right-9 text-(--bp-ink-3)">{state}</span>
							</div>
						))}
						<div className="mt-2 border-t border-(--bp-line)">
							<PageRow letter="B" name="site" count={2} presence />
						</div>
					</div>
				</Zone>
				<Zone n="07" label="property">
					<div className="-mx-3 flex flex-col border-t border-(--bp-line)">
						<SectionHead label="position" aside="frame.json" />
						<PropPair a={["x", selection.x]} b={["y", selection.y]} />
						<SectionHead label="size" aside="frame.json" />
						<PropPair a={["w", selection.w]} b={["h", selection.h]} />
						<FlowRow dir="out" other="receipt" certainty="might" />
					</div>
				</Zone>
				<Zone n="08" label="menu">
					<div className="flex flex-col border border-(--bp-line-strong) bg-(--bp-raised) py-1">
						{menuItems.map((item, i) => (
							<div key={item.label}>
								{item.danger ? <div className="my-1 h-px bg-(--bp-line)" /> : null}
								<div
									className={cn(
										"flex h-7 items-center justify-between px-3",
										i === 1 && "bg-(--bp-hover)",
										item.danger ? "text-(--bp-thread-ink)" : "text-(--bp-ink)",
									)}
								>
									<span className="bp-body">{item.label}</span>
									<span className="bp-caption text-(--bp-ink-3)">{item.key}</span>
								</div>
							</div>
						))}
					</div>
				</Zone>

				<Zone n="09" label="toast" className="col-span-2">
					<div className="flex h-10 w-[360px] items-center gap-3 border border-(--bp-line-strong) bg-(--bp-raised) pr-1 pl-3">
						<Icon d={glyph.check} className="size-3.5 text-(--bp-ink-2)" />
						<span className="bp-body flex-1">{toast.text}</span>
						<Button kind="ghost" className="text-(--bp-ink) underline underline-offset-4">
							{toast.action}
						</Button>
						<span className="h-5 w-px bg-(--bp-line)" />
						<span className="flex size-7 items-center justify-center text-(--bp-ink-3)">
							<Icon d={glyph.close} className="size-3.5" />
						</span>
					</div>
				</Zone>
				<Zone n="10" label="tooltip · avatar">
					<div className="flex items-center gap-4">
						<span className="flex flex-col items-center">
							<span className="flex h-6 items-center gap-2 bg-(--bp-ink) px-2 text-(--bp-ground)">
								<span className="bp-body">Hand</span>
								<span className="bp-caption opacity-70">H</span>
							</span>
							<svg viewBox="0 0 8 4" className="h-1 w-2" aria-hidden="true">
								<path d="M0 0h8L4 4Z" style={{ fill: "var(--bp-ink)" }} />
							</svg>
						</span>
						<span className="flex items-center gap-2">
							<Avatar size={24} />
							<Avatar size={20} />
							<Avatar size={16} />
						</span>
					</div>
				</Zone>

				<Zone n="11" label="type" className="col-span-2">
					<div className="flex flex-col">
						{typeRoles.map((t) => (
							<div
								key={t.role}
								className="grid h-7 grid-cols-[100px_164px_1fr] items-center border-b border-(--bp-rule) last:border-b-0"
							>
								<span className="bp-caption text-(--bp-ink-2)">{t.role}</span>
								<Spec>{t.spec}</Spec>
								<span className={cn(t.cls, "truncate")}>{t.sample}</span>
							</div>
						))}
					</div>
					<div className="mt-1 grid grid-cols-[100px_1fr] gap-y-1 border-t border-(--bp-line) pt-3">
						<span className="bp-caption text-(--bp-thread-ink)">red</span>
						<Spec>selection, measure, unseen, play</Spec>
						<span className="bp-caption text-(--bp-ink)">ink fill</span>
						<Spec>the current tool, tab, segment</Spec>
						<span className="bp-caption text-(--bp-ink)">raised, line</span>
						<Spec>what floats; no shadow</Spec>
						<span className="bp-caption text-(--bp-ink)">circle</span>
						<Spec>people only</Spec>
					</div>
				</Zone>
				<Zone n="12" label="palette" className="row-span-1">
					<div className="grid grid-cols-1">
						{(Object.keys(p) as Swatch[])
							.filter((k) => k !== "grid" && k !== "onThread")
							.map((k) => (
								<div key={k} className="flex h-4 items-center gap-2">
									<span className="size-3 shrink-0 border border-(--bp-line)" style={{ background: p[k] }} />
									<span className="bp-caption flex-1 text-(--bp-ink-2)">{swatchNames[k]}</span>
									<span className="bp-caption text-(--bp-ink-3)">{p[k]}</span>
								</div>
							))}
					</div>
				</Zone>
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
