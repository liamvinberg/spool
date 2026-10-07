import "./swiss.css";
import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	canvasFrames,
	commandHint,
	drawnSize,
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
import type { Appearance, Page, PageFrame } from "shared/lib/explore/identity/world";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";

/*
 * swiss — the International Typographic Style as spool's system.
 * Rules the Parts sheet shows and the canvas obeys:
 *  unit 4 · row 32 · control 32 · chrome 48 · radius 0 · margin 16
 *  2px ink rule opens a section, 1px hairline separates rows
 *  red = the selected thing and what needs a look (selection, unseen, primary)
 *  ink = the chosen mode (active tool, segment, toggle, tab rule)
 */

const RED = "#f5391a";

const c = {
	bg: "bg-[var(--s-bg)]",
	canvas: "bg-[var(--s-canvas)]",
	raised: "bg-[var(--s-raised)]",
	hover: "bg-[var(--s-hover)]",
	lineBg: "bg-[var(--s-line)]",
	inkBg: "bg-[var(--s-ink)]",
	redBg: "bg-[var(--s-thread)]",
	ink: "text-[var(--s-ink)]",
	muted: "text-[var(--s-muted)]",
	onInk: "text-[var(--s-on-ink)]",
	onRed: "text-[var(--s-on-thread)]",
	red: "text-[var(--s-thread)]",
	line: "border-[var(--s-line)]",
	inkBorder: "border-[var(--s-ink)]",
};

/* ---------- icons: 16 grid, 1.5 stroke, square ends ---------- */

function Icon({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="square"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

const PlayGlyph = ({ className }: { className?: string }) => (
	<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true">
		<path d="M4 2.5v11L13 8Z" fill="currentColor" />
	</svg>
);
const PointerGlyph = () => (
	<svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
		<path d="M3 2v11.5l3.2-3.1 2.1 4.6 2-.9-2.1-4.5H12.5Z" fill="currentColor" />
	</svg>
);
const MarqueeGlyph = () => (
	<Icon>
		<path d="M2.75 2.75h2M7 2.75h2M11.25 2.75h2v2M13.25 7v2M13.25 11.25v2h-2M9 13.25H7M4.75 13.25h-2v-2M2.75 9V7M2.75 4.75v-2" />
	</Icon>
);
const HandGlyph = () => (
	<Icon>
		<path d="M5 8.5V3.75M7.5 7.5V2.75M10 7.5V3.75M12.5 8.5V5.5M5 8.5 3 7v2.5l3 4h6.5v-5" />
	</Icon>
);
const PlusGlyph = () => (
	<Icon>
		<path d="M8 3v10M3 8h10" />
	</Icon>
);
const SearchGlyph = () => (
	<Icon>
		<path d="M7 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5ZM10.25 10.25l3 3" />
	</Icon>
);
const CloseGlyph = ({ className }: { className?: string }) => (
	<Icon className={cn("size-3", className)}>
		<path d="M4 4l8 8M12 4l-8 8" />
	</Icon>
);
const DotsGlyph = () => (
	<svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
		<path d="M2.5 7h2v2h-2zM7 7h2v2H7zM11.5 7h2v2h-2z" fill="currentColor" />
	</svg>
);
const Caret = ({ open }: { open?: boolean }) => (
	<Icon className={cn("size-3", open ? "rotate-90" : "")}>
		<path d="M6 3.5 10.5 8 6 12.5" />
	</Icon>
);
const ShareGlyph = () => (
	<Icon>
		<path d="M8 10V2.75M4.75 6 8 2.75 11.25 6M3 9.5v3.75h10V9.5" />
	</Icon>
);

/* ---------- primitives ---------- */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind, children, className }: { kind: ButtonKind; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"s-strong inline-flex h-8 shrink-0 items-center gap-2 px-3 whitespace-nowrap",
				kind === "primary" && [c.redBg, c.onRed],
				kind === "secondary" && ["border", c.inkBorder, c.ink],
				kind === "ghost" && c.ink,
				kind === "danger" && ["border border-[var(--s-thread)]", c.red],
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
				"inline-flex size-8 shrink-0 items-center justify-center",
				active ? [c.inkBg, c.onInk] : c.ink,
				className,
			)}
		>
			{children}
		</span>
	);
}

function Avatar({ size = 20 }: { size?: 16 | 20 | 32 }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center text-white",
				size === 32 ? "s-strong tracking-[0.04em]" : "s-label tracking-[0.04em]",
				size === 16 && "text-[8px]",
			)}
			style={{ width: size, height: size, background: teammate.color }}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function UnseenMark({ className }: { className?: string }) {
	return <span className={cn("inline-block size-1.5 shrink-0", c.redBg, className)} />;
}

function Kbd({ children, inverse }: { children: ReactNode; inverse?: boolean }) {
	return (
		<span
			className={cn(
				"s-note inline-flex h-4 items-center px-1",
				inverse ? "border border-current opacity-70" : ["border", c.line, c.muted],
			)}
		>
			{children}
		</span>
	);
}

/** A section opens on a 2px ink rule with a numbered label row. */
function SectionHead({ index, label, aside }: { index?: string; label: string; aside?: ReactNode }) {
	return (
		<div className={cn("flex h-8 items-center gap-3 border-t-2", c.inkBorder)}>
			{index ? <span className={cn("s-note w-5", c.muted)}>{index}</span> : null}
			<span className="s-label">{label}</span>
			<span className="flex-1" />
			{aside}
		</div>
	);
}

function Hairline({ className }: { className?: string }) {
	return <div className={cn("h-px", c.lineBg, className)} />;
}

function SearchField({ className }: { className?: string }) {
	return (
		<div className={cn("flex h-8 items-center gap-2 px-2", c.raised, className)}>
			<span className={c.muted}>
				<SearchGlyph />
			</span>
			<span className={cn("s-body flex-1", c.muted)}>Search frames</span>
			<Kbd>{commandHint}</Kbd>
		</div>
	);
}

/* ---------- sidebar rows ---------- */

type RowState = "rest" | "hover" | "selected" | "unseen";

function FrameRow({
	index,
	frame,
	state,
	className,
}: { index: string; frame: PageFrame; state: RowState; className?: string }) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"flex h-8 items-center pr-4 pl-12",
				selected && [c.redBg, c.onRed],
				state === "hover" && c.hover,
				className,
			)}
		>
			<span className={cn("s-note w-8", selected ? "text-white/70" : c.muted)}>{index}</span>
			<span className={cn(state === "unseen" ? "s-strong" : "s-body", "flex-1 truncate")}>{frame.name}</span>
			{selected ? <PlayGlyph className="size-3" /> : null}
			{state === "unseen" ? <UnseenMark /> : null}
		</div>
	);
}

function PageRow({ index, page }: { index: string; page: Page }) {
	return (
		<div className="flex h-8 items-center gap-0 px-4">
			<span className={cn("s-note w-8", page.open ? c.ink : c.muted)}>{index}</span>
			<span className="s-strong flex-1 truncate">{page.name}</span>
			{page.presence ? (
				<span className="mr-3 flex items-center">
					<Avatar size={16} />
				</span>
			) : null}
			<span className={cn("s-data w-6 text-right", c.muted)}>{page.count}</span>
			<span className={cn("ml-2 flex w-3 justify-center", c.muted)}>
				<Caret open={page.open} />
			</span>
		</div>
	);
}

function Sidebar() {
	return (
		<aside className={cn("flex w-[280px] shrink-0 flex-col border-r", c.line, c.bg)}>
			<div className="px-4 pt-4 pb-6">
				<div className="flex h-4 items-center justify-between">
					<span className={cn("s-label", c.muted)}>Project</span>
					<span className={cn("s-label", c.muted)}>{project.team}</span>
				</div>
				<div className="s-display mt-3">{project.name}</div>
				<div className={cn("s-data mt-2", c.muted)}>
					{project.frames} frames · {project.synced}
				</div>
				<SearchField className="mt-6" />
			</div>
			<div className="px-4">
				<SectionHead
					label="Pages"
					aside={<span className={cn("s-data", c.muted)}>{pages.length}</span>}
				/>
			</div>
			<div className="flex flex-col">
				{pages.map((page, i) => (
					<div key={page.name}>
						<Hairline className="mx-4" />
						<PageRow index={String(i + 1).padStart(2, "0")} page={page} />
						{page.open
							? page.frames.map((frame, j) => (
									<FrameRow
										key={frame.name}
										index={`${i + 1}.${j + 1}`}
										frame={frame}
										state={frame.selected ? "selected" : frame.unseen ? "unseen" : "rest"}
									/>
								))
							: null}
					</div>
				))}
				<Hairline className="mx-4" />
			</div>
			<div className="flex-1" />
			<div className="px-4 pb-4">
				<SectionHead label="Here now" aside={<span className={cn("s-data", c.muted)}>1</span>} />
				<div className="flex h-8 items-center gap-3">
					<Avatar />
					<span className="s-body flex-1">{teammate.name}</span>
					<span className={cn("s-data", c.muted)}>{teammate.page}</span>
				</div>
			</div>
		</aside>
	);
}

/* ---------- top bar ---------- */

function Tab({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<div
			className={cn(
				"relative flex items-center gap-3 border-r px-4",
				c.line,
				active ? ["s-strong", c.ink] : ["s-body", c.muted],
			)}
		>
			<span>{name}</span>
			{active && !home ? (
				<span className={c.muted}>
					<CloseGlyph />
				</span>
			) : null}
			{active ? <span className={cn("absolute inset-x-0 -bottom-px h-0.5", c.inkBg)} /> : null}
		</div>
	);
}

function TopBar() {
	return (
		<header className={cn("flex h-12 shrink-0 items-stretch border-b", c.line, c.bg)}>
			<div className={cn("flex w-12 items-center justify-center border-r", c.line)}>
				<SpoolMark className="h-5 w-4 text-[#f5391a]" />
			</div>
			<Tab name="Home" home />
			{tabs.map((t) => (
				<Tab key={t.name} name={t.name} active={t.active} />
			))}
			<div className={cn("flex w-12 items-center justify-center", c.muted)}>
				<PlusGlyph />
			</div>
			<div className="flex-1" />
			<div className="flex items-center gap-4 pr-2">
				<span className={cn("s-data", c.muted)}>{zoom}</span>
				<div className={cn("h-6 w-px", c.lineBg)} />
				<Avatar />
				<Button kind="secondary">
					<ShareGlyph />
					Share
				</Button>
				<Button kind="primary">
					<PlayGlyph className="size-3" />
					Play
				</Button>
			</div>
		</header>
	);
}

/* ---------- canvas ---------- */

const FRAME_TOP = 168;
const FRAME_LEFT = [48, 360, 672];
const FLOW_Y = FRAME_TOP + 196;

function FrameLabel({ index, name, left, selected, unseen }: {
	index: string;
	name: string;
	left: number;
	selected?: boolean;
	unseen?: boolean;
}) {
	if (selected) {
		return (
			<div className="absolute flex h-6 items-stretch" style={{ left: left - 2, top: FRAME_TOP - 34, width: drawnSize.w + 4 }}>
				<div className={cn("flex items-center gap-3 px-2", c.redBg, c.onRed)}>
					<span className="s-note text-white/70">{index}</span>
					<span className="s-strong">{name}</span>
				</div>
				<div className="flex-1" />
				<div className={cn("flex items-center gap-1.5 px-2", c.redBg, c.onRed)}>
					<PlayGlyph className="size-3" />
					<span className="s-strong">Play</span>
				</div>
			</div>
		);
	}
	return (
		<div className="absolute flex h-6 items-center gap-3" style={{ left, top: FRAME_TOP - 34 }}>
			<span className={cn("s-note", c.muted)}>{index}</span>
			<span className={cn(unseen ? "s-strong" : "s-body", c.ink)}>{name}</span>
			{unseen ? (
				<span className="flex items-center gap-1.5">
					<UnseenMark />
					<span className={cn("s-note", c.red)}>unseen</span>
				</span>
			) : null}
		</div>
	);
}

function FlowArrow({ x1, x2, y, label, dashed }: { x1: number; x2: number; y: number; label: string; dashed?: boolean }) {
	return (
		<>
			<svg className={cn("pointer-events-none absolute", c.ink)} style={{ left: x1, top: y - 6, width: x2 - x1, height: 12 }} aria-hidden="true">
				<line
					x1={0}
					x2={x2 - x1 - 7}
					y1={6}
					y2={6}
					stroke="currentColor"
					strokeWidth={2}
					strokeDasharray={dashed ? "4 4" : undefined}
				/>
				<path d={`M${x2 - x1 - 8} 1 L${x2 - x1} 6 L${x2 - x1 - 8} 11 Z`} fill="currentColor" />
			</svg>
			<span className={cn("s-note absolute", c.muted)} style={{ left: x1, top: y - 22 }}>
				{label}
			</span>
		</>
	);
}

function Toolbar() {
	return (
		<div className={cn("absolute bottom-4 left-4 flex items-center border", c.line, c.bg)}>
			<IconButton active>
				<PointerGlyph />
			</IconButton>
			<IconButton className={c.muted}>
				<MarqueeGlyph />
			</IconButton>
			<IconButton className={c.muted}>
				<HandGlyph />
			</IconButton>
		</div>
	);
}

function Canvas() {
	const sel = FRAME_LEFT[1]!;
	return (
		<main className={cn("relative flex-1 overflow-hidden", c.canvas)}>
			<div className="absolute top-4 left-4 flex items-center gap-3">
				<span className={cn("s-data", c.muted)}>{project.name} /</span>
				<span className="s-data">app</span>
			</div>
			{canvasFrames.map((f, i) => (
				<div key={f.name}>
					<FrameLabel
						index={String(i + 1).padStart(2, "0")}
						name={f.name}
						left={FRAME_LEFT[i]!}
						selected={"selected" in f}
						unseen={"unseen" in f}
					/>
					<div className="absolute" style={{ left: FRAME_LEFT[i], top: FRAME_TOP, width: drawnSize.w, height: drawnSize.h }}>
						<CoffeeScreen screen={f.screen} />
					</div>
				</div>
			))}
			{/* selection: 2px red frame, square red handles, red size block flush left */}
			<div
				className="pointer-events-none absolute border-2"
				style={{ left: sel - 2, top: FRAME_TOP - 2, width: drawnSize.w + 4, height: drawnSize.h + 4, borderColor: RED }}
			>
				{[
					["-left-[5px]", "-top-[5px]"],
					["-right-[5px]", "-top-[5px]"],
					["-left-[5px]", "-bottom-[5px]"],
					["-right-[5px]", "-bottom-[5px]"],
				].map(([x, y]) => (
					<span key={`${x}${y}`} className={cn("absolute size-2", c.redBg, x, y)} />
				))}
			</div>
			<div
				className={cn("s-data absolute flex h-6 items-center px-2", c.redBg, c.onRed)}
				style={{ left: sel - 2, top: FRAME_TOP + drawnSize.h + 10 }}
			>
				{frameSize.w} × {frameSize.h}
			</div>
			<FlowArrow x1={FRAME_LEFT[0]! + drawnSize.w + 8} x2={sel - 8} y={FLOW_Y} label="will" />
			<FlowArrow x1={sel + drawnSize.w + 8} x2={FRAME_LEFT[2]! - 8} y={FLOW_Y} label="might" dashed />
			<Toolbar />
		</main>
	);
}

/* ---------- properties ---------- */

function PropCell({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
	return (
		<div className="flex-1">
			<div className="flex h-8 items-center">
				<span className={cn("s-data w-6", c.muted)}>{label}</span>
				<span className="s-data flex-1">{value}</span>
				{unit ? <span className={cn("s-note", c.muted)}>{unit}</span> : null}
			</div>
			<Hairline />
		</div>
	);
}

function FlowRow({ dir, other, certainty }: { dir: string; other: string; certainty: "will" | "might" }) {
	return (
		<>
			<div className="flex h-8 items-center">
				<span className={cn("s-data w-10", c.muted)}>{dir}</span>
				<span className="s-body flex-1">{other}</span>
				<svg width="24" height="4" className={cn("mr-3", c.ink)} aria-hidden="true">
					<line x1="0" x2="24" y1="2" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray={certainty === "might" ? "4 4" : undefined} />
				</svg>
				<span className={cn("s-data w-10 text-right", c.muted)}>{certainty}</span>
			</div>
			<Hairline />
		</>
	);
}

function Properties() {
	return (
		<aside className={cn("flex w-[280px] shrink-0 flex-col border-l px-4", c.line, c.bg)}>
			<div className="pt-4 pb-6">
				<div className="flex h-4 items-center justify-between">
					<span className={cn("s-label", c.muted)}>Frame</span>
					<span className={cn("s-note", c.muted)}>02 / 03</span>
				</div>
				<div className="s-display mt-3">{selection.name}</div>
				<div className={cn("s-data mt-2 truncate", c.muted)}>{selection.path}</div>
			</div>
			<SectionHead index="01" label="Position" aside={<span className={cn("s-note", c.muted)}>frame.json</span>} />
			<div className="flex gap-4">
				<PropCell label="x" value={selection.x} unit="px" />
				<PropCell label="y" value={selection.y} unit="px" />
			</div>
			<div className="h-6" />
			<SectionHead index="02" label="Size" aside={<span className={cn("s-note", c.muted)}>frame.json</span>} />
			<div className="flex gap-4">
				<PropCell label="w" value={selection.w} unit="px" />
				<PropCell label="h" value={selection.h} unit="px" />
			</div>
			<div className="h-6" />
			<SectionHead
				index="03"
				label="Flows"
				aside={
					<span className={cn("s-data", c.muted)}>
						{selection.flowsIn} in · {selection.flowsOut} out
					</span>
				}
			/>
			<FlowRow dir="in" other="menu" certainty="will" />
			<FlowRow dir="out" other="receipt" certainty="might" />
			<div className="h-6" />
			<SectionHead index="04" label="Scenario" />
			<div className={cn("flex h-8 items-center justify-between px-2", c.raised)}>
				<span className="s-data">{selection.scenario}</span>
				<span className={c.muted}>
					<Caret open />
				</span>
			</div>
		</aside>
	);
}

/* ---------- the window ---------- */

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-swiss flex h-[900px] w-[1440px] flex-col overflow-hidden" data-appearance={appearance}>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Properties />
			</div>
		</div>
	);
}

/* ---------- parts ---------- */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<div className="flex min-w-0 flex-1 items-center">{children}</div>
			<span className={cn("s-note w-16 shrink-0 text-right", c.muted)}>{label}</span>
		</div>
	);
}

function Group({ index, label, children }: { index: string; label: string; children: ReactNode }) {
	return (
		<section className="flex flex-col">
			<SectionHead index={index} label={label} />
			<div className="flex flex-col gap-2 pt-1">{children}</div>
		</section>
	);
}

function Segmented() {
	return (
		<div className={cn("flex h-8 border", c.line)}>
			{["Dark", "Light", "System"].map((s, i) => (
				<span
					key={s}
					className={cn(
						"s-body flex flex-1 items-center justify-center",
						i === 0 ? [c.inkBg, c.onInk, "s-strong"] : c.muted,
						i > 0 && ["border-l", c.line],
					)}
				>
					{s}
				</span>
			))}
		</div>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span className={cn("flex h-5 w-10 shrink-0 items-center border-2 p-0.5", c.inkBorder, on ? c.inkBg : "", on ? "justify-end" : "justify-start")}>
			<span className={cn("size-3", on ? "bg-[var(--s-bg)]" : c.inkBg)} />
		</span>
	);
}

function Chip({ children, kind }: { children: ReactNode; kind: "count" | "live" | "unseen" }) {
	return (
		<span
			className={cn(
				"s-note inline-flex h-5 items-center gap-1.5 px-1.5",
				kind === "count" && [c.raised, c.ink],
				kind === "live" && [c.inkBg, c.onInk],
				kind === "unseen" && ["border border-[var(--s-thread)]", c.red],
			)}
		>
			{kind === "unseen" ? <UnseenMark /> : null}
			{children}
		</span>
	);
}

function ContextMenu() {
	return (
		<div className={cn("w-full border py-1", c.inkBorder, c.raised)}>
			{menuItems.map((m, i) => (
				<div key={m.label}>
					{m.danger ? <Hairline className="my-1" /> : null}
					<div
						className={cn(
							"flex h-8 items-center px-3",
							i === 0 && [c.inkBg, c.onInk],
							m.danger && c.red,
						)}
					>
						<span className="s-body flex-1">{m.label}</span>
						<span className={cn("s-note", i === 0 ? "opacity-70" : c.muted)}>{m.key}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Toast() {
	return (
		<div className={cn("flex h-10 w-full items-stretch", c.inkBg, c.onInk)}>
			<span className="s-body flex flex-1 items-center px-3">{toast.text}</span>
			<span className="s-strong flex items-center border-l border-[var(--s-muted)] px-3 text-[var(--s-thread)]">
				{toast.action}
			</span>
		</div>
	);
}

function Tooltip() {
	return (
		<div className="flex flex-col items-start">
			<div className={cn("flex h-6 items-center gap-2 px-2", c.inkBg, c.onInk)}>
				<span className="s-body">Play from cart</span>
				<Kbd inverse>P</Kbd>
			</div>
			<span className={cn("ml-3 h-1.5 w-2", c.inkBg)} style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
		</div>
	);
}

const palette: Record<Appearance, { name: string; role: string; hex: string; varName: string }[]> = {
	dark: [
		{ name: "bg", role: "chrome", hex: "#111110", varName: "--s-bg" },
		{ name: "canvas", role: "canvas", hex: "#1b1b1a", varName: "--s-canvas" },
		{ name: "raised", role: "fields", hex: "#232322", varName: "--s-raised" },
		{ name: "line", role: "hairline", hex: "#2e2e2c", varName: "--s-line" },
		{ name: "muted", role: "second", hex: "#8f8c86", varName: "--s-muted" },
		{ name: "ink", role: "text · mode", hex: "#efeee9", varName: "--s-ink" },
		{ name: "thread", role: "selection", hex: "#f5391a", varName: "--s-thread" },
		{ name: "team", role: "presence", hex: "#3b82f6", varName: "--s-team" },
	],
	light: [
		{ name: "bg", role: "chrome", hex: "#f7f6f2", varName: "--s-bg" },
		{ name: "canvas", role: "canvas", hex: "#e8e7e1", varName: "--s-canvas" },
		{ name: "raised", role: "fields", hex: "#ffffff", varName: "--s-raised" },
		{ name: "line", role: "hairline", hex: "#d8d6cf", varName: "--s-line" },
		{ name: "muted", role: "second", hex: "#67645e", varName: "--s-muted" },
		{ name: "ink", role: "text · mode", hex: "#121211", varName: "--s-ink" },
		{ name: "thread", role: "selection", hex: "#f5391a", varName: "--s-thread" },
		{ name: "team", role: "presence", hex: "#3b82f6", varName: "--s-team" },
	],
};

const typeRoles = [
	{ role: "display", spec: "40/40 700", cls: "s-display", sample: "kaffe" },
	{ role: "heading", spec: "16/20 650", cls: "s-heading", sample: "Properties" },
	{ role: "body", spec: "13/16 500", cls: "s-body", sample: "Search frames" },
	{ role: "strong", spec: "13/16 650", cls: "s-strong", sample: "receipt" },
	{ role: "data", spec: "mono 12/16", cls: "s-data", sample: "frames/app/cart" },
	{ role: "label", spec: "10/12 caps", cls: "s-label", sample: "Position" },
	{ role: "note", spec: "mono 10/12", cls: "s-note", sample: "390 × 844" },
];

function SelectionSpecimen() {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-3">
				<div className="flex flex-col">
					<div className={cn("flex h-6 w-fit items-center gap-3 px-2", c.redBg, c.onRed)}>
						<span className="s-note text-white/70">02</span>
						<span className="s-strong">cart</span>
					</div>
					<div className="relative mt-1 h-12 w-[88px] border-2" style={{ borderColor: RED }}>
						{["-left-[5px] -top-[5px]", "-right-[5px] -top-[5px]", "-left-[5px] -bottom-[5px]", "-right-[5px] -bottom-[5px]"].map((p) => (
							<span key={p} className={cn("absolute size-2", c.redBg, p)} />
						))}
					</div>
					<div className={cn("s-data mt-2 flex h-6 w-fit items-center px-2", c.redBg, c.onRed)}>
						{frameSize.w} × {frameSize.h}
					</div>
				</div>
				<div className="flex flex-1 flex-col gap-3 pt-1">
					{(["will", "might"] as const).map((k) => (
						<div key={k} className="flex flex-col gap-1">
							<span className={cn("s-note", c.muted)}>{k}</span>
							<svg className={cn("h-3 w-full", c.ink)} viewBox="0 0 80 12" preserveAspectRatio="none" aria-hidden="true">
								<line x1="0" x2="72" y1="6" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray={k === "might" ? "4 4" : undefined} />
								<path d="M72 1 L80 6 L72 11 Z" fill="currentColor" />
							</svg>
						</div>
					))}
					<div className="flex items-center gap-1.5">
						<UnseenMark />
						<span className={cn("s-note", c.red)}>unseen</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div className="id-swiss flex h-[900px] w-[720px] flex-col px-6 pt-6" data-appearance={appearance}>
			<div className="flex items-end justify-between pb-4">
				<div className="flex items-end gap-3">
					<SpoolMark className="mb-1 h-6 w-5 text-[#f5391a]" />
					<span className="s-display">Parts</span>
				</div>
				<div className="flex flex-col items-end gap-1">
					<span className="s-label">{appearance}</span>
					<span className={cn("s-note", c.muted)}>unit 4 · row 32 · radius 0 · rule 2</span>
				</div>
			</div>
			<div className="grid flex-1 grid-cols-3 gap-x-6">
				{/* column one: controls */}
				<div className="flex flex-col gap-5">
					<Group index="01" label="Buttons">
						<Spec label="primary">
							<Button kind="primary">
								<PlayGlyph className="size-3" />
								Play
							</Button>
						</Spec>
						<Spec label="secondary">
							<Button kind="secondary">Share</Button>
						</Spec>
						<Spec label="ghost">
							<Button kind="ghost" className="px-0">Cancel</Button>
						</Spec>
						<Spec label="icon">
							<div className="flex gap-2">
								<IconButton className={cn("border", c.line)}>
									<DotsGlyph />
								</IconButton>
								<IconButton active>
									<PointerGlyph />
								</IconButton>
							</div>
						</Spec>
						<Spec label="danger">
							<Button kind="danger">Move to Trash</Button>
						</Spec>
					</Group>
					<Group index="02" label="Fields">
						<div className={cn("flex h-8 items-center border-b-2 px-2", c.inkBorder, c.raised)}>
							<span className="s-data flex-1">cart</span>
							<span className={cn("h-4 w-px", c.inkBg)} />
						</div>
						<SearchField />
					</Group>
					<Group index="03" label="Segmented">
						<Segmented />
					</Group>
					<Group index="04" label="Toggle · tab">
						<Spec label="on · off">
							<div className="flex items-center gap-3">
								<Toggle on />
								<Toggle />
							</div>
						</Spec>
						<Spec label="tab">
							<div className={cn("flex h-8 flex-1 border-b", c.line)}>
								<span className={cn("s-strong relative flex items-center border-r px-3", c.line)}>
									kaffe
									<span className={cn("absolute inset-x-0 -bottom-px h-0.5", c.inkBg)} />
								</span>
								<span className={cn("s-body flex items-center px-3", c.muted)}>tvärsö</span>
							</div>
						</Spec>
					</Group>
					<Group index="05" label="Chips">
						<div className="flex items-center gap-2">
							<Chip kind="count">3</Chip>
							<Chip kind="live">live</Chip>
							<Chip kind="unseen">unseen</Chip>
						</div>
					</Group>
					<Group index="06" label="Spacing">
						<div className="flex flex-col gap-1">
							{[4, 8, 12, 16, 24, 32, 48].map((n) => (
								<div key={n} className="flex h-3 items-center gap-3">
									<span className={cn("s-note w-5 text-right", c.muted)}>{n}</span>
									<span className={cn("h-2", c.inkBg)} style={{ width: n * 2 }} />
								</div>
							))}
						</div>
					</Group>
				</div>
				{/* column two: rows and floating surfaces */}
				<div className="flex flex-col gap-5">
					<Group index="07" label="Sidebar row">
						<div className="-mt-1 flex flex-col">
							{(["rest", "hover", "selected", "unseen"] as const).map((s) => (
								<div key={s} className="flex items-center gap-3">
									<div className="min-w-0 flex-1">
										<FrameRow
											className="pr-3 pl-2"
											index={s === "selected" ? "1.2" : s === "unseen" ? "1.3" : "1.1"}
											frame={{ name: s === "selected" ? "cart" : s === "unseen" ? "receipt" : "menu" }}
											state={s}
										/>
									</div>
									<span className={cn("s-note w-16 text-right", c.muted)}>{s}</span>
								</div>
							))}
						</div>
					</Group>
					<Group index="08" label="Property row">
						<div className="-mt-1 flex gap-4">
							<PropCell label="x" value={selection.x} unit="px" />
							<PropCell label="y" value={selection.y} unit="px" />
						</div>
					</Group>
					<Group index="09" label="Context menu">
						<ContextMenu />
					</Group>
					<Group index="10" label="Toast · tooltip">
						<Toast />
						<div className="pt-1">
							<Tooltip />
						</div>
					</Group>
					<Group index="11" label="Selection · flows">
						<SelectionSpecimen />
					</Group>
				</div>
				{/* column three: people, type, colour */}
				<div className="flex flex-col gap-5">
					<Group index="12" label="Avatar">
						<div className="flex items-center gap-3">
							<Avatar size={32} />
							<Avatar />
							<Avatar size={16} />
							<span className={cn("s-data ml-auto", c.muted)}>{teammate.page}</span>
						</div>
					</Group>
					<Group index="13" label="Type">
						<div className="-mt-1 flex flex-col">
							{typeRoles.map((t) => (
								<div key={t.role}>
									<div className="flex items-baseline justify-between gap-2 py-2">
										<span className={cn(t.cls, "truncate")}>{t.sample}</span>
										<span className={cn("s-note shrink-0 text-right", c.muted)}>
											{t.role} {t.spec}
										</span>
									</div>
									<Hairline />
								</div>
							))}
						</div>
					</Group>
					<Group index="14" label="Colour">
						<div className="-mt-1 flex flex-col">
							{palette[appearance].map((p) => (
								<div key={p.name} className={cn("flex h-7 items-center gap-3 border-b", c.line)}>
									<span
										className={cn("size-4 shrink-0", (p.name === "bg" || p.name === "raised") && ["border", c.line])}
										style={{ background: `var(${p.varName})` }}
									/>
									<span className="s-body w-14">{p.name}</span>
									<span className={cn("s-note flex-1 whitespace-nowrap", c.muted)}>{p.role}</span>
									<span className="s-note">{p.hex}</span>
								</div>
							))}
						</div>
					</Group>
					<Group index="15" label="Rules">
						<div className="-mt-1 flex flex-col">
							{[
								{ name: "section", spec: "2 ink", el: <span className={cn("h-0.5 flex-1", c.inkBg)} /> },
								{ name: "row", spec: "1 line", el: <span className={cn("h-px flex-1", c.lineBg)} /> },
								{ name: "float", spec: "1 ink box", el: <span className={cn("h-4 flex-1 border", c.inkBorder, c.raised)} /> },
							].map((r) => (
								<div key={r.name} className="flex h-7 items-center gap-3">
									<span className="s-body w-14">{r.name}</span>
									{r.el}
									<span className={cn("s-note w-16 text-right", c.muted)}>{r.spec}</span>
								</div>
							))}
						</div>
					</Group>
				</div>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px] overflow-hidden">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}
