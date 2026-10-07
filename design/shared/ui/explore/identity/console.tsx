import "./console.css";
import type { CSSProperties, ReactNode } from "react";
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

/*
 * console: the machine register taken all the way. One face (JetBrains Mono), one body
 * size (12px on a 7.2 × 24 cell), two weights, two inks. Corners are square. Rules
 * separate, fills never decorate. Two inversions carry every state: red is the cursor
 * (what is selected, what the keyboard is on), ink is the mode (the active tool, the
 * chosen segment, a toggle that is on).
 */

const palettes = {
	dark: {
		bg: "#0b0b0b",
		canvas: "#111111",
		raise: "#151515",
		fill: "#1b1b1b",
		dot: "#262626",
		line: "#242424",
		line2: "#3b3b3b",
		mute: "#8c8984",
		ink: "#eceae6",
		thread: "#f5391a",
		threadInk: "#f5391a",
		onThread: "#0b0b0b",
		mate: teammate.color,
	},
	light: {
		bg: "#f6f5f1",
		canvas: "#eceae5",
		raise: "#fcfbf9",
		fill: "#ebe9e3",
		dot: "#cdc9c1",
		line: "#dddad3",
		line2: "#b3afa6",
		mute: "#66635d",
		ink: "#161513",
		thread: "#f5391a",
		threadInk: "#c8290d",
		onThread: "#0b0b0b",
		mate: teammate.color,
	},
} as const;

type Palette = (typeof palettes)[Appearance];

function vars(appearance: Appearance): CSSProperties {
	const p = palettes[appearance];
	return {
		"--k-bg": p.bg,
		"--k-canvas": p.canvas,
		"--k-raise": p.raise,
		"--k-fill": p.fill,
		"--k-dot": p.dot,
		"--k-line": p.line,
		"--k-line2": p.line2,
		"--k-mute": p.mute,
		"--k-ink": p.ink,
		"--k-thread": p.thread,
		"--k-thread-ink": p.threadInk,
		"--k-on-thread": p.onThread,
		"--k-mate": p.mate,
	} as CSSProperties;
}

/* ───────────────────────────── primitives ───────────────────────────── */

function Key({ k, className }: { k: string; className?: string }) {
	return <span className={cn("text-(--k-mute)", className)}>[{k}]</span>;
}

type BtnKind = "primary" | "secondary" | "ghost" | "danger";

function Btn({ kind, k, children }: { kind: BtnKind; k?: string; children: ReactNode }) {
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-[1ch] px-2 whitespace-nowrap",
				kind === "primary" && "bg-(--k-thread) font-semibold text-(--k-on-thread)",
				kind === "secondary" && "border border-(--k-line2) text-(--k-ink)",
				kind === "ghost" && "text-(--k-ink)",
				kind === "danger" && "border border-(--k-thread) text-(--k-thread-ink)",
			)}
		>
			{k ? <Key k={k} className={cn(kind === "primary" && "text-(--k-on-thread) opacity-60")} /> : null}
			{children}
		</span>
	);
}

function IconBtn({ children, active }: { children: ReactNode; active?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex size-6 shrink-0 items-center justify-center border",
				active ? "border-(--k-ink) bg-(--k-ink) text-(--k-bg)" : "border-(--k-line2) text-(--k-ink)",
			)}
		>
			{children}
		</span>
	);
}

function Avatar({ size = 16 }: { size?: 16 | 24 }) {
	return (
		<span
			className="k-micro inline-flex shrink-0 items-center justify-center"
			style={{
				width: size === 24 ? 24 : 20,
				height: size,
				background: "var(--k-mate)",
				color: "var(--k-on-thread)",
			}}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function UnseenMark() {
	return <span className="inline-block size-1.5 shrink-0 bg-(--k-thread)" />;
}

/** A section heading drawn as a ruled line: `── pages ─────── 3` */
function Rule({ label, meta, className }: { label: string; meta?: ReactNode; className?: string }) {
	return (
		<div className={cn("flex h-6 items-center gap-[1ch] px-3 text-(--k-mute)", className)}>
			<span className="h-px w-[1ch] bg-(--k-line2)" />
			<span>{label}</span>
			<span className="h-px flex-1 bg-(--k-line2)" />
			{meta === undefined ? null : <span>{meta}</span>}
		</div>
	);
}

function FlowArrow({ certainty, width }: { certainty: "will" | "might"; width: number }) {
	return (
		<svg width={width} height={8} viewBox={`0 0 ${width} 8`} className="shrink-0 text-(--k-thread)" aria-hidden="true">
			<line
				x1={0}
				y1={4}
				x2={width - 5}
				y2={4}
				stroke="currentColor"
				strokeWidth={1}
				strokeDasharray={certainty === "might" ? "3 2" : undefined}
				shapeRendering="crispEdges"
			/>
			<path d={`M${width - 6} 0.5 L${width} 4 L${width - 6} 7.5 Z`} fill="currentColor" />
		</svg>
	);
}

/* the tree, as `tree` draws it: four cells a level, lines at the first cell's centre */
type Glyph = "pipe" | "tee" | "end" | "none";

function TreeGlyph({ g }: { g: Glyph }) {
	return (
		<span className="relative inline-block h-6 w-7 shrink-0">
			{g === "none" ? null : (
				<span className="absolute left-1 top-0 w-px bg-current" style={{ height: g === "end" ? 12 : 24 }} />
			)}
			{g === "tee" || g === "end" ? <span className="absolute left-1 top-3 h-px w-4 bg-current" /> : null}
		</span>
	);
}

type RowState = "rest" | "hover" | "selected";

function TreeRow({
	glyphs,
	fold,
	name,
	dir,
	meta,
	state = "rest",
	strong,
	muted,
}: {
	glyphs: Glyph[];
	fold?: "open" | "closed";
	name: string;
	dir?: boolean;
	meta?: ReactNode;
	state?: RowState;
	strong?: boolean;
	muted?: boolean;
}) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"flex h-6 items-center pr-3 pl-1",
				state === "hover" && "bg-(--k-fill)",
				selected && "bg-(--k-thread) text-(--k-on-thread)",
			)}
		>
			<span className={cn("w-4 shrink-0 text-center", selected ? "" : "text-(--k-mute)")}>
				{fold === "open" ? "−" : fold === "closed" ? "+" : ""}
			</span>
			<span className={cn("flex shrink-0", selected ? "text-(--k-on-thread)" : "text-(--k-line2)")}>
				{glyphs.map((g, i) => (
					<TreeGlyph key={i} g={g} />
				))}
			</span>
			<span
				className={cn(
					"min-w-0 truncate",
					(strong || selected) && "font-semibold",
					muted && !selected && "text-(--k-mute)",
				)}
			>
				{name}
				{dir ? <span className={selected ? "" : "text-(--k-mute)"}>/</span> : null}
			</span>
			<span className="ml-auto flex shrink-0 items-center gap-[1ch] pl-2">{meta}</span>
		</div>
	);
}

function Field({
	children,
	unit,
	focus,
	className,
}: {
	children: ReactNode;
	unit?: string;
	focus?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"flex h-6 min-w-0 flex-1 items-center gap-[1ch] border px-2",
				focus ? "border-(--k-ink)" : "border-(--k-line)",
				className,
			)}
		>
			<span className="flex min-w-0 flex-1 items-center truncate">{children}</span>
			{unit ? <span className="shrink-0 text-(--k-mute)">{unit}</span> : null}
		</span>
	);
}

function Caret() {
	return <span className="inline-block h-4 w-[1ch] bg-(--k-thread) align-middle" />;
}

function PropRow({ k, children }: { k: string; children: ReactNode }) {
	return (
		<div className="flex h-7 items-center gap-[1ch] px-3">
			<span className="w-[6ch] shrink-0 text-(--k-mute)">{k}</span>
			{children}
		</div>
	);
}

function Segmented({ options, active }: { options: string[]; active: string }) {
	return (
		<span className="inline-flex h-6 border border-(--k-line2)">
			{options.map((o, i) => (
				<span
					key={o}
					className={cn(
						"flex items-center px-2",
						i > 0 && "border-l border-(--k-line2)",
						o === active ? "bg-(--k-ink) font-semibold text-(--k-bg)" : "text-(--k-mute)",
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
		<span className={cn("inline-flex h-4 w-7 items-center border p-px", on ? "border-(--k-ink) bg-(--k-ink)" : "border-(--k-line2)")}>
			<span className={cn("block size-3", on ? "ml-auto bg-(--k-bg)" : "bg-(--k-line2)")} />
		</span>
	);
}

type ChipKind = "count" | "live" | "unseen";

function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
	return (
		<span
			className={cn(
				"k-micro inline-flex h-4 shrink-0 items-center gap-1 px-1",
				kind === "count" && "border border-(--k-line2) font-normal text-(--k-mute)",
				kind === "live" && "bg-(--k-ink) text-(--k-bg)",
				kind === "unseen" && "border border-(--k-thread) text-(--k-thread-ink)",
			)}
		>
			{kind === "unseen" ? <UnseenMark /> : null}
			{children}
		</span>
	);
}

/* ───────────────────────────── the window ───────────────────────────── */

function TabStrip() {
	return (
		<div className="flex h-8 shrink-0 items-stretch border-b border-(--k-line)">
			<div className="flex w-10 items-center justify-center border-r border-(--k-line)">
				<SpoolMark className="h-4 w-[13px] text-(--k-thread)" />
			</div>
			<Tab index="~" name="home" />
			{tabs.map((t, i) => (
				<Tab key={t.name} index={String(i + 1)} name={t.name} active={t.active} />
			))}
			<div className="flex w-8 items-center justify-center border-r border-(--k-line) text-(--k-mute)">+</div>
			<div className="ml-auto flex items-center gap-2 pr-2">
				<span className="flex items-center gap-[1ch] pr-2 text-(--k-mute)">
					<span>−</span>
					<span className="text-(--k-ink)">{zoom}</span>
					<span>+</span>
				</span>
				<span className="h-4 w-px bg-(--k-line)" />
				<Avatar size={24} />
				<span className="h-4 w-px bg-(--k-line)" />
				<Btn kind="secondary" k="s">
					share
				</Btn>
				<Btn kind="primary" k="p">
					play
				</Btn>
			</div>
		</div>
	);
}

function Tab({ index, name, active }: { index: string; name: string; active?: boolean }) {
	return (
		<div
			className={cn(
				"relative flex items-center gap-[1ch] border-r border-(--k-line) px-3",
				active ? "bg-(--k-canvas) font-semibold" : "text-(--k-mute)",
			)}
		>
			<span className={cn("font-normal", active ? "text-(--k-thread-ink)" : "")}>{index}</span>
			<span>{name}</span>
			{active ? <span className="ml-2 font-normal text-(--k-mute)">×</span> : null}
			{active ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-(--k-thread)" /> : null}
		</div>
	);
}

function Sidebar() {
	return (
		<aside className="flex w-[256px] shrink-0 flex-col border-r border-(--k-line)">
			<div className="flex h-8 shrink-0 items-center gap-[1ch] border-b border-(--k-line) px-3">
				<span className="font-semibold">{project.name}</span>
				<span className="ml-auto text-(--k-mute)">{project.team}</span>
			</div>
			<div className="px-3 pt-3 pb-2">
				<Field>
					<span className="text-(--k-mute)">/&nbsp;Filter pages</span>
				</Field>
			</div>
			<Rule label="pages" />
			<div className="pb-2">
				<TreeRow glyphs={[]} fold="open" name="frames" dir muted />
				{pages.map((page, pi) => {
					const last = pi === pages.length - 1;
					return (
						<div key={page.name}>
							<TreeRow
								glyphs={[last ? "end" : "tee"]}
								fold={page.open ? "open" : "closed"}
								name={page.name}
								dir
								strong={page.current}
								meta={
									<>
										{page.presence ? <Avatar /> : null}
										<span className="text-(--k-mute)">{page.count}</span>
									</>
								}
							/>
							{page.open
								? page.frames.map((f, fi) => (
										<TreeRow
											key={f.name}
											glyphs={[last ? "none" : "pipe", fi === page.frames.length - 1 ? "end" : "tee"]}
											name={f.name}
											state={f.selected ? "selected" : "rest"}
											muted={!f.selected && !f.unseen}
											meta={
												f.unseen ? (
													<span className="flex items-center gap-[1ch] text-(--k-thread-ink)">
														<UnseenMark />
														unseen
													</span>
												) : f.selected ? (
													<span className="opacity-60">[p]</span>
												) : null
											}
										/>
									))
								: null}
						</div>
					);
				})}
				<div className="flex h-6 items-center pl-5 text-(--k-mute)">
					{pages.length} pages, {project.frames} frames
				</div>
			</div>
			<Rule label="flows" meta={flows.length} />
			<div className="pb-2">
				{flows.map((f) => (
					<div key={f.from} className="flex h-6 items-center gap-[1ch] px-3 pl-5">
						<span className="text-(--k-mute)">{f.from}</span>
						<FlowArrow certainty={f.certainty} width={22} />
						<span>{f.to}</span>
						<span className="ml-auto text-(--k-mute)">{f.certainty}</span>
					</div>
				))}
			</div>
			<Rule label="people" meta={1} />
			<div className="flex h-6 items-center gap-[1ch] px-3 pl-5">
				<Avatar />
				<span>{teammate.name}</span>
				<span className="ml-auto text-(--k-mute)">{teammate.page}/</span>
			</div>
			<div className="mt-auto flex h-6 shrink-0 items-center gap-[2ch] border-t border-(--k-line) px-3 text-(--k-mute)">
				<span>
					<Key k="↑↓" /> move
				</span>
				<span>
					<Key k="↵" /> open
				</span>
				<span>
					<Key k="/" /> filter
				</span>
			</div>
		</aside>
	);
}

/* canvas geometry, in the canvas's own pixels */
const FRAME_TOP = 132;
const FRAME_LEFT = 32;
const FRAME_GAP = 64;
const frameX = (i: number) => FRAME_LEFT + i * (drawnSize.w + FRAME_GAP);

function Canvas() {
	const midY = FRAME_TOP + 196;
	return (
		<main className="k-dots relative min-w-0 flex-1 overflow-hidden">
			<div className="absolute top-3 left-4 flex items-center gap-[1ch] text-(--k-mute)">
				<span>
					frames/<span className="text-(--k-ink)">app/</span>
				</span>
				<span>·</span>
				<span>{pages[0]?.count} frames</span>
			</div>
			{canvasFrames.map((f, i) => {
				const sel = "selected" in f && f.selected;
				const unseen = "unseen" in f && f.unseen;
				return (
					<div key={f.name} className="absolute" style={{ left: frameX(i), top: FRAME_TOP - 24, width: drawnSize.w }}>
						<div className="flex h-6 items-center gap-[1ch]">
							{unseen ? <UnseenMark /> : null}
							<span
								className={cn(
									sel ? "font-semibold text-(--k-thread-ink)" : unseen ? "text-(--k-ink)" : "text-(--k-mute)",
								)}
							>
								{f.name}
							</span>
							{sel ? (
								<span className="ml-auto text-(--k-thread-ink)">
									<span className="opacity-70">[p]</span> play
								</span>
							) : null}
							{unseen ? <span className="ml-auto text-(--k-thread-ink)">unseen</span> : null}
						</div>
						<div className="relative" style={{ width: drawnSize.w, height: drawnSize.h }}>
							<CoffeeScreen screen={f.screen} />
							{sel ? <Selection /> : null}
						</div>
					</div>
				);
			})}
			{flows.map((fl, i) => {
				const x1 = frameX(i) + drawnSize.w + 6;
				const x2 = frameX(i + 1) - 6;
				return (
					<div key={fl.from} className="absolute" style={{ left: x1, top: midY - 20, width: x2 - x1 }}>
						<div className="k-micro text-center font-normal text-(--k-mute)">{fl.certainty}</div>
						<FlowArrow certainty={fl.certainty} width={x2 - x1} />
					</div>
				);
			})}
			<Toolbar className="absolute bottom-4 left-1/2 -translate-x-1/2" />
		</main>
	);
}

function Selection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-px border border-(--k-thread)" />
			{["-left-[3px] -top-[3px]", "-right-[3px] -top-[3px]", "-left-[3px] -bottom-[3px]", "-right-[3px] -bottom-[3px]"].map(
				(p) => (
					<span key={p} className={cn("absolute size-1.5 bg-(--k-thread)", p)} />
				),
			)}
			<div className="absolute inset-x-0 -bottom-7 flex justify-center">
				<span className="k-micro flex h-4 items-center bg-(--k-thread) px-1 text-(--k-on-thread)">
					{frameSize.w} × {frameSize.h}
				</span>
			</div>
		</>
	);
}

function Toolbar({ className }: { className?: string }) {
	const tools = [
		{ k: "v", name: "select", active: true },
		{ k: "m", name: "marquee" },
		{ k: "h", name: "hand" },
	];
	return (
		<div className={cn("flex h-8 w-max items-stretch border border-(--k-line2) bg-(--k-raise) p-1", className)}>
			{tools.map((t) => (
				<span
					key={t.k}
					className={cn(
						"flex items-center gap-[1ch] px-2",
						t.active ? "bg-(--k-ink) font-semibold text-(--k-bg)" : "text-(--k-mute)",
					)}
				>
					<span className={cn("font-normal", t.active ? "opacity-60" : "")}>[{t.k}]</span>
					{t.name}
				</span>
			))}
			<span className="mx-1 w-px bg-(--k-line)" />
			<span className="flex items-center gap-[1ch] px-2 text-(--k-mute)">
				<span>[f]</span>
				<span>fit</span>
			</span>
		</div>
	);
}

function Properties() {
	return (
		<aside className="flex w-[280px] shrink-0 flex-col border-l border-(--k-line)">
			<div className="flex h-8 shrink-0 items-center gap-[1ch] border-b border-(--k-line) px-3">
				<span className="size-2 bg-(--k-thread)" />
				<span className="font-semibold">{selection.name}</span>
				<span className="text-(--k-mute)">frame</span>
				<span className="ml-auto text-(--k-mute)">
					<Key k="esc" />
				</span>
			</div>
			<div className="pt-2" />
			<Rule label="file" />
			<PropRow k="name">
				<Field focus>
					{selection.name}
					<Caret />
				</Field>
			</PropRow>
			<PropRow k="path">
				<span className="truncate">
					<span className="text-(--k-mute)">frames/app/cart/</span>frame.tsx
				</span>
			</PropRow>
			<div className="pt-2" />
			<Rule label="position" meta="frame.json" />
			<PropRow k="x">
				<Field unit="px">{selection.x}</Field>
			</PropRow>
			<PropRow k="y">
				<Field unit="px">{selection.y}</Field>
			</PropRow>
			<div className="pt-2" />
			<Rule label="size" meta="frame.json" />
			<PropRow k="w">
				<Field unit="px">{selection.w}</Field>
			</PropRow>
			<PropRow k="h">
				<Field unit="px">{selection.h}</Field>
			</PropRow>
			<div className="pt-2" />
			<Rule label="flows" meta={selection.flowsIn + selection.flowsOut} />
			<PropRow k="in">
				<span className="w-[1ch]">{selection.flowsIn}</span>
				<span className="text-(--k-mute)">menu</span>
				<FlowArrow certainty="will" width={22} />
				<span className="ml-auto text-(--k-mute)">will</span>
			</PropRow>
			<PropRow k="out">
				<span className="w-[1ch]">{selection.flowsOut}</span>
				<FlowArrow certainty="might" width={22} />
				<span>receipt</span>
				<span className="ml-auto text-(--k-mute)">might</span>
			</PropRow>
			<div className="pt-2" />
			<Rule label="scenario" />
			<PropRow k="name">
				<Field unit="▾">{selection.scenario}</Field>
			</PropRow>
			<div className="mt-auto flex h-6 shrink-0 items-center gap-[2ch] border-t border-(--k-line) px-3 text-(--k-mute)">
				<span>
					<Key k="tab" /> next field
				</span>
				<span>
					<Key k="⌫" /> trash
				</span>
			</div>
		</aside>
	);
}

function StatusLine({ className }: { className?: string }) {
	const sep = <span className="text-(--k-line2)">│</span>;
	return (
		<footer className={cn("flex h-6 shrink-0 items-center border-t border-(--k-line) pr-3", className)}>
			<span className="flex h-full items-center bg-(--k-ink) px-3 font-semibold text-(--k-bg)">select</span>
			<span className="flex items-center gap-[1ch] pl-3">
				<span className="font-semibold">{project.name}</span>
				{sep}
				<span>
					<span className="text-(--k-mute)">app/</span>
					<span className="text-(--k-thread-ink)">{selection.name}</span>
				</span>
				{sep}
				<span>
					{frameSize.w}×{frameSize.h}
				</span>
				{sep}
				<span>{zoom}</span>
			</span>
			<span className="ml-auto flex items-center gap-[1ch] text-(--k-mute)">
				<span>{project.synced}</span>
				{sep}
				<span className="flex items-center gap-[1ch]">
					<Avatar />
					<span>ada on {teammate.page}</span>
				</span>
				{sep}
				<span>
					<Key k={commandHint} /> commands
				</span>
				<span>
					<Key k="?" /> keys
				</span>
			</span>
		</footer>
	);
}

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-console flex h-full w-full flex-col overflow-hidden bg-(--k-bg)"
			data-appearance={appearance}
			style={vars(appearance)}
		>
			<TabStrip />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Properties />
			</div>
			<StatusLine />
		</div>
	);
}

/* ───────────────────────────── the parts sheet ───────────────────────────── */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-1", className)}>
			<div className="k-micro font-normal text-(--k-mute)">{label}</div>
			{children}
		</section>
	);
}

function ContextMenu() {
	return (
		<div className="w-[232px] border border-(--k-line2) bg-(--k-raise) py-1">
			{menuItems.map((m, i) => (
				<div key={m.label}>
					{m.danger ? <div className="my-1 h-px bg-(--k-line)" /> : null}
					<div
						className={cn(
							"flex h-6 items-center px-2",
							i === 1 && "bg-(--k-thread) text-(--k-on-thread)",
							m.danger && "text-(--k-thread-ink)",
						)}
					>
						<span>{m.label}</span>
						<span className={cn("ml-auto", i === 1 ? "opacity-60" : "text-(--k-mute)")}>{m.key}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Toast() {
	return (
		<div className="relative flex h-8 w-[304px] items-center gap-[1ch] border border-(--k-line2) bg-(--k-raise) pr-1 pl-3">
			<span>
				<span className="font-semibold">cart</span> moved to Trash
			</span>
			<span className="ml-auto">
				<Btn kind="ghost" k="u">
					{toast.action}
				</Btn>
			</span>
			<span className="absolute bottom-0 left-0 h-0.5 w-[62%] bg-(--k-thread)" />
		</div>
	);
}

function Swatches({ p }: { p: Palette }) {
	const roles: [string, string][] = [
		["bg", p.bg],
		["canvas", p.canvas],
		["raise", p.raise],
		["fill", p.fill],
		["line", p.line],
		["line2", p.line2],
		["mute", p.mute],
		["ink", p.ink],
		["thread", p.thread],
		["thread-ink", p.threadInk],
		["on-thread", p.onThread],
		["mate", p.mate],
	];
	return (
		<div className="grid grid-flow-col grid-cols-2 grid-rows-6 gap-x-4">
			{roles.map(([name, hex]) => (
				<div key={name} className="flex h-6 items-center gap-[1ch] border-b border-(--k-line)">
					<span className="size-3.5 shrink-0 border border-(--k-line2)" style={{ background: hex }} />
					<span className="w-[10ch] shrink-0">{name}</span>
					<span className="ml-auto shrink-0 text-(--k-mute)">{hex}</span>
				</div>
			))}
		</div>
	);
}

function TypeScale() {
	const roles = [
		{ name: "display", spec: "20/24 600", cls: "k-display", sample: "kaffe" },
		{ name: "strong", spec: "12/24 600", cls: "font-semibold", sample: "cart" },
		{ name: "body", spec: "12/24 400", cls: "", sample: "frames/app/cart/frame.tsx" },
		{ name: "mute", spec: "12/24 400", cls: "text-(--k-mute)", sample: "3 frames · saved" },
		{ name: "key", spec: "12/24 400", cls: "", sample: "" },
		{ name: "micro", spec: "10/16 600", cls: "k-micro", sample: "390 × 844" },
	];
	return (
		<div className="flex flex-col">
			{roles.map((r) => (
				<div key={r.name} className="flex h-6 items-center border-b border-(--k-line)">
					<span className="w-[9ch] shrink-0 text-(--k-mute)">{r.name}</span>
					<span className="w-[11ch] shrink-0 text-(--k-mute)">{r.spec}</span>
					<span className={cn("truncate", r.cls)}>
						{r.name === "key" ? (
							<>
								<Key k="p" /> play
							</>
						) : (
							r.sample
						)}
					</span>
				</div>
			))}
		</div>
	);
}

/** the canvas marks at small size: label, selection, readout, a might flow, unseen */
function CanvasMarks() {
	const box = "relative h-[72px] w-[104px] border border-(--k-line) bg-(--k-raise)";
	return (
		<div className="k-dots flex h-[136px] items-start gap-0 border border-(--k-line) px-4 pt-2">
			<div className="flex w-[104px] flex-col">
				<div className="flex h-6 items-center">
					<span className="font-semibold text-(--k-thread-ink)">cart</span>
					<span className="ml-auto text-(--k-thread-ink)">
						<span className="opacity-70">[p]</span> play
					</span>
				</div>
				<div className={box}>
					<Selection />
				</div>
			</div>
			<div className="flex w-[72px] flex-col items-center px-1.5 pt-[42px]">
				<div className="k-micro font-normal text-(--k-mute)">might</div>
				<FlowArrow certainty="might" width={60} />
			</div>
			<div className="flex w-[104px] flex-col">
				<div className="flex h-6 items-center gap-[1ch]">
					<UnseenMark />
					<span>receipt</span>
				</div>
				<div className={box} />
			</div>
		</div>
	);
}

function PartsHalf({ appearance }: { appearance: Appearance }) {
	const p = palettes[appearance];
	const rowStates: { state: string; node: ReactNode }[] = [
		{ state: "rest", node: <TreeRow glyphs={["pipe", "tee"]} name="menu" muted /> },
		{ state: "hover", node: <TreeRow glyphs={["pipe", "tee"]} name="menu" state="hover" /> },
		{
			state: "selected",
			node: <TreeRow glyphs={["pipe", "tee"]} name="cart" state="selected" meta={<span className="opacity-60">[p]</span>} />,
		},
		{
			state: "unseen",
			node: (
				<TreeRow
					glyphs={["pipe", "end"]}
					name="receipt"
					meta={
						<span className="flex items-center gap-[1ch] text-(--k-thread-ink)">
							<UnseenMark />
							unseen
						</span>
					}
				/>
			),
		},
		{
			state: "page",
			node: (
				<TreeRow
					glyphs={["tee"]}
					fold="closed"
					name="site"
					dir
					meta={
						<>
							<Avatar />
							<span className="text-(--k-mute)">2</span>
						</>
					}
				/>
			),
		},
	];
	return (
		<div
			className="id-console flex h-full w-[720px] flex-col gap-4 overflow-hidden bg-(--k-bg) px-6 py-5"
			data-appearance={appearance}
			style={vars(appearance)}
		>
			<header className="flex h-8 shrink-0 items-center gap-[1ch] border-b border-(--k-line) pb-2">
				<SpoolMark className="h-5 w-4 text-(--k-thread)" />
				<span className="k-display ml-1">console</span>
				<span className="text-(--k-mute)">{appearance}</span>
				<span className="ml-auto text-(--k-mute)">cell 7.2×24 · row 24 · radius 0 · rule 1px · space 4n</span>
			</header>

			<div className="grid grid-cols-2 gap-x-6">
				<div className="flex flex-col gap-3">
					<Spec label="button · primary secondary ghost icon danger">
						<div className="flex flex-wrap items-center gap-2">
							<Btn kind="primary" k="p">
								play
							</Btn>
							<Btn kind="secondary" k="s">
								share
							</Btn>
							<Btn kind="ghost">cancel</Btn>
							<IconBtn>+</IconBtn>
							<Btn kind="danger" k="⌫">
								trash
							</Btn>
						</div>
					</Spec>
					<Spec label="input · focused, the caret is the cursor · search">
						<div className="flex flex-col gap-1">
							<Field focus>
								cart
								<Caret />
							</Field>
							<Field>
								<span className="text-(--k-mute)">/&nbsp;Search frames and pages</span>
								<span className="ml-auto">
									<Key k={commandHint} />
								</span>
							</Field>
						</div>
					</Spec>
					<div className="flex gap-6">
						<Spec label="segmented">
							<Segmented options={["Dark", "Light", "System"]} active={appearance === "dark" ? "Dark" : "Light"} />
						</Spec>
						<Spec label="toggle · off on">
							<div className="flex h-6 items-center gap-2">
								<Toggle on={false} />
								<Toggle on />
							</div>
						</Spec>
					</div>
					<Spec label="tab · rest active">
						<div className="flex h-8 border-y border-(--k-line)">
							<Tab index="~" name="home" />
							<Tab index="1" name="kaffe" active />
							<Tab index="2" name="tvärsö" />
						</div>
					</Spec>
					<div className="flex gap-6">
						<Spec label="chip">
							<div className="flex h-6 items-center gap-2">
								<Chip kind="count">3</Chip>
								<Chip kind="live">live</Chip>
								<Chip kind="unseen">unseen</Chip>
							</div>
						</Spec>
						<Spec label="avatar">
							<div className="flex h-6 items-center gap-2">
								<Avatar size={24} />
								<Avatar />
							</div>
						</Spec>
						<Spec label="tooltip">
							<div className="flex h-6 items-center">
								<span className="flex h-6 items-center gap-[1ch] bg-(--k-ink) px-2 text-(--k-bg)">
									play
									<span className="opacity-60">[p]</span>
								</span>
							</div>
						</Spec>
					</div>
					<Spec label="section rule · property row 24 + 4">
						<div className="-mx-3 flex flex-col">
							<Rule label="position" meta="frame.json" />
							<PropRow k="x">
								<Field unit="px">{selection.x}</Field>
							</PropRow>
							<PropRow k="out">
								<span className="w-[1ch]">{selection.flowsOut}</span>
								<FlowArrow certainty="might" width={22} />
								<span>receipt</span>
								<span className="ml-auto text-(--k-mute)">might</span>
							</PropRow>
						</div>
					</Spec>
					<Spec label="toolbar · ink is the mode">
						<Toolbar />
					</Spec>
				</div>

				<div className="flex flex-col gap-3">
					<Spec label="sidebar row · 24 · red is the cursor">
						<div className="flex flex-col border-y border-(--k-line)">
							{rowStates.map((r) => (
								<div key={r.state} className="flex items-center">
									<div className="w-[232px] shrink-0">{r.node}</div>
									<span className="pl-3 text-(--k-mute)">{r.state}</span>
								</div>
							))}
						</div>
					</Spec>
					<div className="flex items-start gap-4">
						<Spec label="context menu">
							<ContextMenu />
						</Spec>
						<Spec label="flows" className="flex-1">
							<div className="flex flex-col">
								{flows.map((f) => (
									<div key={f.from} className="flex h-6 items-center gap-[1ch]">
										<FlowArrow certainty={f.certainty} width={22} />
										<span>{f.certainty}</span>
									</div>
								))}
							</div>
						</Spec>
					</div>
					<Spec label="toast · the bar drains the undo window">
						<Toast />
					</Spec>
					<Spec label="canvas · label, selection, readout, unseen">
						<CanvasMarks />
					</Spec>
				</div>
			</div>

			<Spec label="status line">
				<StatusLine className="border border-(--k-line)" />
			</Spec>

			<div className="mt-auto grid grid-cols-2 gap-x-6">
				<Spec label="type · one face, 3 sizes, 2 weights">
					<TypeScale />
				</Spec>
				<Spec label="palette">
					<Swatches p={p} />
				</Spec>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-full w-full">
			<PartsHalf appearance="dark" />
			<PartsHalf appearance="light" />
		</div>
	);
}
