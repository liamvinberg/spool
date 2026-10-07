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
import "./brutal.css";

/**
 * brutal: disciplined neo-brutalism. Every component is a 2px ink box at 0 radius;
 * controls are 36 tall, list rows are 36 tall, on-canvas controls are 24. One shadow
 * (3px 3px 0 ink) and only on what floats or presses. Ink fill marks where you are
 * (the open tab, the current page, the chosen tool); thread fill marks what you hold
 * or do next (the selection, the primary action). Text on any fill is black.
 */

const INK = "border-(--b-ink)";

/* ── icons: 16 grid, 2px stroke, square caps, mitred ─────────────────────── */

function Svg({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="square"
			strokeLinejoin="miter"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}
const IPlus = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M8 3v10M3 8h10" />
	</Svg>
);
const IClose = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M4 4l8 8M12 4l-8 8" />
	</Svg>
);
const IPlay = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M4.5 3v10l8-5z" fill="currentColor" strokeWidth={1.5} />
	</Svg>
);
const IChevron = ({ open, className }: { open?: boolean; className?: string }) => (
	<Svg className={className}>{open ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}</Svg>
);
const ISearch = (p: { className?: string }) => (
	<Svg {...p}>
		<rect x="2.5" y="2.5" width="8" height="8" />
		<path d="M11 11l3 3" />
	</Svg>
);
const IHome = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M2.5 7.5 8 3l5.5 4.5V13.5h-11z" />
	</Svg>
);
const IShare = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M8 2.5v7M5 5.5l3-3 3 3M3 9v4.5h10V9" />
	</Svg>
);
const ISelect = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M3.5 2.5 12.5 8 8.5 8.8 6.5 13z" fill="currentColor" strokeWidth={1.5} />
	</Svg>
);
const IMarquee = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M2.5 2.5h3M7 2.5h2M10.5 2.5h3v3M13.5 7v2M13.5 10.5v3h-3M9 13.5H7M5.5 13.5h-3v-3M2.5 9V7M2.5 5.5v-3" strokeLinecap="butt" />
	</Svg>
);
const IHand = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M4.5 9V5.5M7 8V3M9.5 8V3.5M12 8.5V5.5M4.5 9l-1.5-1.5L2 9l3 4.5h6l1-2.5V8.5" />
	</Svg>
);
const ITrash = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.8 9h6.4l.8-9" />
	</Svg>
);
const IDots = (p: { className?: string }) => (
	<Svg {...p}>
		<path d="M3 8h.01M8 8h.01M13 8h.01" strokeWidth={2.5} />
	</Svg>
);

/* ── primitives ───────────────────────────────────────────────────────────── */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

function Btn({
	variant = "secondary",
	size = "md",
	icon,
	children,
	pressed,
	className,
}: {
	variant?: BtnVariant;
	size?: "md" | "sm";
	icon?: ReactNode;
	children?: ReactNode;
	pressed?: boolean;
	className?: string;
}) {
	const square = !children;
	return (
		<span
			className={cn(
				"t-label inline-flex shrink-0 items-center justify-center gap-2 border-2 select-none",
				INK,
				size === "md" ? "h-9" : "h-6 gap-1",
				square ? (size === "md" ? "w-9" : "w-6") : size === "md" ? "px-3" : "px-2",
				variant === "primary" && "bg-(--b-thread) text-(--b-on-fill)",
				variant === "secondary" && "bg-(--b-field) text-(--b-ink)",
				variant === "danger" && "bg-(--b-field) text-(--b-danger)",
				variant === "ghost" && "border-transparent bg-transparent text-(--b-ink)",
				variant !== "ghost" && !pressed && "b-raised",
				pressed && "translate-x-[3px] translate-y-[3px]",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"t-micro inline-flex h-5 min-w-5 items-center justify-center border-2 px-1 text-(--b-ink)",
				INK,
				className,
			)}
		>
			{children}
		</span>
	);
}

type ChipKind = "count" | "live" | "unseen" | "will" | "might";
function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
	return (
		<span
			className={cn(
				"t-micro inline-flex h-5 shrink-0 items-center gap-1 border-2 px-1.5",
				INK,
				kind === "live" ? "bg-(--b-ink) text-(--b-paper)" : "bg-(--b-field) text-(--b-ink)",
				kind === "might" && "border-dashed",
			)}
		>
			{(kind === "live" || kind === "unseen") && <UnseenMark />}
			{children}
		</span>
	);
}

/** The unseen mark: a 6px thread square. Never a dot. */
function UnseenMark({ className }: { className?: string }) {
	return <span className={cn("block size-1.5 shrink-0 bg-(--b-thread)", className)} />;
}

function Avatar({ size = "md" }: { size?: "md" | "sm" }) {
	return (
		<span
			className={cn(
				"t-micro inline-flex shrink-0 items-center justify-center border-2 text-[#0c0c0b]",
				INK,
				size === "md" ? "size-6" : "size-5 text-[9px]",
			)}
			style={{ background: teammate.color }}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function Field({
	prefix,
	children,
	className,
	trailing,
	focus,
}: {
	prefix?: string;
	children: ReactNode;
	className?: string;
	trailing?: ReactNode;
	focus?: boolean;
}) {
	return (
		<span
			className={cn(
				"t-value flex h-9 min-w-0 items-center border-2 bg-(--b-field) text-(--b-ink)",
				focus ? "border-(--b-thread)" : INK,
				className,
			)}
		>
			{prefix ? (
				<span className={cn("t-micro flex h-full w-7 shrink-0 items-center justify-center border-r-2 text-(--b-muted)", INK)}>
					{prefix}
				</span>
			) : null}
			<span className="min-w-0 flex-1 truncate px-2.5">{children}</span>
			{trailing}
		</span>
	);
}

function Search({ className }: { className?: string }) {
	return (
		<span className={cn("t-label flex h-9 items-center gap-2 border-2 bg-(--b-field) pr-1.5 pl-2.5 text-(--b-muted)", INK, className)}>
			<ISearch className="size-3.5 text-(--b-ink)" />
			<span className="flex-1 truncate">Search frames</span>
			<Kbd>{commandHint}</Kbd>
		</span>
	);
}

function Segmented({ options, value }: { options: string[]; value: string }) {
	return (
		<span className={cn("flex h-9 border-2 bg-(--b-field)", INK)}>
			{options.map((o, i) => (
				<span
					key={o}
					className={cn(
						"t-label flex flex-1 items-center justify-center px-3",
						i > 0 && "border-l-2",
						INK,
						o === value ? "bg-(--b-ink) text-(--b-paper)" : "text-(--b-ink)",
					)}
				>
					{o}
				</span>
			))}
		</span>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span className={cn("flex h-6 w-11 items-center border-2 p-0.5", INK, on ? "bg-(--b-ink)" : "bg-(--b-field)")}>
			<span className={cn("size-4", on ? "ml-auto bg-(--b-paper)" : "bg-(--b-ink)")} />
		</span>
	);
}

/* ── tab strip cells ───────────────────────────────────────────────────────── */

function TabCell({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-full shrink-0 items-center gap-2 border-r-2 px-4",
				INK,
				active ? "bg-(--b-ink) text-(--b-paper)" : "text-(--b-ink)",
			)}
		>
			{home ? <IHome className="size-3.5" /> : null}
			<span className={home ? "t-label" : "t-name"}>{name}</span>
			{active ? <IClose className="-mr-1 ml-2 size-3" /> : null}
		</span>
	);
}

/* ── sidebar ──────────────────────────────────────────────────────────────── */

type RowState = "rest" | "hover" | "selected" | "unseen";

/** A frame row: 36 tall, an index gutter, the name, one 36px slot on the right. */
function FrameRow({ index, name, state = "rest" }: { index: number; name: string; state?: RowState }) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"relative flex h-9 items-center",
				selected && "bg-(--b-thread) text-(--b-on-fill)",
				state === "hover" && "bg-(--b-tint)",
			)}
		>
			<span
				className={cn(
					"t-micro flex h-full w-11 shrink-0 items-center justify-center",
					selected ? "text-(--b-on-fill)" : "text-(--b-muted)",
				)}
			>
				{String(index).padStart(2, "0")}
			</span>
			<span className="t-name flex-1 truncate">{name}</span>
			<span className={cn("flex h-full w-11 shrink-0 items-center justify-center border-l-2", INK)}>
				{state === "unseen" ? <UnseenMark className="size-2" /> : null}
				{selected ? <IPlay className="size-3" /> : null}
			</span>
		</div>
	);
}

/** A page row: chevron, name, presence, and a 36px count cell ruled off on the left. */
function PageRow({
	name,
	count,
	open,
	current,
	presence,
	hover,
}: {
	name: string;
	count: number;
	open?: boolean;
	current?: boolean;
	presence?: boolean;
	hover?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex h-9 items-center",
				current ? "bg-(--b-ink) text-(--b-paper)" : "text-(--b-ink)",
				hover && "bg-(--b-tint)",
			)}
		>
			<span className="flex h-full w-11 shrink-0 items-center justify-center">
				<IChevron open={open} className="size-3.5" />
			</span>
			<span className="t-name flex-1 truncate">{name}</span>
			{presence ? (
				<span className="mr-2 flex items-center">
					<Avatar size="sm" />
				</span>
			) : null}
			<span
				className={cn(
					"t-figure flex h-full w-11 shrink-0 items-center justify-center border-l-2 text-[16px]",
					current ? "border-(--b-paper)" : INK,
				)}
			>
				{count}
			</span>
		</div>
	);
}

const unseenCount = pages.reduce((n, p) => n + p.frames.filter((f) => f.unseen).length, 0);

/** A ruled counter cell: the figure on top, what it counts under it. */
function Stat({ value, label, mark }: { value: number; label: string; mark?: boolean }) {
	return (
		<span className={cn("flex h-14 flex-col justify-center gap-1 px-2.5 not-first:border-l-2", INK)}>
			<span className="t-figure">{value}</span>
			<span className="t-micro flex items-center gap-1 text-(--b-muted)">
				{mark ? <UnseenMark /> : null}
				{label}
			</span>
		</span>
	);
}

function Sidebar() {
	return (
		<aside className={cn("flex w-[264px] shrink-0 flex-col border-r-2 bg-(--b-paper)", INK)}>
			<div className="px-4 pt-4 pb-3">
				<div className="flex items-baseline justify-between">
					<span className="t-figure text-[24px] leading-7">{project.name}</span>
					<span className="t-micro text-(--b-muted)">{project.synced}</span>
				</div>
				<div className="t-value mt-1 text-(--b-muted)">{project.team}</div>
				<div className={cn("mt-3 grid grid-cols-3 border-2 bg-(--b-field)", INK)}>
					<Stat value={pages.length} label="pages" />
					<Stat value={project.frames} label="frames" />
					<Stat value={unseenCount} label="unseen" mark />
				</div>
			</div>
			<div className="px-4 pb-4">
				<Search />
			</div>
			<div className={cn("flex h-9 items-center border-y-2 pr-2 pl-4", INK)}>
				<span className="t-heading flex-1">Pages</span>
				<span className="t-micro mr-2 text-(--b-muted)">{pages.length}</span>
				<Btn variant="ghost" size="sm" icon={<IPlus className="size-3.5" />} />
			</div>
			<div className="flex flex-col">
				{pages.map((page) => (
					<div key={page.name} className={cn("border-b-2", INK)}>
						<PageRow
							name={page.name}
							count={page.count}
							open={page.open}
							current={page.current}
							presence={page.presence}
						/>
						{page.open ? (
							<div className={cn("border-t-2", INK)}>
								{page.frames.map((f, i) => (
									<FrameRow
										key={f.name}
										index={i + 1}
										name={f.name}
										state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"}
									/>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
			<div className="flex-1" />
			<div className={cn("flex h-13 items-center gap-3 border-t-2 px-4", INK)}>
				<Avatar />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="t-label truncate">{teammate.name}</span>
					<span className="t-micro text-(--b-muted)">on {teammate.page}</span>
				</span>
			</div>
		</aside>
	);
}

/* ── right panel ──────────────────────────────────────────────────────────── */

function PropRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex h-9 items-center gap-2">
			<span className="t-micro w-16 shrink-0 text-(--b-muted)">{label}</span>
			<div className="flex min-w-0 flex-1 gap-2">{children}</div>
		</div>
	);
}

function Section({ title, children, last }: { title: string; children: ReactNode; last?: boolean }) {
	return (
		<section className={cn("flex flex-col gap-2 px-4 pt-3 pb-4", !last && "border-b-2", INK)}>
			<span className="t-heading">{title}</span>
			{children}
		</section>
	);
}

function Counter({ label, value }: { label: string; value: number }) {
	return (
		<span className={cn("flex h-9 flex-1 items-center justify-between border-2 bg-(--b-field) pr-3 pl-2.5", INK)}>
			<span className="t-micro text-(--b-muted)">{label}</span>
			<span className="t-figure">{value}</span>
		</span>
	);
}

function FlowRow({ from, to, certainty }: { from: string; to: string; certainty: "will" | "might" }) {
	return (
		<div className="flex h-9 items-center gap-2">
			<span className="t-value flex-1 truncate">
				{from} <span className="text-(--b-muted)">→</span> {to}
			</span>
			<Chip kind={certainty}>{certainty}</Chip>
		</div>
	);
}

function Panel() {
	return (
		<aside className={cn("flex w-[296px] shrink-0 flex-col border-l-2 bg-(--b-paper)", INK)}>
			<div className={cn("flex h-9 items-center border-b-2 pr-2 pl-4", INK)}>
				<span className="t-micro flex-1 text-(--b-muted)">properties</span>
				<Btn variant="ghost" size="sm" icon={<IDots className="size-3.5" />} />
			</div>
			<Section title="Frame">
				<PropRow label="name">
					<Field className="flex-1">{selection.name}</Field>
				</PropRow>
				<PropRow label="path">
					<span className="t-value truncate text-(--b-muted)">{selection.path}</span>
				</PropRow>
				<PropRow label="scenario">
					<Field className="flex-1" trailing={<IChevron open className="mr-2.5 size-3.5" />}>
						{selection.scenario}
					</Field>
				</PropRow>
			</Section>
			<Section title="Layout">
				<PropRow label="position">
					<Field prefix="x" className="flex-1">
						{selection.x}
					</Field>
					<Field prefix="y" className="flex-1">
						{selection.y}
					</Field>
				</PropRow>
				<PropRow label="size">
					<Field prefix="w" className="flex-1">
						{selection.w}
					</Field>
					<Field prefix="h" className="flex-1">
						{selection.h}
					</Field>
				</PropRow>
			</Section>
			<Section title="Flows" last>
				<PropRow label="count">
					<Counter label="in" value={selection.flowsIn} />
					<Counter label="out" value={selection.flowsOut} />
				</PropRow>
				<div className="flex flex-col">
					{flows.map((f) => (
						<FlowRow key={f.from + f.to} {...f} />
					))}
				</div>
			</Section>
		</aside>
	);
}

/* ── canvas ───────────────────────────────────────────────────────────────── */

const CANVAS_W = 1440 - 264 - 296;
const FRAME_TOP = 132;
const FRAME_XS = [24, 320, 616] as const;

function Tools() {
	return (
		<div className={cn("b-raised flex border-2 bg-(--b-field)", INK)}>
			{[
				{ key: "select", icon: <ISelect />, on: true },
				{ key: "marquee", icon: <IMarquee /> },
				{ key: "hand", icon: <IHand /> },
			].map((t, i) => (
				<span
					key={t.key}
					className={cn(
						"flex size-9 items-center justify-center",
						i > 0 && "border-l-2",
						INK,
						t.on ? "bg-(--b-ink) text-(--b-paper)" : "text-(--b-ink)",
					)}
				>
					{t.icon}
				</span>
			))}
		</div>
	);
}

function FrameLabel({ name, selected, unseen }: { name: string; selected?: boolean; unseen?: boolean }) {
	if (selected) {
		return (
			<div className="flex h-6 items-center justify-between">
				<span className={cn("t-name flex h-6 items-center border-2 bg-(--b-thread) px-2 text-(--b-on-fill)", INK)}>
					{name}
				</span>
				<Btn variant="secondary" size="sm" icon={<IPlay className="size-3" />}>
					<span className="t-micro">play</span>
				</Btn>
			</div>
		);
	}
	return (
		<div className="flex h-6 items-center gap-2">
			{unseen ? <UnseenMark className="size-2" /> : null}
			<span className="t-name">{name}</span>
			{unseen ? <span className="t-micro text-(--b-muted)">unseen</span> : null}
		</div>
	);
}

function Handle({ x, y }: { x: number; y: number }) {
	return (
		<span
			className={cn("absolute size-2.5 border-2 bg-(--b-thread)", INK)}
			style={{ left: x - 5, top: y - 5 }}
		/>
	);
}

function Canvas() {
	const W = drawnSize.w;
	const H = drawnSize.h;
	const midY = FRAME_TOP + 150;
	const [m, c, r] = FRAME_XS;
	const pad = 6;
	return (
		<main className="b-dots relative min-w-0 flex-1 overflow-hidden" style={{ width: CANVAS_W }}>
			{canvasFrames.map((f, i) => {
				const x = FRAME_XS[i] ?? 0;
				return (
					<div key={f.name} className="absolute" style={{ left: x, top: FRAME_TOP - 40, width: W }}>
						<FrameLabel name={f.name} selected={"selected" in f} unseen={"unseen" in f} />
					</div>
				);
			})}
			{canvasFrames.map((f, i) => (
				<div
					key={f.name}
					className="absolute overflow-hidden bg-white outline-2 outline-(--b-ink)"
					style={{ left: FRAME_XS[i], top: FRAME_TOP, width: W, height: H }}
				>
					<CoffeeScreen screen={f.screen} />
				</div>
			))}

			{/* selection on cart: 2px thread rule 6px out, square handles, size readout */}
			<div
				className="pointer-events-none absolute border-2 border-(--b-thread)"
				style={{ left: c - pad, top: FRAME_TOP - pad, width: W + pad * 2, height: H + pad * 2 }}
			/>
			<Handle x={c - pad + 1} y={FRAME_TOP - pad + 1} />
			<Handle x={c + W + pad - 1} y={FRAME_TOP - pad + 1} />
			<Handle x={c - pad + 1} y={FRAME_TOP + H + pad - 1} />
			<Handle x={c + W + pad - 1} y={FRAME_TOP + H + pad - 1} />
			<div className="absolute flex justify-center" style={{ left: c, top: FRAME_TOP + H + 16, width: W }}>
				<span className={cn("t-value flex h-6 items-center border-2 bg-(--b-thread) px-2 text-(--b-on-fill)", INK)}>
					{frameSize.w} × {frameSize.h}
				</span>
			</div>

			{/* flows: will is a solid 2px rule, might is dashed; both end in a square-cut head */}
			<svg className="pointer-events-none absolute inset-0" width={CANVAS_W} height={900} aria-hidden="true">
				<defs>
					<marker id="b-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
						<path d="M0 0 8 4 0 8z" fill="var(--b-ink)" />
					</marker>
				</defs>
				<path
					d={`M${m + W + 4} ${midY} H${c - pad - 6}`}
					stroke="var(--b-ink)"
					strokeWidth={2}
					fill="none"
					markerEnd="url(#b-head)"
				/>
				<path
					d={`M${c + W + pad + 6} ${midY} H${r - 4}`}
					stroke="var(--b-ink)"
					strokeWidth={2}
					strokeDasharray="5 4"
					fill="none"
					markerEnd="url(#b-head)"
				/>
			</svg>

			<div className="absolute bottom-6 left-1/2 -translate-x-1/2">
				<Tools />
			</div>
		</main>
	);
}

/* ── window ───────────────────────────────────────────────────────────────── */

function TopBar() {
	return (
		<header className={cn("flex h-[54px] shrink-0 items-stretch border-b-2 bg-(--b-paper)", INK)}>
			<span className={cn("flex w-[52px] shrink-0 items-center justify-center border-r-2", INK)}>
				<SpoolMark className="h-6 w-5 text-[#f5391a]" />
			</span>
			<TabCell name="Home" home />
			{tabs.map((t) => (
				<TabCell key={t.name} name={t.name} active={t.active} />
			))}
			<span className={cn("flex w-[52px] shrink-0 items-center justify-center border-r-2", INK)}>
				<IPlus className="size-4" />
			</span>
			<span className="flex-1" />
			<div className="flex items-center gap-3 pr-4 pl-3">
				<Avatar />
				<span className={cn("t-value flex h-9 items-center border-2 bg-(--b-field)", INK)}>
					<span className={cn("flex h-full w-8 items-center justify-center border-r-2 text-(--b-muted)", INK)}>−</span>
					<span className="w-14 text-center">{zoom}</span>
					<span className={cn("flex h-full w-8 items-center justify-center border-l-2 text-(--b-muted)", INK)}>+</span>
				</span>
				<Btn variant="secondary" icon={<IShare className="size-3.5" />}>
					Share
				</Btn>
				<Btn variant="primary" icon={<IPlay className="size-3.5" />}>
					Play
				</Btn>
			</div>
		</header>
	);
}

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div data-appearance={appearance} className="id-brutal flex h-[900px] w-[1440px] flex-col overflow-hidden">
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Panel />
			</div>
		</div>
	);
}

/* ── parts ────────────────────────────────────────────────────────────────── */

function Spec({ label, note, children, className }: { label: string; note?: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className={cn("flex items-baseline justify-between border-t-2 pt-1.5", INK)}>
				<span className="t-micro">{label}</span>
				{note ? <span className="t-micro text-(--b-muted)">{note}</span> : null}
			</div>
			{children}
		</div>
	);
}

function Menu() {
	return (
		<div className={cn("b-raised flex w-full flex-col border-2 bg-(--b-field) py-1", INK)}>
			{menuItems.map((item, i) => (
				<div key={item.label}>
					{item.danger ? <div className={cn("my-1 border-t-2", INK)} /> : null}
					<div
						className={cn(
							"flex h-9 items-center gap-2 px-3",
							i === 0 && "bg-(--b-ink) text-(--b-paper)",
							item.danger && "text-(--b-danger)",
						)}
					>
						<span className="t-label flex-1">{item.label}</span>
						<span className={cn("t-value", i === 0 ? "text-(--b-paper)" : "text-(--b-muted)")}>{item.key}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Toast() {
	const [name, ...rest] = toast.text.split(" ");
	return (
		<div className={cn("b-raised flex h-12 items-center gap-3 border-2 bg-(--b-field) pr-2 pl-3", INK)}>
			<ITrash className="size-3.5" />
			<span className="t-label flex-1 truncate">
				<span className="t-name">{name}</span> {rest.join(" ")}
			</span>
			<Btn variant="secondary" size="sm">
				{toast.action}
			</Btn>
		</div>
	);
}

function Tooltip() {
	return (
		<div className="flex flex-col items-start">
			<span className={cn("b-raised t-label flex h-7 items-center gap-2 border-2 bg-(--b-field) pr-1 pl-2", INK)}>
				Search frames <Kbd>{commandHint}</Kbd>
			</span>
		</div>
	);
}

const PALETTE: { name: string; light: string; dark: string; role: string }[] = [
	{ name: "paper", light: "#f4f1ea", dark: "#0c0c0b", role: "chrome" },
	{ name: "tint", light: "#e6e1d4", dark: "#1b1b19", role: "canvas, hover" },
	{ name: "field", light: "#fffdf8", dark: "#141413", role: "controls" },
	{ name: "ink", light: "#111110", dark: "#f4f1ea", role: "rules, text" },
	{ name: "muted", light: "#5b564c", dark: "#a6a195", role: "labels" },
	{ name: "thread", light: "#f5391a", dark: "#f5391a", role: "hold, act" },
	{ name: "danger", light: "#c42a0b", dark: "#ff5233", role: "danger text" },
	{ name: "mate", light: "#3b82f6", dark: "#3b82f6", role: "teammate" },
];

const TYPE: { role: string; cls: string; spec: string; sample: string }[] = [
	{ role: "figure", cls: "t-figure", spec: "mono 800 20/24", sample: "390 × 844" },
	{ role: "heading", cls: "t-heading", spec: "sans 700 15/20", sample: "Pages" },
	{ role: "label", cls: "t-label", spec: "sans 600 13/16", sample: "Move to page…" },
	{ role: "name", cls: "t-name", spec: "mono 600 13/16", sample: "receipt" },
	{ role: "value", cls: "t-value", spec: "mono 500 12/16", sample: selection.path },
	{ role: "micro", cls: "t-micro", spec: "mono 700 10/12", sample: "unseen · 72%" },
];

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div data-appearance={appearance} className="id-brutal flex h-[900px] w-[720px] flex-col gap-4 px-5 pt-4 pb-5">
			<div className="flex h-8 items-center gap-3">
				<SpoolMark className="h-6 w-5 text-[#f5391a]" />
				<span className="t-figure">brutal</span>
				<span className="t-value text-(--b-muted)">2px rules · 0 radius · 36 controls · one 3px shadow</span>
				<span className="flex-1" />
				<Chip kind="count">{appearance}</Chip>
			</div>

			<div className="grid grid-cols-[208px_256px_1fr] gap-x-4">
				{/* column 1 */}
				<div className="flex flex-col gap-4">
					<Spec label="button" note="36 · sm 24">
						<div className="flex gap-3">
							<Btn variant="primary" icon={<IPlay className="size-3.5" />}>
								Play
							</Btn>
							<Btn variant="secondary" icon={<IShare className="size-3.5" />}>
								Share
							</Btn>
						</div>
						<div className="flex gap-3">
							<Btn variant="danger" icon={<ITrash className="size-3.5" />}>
								Move to Trash
							</Btn>
							<Btn icon={<IPlus className="size-4" />} />
						</div>
						<div className="flex items-center gap-3">
							<Btn variant="ghost" className="-ml-[2px]">
								Cancel
							</Btn>
							<Btn variant="primary" pressed>
								Pressed
							</Btn>
						</div>
						<div className="flex items-center gap-3">
							<Btn size="sm" icon={<IPlay className="size-3" />}>
								<span className="t-micro">play</span>
							</Btn>
							<Btn size="sm">Undo</Btn>
							<Btn size="sm" icon={<IPlus className="size-3.5" />} />
						</div>
					</Spec>
					<Spec label="input" note="rest · focus">
						<Field>{selection.name}</Field>
						<Field focus prefix="x">
							{selection.x}
						</Field>
						<Search />
					</Spec>
					<Spec label="segmented · toggle">
						<Segmented options={["Dark", "Light", "System"]} value={appearance === "dark" ? "Dark" : "Light"} />
						<div className="flex h-9 items-center gap-3">
							<Toggle on />
							<span className="t-label flex-1">Snap to grid</span>
							<Toggle on={false} />
						</div>
					</Spec>
				</div>

				{/* column 2 */}
				<div className="flex flex-col gap-4">
					<Spec label="sidebar" note="row 36 · ink here · thread held">
						<div className={cn("flex flex-col border-2", INK)}>
							<PageRow name="app" count={3} open current />
							<div className={cn("border-y-2", INK)}>
								<StateRow label="rest">
									<FrameRow index={1} name="menu" />
								</StateRow>
								<StateRow label="hover">
									<FrameRow index={1} name="menu" state="hover" />
								</StateRow>
								<StateRow label="selected">
									<FrameRow index={2} name="cart" state="selected" />
								</StateRow>
								<StateRow label="unseen">
									<FrameRow index={3} name="receipt" state="unseen" />
								</StateRow>
							</div>
							<PageRow name="site" count={2} presence />
						</div>
					</Spec>
					<Spec label="property row" note="label 64 · field 36">
						<PropRow label="position">
							<Field prefix="x" className="flex-1">
								{selection.x}
							</Field>
							<Field prefix="y" className="flex-1">
								{selection.y}
							</Field>
						</PropRow>
						<PropRow label="count">
							<Counter label="in" value={selection.flowsIn} />
							<Counter label="out" value={selection.flowsOut} />
						</PropRow>
					</Spec>
					<Spec label="toast">
						<div className="pr-[3px]">
							<Toast />
						</div>
					</Spec>
					<Spec label="canvas" note="selection · will · might">
						<div className="flex items-center gap-3">
							<span
								className={cn(
									"t-value flex h-6 items-center border-2 bg-(--b-thread) px-2 whitespace-nowrap text-(--b-on-fill)",
									INK,
								)}
							>
								{frameSize.w} × {frameSize.h}
							</span>
							<svg width="64" height="12" aria-hidden="true">
								<path d="M0 6H56" stroke="var(--b-ink)" strokeWidth="2" />
								<path d="M56 2 64 6 56 10z" fill="var(--b-ink)" />
							</svg>
							<svg width="64" height="12" aria-hidden="true">
								<path d="M0 6H56" stroke="var(--b-ink)" strokeWidth="2" strokeDasharray="5 4" />
								<path d="M56 2 64 6 56 10z" fill="var(--b-ink)" />
							</svg>
						</div>
					</Spec>
				</div>

				{/* column 3 */}
				<div className="flex flex-col gap-4">
					<Spec label="menu" note="row 36">
						<div className="pr-[3px]">
							<Menu />
						</div>
					</Spec>
					<Spec label="tab" note="ink = open">
						<div className={cn("flex h-11 border-2", INK)}>
							<TabCell name="kaffe" active />
							<TabCell name="tvärsö" />
						</div>
					</Spec>
					<Spec label="chip · avatar">
						<div className="flex flex-wrap items-center gap-2">
							<Chip kind="count">3</Chip>
							<Chip kind="live">live</Chip>
							<Chip kind="unseen">unseen</Chip>
							<Chip kind="will">will</Chip>
							<Chip kind="might">might</Chip>
							<Avatar />
						</div>
					</Spec>
					<Spec label="tooltip · toolbar">
						<Tooltip />
						<div className="flex">
							<Tools />
						</div>
					</Spec>
				</div>
			</div>

			<div className="grid grid-cols-[372px_1fr] gap-4">
				<Spec label="type" note="6 roles">
					<div className="flex flex-col">
						{TYPE.map((t) => (
							<div key={t.role} className="flex h-6 items-center gap-3">
								<span className="t-micro w-14 shrink-0 text-(--b-muted)">{t.role}</span>
								<span className={cn(t.cls, "min-w-0 flex-1 truncate")}>{t.sample}</span>
								<span className="t-micro shrink-0 text-(--b-muted)">{t.spec}</span>
							</div>
						))}
					</div>
				</Spec>
				<Spec label="colour" note="by role · text on fills is black">
					<div className="grid grid-cols-4 gap-2">
						{PALETTE.map((p) => {
							const hex = appearance === "dark" ? p.dark : p.light;
							return (
								<div key={p.name} className={cn("flex flex-col border-2", INK)}>
									<span className={cn("h-8 border-b-2", INK)} style={{ background: hex }} />
									<span className="flex flex-col gap-0.5 bg-(--b-field) px-1.5 py-1">
										<span className="t-micro truncate">{p.name}</span>
										<span className="t-micro text-(--b-muted)">{hex}</span>
									</span>
								</div>
							);
						})}
					</div>
				</Spec>
			</div>
			<div className="grid grid-cols-[372px_1fr] gap-4">
				<Spec label="space" note="4px base">
					<div className="flex h-9 items-end gap-4">
						{[4, 8, 12, 16, 24, 36, 44].map((n) => (
							<span key={n} className="flex flex-col items-start gap-1">
								<span className="block bg-(--b-ink)" style={{ width: n, height: 12 }} />
								<span className="t-micro text-(--b-muted)">{n}</span>
							</span>
						))}
					</div>
				</Spec>
				<Spec label="shape" note="the three rules">
					<div className="flex h-9 items-center gap-4">
						<span className={cn("t-micro flex h-9 flex-1 items-center justify-center border-2 bg-(--b-field)", INK)}>border 2</span>
						<span className={cn("t-micro flex h-9 flex-1 items-center justify-center border-2 bg-(--b-field)", INK)}>radius 0</span>
						<span className={cn("b-raised t-micro flex h-9 flex-1 items-center justify-center border-2 bg-(--b-field)", INK)}>
							shadow 3 3 0
						</span>
					</div>
				</Spec>
			</div>
		</div>
	);
}

function StateRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="relative">
			{children}
			<span
				className={cn(
					"t-micro pointer-events-none absolute top-1/2 right-14 -translate-y-1/2",
					label === "selected" ? "text-(--b-on-fill)" : "text-(--b-muted)",
				)}
			>
				{label}
			</span>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px]">
			<Board appearance="dark" />
			<div className="w-0" />
			<Board appearance="light" />
		</div>
	);
}
