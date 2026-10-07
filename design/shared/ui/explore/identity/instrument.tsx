import "./instrument.css";
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

/*
 * instrument: spool as a device faceplate.
 * Plates are square and engraved, keys are 3px and raised by a 1px bevel, wells are 2px
 * and inset, and every value sits in a well. Round is only for LEDs and screws.
 * Engraved words are uppercase legends; anything on a display is verbatim lowercase mono;
 * a sentence a person reads is sentence case. The thread is the play key and the LEDs.
 */

/* ---------- primitives ---------- */

function Legend({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("i-legend whitespace-nowrap", className)}>{children}</span>;
}

function Led({ on, className }: { on?: "thread" | "ada" | undefined; className?: string }) {
	return <span className={cn("i-led inline-block", className)} data-on={on} />;
}

function Screw({ className }: { className?: string }) {
	return <span className={cn("i-screw absolute", className)} />;
}

function Rule({ className }: { className?: string }) {
	return <div className={cn("i-rule", className)} />;
}

type KeyTone = "thread" | "ghost" | "danger";
type KeyState = "hover" | "down";

function Key({
	children,
	className,
	tone,
	state,
}: {
	children: ReactNode;
	className?: string;
	tone?: KeyTone | undefined;
	state?: KeyState | undefined;
}) {
	return (
		<span
			className={cn("i-key inline-flex h-7 shrink-0 items-center justify-center gap-1.5", className)}
			data-tone={tone}
			data-state={state}
		>
			{children}
		</span>
	);
}

function Well({ children, className }: { children?: ReactNode; className?: string }) {
	return <span className={cn("i-well flex items-center", className)}>{children}</span>;
}

/** The property row: a well with its legend engraved at the left and its unit at the right. */
function Prop({
	label,
	value,
	unit,
	className,
	labelWidth = "w-9",
}: {
	label: string;
	value: ReactNode;
	unit?: string;
	className?: string;
	labelWidth?: string;
}) {
	return (
		<Well className={cn("h-7 gap-2 px-2", className)}>
			<Legend className={cn("shrink-0", labelWidth)}>{label}</Legend>
			<span className="i-read min-w-0 flex-1 truncate">{value}</span>
			{unit ? <span className="i-read text-(--i-faint)">{unit}</span> : null}
		</Well>
	);
}

function Avatar({ size = 24 }: { size?: 16 | 24 }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-[3px] bg-(--i-ada) text-white",
				size === 24 ? "i-cap size-6 tracking-[0.04em]" : "size-4 text-[8px] leading-none font-semibold",
			)}
			style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.25), 0 1px 0 var(--i-key-lo)" }}
			title={teammate.name}
		>
			{teammate.initials}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return <span className="i-key i-read inline-flex h-5 items-center px-1.5 text-(--i-legend)">{children}</span>;
}

/* ---------- glyphs: 16px, 1.25 stroke, square caps ---------- */

function G({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} fill="none" aria-hidden="true">
			{children}
		</svg>
	);
}
const S = { stroke: "currentColor", strokeWidth: 1.25 } as const;
const PlayG = ({ className }: { className?: string }) => (
	<G className={className}>
		<path d="M5 3.5v9l7-4.5z" fill="currentColor" />
	</G>
);
const PlusG = () => (
	<G>
		<path d="M8 3.5v9M3.5 8h9" {...S} />
	</G>
);
const HomeG = () => (
	<G>
		<path d="M3 7.25 8 3l5 4.25V13H3z" {...S} strokeLinejoin="round" />
		<path d="M6.5 13v-3.5h3V13" {...S} />
	</G>
);
const CloseG = () => (
	<G className="size-3">
		<path d="m4.5 4.5 7 7m0-7-7 7" {...S} />
	</G>
);
const SearchG = () => (
	<G>
		<circle cx="7" cy="7" r="4" {...S} />
		<path d="m10 10 3.5 3.5" {...S} />
	</G>
);
const PointerG = () => (
	<G>
		<path d="M4 2.75v10l2.9-2.7 1.9 4 1.5-.7-1.9-3.9H12z" {...S} strokeLinejoin="round" />
	</G>
);
const MarqueeG = () => (
	<G>
		<path d="M2.75 2.75h10.5v10.5H2.75z" {...S} strokeDasharray="2 2" />
	</G>
);
const HandG = () => (
	<G>
		<path
			d="M5 8.5V4.25a1 1 0 0 1 2 0V7.5m0-4.25a1 1 0 0 1 2 0V7.5m0-3.25a1 1 0 0 1 2 0V8m0-1.75a1 1 0 0 1 2 0V10a3.75 3.75 0 0 1-3.75 3.75h-.6A3.5 3.5 0 0 1 6 12.5L3.4 9.6a1 1 0 0 1 1.5-1.3L5 8.5"
			{...S}
			strokeLinejoin="round"
		/>
	</G>
);
const CogG = () => (
	<G>
		<circle cx="8" cy="8" r="2" {...S} />
		<path d="M8 2v2m0 8v2M2 8h2m8 0h2M3.75 3.75l1.4 1.4m5.7 5.7 1.4 1.4m0-8.5-1.4 1.4m-5.7 5.7-1.4 1.4" {...S} />
	</G>
);
const CaretG = ({ open }: { open?: boolean }) => (
	<svg viewBox="0 0 8 8" className={cn("size-2 shrink-0", open && "rotate-90")} aria-hidden="true">
		<path d="M2.5 1.5 6 4 2.5 6.5z" fill="currentColor" />
	</svg>
);
const SelectCaretG = () => (
	<svg viewBox="0 0 8 8" className="size-2 shrink-0" aria-hidden="true">
		<path d="M1.5 2.5h5L4 6z" fill="currentColor" />
	</svg>
);
/** a flow's line, as the sidebar and panel draw it: solid will, dashed might */
function FlowLine({ certainty }: { certainty: "will" | "might" }) {
	return (
		<svg viewBox="0 0 24 8" className="h-2 w-6 shrink-0 text-(--i-thread)" aria-hidden="true">
			<path d="M0 4h19" stroke="currentColor" strokeWidth="1.25" strokeDasharray={certainty === "might" ? "3 2" : undefined} />
			<path d="M18 1.5 22.5 4 18 6.5z" fill="currentColor" />
		</svg>
	);
}

/* ---------- the window ---------- */

const SIDEBAR = 248;
const PANEL = 280;

export function IdentityCanvas({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-instrument flex h-full w-full flex-col overflow-hidden bg-(--i-chassis)"
			data-appearance={appearance}
		>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Bay />
				<Panel />
			</div>
			<StatusBar />
		</div>
	);
}

function TopBar() {
	return (
		<div className="flex h-11 shrink-0 items-center gap-1 border-b border-(--i-line) px-3">
			<div className="flex w-8 items-center justify-center">
				<SpoolMark className="h-5 w-4 text-(--i-thread)" title="spool" />
			</div>
			<Key className="w-8 text-(--i-legend)">
				<HomeG />
			</Key>
			<div className="i-rule-v mx-2 h-5" />
			<div className="flex items-center gap-1">
				{tabs.map((tab) =>
					tab.active ? (
						<Key key={tab.name} state="down" className="relative gap-2 pr-1.5 pl-3">
							<Led on="thread" className="absolute top-1 left-1 size-1!" />
							<span className="i-read">{tab.name}</span>
							<span className="flex size-4 items-center justify-center text-(--i-legend)">
								<CloseG />
							</span>
						</Key>
					) : (
						<Key key={tab.name} className="px-3 text-(--i-legend)">
							<span className="i-read">{tab.name}</span>
						</Key>
					),
				)}
				<Key tone="ghost" className="w-7">
					<PlusG />
				</Key>
			</div>
			<div className="flex-1" />
			<div className="flex items-center gap-2">
				<Legend>Zoom</Legend>
				<Well className="i-read h-7 w-14 justify-end px-2">{zoom}</Well>
			</div>
			<div className="i-rule-v mx-2 h-5" />
			<div className="flex items-center gap-2">
				<Avatar />
				<Key className="px-3">
					<span className="i-cap">Share</span>
				</Key>
				<Key tone="thread" className="pr-3 pl-2">
					<PlayG />
					<span className="i-cap">Play</span>
				</Key>
			</div>
		</div>
	);
}

function StatusBar() {
	return (
		<div className="i-read flex h-6 shrink-0 items-center gap-3 border-t border-(--i-line) px-4 text-(--i-faint)">
			<span>
				{project.name} / app / {selection.name}
			</span>
			<div className="flex-1" />
			<span>
				{project.frames} frames · {project.team}
			</span>
			<span className="flex items-center gap-1.5">
				<Led />
				{project.synced}
			</span>
		</div>
	);
}

/* ---------- sidebar: a channel strip ---------- */

function ChannelRow({
	index,
	name,
	count,
	open,
	current,
	presence,
}: {
	index: number;
	name: string;
	count: number;
	open?: boolean | undefined;
	current?: boolean | undefined;
	presence?: boolean | undefined;
}) {
	return (
		<div className="flex h-7 items-center gap-2 pr-1 pl-2">
			<span className="flex w-2 justify-center text-(--i-faint)">
				<CaretG open={open} />
			</span>
			<span className={cn("i-read w-5", current ? "text-(--i-thread)" : "text-(--i-faint)")}>
				{String(index).padStart(2, "0")}
			</span>
			<span className={cn("i-read min-w-0 flex-1 truncate", current ? "text-(--i-ink)" : "text-(--i-legend)")}>
				{name}
			</span>
			{presence ? <Avatar size={16} /> : null}
			<Led on={presence ? "ada" : undefined} />
			<Well className="i-read h-5 w-7 justify-center">{count}</Well>
		</div>
	);
}

function FrameRow({
	name,
	selected,
	unseen,
	state,
	last,
}: {
	name: string;
	selected?: boolean | undefined;
	unseen?: boolean | undefined;
	state?: "hover" | undefined;
	last?: boolean | undefined;
}) {
	return (
		<div className="relative flex h-7 items-center">
			{/* the bus: an engraved line from the channel down through its frames */}
			<span
				className="absolute left-[33px] w-px bg-(--i-faint) opacity-60"
				style={{ top: 0, bottom: last ? 13 : 0 }}
			/>
			<span className="absolute left-[33px] top-[13px] h-px w-[8px] bg-(--i-faint) opacity-60" />
			<div
				className={cn(
					"relative mr-1 ml-[44px] flex h-7 flex-1 items-center gap-2 rounded-[3px] pr-[36px] pl-2",
					selected && "i-well",
					state === "hover" && "i-key",
				)}
				style={state === "hover" ? { boxShadow: "inset 0 1px 0 var(--i-key-hi)" } : undefined}
			>
				{selected ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] bg-(--i-thread)" /> : null}
				<span className={cn("i-read min-w-0 flex-1 truncate", unseen || selected ? "text-(--i-ink)" : "text-(--i-legend)")}>
					{name}
				</span>
				<Led on={unseen ? "thread" : undefined} className={cn(!unseen && "opacity-0")} />
			</div>
		</div>
	);
}

function Sidebar() {
	return (
		<aside
			className="i-plate relative flex shrink-0 flex-col border-r border-(--i-line)"
			style={{ width: SIDEBAR }}
		>
			<Screw className="top-2 left-2" />
			<Screw className="top-2 right-2" />
			<div className="flex flex-col gap-2 px-4 pt-6 pb-4">
				<div className="flex h-4 items-center justify-between">
					<Legend>Project</Legend>
					<span className="i-read text-(--i-faint)">{project.team}</span>
				</div>
				<Well className="h-10 justify-between px-3">
					<span className="i-display">{project.name}</span>
					<span className="i-read flex items-center gap-2 text-(--i-legend)">
						{project.frames} frames
					</span>
				</Well>
				<Well className="mt-1 h-8 gap-2 pr-1.5 pl-2.5 text-(--i-faint)">
					<SearchG />
					<span className="i-body flex-1 text-(--i-faint)">Find a frame</span>
					<Kbd>{commandHint}</Kbd>
				</Well>
			</div>
			<Rule />
			<div className="flex h-4 box-content items-center justify-between px-4 pt-4 pb-2">
				<Legend>Pages</Legend>
				<Legend className="text-(--i-faint)">{String(pages.length).padStart(2, "0")}</Legend>
			</div>
			<div className="flex flex-col px-2">
				{pages.map((page, i) => (
					<div key={page.name}>
						<ChannelRow
							index={i + 1}
							name={page.name}
							count={page.count}
							open={page.open}
							current={page.current}
							presence={page.presence}
						/>
						{page.open
							? page.frames.map((f, j) => (
									<FrameRow
										key={f.name}
										name={f.name}
										selected={f.selected}
										unseen={f.unseen}
										last={j === page.frames.length - 1}
									/>
								))
							: null}
					</div>
				))}
			</div>
			<Rule className="mt-4" />
			<div className="flex h-4 box-content items-center justify-between px-4 pt-4 pb-2">
				<Legend>Flows</Legend>
				<span className="i-read text-(--i-faint)">app</span>
			</div>
			<div className="flex flex-col px-4">
				{flows.map((f) => (
					<div key={f.from} className="flex h-7 items-center gap-3">
						<FlowLine certainty={f.certainty} />
						<span className="i-read min-w-0 flex-1 truncate">
							{f.from} → {f.to}
						</span>
						<span className="i-read text-(--i-faint)">{f.certainty}</span>
					</div>
				))}
			</div>
			<div className="flex-1" />
			<Rule />
			<div className="flex items-center gap-3 px-4 py-3">
				<Avatar />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="i-body truncate">{teammate.name}</span>
					<span className="i-read flex items-center gap-1.5 text-(--i-legend)">
						<Led on="ada" />
						{teammate.page}
					</span>
				</div>
				<Key tone="ghost" className="w-7">
					<CogG />
				</Key>
			</div>
		</aside>
	);
}

/* ---------- the bay: the canvas ---------- */

const BAY_W = 1440 - SIDEBAR - PANEL; // 912
const GAP = 64;
const LEFT = (BAY_W - drawnSize.w * 3 - GAP * 2) / 2;
const TOP = 112;
const fx = (i: number) => LEFT + i * (drawnSize.w + GAP);

function Bay() {
	const midY = TOP + drawnSize.h / 2;
	return (
		<main className="i-bay relative min-w-0 flex-1 overflow-hidden">
			<svg className="absolute inset-0 h-full w-full" aria-hidden="true">
				<defs>
					<pattern id="i-marks" width="48" height="48" patternUnits="userSpaceOnUse" x={LEFT % 48} y={TOP % 48}>
						<path d="M0 -3.5V3.5M-3.5 0H3.5M48 44.5V51.5M44.5 48H51.5M0 44.5V51.5M-3.5 48H3.5M48 -3.5V3.5M44.5 0H51.5" stroke="var(--i-grid)" strokeWidth="1" />
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#i-marks)" />
			</svg>

			{canvasFrames.map((f, i) => (
				<div key={f.name} className="absolute" style={{ left: fx(i), top: TOP, width: drawnSize.w, height: drawnSize.h }}>
					<FrameLabel name={f.name} selected={"selected" in f} unseen={"unseen" in f} />
					<CoffeeScreen screen={f.screen} />
				</div>
			))}

			{/* flows: menu → cart will (solid), cart → receipt might (dashed) */}
			<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
				{flows.map((flow, i) => {
					const x1 = fx(i) + drawnSize.w + 6;
					const x2 = fx(i + 1) - 8;
					return (
						<g key={flow.from} className="text-(--i-thread)">
							<circle cx={x1} cy={midY} r="2.5" fill="currentColor" />
							<path
								d={`M${x1} ${midY}H${x2 - 6}`}
								stroke="currentColor"
								strokeWidth="1.5"
								strokeDasharray={flow.certainty === "might" ? "4 3" : undefined}
							/>
							<path d={`M${x2 - 7} ${midY - 4}L${x2} ${midY}L${x2 - 7} ${midY + 4}z`} fill="currentColor" />
						</g>
					);
				})}
			</svg>
			{flows.map((flow, i) => (
				<span
					key={flow.from}
					className="i-read absolute text-center text-(--i-legend)"
					style={{ left: fx(i) + drawnSize.w, width: GAP, top: midY - 22 }}
				>
					{flow.certainty}
				</span>
			))}

			<Selection />
			<Toolbar />
		</main>
	);
}

function FrameLabel({ name, selected, unseen }: { name: string; selected: boolean; unseen: boolean }) {
	return (
		<div className="absolute right-0 left-0 flex h-5 items-center gap-2" style={{ top: -36 }}>
			{unseen ? <Led on="thread" /> : null}
			<span className={cn("i-read", selected ? "text-(--i-thread)" : unseen ? "text-(--i-ink)" : "text-(--i-legend)")}>
				{name}
			</span>
			{unseen ? <span className="i-read text-(--i-faint)">unseen</span> : null}
			<span className="flex-1" />
			{selected ? (
				<Key tone="thread" className="h-5 pr-2 pl-1">
					<PlayG className="size-3" />
					<span className="i-cap text-[10px]">Play</span>
				</Key>
			) : null}
		</div>
	);
}

function Selection() {
	const x = fx(1);
	const y = TOP;
	const { w, h } = drawnSize;
	const o = 4; // crop marks stand 4px off the frame
	const l = 8;
	const corner = (cx: number, cy: number, dx: number, dy: number) =>
		`M${cx + dx * o} ${cy + dy * (o + l)}V${cy + dy * o}M${cx + dx * o} ${cy + dy * o}H${cx + dx * (o + l)}`;
	return (
		<>
			<div
				className="pointer-events-none absolute border border-(--i-thread)"
				style={{ left: x - 1, top: y - 1, width: w + 2, height: h + 2 }}
			/>
			<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-(--i-thread)" aria-hidden="true">
				<path
					d={[corner(x, y, -1, -1), corner(x + w, y, 1, -1), corner(x, y + h, -1, 1), corner(x + w, y + h, 1, 1)].join("")}
					stroke="currentColor"
					strokeWidth="1.5"
					fill="none"
				/>
			</svg>
			<div className="absolute flex justify-center" style={{ left: x, width: w, top: y + h + 14 }}>
				<span
					className="i-read inline-flex h-5 items-center rounded-[2px] bg-(--i-thread) px-2 text-(--i-on-thread)"
				>
					{frameSize.w} × {frameSize.h}
				</span>
			</div>
		</>
	);
}

function Toolbar() {
	return (
		<div className="absolute bottom-6 left-1/2 -translate-x-1/2">
			<div className="i-plate relative border border-(--i-line) px-4 pt-3 pb-2">
				<ToolKeys />
			</div>
		</div>
	);
}

/** the canvas tools: keys with a pilot LED, their names engraved under them */
function ToolKeys() {
	const tools = [
		{ name: "Select", icon: <PointerG />, on: true },
		{ name: "Marquee", icon: <MarqueeG /> },
		{ name: "Hand", icon: <HandG /> },
	];
	return (
			<div className="flex gap-2">
				{tools.map((t) => (
					<div key={t.name} className="flex w-14 flex-col items-center gap-1.5">
						<Key state={t.on ? "down" : undefined} className={cn("relative h-8 w-14", !t.on && "text-(--i-legend)")}>
							<Led on={t.on ? "thread" : undefined} className="absolute top-1 left-1 size-1!" />
							{t.icon}
						</Key>
						<Legend className={cn(t.on ? "text-(--i-ink)" : undefined)}>{t.name}</Legend>
					</div>
				))}
			</div>
	);
}

/* ---------- the panel: the selected frame ---------- */

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2 px-3 py-4">
			<div className="flex h-4 items-center justify-between px-1">
				<Legend>{title}</Legend>
				{aside}
			</div>
			{children}
		</div>
	);
}

function Panel() {
	return (
		<aside className="i-plate relative flex shrink-0 flex-col border-l border-(--i-line)" style={{ width: PANEL }}>
			<Screw className="top-2 left-2" />
			<Screw className="top-2 right-2" />
			<div className="flex flex-col gap-2 px-3 pt-6 pb-4">
				<div className="flex h-4 items-center justify-between px-1">
					<Legend>Frame</Legend>
					<span className="i-read text-(--i-faint)">app</span>
				</div>
				<Well className="h-10 justify-between pr-1.5 pl-3">
					<span className="i-display">{selection.name}</span>
					<Key tone="thread" className="w-8">
						<PlayG />
					</Key>
				</Well>
				<Prop label="Path" value={selection.path} />
			</div>
			<Rule />
			<Section title="Position" aside={<span className="i-read text-(--i-faint)">frame.json</span>}>
				<div className="grid grid-cols-2 gap-2">
					<Prop label="X" value={selection.x} unit="px" labelWidth="w-3" />
					<Prop label="Y" value={selection.y} unit="px" labelWidth="w-3" />
				</div>
			</Section>
			<Rule />
			<Section title="Size" aside={<span className="i-read text-(--i-faint)">frame.json</span>}>
				<div className="grid grid-cols-2 gap-2">
					<Prop label="W" value={selection.w} unit="px" labelWidth="w-3" />
					<Prop label="H" value={selection.h} unit="px" labelWidth="w-3" />
				</div>
			</Section>
			<Rule />
			<Section title="Flows">
				<div className="grid grid-cols-2 gap-2">
					<Prop label="In" value={String(selection.flowsIn).padStart(2, "0")} labelWidth="w-6" />
					<Prop label="Out" value={String(selection.flowsOut).padStart(2, "0")} labelWidth="w-6" />
				</div>
			</Section>
			<Rule />
			<Section title="Scenario">
				<Well className="h-7 gap-2 px-2">
					<Led on="thread" />
					<span className="i-read flex-1">{selection.scenario}</span>
					<span className="text-(--i-legend)">
						<SelectCaretG />
					</span>
				</Well>
			</Section>
			<div className="flex-1" />
			<div className="px-4 pb-4">
				<p className="i-body text-(--i-faint)">
					Position and size live in <span className="i-read text-(--i-legend)">frame.json</span>.
				</p>
			</div>
		</aside>
	);
}

/* ---------- parts ---------- */

const palette: Record<Appearance, { name: string; v: string; hex: string }[]> = {
	dark: [
		{ name: "Chassis", v: "--i-chassis", hex: "#121314" },
		{ name: "Plate", v: "--i-plate", hex: "#1a1b1d" },
		{ name: "Bay", v: "--i-bay", hex: "#0e0f10" },
		{ name: "Key", v: "--i-key", hex: "#26272a" },
		{ name: "Well", v: "--i-well", hex: "#0c0d0e" },
		{ name: "Line", v: "--i-line", hex: "#0a0b0c" },
		{ name: "Ink", v: "--i-ink", hex: "#ecebe7" },
		{ name: "Legend", v: "--i-legend", hex: "#8e8c88" },
		{ name: "Faint", v: "--i-faint", hex: "#5b5b5a" },
		{ name: "Led off", v: "--i-led-off", hex: "#2f3032" },
		{ name: "Thread", v: "--i-thread", hex: "#f5391a" },
		{ name: "Team", v: "--i-ada", hex: "#3b82f6" },
	],
	light: [
		{ name: "Chassis", v: "--i-chassis", hex: "#cdcac3" },
		{ name: "Plate", v: "--i-plate", hex: "#e3e0da" },
		{ name: "Bay", v: "--i-bay", hex: "#d6d3cc" },
		{ name: "Key", v: "--i-key", hex: "#efede8" },
		{ name: "Well", v: "--i-well", hex: "#d3d0c8" },
		{ name: "Line", v: "--i-line", hex: "#bcb8b0" },
		{ name: "Ink", v: "--i-ink", hex: "#1b1a18" },
		{ name: "Legend", v: "--i-legend", hex: "#625f5a" },
		{ name: "Faint", v: "--i-faint", hex: "#8f8b84" },
		{ name: "Led off", v: "--i-led-off", hex: "#bdb9b1" },
		{ name: "Thread", v: "--i-thread", hex: "#f5391a" },
		{ name: "Team", v: "--i-ada", hex: "#3b82f6" },
	],
};

function Spec({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			<div className="flex flex-col gap-1.5">
				<Legend>{title}</Legend>
				<Rule />
			</div>
			{children}
		</div>
	);
}

/** a specimen with its legend engraved under it, the way a faceplate labels a control */
function Under({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col items-start gap-1.5", className)}>
			{children}
			<Legend className="text-(--i-faint)">{label}</Legend>
		</div>
	);
}

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-instrument relative flex h-full w-[720px] flex-col bg-(--i-chassis) p-3"
			data-appearance={appearance}
		>
			<div className="i-plate relative flex flex-1 flex-col gap-5 border border-(--i-line) px-5 pt-6 pb-5">
				<Screw className="top-2 left-2" />
				<Screw className="top-2 right-2" />
				<Screw className="bottom-2 left-2" />
				<Screw className="right-2 bottom-2" />

				<div className="flex items-center gap-3">
					<SpoolMark className="h-5 w-4 text-(--i-thread)" />
					<span className="i-display">spool</span>
					<Legend className="text-(--i-faint)">Instrument</Legend>
					<span className="flex-1" />
					<Led on="thread" />
					<Legend className="text-(--i-ink)">{appearance === "dark" ? "Graphite" : "Aluminium"}</Legend>
				</div>

				<div className="grid grid-cols-[184px_216px_1fr] gap-x-5 gap-y-5">
					{/* column 1 */}
					<div className="flex flex-col gap-4">
						<Spec title="Keys · h28 · r3">
							<div className="flex flex-wrap gap-x-3 gap-y-3">
								<Under label="Primary">
									<Key tone="thread" className="pr-3 pl-2">
										<PlayG />
										<span className="i-cap">Play</span>
									</Key>
								</Under>
								<Under label="Secondary">
									<Key className="px-3">
										<span className="i-cap">Share</span>
									</Key>
								</Under>
								<Under label="Ghost">
									<Key tone="ghost" className="px-3">
										<span className="i-cap">Cancel</span>
									</Key>
								</Under>
								<Under label="Icon">
									<Key className="w-7">
										<PlusG />
									</Key>
								</Under>
								<Under label="Danger">
									<Key tone="danger" className="px-3">
										<span className="i-cap">Trash</span>
									</Key>
								</Under>
								<Under label="Down">
									<Key state="down" className="w-7">
										<PointerG />
									</Key>
								</Under>
							</div>
						</Spec>
						<Spec title="Fields · wells r2">
							<Under label="Text" className="items-stretch">
								<Well className="h-7 px-2">
									<span className="i-read">cart</span>
									<span className="ml-px h-4 w-px bg-(--i-thread)" />
								</Well>
							</Under>
							<Under label="Search" className="items-stretch">
								<Well className="h-8 gap-2 pr-1.5 pl-2.5 text-(--i-faint)">
									<SearchG />
									<span className="i-body flex-1">Find a frame</span>
									<Kbd>{commandHint}</Kbd>
								</Well>
							</Under>
						</Spec>
						<Spec title="Segmented">
							<div className="flex">
								{["Dark", "Light", "System"].map((s, i) => {
									const on = (appearance === "dark" ? 0 : 1) === i;
									return (
										<Key
											key={s}
											state={on ? "down" : undefined}
											className={cn("relative h-8 flex-1 rounded-none", i === 0 && "rounded-l-[3px]", i === 2 && "rounded-r-[3px]", i > 0 && "-ml-px", !on && "text-(--i-legend)")}
										>
											<Led on={on ? "thread" : undefined} className="absolute top-1 left-1 size-1!" />
											<span className="i-cap">{s}</span>
										</Key>
									);
								})}
							</div>
						</Spec>
						<Spec title="Tool keys · pilot led">
							<ToolKeys />
						</Spec>
					</div>

					{/* column 2 */}
					<div className="flex flex-col gap-4">
						<Spec title="Tabs">
							<div className="flex gap-1">
								<Key state="down" className="relative gap-2 pr-1.5 pl-3">
									<Led on="thread" className="absolute top-1 left-1 size-1!" />
									<span className="i-read">kaffe</span>
									<span className="flex size-4 items-center justify-center text-(--i-legend)">
										<CloseG />
									</span>
								</Key>
								<Key className="px-3 text-(--i-legend)">
									<span className="i-read">tvärsö</span>
								</Key>
							</div>
						</Spec>
						<Spec title="Chips · leds">
							<div className="flex flex-wrap items-start gap-3">
								<Under label="Count">
									<Well className="i-read h-5 w-7 justify-center">3</Well>
								</Under>
								<Under label="Live">
									<Well className="i-read h-5 gap-1.5 px-2">
										<Led on="thread" />
										live
									</Well>
								</Under>
								<Under label="Unseen">
									<Well className="i-read h-5 gap-1.5 px-2">
										<Led on="thread" />
										unseen
									</Well>
								</Under>
							</div>
						</Spec>
						<Spec title="Channel rows · h28">
							<div className="grid grid-cols-[52px_1fr] items-center">
								{["Page", "Rest", "Hover", "Select", "Unseen", "Here"].map((c) => (
									<Legend key={c} className="flex h-7 items-center text-(--i-faint)">
										{c}
									</Legend>
								)).flatMap((cap, i) => [
									cap,
									[
										<ChannelRow key="a" index={1} name="app" count={3} open current />,
										<FrameRow key="b" name="menu" />,
										<FrameRow key="c" name="cart" state="hover" />,
										<FrameRow key="d" name="cart" selected />,
										<FrameRow key="e" name="receipt" unseen last />,
										<ChannelRow key="f" index={2} name="site" count={2} presence />,
									][i],
								])}
							</div>
						</Spec>
						<Spec title="Property rows">
							<Prop label="Path" value={selection.path} />
							<div className="grid grid-cols-2 gap-2">
								<Prop label="X" value={selection.x} unit="px" labelWidth="w-3" />
								<Prop label="W" value={selection.w} unit="px" labelWidth="w-3" />
							</div>
						</Spec>
						<Spec title="Toggle">
							<div className="flex gap-6">
								<Under label="Off">
									<Toggle />
								</Under>
								<Under label="On">
									<Toggle on />
								</Under>
							</div>
						</Spec>
					</div>

					{/* column 3 */}
					<div className="flex flex-col gap-4">
						<Spec title="Context menu">
							<div
								className="i-plate flex w-full flex-col border border-(--i-key-edge) p-1"
								style={{ boxShadow: "inset 0 1px 0 var(--i-plate-hi), 0 2px 0 var(--i-key-lo)" }}
							>
								{menuItems.map((m, i) => (
									<div key={m.label}>
										{m.danger ? <Rule className="mx-1 my-1" /> : null}
										<div
											className={cn(
												"flex h-7 items-center rounded-[3px] px-2",
												i === 1 && "i-key",
												m.danger && "text-(--i-thread)",
											)}
										>
											<span className="i-body flex-1">{m.label}</span>
											<span className="i-read text-(--i-faint)">{m.key}</span>
										</div>
									</div>
								))}
							</div>
						</Spec>
						<Spec title="Toast">
							<div
								className="i-plate relative flex h-11 items-center gap-3 overflow-hidden border border-(--i-key-edge) pr-1.5 pl-3"
								style={{ boxShadow: "inset 0 1px 0 var(--i-plate-hi), 0 2px 0 var(--i-key-lo)" }}
							>
								<span className="i-body flex-1 whitespace-nowrap">{toast.text}</span>
								<Key className="px-2.5">
									<span className="i-cap">{toast.action}</span>
								</Key>
								<span className="absolute bottom-0 left-0 h-[2px] w-3/5 bg-(--i-thread)" />
							</div>
						</Spec>
						<Spec title="Tooltip">
							<div className="flex items-center gap-3">
								<Key tone="thread" className="w-8">
									<PlayG />
								</Key>
								<div className="relative">
									<span className="absolute top-1/2 -left-[5px] size-2 -translate-y-1/2 rotate-45 border-b border-l border-(--i-key-edge) bg-(--i-ink)" />
									<div className="relative flex h-7 items-center gap-2 rounded-[3px] bg-(--i-ink) pr-1.5 pl-2.5 text-(--i-plate)">
										<span className="i-body">Play from cart</span>
										<span className="i-read rounded-[2px] border border-(--i-legend) px-1 leading-4 text-(--i-plate) opacity-70">
											p
										</span>
									</div>
								</div>
							</div>
						</Spec>
						<Spec title="Avatar · teammate">
							<div className="flex items-start gap-4">
								<Under label="24">
									<Avatar />
								</Under>
								<Under label="16">
									<Avatar size={16} />
								</Under>
								<Under label="Row">
									<span className="i-read flex h-6 items-center gap-1.5 text-(--i-legend)">
										<Led on="ada" />
										{teammate.page}
									</span>
								</Under>
							</div>
						</Spec>
						<Spec title="Rules">
							<div className="i-read grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-(--i-legend)">
								<span className="text-(--i-ink)">4</span>
								<span>base unit, px</span>
								<span className="text-(--i-ink)">28</span>
								<span>every row and key</span>
								<span className="text-(--i-ink)">0·2·3</span>
								<span>plate · well · key</span>
								<span className="text-(--i-ink)">○</span>
								<span>leds and screws only</span>
								<span className="text-(--i-thread)">■</span>
								<span>play · select · unseen</span>
							</div>
						</Spec>
					</div>
				</div>

				<div className="grid grid-cols-[272px_1fr] gap-5">
					<Spec title="Type · five roles">
						<div className="flex flex-col gap-2.5">
							<TypeRow role="Display" spec="mono 20/24">
								<span className="i-display">kaffe</span>
							</TypeRow>
							<TypeRow role="Readout" spec="mono 12/16">
								<span className="i-read">390 × 844</span>
							</TypeRow>
							<TypeRow role="Body" spec="sans 13/18">
								<span className="i-body">Play starts here.</span>
							</TypeRow>
							<TypeRow role="Cap" spec="sans 11 +10">
								<span className="i-cap">Play</span>
							</TypeRow>
							<TypeRow role="Legend" spec="sans 10 +14">
								<span className="i-legend text-(--i-ink)">Position</span>
							</TypeRow>
						</div>
					</Spec>
					<Spec title="Palette">
						<div className="grid grid-cols-6 gap-x-2 gap-y-2.5">
							{palette[appearance].map((p) => (
								<div key={p.name} className="flex flex-col gap-1">
									<span
										className="h-5 rounded-[2px] border border-(--i-key-edge)"
										style={{ background: `var(${p.v})` }}
									/>
									<div className="flex items-baseline justify-between gap-1">
										<Legend>{p.name}</Legend>
									</div>
									<span className="i-read -mt-0.5 text-(--i-faint)">{p.hex}</span>
								</div>
							))}
						</div>
					</Spec>
				</div>
			</div>
		</div>
	);
}

function TypeRow({ role, spec, children }: { role: string; spec: string; children: ReactNode }) {
	return (
		<div className="flex items-baseline gap-3">
			<Legend className="w-16 text-(--i-faint)">{role}</Legend>
			<span className="flex-1 truncate">{children}</span>
			<span className="i-read text-(--i-faint)">{spec}</span>
		</div>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span className="flex items-center gap-2">
			<span className="i-well relative h-5 w-10">
				<span
					className="i-key absolute top-[1px] h-4 w-5"
					style={{ left: on ? 17 : 1, height: 16, borderRadius: 2 }}
				/>
			</span>
			<Led on={on ? "thread" : undefined} />
		</span>
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
