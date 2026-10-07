import "./contact.css";
import type { ReactNode } from "react";
import {
	type Appearance,
	canvasFrames,
	drawnSize,
	flows,
	frameSize,
	menuItems,
	type Page,
	type PageFrame,
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
import { ChevronIcon, HandIcon, PlayIcon, PlusIcon, SearchIcon, SelectIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * contact: the sidebar is a contact sheet. Every frame shows as a picture with
 * its name printed under it, grouped by page; a shut page folds into a strip of
 * small frames on its own row. Dark is the darkroom, light is the lightbox.
 *
 * Rules the parts sheet states and the canvas obeys:
 * - 4px grid; every row and control is 28 tall.
 * - radius: 0 for pictures and marks (thumbnails, selection, readout, chips),
 *   4 for controls, 8 for a container of controls (4 + its 4px padding),
 *   full only for dots (presence, unseen, toggle).
 * - type: edge 10 mono, data 11 mono, title 13 mono, body 12 sans, display 20 sans.
 * - red is the thread: selection, flows, unseen, the one primary action.
 */

type Screen = "menu" | "cart" | "receipt";

const SCREENS: readonly string[] = ["menu", "cart", "receipt"];
const screenOf = (name: string): Screen | null => (SCREENS.includes(name) ? (name as Screen) : null);

const PALETTE: Record<Appearance, { name: string; hex: string }[]> = {
	dark: [
		{ name: "canvas", hex: "#050505" },
		{ name: "bar", hex: "#0a0a0a" },
		{ name: "panel", hex: "#0c0c0c" },
		{ name: "field", hex: "#121212" },
		{ name: "raise", hex: "#1b1b1b" },
		{ name: "line", hex: "#1a1a1a" },
		{ name: "faint", hex: "#615f5b" },
		{ name: "muted", hex: "#85827d" },
		{ name: "text", hex: "#e8e6e2" },
		{ name: "thread", hex: "#f5391a" },
		{ name: "pencil", hex: "#ff5a3c" },
		{ name: "peer", hex: "#3b82f6" },
	],
	light: [
		{ name: "canvas", hex: "#ffffff" },
		{ name: "bar", hex: "#efefee" },
		{ name: "panel", hex: "#f5f5f4" },
		{ name: "field", hex: "#ffffff" },
		{ name: "raise", hex: "#e6e6e4" },
		{ name: "line", hex: "#e0e0de" },
		{ name: "faint", hex: "#92918d" },
		{ name: "muted", hex: "#686764" },
		{ name: "text", hex: "#121212" },
		{ name: "thread", hex: "#f5391a" },
		{ name: "pencil", hex: "#d42a0e" },
		{ name: "peer", hex: "#3b82f6" },
	],
};

/* ───────────────────────── pictures ───────────────────────── */

/** A coffee screen at any width: the 240×520 canvas drawing, scaled. */
function Phone({ screen, width }: { screen: Screen; width: number }) {
	const s = width / drawnSize.w;
	return (
		<div
			className="relative overflow-hidden shadow-[0_0_0_1px_var(--k-mount)]"
			style={{ width, height: Math.round(drawnSize.h * s), borderRadius: 8 * s }}
		>
			<div
				className="absolute left-0 top-0 origin-top-left"
				style={{ width: drawnSize.w, height: drawnSize.h, transform: `scale(${s})` }}
			>
				<CoffeeScreen screen={screen} />
			</div>
		</div>
	);
}

/** Frames we have no drawing for: a grey plate in the frame's shape. */
function Plate({ name, width, height }: { name: string; width: number; height: number }) {
	const ink = "fill-(--k-ph-ink)";
	return (
		<svg
			viewBox="0 0 120 80"
			width={width}
			height={height}
			className="block bg-(--k-ph) shadow-[0_0_0_1px_var(--k-ph-line)]"
			aria-hidden="true"
		>
			{name === "landing" ? (
				<>
					<rect x="10" y="9" width="18" height="4" className={ink} />
					<rect x="84" y="9" width="26" height="4" className={ink} />
					<rect x="10" y="26" width="52" height="9" className={ink} />
					<rect x="10" y="39" width="40" height="5" className={ink} />
					<rect x="10" y="52" width="22" height="9" className={ink} />
					<rect x="70" y="24" width="40" height="44" className={ink} />
				</>
			) : name === "pricing" ? (
				<>
					<rect x="38" y="10" width="44" height="7" className={ink} />
					<rect x="10" y="26" width="30" height="44" className={ink} />
					<rect x="45" y="22" width="30" height="48" className={ink} />
					<rect x="80" y="26" width="30" height="44" className={ink} />
				</>
			) : name === "annotate" ? (
				<>
					<rect x="44" y="8" width="32" height="64" className={ink} />
					<circle cx="86" cy="22" r="5" className={ink} />
					<circle cx="34" cy="50" r="5" className={ink} />
				</>
			) : (
				<rect
					x="44.5"
					y="8.5"
					width="31"
					height="63"
					fill="none"
					strokeDasharray="3 3"
					className="stroke-(--k-ph-ink)"
				/>
			)}
		</svg>
	);
}

/* ───────────────────────── marks ───────────────────────── */

function Dot({ className }: { className?: string }) {
	return <span className={cn("block size-1.5 shrink-0 rounded-full bg-(--k-thread)", className)} />;
}

function Avatar() {
	return (
		<span
			title={teammate.name}
			className="k-edge flex size-5 shrink-0 items-center justify-center rounded-full text-[#ffffff]"
			style={{ background: teammate.color }}
		>
			{teammate.initials}
		</span>
	);
}

function Chip({ kind = "count", children }: { kind?: "count" | "live" | "thread"; children: ReactNode }) {
	return (
		<span
			className={cn(
				"k-edge flex h-4 items-center gap-1 px-1",
				kind === "count" && "bg-(--k-raise) text-(--k-muted)",
				kind === "live" && "text-(--k-text) shadow-[inset_0_0_0_1px_var(--k-float-line)]",
				kind === "thread" && "bg-(--k-wash) text-(--k-pencil)",
			)}
		>
			{kind === "live" ? <span className="size-1.5 rounded-full bg-(--k-text)" /> : null}
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="k-edge flex h-4 items-center px-1 text-(--k-muted) shadow-[inset_0_0_0_1px_var(--k-field-line)]">
			{children}
		</span>
	);
}

function MarqueeIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2.5" y="2.5" width="11" height="11" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 2" />
		</svg>
	);
}

/** A flow drawn small: solid is will, dashed is might. */
function FlowGlyph({ certainty }: { certainty: "will" | "might" }) {
	return (
		<svg viewBox="0 0 20 8" className="h-2 w-5 shrink-0" fill="none" aria-hidden="true">
			<path
				d="M0 4h15"
				className="stroke-(--k-thread)"
				strokeWidth="1.25"
				strokeDasharray={certainty === "might" ? "2.5 2" : undefined}
			/>
			<path d="M14 1l5 3-5 3z" className="fill-(--k-thread)" />
		</svg>
	);
}

/* ───────────────────────── controls ───────────────────────── */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind, icon, children }: { kind: ButtonKind; icon?: ReactNode; children: ReactNode }) {
	return (
		<span
			className={cn(
				"k-body k-strong flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2.5",
				kind === "primary" && "bg-(--k-thread) text-(--k-on-thread)",
				kind === "secondary" && "bg-(--k-raise) text-(--k-text)",
				kind === "ghost" && "text-(--k-muted)",
				kind === "danger" && "bg-(--k-wash) text-(--k-pencil)",
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({ active, children, label }: { active?: boolean; children: ReactNode; label: string }) {
	return (
		<span
			title={label}
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded-[4px]",
				active ? "bg-(--k-raise) text-(--k-text)" : "text-(--k-muted)",
			)}
		>
			{children}
		</span>
	);
}

function Field({ label, value, unit, className }: { label: string; value: string; unit?: string; className?: string }) {
	return (
		<span
			className={cn(
				"flex h-7 min-w-0 items-center gap-2 rounded-[4px] bg-(--k-field) px-2 shadow-[inset_0_0_0_1px_var(--k-field-line)]",
				className,
			)}
		>
			<span className="k-edge w-2 shrink-0 text-(--k-faint)">{label}</span>
			<span className="k-data flex-1 truncate text-(--k-text)">{value}</span>
			{unit ? <span className="k-edge text-(--k-faint)">{unit}</span> : null}
		</span>
	);
}

function SearchField({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"flex h-7 items-center gap-2 rounded-[4px] bg-(--k-field) pl-2 pr-1.5 shadow-[inset_0_0_0_1px_var(--k-field-line)]",
				className,
			)}
		>
			<SearchIcon className="size-3.5 shrink-0 text-(--k-faint)" />
			<span className="k-body flex-1 text-(--k-muted)">Find a frame</span>
			<Kbd>⌘K</Kbd>
		</span>
	);
}

function Segmented({ options, value }: { options: string[]; value: string }) {
	return (
		<span className="flex h-7 items-center gap-0.5 rounded-[6px] bg-(--k-field) p-0.5 shadow-[inset_0_0_0_1px_var(--k-field-line)]">
			{options.map((o) => (
				<span
					key={o}
					className={cn(
						"k-body flex h-6 items-center rounded-[4px] px-2.5",
						o === value
							? "bg-(--k-raise) text-(--k-text) shadow-[0_0_0_1px_var(--k-float-line)]"
							: "text-(--k-muted)",
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
		<span
			className={cn(
				"flex h-4 w-7 shrink-0 items-center rounded-full p-0.5",
				on ? "justify-end bg-(--k-thread)" : "justify-start bg-(--k-raise) shadow-[inset_0_0_0_1px_var(--k-float-line)]",
			)}
		>
			<span className={cn("size-3 rounded-full", on ? "bg-[#ffffff]" : "bg-(--k-muted)")} />
		</span>
	);
}

function Tab({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-7 shrink-0 items-center rounded-[4px] px-3",
				home ? "k-body" : "k-data",
				active ? "bg-(--k-raise) text-(--k-text)" : "text-(--k-muted)",
			)}
		>
			{name}
		</span>
	);
}

/* ───────────────────────── the contact sheet ───────────────────────── */

type CellState = "rest" | "hover" | "selected" | "unseen";

const cellState = (f: PageFrame): CellState => (f.selected ? "selected" : f.unseen ? "unseen" : "rest");

/** One frame on the sheet: its picture, its name printed under it. */
function Cell({ frame, state = cellState(frame) }: { frame: PageFrame; state?: CellState }) {
	const screen = screenOf(frame.name);
	return (
		<div className="flex w-[72px] flex-col gap-1">
			<div
				className={cn(
					state === "selected" && "outline outline-offset-2 outline-(--k-thread)",
					state === "hover" && "outline outline-offset-2 outline-(--k-faint)",
				)}
			>
				{screen ? <Phone screen={screen} width={72} /> : <Plate name={frame.name} width={72} height={48} />}
			</div>
			<div className="mt-1 flex h-4 items-center gap-1.5">
				{state === "unseen" ? <Dot /> : null}
				<span
					className={cn(
						"k-data truncate",
						state === "selected" && "text-(--k-pencil)",
						state === "unseen" && "text-(--k-text)",
						state === "hover" && "text-(--k-text)",
						state === "rest" && "text-(--k-muted)",
					)}
				>
					{frame.name}
				</span>
			</div>
		</div>
	);
}

/** A page's own row: a shut page carries its frames as a strip of small plates. */
function PageRow({ page, hover }: { page: Page; hover?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-7 items-center gap-2 rounded-[4px] pl-1.5 pr-2",
				hover && "bg-(--k-raise)",
			)}
		>
			<ChevronIcon open={page.open} className="size-3 shrink-0 text-(--k-faint)" />
			<span className={cn("k-data", page.current ? "text-(--k-text)" : "text-(--k-muted)")}>{page.name}</span>
			<span className="flex-1" />
			{page.presence ? <Avatar /> : null}
			<span className="k-edge w-3 text-right text-(--k-faint)">{page.count}</span>
		</div>
	);
}

/** A shut page keeps its frames in view as a strip of small plates. */
function Strip({ page }: { page: Page }) {
	return (
		<div className="flex gap-2 pb-4 pt-1">
			{page.frames.map((f) => (
				<div key={f.name} title={f.name}>
					<Plate name={f.name} width={48} height={32} />
				</div>
			))}
		</div>
	);
}

function Sheet({ page }: { page: Page }) {
	return (
		<div className="grid grid-cols-3 gap-x-2 px-0 pb-4 pt-2">
			{page.frames.map((f) => (
				<Cell key={f.name} frame={f} />
			))}
		</div>
	);
}

function Sidebar() {
	return (
		<aside className="flex w-64 shrink-0 flex-col border-r border-(--k-line) bg-(--k-panel)">
			<div className="flex flex-col gap-2 px-3 pb-3 pt-3">
				<div className="flex h-7 items-center gap-2 pl-1.5">
					<span className="k-title text-(--k-text)">{project.name}</span>
					<span className="k-edge text-(--k-faint)">{project.frames} frames</span>
					<span className="flex-1" />
					<IconButton label="New page">
						<PlusIcon className="size-3.5" />
					</IconButton>
				</div>
				<SearchField />
			</div>
			<div className="flex flex-col px-3">
				{pages.map((p) => (
					<div key={p.name} className="flex flex-col">
						<PageRow page={p} />
						{p.open ? <Sheet page={p} /> : <Strip page={p} />}
					</div>
				))}
			</div>
			<span className="flex-1" />
			<div className="flex h-11 items-center gap-2 border-t border-(--k-line) px-3">
				<span className="k-edge pl-1.5 text-(--k-faint)">sheet</span>
				<span className="flex items-center gap-1">
					{["s", "m", "l"].map((s) => (
						<span
							key={s}
							className={cn(
								"k-edge flex size-5 items-center justify-center rounded-[4px]",
								s === "m" ? "bg-(--k-raise) text-(--k-text)" : "text-(--k-faint)",
							)}
						>
							{s}
						</span>
					))}
				</span>
				<span className="flex-1" />
				<span className="k-edge text-(--k-faint)">{project.synced}</span>
			</div>
		</aside>
	);
}

/* ───────────────────────── the canvas ───────────────────────── */

const TOP = 168;
const X: Record<string, number> = { menu: 28, cart: 340, receipt: 652 };
const FLOW_Y = TOP + 236;

function Selection({ x }: { x: number }) {
	const corner = "absolute size-2.5 border-(--k-thread)";
	return (
		<div
			className="pointer-events-none absolute border border-(--k-thread)"
			style={{ left: x - 4, top: TOP - 4, width: drawnSize.w + 8, height: drawnSize.h + 8 }}
		>
			<span className={cn(corner, "-left-[3px] -top-[3px] border-l-2 border-t-2")} />
			<span className={cn(corner, "-right-[3px] -top-[3px] border-r-2 border-t-2")} />
			<span className={cn(corner, "-bottom-[3px] -left-[3px] border-b-2 border-l-2")} />
			<span className={cn(corner, "-bottom-[3px] -right-[3px] border-b-2 border-r-2")} />
			<span className="k-edge absolute left-1/2 top-[calc(100%+12px)] flex h-5 -translate-x-1/2 items-center whitespace-nowrap bg-(--k-thread) px-1.5 text-(--k-on-thread)">
				{frameSize.w} × {frameSize.h}
			</span>
		</div>
	);
}

function FrameLabel({ name, selected, unseen, x }: { name: string; selected?: boolean; unseen?: boolean; x: number }) {
	return (
		<div className="absolute flex h-4 items-center gap-1.5" style={{ left: x, top: TOP - 26, width: drawnSize.w }}>
			{unseen ? <Dot /> : null}
			<span
				className={cn(
					"k-data",
					selected ? "text-(--k-pencil)" : unseen ? "text-(--k-text)" : "text-(--k-muted)",
				)}
			>
				{name}
			</span>
			<span className="flex-1" />
			{selected ? (
				<span className="k-edge flex items-center gap-1 text-(--k-pencil)">
					<PlayIcon className="size-2.5" />
					play
				</span>
			) : null}
		</div>
	);
}

function Flows() {
	const seg = (from: string, to: string) => ({
		x1: X[from] + drawnSize.w + (from === "cart" ? 10 : 6),
		x2: X[to] - (to === "cart" ? 10 : 6),
	});
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
			{flows.map((f) => {
				const { x1, x2 } = seg(f.from, f.to);
				return (
					<g key={f.from}>
						<circle cx={x1 + 1.5} cy={FLOW_Y} r="2" className="fill-(--k-thread)" />
						<path
							d={`M${x1 + 2} ${FLOW_Y}H${x2 - 6}`}
							className="stroke-(--k-thread)"
							strokeWidth="1.25"
							strokeDasharray={f.certainty === "might" ? "4 3" : undefined}
						/>
						<path d={`M${x2 - 7} ${FLOW_Y - 3.5}L${x2} ${FLOW_Y}L${x2 - 7} ${FLOW_Y + 3.5}Z`} className="fill-(--k-thread)" />
					</g>
				);
			})}
			{flows.map((f) => {
				const { x1, x2 } = seg(f.from, f.to);
				return (
					<text
						key={`${f.from}-t`}
						x={(x1 + x2) / 2}
						y={FLOW_Y - 10}
						textAnchor="middle"
						className="k-edge fill-(--k-muted)"
					>
						{f.certainty}
					</text>
				);
			})}
		</svg>
	);
}

function Toolbar() {
	return (
		<div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[8px] border border-(--k-float-line) bg-(--k-panel) p-1">
			<IconButton active label="Select">
				<SelectIcon className="size-3.5" />
			</IconButton>
			<IconButton label="Marquee">
				<MarqueeIcon className="size-3.5" />
			</IconButton>
			<IconButton label="Hand">
				<HandIcon className="size-4" />
			</IconButton>
		</div>
	);
}

function Stage() {
	return (
		<main className="relative min-w-0 flex-1 overflow-hidden bg-(--k-canvas)">
			<Flows />
			{canvasFrames.map((f) => {
				const sel = "selected" in f && f.selected;
				const unseen = "unseen" in f && f.unseen;
				return (
					<div key={f.name}>
						<FrameLabel name={f.name} selected={sel} unseen={unseen} x={X[f.name]} />
						<div
							className="absolute rounded-[8px] shadow-[0_0_0_1px_var(--k-mount)]"
							style={{ left: X[f.name], top: TOP, width: drawnSize.w, height: drawnSize.h }}
						>
							<CoffeeScreen screen={f.screen} />
						</div>
						{sel ? <Selection x={X[f.name]} /> : null}
					</div>
				);
			})}
			<Toolbar />
		</main>
	);
}

/* ───────────────────────── the loupe and properties ───────────────────────── */

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-1 border-t border-(--k-line) px-3 pb-3 pt-1">
			<div className="k-edge flex h-7 items-center pl-1.5 text-(--k-muted)">{title}</div>
			{children}
		</section>
	);
}

function FlowRow({ dir, name, certainty }: { dir: "in" | "out"; name: string; certainty: "will" | "might" }) {
	return (
		<div className="flex h-7 items-center gap-2 pl-1.5 pr-1">
			<span className="k-edge w-6 text-(--k-faint)">{dir}</span>
			<FlowGlyph certainty={certainty} />
			<span className="k-data text-(--k-text)">{name}</span>
			<span className="flex-1" />
			<span className="k-edge text-(--k-muted)">{certainty}</span>
		</div>
	);
}

function Properties() {
	const inbound = flows.find((f) => f.to === selection.name);
	const outbound = flows.find((f) => f.from === selection.name);
	return (
		<aside className="flex w-[272px] shrink-0 flex-col border-l border-(--k-line) bg-(--k-panel)">
			<div className="p-3">
				<div className="relative flex h-[300px] items-center justify-center bg-(--k-well)">
					<span className="k-edge absolute left-2 top-2 text-(--k-faint)">2 / 3</span>
					<span className="k-edge absolute right-2 top-2 text-(--k-faint)">app</span>
					<Phone screen="cart" width={120} />
				</div>
			</div>
			<div className="flex flex-col gap-1 px-3 pb-3">
				<div className="flex h-7 items-center gap-2 pl-1.5">
					<span className="k-title text-(--k-text)">{selection.name}</span>
					<span className="flex-1" />
					<Button kind="secondary" icon={<PlayIcon className="size-2.5 text-(--k-thread)" />}>
						Play
					</Button>
				</div>
				<div className="k-data truncate pl-1.5 text-(--k-muted)">{selection.path}</div>
			</div>
			<Section title="position">
				<div className="grid grid-cols-2 gap-2">
					<Field label="x" value={String(selection.x)} unit="px" />
					<Field label="y" value={String(selection.y)} unit="px" />
				</div>
			</Section>
			<Section title="size">
				<div className="grid grid-cols-2 gap-2">
					<Field label="w" value={String(selection.w)} unit="px" />
					<Field label="h" value={String(selection.h)} unit="px" />
				</div>
			</Section>
			<Section title={`flows · ${selection.flowsIn} in · ${selection.flowsOut} out`}>
				{inbound ? <FlowRow dir="in" name={inbound.from} certainty={inbound.certainty} /> : null}
				{outbound ? <FlowRow dir="out" name={outbound.to} certainty={outbound.certainty} /> : null}
			</Section>
			<Section title="scenario">
				<span className="flex h-7 items-center gap-2 rounded-[4px] bg-(--k-field) px-2 shadow-[inset_0_0_0_1px_var(--k-field-line)]">
					<span className="k-data flex-1 text-(--k-text)">{selection.scenario}</span>
					<ChevronIcon open className="size-3 text-(--k-faint)" />
				</span>
			</Section>
		</aside>
	);
}

/* ───────────────────────── the window ───────────────────────── */

function TopBar() {
	return (
		<header className="flex h-10 shrink-0 items-center gap-1 border-b border-(--k-line) bg-(--k-bar) pl-2 pr-2">
			<span className="flex size-7 items-center justify-center">
				<SpoolMark className="h-4 w-[13px] text-(--k-thread)" />
			</span>
			<Tab name="Home" home />
			<span className="mx-1 h-4 w-px bg-(--k-line)" />
			{tabs.map((t) => (
				<Tab key={t.name} name={t.name} active={t.active} />
			))}
			<IconButton label="New tab">
				<PlusIcon className="size-3.5" />
			</IconButton>
			<span className="flex-1" />
			<span className="flex items-center gap-2 pr-2">
				<Avatar />
			</span>
			<span className="k-data flex h-7 items-center rounded-[4px] px-2 text-(--k-muted)">{zoom}</span>
			<span className="mx-1 h-4 w-px bg-(--k-line)" />
			<Button kind="secondary">Share</Button>
			<Button kind="primary" icon={<PlayIcon className="size-2.5" />}>
				Play
			</Button>
		</header>
	);
}

function Root({ appearance, className, children }: { appearance: Appearance; className?: string; children: ReactNode }) {
	return (
		<div
			className={cn("id-contact", className)}
			data-appearance={appearance}
		>
			{children}
		</div>
	);
}

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<Root appearance={appearance} className="flex h-full w-full flex-col overflow-hidden bg-(--k-bar)">
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Stage />
				<Properties />
			</div>
		</Root>
	);
}

/* ───────────────────────── parts ───────────────────────── */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<span className="k-edge text-(--k-faint)">{label}</span>
			{children}
		</div>
	);
}

function Menu() {
	return (
		<div className="flex w-[188px] flex-col rounded-[8px] border border-(--k-float-line) bg-(--k-float) p-1">
			{menuItems.map((m, i) => (
				<div key={m.label} className="flex flex-col">
					{m.danger ? <span className="mx-2 my-1 h-px bg-(--k-line)" /> : null}
					<div
						className={cn(
							"flex h-7 items-center gap-3 rounded-[4px] px-2",
							i === 1 && "bg-(--k-raise)",
						)}
					>
						<span className={cn("k-body flex-1", m.danger ? "text-(--k-pencil)" : "text-(--k-text)")}>
							{m.label}
						</span>
						<span className="k-edge text-(--k-faint)">{m.key}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Toast() {
	return (
		<div className="flex h-10 w-fit items-center gap-4 rounded-[8px] border border-(--k-float-line) bg-(--k-float) pl-3 pr-1">
			<span className="k-body text-(--k-text)">{toast.text}</span>
			<span className="k-body k-strong flex h-7 items-center rounded-[4px] px-2 text-(--k-pencil)">
				{toast.action}
			</span>
		</div>
	);
}

function Tooltip() {
	return (
		<div className="flex flex-col items-start">
			<div className="flex h-6 items-center gap-2 rounded-[4px] border border-(--k-float-line) bg-(--k-float) px-2">
				<span className="k-body text-(--k-text)">Hand</span>
				<span className="k-edge text-(--k-faint)">h</span>
			</div>
		</div>
	);
}

const TYPE = [
	{ role: "display", spec: "sans 20/24 500", sample: "Contact sheet", cls: "k-display" },
	{ role: "title", spec: "mono 13/16", sample: "kaffe", cls: "k-title" },
	{ role: "body", spec: "sans 12/16", sample: "Find a frame", cls: "k-body" },
	{ role: "data", spec: "mono 11/16", sample: "frames/app/cart", cls: "k-data" },
	{ role: "edge", spec: "mono 10/12", sample: "390 × 844 · 2 / 3", cls: "k-edge" },
];

function Board({ appearance }: { appearance: Appearance }) {
	const app = pages[0];
	const cells: { f: PageFrame; s: CellState }[] = [
		{ f: app.frames[0], s: "rest" },
		{ f: app.frames[0], s: "hover" },
		{ f: app.frames[1], s: "selected" },
		{ f: app.frames[2], s: "unseen" },
	];
	return (
		<Root appearance={appearance} className="flex h-full w-[720px] flex-col bg-(--k-panel) px-6 pt-5">
			<div className="flex h-7 items-center gap-3">
				<SpoolMark className="h-4 w-[13px] text-(--k-thread)" />
				<span className="k-title text-(--k-text)">contact</span>
				<span className="k-edge text-(--k-muted)">{appearance === "dark" ? "dark · darkroom" : "light · lightbox"}</span>
				<span className="flex-1" />
				<span className="k-edge text-(--k-faint)">4px grid · row 28 · radius 0 / 4 / 8</span>
			</div>
			<div className="mt-4 h-px bg-(--k-line)" />
			<div className="mt-5 grid grid-cols-[316px_1fr] gap-x-10">
				<div className="flex flex-col gap-5">
					<Spec label="button · primary secondary ghost icon danger">
						<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<Button kind="primary" icon={<PlayIcon className="size-2.5" />}>
								Play
							</Button>
							<Button kind="secondary">Share</Button>
							<Button kind="ghost">Cancel</Button>
							<IconButton label="Add" active>
								<PlusIcon className="size-3.5" />
							</IconButton>
							<IconButton label="Add">
								<PlusIcon className="size-3.5" />
							</IconButton>
						</div>
						<div className="flex items-center gap-2">
							<Button kind="danger">Move to Trash</Button>
						</div>
						</div>
					</Spec>
					<Spec label="input · search">
						<div className="flex flex-col gap-2">
							<Field label="x" value="325" unit="px" />
							<SearchField />
						</div>
					</Spec>
					<Spec label="segmented · toggle">
						<div className="flex items-center gap-4">
							<Segmented options={["Dark", "Light", "System"]} value={appearance === "dark" ? "Dark" : "Light"} />
							<Toggle on />
							<Toggle on={false} />
						</div>
					</Spec>
					<Spec label="tab">
						<div className="flex items-center gap-1">
							<Tab name="Home" home />
							<Tab name="kaffe" active />
							<Tab name="tvärsö" />
						</div>
					</Spec>
					<div className="flex gap-6">
						<Spec label="menu">
							<Menu />
						</Spec>
						<div className="flex flex-col gap-5">
							<Spec label="chip">
								<div className="flex items-center gap-2">
									<Chip>3</Chip>
									<Chip kind="live">live</Chip>
									<Chip kind="thread">unseen</Chip>
								</div>
							</Spec>
							<Spec label="avatar">
								<div className="flex items-center gap-2">
									<Avatar />
									<span className="k-body text-(--k-muted)">{teammate.name}</span>
								</div>
							</Spec>
							<Spec label="tooltip">
								<Tooltip />
							</Spec>
						</div>
					</div>
					<Spec label="toast">
						<Toast />
					</Spec>
				</div>
				<div className="flex flex-col gap-5">
					<Spec label="sheet cell · rest hover selected unseen">
						<div className="flex gap-2">
							{cells.map((c) => (
								<div key={c.s} className="flex flex-col gap-1.5">
									<Cell frame={c.f} state={c.s} />
									<span className="k-edge text-(--k-faint)">{c.s}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="page row · open · shut + strip, hover, presence">
						<div className="flex w-[232px] flex-col">
							<PageRow page={pages[0]} />
							<PageRow page={pages[1]} hover />
							<Strip page={pages[1]} />
						</div>
					</Spec>
					<Spec label="property row · field pair · flow">
						<div className="flex w-[248px] flex-col gap-1">
							<div className="grid grid-cols-2 gap-2">
								<Field label="w" value="390" unit="px" />
								<Field label="h" value="844" unit="px" />
							</div>
							<FlowRow dir="in" name="menu" certainty="will" />
							<FlowRow dir="out" name="receipt" certainty="might" />
						</div>
					</Spec>
					<Spec label="type">
						<div className="flex flex-col">
							{TYPE.map((t) => (
								<div key={t.role} className="flex h-7 items-baseline gap-3">
									<span className="k-edge w-12 shrink-0 text-(--k-faint)">{t.role}</span>
									<span className={cn(t.cls, "w-[156px] shrink-0 truncate text-(--k-text)")}>{t.sample}</span>
									<span className="k-edge whitespace-nowrap text-(--k-muted)">{t.spec}</span>
								</div>
							))}
						</div>
					</Spec>
				</div>
			</div>
			<div className="mt-auto pb-6">
					<Spec label="palette">
						<div className="grid grid-cols-12 gap-x-2 gap-y-3">
							{PALETTE[appearance].map((c) => (
								<div key={c.name} className="flex flex-col gap-1">
									<span
										className="h-6 shadow-[inset_0_0_0_1px_var(--k-float-line)]"
										style={{ background: c.hex }}
									/>
									<span className="k-edge truncate text-(--k-muted)">{c.name}</span>
									<span className="k-edge text-(--k-faint)">{c.hex}</span>
								</div>
							))}
						</div>
					</Spec>
			</div>
		</Root>
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
