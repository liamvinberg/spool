import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import {
	type Appearance,
	canvasFrames,
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
	commandHint,
} from "shared/lib/explore/identity/world";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { HandIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import "./quiet.css";

/*
 * quiet: pro-tool restraint. Four neutral elevation steps, a 4px grid, 6px on
 * everything that holds text, 28px rows, 13px Geist for names and Geist Mono for
 * values. Red is spent on three things only: the primary button, the selection
 * outline and the unseen dot. The mark is drawn in text colour.
 */

/* ---------- icons: one language, 16px box, 1.25 stroke, round joins ---------- */

const stroke = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.25,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

function Ic({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true">
			{children}
		</svg>
	);
}

const IcPage = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<rect x="2.5" y="4.5" width="9" height="9" rx="1.5" {...stroke} />
		<path d="M5 2.5h6.5a2 2 0 0 1 2 2V11" {...stroke} />
	</Ic>
);
const IcFrame = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<rect x="4.5" y="2.5" width="7" height="11" rx="1.5" {...stroke} />
	</Ic>
);
const IcChevron = ({ open, className }: { open?: boolean; className?: string }) => (
	<Ic className={cn("size-3", open && "rotate-90", className)}>
		<path d="m6 3.5 4.5 4.5L6 12.5" {...stroke} strokeWidth={1.5} />
	</Ic>
);
const IcDown = ({ className }: { className?: string }) => (
	<Ic className={cn("size-3", className)}>
		<path d="m3.5 6 4.5 4.5L12.5 6" {...stroke} strokeWidth={1.5} />
	</Ic>
);
const IcSearch = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<circle cx="7" cy="7" r="4.25" {...stroke} />
		<path d="m10.25 10.25 3.25 3.25" {...stroke} />
	</Ic>
);
const IcPlus = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<path d="M8 3.5v9M3.5 8h9" {...stroke} />
	</Ic>
);
const IcPlay = ({ className }: { className?: string }) => (
	<Ic className={cn("size-3", className)}>
		<path d="M4.5 3.2v9.6a.5.5 0 0 0 .76.43l7.7-4.8a.5.5 0 0 0 0-.86l-7.7-4.8a.5.5 0 0 0-.76.43Z" fill="currentColor" />
	</Ic>
);
const IcClose = ({ className }: { className?: string }) => (
	<Ic className={cn("size-3", className)}>
		<path d="m4 4 8 8M12 4l-8 8" {...stroke} strokeWidth={1.5} />
	</Ic>
);
const IcPointer = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<path d="M3.5 2.75 12.75 7.3 8.4 8.4l-1.1 4.35Z" {...stroke} />
	</Ic>
);
const IcMarquee = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...stroke} strokeDasharray="2.2 2.2" />
	</Ic>
);
const IcSidebar = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<rect x="2.5" y="3" width="11" height="10" rx="1.5" {...stroke} />
		<path d="M6.5 3v10" {...stroke} />
	</Ic>
);
const IcDots = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<circle cx="3.75" cy="8" r="1" fill="currentColor" />
		<circle cx="8" cy="8" r="1" fill="currentColor" />
		<circle cx="12.25" cy="8" r="1" fill="currentColor" />
	</Ic>
);
const IcCopy = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" {...stroke} />
		<path d="M10.5 3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1" {...stroke} />
	</Ic>
);
const IcCog = ({ className }: { className?: string }) => (
	<Ic className={className}>
		<circle cx="8" cy="8" r="2" {...stroke} />
		<path
			d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"
			{...stroke}
		/>
	</Ic>
);
const IcFlow = ({ might, className }: { might?: boolean; className?: string }) => (
	<Ic className={className}>
		<path d="M2 8h10.5" {...stroke} strokeDasharray={might ? "2 2.2" : undefined} />
		<path d="m10 5.5 2.5 2.5-2.5 2.5" {...stroke} />
	</Ic>
);
const IcHand = ({ className }: { className?: string }) => <HandIcon className={cn("size-4 shrink-0", className)} />;

/* ---------- primitives ---------- */

const button = cva(
	"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] q-strong",
	{
		variants: {
			intent: {
				primary: "bg-(--q-thread) px-2.5 text-(--q-on-thread)",
				secondary: "bg-(--q-surface) px-2.5 text-(--q-text) shadow-[inset_0_0_0_1px_var(--q-line-strong)]",
				ghost: "px-2.5 text-(--q-text-2)",
				danger: "bg-(--q-surface) px-2.5 text-(--q-thread-text) shadow-[inset_0_0_0_1px_var(--q-line-strong)]",
				icon: "w-7 text-(--q-text-2)",
				tool: "w-7 text-(--q-text-2)",
			},
			state: {
				rest: "",
				hover: "bg-(--q-hover) text-(--q-text)",
				on: "bg-(--q-selected) text-(--q-text)",
			},
		},
		defaultVariants: { intent: "secondary", state: "rest" },
	},
);

function Button({
	intent,
	state,
	children,
	className,
}: {
	intent?: "primary" | "secondary" | "ghost" | "danger" | "icon" | "tool";
	state?: "rest" | "hover" | "on";
	children: ReactNode;
	className?: string;
}) {
	return <span className={cn(button({ intent, state }), className)}>{children}</span>;
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-(--q-selected) px-1 q-mono-sm text-(--q-text-2)">
			{children}
		</kbd>
	);
}

function Avatar({ size = 20, ring }: { size?: 16 | 20 | 28; ring?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full bg-(--q-peer) text-[#ffffff]",
				size === 28 ? "q-strong" : "q-label",
				ring && "shadow-[0_0_0_2px_var(--q-chrome)]",
			)}
			style={{ width: size, height: size, fontSize: size === 16 ? 9 : undefined }}
		>
			{size === 16 ? teammate.initials.slice(0, 1) : teammate.initials}
		</span>
	);
}

function Field({
	prefix,
	children,
	className,
	trailing,
	mono = true,
}: {
	prefix?: string;
	children: ReactNode;
	className?: string;
	trailing?: ReactNode;
	mono?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex h-7 min-w-0 items-center gap-2 rounded-[6px] bg-(--q-surface) px-2 shadow-[inset_0_0_0_1px_var(--q-line)]",
				className,
			)}
		>
			{prefix ? <span className="q-mono text-(--q-text-3)">{prefix}</span> : null}
			<span className={cn("min-w-0 flex-1 truncate", mono ? "q-mono" : "q-body")}>{children}</span>
			{trailing}
		</span>
	);
}

type RowState = "rest" | "hover" | "selected";

/** The one list row: 28px, 6px, 8px in from the rail, fill for state and nothing else. */
function Row({
	state = "rest",
	indent = 0,
	lead,
	icon,
	name,
	unseen,
	trailing,
	className,
	bare,
}: {
	bare?: boolean;
	state?: RowState;
	indent?: 0 | 1;
	lead?: ReactNode;
	icon: ReactNode;
	name: ReactNode;
	unseen?: boolean;
	trailing?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-7 items-center gap-2 rounded-[6px] pr-2",
				indent === 1 ? "pl-[28px]" : bare ? "pl-2" : "pl-1",
				state === "hover" && "bg-(--q-hover)",
				state === "selected" && "bg-(--q-selected)",
				className,
			)}
		>
			{indent === 0 && !bare ? <span className="flex size-4 items-center justify-center text-(--q-text-3)">{lead}</span> : null}
			<span className={cn(state === "selected" || unseen ? "text-(--q-text-2)" : "text-(--q-text-3)")}>{icon}</span>
			<span
				className={cn(
					"min-w-0 flex-1 truncate q-body",
					state === "selected" || unseen ? "text-(--q-text)" : "text-(--q-text-2)",
					state === "hover" && "text-(--q-text)",
				)}
			>
				{name}
			</span>
			{unseen ? <span className="size-1.5 rounded-full bg-(--q-thread)" /> : null}
			{trailing}
		</div>
	);
}

function Count({ children }: { children: ReactNode }) {
	return <span className="min-w-3 text-right q-mono-sm text-(--q-text-3)">{children}</span>;
}

function SectionHead({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
	return (
		<div className="flex h-7 items-center justify-between px-3 text-(--q-text-3)">
			<span className="q-label">{children}</span>
			{trailing}
		</div>
	);
}

function FlowName({ from, to }: { from: string; to: string }) {
	return (
		<>
			{from}
			<span className="px-1 text-(--q-text-3)">→</span>
			{to}
		</>
	);
}

/* ---------- the window ---------- */

const SIDEBAR = 240;
const PANEL = 288;
const TOP = 40;
const GAP = 64;
const FRAME_TOP = 168;
const FRAME_LEFT = 32;

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div
			data-appearance={appearance}
			className="id-quiet relative flex h-full w-full flex-col overflow-hidden bg-(--q-chrome)"
		>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Canvas />
				<Panel />
			</div>
		</div>
	);
}

function TopBar() {
	return (
		<header
			className="flex shrink-0 items-center border-b border-(--q-line) pr-3"
			style={{ height: TOP }}
		>
			<div className="flex items-center gap-2 pl-4 pr-4">
				{[0, 1, 2].map((i) => (
					<span key={i} className="size-3 rounded-full bg-(--q-line-strong)" />
				))}
			</div>
			<nav className="flex items-center gap-0.5 pl-2">
				<span className="flex h-7 items-center gap-2 rounded-[6px] px-2.5 text-(--q-text-2)">
					<SpoolMark className="h-[15px] w-3 text-(--q-text-2)" />
					<span className="q-body">Home</span>
				</span>
				<span className="mx-1.5 h-4 w-px bg-(--q-line-strong)" />
				{tabs.map((tab) =>
					tab.active ? (
						<span
							key={tab.name}
							className="flex h-7 items-center gap-2 rounded-[6px] bg-(--q-selected) pl-2.5 pr-1.5 text-(--q-text)"
						>
							<span className="q-body">{tab.name}</span>
							<span className="flex size-4 items-center justify-center text-(--q-text-3)">
								<IcClose />
							</span>
						</span>
					) : (
						<span key={tab.name} className="flex h-7 items-center rounded-[6px] px-2.5 q-body text-(--q-text-2)">
							{tab.name}
						</span>
					),
				)}
				<Button intent="icon" className="ml-0.5">
					<IcPlus />
				</Button>
			</nav>
			<div className="ml-auto flex items-center gap-2">
				<Avatar ring />
				<span className="mx-1 h-4 w-px bg-(--q-line-strong)" />
				<span className="flex h-7 items-center gap-1 rounded-[6px] px-2 text-(--q-text-2)">
					<span className="q-mono">{zoom}</span>
					<IcDown className="text-(--q-text-3)" />
				</span>
				<Button intent="secondary">Share</Button>
				<Button intent="primary" className="pl-2">
					<IcPlay />
					Play
				</Button>
			</div>
		</header>
	);
}

function Sidebar() {
	return (
		<aside
			className="flex shrink-0 flex-col border-r border-(--q-line) bg-(--q-chrome)"
			style={{ width: SIDEBAR }}
		>
			<div className="flex items-start justify-between px-4 pb-3 pt-3">
				<div className="flex flex-col">
					<span className="flex items-center gap-1">
						<span className="q-title">{project.name}</span>
						<IcDown className="text-(--q-text-3)" />
					</span>
					<span className="flex items-center gap-1.5 text-(--q-text-3)">
						<span className="q-body">{project.team}</span>
						<span className="q-mono-sm">
							· {project.frames} frames · {project.synced}
						</span>
					</span>
				</div>
				<Button intent="icon" className="-mr-1.5 text-(--q-text-3)">
					<IcSidebar />
				</Button>
			</div>
			<div className="px-2">
				<Field
					mono={false}
					className="bg-(--q-hover) shadow-none"
					prefix={undefined}
					trailing={<Kbd>{commandHint}</Kbd>}
				>
					<span className="flex items-center gap-2 text-(--q-text-3)">
						<IcSearch />
						Find frames
					</span>
				</Field>
			</div>

			<div className="mt-4 px-2">
				<SectionHead trailing={<IcPlus className="text-(--q-text-3)" />}>Pages</SectionHead>
				<div className="flex flex-col gap-px">
					{pages.map((page) => (
						<div key={page.name} className="flex flex-col gap-px">
							<Row
								lead={<IcChevron open={page.open} />}
								icon={<IcPage />}
								name={page.name}
								trailing={
									<span className="flex items-center gap-2">
										{page.presence ? <Avatar size={16} /> : null}
										<Count>{page.count}</Count>
									</span>
								}
							/>
							{page.open ? (
								<div className="relative flex flex-col gap-px">
									<span className="absolute bottom-1 left-[11.5px] top-1 w-px bg-(--q-line-strong)" />
									{page.frames.map((frame) => (
										<Row
											key={frame.name}
											indent={1}
											state={frame.selected ? "selected" : "rest"}
											icon={<IcFrame />}
											name={frame.name}
											unseen={frame.unseen}
										/>
									))}
								</div>
							) : null}
						</div>
					))}
				</div>
			</div>

			<div className="mt-4 px-2">
				<SectionHead trailing={<Count>{flows.length}</Count>}>Flows</SectionHead>
				<div className="flex flex-col gap-px">
					{flows.map((flow) => (
						<Row
							key={flow.from}
							icon={<IcFlow might={flow.certainty === "might"} />}
							name={<FlowName from={flow.from} to={flow.to} />}
							trailing={<span className="q-mono-sm text-(--q-text-3)">{flow.certainty}</span>}
						/>
					))}
				</div>
			</div>

			<div className="mt-auto flex h-12 items-center gap-2 border-t border-(--q-line) px-4">
				<Avatar />
				<span className="min-w-0 flex-1 truncate q-body text-(--q-text-2)">
					{teammate.name.split(" ")[0]} <span className="text-(--q-text-3)">is on</span>{" "}
					<span className="q-mono text-(--q-text-2)">{teammate.page}</span>
				</span>
				<Button intent="icon" className="-mr-1.5 text-(--q-text-3)">
					<IcCog />
				</Button>
			</div>
		</aside>
	);
}

function Canvas() {
	const xs = canvasFrames.map((_, i) => FRAME_LEFT + i * (drawnSize.w + GAP));
	const midY = FRAME_TOP + drawnSize.h / 2;
	return (
		<main className="q-canvas-dots relative min-w-0 flex-1 overflow-hidden">
			<div className="absolute left-4 top-3 flex h-7 items-center gap-2">
				<span className="q-strong text-(--q-text-2)">app</span>
				<span className="q-mono-sm text-(--q-text-3)">3 frames</span>
			</div>

			{/* flows: solid is will, dashed is might; neutral, because red is for state */}
			<svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
				{flows.map((flow, i) => {
					const x1 = xs[i]! + drawnSize.w + 8;
					const x2 = xs[i + 1]! - 10;
					return (
						<g key={flow.from} className="text-(--q-text-3)">
							<path
								d={`M${x1} ${midY + 0.5}H${x2}`}
								stroke="currentColor"
								strokeWidth={1.25}
								strokeDasharray={flow.certainty === "might" ? "4 3" : undefined}
								fill="none"
							/>
							<path
								d={`M${x2 - 4} ${midY - 3.5}l4.5 4 -4.5 4`}
								stroke="currentColor"
								strokeWidth={1.25}
								strokeLinecap="round"
								strokeLinejoin="round"
								fill="none"
							/>
						</g>
					);
				})}
			</svg>
			{flows.map((flow, i) => (
				<span
					key={flow.from}
					className="absolute q-mono-sm text-(--q-text-3)"
					style={{
						left: xs[i]! + drawnSize.w,
						width: GAP,
						top: midY - 24,
						textAlign: "center",
					}}
				>
					{flow.certainty}
				</span>
			))}

			{canvasFrames.map((frame, i) => {
				const x = xs[i]!;
				const selected = "selected" in frame && frame.selected;
				const unseen = "unseen" in frame && frame.unseen;
				return (
					<div key={frame.name}>
						<div
							className="absolute flex h-5 items-center gap-2"
							style={{ left: x, top: FRAME_TOP - 28, width: drawnSize.w }}
						>
							{unseen ? <span className="size-1.5 rounded-full bg-(--q-thread)" /> : null}
							<span className={cn("q-label", selected ? "text-(--q-text)" : "text-(--q-text-2)")}>
								{frame.name}
							</span>
							{selected ? (
								<span className="ml-auto flex items-center gap-1 text-(--q-text-2)">
									<IcPlay className="size-2.5" />
									<span className="q-label">Play</span>
								</span>
							) : null}
						</div>
						<div
							className="absolute"
							style={{ left: x, top: FRAME_TOP, width: drawnSize.w, height: drawnSize.h }}
						>
							<CoffeeScreen screen={frame.screen} />
						</div>
						{selected ? <Selection x={x} /> : null}
					</div>
				);
			})}

			<div className="q-float absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] bg-(--q-surface) p-1">
				<Button intent="tool" state="on">
					<IcPointer />
				</Button>
				<Button intent="tool">
					<IcMarquee />
				</Button>
				<Button intent="tool">
					<IcHand />
				</Button>
				<span className="mx-1 h-4 w-px bg-(--q-line-strong)" />
				<Button intent="tool">
					<IcPlus />
				</Button>
			</div>
		</main>
	);
}

function Selection({ x }: { x: number }) {
	const w = drawnSize.w;
	const h = drawnSize.h;
	const corners = [
		[0, 0],
		[w, 0],
		[0, h],
		[w, h],
	];
	return (
		<>
			<div
				className="pointer-events-none absolute rounded-[9px] border border-(--q-thread)"
				style={{ left: x - 1, top: FRAME_TOP - 1, width: w + 2, height: h + 2 }}
			/>
			{corners.map(([cx, cy]) => (
				<span
					key={`${cx}-${cy}`}
					className="absolute size-[7px] rounded-[1.5px] border border-(--q-thread) bg-(--q-handle)"
					style={{ left: x + cx! - 3.5, top: FRAME_TOP + cy! - 3.5 }}
				/>
			))}
			<div className="absolute flex justify-center" style={{ left: x, top: FRAME_TOP + h + 12, width: w }}>
				<span className="q-float rounded-[4px] bg-(--q-surface) px-1.5 q-mono-sm text-(--q-text-2)">
					{frameSize.w} × {frameSize.h}
				</span>
			</div>
		</>
	);
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex h-7 items-center gap-2">
			<span className="w-16 shrink-0 q-body text-(--q-text-3)">{label}</span>
			<div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
		</div>
	);
}

function PanelSection({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-1 border-t border-(--q-line) px-4 pb-3 pt-2">
			<div className="flex h-7 items-center justify-between">
				<span className="q-label text-(--q-text-3)">{title}</span>
				{trailing}
			</div>
			{children}
		</section>
	);
}

function Panel() {
	return (
		<aside className="flex shrink-0 flex-col border-l border-(--q-line) bg-(--q-chrome)" style={{ width: PANEL }}>
			<div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2.5">
				<span className="flex items-center gap-2">
					<IcFrame className="text-(--q-text-3)" />
					<span className="q-title">{selection.name}</span>
				</span>
				<span className="flex items-center gap-0.5">
					<Button intent="icon">
						<IcPlay />
					</Button>
					<Button intent="icon">
						<IcDots />
					</Button>
				</span>
			</div>
			<PanelSection title="Frame">
				<PropRow label="Name">
					<Field className="flex-1">{selection.name}</Field>
				</PropRow>
				<PropRow label="Path">
					<span className="min-w-0 truncate q-mono text-(--q-text-2)">{selection.path}</span>
				</PropRow>
			</PanelSection>
			<PanelSection title="Layout" trailing={<span className="q-mono-sm text-(--q-text-3)">frame.json</span>}>
				<PropRow label="Position">
					<Field prefix="x" className="flex-1">
						{selection.x}
					</Field>
					<Field prefix="y" className="flex-1">
						{selection.y}
					</Field>
				</PropRow>
				<PropRow label="Size">
					<Field prefix="w" className="flex-1">
						{selection.w}
					</Field>
					<Field prefix="h" className="flex-1">
						{selection.h}
					</Field>
				</PropRow>
			</PanelSection>
			<PanelSection
				title="Flows"
				trailing={
					<span className="q-mono-sm text-(--q-text-3)">
						{selection.flowsIn} in · {selection.flowsOut} out
					</span>
				}
			>
				<div className="-mx-2 flex flex-col gap-px">
					{flows.map((flow) => (
						<Row
							key={flow.from}
							icon={<IcFlow might={flow.certainty === "might"} />}
							name={<FlowName from={flow.from} to={flow.to} />}
							trailing={<span className="q-mono-sm text-(--q-text-3)">{flow.certainty}</span>}
							bare
						/>
					))}
				</div>
			</PanelSection>
			<PanelSection title="Play">
				<PropRow label="Scenario">
					<Field className="flex-1" trailing={<IcDown className="text-(--q-text-3)" />}>
						{selection.scenario}
					</Field>
				</PropRow>
			</PanelSection>
		</aside>
	);
}

/* ---------- parts ---------- */

export function IdentityParts() {
	return (
		<div className="flex h-full w-full">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<span className="q-mono-sm text-(--q-text-3)">{label}</span>
			{children}
		</div>
	);
}

const swatches = [
	["chrome", "--q-chrome"],
	["canvas", "--q-canvas"],
	["surface", "--q-surface"],
	["raised", "--q-raised"],
	["line", "--q-line"],
	["line-2", "--q-line-strong"],
	["text", "--q-text"],
	["text-2", "--q-text-2"],
	["text-3", "--q-text-3"],
	["thread", "--q-thread"],
	["peer", "--q-peer"],
	["selected", "--q-selected"],
] as const;

const hex: Record<Appearance, Record<string, string>> = {
	dark: {
		chrome: "#0f0f10",
		canvas: "#141415",
		surface: "#1a1a1c",
		raised: "#222225",
		line: "#1f1f22",
		"line-2": "#2c2c30",
		text: "#ececed",
		"text-2": "#a0a0a6",
		"text-3": "#66666c",
		thread: "#f5391a",
		peer: "#3b82f6",
		selected: "#fff 7%",
	},
	light: {
		chrome: "#f7f7f8",
		canvas: "#efeff1",
		surface: "#ffffff",
		raised: "#ffffff",
		line: "#e7e7ea",
		"line-2": "#d8d8dc",
		text: "#18181b",
		"text-2": "#5d5d64",
		"text-3": "#8b8b92",
		thread: "#f5391a",
		peer: "#3b82f6",
		selected: "#000 6%",
	},
};

const typeRoles = [
	["title", "q-title", "15/20 600", "kaffe"],
	["body", "q-body", "13/20 400", "Pages hold frames."],
	["strong", "q-strong", "13/20 500", "Share"],
	["label", "q-label", "11/16 500", "Flows"],
	["mono", "q-mono", "12/16 mono", "frames/app/cart"],
	["mono-sm", "q-mono-sm", "11/16 mono", "390 × 844"],
] as const;

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div
			data-appearance={appearance}
			className={cn(
				"id-quiet flex h-full w-1/2 flex-col gap-5 bg-(--q-chrome) px-6 py-5",
				appearance === "light" && "border-l border-(--q-line)",
			)}
		>
			<div className="flex h-7 items-center gap-2">
				<SpoolMark className="h-[15px] w-3 text-(--q-text)" />
				<span className="q-title">quiet</span>
				<span className="q-mono-sm text-(--q-text-3)">{appearance}</span>
				<span className="ml-auto q-mono-sm text-(--q-text-3)">4px grid · 6px radius · 28px rows · 13px base</span>
			</div>

			<div className="grid min-h-0 flex-1 grid-cols-2 gap-x-6">
				{/* column one */}
				<div className="flex flex-col gap-5">
					<Spec label="type">
						<div className="flex flex-col">
							{typeRoles.map(([name, cls, spec, sample]) => (
								<div key={name} className="flex h-7 items-center gap-3">
									<span className="w-14 shrink-0 q-mono-sm text-(--q-text-3)">{name}</span>
									<span className={cn(cls, "min-w-0 flex-1 truncate")}>{sample}</span>
									<span className="q-mono-sm text-(--q-text-3)">{spec}</span>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="colour · red is primary, selection, unseen">
						<div className="grid grid-cols-4 gap-x-2 gap-y-2.5">
							{swatches.map(([name, v]) => (
								<div key={name} className="flex flex-col gap-1">
									<span
										className="h-6 rounded-[6px] shadow-[inset_0_0_0_1px_var(--q-line-strong)]"
										style={{ background: `var(${v})` }}
									/>
									<span className="flex items-baseline justify-between gap-1">
										<span className="q-mono-sm text-(--q-text-2)">{name}</span>
									</span>
									<span className="-mt-1 q-mono-sm text-(--q-text-3)">{hex[appearance][name]}</span>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="button · primary secondary ghost icon danger">
						<div className="flex flex-wrap items-center gap-2">
							<Button intent="primary" className="pl-2">
								<IcPlay />
								Play
							</Button>
							<Button intent="secondary">Share</Button>
							<Button intent="ghost">Cancel</Button>
							<Button intent="icon">
								<IcDots />
							</Button>
							<Button intent="icon" state="hover">
								<IcPlus />
							</Button>
							<Button intent="danger">Move to Trash</Button>
						</div>
					</Spec>

					<Spec label="field · input · search">
						<div className="flex gap-2">
							<Field className="w-[120px]">{selection.name}</Field>
							<Field
								mono={false}
								className="flex-1 bg-(--q-hover) shadow-none"
								trailing={<Kbd>{commandHint}</Kbd>}
							>
								<span className="flex items-center gap-2 text-(--q-text-3)">
									<IcSearch />
									Find frames
								</span>
							</Field>
						</div>
					</Spec>

					<div className="grid grid-cols-[auto_1fr] gap-x-6">
						<Spec label="segmented">
							<div className="flex h-7 items-center rounded-[6px] bg-(--q-hover) p-0.5">
								{["Dark", "Light", "System"].map((opt) => (
									<span
										key={opt}
										className={cn(
											"flex h-6 items-center rounded-[4px] px-2.5 q-strong",
											opt === (appearance === "dark" ? "Dark" : "Light")
												? "bg-(--q-raised) text-(--q-text) shadow-[0_0_0_1px_var(--q-line-strong)]"
												: "text-(--q-text-3)",
										)}
									>
										{opt}
									</span>
								))}
							</div>
						</Spec>
						<Spec label="toggle · on off">
							<div className="flex h-7 items-center gap-3">
								<Toggle on />
								<Toggle />
							</div>
						</Spec>
					</div>

					<div className="grid grid-cols-[auto_1fr] gap-x-6">
						<Spec label="tab">
							<div className="flex items-center gap-0.5">
								<span className="flex h-7 items-center gap-2 rounded-[6px] bg-(--q-selected) pl-2.5 pr-1.5">
									<span className="q-body">kaffe</span>
									<IcClose className="text-(--q-text-3)" />
								</span>
								<span className="flex h-7 items-center rounded-[6px] px-2.5 q-body text-(--q-text-2)">
									tvärsö
								</span>
							</div>
						</Spec>
						<Spec label="chip · badge">
							<div className="flex h-7 items-center gap-2">
								<span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-(--q-selected) px-1 q-mono-sm text-(--q-text-2)">
									3
								</span>
								<span className="flex h-[18px] items-center gap-1.5 rounded-[4px] bg-(--q-selected) px-1.5 q-mono-sm text-(--q-text-2)">
									<span className="size-1.5 rounded-full bg-(--q-text-2)" />
									live
								</span>
								<span className="flex h-[18px] items-center gap-1.5 rounded-[4px] bg-(--q-selected) px-1.5 q-mono-sm text-(--q-text)">
									<span className="size-1.5 rounded-full bg-(--q-thread)" />
									unseen
								</span>
							</div>
						</Spec>
					</div>
				</div>

				{/* column two */}
				<div className="flex flex-col gap-5">
					<Spec label="sidebar row">
						<div className="flex flex-col gap-px">
							{(
								[
									["rest", <Row key="r" indent={1} icon={<IcFrame />} name="menu" />],
									["hover", <Row key="h" indent={1} state="hover" icon={<IcFrame />} name="menu" />],
									["selected", <Row key="s" indent={1} state="selected" icon={<IcFrame />} name="cart" />],
									["unseen", <Row key="u" indent={1} icon={<IcFrame />} name="receipt" unseen />],
									[
										"page",
										<Row
											key="p"
											lead={<IcChevron />}
											icon={<IcPage />}
											name="site"
											trailing={
												<span className="flex items-center gap-2">
													<Avatar size={16} />
													<Count>2</Count>
												</span>
											}
										/>,
									],
								] as const
							).map(([label, row]) => (
								<div key={label} className="flex items-center gap-3">
									<span className="w-14 shrink-0 q-mono-sm text-(--q-text-3)">{label}</span>
									<div className="w-[224px]">{row}</div>
								</div>
							))}
						</div>
					</Spec>

					<Spec label="property row · field edits, plain reads">
						<div className="flex flex-col gap-1">
							<PropRow label="Position">
								<Field prefix="x" className="flex-1">
									{selection.x}
								</Field>
								<Field prefix="y" className="flex-1">
									{selection.y}
								</Field>
							</PropRow>
							<PropRow label="Path">
								<span className="min-w-0 truncate q-mono text-(--q-text-2)">{selection.path}</span>
							</PropRow>
						</div>
					</Spec>

					<div className="grid grid-cols-[208px_1fr] gap-x-6">
						<Spec label="context menu">
							<div className="q-float flex flex-col rounded-[10px] bg-(--q-surface) p-1">
								{menuItems.map((item, i) => (
									<div key={item.label}>
										{item.danger ? <div className="mx-2 my-1 h-px bg-(--q-line-strong)" /> : null}
										<div
											className={cn(
												"flex h-7 items-center justify-between gap-3 rounded-[6px] px-2",
												i === 1 && "bg-(--q-selected)",
											)}
										>
											<span
												className={cn(
													"q-body",
													item.danger ? "text-(--q-thread-text)" : "text-(--q-text)",
												)}
											>
												{item.label}
											</span>
											{item.key ? <span className="q-mono-sm text-(--q-text-3)">{item.key}</span> : null}
										</div>
									</div>
								))}
							</div>
						</Spec>
						<div className="flex flex-col gap-5">
							<Spec label="tooltip">
								<span className="q-float inline-flex h-7 w-fit items-center gap-2 rounded-[6px] bg-(--q-raised) pl-2 pr-1">
									<span className="q-body">Hand</span>
									<Kbd>H</Kbd>
								</span>
							</Spec>
							<Spec label="avatar">
								<div className="flex items-center gap-2">
									<Avatar size={16} />
									<Avatar />
									<Avatar size={28} />
								</div>
							</Spec>
							<Spec label="keycap">
								<div className="flex items-center gap-1">
									<Kbd>{commandHint}</Kbd>
									<Kbd>H</Kbd>
									<Kbd>↵</Kbd>
								</div>
							</Spec>
						</div>
					</div>

					<Spec label="toast">
						<div className="q-float flex h-10 w-fit items-center gap-4 rounded-[10px] bg-(--q-surface) pl-3 pr-1.5">
							<span className="q-body">
								<span className="q-mono">cart</span> moved to Trash
							</span>
							<Button intent="ghost" className="text-(--q-text)">
								{toast.action}
							</Button>
						</div>
					</Spec>

					<div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-5">
						<Spec label="toolbar">
							<div className="q-float flex w-fit items-center gap-0.5 rounded-[10px] bg-(--q-surface) p-1">
								<Button intent="tool" state="on">
									<IcPointer />
								</Button>
								<Button intent="tool">
									<IcMarquee />
								</Button>
								<Button intent="tool">
									<IcHand />
								</Button>
							</div>
						</Spec>
						<Spec label="radius">
							<div className="flex items-center gap-2">
								{[4, 6, 10].map((r) => (
									<span
										key={r}
										className="flex size-9 items-center justify-center bg-(--q-hover) q-mono-sm text-(--q-text-3) shadow-[inset_0_0_0_1px_var(--q-line-strong)]"
										style={{ borderRadius: r }}
									>
										{r}
									</span>
								))}
							</div>
						</Spec>
						<Spec label="selection">
							<div className="flex flex-col items-center gap-2 pt-1">
								<span className="relative block h-10 w-16 rounded-[4px] border border-(--q-thread) bg-(--q-canvas)">
									{["-left-1 -top-1", "-right-1 -top-1", "-bottom-1 -left-1", "-bottom-1 -right-1"].map((pos) => (
										<span
											key={pos}
											className={cn(
												"absolute size-[7px] rounded-[1.5px] border border-(--q-thread) bg-(--q-handle)",
												pos,
											)}
										/>
									))}
								</span>
								<span className="q-float rounded-[4px] bg-(--q-surface) px-1.5 q-mono-sm text-(--q-text-2)">
									{frameSize.w} × {frameSize.h}
								</span>
							</div>
						</Spec>
						<Spec label="spacing · 4px base">
							<div className="flex items-end gap-3">
								{[4, 8, 12, 16, 24, 32].map((s) => (
									<span key={s} className="flex flex-col items-start gap-1">
										<span className="h-2 rounded-[1px] bg-(--q-text-3)" style={{ width: s }} />
										<span className="q-mono-sm text-(--q-text-3)">{s}</span>
									</span>
								))}
							</div>
						</Spec>
					</div>
				</div>
			</div>
		</div>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 items-center rounded-full p-0.5",
				on ? "bg-(--q-text)" : "bg-(--q-line-strong)",
			)}
		>
			<span
				className={cn(
					"size-3 rounded-full",
					on ? "translate-x-3 bg-(--q-chrome)" : "bg-(--q-chrome)",
				)}
			/>
		</span>
	);
}
