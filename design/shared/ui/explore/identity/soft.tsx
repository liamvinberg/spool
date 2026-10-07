import "./soft.css";
import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	type Appearance,
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
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SpoolMark } from "shared/ui/spool/mark";

/*
 * soft — one take on spool's design system.
 *
 * Rules the parts sheet shows and the canvas obeys:
 * - 4px spacing; panels sit 8px off the window edge and off each other.
 * - Concentric radii: a container is 16, a card in it 12, a row in a card 8 (card padding 4).
 *   Anything single-line that you press or that floats is a pill.
 * - One row height, 32. Small controls (chips, tabs' counts, labels on the canvas) are 24 or 20.
 * - Raised surfaces are lit from above (k-edge) instead of bordered; floating ones cast (k-float).
 * - Colour by role: neutral raised = current/active, thread tint + thread text = selected,
 *   solid thread = the primary action or on, a thread dot = unseen. Nothing else is red.
 * - Names are sans lowercase; numbers, paths, keys and statuses are mono.
 */

/* ------------------------------------------------------------------ icons */

function Svg({ className, children, box = 16 }: { className?: string; children: ReactNode; box?: number }) {
	return (
		<svg
			viewBox={`0 0 ${box} ${box}`}
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

const I = {
	play: (c?: string) => (
		<svg viewBox="0 0 16 16" className={c} aria-hidden="true">
			<path
				d="M5 3.6c0-.8.86-1.28 1.53-.86l6.1 3.9a1.6 1.6 0 0 1 0 2.72l-6.1 3.9A1 1 0 0 1 5 12.4Z"
				fill="currentColor"
			/>
		</svg>
	),
	plus: (c?: string) => (
		<Svg className={c}>
			<path d="M8 3.5v9M3.5 8h9" />
		</Svg>
	),
	close: (c?: string) => (
		<Svg className={c}>
			<path d="m5 5 6 6M11 5l-6 6" />
		</Svg>
	),
	search: (c?: string) => (
		<Svg className={c}>
			<circle cx="7.25" cy="7.25" r="4.25" />
			<path d="m10.5 10.5 2.75 2.75" />
		</Svg>
	),
	pointer: (c?: string) => (
		<svg viewBox="0 0 16 16" className={c} aria-hidden="true">
			<path
				d="M3.4 2.7a.6.6 0 0 1 .78-.72l9.1 3.7a.6.6 0 0 1-.06 1.13l-3.55.97a1.5 1.5 0 0 0-1.05 1.05l-.97 3.55a.6.6 0 0 1-1.13.06Z"
				fill="currentColor"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</svg>
	),
	marquee: (c?: string) => (
		<Svg className={c}>
			<rect x="2.75" y="2.75" width="10.5" height="10.5" rx="3" strokeDasharray="2.2 2.4" />
		</Svg>
	),
	hand: (c?: string) => (
		<Svg className={c}>
			<path d="M5.5 8.5V4.25a1 1 0 0 1 2 0V7.5m0-4.25a1 1 0 0 1 2 0V7.5m0-2.5a1 1 0 0 1 2 0v4.25c0 2.6-1.9 4.5-4.3 4.5-1.6 0-2.6-.7-3.5-1.9L2.6 9.6a1 1 0 0 1 1.6-1.2l1.3 1.6" />
		</Svg>
	),
	chevron: (c?: string) => (
		<Svg className={c}>
			<path d="m6 4.5 3.5 3.5L6 11.5" />
		</Svg>
	),
	down: (c?: string) => (
		<Svg className={c}>
			<path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
		</Svg>
	),
	dots: (c?: string) => (
		<svg viewBox="0 0 16 16" className={c} aria-hidden="true" fill="currentColor">
			<circle cx="3.75" cy="8" r="1.25" />
			<circle cx="8" cy="8" r="1.25" />
			<circle cx="12.25" cy="8" r="1.25" />
		</svg>
	),
	share: (c?: string) => (
		<Svg className={c}>
			<path d="M8 2.75v7M5.25 5.25 8 2.5l2.75 2.75M3.75 9v2.75a1.5 1.5 0 0 0 1.5 1.5h5.5a1.5 1.5 0 0 0 1.5-1.5V9" />
		</Svg>
	),
	cog: (c?: string) => (
		<Svg className={c}>
			<circle cx="8" cy="8" r="2" />
			<path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
		</Svg>
	),
	check: (c?: string) => (
		<Svg className={c}>
			<path d="m3.75 8.25 2.75 2.75 5.75-6" />
		</Svg>
	),
	arrowIn: (c?: string) => (
		<Svg className={c}>
			<path d="M2.75 8h8.5M8.25 5l3 3-3 3" />
		</Svg>
	),
	/* a frame: a portrait sheet, rounded like the frames it stands for */
	frame: (c?: string) => (
		<Svg className={c}>
			<rect x="4.25" y="2.25" width="7.5" height="11.5" rx="2" />
		</Svg>
	),
};

/* ------------------------------------------------------------------ primitives */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({
	kind = "secondary",
	icon,
	children,
	small,
	className,
}: {
	kind?: ButtonKind;
	icon?: ReactNode;
	children?: ReactNode;
	small?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"k-strong inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full whitespace-nowrap",
				small ? "h-6 px-2.5" : "h-8 px-3.5",
				icon && children ? (small ? "pl-2" : "pl-3") : "",
				kind === "primary" && "bg-(--k-thread) text-(--k-on-thread)",
				kind === "secondary" && "k-edge bg-(--k-raised) text-(--k-text)",
				kind === "ghost" && "text-(--k-muted)",
				kind === "danger" && "bg-(--k-tint) text-(--k-thread)",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({
	children,
	active,
	small,
	className,
}: {
	children: ReactNode;
	active?: boolean;
	small?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full",
				small ? "size-6" : "size-8",
				active ? "k-edge bg-(--k-raised) text-(--k-text)" : "text-(--k-muted)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function Chip({ children, tone = "neutral", dot }: { children: ReactNode; tone?: "neutral" | "thread" | "outline"; dot?: boolean }) {
	return (
		<span
			className={cn(
				"k-caption inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2",
				tone === "neutral" && "bg-(--k-hover) text-(--k-muted)",
				tone === "thread" && "bg-(--k-tint) text-(--k-thread)",
				tone === "outline" && "text-(--k-muted) shadow-[inset_0_0_0_1px_var(--k-line)]",
			)}
		>
			{dot ? <span className="size-1.5 rounded-full bg-(--k-thread)" /> : null}
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="k-key inline-flex h-5 items-center rounded-full bg-(--k-hover) px-1.5 text-(--k-muted)">
			{children}
		</span>
	);
}

function Avatar({ size = 24, ring = "--k-chrome" }: { size?: 20 | 24 | 32; ring?: string }) {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#fff]"
			style={{
				width: size,
				height: size,
				fontSize: size === 32 ? 12 : size === 24 ? 10 : 9,
				background: teammate.color,
				boxShadow: `0 0 0 2px var(${ring})`,
				letterSpacing: "0.02em",
			}}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function UnseenDot() {
	return <span className="size-1.5 shrink-0 rounded-full bg-(--k-thread)" />;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("k-edge rounded-[12px] bg-(--k-card) p-1", className)}>{children}</div>;
}

type RowState = "rest" | "hover" | "selected" | "unseen";

/** A frame row inside a page card: 32 tall, radius 8, text inset 8. */
function FrameRow({ name, state = "rest" }: { name: string; state?: RowState }) {
	const selected = state === "selected";
	return (
		<div
			className={cn(
				"flex h-8 items-center gap-2 rounded-[8px] pr-2.5 pl-2",
				selected && "bg-(--k-tint) text-(--k-thread)",
				state === "hover" && "bg-(--k-hover)",
			)}
		>
			<span className={cn("flex size-4 items-center justify-center", selected ? "text-(--k-thread)" : "text-(--k-faint)")}>
				{I.frame("size-4")}
			</span>
			<span className={cn("min-w-0 flex-1 truncate", selected ? "k-strong" : "k-body", !selected && "text-(--k-text)")}>
				{name}
			</span>
			{state === "unseen" ? <UnseenDot /> : null}
		</div>
	);
}

function Well({ prefix, value, unit, className }: { prefix?: string; value: string; unit?: string; className?: string }) {
	return (
		<span className={cn("flex h-8 min-w-0 items-center gap-2 rounded-[8px] bg-(--k-well) px-2.5", className)}>
			{prefix ? <span className="k-caption w-2 text-(--k-faint)">{prefix}</span> : null}
			<span className="k-value min-w-0 flex-1 truncate text-(--k-text)">{value}</span>
			{unit ? <span className="k-caption text-(--k-faint)">{unit}</span> : null}
		</span>
	);
}

/** A property row: label column 64, then one or two wells. */
function PropRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex h-8 items-center gap-1">
			<span className="k-label w-16 shrink-0 pl-2 text-(--k-muted)">{label}</span>
			<div className="flex min-w-0 flex-1 gap-1">{children}</div>
		</div>
	);
}

function CardHead({ title, aside }: { title: string; aside?: ReactNode }) {
	return (
		<div className="flex h-8 items-center justify-between px-2">
			<span className="k-label text-(--k-text)">{title}</span>
			{aside}
		</div>
	);
}

/* ------------------------------------------------------------------ the window */

function TopBar() {
	return (
		<div className="flex h-12 items-center gap-1 px-2">
			<span className="flex h-8 items-center gap-2 rounded-full pr-3 pl-2.5 text-(--k-muted)">
				<SpoolMark className="h-[18px] w-[14px] text-(--k-thread)" />
				<span className="k-body">Home</span>
			</span>
			<span className="mx-1 h-4 w-px bg-(--k-line)" />
			{tabs.map((tab) => (
				<span
					key={tab.name}
					className={cn(
						"flex h-8 items-center gap-2 rounded-full pr-1.5 pl-3.5",
						tab.active ? "k-edge bg-(--k-card) text-(--k-text)" : "pr-3.5 text-(--k-muted)",
					)}
				>
					<span className={tab.active ? "k-strong" : "k-body"}>{tab.name}</span>
					{tab.active ? (
						<span className="flex size-5 items-center justify-center rounded-full text-(--k-faint)">{I.close("size-3.5")}</span>
					) : null}
				</span>
			))}
			<IconButton>{I.plus("size-4")}</IconButton>
			<div className="flex-1" />
			<span className="flex items-center gap-2 pr-2">
				<Avatar size={24} />
			</span>
			<span className="k-value flex h-8 items-center rounded-full px-3 text-(--k-muted)">{zoom}</span>
			<Button kind="secondary" icon={I.share("size-4")}>
				Share
			</Button>
			<Button kind="primary" icon={I.play("size-3.5")} className="ml-1">
				Play
			</Button>
		</div>
	);
}

function PageCard({ page }: { page: (typeof pages)[number] }) {
	return (
		<Card>
			<div className={cn("flex h-8 items-center gap-2 pr-2.5 pl-2", page.open && "")}>
				<span className={cn("flex size-4 items-center justify-center text-(--k-faint)", page.open && "rotate-90")}>
					{I.chevron("size-3.5")}
				</span>
				<span className={cn("min-w-0 flex-1 truncate", page.current ? "k-strong text-(--k-text)" : "k-body text-(--k-text)")}>
					{page.name}
				</span>
				{page.presence ? <Avatar size={20} ring="--k-card" /> : null}
				<span className="k-caption w-4 text-right text-(--k-faint)">{page.count}</span>
			</div>
			{page.open ? (
				<div className="flex flex-col">
					{page.frames.map((f) => (
						<FrameRow key={f.name} name={f.name} state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"} />
					))}
				</div>
			) : (
				<div className="k-caption truncate pr-2.5 pb-2 pl-8 text-(--k-faint)">
					{page.frames.map((f) => f.name).join("  ·  ")}
				</div>
			)}
		</Card>
	);
}

function Sidebar() {
	return (
		<div className="flex w-[248px] shrink-0 flex-col">
			<div className="flex flex-col gap-3 px-2 pt-3 pb-4">
				<div className="flex items-start justify-between">
					<div className="flex flex-col">
						<span className="k-heading">{project.name}</span>
						<span className="k-caption text-(--k-muted)">
							{project.team} · {project.frames} frames
						</span>
					</div>
					<IconButton small className="mt-0.5">
						{I.dots("size-4")}
					</IconButton>
				</div>
				<SearchField />
			</div>
			<div className="flex h-8 items-center justify-between pr-1 pl-2">
				<span className="flex items-baseline gap-2">
					<span className="k-label text-(--k-muted)">Pages</span>
					<span className="k-caption text-(--k-faint)">{pages.length}</span>
				</span>
				<IconButton small>{I.plus("size-3.5")}</IconButton>
			</div>
			<div className="flex flex-col gap-2 pt-1">
				{pages.map((p) => (
					<PageCard key={p.name} page={p} />
				))}
			</div>
			<div className="flex-1" />
			<div className="flex h-10 items-center justify-between pr-1 pl-2">
				<span className="flex items-center gap-2">
					<span className="k-caption flex items-center gap-1.5 text-(--k-muted)">
						{I.check("size-3.5")}
						{project.synced}
					</span>
				</span>
				<IconButton small>{I.cog("size-4")}</IconButton>
			</div>
		</div>
	);
}

function SearchField({ className }: { className?: string }) {
	return (
		<span className={cn("flex h-8 items-center gap-2 rounded-full bg-(--k-well) pr-1.5 pl-3 text-(--k-faint)", className)}>
			{I.search("size-4")}
			<span className="k-body flex-1 text-(--k-faint)">Find a frame</span>
			<Kbd>{commandHint}</Kbd>
		</span>
	);
}

/* --- the canvas */

const LAYOUT = { top: 156, gap: 64, left: 32 };
const xOf = (i: number) => LAYOUT.left + i * (drawnSize.w + LAYOUT.gap);

function FrameLabel({ name, selected, unseen }: { name: string; selected?: boolean; unseen?: boolean }) {
	if (selected) {
		return (
			<div className="flex items-center justify-between">
				<span className="k-strong flex h-6 items-center rounded-full bg-(--k-tint) px-2.5 text-(--k-thread)">{name}</span>
				<span className="k-strong flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-(--k-thread)">
					{I.play("size-3")}
					play
				</span>
			</div>
		);
	}
	return (
		<div className="flex h-6 items-center gap-2 px-1">
			{unseen ? <UnseenDot /> : null}
			<span className="k-body text-(--k-muted)">{name}</span>
			{unseen ? <span className="k-caption text-(--k-muted)">unseen</span> : null}
		</div>
	);
}

function Selection() {
	/* ring sits 4px off the frame, so its radius is the frame's 12 + 4 */
	const handle = "absolute size-2 rounded-full bg-(--k-card) shadow-[0_0_0_1.5px_var(--k-thread)]";
	const k = 4.7 - 4; /* the 45° point of a 16px corner, measured from the ring's box, minus half a handle */
	return (
		<div className="pointer-events-none absolute -inset-1 rounded-[16px] shadow-[0_0_0_1.5px_var(--k-thread),0_0_0_5px_var(--k-tint)]">
			<span className={handle} style={{ left: k, top: k }} />
			<span className={handle} style={{ right: k, top: k }} />
			<span className={handle} style={{ left: k, bottom: k }} />
			<span className={handle} style={{ right: k, bottom: k }} />
		</div>
	);
}

function Flows() {
	const y = LAYOUT.top;
	const a0 = { x: xOf(0) + drawnSize.w + 8, y: y + 236 };
	const a1 = { x: xOf(1) - 14, y: y + 260 };
	const b0 = { x: xOf(1) + drawnSize.w + 14, y: y + 260 };
	const b1 = { x: xOf(2) - 8, y: y + 236 };
	const curve = (p: { x: number; y: number }, q: { x: number; y: number }) => {
		const m = (q.x - p.x) / 2;
		return `M ${p.x} ${p.y} C ${p.x + m} ${p.y}, ${q.x - m} ${q.y}, ${q.x} ${q.y}`;
	};
	const head = (q: { x: number; y: number }) => `M ${q.x - 5} ${q.y - 4.5} L ${q.x} ${q.y} L ${q.x - 5} ${q.y + 4.5}`;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
			<g stroke="var(--k-thread)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
				<circle cx={a0.x} cy={a0.y} r="2.5" fill="var(--k-thread)" stroke="none" />
				<path d={curve(a0, a1)} />
				<path d={head(a1)} />
				<circle cx={b0.x} cy={b0.y} r="2.5" fill="var(--k-thread)" stroke="none" />
				<path d={curve(b0, b1)} strokeDasharray="0.5 5" strokeWidth="1.75" />
				<path d={head(b1)} />
			</g>
		</svg>
	);
}

function Toolbar() {
	return (
		<div className="k-float absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-(--k-card) p-1">
			<IconButton active>{I.pointer("size-4")}</IconButton>
			<IconButton>{I.marquee("size-4")}</IconButton>
			<IconButton>{I.hand("size-4")}</IconButton>
			<span className="mx-1 h-4 w-px bg-(--k-line)" />
			<IconButton>{I.plus("size-4")}</IconButton>
		</div>
	);
}

function Canvas() {
	return (
		<div className="k-grid k-edge relative min-w-0 flex-1 overflow-hidden rounded-[16px]">
			<Flows />
			{canvasFrames.map((f, i) => {
				const selected = "selected" in f && f.selected;
				const unseen = "unseen" in f && f.unseen;
				return (
					<div key={f.name} className="absolute" style={{ left: xOf(i), top: LAYOUT.top - 32, width: drawnSize.w }}>
						<FrameLabel name={f.name} selected={selected} unseen={unseen} />
						<div className="relative mt-2" style={{ width: drawnSize.w, height: drawnSize.h }}>
							<CoffeeScreen screen={f.screen} />
							{selected ? <Selection /> : null}
						</div>
						{selected ? (
							<div className="mt-3 flex justify-center">
								<span className="k-caption flex h-6 items-center rounded-full bg-(--k-tint) px-2.5 text-(--k-thread)">
									{frameSize.w} × {frameSize.h}
								</span>
							</div>
						) : null}
					</div>
				);
			})}
			<Toolbar />
		</div>
	);
}

function Inspector() {
	return (
		<div className="flex w-[248px] shrink-0 flex-col gap-2">
			<Card className="p-1">
				<div className="flex h-8 items-center gap-2 pr-1 pl-2">
					<span className="text-(--k-thread)">{I.frame("size-4")}</span>
					<span className="k-heading flex-1">{selection.name}</span>
					<IconButton small>{I.dots("size-4")}</IconButton>
				</div>
				<div className="k-caption truncate px-2 pb-2 text-(--k-muted)">{selection.path}</div>
			</Card>
			<Card>
				<CardHead title="Layout" aside={<span className="k-caption text-(--k-faint)">frame.json</span>} />
				<div className="flex flex-col gap-1">
					<PropRow label="Position">
						<Well prefix="x" value={String(selection.x)} className="flex-1" />
						<Well prefix="y" value={String(selection.y)} className="flex-1" />
					</PropRow>
					<PropRow label="Size">
						<Well prefix="w" value={String(selection.w)} className="flex-1" />
						<Well prefix="h" value={String(selection.h)} className="flex-1" />
					</PropRow>
				</div>
			</Card>
			<Card>
				<CardHead
					title="Flows"
					aside={
						<span className="k-caption text-(--k-faint)">
							{selection.flowsIn} in · {selection.flowsOut} out
						</span>
					}
				/>
				<FlowRow dir="from" name="menu" certainty="will" />
				<FlowRow dir="to" name="receipt" certainty="might" />
			</Card>
			<Card>
				<CardHead title="Scenario" />
				<span className="flex h-8 items-center gap-2 rounded-[8px] bg-(--k-well) pr-2 pl-2.5">
					<span className="k-value flex-1 text-(--k-text)">{selection.scenario}</span>
					<span className="text-(--k-faint)">{I.down("size-4")}</span>
				</span>
			</Card>
		</div>
	);
}

function FlowRow({ dir, name, certainty }: { dir: "from" | "to"; name: string; certainty: "will" | "might" }) {
	return (
		<div className="flex h-8 items-center gap-2 rounded-[8px] pr-1.5 pl-2">
			<span className="k-label w-8 text-(--k-muted)">{dir}</span>
			<span className="text-(--k-faint)">{I.frame("size-4")}</span>
			<span className="k-body flex-1 text-(--k-text)">{name}</span>
			<CertaintyChip certainty={certainty} />
		</div>
	);
}

function CertaintyChip({ certainty }: { certainty: "will" | "might" }) {
	return (
		<span className="k-caption flex h-5 items-center gap-1.5 rounded-full bg-(--k-hover) pr-2 pl-1.5 text-(--k-muted)">
			<svg viewBox="0 0 14 6" className="h-1.5 w-3.5" aria-hidden="true">
				<path
					d="M1 3h12"
					stroke="var(--k-thread)"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeDasharray={certainty === "might" ? "0.5 3.5" : undefined}
				/>
			</svg>
			{certainty}
		</span>
	);
}

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div data-appearance={appearance} className="id-soft flex h-full w-full flex-col overflow-hidden bg-(--k-chrome)">
			<TopBar />
			<div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
				<Sidebar />
				<Canvas />
				<Inspector />
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ parts */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<span className="k-caption text-(--k-faint)">{label}</span>
			{children}
		</div>
	);
}

function Segmented() {
	return (
		<span className="inline-flex h-8 items-center rounded-full bg-(--k-well) p-1">
			{["Dark", "Light", "System"].map((s, i) => (
				<span
					key={s}
					className={cn(
						"k-body flex h-6 items-center rounded-full px-3",
						i === 0 ? "k-edge bg-(--k-raised) text-(--k-text)" : "text-(--k-muted)",
					)}
				>
					{s}
				</span>
			))}
		</span>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span className={cn("inline-flex h-5 w-8 items-center rounded-full p-0.5", on ? "bg-(--k-thread)" : "bg-(--k-well) shadow-[inset_0_0_0_1px_var(--k-line)]")}>
			<span className={cn("size-4 rounded-full bg-[#fff] shadow-[0_1px_2px_rgb(0_0_0/0.2)]", on && "translate-x-3")} />
		</span>
	);
}

function Swatch({ name, token, hex }: { name: string; token: string; hex: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className="k-edge size-6 shrink-0 rounded-[8px]" style={{ background: `var(${token})` }} />
			<span className="flex min-w-0 flex-col">
				<span className="k-label text-(--k-text)">{name}</span>
				<span className="k-caption whitespace-nowrap text-(--k-faint)">{hex}</span>
			</span>
		</div>
	);
}

const palette: Record<Appearance, { name: string; token: string; hex: string }[]> = {
	dark: [
		{ name: "chrome", token: "--k-chrome", hex: "#12100e" },
		{ name: "canvas", token: "--k-canvas", hex: "#1a1816" },
		{ name: "card", token: "--k-card", hex: "#221f1c" },
		{ name: "raised", token: "--k-raised", hex: "#2e2a26" },
		{ name: "well", token: "--k-well", hex: "#191715" },
		{ name: "text", token: "--k-text", hex: "#f2ede6" },
		{ name: "muted", token: "--k-muted", hex: "#a39a90" },
		{ name: "faint", token: "--k-faint", hex: "#7a7269" },
		{ name: "thread", token: "--k-thread", hex: "#f5391a" },
		{ name: "tint", token: "--k-tint", hex: "12% thread" },
		{ name: "mate", token: "--k-mate", hex: "#3b82f6" },
	],
	light: [
		{ name: "chrome", token: "--k-chrome", hex: "#e8e3db" },
		{ name: "canvas", token: "--k-canvas", hex: "#f3f0ea" },
		{ name: "card", token: "--k-card", hex: "#fbf9f6" },
		{ name: "raised", token: "--k-raised", hex: "#ffffff" },
		{ name: "well", token: "--k-well", hex: "#f0ece5" },
		{ name: "text", token: "--k-text", hex: "#2b2520" },
		{ name: "muted", token: "--k-muted", hex: "#74695f" },
		{ name: "faint", token: "--k-faint", hex: "#958a7e" },
		{ name: "thread", token: "--k-thread", hex: "#f5391a" },
		{ name: "tint", token: "--k-tint", hex: "12% thread" },
		{ name: "mate", token: "--k-mate", hex: "#3b82f6" },
	],
};

function PartsHalf({ appearance }: { appearance: Appearance }) {
	return (
		<div data-appearance={appearance} className="id-soft flex h-full w-[720px] flex-col gap-5 bg-(--k-chrome) px-6 pt-5 pb-6">
			<div className="flex items-center gap-2.5">
				<SpoolMark className="h-[18px] w-[14px] text-(--k-thread)" />
				<span className="k-heading">soft</span>
				<span className="k-caption text-(--k-faint)">{appearance} · 4px · radii 16 / 12 / 8 / pill · row 32</span>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-[400px_248px] gap-6">
				{/* left column: controls */}
				<div className="flex flex-col gap-5">
					<Spec label="button · primary  secondary  ghost  icon  danger">
						<div className="flex flex-wrap items-center gap-2">
							<Button kind="primary" icon={I.play("size-3.5")}>
								Play
							</Button>
							<Button kind="secondary" icon={I.share("size-4")}>
								Share
							</Button>
							<Button kind="ghost">Cancel</Button>
							<IconButton active>{I.plus("size-4")}</IconButton>
							<IconButton>{I.dots("size-4")}</IconButton>
							<Button kind="danger">Move to Trash</Button>
						</div>
					</Spec>
					<div className="grid grid-cols-2 gap-3">
						<Spec label="input · focus">
							<span className="k-edge flex h-8 items-center rounded-full bg-(--k-raised) px-3.5 shadow-[0_0_0_1.5px_var(--k-thread),0_0_0_5px_var(--k-tint)]">
								<span className="k-body text-(--k-text)">checkout</span>
								<span className="ml-px h-4 w-px bg-(--k-thread)" />
							</span>
						</Spec>
						<Spec label="search">
							<SearchField />
						</Spec>
					</div>
					<div className="flex items-end gap-6">
						<Spec label="segmented">
							<Segmented />
						</Spec>
						<Spec label="toggle · on  off">
							<span className="flex h-8 items-center gap-3">
								<Toggle on />
								<Toggle />
							</span>
						</Spec>
					</div>
					<Spec label="tab · active  rest">
						<div className="flex items-center gap-1">
							<span className="k-edge flex h-8 items-center gap-2 rounded-full bg-(--k-card) pr-1.5 pl-3.5">
								<span className="k-strong">kaffe</span>
								<span className="flex size-5 items-center justify-center text-(--k-faint)">{I.close("size-3.5")}</span>
							</span>
							<span className="k-body flex h-8 items-center rounded-full px-3.5 text-(--k-muted)">tvärsö</span>
							<span className="k-body flex h-8 items-center rounded-full bg-(--k-hover) px-3.5 text-(--k-text)">fieldnotes</span>
						</div>
					</Spec>
					<div className="flex items-start gap-6">
						<Spec label="chip">
							<div className="flex h-6 items-center gap-1.5">
								<Chip>3</Chip>
								<Chip tone="outline" dot>
									live
								</Chip>
								<Chip tone="thread" dot>
									unseen
								</Chip>
								<CertaintyChip certainty="will" />
								<CertaintyChip certainty="might" />
							</div>
						</Spec>
						<Spec label="avatar">
							<div className="flex h-6 items-center gap-2">
								<Avatar size={24} />
								<Avatar size={20} />
							</div>
						</Spec>
					</div>
					<Spec label="tooltip">
						<div className="flex items-center gap-2">
							<span className="flex h-6 items-center gap-2 rounded-full bg-(--k-tip) pr-1 pl-2.5 text-(--k-on-tip)">
								<span className="k-label">Play from cart</span>
								<span className="k-key rounded-full bg-[color-mix(in_srgb,var(--k-on-tip)_14%,transparent)] px-1.5">P</span>
							</span>
						</div>
					</Spec>
					<Spec label="type · five roles">
						<div className="flex flex-col gap-1.5">
							<TypeRow role="heading" spec="sans 600 16/24" sample={<span className="k-heading">kaffe</span>} />
							<TypeRow role="body" spec="sans 400 13/20" sample={<span className="k-body">Find a frame</span>} />
							<TypeRow role="label" spec="sans 500 12/16" sample={<span className="k-label">Position</span>} />
							<TypeRow role="value" spec="mono 400 12/16" sample={<span className="k-value">frames/app/cart</span>} />
							<TypeRow role="caption" spec="mono 400 11/16" sample={<span className="k-caption">390 × 844</span>} />
						</div>
					</Spec>
				</div>
				{/* right column: composed parts */}
				<div className="flex flex-col gap-5">
					<Spec label="row · rest  hover  selected  unseen">
						<Card>
							<FrameRow name="menu" />
							<FrameRow name="menu" state="hover" />
							<FrameRow name="cart" state="selected" />
							<FrameRow name="receipt" state="unseen" />
						</Card>
					</Spec>
					<Spec label="property row">
						<Card>
							<PropRow label="Position">
								<Well prefix="x" value="325" className="flex-1" />
								<Well prefix="y" value="170" className="flex-1" />
							</PropRow>
						</Card>
					</Spec>
					<Spec label="context menu">
						<div className="k-float rounded-[12px] bg-(--k-card) p-1">
							{menuItems.map((m, i) => (
								<div
									key={m.label}
									className={cn(
										"flex h-8 items-center justify-between rounded-[8px] px-2.5",
										i === 1 && "bg-(--k-hover)",
										m.danger && "text-(--k-thread)",
									)}
								>
									<span className="k-body">{m.label}</span>
									<span className={cn("k-key", m.danger ? "text-(--k-thread)" : "text-(--k-faint)")}>{m.key}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="canvas · selected  flows  unseen">
						<CanvasMarks />
					</Spec>
					<Spec label="toast">
						<span className="k-float flex h-10 items-center gap-3 rounded-full bg-(--k-card) pr-1 pl-4">
							<span className="k-body flex-1 text-(--k-text)">{toast.text}</span>
							<Button kind="ghost" small className="text-(--k-thread)">
								{toast.action}
							</Button>
						</span>
					</Spec>
				</div>
			</div>
			<Spec label="palette">
				<div className="grid grid-cols-6 gap-x-3 gap-y-2.5">
					{palette[appearance].map((s) => (
						<Swatch key={s.name} {...s} />
					))}
				</div>
			</Spec>
		</div>
	);
}

/** The canvas's own marks at small size: the ring, the readout, both flow lines, the unseen dot. */
function CanvasMarks() {
	return (
		<div className="k-grid k-edge relative h-[132px] overflow-hidden rounded-[16px]">
			<div className="absolute top-3 left-5 flex flex-col items-center gap-2">
				<div className="relative h-[72px] w-12 rounded-[12px] bg-(--k-raised)">
					<Selection />
				</div>
				<span className="k-caption flex h-6 items-center rounded-full bg-(--k-tint) px-2.5 text-(--k-thread)">
					{frameSize.w} × {frameSize.h}
				</span>
			</div>
			<svg className="absolute top-0 left-[120px] h-full w-[72px]" aria-hidden="true">
				<g stroke="var(--k-thread)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
					<circle cx="6" cy="44" r="2.5" fill="var(--k-thread)" stroke="none" />
					<path d="M6 44 H 64 M59 39.5 L64 44 L59 48.5" />
					<circle cx="6" cy="84" r="2.5" fill="var(--k-thread)" stroke="none" />
					<path d="M6 84 H 64" strokeDasharray="0.5 5" strokeWidth="1.75" />
					<path d="M59 79.5 L64 84 L59 88.5" />
				</g>
			</svg>
			<span className="k-caption absolute top-9 left-[200px] text-(--k-muted)">will</span>
			<span className="k-caption absolute top-[76px] left-[200px] text-(--k-muted)">might</span>
			<div className="absolute right-4 bottom-3 flex h-6 items-center gap-2">
				<UnseenDot />
				<span className="k-body text-(--k-muted)">receipt</span>
			</div>
		</div>
	);
}

function TypeRow({ role, spec, sample }: { role: string; spec: string; sample: ReactNode }) {
	return (
		<div className="flex items-baseline gap-3">
			<span className="k-caption w-14 shrink-0 text-(--k-faint)">{role}</span>
			<span className="min-w-0 flex-1 truncate text-(--k-text)">{sample}</span>
			<span className="k-caption text-(--k-faint)">{spec}</span>
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
