/**
 * margin: one identity take. Editorial paper. Light is paper and ink, dark is ink and
 * paper. Serif for the project, the pages and the section heads, sans for controls,
 * mono for machine values. The red thread is a proofreader's pencil: underlines,
 * margin ticks, crop marks and rules, never a fill.
 *
 * Rules the parts sheet shows:
 * - spacing on 4px; list rows 28px everywhere (sidebar, properties, menus)
 * - corners: 2px on what you press, 0 on what holds, round only for people
 * - red marks the object and the place (selection, current tab, unseen, flows);
 *   ink marks a setting (active tool, segmented choice, toggle)
 * - fields are a rule under a value, not a box
 * - a leader runs from a name to its value; no value, no leader
 */
import "./margin.css";
import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
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
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";

/* ───────────────────────── icons: 16 grid, 1.25 stroke ───────────────────────── */

function Icon({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

const PlayGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="M5 3.5 12 8l-7 4.5Z" fill="currentColor" stroke="none" />
	</Icon>
);
const PlusGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="M8 3.5v9M3.5 8h9" />
	</Icon>
);
const SearchGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<circle cx="7" cy="7" r="4" />
		<path d="m10 10 3 3" />
	</Icon>
);
const PointerGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="M3.5 2.75 12.5 7.4l-4 1.1-1.9 4z" />
	</Icon>
);
const MarqueeGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="M3 3h2M7 3h2M11 3h2v2M13 7v2M13 11v2h-2M9 13H7M5 13H3v-2M3 9V7M3 5V3" />
	</Icon>
);
const HandGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="M5.5 8.5V4.25a1 1 0 0 1 2 0V7.5M7.5 7V3.25a1 1 0 0 1 2 0V7M9.5 7V4a1 1 0 0 1 2 0v4.75M11.5 6.5a1 1 0 0 1 2 0V9a4.5 4.5 0 0 1-4.5 4.5H8.5c-1.4 0-2.3-.5-3.2-1.4L3.4 10.2a1 1 0 0 1 1.4-1.4l.7.7" />
	</Icon>
);
const CogGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<circle cx="8" cy="8" r="2" />
		<path d="M8 2.5v1.5M8 12v1.5M2.5 8H4M12 8h1.5M4.1 4.1l1.06 1.06M10.84 10.84l1.06 1.06M4.1 11.9l1.06-1.06M10.84 5.16l1.06-1.06" />
	</Icon>
);
const ChevronGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="m5 6.5 3 3 3-3" />
	</Icon>
);
const CloseGlyph = ({ className }: { className?: string }) => (
	<Icon className={className}>
		<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
	</Icon>
);

/* ───────────────────────── primitives ───────────────────────── */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({
	kind,
	children,
	icon,
	className,
}: {
	kind: ButtonKind;
	children?: ReactNode;
	icon?: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"m-control inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[2px] px-3 whitespace-nowrap",
				kind === "primary" && "bg-(--m-fill) text-(--m-on-fill)",
				kind === "secondary" && "border border-(--m-rule-strong) text-(--m-ink)",
				kind === "ghost" && "px-2 text-(--m-ink)",
				kind === "danger" && "px-2 text-(--m-thread-text) underline decoration-(--m-thread) decoration-1 underline-offset-4",
				icon && "pl-2",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({ children, active }: { children: ReactNode; active?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex size-8 items-center justify-center rounded-[2px]",
				active ? "text-(--m-ink)" : "text-(--m-muted)",
			)}
		>
			{children}
			{active ? <span className="absolute bottom-1 left-1/2 h-px w-3 -translate-x-1/2 bg-(--m-ink)" /> : null}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="m-folio inline-flex h-4 items-center rounded-[2px] border border-(--m-rule) px-1 text-(--m-muted)">
			{children}
		</span>
	);
}

function Avatar({ size = 20, ring }: { size?: 16 | 20 | 24; ring?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full font-[var(--m-sans)] font-medium text-white",
				ring && "outline-2 outline-offset-0 outline-(--m-chrome)",
			)}
			style={{
				width: size,
				height: size,
				background: teammate.color,
				fontSize: size === 16 ? 8 : size === 20 ? 9 : 10,
				lineHeight: 1,
				letterSpacing: "0.02em",
			}}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "count" | "thread" }) {
	if (tone === "count") return <span className="m-value text-(--m-muted) tabular-nums">{children}</span>;
	return (
		<span
			className={cn(
				"m-folio inline-flex h-5 items-center gap-1.5 rounded-[2px] border px-1.5",
				tone === "plain" && "border-(--m-rule-strong) text-(--m-ink)",
				tone === "thread" && "border-(--m-thread) text-(--m-thread-text)",
			)}
		>
			{children}
		</span>
	);
}

/** a field is a rule under a value */
function Field({
	label,
	value,
	unit,
	className,
	trailing,
	muted,
}: {
	label?: string;
	value: string;
	unit?: string;
	className?: string;
	trailing?: ReactNode;
	muted?: boolean;
}) {
	return (
		<div className={cn("flex h-7 items-center gap-3 border-b border-(--m-rule)", className)}>
			{label ? <span className="m-folio w-3 shrink-0 text-(--m-muted)">{label}</span> : null}
			<span className={cn("m-value min-w-0 flex-1 truncate tabular-nums", muted ? "text-(--m-muted)" : "text-(--m-ink)")}>
				{value}
			</span>
			{unit ? <span className="m-folio text-(--m-muted)">{unit}</span> : null}
			{trailing}
		</div>
	);
}

function SearchField({ className }: { className?: string }) {
	return (
		<div className={cn("flex h-7 items-center gap-2 border-b border-(--m-rule) text-(--m-muted)", className)}>
			<SearchGlyph className="size-3.5" />
			<span className="m-control flex-1">Find a frame</span>
			<Kbd>{commandHint}</Kbd>
		</div>
	);
}

function Tab({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"m-control relative flex h-10 items-center px-3",
				active ? "text-(--m-ink)" : "text-(--m-muted)",
				home && "font-medium",
			)}
		>
			{name}
			{active ? <span className="absolute inset-x-3 -bottom-px h-[2px] bg-(--m-thread)" /> : null}
		</span>
	);
}

function Segmented({ value }: { value: "Dark" | "Light" | "System" }) {
	return (
		<div className="flex h-7 items-stretch rounded-[2px] border border-(--m-rule)">
			{(["Dark", "Light", "System"] as const).map((option, i) => (
				<span
					key={option}
					className={cn(
						"m-control relative flex items-center px-3",
						i > 0 && "border-l border-(--m-rule)",
						option === value ? "text-(--m-ink)" : "text-(--m-muted)",
					)}
				>
					{option}
					{option === value ? <span className="absolute inset-x-3 bottom-1 h-px bg-(--m-ink)" /> : null}
				</span>
			))}
		</div>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 items-center rounded-[2px] border",
				on ? "border-(--m-fill) bg-(--m-fill)" : "border-(--m-rule-strong)",
			)}
		>
			<span
				className={cn(
					"absolute top-[2px] size-[10px] rounded-[1px]",
					on ? "left-[14px] bg-(--m-on-fill)" : "left-[2px] bg-(--m-muted)",
				)}
			/>
		</span>
	);
}

/* ───────────────────────── the table of contents ───────────────────────── */

type RowState = "rest" | "hover" | "selected" | "unseen";

/** a frame entry: indented under its page, a margin tick when selected */
function FrameRow({ name, state }: { name: string; state: RowState }) {
	return (
		<div className={cn("relative flex h-7 items-center pr-5 pl-12", state === "hover" && "bg-(--m-wash)")}>
			{state === "selected" ? <span className="absolute top-1.5 bottom-1.5 left-5 w-[2px] bg-(--m-thread)" /> : null}
			<span
				className={cn(
					"m-value whitespace-nowrap",
					state === "selected" && "m-pencil text-(--m-ink)",
					state === "rest" && "text-(--m-muted)",
					state === "hover" && "text-(--m-ink)",
					state === "unseen" && "text-(--m-ink)",
				)}
			>
				{name}
			</span>
			{state === "unseen" ? (
				<>
					<span className="m-leader" />
					<span className="m-folio text-(--m-thread-text)">unseen</span>
				</>
			) : null}
		</div>
	);
}

function PageRow({
	index,
	name,
	count,
	current,
	presence,
}: {
	index: number;
	name: string;
	count: number;
	current?: boolean;
	presence?: boolean;
}) {
	return (
		<div className="flex h-7 items-center px-5">
			<span className={cn("m-folio w-7 shrink-0 tabular-nums", current ? "text-(--m-ink)" : "text-(--m-muted)")}>
				{String(index + 1).padStart(2, "0")}
			</span>
			<span className={cn("m-heading whitespace-nowrap", current ? "text-(--m-ink)" : "text-(--m-muted)")}>{name}</span>
			<span className="m-leader" />
			{presence ? (
				<span className="mr-2 inline-flex">
					<Avatar size={16} />
				</span>
			) : null}
			<span className={cn("m-value w-3 text-right tabular-nums", current ? "text-(--m-ink)" : "text-(--m-muted)")}>
				{count}
			</span>
		</div>
	);
}

function Sidebar() {
	return (
		<aside className="relative flex w-[264px] shrink-0 flex-col border-r border-(--m-rule) bg-(--m-chrome)">
			<div className="px-5 pt-7">
				<div className="m-folio text-(--m-muted)">{project.team.toLowerCase()}</div>
				<div className="m-display mt-1">{project.name}</div>
				<div className="m-folio mt-1.5 text-(--m-muted)">
					{project.frames} frames · {project.synced}
				</div>
			</div>
			<SearchField className="mx-5 mt-6" />

			<div className="mt-8 flex h-6 items-center justify-between px-5">
				<span className="m-heading-i text-(--m-muted)">Pages</span>
				<span className="text-(--m-muted)">
					<PlusGlyph className="size-3.5" />
				</span>
			</div>
			<div className="mt-2">
				{pages.map((page, i) => (
					<div key={page.name} className={cn(i > 0 && "mt-2")}>
						<PageRow
							index={i}
							name={page.name}
							count={page.count}
							current={page.current}
							presence={page.presence}
						/>
						{page.open ? (
							<div className="pb-2">
								{page.frames.map((f) => (
									<FrameRow
										key={f.name}
										name={f.name}
										state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"}
									/>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>

			<div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-between border-t border-(--m-rule) px-5">
				<span className="m-control flex items-center gap-2 text-(--m-muted)">
					<CogGlyph />
					Settings
				</span>
			</div>
		</aside>
	);
}

/* ───────────────────────── window top ───────────────────────── */

function TopBar() {
	return (
		<header className="relative flex h-10 shrink-0 items-center border-b border-(--m-rule) bg-(--m-chrome) pr-3 pl-5">
			<SpoolMark className="mr-3 h-[18px] w-[14px] text-(--m-thread)" />
			<Tab name="Home" />
			<span className="mx-1 h-4 w-px bg-(--m-rule)" />
			{tabs.map((t) => (
				<Tab key={t.name} name={t.name} active={t.active} />
			))}
			<span className="ml-1 text-(--m-muted)">
				<PlusGlyph className="size-3.5" />
			</span>
			<div className="ml-auto flex items-center gap-3">
				<span className="m-value text-(--m-muted) tabular-nums">{zoom}</span>
				<span className="h-4 w-px bg-(--m-rule)" />
				<Avatar size={20} />
				<Button kind="secondary">Share</Button>
				<Button kind="primary" icon={<PlayGlyph className="size-3.5" />}>
					Play
				</Button>
			</div>
		</header>
	);
}

/* ───────────────────────── the canvas ───────────────────────── */

const FRAME_TOP = 168;
const FRAME_X = [36, 340, 644] as const;
const W = drawnSize.w;
const H = drawnSize.h;

function FrameLabel({ name, x, selected, unseen }: { name: string; x: number; selected?: boolean; unseen?: boolean }) {
	return (
		<div className="absolute flex h-5 items-center justify-between" style={{ left: x, top: FRAME_TOP - 36, width: W }}>
			<span className={cn("m-value", selected ? "m-pencil text-(--m-ink)" : "text-(--m-muted)")}>{name}</span>
			{selected ? (
				<span className="m-value flex items-center gap-1 text-(--m-ink)">
					<PlayGlyph className="size-3" />
					play
				</span>
			) : null}
			{unseen ? (
				<span className="m-folio text-(--m-thread-text)">unseen</span>
			) : null}
		</div>
	);
}

function CanvasMarks() {
	const mid = FRAME_TOP + H / 2;
	const [mx, cx, rx] = FRAME_X;
	const sx = cx - 0.5;
	const sy = FRAME_TOP - 0.5;
	const ex = cx + W + 0.5;
	const ey = FRAME_TOP + H + 0.5;
	const gap = 4;
	const len = 8;
	const crop = [
		// top-left
		`M${sx - gap - len} ${sy}H${sx - gap}M${sx} ${sy - gap - len}V${sy - gap}`,
		// top-right
		`M${ex + gap} ${sy}H${ex + gap + len}M${ex} ${sy - gap - len}V${sy - gap}`,
		// bottom-left
		`M${sx - gap - len} ${ey}H${sx - gap}M${sx} ${ey + gap}V${ey + gap + len}`,
		// bottom-right
		`M${ex + gap} ${ey}H${ex + gap + len}M${ex} ${ey + gap}V${ey + gap + len}`,
	].join("");
	const dimY = ey + 28;
	const a1 = { x1: mx + W + 8, x2: cx - 10 };
	const a2 = { x1: cx + W + 10, x2: rx - 8 };
	return (
		<svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
			{/* flows: the thread itself */}
			<path d={`M${a1.x1} ${mid}H${a1.x2}`} stroke="var(--m-thread)" strokeWidth="1.25" />
			<path d={`M${a1.x2 - 5} ${mid - 3.5}L${a1.x2} ${mid}L${a1.x2 - 5} ${mid + 3.5}`} fill="none" stroke="var(--m-thread)" strokeWidth="1.25" />
			<path d={`M${a2.x1} ${mid}H${a2.x2}`} stroke="var(--m-thread)" strokeWidth="1.25" strokeDasharray="3 3" />
			<path d={`M${a2.x2 - 5} ${mid - 3.5}L${a2.x2} ${mid}L${a2.x2 - 5} ${mid + 3.5}`} fill="none" stroke="var(--m-thread)" strokeWidth="1.25" />
			{/* selection: a red rule round the frame, crop marks at its corners */}
			<rect x={sx} y={sy} width={W + 1} height={H + 1} fill="none" stroke="var(--m-thread)" strokeWidth="1" />
			<path d={crop} stroke="var(--m-thread)" strokeWidth="1" fill="none" />
			{/* dimension line */}
			<path d={`M${sx} ${dimY}H${ex}M${sx} ${dimY - 4}V${dimY + 4}M${ex} ${dimY - 4}V${dimY + 4}`} stroke="var(--m-thread)" strokeWidth="1" />
		</svg>
	);
}

function Toolbar() {
	return (
		<div className="absolute bottom-5 left-1/2 flex h-10 -translate-x-1/2 items-center gap-1 border border-(--m-rule) bg-(--m-chrome) px-1">
			<IconButton active>
				<PointerGlyph />
			</IconButton>
			<IconButton>
				<MarqueeGlyph />
			</IconButton>
			<IconButton>
				<HandGlyph />
			</IconButton>
		</div>
	);
}

function Canvas() {
	const mid = FRAME_TOP + H / 2;
	const [mx, cx, rx] = FRAME_X;
	return (
		<main className="m-desk relative min-w-0 flex-1 overflow-hidden">
			{canvasFrames.map((f, i) => (
				<div key={f.name}>
					<FrameLabel
						name={f.name}
						x={FRAME_X[i]}
						selected={"selected" in f ? f.selected : undefined}
						unseen={"unseen" in f ? f.unseen : undefined}
					/>
					<div className="absolute" style={{ left: FRAME_X[i], top: FRAME_TOP, width: W, height: H }}>
						<CoffeeScreen screen={f.screen} />
					</div>
				</div>
			))}
			<CanvasMarks />
			{/* flow words, set above each thread */}
			<span className="m-folio absolute text-center text-(--m-muted)" style={{ left: mx + W, width: cx - mx - W, top: mid - 20 }}>
				{flows[0].certainty}
			</span>
			<span className="m-folio absolute text-center text-(--m-muted)" style={{ left: cx + W, width: rx - cx - W, top: mid - 20 }}>
				{flows[1].certainty}
			</span>
			<span
				className="m-value absolute flex justify-center"
				style={{ left: cx, width: W, top: FRAME_TOP + H + 0.5 + 28 - 8 }}
			>
				<span className="bg-(--m-canvas) px-2 text-(--m-thread-text) tabular-nums">
					{frameSize.w} × {frameSize.h}
				</span>
			</span>
			<Toolbar />
		</main>
	);
}

/* ───────────────────────── properties ───────────────────────── */

function Section({ title, aside, children, className }: { title: string; aside?: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("mt-7", className)}>
			<div className="flex h-6 items-baseline justify-between">
				<span className="m-heading-i text-(--m-ink)">{title}</span>
				{aside ? <span className="m-folio text-(--m-muted)">{aside}</span> : null}
			</div>
			<div className="mt-1">{children}</div>
		</section>
	);
}

function FlowRow({ dir, name, certainty }: { dir: "in" | "out"; name: string; certainty: "will" | "might" }) {
	return (
		<div className="flex h-7 items-center gap-3 border-b border-(--m-rule)">
			<span className="m-folio w-6 shrink-0 text-(--m-muted)">{dir}</span>
			<svg width="20" height="8" className="shrink-0" aria-hidden="true">
				<path d="M0 4H18" stroke="var(--m-thread)" strokeWidth="1.25" strokeDasharray={certainty === "might" ? "3 2" : undefined} />
				<path d="M14.5 1 18 4 14.5 7" stroke="var(--m-thread)" strokeWidth="1.25" fill="none" />
			</svg>
			<span className="m-value flex-1 text-(--m-ink)">{name}</span>
			<span className="m-folio text-(--m-muted)">{certainty}</span>
		</div>
	);
}

function Properties() {
	const flowIn = flows.find((f) => f.to === selection.name)!;
	const flowOut = flows.find((f) => f.from === selection.name)!;
	return (
		<aside className="w-[272px] shrink-0 border-l border-(--m-rule) bg-(--m-chrome) px-5 pt-7">
			<div className="m-folio text-(--m-muted)">frame</div>
			<div className="m-display mt-1">{selection.name}</div>
			<div className="m-value mt-1.5 truncate text-(--m-muted)">{selection.path}</div>

			<Section title="Position" aside="frame.json">
				<div className="grid grid-cols-2 gap-x-5">
					<Field label="x" value={String(selection.x)} unit="px" />
					<Field label="y" value={String(selection.y)} unit="px" />
				</div>
			</Section>
			<Section title="Size" aside="frame.json">
				<div className="grid grid-cols-2 gap-x-5">
					<Field label="w" value={String(selection.w)} unit="px" />
					<Field label="h" value={String(selection.h)} unit="px" />
				</div>
			</Section>
			<Section title="Flows" aside={`${selection.flowsIn} in · ${selection.flowsOut} out`}>
				<FlowRow dir="in" name={flowIn.from} certainty={flowIn.certainty} />
				<FlowRow dir="out" name={flowOut.to} certainty={flowOut.certainty} />
			</Section>
			<Section title="Scenario">
				<Field value={selection.scenario} trailing={<ChevronGlyph className="size-3.5 text-(--m-muted)" />} />
			</Section>
		</aside>
	);
}

/* ───────────────────────── frames ───────────────────────── */

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-margin flex h-full w-full flex-col overflow-hidden" data-appearance={appearance}>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Properties />
			</div>
		</div>
	);
}

/* ───────────────────────── parts ───────────────────────── */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={className}>
			<div className="m-folio mb-2.5 whitespace-nowrap text-(--m-muted)">{label}</div>
			{children}
		</div>
	);
}

function Under({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col items-start gap-1.5">
			{children}
			<span className="m-folio text-(--m-muted)">{label}</span>
		</div>
	);
}

/** the canvas marks at specimen size: flows in and out, the selection, its size */
function SelectionSpecimen() {
	const x = 76;
	const y = 12;
	const w = 96;
	const h = 40;
	const g = 4;
	const l = 8;
	const r = x + w + 0.5;
	const b = y + h + 0.5;
	const sx = x - 0.5;
	const sy = y - 0.5;
	const mid = y + h / 2;
	return (
		<div className="relative h-[84px] w-[296px]">
			<svg className="absolute inset-0 size-full" aria-hidden="true">
				<path d={`M8 ${mid}H${sx - 10}`} stroke="var(--m-thread)" strokeWidth="1.25" />
				<path d={`M${sx - 15} ${mid - 3.5}L${sx - 10} ${mid}L${sx - 15} ${mid + 3.5}`} fill="none" stroke="var(--m-thread)" strokeWidth="1.25" />
				<path d={`M${r + 10} ${mid}H${r + 70}`} stroke="var(--m-thread)" strokeWidth="1.25" strokeDasharray="3 3" />
				<path d={`M${r + 65} ${mid - 3.5}L${r + 70} ${mid}L${r + 65} ${mid + 3.5}`} fill="none" stroke="var(--m-thread)" strokeWidth="1.25" />
				<rect x={x} y={y} width={w} height={h} fill="var(--m-raised)" stroke="var(--m-rule)" />
				<rect x={sx} y={sy} width={w + 1} height={h + 1} fill="none" stroke="var(--m-thread)" />
				<path
					d={`M${sx - g - l} ${sy}H${sx - g}M${sx} ${sy - g - l}V${sy - g}M${r + g} ${sy}H${r + g + l}M${r} ${sy - g - l}V${sy - g}M${sx - g - l} ${b}H${sx - g}M${sx} ${b + g}V${b + g + l}M${r + g} ${b}H${r + g + l}M${r} ${b + g}V${b + g + l}`}
					stroke="var(--m-thread)"
					fill="none"
				/>
				<path d={`M${sx} ${b + 22}H${r}M${sx} ${b + 18}V${b + 26}M${r} ${b + 18}V${b + 26}`} stroke="var(--m-thread)" />
			</svg>
			<span className="m-folio absolute text-(--m-muted)" style={{ left: 8, top: mid - 16 }}>
				will
			</span>
			<span className="m-folio absolute text-(--m-muted)" style={{ left: r + 10, top: mid - 16 }}>
				might
			</span>
			<span className="m-folio absolute flex justify-center" style={{ left: x, width: w, top: b + 16 }}>
				<span className="bg-(--m-chrome) px-1.5 text-(--m-thread-text)">390 × 844</span>
			</span>
		</div>
	);
}

function ContextMenu() {
	return (
		<div className="w-[200px] border border-(--m-rule) bg-(--m-raised) py-1" style={{ boxShadow: "var(--m-lift)" }}>
			{menuItems.map((item) => (
				<div key={item.label}>
					{item.danger ? <div className="my-1 h-px bg-(--m-rule)" /> : null}
					<div
						className={cn(
							"m-control flex h-7 items-center justify-between px-3",
							item.label === "Duplicate" && "bg-(--m-wash)",
							item.danger ? "text-(--m-thread-text)" : "text-(--m-ink)",
						)}
					>
						<span>{item.label}</span>
						<span className="m-folio text-(--m-muted)">{item.key}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Toast() {
	const [name, ...rest] = toast.text.split(" ");
	return (
		<div className="flex h-10 w-[280px] items-center gap-3 rounded-[2px] bg-(--m-fill) pr-2 pl-3 text-(--m-on-fill)">
			<span className="m-control flex-1">
				<span className="m-value">{name}</span> {rest.join(" ")}
			</span>
			<span className="m-control px-2 underline decoration-1 underline-offset-4">{toast.action}</span>
			<CloseGlyph className="size-3.5 opacity-60" />
		</div>
	);
}

function Tooltip() {
	return (
		<div className="flex flex-col items-center">
			<span className="m-caption flex h-6 items-center gap-2 rounded-[2px] bg-(--m-fill) px-2 text-(--m-on-fill)">
				Hand
				<span className="m-folio opacity-60">H</span>
			</span>
			<svg width="8" height="4" aria-hidden="true">
				<path d="M0 0h8L4 4Z" fill="var(--m-fill)" />
			</svg>
			<span className="text-(--m-muted)">
				<HandGlyph />
			</span>
		</div>
	);
}

const PALETTE: Array<{ name: string; dark: string; light: string; v: string }> = [
	{ name: "chrome", dark: "#1d1c19", light: "#f3f0ea", v: "--m-chrome" },
	{ name: "canvas", dark: "#171614", light: "#e8e3d9", v: "--m-canvas" },
	{ name: "raised", dark: "#262421", light: "#fbf9f5", v: "--m-raised" },
	{ name: "wash", dark: "#262420", light: "#e9e5dc", v: "--m-wash" },
	{ name: "rule", dark: "#33302b", light: "#dbd5c9", v: "--m-rule" },
	{ name: "rule-strong", dark: "#4a463f", light: "#b8b0a1", v: "--m-rule-strong" },
	{ name: "ink", dark: "#ece7dd", light: "#1c1a16", v: "--m-ink" },
	{ name: "muted", dark: "#9c968b", light: "#6b665c", v: "--m-muted" },
	{ name: "faint", dark: "#5e5950", light: "#aaa396", v: "--m-faint" },
	{ name: "thread", dark: "#f5391a", light: "#f5391a", v: "--m-thread" },
	{ name: "thread-text", dark: "#ff5a3d", light: "#c42c10", v: "--m-thread-text" },
	{ name: "teammate", dark: "#3b82f6", light: "#3b82f6", v: "--m-teammate" },
];

const TYPE: Array<{ role: string; cls: string; sample: string; spec: string }> = [
	{ role: "display", cls: "m-display", sample: "kaffe", spec: "serif 28/32" },
	{ role: "heading", cls: "m-heading", sample: "app, Position", spec: "serif 18/24" },
	{ role: "control", cls: "m-control", sample: "Move to page", spec: "sans 13/20" },
	{ role: "caption", cls: "m-caption", sample: "Ada Lindqvist is on site.", spec: "sans 12/16" },
	{ role: "value", cls: "m-value", sample: "frames/app/cart", spec: "mono 12/16" },
	{ role: "folio", cls: "m-folio", sample: "01 · 390 × 844 · unseen", spec: "mono 10/12" },
];

function Board({ appearance }: { appearance: Appearance }) {
	const light = appearance === "light";
	return (
		<div className="id-margin relative h-full w-[720px] shrink-0 px-8 pt-6" data-appearance={appearance}>
			<header className="flex items-end justify-between border-b border-(--m-rule) pb-3">
				<div className="flex items-end gap-3">
					<SpoolMark className="mb-1.5 h-[22px] w-[17px] text-(--m-thread)" />
					<span className="m-display">margin</span>
				</div>
				<span className="m-folio mb-1 text-(--m-muted)">{light ? "paper · light" : "ink · dark"} · 4px grid · rows 28</span>
			</header>

			<div className="mt-5 grid grid-cols-[296px_328px] gap-x-8">
				{/* column a */}
				<div className="flex flex-col gap-5">
					<Spec label="buttons · 2px corners on what you press">
						<div className="flex flex-wrap items-start gap-x-3 gap-y-3">
							<Under label="primary">
								<Button kind="primary" icon={<PlayGlyph className="size-3.5" />}>
									Play
								</Button>
							</Under>
							<Under label="secondary">
								<Button kind="secondary">Share</Button>
							</Under>
							<Under label="ghost">
								<Button kind="ghost">Cancel</Button>
							</Under>
							<Under label="icon">
								<span className="inline-flex size-7 items-center justify-center rounded-[2px] border border-(--m-rule) text-(--m-ink)">
									<PlusGlyph />
								</span>
							</Under>
							<Under label="danger">
								<Button kind="danger">Move to Trash</Button>
							</Under>
						</div>
					</Spec>

					<Spec label="fields · a rule under a value">
						<div className="grid grid-cols-2 gap-x-5">
							<Under label="text">
								<Field value="cart" className="w-full min-w-[150px]" />
							</Under>
							<Under label="search">
								<SearchField className="w-[156px]" />
							</Under>
						</div>
					</Spec>

					<Spec label="settings · ink marks a setting">
						<div className="flex items-start gap-6">
							<Under label="segmented">
								<Segmented value={light ? "Light" : "Dark"} />
							</Under>
							<Under label="toggle">
								<span className="flex h-7 items-center gap-3">
									<Toggle on />
									<Toggle on={false} />
								</span>
							</Under>
						</div>
					</Spec>

					<div className="flex items-start gap-8">
						<Spec label="tab · red is the place">
							<div className="flex border-b border-(--m-rule)">
								<Tab name="kaffe" active />
								<Tab name="tvärsö" />
							</div>
						</Spec>
						<Spec label="chips">
							<div className="flex h-10 items-center gap-3">
								<Chip tone="count">3</Chip>
								<Chip>
									<span className="size-[5px] rounded-full bg-(--m-ink)" />
									live
								</Chip>
								<Chip tone="thread">unseen</Chip>
							</div>
						</Spec>
					</div>

					<Spec label="sidebar rows · 28 · a leader runs to a value">
						<div className="relative w-[240px] border-y border-(--m-rule)">
							{(["rest", "hover", "selected", "unseen"] as const).map((s) => (
								<div key={s} className="relative">
									<FrameRow name={s === "rest" ? "menu" : s === "unseen" ? "receipt" : "cart"} state={s} />
									<span className="m-folio absolute top-2 left-[248px] text-(--m-muted)">{s}</span>
								</div>
							))}
							<div className="mt-1">
								<PageRow index={1} name="site" count={2} presence />
							</div>
						</div>
					</Spec>

					<Spec label="property row">
						<div className="w-[260px]">
							<div className="grid grid-cols-2 gap-x-5">
								<Field label="x" value="325" unit="px" />
								<Field label="y" value="170" unit="px" />
							</div>
							<FlowRow dir="out" name="receipt" certainty="might" />
						</div>
					</Spec>

					<Spec label="selection · a red rule, crop marks, a dimension">
						<SelectionSpecimen />
					</Spec>
				</div>

				{/* column b */}
				<div className="flex flex-col gap-6">
					<div className="flex items-start gap-6">
						<Spec label="context menu">
							<ContextMenu />
						</Spec>
						<div className="flex flex-col gap-6">
							<Spec label="tooltip">
								<Tooltip />
							</Spec>
							<Spec label="avatar">
								<div className="flex items-center gap-2">
									<Avatar size={24} />
									<Avatar size={20} />
									<Avatar size={16} />
								</div>
							</Spec>
						</div>
					</div>

					<Spec label="toast">
						<Toast />
					</Spec>

					<Spec label="type · six roles">
						<div className="flex flex-col">
							{TYPE.map((t) => (
								<div key={t.role} className="flex min-h-9 items-center border-b border-(--m-rule) py-1">
									<span className="m-folio w-14 shrink-0 text-(--m-muted)">{t.role}</span>
									<span className={cn(t.cls, "min-w-0 flex-1 truncate")}>{t.sample}</span>
									<span className="m-folio text-(--m-muted)">{t.spec}</span>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="palette">
						<div className="grid grid-cols-4 gap-x-3 gap-y-3">
							{PALETTE.map((p) => (
								<div key={p.name}>
									<div className="h-6 border border-(--m-rule)" style={{ background: `var(${p.v})` }} />
									<div className="m-folio mt-1.5 text-(--m-ink)">{p.name}</div>
									<div className="m-folio mt-0.5 text-(--m-muted)">{light ? p.light : p.dark}</div>
								</div>
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
		<div className="flex h-full w-full">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}
