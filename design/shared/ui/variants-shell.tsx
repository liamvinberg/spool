import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Scaled, TvarsoCheckout, TvarsoTicket, TvarsoTimetable, type VariationId } from "./tvarso-checkout";
import { ChevronIcon, FolderIcon, HandIcon, PanelCaret, SelectIcon } from "./spool-icons";
import { SpoolShell } from "./spool-shell";

/**
 * The chrome every frame on the `variants` page is drawn inside.
 *
 * Copied from `spool-canvas-chrome` rather than flagged into it, the way the
 * boot page copied it: the baseline is the app as it shipped, and a variation
 * concept is a proposal until it is one. The only structural change is that the
 * pages rail is a slot here, because half of this page's takes are proposals
 * about that rail.
 *
 * The numbers are the shipped ones, read out of `src/ui/canvas/rail-rows.ts`:
 * a page row is 32, a frame row is 28, one nesting step is 10, and the list
 * carries its own py-2. Everything a take adds is measured against those.
 */

export const PAGES_W = 248;
export const INSPECTOR_W = 300;
export const PAGE_ROW = 32;
export const FRAME_ROW = 28;
export const INDENT = 10;

/** where a row's icon sits at a given depth — `rail-rows.ts` */
export function contentX(depth: number): number {
	return depth * INDENT + 24;
}

/** where the spine of a depth is drawn — `rail-rows.ts` */
export function guideX(depth: number): number {
	return (depth - 1) * INDENT + 18;
}

/** the card at canvas zoom: 360×620 becomes 216×372 */
export const FIELD_SCALE = 0.6;
export const FIELD_W = 216;
export const FIELD_H = 372;

export function VariantsScreen({
	children,
	rail,
	inspector,
	hint,
	zoom = "80%",
}: {
	children: ReactNode;
	/** a take's own pages rail; the shipped-shaped one when a take is not about the rail */
	rail?: ReactNode | undefined;
	inspector?: ReactNode | undefined;
	/** the mono line at the foot of the field saying which keys are live */
	hint?: ReactNode | undefined;
	zoom?: string;
}) {
	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso", "spool"]} zoom={zoom}>
			<div className="flex h-full w-full overflow-hidden bg-bg">
				<aside className="flex shrink-0 flex-col border-border border-r bg-bg" style={{ width: PAGES_W }}>
					{rail ?? <DefaultRail />}
				</aside>
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
					{children}
					<Tools />
					{hint === undefined ? null : <HintLine>{hint}</HintLine>}
				</div>
				<aside
					aria-label="Inspector"
					className="flex shrink-0 flex-col border-border border-l bg-bg"
					style={{ width: INSPECTOR_W }}
				>
					{inspector ?? <CheckoutInspector />}
				</aside>
			</div>
		</SpoolShell>
	);
}

/* ── the rail, as parts ────────────────────────────────────────────────── */

export function RailShell({ count, children }: { count: number; children: ReactNode }) {
	return (
		<>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-base leading-base">Pages</h1>
					<span className="font-mono text-muted text-xs leading-xs">{count}</span>
				</div>
				<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
					<PanelCaret dir="left" className="h-3.5 w-2.5" />
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-2">{children}</div>
		</>
	);
}

export function RailPageRow({
	name,
	open,
	active = false,
	count,
	depth = 0,
	onToggle,
}: {
	name: string;
	open: boolean;
	active?: boolean;
	count: number;
	depth?: number;
	onToggle?: () => void;
}) {
	return (
		<div
			className={cn("group relative flex items-center pr-1.5", active && "bg-surface", !active && "hover:bg-surface/60")}
			style={{ height: PAGE_ROW, paddingLeft: depth * INDENT }}
		>
			{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<button
				type="button"
				aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
				aria-expanded={open}
				onClick={onToggle}
				className="flex h-full w-6 shrink-0 items-center justify-center text-muted"
			>
				<ChevronIcon open={open} className="h-2.5 w-2.5" />
			</button>
			<span className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
				<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
				<span className={cn("min-w-0 flex-1 truncate font-mono text-sm leading-sm", active ? "text-text" : "text-muted")}>
					{name}
				</span>
			</span>
			<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{count}</span>
		</div>
	);
}

/**
 * A frame row, exactly as the rail draws one: the spine and its tick, the file
 * glyph, the name in mono at text-xs, and whatever a take wants at the end.
 */
export function RailFrameRow({
	name,
	depth = 1,
	selected = false,
	dim = false,
	last = false,
	height = FRAME_ROW,
	icon,
	right,
	onSelect,
}: {
	name: string;
	depth?: number;
	selected?: boolean;
	/** a row that is a variation of the row above it rather than a frame of the page */
	dim?: boolean;
	last?: boolean;
	height?: number;
	icon?: ReactNode | undefined;
	right?: ReactNode | undefined;
	onSelect?: () => void;
}) {
	return (
		<div
			className={cn(
				"group relative flex items-center pr-1.5",
				selected && "bg-surface",
				!selected && "hover:bg-surface/60",
			)}
			style={{ height }}
		>
			<span
				className="absolute w-px bg-border-raised"
				style={{ left: guideX(depth), top: 0, height: last ? height - 6 : height }}
			/>
			<span className="absolute h-px w-2.5 bg-border-raised" style={{ left: guideX(depth), top: height / 2 }} />
			<button
				type="button"
				aria-label={`${name} frame`}
				aria-pressed={selected}
				onClick={onSelect}
				className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
				style={{ paddingLeft: contentX(depth) }}
			>
				{icon ?? <FrameIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-thread" : "text-muted")} />}
				<span
					className={cn(
						"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
						selected ? "text-text" : dim ? "text-muted/70" : "text-muted",
					)}
				>
					{name}
				</span>
			</button>
			{right === undefined ? null : <span className="flex shrink-0 items-center pr-1">{right}</span>}
		</div>
	);
}

/** the rail as it stands today: three frames on `booking`, nothing said about variations */
function DefaultRail() {
	return (
		<RailShell count={2}>
			<RailPageRow name="booking" open active count={3} />
			<RailFrameRow name="checkout" selected />
			<RailFrameRow name="timetable" />
			<RailFrameRow name="ticket" last />
			<RailPageRow name="site" open={false} count={4} />
		</RailShell>
	);
}

/* ── glyphs ────────────────────────────────────────────────────────────── */

/** the rail's own file glyph, copied from `sidebar.tsx` */
export function FrameIcon({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

/**
 * The one new glyph the whole page needs: a frame with more of itself behind it.
 *
 * It is the file glyph with two edges showing at its back, so a row carrying it
 * reads as the same thing the field draws when a frame is stacked.
 */
export function StackIcon({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M6.5 1.75h4.75M12 3v7" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity="0.5" />
			<path d="M5 3.25h4.5M10.25 4.5v6.5" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" opacity="0.75" />
			<path d="M2 4.75h4.5l2 2v5.5H2z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

export function ArrowIcon({ dir, className }: { dir: "left" | "right"; className?: string | undefined }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path
				d={dir === "left" ? "m7 2.5-3.5 3.5L7 9.5" : "m5 2.5 3.5 3.5L5 9.5"}
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* ── the field's furniture ─────────────────────────────────────────────── */

/**
 * The label above a frame on the field: the pause tick, the name, and the
 * selection's own play verb at the far end. Everything a take invents about
 * variations goes in `right`, which is the slot play would otherwise share.
 */
export function FrameLabel({
	name,
	selected = false,
	paused = false,
	width = FIELD_W,
	right,
	stacked = false,
}: {
	name: string;
	selected?: boolean;
	paused?: boolean;
	width?: number;
	right?: ReactNode | undefined;
	/** the frame has variations, said before the name so the column reads down */
	stacked?: boolean;
}) {
	return (
		<div className="flex min-w-0 items-center gap-1.5 font-mono text-sm leading-4" style={{ width }}>
			{paused ? <span className="shrink-0 text-2xs text-muted leading-3">▸</span> : null}
			{stacked ? <StackIcon className={cn("h-3 w-3 shrink-0", selected ? "text-thread" : "text-muted/70")} /> : null}
			<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-muted")}>{name}</span>
			{right === undefined ? null : <span className="ml-auto flex shrink-0 items-center gap-1.5">{right}</span>}
		</div>
	);
}

export function PlayVerb() {
	return (
		<span className="flex items-center gap-1 font-mono text-2xs text-muted leading-3">
			<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
				<path d="M2 1.2 8.4 5 2 8.8Z" />
			</svg>
			play
		</span>
	);
}

/** the selection ring and its four handles, at the shipped offsets */
export function SelectionRing({ size }: { size?: string }) {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread" />
			{["-left-[7px] -top-[7px]", "-right-[7px] -top-[7px]", "-bottom-[7px] -left-[7px]", "-bottom-[7px] -right-[7px]"].map(
				(position) => (
					<span
						key={position}
						className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
					/>
				),
			)}
			{size === undefined ? null : (
				<div className="-translate-x-1/2 absolute top-[calc(100%+8px)] left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
					{size}
				</div>
			)}
		</>
	);
}

export function HintLine({ children }: { children: ReactNode }) {
	return (
		<span className="pointer-events-none absolute bottom-7 left-6 z-20 font-mono text-2xs text-muted/60 leading-3">
			{children}
		</span>
	);
}

function Tools() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
			>
				<span className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-text">
					<SelectIcon className="h-[18px] w-[18px]" />
				</span>
				<span className="flex h-9 w-9 items-center justify-center rounded-md text-muted">
					<HandIcon className="h-[18px] w-[18px]" />
				</span>
			</div>
		</div>
	);
}

/* ── the inspector ─────────────────────────────────────────────────────── */

const ELEMENTS: readonly { name: string; depth: number }[] = [
	{ name: "card", depth: 0 },
	{ name: "masthead", depth: 1 },
	{ name: "trip", depth: 1 },
	{ name: "lines", depth: 1 },
	{ name: "payment", depth: 1 },
	{ name: "pay-button", depth: 1 },
];

/**
 * The inspector as it shipped, reading the card rather than the coffee shop.
 * Takes that propose something for the inspector pass their own.
 */
export function CheckoutInspector({ tail }: { tail?: ReactNode | undefined }) {
	return (
		<>
			<div className="flex h-11 shrink-0 items-stretch justify-between border-border border-b pr-2 pl-4">
				<div className="flex h-full items-stretch gap-5">
					{["elements", "connections"].map((tab) => (
						<span
							key={tab}
							className={cn(
								"relative flex h-full items-center font-mono text-xs leading-xs",
								tab === "elements" ? "text-text" : "text-muted/60",
							)}
						>
							{tab}
							{tab === "elements" ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
						</span>
					))}
				</div>
				<span className="flex h-11 w-7 shrink-0 items-center justify-center text-muted/60">
					<PanelCaret dir="right" className="h-3.5 w-2.5" />
				</span>
			</div>
			<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
				<span className="truncate font-mono text-sm text-text leading-sm">checkout</span>
				<span className="truncate font-mono text-2xs text-muted/60 leading-3">frames/booking/checkout/frame.tsx</span>
			</div>
			{tail}
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">elements</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{ELEMENTS.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden pb-3">
				{ELEMENTS.map((row) => (
					<div key={row.name} className="flex h-7 items-center">
						<span
							className="truncate font-mono text-sm text-muted leading-sm"
							style={{ paddingLeft: 16 + row.depth * 14 }}
						>
							{row.name}
						</span>
					</div>
				))}
			</div>
		</>
	);
}

/* ── placement on the field ────────────────────────────────────────────── */

export function Placed({
	x,
	y,
	z,
	children,
	className,
}: {
	x: number;
	y: number;
	z?: number;
	children: ReactNode;
	className?: string | undefined;
}) {
	return (
		<div className={cn("absolute flex flex-col gap-1.5", className)} style={{ left: x, top: y, zIndex: z }}>
			{children}
		</div>
	);
}

/** one of the two frames the varying one sits between: a name and a still card */
export function Neighbour({
	x,
	y,
	name,
	children,
	stacked = false,
	count,
}: {
	x: number;
	y: number;
	name: string;
	children: ReactNode;
	/** it has variations of its own, and says so without being selected */
	stacked?: boolean;
	count?: number | undefined;
}) {
	return (
		<Placed x={x} y={y}>
			<FrameLabel
				name={name}
				paused
				stacked={stacked}
				right={count === undefined ? undefined : <span className="font-mono text-2xs text-muted/60 leading-3">{count}</span>}
			/>
			<div className="overflow-hidden rounded-[8px]">{children}</div>
		</Placed>
	);
}

/** the thread between two frames on the field, at the shipped weight */
export function Thread({
	from,
	to,
	dashed = false,
}: {
	from: { x: number; y: number };
	to: { x: number; y: number };
	dashed?: boolean;
}) {
	const mid = (from.x + to.x) / 2;
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			<path
				d={`M${from.x} ${from.y}C${mid} ${from.y} ${mid} ${to.y} ${to.x - 8} ${to.y}`}
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeDasharray={dashed ? "5 5" : undefined}
			/>
			<path d={`m${to.x} ${to.y}-9-5v10Z`} fill="var(--color-thread)" />
		</svg>
	);
}

/**
 * The field the rail takes argue over: three frames, the middle one showing
 * whichever variation the rail has switched to, and nothing on the canvas
 * saying anything about variations at all.
 *
 * That silence is the point of the lane. If the rail is the switch, the field
 * has one job: swap without moving, so the eye stays where the pointer left it.
 */
export function VariationField({
	variation,
	label = "checkout",
	right,
	stacked = false,
}: {
	variation: VariationId;
	label?: string;
	right?: ReactNode | undefined;
	stacked?: boolean;
}) {
	return (
		<>
			<Thread from={{ x: 264, y: 356 }} to={{ x: 336, y: 356 }} />
			<Thread from={{ x: 552, y: 356 }} to={{ x: 624, y: 356 }} dashed />
			<Neighbour x={48} y={170} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Placed x={336} y={170} z={2}>
				<FrameLabel name={label} selected stacked={stacked} right={right ?? <PlayVerb />} />
				<div className="relative" style={{ width: FIELD_W, height: FIELD_H }}>
					<div className="absolute inset-0 overflow-hidden rounded-[8px]">
						<AnimatePresence initial={false}>
							<motion.div
								key={variation}
								className="absolute inset-0"
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -4 }}
								transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
							>
								<Scaled scale={FIELD_SCALE}>
									<TvarsoCheckout variation={variation} />
								</Scaled>
							</motion.div>
						</AnimatePresence>
					</div>
					<SelectionRing size="360 × 620" />
				</div>
			</Placed>
			<Neighbour x={624} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>
		</>
	);
}
