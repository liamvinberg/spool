import type { CSSProperties, ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	agent,
	canvasFrames,
	element,
	flows,
	frameSize,
	home,
	menuItems,
	pages,
	railHint,
	selection,
	settingsRow,
	tabs,
	toast,
	tools,
	zoom,
	type Appearance,
} from "shared/lib/explore/identity/world";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { projects } from "shared/ui/demo/home-data";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { SpoolMark } from "shared/ui/spool/mark";
import "./native.css";

/* ── the rules ─────────────────────────────────────────────────────────────
 * 4px scale. Panels inset 8 and pad 8: text sits 16 from every panel edge.
 * Radius follows height: ≤24 → 4, 28 → 6, taller → 10. Rows 28; two-line rows 48.
 * Controls 28 standalone, 20 in a row. One shadow, --n-float, on what floats.
 * Names are sans, lowercase as typed. Mono is what the machine prints:
 * paths, measures, counts, hints. Red is the active state and nothing else. */

const W = 1440;
const H = 900;
const TITLE = 48;
const SIDE = 240;
const RAIL = 44;
const PANEL = { properties: 288, agent: 360 } as const;

/* the camera: three 240×520 frames, 48 apart, centred in the canvas the properties panel leaves */
const FRAME = { w: 240, h: 520, gap: 48, top: 176 };
const CANVAS_W = W - RAIL - PANEL.properties - SIDE;
const FIRST_X = SIDE + (CANVAS_W - (3 * FRAME.w + 2 * FRAME.gap)) / 2;
const frameX = (i: number) => FIRST_X + i * (FRAME.w + FRAME.gap);

/* ── icons: one set, 16 box, 1.4 stroke, round caps (SF Symbols' regular weight) ── */

type IconName =
	| "home"
	| "folder"
	| "folderFill"
	| "doc"
	| "chevronRight"
	| "chevronDown"
	| "upDown"
	| "plus"
	| "close"
	| "sidebarLeft"
	| "sidebarRight"
	| "more"
	| "flows"
	| "sliders"
	| "chat"
	| "help"
	| "gear"
	| "pointer"
	| "edit"
	| "hand"
	| "play"
	| "search"
	| "grid";

function Icon({ name, className }: { name: IconName; className?: string }) {
	const s = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true">
			{name === "home" && <path {...s} d="M2.75 7.25 8 2.75l5.25 4.5v5.5a.5.5 0 0 1-.5.5H10v-3.75H6v3.75H3.25a.5.5 0 0 1-.5-.5z" />}
			{name === "folder" && <path {...s} d="M2.25 4.25a1 1 0 0 1 1-1h2.9l1.4 1.5h5.2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1z" />}
			{name === "folderFill" && (
				<path
					d="M2.25 4.25a1 1 0 0 1 1-1h2.9l1.4 1.5h5.2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1z"
					fill="currentColor"
					stroke="currentColor"
					strokeWidth={1.4}
					strokeLinejoin="round"
				/>
			)}
			{name === "doc" && (
				<>
					<path {...s} d="M4.25 2.25h4.6l2.9 2.9v8.1a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V2.75a.5.5 0 0 1 .5-.5z" />
					<path {...s} d="M8.75 2.5v2.75h2.75" />
				</>
			)}
			{name === "chevronRight" && <path {...s} d="m6.5 4 4 4-4 4" />}
			{name === "chevronDown" && <path {...s} d="m4 6.5 4 4 4-4" />}
			{name === "upDown" && <path {...s} d="m5.25 6 2.75-2.75L10.75 6M5.25 10 8 12.75 10.75 10" />}
			{name === "plus" && <path {...s} d="M8 3.25v9.5M3.25 8h9.5" />}
			{name === "close" && <path {...s} d="m4.5 4.5 7 7m0-7-7 7" />}
			{name === "sidebarLeft" && (
				<>
					<rect {...s} x="2.25" y="3" width="11.5" height="10" rx="2" />
					<path {...s} d="M6.25 3.25v9.5M3.9 5.5h.9M3.9 7.5h.9" />
				</>
			)}
			{name === "sidebarRight" && (
				<>
					<rect {...s} x="2.25" y="3" width="11.5" height="10" rx="2" />
					<path {...s} d="M9.75 3.25v9.5M11.2 5.5h.9M11.2 7.5h.9" />
				</>
			)}
			{name === "more" && (
				<>
					<circle cx="3.75" cy="8" r="1.1" fill="currentColor" />
					<circle cx="8" cy="8" r="1.1" fill="currentColor" />
					<circle cx="12.25" cy="8" r="1.1" fill="currentColor" />
				</>
			)}
			{name === "flows" && (
				<>
					<circle {...s} cx="4.25" cy="4.5" r="1.75" />
					<circle {...s} cx="11.75" cy="11.5" r="1.75" />
					<path {...s} d="M6 4.5h2.5a2 2 0 0 1 2 2v3.25" />
				</>
			)}
			{name === "sliders" && (
				<path {...s} d="M2.75 4.5h3.5m3 0h4m-10.5 7h6.5m3 0h1M7.75 3v3m3 4v3" />
			)}
			{name === "chat" && (
				<path {...s} d="M3.25 3.25h9.5a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-.75.75H7.5L4.75 13.5v-2.25h-1.5a.75.75 0 0 1-.75-.75V4a.75.75 0 0 1 .75-.75z" />
			)}
			{name === "help" && (
				<>
					<circle {...s} cx="8" cy="8" r="5.75" />
					<path {...s} d="M6.4 6.5a1.65 1.65 0 1 1 2.35 1.5c-.5.25-.75.6-.75 1.15" />
					<circle cx="8" cy="11.1" r=".8" fill="currentColor" />
				</>
			)}
			{name === "gear" && (
				<>
					<circle {...s} cx="8" cy="8" r="2" />
					<path
						{...s}
						d="M8 2.25v1.5M8 12.25v1.5M2.25 8h1.5M12.25 8h1.5M3.93 3.93l1.06 1.06M11.01 11.01l1.06 1.06M3.93 12.07l1.06-1.06M11.01 4.99l1.06-1.06"
					/>
					<circle {...s} cx="8" cy="8" r="4.25" />
				</>
			)}
			{name === "pointer" && (
				<path
					d="M3.6 2.9a.45.45 0 0 1 .6-.5l9 4.1a.45.45 0 0 1-.05.84l-3.5 1.1a1.2 1.2 0 0 0-.78.78l-1.1 3.5a.45.45 0 0 1-.84.05z"
					fill="currentColor"
				/>
			)}
			{name === "edit" && (
				<>
					<path {...s} d="M2.75 6V3.75a1 1 0 0 1 1-1H6M10 2.75h2.25a1 1 0 0 1 1 1V6M2.75 10v2.25a1 1 0 0 0 1 1H6" />
					<path
						d="M8.1 7.6a.35.35 0 0 1 .47-.4l5.6 2.4a.35.35 0 0 1-.04.66l-2.1.6a.9.9 0 0 0-.6.6l-.6 2.1a.35.35 0 0 1-.66.04z"
						fill="currentColor"
					/>
				</>
			)}
			{name === "hand" && (
				<path
					{...s}
					d="M5.25 8.5V4.25a1 1 0 0 1 2 0V7.5m0-4.25a1 1 0 0 1 2 0V7.5m0-3.5a1 1 0 0 1 2 0v4m0-2.25a1 1 0 0 1 2 0V10a3.75 3.75 0 0 1-3.75 3.75h-.9a3.5 3.5 0 0 1-2.75-1.35L2.9 9.85a1 1 0 0 1 1.5-1.3l.85.95"
				/>
			)}
			{name === "play" && <path d="M5 3.4v9.2a.5.5 0 0 0 .76.43l7.3-4.6a.5.5 0 0 0 0-.86l-7.3-4.6A.5.5 0 0 0 5 3.4z" fill="currentColor" />}
			{name === "search" && (
				<>
					<circle {...s} cx="7" cy="7" r="4.25" />
					<path {...s} d="m10.25 10.25 3 3" />
				</>
			)}
			{name === "grid" && (
				<>
					<rect {...s} x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
					<rect {...s} x="9" y="2.5" width="4.5" height="4.5" rx="1" />
					<rect {...s} x="2.5" y="9" width="4.5" height="4.5" rx="1" />
					<rect {...s} x="9" y="9" width="4.5" height="4.5" rx="1" />
				</>
			)}
		</svg>
	);
}

/* ── primitives ──────────────────────────────────────────────────────────── */

function Root({
	appearance,
	className,
	style,
	children,
}: {
	appearance: Appearance;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	return (
		<div className={cn("id-native relative overflow-hidden", className)} data-appearance={appearance} style={style}>
			{children}
		</div>
	);
}

function TrafficLights() {
	const light = "size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.18)]";
	return (
		<div className="flex items-center gap-2" aria-hidden="true">
			<span className={cn(light, "bg-[#ff5f57]")} />
			<span className={cn(light, "bg-[#febc2e]")} />
			<span className={cn(light, "bg-[#28c840]")} />
		</div>
	);
}

/** A 28 square icon button: the toolbar's, the panel header's, the rail's. On is a fill, never colour alone. */
function IconButton({
	name,
	on,
	thread,
	small,
	label,
}: {
	name: IconName;
	on?: boolean;
	thread?: boolean;
	small?: boolean;
	label: string;
}) {
	return (
		<span
			role="button"
			aria-label={label}
			className={cn(
				"flex shrink-0 items-center justify-center",
				small ? "size-5 rounded-[4px]" : "size-7 rounded-[6px]",
				on ? "n-segment-on text-(--n-text)" : "text-(--n-text-2)",
				thread && "text-(--n-thread-text)",
			)}
		>
			<Icon name={name} className={small ? "size-3" : undefined} />
		</span>
	);
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({ kind = "secondary", icon, children }: { kind?: ButtonKind; icon?: IconName; children: ReactNode }) {
	return (
		<span
			role="button"
			className={cn(
				"t-body inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-3 whitespace-nowrap",
				kind === "primary" && "bg-(--n-thread) font-medium text-(--n-on-thread)",
				kind === "secondary" && "n-control text-(--n-text)",
				kind === "ghost" && "px-2 text-(--n-text-2)",
				kind === "danger" && "n-control text-(--n-thread-text)",
			)}
		>
			{icon ? <Icon name={icon} className="-ml-0.5" /> : null}
			{children}
		</span>
	);
}

/** A popup button in the system idiom: its value, then the up-down chevron. */
function Popup({ children, mono }: { children: ReactNode; mono?: boolean }) {
	return (
		<span
			role="button"
			className={cn(
				"inline-flex h-7 items-center gap-1 rounded-[6px] px-2 whitespace-nowrap text-(--n-text)",
				mono ? "t-mono" : "t-body",
			)}
		>
			{children}
			<Icon name="upDown" className="size-3 text-(--n-text-2)" />
		</span>
	);
}

function Keycap({ children }: { children: ReactNode }) {
	return (
		<span className="t-label inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] px-1 text-(--n-text-3) shadow-[inset_0_0_0_1px_var(--n-sep)]">
			{children}
		</span>
	);
}

function SearchField({ width, placeholder, hint }: { width: number; placeholder: string; hint: string }) {
	return (
		<span
			className="flex h-7 items-center gap-1.5 rounded-[6px] bg-(--n-field) pr-1 pl-2 shadow-[inset_0_0_0_1px_var(--n-control-edge)]"
			style={{ width }}
		>
			<Icon name="search" className="text-(--n-text-3)" />
			<span className="t-body flex-1 text-(--n-text-3)">{placeholder}</span>
			<Keycap>{hint}</Keycap>
		</span>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn("relative inline-block h-5 w-8 shrink-0 rounded-full", on ? "bg-(--n-thread)" : "bg-(--n-off)")}
		>
			<span
				className={cn(
					"absolute top-0.5 size-4 rounded-full bg-(--n-knob) shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]",
					on ? "left-3.5" : "left-0.5",
				)}
			/>
		</span>
	);
}

function Segmented({ items, active, mono }: { items: string[]; active: number; mono?: boolean }) {
	return (
		<span className="inline-flex h-7 items-center gap-0.5 rounded-[6px] bg-(--n-track) p-0.5">
			{items.map((item, i) => (
				<span
					key={item}
					className={cn(
						"flex h-6 items-center rounded-[4px] px-2.5",
						mono ? "t-mono" : "t-body",
						i === active ? "n-segment-on text-(--n-text)" : "text-(--n-text-2)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

/** The window tab: a control-height pill; the open one is raised. */
function WindowTab({ name, active, home }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"t-body flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5",
				active && !home && "pr-1",
				active ? "n-segment-on text-(--n-text)" : "text-(--n-text-2)",
			)}
		>
			{home ? <Icon name="home" /> : null}
			<span className="whitespace-nowrap">{name}</span>
			{active && !home ? <IconButton name="close" small label={`close ${name}`} /> : null}
		</span>
	);
}

/** Selection on the canvas becomes a chip in the composer: the thread tick, the path, a ×. */
function SelectionChip({ text }: { text: string }) {
	return (
		<span className="n-control inline-flex h-5 items-center gap-1.5 rounded-[4px] pr-0.5 pl-1.5">
			<span className="h-2.5 w-0.5 rounded-full bg-(--n-thread)" />
			<span className="t-mono text-(--n-text)">{text}</span>
			<IconButton name="close" small label="remove" />
		</span>
	);
}

function SizeChip() {
	return (
		<span className="t-mono inline-flex h-5 items-center rounded-[4px] bg-(--n-thread) px-1.5 text-(--n-on-thread)">
			{frameSize.w} × {frameSize.h}
		</span>
	);
}

/* ── sidebar rows ────────────────────────────────────────────────────────── */

type RowState = "rest" | "hover" | "selected";

/** Every sidebar row: 28 tall, an 8 inset pill, a 16 icon, its name, a count at the far end. */
function SideRow({
	depth = 0,
	disclosure,
	icon,
	name,
	count,
	state = "rest",
	current,
	unseen,
}: {
	depth?: 0 | 1;
	disclosure?: "open" | "closed";
	icon: IconName;
	name: string;
	count?: number;
	state?: RowState;
	current?: boolean;
	unseen?: boolean;
}) {
	return (
		<div className="px-2">
			<div
				className={cn(
					"flex h-7 items-center gap-1 rounded-[6px] pr-2 pl-2",
					state === "hover" && "bg-(--n-hover)",
					state === "selected" && "bg-(--n-thread-tint)",
				)}
				style={{ paddingLeft: 8 + depth * 20 }}
			>
				{depth === 0 ? (
					<span className="flex size-4 items-center justify-center text-(--n-text-3)">
						{disclosure ? <Icon name={disclosure === "open" ? "chevronDown" : "chevronRight"} className="size-3" /> : null}
					</span>
				) : null}
				<Icon
					name={current ? "folderFill" : icon}
					className={cn(
						current || state === "selected" ? "text-(--n-thread)" : "text-(--n-text-2)",
					)}
				/>
				<span className={cn("t-body ml-1 min-w-0 flex-1 truncate", current && "font-medium")}>{name}</span>
				{unseen ? <span className="size-1.5 rounded-full bg-(--n-thread)" aria-label="unseen" /> : null}
				{count !== undefined ? <span className="t-mono text-(--n-text-3)">{count}</span> : null}
			</div>
		</div>
	);
}

function PagesSidebar() {
	return (
		<aside className="n-vibrant absolute top-0 left-0 z-20 flex h-full flex-col shadow-[inset_-1px_0_0_var(--n-sep)]" style={{ width: SIDE }}>
			<div className="flex shrink-0 items-center justify-between pr-2 pl-4" style={{ height: TITLE }}>
				<TrafficLights />
				<IconButton name="sidebarLeft" label="collapse pages" />
			</div>
			<div className="flex h-7 shrink-0 items-center gap-1.5 pr-2 pl-4">
				<span className="t-headline">Pages</span>
				<span className="t-mono text-(--n-text-3)">{pages.length}</span>
				<span className="flex-1" />
				<IconButton name="plus" label="new page" />
				<IconButton name="close" label="close pages" />
			</div>
			<div className="mt-1 flex flex-col">
				{pages.map((page) => (
					<div key={page.name} className="flex flex-col">
						<SideRow
							disclosure={page.open ? "open" : "closed"}
							icon="folder"
							name={page.name}
							count={page.count}
							current={page.current}
						/>
						{page.open
							? page.frames.map((f) => (
									<SideRow
										key={f.name}
										depth={1}
										icon="doc"
										name={f.name}
										state={f.selected ? "selected" : "rest"}
										unseen={f.unseen}
									/>
								))
							: null}
					</div>
				))}
			</div>
			<div className="flex-1" />
			<div className="flex h-7 shrink-0 items-center px-4 pb-2" style={{ height: 44 }}>
				<span className="t-mono text-(--n-text-3)">{railHint}</span>
			</div>
		</aside>
	);
}

/* ── window chrome ───────────────────────────────────────────────────────── */

function TitleBar({ homeActive, right }: { homeActive?: boolean; right?: ReactNode }) {
	return (
		<header
			className="absolute top-0 right-0 z-10 flex items-center gap-1 bg-(--n-window) pr-4 pl-2 shadow-[inset_0_-1px_0_var(--n-sep)]"
			style={{ left: SIDE, height: TITLE }}
		>
			<WindowTab name="Home" home active={homeActive} />
			<span className="mx-1 h-4 w-px bg-(--n-sep)" />
			{tabs.map((t) => (
				<WindowTab key={t.name} name={t.name} active={!homeActive && t.active} />
			))}
			<IconButton name="plus" label="new tab" />
			<span className="flex-1" />
			{right}
		</header>
	);
}

function PanelRail({ panel }: { panel: "properties" | "agent" }) {
	return (
		<nav
			className="absolute right-0 bottom-0 z-10 flex flex-col items-center gap-1 bg-(--n-window) py-2 shadow-[inset_1px_0_0_var(--n-sep)]"
			style={{ top: TITLE, width: RAIL }}
		>
			<IconButton name="sliders" on={panel === "properties"} label="properties" />
			<IconButton name="chat" on={panel === "agent"} label="agent" />
			<span className="flex-1" />
			<IconButton name="help" label="help" />
			<IconButton name="gear" label="settings" />
		</nav>
	);
}

/** Header of any panel: 28 tall, the subject in headline, actions, then the collapse glyph. */
function PanelHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
	return (
		<div className="flex h-7 shrink-0 items-center gap-0.5 pl-2">
			<div className="flex min-w-0 flex-1 items-center gap-1">{title}</div>
			{children}
			<IconButton name="sidebarRight" label="collapse panel" />
		</div>
	);
}

/** A property row: 28, a mono key, a mono value and its unit. Editing raises the value into a field. */
function PropertyRow({ k, value, unit, editing }: { k: string; value: number; unit: string; editing?: boolean }) {
	return (
		<div className="flex h-7 items-center gap-2 px-2">
			<span className="t-mono w-6 text-(--n-text-2)">{k}</span>
			<span className="flex-1" />
			<span
				className={cn(
					"t-mono flex h-5 w-20 items-center justify-end gap-1 rounded-[4px] px-1.5",
					editing && "bg-(--n-field) shadow-[inset_0_0_0_1px_var(--n-thread),0_0_0_2px_var(--n-thread-tint)]",
				)}
			>
				<span className="text-(--n-text)">{value}</span>
				<span className="text-(--n-text-3)">{unit}</span>
			</span>
		</div>
	);
}

function PropertyGroup({ title, source, rows }: { title: string; source: string; rows: [string, number][] }) {
	return (
		<section className="flex flex-col">
			<div className="flex h-7 items-center justify-between px-2">
				<span className="t-label text-(--n-text-2)">{title}</span>
				<span className="t-mono text-(--n-text-3)">{source}</span>
			</div>
			<div className="n-group flex flex-col rounded-[10px]">
				{rows.map(([k, v], i) => (
					<div key={k} className={cn(i > 0 && "shadow-[inset_0_1px_0_var(--n-sep)]")}>
						<PropertyRow k={k} value={v} unit="px" />
					</div>
				))}
			</div>
		</section>
	);
}

function PropertiesPanel() {
	return (
		<aside
			className="absolute bottom-0 z-10 flex flex-col gap-2 bg-(--n-window) p-2 shadow-[inset_1px_0_0_var(--n-sep)]"
			style={{ top: TITLE, right: RAIL, width: PANEL.properties }}
		>
			<PanelHeader title={<span className="t-headline truncate">{selection.name}</span>}>
				<IconButton name="more" label="more" />
			</PanelHeader>
			<PropertyGroup
				title="Position"
				source={selection.source}
				rows={[
					["x", selection.x],
					["y", selection.y],
				]}
			/>
			<PropertyGroup
				title="Size"
				source={selection.source}
				rows={[
					["w", selection.w],
					["h", selection.h],
				]}
			/>
		</aside>
	);
}

function AgentPanel() {
	const edit = agent.turn.edits[0]!;
	return (
		<aside
			className="absolute bottom-0 z-10 flex flex-col bg-(--n-window) p-2 shadow-[inset_1px_0_0_var(--n-sep)]"
			style={{ top: TITLE, right: RAIL, width: PANEL.agent }}
		>
			<PanelHeader
				title={
					<span className="flex items-center gap-1">
						<span className="t-headline">{agent.title}</span>
						<Icon name="chevronDown" className="size-3 text-(--n-text-2)" />
					</span>
				}
			>
				<IconButton name="plus" label="new chat" />
			</PanelHeader>
			<div className="flex h-7 shrink-0 items-center justify-between pr-2">
				<Popup>{agent.model}</Popup>
				<span className="t-detail text-(--n-text-3)">{agent.scope}</span>
			</div>
			<div className="-mx-2 mt-2 h-px shrink-0 bg-(--n-sep)" />

			<div className="flex flex-1 flex-col gap-4 px-2 pt-4">
				<div className="flex justify-end">
					<p className="t-body n-group max-w-[264px] rounded-[10px] px-3 py-2">{agent.turn.ask}</p>
				</div>
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<SpoolMark className="h-3.5 w-3 text-(--n-thread)" />
						<span className="t-label text-(--n-text-2)">{agent.model}</span>
					</div>
					<p className="t-body">{agent.turn.said}</p>
					<div className="n-group flex h-7 items-center gap-2 rounded-[6px] px-2">
						<Icon name="doc" className="text-(--n-text-2)" />
						<span className="t-mono min-w-0 flex-1 truncate">{edit.path}</span>
						<span className="t-mono text-(--n-text-2)">+{edit.added}</span>
						<span className="t-mono text-(--n-text-3)">−{edit.removed}</span>
					</div>
				</div>
			</div>

			<div className="n-group flex h-[104px] shrink-0 flex-col gap-2 rounded-[10px] p-2">
				<div>
					<SelectionChip text={element.chip} />
				</div>
				<span className="t-body px-1.5 text-(--n-text-3)">{agent.placeholder}</span>
			</div>
			<div className="mt-1 flex h-7 shrink-0 items-center justify-between">
				<Button kind="ghost">{agent.account}</Button>
				<Popup>{agent.mode}</Popup>
			</div>
		</aside>
	);
}

/* ── the canvas ──────────────────────────────────────────────────────────── */

function FlowLines() {
	const [cart, menu, receipt] = [frameX(0), frameX(1), frameX(2)];
	const top = FRAME.top;
	const bottom = FRAME.top + FRAME.h;
	const action = bottom - 16 - 15; // the centre of Pay / Checkout
	const paths: Record<string, string> = {
		"menu-cart": `M ${menu - 1} ${action} C ${menu - 26} ${action}, ${cart + FRAME.w + 26} ${top + 420}, ${cart + FRAME.w + 3} ${top + 420}`,
		"cart-receipt": `M ${cart + 176} ${bottom + 1} C ${cart + 176} ${bottom + 72}, ${receipt + 56} ${bottom + 72}, ${receipt + 56} ${bottom + 4}`,
		"receipt-menu": `M ${receipt - 1} ${top + 300} C ${receipt - 26} ${top + 300}, ${menu + FRAME.w + 26} ${top + 260}, ${menu + FRAME.w + 3} ${top + 260}`,
	};
	return (
		<svg className="pointer-events-none absolute inset-0 z-[1]" width={W} height={H} aria-hidden="true">
			<defs>
				<marker id="n-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
					<path d="M0 0.5 8 4 0 7.5z" fill="var(--n-thread)" />
				</marker>
			</defs>
			{flows.map((f) => (
				<path
					key={`${f.from}-${f.to}`}
					d={paths[`${f.from}-${f.to}`]}
					fill="none"
					stroke="var(--n-thread)"
					strokeWidth={1.5}
					strokeLinecap="round"
					strokeDasharray={f.certainty === "might" ? "4 4" : undefined}
					markerEnd="url(#n-head)"
				/>
			))}
		</svg>
	);
}

function FrameLabel({ name, selected, unseen }: { name: string; selected?: boolean; unseen?: boolean }) {
	return (
		<div
			className={cn("t-label absolute flex h-4 items-center gap-1.5", selected ? "text-(--n-thread-text)" : "text-(--n-text-2)")}
			style={{ top: -24, left: 0, right: 0 }}
		>
			<span>{name}</span>
			{unseen ? <span className="size-1.5 rounded-full bg-(--n-thread)" aria-label="unseen" /> : null}
			<span className="flex-1" />
			{selected ? (
				<span className="flex items-center gap-1">
					<Icon name="play" className="size-2.5" />
					play
				</span>
			) : null}
		</div>
	);
}

function Handles() {
	const h = "absolute size-1.5 bg-white shadow-[0_0_0_1.5px_var(--n-thread)]";
	return (
		<>
			<span className={h} style={{ left: -4, top: -4 }} />
			<span className={h} style={{ right: -4, top: -4 }} />
			<span className={h} style={{ left: -4, bottom: -4 }} />
			<span className={h} style={{ right: -4, bottom: -4 }} />
		</>
	);
}

/** The picked element inside cart: 1 × Cortado's row at the drawn scale. */
const PICK = { x: 17, y: 51, w: 206, h: 28 };

function CanvasFrames({ mode }: { mode: "frame" | "element" }) {
	return (
		<>
			{canvasFrames.map((f, i) => {
				const frameSelected = mode === "frame" && f.selected;
				return (
					<div
						key={f.name}
						className="absolute z-[2]"
						style={{ left: frameX(i), top: FRAME.top, width: FRAME.w, height: FRAME.h }}
					>
						<FrameLabel name={f.name} selected={frameSelected} unseen={"unseen" in f ? f.unseen : undefined} />
						<div className="n-product h-full w-full">
							<CoffeeScreen screen={f.screen} />
						</div>
						{frameSelected ? (
							<>
								<span className="pointer-events-none absolute -inset-px rounded-[9px] shadow-[0_0_0_1.5px_var(--n-thread)]" />
								<Handles />
								<div className="absolute right-0 left-0 flex justify-center" style={{ top: FRAME.h + 12 }}>
									<SizeChip />
								</div>
							</>
						) : null}
						{mode === "element" && f.name === element.frame ? (
							<>
								<span
									className="pointer-events-none absolute rounded-[6px] shadow-[0_0_0_1.5px_var(--n-thread)]"
									style={{ left: PICK.x - 1, top: PICK.y - 1, width: PICK.w + 2, height: PICK.h + 2 }}
								/>
								<span
									className="t-label absolute flex h-4 items-center rounded-t-[4px] bg-(--n-thread) px-1 text-(--n-on-thread)"
									style={{ right: FRAME.w - PICK.x - PICK.w - 1.75, top: PICK.y - 17 }}
								>
									{element.kind}
								</span>
							</>
						) : null}
					</div>
				);
			})}
		</>
	);
}

function ToolBar({ active }: { active: string }) {
	const icon: Record<string, IconName> = { select: "pointer", edit: "edit", hand: "hand" };
	return (
		<div
			className="n-float absolute z-10 flex items-center gap-0.5 rounded-[10px] bg-(--n-window) p-1"
			style={{ left: SIDE + CANVAS_W / 2, bottom: 16, transform: "translateX(-50%)" }}
		>
			{tools.map((t) => (
				<IconButton key={t.name} name={icon[t.name]!} on={t.name === active} label={`${t.name} ${t.key}`} />
			))}
		</div>
	);
}

/* ── the project window ──────────────────────────────────────────────────── */

export function IdentityCanvas({ appearance, panel }: { appearance: "dark" | "light"; panel: "properties" | "agent" }) {
	const agentOpen = panel === "agent";
	return (
		<Root appearance={appearance} className="bg-(--n-canvas)" style={{ width: W, height: H }}>
			<CanvasFrames mode={agentOpen ? "element" : "frame"} />
			<FlowLines />
			<ToolBar active={agentOpen ? "edit" : "select"} />
			<TitleBar
				right={
					<div className="flex items-center gap-2">
						<IconButton name="flows" on thread label="flows" />
						<span className="t-mono w-9 text-right text-(--n-text-2)">{zoom}</span>
					</div>
				}
			/>
			<PagesSidebar />
			{agentOpen ? <AgentPanel /> : <PropertiesPanel />}
			<PanelRail panel={panel} />
		</Root>
	);
}

/* ── Home ────────────────────────────────────────────────────────────────── */

export function IdentityHome({ appearance }: { appearance: "dark" | "light" }) {
	const [importLabel, openLabel, newLabel] = home.actions;
	return (
		<Root appearance={appearance} className="bg-(--n-window)" style={{ width: W, height: H }}>
			<TitleBar homeActive />
			<aside className="n-vibrant absolute top-0 left-0 z-20 flex h-full flex-col shadow-[inset_-1px_0_0_var(--n-sep)]" style={{ width: SIDE }}>
				<div className="flex shrink-0 items-center pl-4" style={{ height: TITLE }}>
					<TrafficLights />
				</div>
				<div className="flex h-7 items-center gap-2 px-4">
					<SpoolMark className="h-[18px] w-[14px] text-(--n-thread)" />
					<span className="t-headline">spool</span>
				</div>
				<div className="mt-3 flex flex-col">
					{home.nav.map((item) => (
						<SideRow key={item} icon="grid" name={item} state="selected" />
					))}
				</div>
				<div className="flex-1" />
				<div className="pb-2">
					<div className="px-2">
						<div className="flex h-7 items-center gap-2 rounded-[6px] px-2 text-(--n-text-2)">
							<Icon name="gear" />
							<span className="t-body text-(--n-text)">{home.foot}</span>
						</div>
					</div>
				</div>
			</aside>

			<main className="absolute right-0 bottom-0 flex flex-col px-8 pt-8" style={{ left: SIDE, top: TITLE }}>
				<div className="flex h-7 items-center gap-2">
					<h1 className="t-display flex-1">{home.title}</h1>
					<SearchField width={240} placeholder={home.search} hint={home.searchKey} />
					<span className="w-1" />
					<Button>{importLabel}</Button>
					<Button>{openLabel}</Button>
					<Button kind="primary" icon="plus">
						{newLabel}
					</Button>
				</div>
				<div className="mt-4 flex h-7 items-center justify-between">
					<span className="t-mono text-(--n-text-2)">{home.count}</span>
					<span className="flex items-center gap-1">
						<span className="t-detail">Sort by</span>
						<Popup>{home.sort}</Popup>
					</span>
				</div>
				<div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-6">
					{projects.map((p) => (
						<article key={p.name} className="flex flex-col gap-2">
							<div className="n-group overflow-hidden rounded-[10px]" style={{ height: 200 }}>
								<div className="n-product relative h-full">
									<ProjectArtwork kind={p.art} className="h-full" />
									<span className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_0_1px_var(--n-group-edge)]" />
								</div>
							</div>
							<div className="flex flex-col gap-0.5 px-0.5">
								<span className="t-headline">{p.name}</span>
								<span className="t-mono text-(--n-text-2)">
									{p.frames} frames · {p.when}
								</span>
							</div>
						</article>
					))}
				</div>
			</main>
		</Root>
	);
}

/* ── the components sheet ────────────────────────────────────────────────── */

function Spec({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<h3 className="t-label text-(--n-text-3)">{title}</h3>
			{children}
		</section>
	);
}

function Note({ children }: { children: ReactNode }) {
	return <span className="t-mono text-(--n-text-3)">{children}</span>;
}

const TYPE_ROLES = [
	{ cls: "t-display", name: "display", spec: "22/28 · 600", sample: "Projects" },
	{ cls: "t-headline", name: "headline", spec: "13/16 · 600", sample: "Pages" },
	{ cls: "t-body", name: "body", spec: "13/16 · 400", sample: "Say what to change." },
	{ cls: "t-label", name: "label", spec: "12/16 · 500", sample: "Position" },
	{ cls: "t-detail", name: "detail", spec: "12/16 · 400", sample: "Once a day." },
	{ cls: "t-mono", name: "mono", spec: "12/16 · Fragment", sample: "frames/app/cart" },
];

const SWATCHES: { name: string; dark: string; light: string; v: string }[] = [
	{ name: "window", dark: "#262523", light: "#f6f5f2", v: "--n-window" },
	{ name: "canvas", dark: "#191817", light: "#e7e5e1", v: "--n-canvas" },
	{ name: "sidebar", dark: "#2c2a27/72", light: "#f0ede9/74", v: "--n-sidebar" },
	{ name: "group", dark: "#fffaf4/5", light: "#ffffff", v: "--n-group" },
	{ name: "control", dark: "#fffaf4/10", light: "#ffffff", v: "--n-control" },
	{ name: "separator", dark: "#fffaf4/8", light: "#281e14/10", v: "--n-sep" },
	{ name: "text", dark: "#f3f1ee", light: "#1d1c1a", v: "--n-text" },
	{ name: "text-2", dark: "#a7a39d", light: "#67635d", v: "--n-text-2" },
	{ name: "text-3", dark: "#817d77", light: "#85817a", v: "--n-text-3" },
	{ name: "thread", dark: "#f5391a", light: "#f5391a", v: "--n-thread" },
	{ name: "thread text", dark: "#ff6447", light: "#d42e10", v: "--n-thread-text" },
	{ name: "thread tint", dark: "#f5391a/18", light: "#f5391a/16", v: "--n-thread-tint" },
];

function PartsBoard({ appearance }: { appearance: Appearance }) {
	const dark = appearance === "dark";
	return (
		<Root appearance={appearance} className="h-full bg-(--n-window)" style={{ width: W / 2 }}>
			<div className="flex h-full flex-col gap-4 p-6">
				<div className="flex items-center gap-2">
					<SpoolMark className="h-[18px] w-[14px] text-(--n-thread)" />
					<span className="t-headline">native</span>
					<span className="t-mono text-(--n-text-3)">{appearance}</span>
					<span className="flex-1" />
					<Note>4px · row 28 · radius ≤24→4 28→6 else 10</Note>
				</div>

				<div className="grid grid-cols-2 gap-x-6">
					{/* column one */}
					<div className="flex flex-col gap-4">
						<Spec title="Type roles">
							<div className="flex flex-col">
								{TYPE_ROLES.map((r) => (
									<div key={r.name} className="flex h-7 items-center gap-3 shadow-[inset_0_-1px_0_var(--n-sep)]">
										<span className={cn(r.cls, "min-w-0 flex-1 truncate")}>{r.sample}</span>
										<span className="t-label w-16 text-(--n-text-2)">{r.name}</span>
										<Note>{r.spec}</Note>
									</div>
								))}
							</div>
						</Spec>

						<Spec title="Palette">
							<div className="grid grid-cols-3 gap-x-3 gap-y-2">
								{SWATCHES.map((s) => (
									<div key={s.name} className="flex items-center gap-2">
										<span
											className="size-5 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_var(--n-sep)]"
											style={{ background: `var(${s.v})` }}
										/>
										<span className="flex min-w-0 flex-col">
											<span className="t-label truncate">{s.name}</span>
											<span className="t-mono truncate text-[11px] text-(--n-text-3)">{dark ? s.dark : s.light}</span>
										</span>
									</div>
								))}
							</div>
						</Spec>

						<Spec title="Buttons · 28">
							<div className="flex flex-wrap items-center gap-2">
								<Button kind="primary" icon="plus">
									New project…
								</Button>
								<Button>Open…</Button>
								<Button kind="ghost">Connect account</Button>
								<span className="n-control rounded-[6px]">
									<IconButton name="more" label="more" />
								</span>
								<Button kind="danger">Move to Trash</Button>
							</div>
						</Spec>

						<Spec title="Field · search">
							<div className="flex items-center gap-2">
								<span className="t-body flex h-7 w-[120px] items-center rounded-[6px] bg-(--n-field) px-2 shadow-[inset_0_0_0_1px_var(--n-thread),0_0_0_3px_var(--n-thread-tint)]">
									kaffe
								</span>
								<SearchField width={196} placeholder={home.search} hint={home.searchKey} />
							</div>
						</Spec>

						<div className="grid grid-cols-[auto_1fr] gap-x-6">
							<Spec title="Segmented">
								<Segmented items={["Ask", "Only this Mac"]} active={0} />
							</Spec>
							<Spec title="Toggle">
								<div className="flex h-7 items-center gap-3">
									<Toggle on />
									<Toggle />
								</div>
							</Spec>
						</div>



					</div>

					{/* column two */}
					<div className="flex flex-col gap-4">
						<Spec title="Pages rail row · 28">
							<div className="n-vibrant -mx-2 flex flex-col rounded-[10px] py-1">
								{(
									[
										["rest", <SideRow key="r" disclosure="closed" icon="folder" name="directing" count={1} />],
										["hover", <SideRow key="h" disclosure="closed" icon="folder" name="site" count={2} state="hover" />],
										["current page", <SideRow key="c" disclosure="open" icon="folder" name="app" count={3} current />],
										["selected", <SideRow key="s" depth={1} icon="doc" name="cart" state="selected" />],
										["unseen", <SideRow key="u" depth={1} icon="doc" name="receipt" unseen />],
									] as const
								).map(([state, row]) => (
									<div key={state} className="flex items-center">
										<div className="w-[200px] shrink-0">{row}</div>
										<Note>{state}</Note>
									</div>
								))}
							</div>
						</Spec>

						<Spec title="Property row · rest, editing">
							<div className="n-group flex flex-col rounded-[10px]">
								<PropertyRow k="x" value={selection.x} unit="px" />
								<div className="shadow-[inset_0_1px_0_var(--n-sep)]">
									<PropertyRow k="y" value={selection.y} unit="px" editing />
								</div>
							</div>
						</Spec>

						<div className="grid grid-cols-[176px_1fr] gap-x-4">
							<Spec title="Context menu">
								<div className="n-float flex flex-col rounded-[10px] bg-(--n-window) p-1">
									{menuItems.map((m, i) => (
										<div key={m.label} className="flex flex-col">
											{m.danger ? <div className="mx-2 my-1 h-px bg-(--n-sep)" /> : null}
											<div
												className={cn(
													"t-body flex h-7 items-center justify-between rounded-[6px] px-2",
													i === 1 && "bg-(--n-thread) text-(--n-on-thread)",
													m.danger && "text-(--n-thread-text)",
												)}
											>
												<span>{m.label}</span>
												<span className={cn(i === 1 ? "text-(--n-on-thread)" : "text-(--n-text-3)")}>{m.key}</span>
											</div>
										</div>
									))}
								</div>
							</Spec>
							<div className="flex flex-col gap-4">
								<Spec title="Tooltip">
									<div className="n-float t-label flex h-7 items-center gap-2 self-start rounded-[6px] bg-(--n-window) px-2">
										Select
										<Keycap>V</Keycap>
									</div>
								</Spec>
								<Spec title="Toolbar">
									<div className="n-float flex items-center gap-0.5 self-start rounded-[10px] bg-(--n-window) p-1">
										<IconButton name="pointer" on label="select" />
										<IconButton name="edit" label="edit" />
										<IconButton name="hand" label="hand" />
									</div>
								</Spec>
							</div>
						</div>

						<Spec title="Toast · 36">
							<div className="n-float flex h-9 items-center gap-3 self-start rounded-[10px] bg-(--n-window) p-1 pl-3 whitespace-nowrap">
								<span className="t-body">{toast.text}</span>
								<Button kind="secondary">{toast.action}</Button>
							</div>
						</Spec>

						<div className="grid grid-cols-[auto_1fr] gap-x-6">
							<Spec title="Window tab">
								<div className="flex items-center gap-1">
									<WindowTab name="Home" home />
									<WindowTab name="kaffe" active />
								</div>
							</Spec>
							<Spec title="Panel tab">
								<div className="flex items-center gap-1">
									<IconButton name="sliders" on label="properties" />
									<IconButton name="chat" label="agent" />
								</div>
							</Spec>
						</div>

						<Spec title="Chips · 20">
							<div className="flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap">
								<span className="flex items-center gap-1.5">
									<span className="t-headline">Pages</span>
									<span className="t-mono text-(--n-text-3)">3</span>
								</span>
								<SizeChip />
								<SelectionChip text={element.chip} />
							</div>
						</Spec>


					</div>
				</div>

				<Spec title="Settings row · 48">
					<div className="n-group flex items-center gap-4 rounded-[10px] px-2 py-2">
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="t-body">{settingsRow.title}</span>
							<span className="t-detail">{settingsRow.detail}</span>
						</div>
						<Toggle on />
					</div>
				</Spec>
			</div>
		</Root>
	);
}

export function IdentityParts() {
	return (
		<div className="flex" style={{ width: W, height: H }}>
			<PartsBoard appearance="dark" />
			<PartsBoard appearance="light" />
		</div>
	);
}
