import "./ledger.css";

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
import {
	ChevronIcon,
	CloseIcon,
	DotsIcon,
	FolderIcon,
	FrameIcon,
	HandIcon,
	PanelCaret,
	PlayIcon,
	PlusIcon,
	SearchIcon,
	SelectIcon,
} from "shared/ui/spool/icons";

/**
 * ledger: today's spool with the discipline written down. The rules, all of them:
 *   space   4px steps; every panel pads 12, every row pads 8 inside a 4 inset
 *   row     28 for anything listed: tree rows, property rows, menu items, controls
 *   radius  6 for what you touch, 10 for what holds things, nested = outer − inset
 *   border  1px hairline, never a fill change alone to separate two surfaces
 *   type    title 15, control/body 13, label/value 12, detail 11; sans is read, mono is printed
 *   colour  thread marks selection, unseen, primary and danger; nothing else is red
 */

type Tone = "rest" | "hover" | "selected" | "unseen";

// ── primitives ──────────────────────────────────────────────────────────────

function Button({
	kind = "secondary",
	icon,
	children,
}: {
	kind?: "primary" | "secondary" | "ghost" | "danger";
	icon?: ReactNode;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[13px] font-medium leading-5",
				kind === "primary" && "border-transparent bg-(--l-thread) text-(--l-on-thread)",
				kind === "secondary" && "border-(--l-border) bg-(--l-raised) text-(--l-text)",
				kind === "ghost" && "border-transparent text-(--l-muted)",
				kind === "danger" && "border-transparent bg-(--l-thread-wash) text-(--l-thread-ink)",
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({ children, active, size = 28 }: { children: ReactNode; active?: boolean; size?: 20 | 28 }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-[6px] border",
				active
					? "border-(--l-border) bg-(--l-select) text-(--l-text)"
					: "border-transparent text-(--l-muted)",
			)}
			style={{ width: size, height: size }}
		>
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="l-detail inline-flex h-5 items-center rounded-[4px] border border-(--l-border) px-1 text-(--l-muted)">
			{children}
		</span>
	);
}

function Avatar({ size = 24 }: { size?: 16 | 24 }) {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
			style={{
				width: size,
				height: size,
				background: teammate.color,
				fontSize: size === 24 ? 10 : 8,
				lineHeight: 1,
				letterSpacing: "0.02em",
			}}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function UnseenDot() {
	return <span className="inline-block size-1.5 shrink-0 rounded-full bg-(--l-thread)" />;
}

/** a line sample: the same stroke the canvas draws for the flow */
function FlowStroke({ certainty }: { certainty: "will" | "might" }) {
	return (
		<svg width="14" height="2" viewBox="0 0 14 2" aria-hidden="true" className="shrink-0">
			<path
				d="M0 1h14"
				stroke="var(--l-thread)"
				strokeWidth="1.5"
				strokeDasharray={certainty === "might" ? "3 2" : undefined}
			/>
		</svg>
	);
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "thread" | "solid" }) {
	return (
		<span
			className={cn(
				"l-detail inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[6px] border px-1.5",
				tone === "neutral" && "border-(--l-border) text-(--l-muted)",
				tone === "thread" && "border-transparent bg-(--l-thread-wash) text-(--l-thread-ink)",
				tone === "solid" && "border-transparent bg-(--l-thread) text-(--l-on-thread)",
			)}
		>
			{children}
		</span>
	);
}

function MarqueeIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect
				x="2.25"
				y="2.25"
				width="11.5"
				height="11.5"
				rx="1.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeDasharray="2.2 2"
			/>
		</svg>
	);
}

function SectionHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
	return (
		<div className="flex h-7 items-center justify-between px-2">
			<span className="l-label text-(--l-muted)">{children}</span>
			{aside}
		</div>
	);
}

// ── the sidebar ─────────────────────────────────────────────────────────────

/**
 * One row, 28 tall. Pages carry a chevron and a folder; frames hang off a guide
 * under their page's folder. Selection lights the guide segment beside the row,
 * so the thread runs through the tree to the frame that is selected.
 */
function TreeRow({
	kind,
	name,
	tone = "rest",
	open,
	count,
	presence,
	guide,
}: {
	kind: "page" | "frame";
	name: string;
	tone?: Tone;
	open?: boolean;
	count?: number;
	presence?: boolean;
	guide?: "mid" | "last";
}) {
	const selected = tone === "selected";
	return (
		<div
			className={cn(
				"relative flex h-7 items-center rounded-[6px] pr-2",
				kind === "page" ? "pl-2" : "pl-10",
				tone === "hover" && "bg-(--l-hover)",
				selected && "bg-(--l-select)",
			)}
		>
			{kind === "frame" ? (
				<span
					className={cn(
						"absolute left-[23px] w-px",
						guide === "last" ? "top-0 h-3.5" : "inset-y-0",
						selected ? "bg-(--l-thread)" : "bg-(--l-border-strong)",
					)}
					style={selected ? { width: 2, left: 22.5 } : undefined}
				/>
			) : null}
			{kind === "page" ? (
				<>
					<span className="flex size-3 shrink-0 items-center justify-center text-(--l-muted)">
						<ChevronIcon open={open} className="size-3" />
					</span>
					<FolderIcon className="ml-1 size-3.5 shrink-0 text-(--l-muted)" />
				</>
			) : (
				<FrameIcon
					className={cn("size-3.5 shrink-0", selected ? "text-(--l-thread-ink)" : "text-(--l-muted)")}
				/>
			)}
			<span className={cn("l-value ml-2 min-w-0 flex-1 truncate", "text-(--l-text)")}>{name}</span>
			<span className="ml-2 flex shrink-0 items-center gap-2">
				{presence ? <Avatar size={16} /> : null}
				{tone === "unseen" ? <UnseenDot /> : null}
				{count !== undefined ? (
					<span className="l-detail w-3 text-right text-(--l-muted)">{count}</span>
				) : null}
			</span>
		</div>
	);
}

function Sidebar() {
	return (
		<aside className="flex w-[240px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-(--l-border) bg-(--l-surface)">
			{/* project */}
			<div className="flex flex-col gap-2 p-3 pb-2">
				<div className="flex h-7 items-center justify-between">
					<span className="flex items-center gap-2">
						<span className="flex size-5 items-center justify-center rounded-[6px] border border-(--l-border) bg-(--l-raised)">
							<SpoolMark className="h-3 w-2.5 text-(--l-thread)" />
						</span>
						<span className="l-value text-(--l-text)">{project.name}</span>
						<ChevronIcon open className="size-3 text-(--l-muted)" />
					</span>
					<IconButton size={20}>
						<PanelCaret dir="left" className="h-4 w-3" />
					</IconButton>
				</div>
				<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(--l-border) bg-(--l-bg) pl-2 pr-1">
					<SearchIcon className="size-3.5 text-(--l-muted)" />
					<span className="l-label flex-1 text-(--l-muted)">Find frames</span>
					<Kbd>{commandHint}</Kbd>
				</div>
			</div>

			{/* pages */}
			<div className="flex flex-1 flex-col px-1">
				<SectionHead
					aside={
						<span className="flex items-center gap-2">
							<span className="l-detail text-(--l-muted)">{project.frames} frames</span>
							<IconButton size={20}>
								<PlusIcon className="size-3" />
							</IconButton>
						</span>
					}
				>
					Pages
				</SectionHead>
				{pages.map((page) => (
					<div key={page.name} className="flex flex-col">
						<TreeRow
							kind="page"
							name={page.name}
							open={page.open}
							count={page.count}
							presence={page.presence}
						/>
						{page.open
							? page.frames.map((f, i) => (
									<TreeRow
										key={f.name}
										kind="frame"
										name={f.name}
										tone={f.selected ? "selected" : f.unseen ? "unseen" : "rest"}
										guide={i === page.frames.length - 1 ? "last" : "mid"}
									/>
								))
							: null}
					</div>
				))}
			</div>

			{/* people */}
			<div className="flex flex-col border-t border-(--l-border) p-1 py-2">
				<SectionHead aside={<span className="l-detail text-(--l-muted)">1 here</span>}>
					{project.team}
				</SectionHead>
				<div className="flex h-7 items-center gap-2 px-2">
					<Avatar size={16} />
					<span className="l-label flex-1 text-(--l-text)">{teammate.name}</span>
					<span className="l-detail text-(--l-muted)">{teammate.page}</span>
				</div>
			</div>
		</aside>
	);
}

// ── the properties panel ───────────────────────────────────────────────────

function PropRow({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
	return (
		<div className="flex h-7 items-center px-2">
			<span className="l-label w-16 shrink-0 text-(--l-muted)">{label}</span>
			<span className="l-value flex min-w-0 flex-1 items-center gap-2 text-(--l-text)">{value}</span>
			{unit ? <span className="l-detail text-(--l-faint)">{unit}</span> : null}
		</div>
	);
}

function PropSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex flex-col border-t border-(--l-border) px-1 py-1">
			<SectionHead aside={aside}>{title}</SectionHead>
			{children}
		</div>
	);
}

function Properties() {
	const flowIn = flows.find((f) => f.to === selection.name);
	const flowOut = flows.find((f) => f.from === selection.name);
	return (
		<aside className="flex w-[256px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-(--l-border) bg-(--l-surface)">
			<div className="flex flex-col gap-1 p-3">
				<div className="flex h-7 items-center gap-2">
					<FrameIcon className="size-3.5 text-(--l-thread-ink)" />
					<span className="l-value flex-1 text-(--l-text)">{selection.name}</span>
					<IconButton size={20}>
						<PlayIcon className="size-2.5" />
					</IconButton>
					<IconButton size={20}>
						<DotsIcon className="size-3.5" />
					</IconButton>
				</div>
				<span className="l-detail truncate text-(--l-muted)">{selection.path}</span>
			</div>
			<PropSection title="Position" aside={<span className="l-detail text-(--l-faint)">frame.json</span>}>
				<PropRow label="X" value={selection.x} unit="px" />
				<PropRow label="Y" value={selection.y} unit="px" />
			</PropSection>
			<PropSection title="Size" aside={<span className="l-detail text-(--l-faint)">frame.json</span>}>
				<PropRow label="Width" value={selection.w} unit="px" />
				<PropRow label="Height" value={selection.h} unit="px" />
			</PropSection>
			<PropSection
				title="Flows"
				aside={<span className="l-detail text-(--l-muted)">{selection.flowsIn + selection.flowsOut}</span>}
			>
				<PropRow
					label="In"
					value={
						<>
							<span className="flex-1">{flowIn?.from}</span>
							<Chip>
								<FlowStroke certainty={flowIn?.certainty ?? "will"} />
								{flowIn?.certainty}
							</Chip>
						</>
					}
				/>
				<PropRow
					label="Out"
					value={
						<>
							<span className="flex-1">{flowOut?.to}</span>
							<Chip>
								<FlowStroke certainty={flowOut?.certainty ?? "might"} />
								{flowOut?.certainty}
							</Chip>
						</>
					}
				/>
			</PropSection>
			<PropSection title="Scenario">
				<div className="px-2 pb-1">
					<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(--l-border) bg-(--l-raised) pl-2 pr-1.5">
						<span className="l-value flex-1 text-(--l-text)">{selection.scenario}</span>
						<ChevronIcon className="size-3 rotate-90 text-(--l-muted)" />
					</div>
				</div>
			</PropSection>
		</aside>
	);
}

// ── the window top ─────────────────────────────────────────────────────────

function Tab({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-7 shrink-0 items-center gap-2 rounded-[6px] border pl-2.5",
				active ? "border-(--l-border) bg-(--l-surface) pr-1" : "border-transparent pr-2.5",
			)}
		>
			{home ? <SpoolMark className="h-3.5 w-3 text-(--l-thread)" /> : null}
			<span
				className={cn(
					home ? "l-label" : "l-value",
					active ? "text-(--l-text)" : "text-(--l-muted)",
					!home && "min-w-12",
				)}
			>
				{name}
			</span>
			{active ? (
				<IconButton size={20}>
					<CloseIcon className="size-3" />
				</IconButton>
			) : null}
		</span>
	);
}

function TopBar() {
	return (
		<header className="flex h-11 shrink-0 items-center justify-between px-2">
			<nav className="flex items-center gap-1">
				<Tab name="Home" home />
				<span className="mx-1 h-4 w-px bg-(--l-border)" />
				{tabs.map((t) => (
					<Tab key={t.name} name={t.name} active={t.active} />
				))}
				<IconButton>
					<PlusIcon className="size-3.5" />
				</IconButton>
			</nav>
			<div className="flex items-center gap-2">
				<span className="flex h-7 items-center gap-1 rounded-[6px] px-2 text-(--l-muted)">
					<span className="l-value">{zoom}</span>
					<ChevronIcon className="size-3 rotate-90" />
				</span>
				<span className="h-4 w-px bg-(--l-border)" />
				<Avatar />
				<Button>Share</Button>
				<Button kind="primary" icon={<PlayIcon className="size-2.5" />}>
					Play
				</Button>
			</div>
		</header>
	);
}

// ── the canvas ─────────────────────────────────────────────────────────────

const FRAME_TOP = 128;
const FRAME_X = [24, 336, 648];

function CanvasArea() {
	const [w, h] = [drawnSize.w, drawnSize.h];
	const cartX = FRAME_X[1];
	return (
		<main className="relative min-w-0 flex-1 overflow-hidden rounded-[10px] border border-(--l-border) bg-(--l-canvas)">
			{canvasFrames.map((f, i) => {
				const x = FRAME_X[i];
				const sel = "selected" in f && f.selected;
				const unseen = "unseen" in f && f.unseen;
				return (
					<div key={f.name}>
						<div
							className="absolute flex h-5 items-center gap-2"
							style={{ left: x, top: FRAME_TOP - 32, width: w }}
						>
							{unseen ? <UnseenDot /> : null}
							<span
								className={cn(
									"l-value flex-1",
									sel ? "text-(--l-thread-ink)" : unseen ? "text-(--l-text)" : "text-(--l-muted)",
								)}
							>
								{f.name}
							</span>
							{sel ? (
								<span className="l-detail flex h-5 items-center gap-1 rounded-[6px] border border-(--l-border) bg-(--l-surface) pl-1.5 pr-2 text-(--l-text)">
									<PlayIcon className="size-2.5 text-(--l-thread)" />
									play
								</span>
							) : null}
						</div>
						<div className="absolute" style={{ left: x, top: FRAME_TOP, width: w, height: h }}>
							<CoffeeScreen screen={f.screen} />
						</div>
					</div>
				);
			})}

			{/* selection: a 1px thread with four square handles, size underneath */}
			<div
				className="pointer-events-none absolute border border-(--l-thread)"
				style={{ left: cartX - 3, top: FRAME_TOP - 3, width: w + 6, height: h + 6 }}
			>
				{[
					["-4px", "-4px", "auto", "auto"],
					["-4px", "auto", "auto", "-4px"],
					["auto", "-4px", "-4px", "auto"],
					["auto", "auto", "-4px", "-4px"],
				].map(([top, left, bottom, right]) => (
					<span
						key={`${top}${left}${bottom}${right}`}
						className="absolute size-[7px] border border-(--l-thread) bg-(--l-raised)"
						style={{ top, left, bottom, right }}
					/>
				))}
			</div>
			<div
				className="absolute flex justify-center"
				style={{ left: cartX, top: FRAME_TOP + h + 12, width: w }}
			>
				<Chip tone="solid">
					{frameSize.w} × {frameSize.h}
				</Chip>
			</div>

			{/* flows: will is drawn, might is dashed */}
			<svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
				<defs>
					<marker id="l-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
						<path d="M1 1 7 4 1 7Z" fill="var(--l-thread)" />
					</marker>
				</defs>
				<path
					d="M 268 404 C 302 404, 296 364, 330 364"
					fill="none"
					stroke="var(--l-thread)"
					strokeWidth="1.5"
					markerEnd="url(#l-head)"
				/>
				<path
					d="M 584 404 C 618 404, 608 364, 642 364"
					fill="none"
					stroke="var(--l-thread)"
					strokeWidth="1.5"
					strokeDasharray="4 3"
					markerEnd="url(#l-head)"
				/>
			</svg>

			{/* tools */}
			<div
				className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-(--l-border) bg-(--l-surface) p-1"
				style={{ boxShadow: "var(--l-float)" }}
			>
				<IconButton active>
					<SelectIcon className="size-3.5" />
				</IconButton>
				<IconButton>
					<MarqueeIcon className="size-3.5" />
				</IconButton>
				<IconButton>
					<HandIcon className="size-3.5" />
				</IconButton>
			</div>
		</main>
	);
}

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div data-appearance={appearance} className="id-ledger flex h-[900px] w-[1440px] flex-col">
			<TopBar />
			<div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
				<Sidebar />
				<CanvasArea />
				<Properties />
			</div>
		</div>
	);
}

// ── the parts sheet ────────────────────────────────────────────────────────

function Specimen({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<span className="l-detail text-(--l-faint)">{name}</span>
			{children}
		</section>
	);
}

function Caption({ children }: { children: ReactNode }) {
	return <span className="l-detail text-(--l-faint)">{children}</span>;
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 shrink-0 items-center rounded-[6px] border",
				on ? "border-transparent bg-(--l-thread)" : "border-(--l-border-strong) bg-(--l-bg)",
			)}
		>
			<span
				className={cn(
					"absolute size-3 rounded-[4px]",
					on ? "left-[13px] bg-(--l-on-thread)" : "left-[1px] bg-(--l-muted)",
				)}
			/>
		</span>
	);
}

const palette: { name: string; dark: string; light: string }[] = [
	{ name: "bg", dark: "#0e0e0e", light: "#f0efec" },
	{ name: "canvas", dark: "#161616", light: "#e6e5e1" },
	{ name: "surface", dark: "#1c1c1c", light: "#faf9f6" },
	{ name: "raised", dark: "#282828", light: "#ffffff" },
	{ name: "select", dark: "#2b2b2b", light: "#eae8e3" },
	{ name: "border", dark: "#2a2a2a", light: "#dcdad5" },
	{ name: "border-strong", dark: "#3a3a3a", light: "#c8c5bf" },
	{ name: "text", dark: "#f0efed", light: "#1a1917" },
	{ name: "muted", dark: "#94918d", light: "#696662" },
	{ name: "faint", dark: "#64615d", light: "#a3a09a" },
	{ name: "thread", dark: "#f5391a", light: "#f5391a" },
	{ name: "thread-ink", dark: "#ff5a3c", light: "#cf2c0c" },
	{ name: "peer", dark: "#3b82f6", light: "#3b82f6" },
];

const typeRoles = [
	{ role: "title", spec: "sans 15/20 500", sample: <span className="l-title">Pages</span> },
	{
		role: "control",
		spec: "sans 13/20 500",
		sample: <span className="text-[13px] font-medium leading-5">Share</span>,
	},
	{ role: "body", spec: "sans 13/20", sample: <span className="l-body">Nobody has opened it since it changed.</span> },
	{ role: "label", spec: "sans 12/16", sample: <span className="l-label">Position</span> },
	{ role: "value", spec: "mono 12/16", sample: <span className="l-value">frames/app/cart</span> },
	{ role: "detail", spec: "mono 11/16", sample: <span className="l-detail">390 × 844</span> },
];

function PartsHalf({ appearance }: { appearance: Appearance }) {
	return (
		<div
			data-appearance={appearance}
			className="id-ledger flex h-[900px] w-[720px] shrink-0 flex-col gap-5 p-6"
		>
			<header className="flex flex-col gap-1">
				<div className="flex h-7 items-center gap-2">
					<SpoolMark className="h-4 w-3.5 text-(--l-thread)" />
					<span className="l-title">ledger</span>
					<span className="l-detail ml-auto text-(--l-muted)">{appearance}</span>
				</div>
				<span className="l-detail text-(--l-muted)">
					space 4 · row 28 · pad 12 · radius 6 / 10 · border 1 · nested radius = outer − inset
				</span>
			</header>

			<div className="grid flex-1 grid-cols-3 gap-6">
				{/* column 1: controls */}
				<div className="flex flex-col gap-5">
					<Specimen name="button">
						{(
							[
								["primary", <Button key="p" kind="primary" icon={<PlayIcon className="size-2.5" />}>Play</Button>],
								["secondary", <Button key="s">Share</Button>],
								["ghost", <Button key="g" kind="ghost">Cancel</Button>],
								[
									"icon · active, rest",
									<span key="i" className="flex gap-1">
										<IconButton active>
											<PlusIcon className="size-3.5" />
										</IconButton>
										<IconButton>
											<DotsIcon className="size-3.5" />
										</IconButton>
									</span>,
								],
								["danger", <Button key="d" kind="danger">Move to Trash</Button>],
							] as const
						).map(([caption, node]) => (
							<div key={caption} className="flex h-7 items-center justify-between">
								{node}
								<Caption>{caption}</Caption>
							</div>
						))}
					</Specimen>

					<Specimen name="input · search">
						<div className="flex h-7 items-center rounded-[6px] border border-(--l-border) bg-(--l-raised) px-2">
							<span className="l-label w-12 text-(--l-muted)">Name</span>
							<span className="l-value text-(--l-text)">cart</span>
						</div>
						<div className="flex h-7 items-center rounded-[6px] border border-(--l-thread) bg-(--l-raised) px-2">
							<span className="l-label w-12 text-(--l-muted)">Path</span>
							<span className="l-value text-(--l-text)">frames/app/</span>
							<span className="h-4 w-px bg-(--l-thread)" />
						</div>
						<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(--l-border) bg-(--l-bg) pl-2 pr-1">
							<SearchIcon className="size-3.5 text-(--l-muted)" />
							<span className="l-label flex-1 text-(--l-muted)">Find frames</span>
							<Kbd>{commandHint}</Kbd>
						</div>
					</Specimen>

					<Specimen name="segmented">
						<div className="flex h-7 items-center rounded-[6px] border border-(--l-border) bg-(--l-bg) p-0.5">
							{["Dark", "Light", "System"].map((s) => (
								<span
									key={s}
									className={cn(
										"l-label flex h-full flex-1 items-center justify-center rounded-[4px]",
										s.toLowerCase() === appearance
											? "border border-(--l-border) bg-(--l-raised) text-(--l-text)"
											: "text-(--l-muted)",
									)}
								>
									{s}
								</span>
							))}
						</div>
					</Specimen>

					<Specimen name="toggle">
						<div className="flex h-7 items-center justify-between">
							<span className="l-label">Show flows</span>
							<Toggle on />
						</div>
						<div className="flex h-7 items-center justify-between">
							<span className="l-label text-(--l-muted)">Snap to frames</span>
							<Toggle />
						</div>
					</Specimen>

					<Specimen name="tab">
						<div className="flex items-center gap-1">
							<Tab name="kaffe" active />
							<Tab name="tvärsö" />
						</div>
					</Specimen>

					<Specimen name="chip">
						<div className="flex flex-wrap items-center gap-2">
							<Chip>3</Chip>
							<Chip tone="thread">
								<span className="size-1.5 rounded-full bg-(--l-thread)" />
								live
							</Chip>
							<Chip>
								<UnseenDot />
								unseen
							</Chip>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Chip>
								<FlowStroke certainty="will" />
								will
							</Chip>
							<Chip>
								<FlowStroke certainty="might" />
								might
							</Chip>
							<Chip tone="solid">390 × 844</Chip>
						</div>
					</Specimen>
				</div>

				{/* column 2: rows and floating things */}
				<div className="flex flex-col gap-5">
					<Specimen name="sidebar row">
						<div className="flex flex-col rounded-[10px] border border-(--l-border) bg-(--l-surface) p-1">
							{(
								[
									["rest", "menu"],
									["hover", "menu"],
									["selected", "cart"],
									["unseen", "receipt"],
								] as const
							).map(([tone, name], i) => (
								<div key={tone} className="relative">
									<TreeRow kind="frame" name={name} tone={tone} guide={i === 3 ? "last" : "mid"} />
									<span
										className={cn(
											"l-detail pointer-events-none absolute top-1.5 text-(--l-faint)",
											tone === "unseen" ? "right-6" : "right-2",
										)}
									>
										{tone}
									</span>
								</div>
							))}
							<TreeRow kind="page" name="site" count={2} presence />
						</div>
						<span className="l-label text-(--l-muted)">The guide hangs under the folder. Selection lights its segment.</span>
					</Specimen>

					<Specimen name="property row">
						<div className="flex flex-col rounded-[10px] border border-(--l-border) bg-(--l-surface) p-1">
							<SectionHead aside={<span className="l-detail text-(--l-faint)">frame.json</span>}>
								Position
							</SectionHead>
							<PropRow label="X" value={selection.x} unit="px" />
							<PropRow label="Y" value={selection.y} unit="px" />
						</div>
					</Specimen>

					<Specimen name="menu">
						<div
							className="flex w-[200px] flex-col rounded-[10px] border border-(--l-border) bg-(--l-raised) p-1"
							style={{ boxShadow: "var(--l-float)" }}
						>
							{menuItems.map((m, i) => (
								<div key={m.label}>
									{m.danger ? <div className="mx-2 my-1 h-px bg-(--l-border)" /> : null}
									<div
										className={cn(
											"flex h-7 items-center rounded-[6px] px-2",
											i === 0 && "bg-(--l-select)",
										)}
									>
										<span
											className={cn(
												"l-body flex-1",
												m.danger ? "text-(--l-thread-ink)" : "text-(--l-text)",
											)}
										>
											{m.label}
										</span>
										<span className="l-detail text-(--l-muted)">{m.key}</span>
									</div>
								</div>
							))}
						</div>
					</Specimen>

					<Specimen name="toast">
						<div
							className="flex h-10 items-center gap-3 rounded-[10px] border border-(--l-border) bg-(--l-raised) pl-3 pr-1.5"
							style={{ boxShadow: "var(--l-float)" }}
						>
							<span className="l-body flex-1 truncate text-(--l-text)">{toast.text}</span>
							<Button kind="ghost">
								<span className="text-(--l-text)">{toast.action}</span>
							</Button>
						</div>
					</Specimen>

					<div className="flex gap-6">
						<Specimen name="tooltip">
							<span
								className="flex h-7 items-center gap-2 rounded-[6px] border border-(--l-border) bg-(--l-raised) pl-2 pr-1"
								style={{ boxShadow: "var(--l-float)" }}
							>
								<span className="l-label">Pan the canvas</span>
								<Kbd>H</Kbd>
							</span>
						</Specimen>
						<Specimen name="avatar">
							<span className="flex h-7 items-center gap-2">
								<Avatar />
								<Avatar size={16} />
							</span>
						</Specimen>
					</div>
				</div>

				{/* column 3: type and colour */}
				<div className="flex flex-col gap-5">
					<Specimen name="type">
						<div className="flex flex-col">
							{typeRoles.map((t) => (
								<div
									key={t.role}
									className="flex flex-col gap-0.5 border-b border-(--l-border) py-1.5 last:border-b-0"
								>
									<span className="flex justify-between">
										<Caption>{t.role}</Caption>
										<Caption>{t.spec}</Caption>
									</span>
									<span className="text-(--l-text)">{t.sample}</span>
								</div>
							))}
						</div>
					</Specimen>

					<Specimen name="palette">
						<div className="flex flex-col">
							{palette.map((p) => {
								const hex = appearance === "dark" ? p.dark : p.light;
								return (
									<div key={p.name} className="flex h-6 items-center gap-2">
										<span
											className="size-4 shrink-0 rounded-[4px] border border-(--l-border-strong)"
											style={{ background: hex }}
										/>
										<span className="l-value flex-1 text-(--l-text)">{p.name}</span>
										<span className="l-detail text-(--l-muted)">{hex}</span>
									</div>
								);
							})}
						</div>
					</Specimen>
				</div>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px]">
			<PartsHalf appearance="dark" />
			<PartsHalf appearance="light" />
		</div>
	);
}
