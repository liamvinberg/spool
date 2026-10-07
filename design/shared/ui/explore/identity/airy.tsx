import type { ReactNode } from "react";
import {
	type Appearance,
	agent,
	canvasFrames,
	drawnSize,
	element,
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
} from "shared/lib/explore/identity/world";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { projects } from "shared/ui/demo/home-data";
import { SpoolMark } from "shared/ui/spool/mark";
import "./airy.css";

/*
 * airy: roomy and calm. The rules, all of them:
 * - 4px grid. Rows 36, controls 32, chips 24 (small chips 20), icons 16.
 * - Radius 8 on everything that holds text; 4 on things under 24px tall;
 *   12 only on a floating shell that pads 4 around 8s, so the curves nest.
 * - Two flat tones: chrome (bars, rails, panels) and the work area (canvas,
 *   Home's grid). Sections are separated by 24px of space, never a line.
 * - Fills, not borders: field for what you type into or press, selected for
 *   where you are, hover for what's under the pointer. Only floating things
 *   get the one shadow token.
 * - A name is sans, a value is mono: pages, frames, tabs, projects in sans;
 *   numbers, sizes, paths, keys, counts and status lines in mono.
 * - Red is what is selected, live or new. The primary action is ink.
 */

const TOP = 48;
const RAIL = 240;
const STRIP = 48;
const PANEL = { properties: 288, agent: 368 } as const;

/* ---------- icons: one set, 16px box, 1.5 stroke, round ends ---------- */

const s = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

type IconName =
	| "home"
	| "folder"
	| "file"
	| "right"
	| "down"
	| "left"
	| "plus"
	| "close"
	| "flows"
	| "dots"
	| "properties"
	| "agent"
	| "help"
	| "cog"
	| "search"
	| "play"
	| "select"
	| "edit"
	| "hand"
	| "trash"
	| "copy";

function Icon({ name, className }: { name: IconName; className?: string }) {
	const wide = name === "select" || name === "edit" || name === "hand";
	return (
		<svg
			viewBox={wide ? "0 0 24 24" : "0 0 16 16"}
			className={cn("size-4 shrink-0", className)}
			aria-hidden="true"
		>
			{name === "home" && <path d="M2.75 7.1 8 2.75l5.25 4.35v6.15h-3.5V9.75h-3.5v3.5h-3.5Z" {...s} />}
			{name === "folder" && (
				<path d="M2.25 4.25a1 1 0 0 1 1-1h2.9l1.5 1.5h5.1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1Z" {...s} />
			)}
			{name === "file" && (
				<>
					<path d="M4 2.25h4.75l3.25 3.25v8.25H4Z" {...s} />
					<path d="M8.75 2.25V5.5H12" {...s} />
				</>
			)}
			{name === "right" && <path d="m6.5 4.5 3.5 3.5-3.5 3.5" {...s} />}
			{name === "down" && <path d="m4.5 6.5 3.5 3.5 3.5-3.5" {...s} />}
			{name === "left" && <path d="m9.5 4.5-3.5 3.5 3.5 3.5" {...s} />}
			{name === "plus" && <path d="M8 3.5v9M3.5 8h9" {...s} />}
			{name === "close" && <path d="m4.75 4.75 6.5 6.5m0-6.5-6.5 6.5" {...s} />}
			{name === "flows" && (
				<>
					<circle cx="4.5" cy="4.5" r="1.75" {...s} />
					<circle cx="11.5" cy="11.5" r="1.75" {...s} />
					<path d="M5.9 5.9c2.2 0 4.2 2 4.2 4.2" {...s} />
				</>
			)}
			{name === "dots" && (
				<>
					<circle cx="3.75" cy="8" r="1.1" fill="currentColor" />
					<circle cx="8" cy="8" r="1.1" fill="currentColor" />
					<circle cx="12.25" cy="8" r="1.1" fill="currentColor" />
				</>
			)}
			{name === "properties" && (
				<>
					<path d="M2.5 5h3m3 0h5M2.5 11h6m3 0h2" {...s} />
					<circle cx="7" cy="5" r="1.5" {...s} />
					<circle cx="10" cy="11" r="1.5" {...s} />
				</>
			)}
			{name === "agent" && (
				<>
					<circle cx="3.5" cy="5" r="1.1" fill="currentColor" />
					<circle cx="3.5" cy="11" r="1.1" fill="currentColor" />
					<path d="M6.5 5h7M6.5 11h4.5" {...s} />
				</>
			)}
			{name === "help" && (
				<>
					<circle cx="8" cy="8" r="5.75" {...s} />
					<path d="M6.4 6.5a1.65 1.65 0 1 1 2.3 1.5c-.45.2-.7.55-.7 1v.3" {...s} />
					<circle cx="8" cy="11.1" r=".8" fill="currentColor" />
				</>
			)}
			{name === "cog" && (
				<>
					<circle cx="8" cy="8" r="2" {...s} />
					<path
						d="M8 1.75 9.3 3.3l2-.3.4 2 1.8 1L12.6 8l.9 2-1.8 1-.4 2-2-.3L8 14.25 6.7 12.7l-2 .3-.4-2-1.8-1 .9-2-.9-2 1.8-1 .4-2 2 .3Z"
						{...s}
					/>
				</>
			)}
			{name === "search" && (
				<>
					<circle cx="7" cy="7" r="4.25" {...s} />
					<path d="m10.25 10.25 3.25 3.25" {...s} />
				</>
			)}
			{name === "play" && <path d="M5 3.6v8.8a.5.5 0 0 0 .77.42l6.6-4.4a.5.5 0 0 0 0-.84l-6.6-4.4A.5.5 0 0 0 5 3.6Z" fill="currentColor" />}
			{name === "trash" && <path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.6 9h5.8l.6-9" {...s} />}
			{name === "copy" && (
				<>
					<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" {...s} />
					<path d="M10.5 3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1" {...s} />
				</>
			)}
			{name === "select" && (
				<path
					d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"
					{...s}
					strokeWidth={2.25}
				/>
			)}
			{name === "edit" && (
				<>
					<path
						d="M12.03 12.68a.5.5 0 0 1 .65-.65l9 3.5a.5.5 0 0 1-.03.95l-3.45 1.06a1 1 0 0 0-.66.66l-1.06 3.45a.5.5 0 0 1-.95.03z"
						{...s}
						strokeWidth={2.25}
					/>
					<path
						d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M3 9v1M21 9v1M3 14v1"
						{...s}
						strokeWidth={2.25}
					/>
				</>
			)}
			{name === "hand" && (
				<>
					<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" {...s} strokeWidth={2.25} />
					<path
						d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
						{...s}
						strokeWidth={2.25}
					/>
				</>
			)}
		</svg>
	);
}

/* ---------- primitives ---------- */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

function Button({
	kind = "secondary",
	icon,
	children,
	state,
	className,
}: {
	kind?: ButtonKind;
	icon?: IconName;
	children: ReactNode;
	state?: "hover";
	className?: string;
}) {
	return (
		<span
			className={cn(
				"a-body a-medium inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-3",
				kind === "primary" && "bg-(--a-ink) text-(--a-on-ink)",
				kind === "secondary" && "bg-(--a-field) text-(--a-text)",
				kind === "ghost" && "text-(--a-muted)",
				kind === "ghost" && state === "hover" && "bg-(--a-hover) text-(--a-text)",
				kind === "danger" && "bg-(--a-field) text-(--a-red-text)",
				icon && "pl-2.5",
				className,
			)}
		>
			{icon && <Icon name={icon} />}
			{children}
		</span>
	);
}

function IconButton({
	name,
	on,
	faint,
	className,
}: {
	name: IconName;
	on?: boolean;
	faint?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex size-8 shrink-0 items-center justify-center rounded-[8px]",
				on ? "bg-(--a-selected) text-(--a-text)" : faint ? "text-(--a-faint)" : "text-(--a-muted)",
				className,
			)}
		>
			<Icon name={name} />
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="a-mono inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-(--a-chip) px-1.5 text-(--a-muted)">
			{children}
		</kbd>
	);
}

function Dot() {
	return <span className="size-1.5 shrink-0 rounded-full bg-(--a-red)" />;
}

function SelectionChip({ label }: { label: string }) {
	return (
		<span className="a-mono inline-flex h-6 items-center gap-2 rounded-[4px] bg-(--a-chip) pl-2 pr-1.5 text-(--a-text)">
			<span className="h-3 w-0.5 rounded-full bg-(--a-red)" />
			{label}
			<Icon name="close" className="size-3 text-(--a-faint)" />
		</span>
	);
}

function SizeChip() {
	return (
		<span className="a-mono inline-flex h-5 items-center rounded-[4px] bg-(--a-red) px-1.5 text-(--a-on-red)">
			{frameSize.w} × {frameSize.h}
		</span>
	);
}

function Field({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn("flex h-8 min-w-0 items-center gap-2 rounded-[8px] bg-(--a-field) px-3 text-(--a-text)", className)}
		>
			{children}
		</span>
	);
}

function SearchField({ className }: { className?: string }) {
	return (
		<Field className={cn("w-60 pl-2.5 pr-1.5", className)}>
			<Icon name="search" className="text-(--a-faint)" />
			<span className="a-body flex-1 truncate text-(--a-faint)">{home.search}</span>
			<Kbd>{home.searchKey}</Kbd>
		</Field>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-5 w-8 shrink-0 items-center rounded-full",
				on ? "bg-(--a-red)" : "bg-(--a-selected)",
			)}
		>
			<span
				className={cn(
					"absolute size-4 rounded-full bg-[#ffffff] shadow-[0_1px_2px_rgb(0_0_0/0.25)]",
					on ? "left-3.5" : "left-0.5",
				)}
			/>
		</span>
	);
}

function Segmented({ items, active }: { items: string[]; active: number }) {
	return (
		<span className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-(--a-field) p-1">
			{items.map((item, i) => (
				<span
					key={item}
					className={cn(
						"a-body inline-flex h-6 items-center whitespace-nowrap rounded-[4px] px-2.5",
						i === active ? "bg-(--a-raised) text-(--a-text) shadow-(--a-float)" : "text-(--a-muted)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

/* ---------- window tab ---------- */

function WindowTab({ name, active, home: isHome }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"a-body inline-flex h-8 items-center gap-2 rounded-[8px] px-3",
				active ? "bg-(--a-selected) text-(--a-text)" : "text-(--a-muted)",
				active && !isHome && "pr-2",
			)}
		>
			{isHome && <Icon name="home" />}
			<span>{name}</span>
			{active && !isHome && <Icon name="close" className="ml-1 size-3.5 text-(--a-faint)" />}
		</span>
	);
}

function TopBar({ onHome }: { onHome?: boolean }) {
	return (
		<header className="flex shrink-0 items-center justify-between bg-(--a-chrome) px-2" style={{ height: TOP }}>
			<nav className="flex items-center gap-1">
				<WindowTab name="Home" home active={onHome} />
				<span className="w-2" />
				{tabs.map((t) => (
					<WindowTab key={t.name} name={t.name} active={!onHome && t.active} />
				))}
				<IconButton name="plus" faint />
			</nav>
			{!onHome && (
				<div className="flex items-center gap-1">
					<IconButton name="flows" on />
					<span className="a-mono inline-flex h-8 w-12 items-center justify-center text-(--a-muted)">{zoom}</span>
				</div>
			)}
		</header>
	);
}

/* ---------- pages rail ---------- */

type RowState = "rest" | "hover" | "selected";

function RailRow({
	kind,
	name,
	depth = 0,
	open,
	count,
	state = "rest",
	current,
	unseen,
}: {
	kind: "page" | "frame";
	name: string;
	depth?: 0 | 1;
	open?: boolean;
	count?: number;
	state?: RowState;
	current?: boolean;
	unseen?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex h-9 items-center rounded-[8px] pr-3",
				state === "hover" && "bg-(--a-hover)",
				state === "selected" && "bg-(--a-selected)",
				state === "rest" && !current ? "text-(--a-muted)" : "text-(--a-text)",
			)}
			style={{ paddingLeft: 8 + depth * 24 }}
		>
			{kind === "page" ? (
				<Icon name={open ? "down" : "right"} className="text-(--a-faint)" />
			) : (
				<span className="size-4 shrink-0" />
			)}
			<Icon
				name={kind === "page" ? "folder" : "file"}
				className={cn(
					"ml-1",
					state === "selected" ? "text-(--a-red)" : current ? "text-(--a-text)" : "text-(--a-faint)",
				)}
			/>
			<span className={cn("ml-2 flex-1 truncate", current ? "a-heading" : "a-body")}>{name}</span>
			{unseen ? <Dot /> : count !== undefined && <span className="a-mono text-(--a-faint)">{count}</span>}
		</div>
	);
}

function PagesRail() {
	return (
		<aside className="flex shrink-0 flex-col bg-(--a-chrome) px-2 pb-5" style={{ width: RAIL }}>
			<div className="flex h-12 items-center justify-between pl-3">
				<span className="flex items-baseline gap-2">
					<span className="a-heading">Pages</span>
					<span className="a-mono text-(--a-faint)">{pages.length}</span>
				</span>
				<span className="flex items-center">
					<IconButton name="plus" faint />
					<IconButton name="close" faint />
					<IconButton name="left" faint />
				</span>
			</div>
			<div className="mt-2 flex flex-col">
				{pages.map((p) => (
					<div key={p.name} className="flex flex-col">
						<RailRow kind="page" name={p.name} open={p.open} count={p.count} current={p.current} />
						{p.open &&
							p.frames.map((f) => (
								<RailRow
									key={f.name}
									kind="frame"
									name={f.name}
									depth={1}
									state={f.selected ? "selected" : "rest"}
									unseen={f.unseen}
								/>
							))}
					</div>
				))}
			</div>
			<div className="flex-1" />
			<span className="a-mono pl-3 text-(--a-faint)">{railHint}</span>
		</aside>
	);
}

/* ---------- canvas ---------- */

/* canvas-relative geometry: three 240×520 frames, 48 apart */
const FX = { cart: 24, menu: 312, receipt: 600 } as const;
const FY = 112;
const W = drawnSize.w;
const H = drawnSize.h;
/* the picked element inside cart: the first row of the cart screen */
const PICK = { x: 17, y: 49, w: 206, h: 28 };

function Canvas({ mode, width }: { mode: "properties" | "agent"; width: number }) {
	const editing = mode === "agent";
	return (
		<main className="relative min-w-0 flex-1 overflow-hidden bg-(--a-canvas)">
			<Flows />
			{canvasFrames.map((f) => {
				const selected = f.selected && !editing;
				return (
					<div key={f.name} className="absolute" style={{ left: FX[f.name], top: FY, width: W, height: H }}>
						<div
							className={cn(
								"a-caption absolute -top-6 flex h-4 w-full items-center gap-1.5",
								selected ? "text-(--a-red-text)" : "text-(--a-muted)",
							)}
						>
							<span>{f.name}</span>
							{"unseen" in f && f.unseen && <Dot />}
							{selected && (
								<span className="ml-auto flex items-center gap-1">
									<Icon name="play" className="size-3" />
									play
								</span>
							)}
						</div>
						<CoffeeScreen screen={f.screen} />
						{selected && <SelectionOutline />}
						{editing && f.name === element.frame && <PickedElement />}
					</div>
				);
			})}
			<Toolbar active={editing ? "edit" : "select"} center={width / 2} />
		</main>
	);
}

function SelectionOutline() {
	const handles = ["-left-[6px] -top-[6px]", "-right-[6px] -top-[6px]", "-left-[6px] -bottom-[6px]", "-right-[6px] -bottom-[6px]"];
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-(--a-red)" />
			{handles.map((h) => (
				<span key={h} className={cn("absolute size-[7px] rounded-[1px] border-[1.5px] border-(--a-red) bg-[#ffffff]", h)} />
			))}
			<div className="absolute top-[calc(100%+12px)] flex w-full justify-center">
				<SizeChip />
			</div>
		</>
	);
}

function PickedElement() {
	return (
		<div
			className="absolute rounded-[8px] border-[1.5px] border-(--a-red)"
			style={{ left: PICK.x - 3, top: PICK.y - 3, width: PICK.w + 6, height: PICK.h + 6 }}
		>
			<span className="a-caption a-medium absolute -top-[19px] -right-[1.5px] inline-flex h-4 items-center rounded-[4px] bg-(--a-red) px-1 text-(--a-on-red)">
				{element.kind}
			</span>
		</div>
	);
}

function Flows() {
	const c = { x: FX.cart, r: FX.cart + W };
	const m = { x: FX.menu, r: FX.menu + W };
	const r = { x: FX.receipt };
	const mid = FY + H / 2;
	const bottom = FY + H;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
			<defs>
				<marker id="airy-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
					<path d="M0.5 0.8 7.5 4 0.5 7.2Z" fill="var(--a-red)" />
				</marker>
			</defs>
			<g fill="none" stroke="var(--a-red)" strokeWidth="1.5" strokeLinecap="round">
				{/* menu → cart */}
				<path d={`M${m.x} ${mid} L${c.r + 8} ${mid}`} markerEnd="url(#airy-head)" />
				{/* cart → receipt, from Pay, under the row */}
				<path
					d={`M${c.x + 184} ${bottom + 4} C${c.x + 184} ${bottom + 84} ${r.x + 72} ${bottom + 84} ${r.x + 72} ${bottom + 8}`}
					markerEnd="url(#airy-head)"
				/>
				{/* receipt → menu, might */}
				<path d={`M${r.x} ${mid} L${m.r + 8} ${mid}`} strokeDasharray="4 4" markerEnd="url(#airy-head)" />
			</g>
		</svg>
	);
}

function Toolbar({ active, center }: { active: string; center: number }) {
	return (
		<div
			className="absolute bottom-6 flex -translate-x-1/2 items-center gap-1 rounded-[12px] bg-(--a-raised) p-1 shadow-(--a-float)"
			style={{ left: center }}
		>
			{tools.map((t) => (
				<IconButton key={t.name} name={t.name as IconName} on={t.name === active} />
			))}
		</div>
	);
}

/* ---------- right side ---------- */

function PanelHeader({ title, actions }: { title: string; actions: IconName[] }) {
	return (
		<div className="flex h-12 shrink-0 items-center justify-between pl-5 pr-3">
			<span className="a-title truncate">{title}</span>
			<span className="flex items-center">
				{actions.map((a) => (
					<IconButton key={a} name={a} faint />
				))}
			</span>
		</div>
	);
}

function SectionTitle({ title, source }: { title: string; source?: string }) {
	return (
		<div className="flex h-9 items-center justify-between">
			<span className="a-heading">{title}</span>
			{source && <span className="a-mono text-(--a-faint)">{source}</span>}
		</div>
	);
}

function PropertyRow({ label, value, unit = "px" }: { label: string; value: number | string; unit?: string }) {
	return (
		<div className="flex h-9 items-center gap-3">
			<span className="a-body w-4 text-(--a-muted)">{label}</span>
			<Field className="flex-1">
				<span className="a-mono flex-1 text-(--a-text)">{value}</span>
				<span className="a-mono text-(--a-faint)">{unit}</span>
			</Field>
		</div>
	);
}

function PropertiesPanel() {
	return (
		<aside className="flex shrink-0 flex-col bg-(--a-chrome)" style={{ width: PANEL.properties }}>
			<PanelHeader title={selection.name} actions={["dots", "right"]} />
			<div className="flex flex-col gap-6 px-5 pt-2">
				<section>
					<SectionTitle title="Position" source={selection.source} />
					<PropertyRow label="x" value={selection.x} />
					<PropertyRow label="y" value={selection.y} />
				</section>
				<section>
					<SectionTitle title="Size" source={selection.source} />
					<PropertyRow label="w" value={selection.w} />
					<PropertyRow label="h" value={selection.h} />
				</section>
			</div>
		</aside>
	);
}

function EditedFile({ path, added, removed }: { path: string; added: number; removed: number }) {
	return (
		<div className="flex h-9 items-center gap-2 rounded-[8px] bg-(--a-field) px-3">
			<Icon name="file" className="text-(--a-faint)" />
			<span className="a-mono flex-1 truncate text-(--a-text)">{path}</span>
			<span className="a-mono text-(--a-text)">+{added}</span>
			<span className="a-mono text-(--a-faint)">−{removed}</span>
		</div>
	);
}

function AgentPanel() {
	return (
		<aside className="flex shrink-0 flex-col bg-(--a-chrome)" style={{ width: PANEL.agent }}>
			<PanelHeader title={agent.title} actions={["right", "plus"]} />
			<div className="flex h-9 shrink-0 items-center justify-between px-5">
				<span className="a-body flex items-center gap-0.5 text-(--a-muted)">
					{agent.model}
					<Icon name="right" className="size-3.5 text-(--a-faint)" />
				</span>
				<span className="a-caption text-(--a-faint)">{agent.scope}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-5 pt-6">
				<div className="a-body ml-8 rounded-[8px] bg-(--a-field) px-3 py-2.5 text-(--a-text)">{agent.turn.ask}</div>
				<div className="flex flex-col gap-3">
					<p className="a-body text-(--a-text)">{agent.turn.said}</p>
					{agent.turn.edits.map((e) => (
						<EditedFile key={e.path} {...e} />
					))}
				</div>
			</div>
			<div className="shrink-0 px-5 pb-4">
				<div className="flex min-h-[112px] flex-col gap-3 rounded-[8px] bg-(--a-field) p-3">
					<span>
						<SelectionChip label={element.chip} />
					</span>
					<span className="a-body text-(--a-faint)">{agent.placeholder}</span>
				</div>
				<div className="mt-2 flex h-8 items-center justify-between">
					<span className="a-body -ml-0 text-(--a-muted)">{agent.account}</span>
					<span className="a-body flex items-center gap-0.5 text-(--a-muted)">
						{agent.mode}
						<Icon name="right" className="size-3.5 text-(--a-faint)" />
					</span>
				</div>
			</div>
		</aside>
	);
}

function PanelStrip({ active }: { active: "properties" | "agent" }) {
	return (
		<nav className="flex shrink-0 flex-col items-center gap-1 bg-(--a-chrome) pb-3 pt-2" style={{ width: STRIP }}>
			<IconButton name="properties" on={active === "properties"} />
			<IconButton name="agent" on={active === "agent"} />
			<span className="flex-1" />
			<IconButton name="help" faint />
			<IconButton name="cog" faint />
		</nav>
	);
}

/* ---------- screens ---------- */

function Shell({ appearance, children, className }: { appearance: Appearance; children: ReactNode; className?: string }) {
	return (
		<div
			data-appearance={appearance}
			className={cn("id-airy relative flex h-full w-full flex-col overflow-hidden bg-(--a-chrome)", className)}
		>
			{children}
		</div>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	const canvasWidth = 1440 - RAIL - STRIP - PANEL[panel];
	return (
		<Shell appearance={appearance}>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<PagesRail />
				<Canvas mode={panel} width={canvasWidth} />
				{panel === "properties" ? <PropertiesPanel /> : <AgentPanel />}
				<PanelStrip active={panel} />
			</div>
		</Shell>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<Shell appearance={appearance}>
			<TopBar onHome />
			<div className="flex min-h-0 flex-1">
				<aside className="flex shrink-0 flex-col bg-(--a-chrome) px-2 pb-3" style={{ width: RAIL }}>
					<div className="mt-8 flex h-8 items-center gap-2.5 pl-3">
						<SpoolMark className="h-5 w-4 text-(--a-red)" />
						<span className="text-[18px] font-semibold leading-6 tracking-[-0.02em]">spool</span>
					</div>
					<div className="mt-6 flex flex-col">
						{home.nav.map((n) => (
							<div key={n} className="a-body flex h-9 items-center gap-2 rounded-[8px] bg-(--a-selected) px-3">
								<Icon name="file" />
								{n}
							</div>
						))}
					</div>
					<div className="flex-1" />
					<div className="a-body flex h-9 items-center gap-2 rounded-[8px] px-3 text-(--a-muted)">
						<Icon name="cog" />
						{home.foot}
					</div>
				</aside>
				<main className="min-w-0 flex-1 overflow-hidden bg-(--a-chrome) px-10 pt-8">
					<div className="flex h-8 items-center justify-between">
						<h1 className="a-display">{home.title}</h1>
						<div className="flex items-center gap-2">
							<SearchField />
							<Button>{home.actions[0]}</Button>
							<Button>{home.actions[1]}</Button>
							<Button kind="primary" icon="plus">
								{home.actions[2]}
							</Button>
						</div>
					</div>
					<div className="mt-6 flex h-8 items-center justify-between">
						<span className="a-mono text-(--a-muted)">{home.count}</span>
						<span className="flex items-center gap-1">
							<span className="a-caption text-(--a-faint)">Sort by</span>
							<Button kind="ghost" className="gap-1 pr-2 text-(--a-text)">
								{home.sort}
								<Icon name="down" className="text-(--a-faint)" />
							</Button>
						</span>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-x-5 gap-y-8">
						{projects.map((p) => (
							<div key={p.name} className="flex flex-col gap-3">
								<div className="aspect-[16/10] overflow-hidden rounded-[8px] outline outline-1 -outline-offset-1 outline-(--a-hover)">
									<ProjectArtwork kind={p.art} className="h-full" />
								</div>
								<div className="flex flex-col gap-0.5">
									<span className="a-body a-medium">{p.name}</span>
									<span className="a-mono text-(--a-muted)">
										{p.frames} frames · {p.when}
									</span>
								</div>
							</div>
						))}
					</div>
				</main>
			</div>
		</Shell>
	);
}

/* ---------- parts ---------- */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<span className="a-caption text-(--a-faint)">{label}</span>
			{children}
		</section>
	);
}

const typeRoles = [
	{ cls: "a-display", name: "display", spec: "24/32 600", sample: "Projects" },
	{ cls: "a-title", name: "title", spec: "16/24 600", sample: "New chat" },
	{ cls: "a-heading", name: "heading", spec: "14/20 600", sample: "Position" },
	{ cls: "a-body", name: "body", spec: "14/20 400", sample: "say what to change" },
	{ cls: "a-caption", name: "caption", spec: "12/16 400", sample: "For this new chat" },
	{ cls: "a-mono", name: "mono", spec: "12/16 Fragment", sample: "frames/app/cart" },
];

const swatches: Record<Appearance, { name: string; hex: string; v: string }[]> = {
	dark: [
		{ name: "chrome", hex: "#1f1e1d", v: "--a-chrome" },
		{ name: "canvas", hex: "#292826", v: "--a-canvas" },
		{ name: "field", hex: "#2b2a28", v: "--a-field" },
		{ name: "raised", hex: "#33322f", v: "--a-raised" },
		{ name: "text", hex: "#eeece8", v: "--a-text" },
		{ name: "muted", hex: "#a7a39c", v: "--a-muted" },
		{ name: "faint", hex: "#7a766f", v: "--a-faint" },
		{ name: "red", hex: "#f5391a", v: "--a-red" },
	],
	light: [
		{ name: "chrome", hex: "#f7f6f3", v: "--a-chrome" },
		{ name: "canvas", hex: "#ebe9e4", v: "--a-canvas" },
		{ name: "field", hex: "#ecebe7", v: "--a-field" },
		{ name: "raised", hex: "#ffffff", v: "--a-raised" },
		{ name: "text", hex: "#1d1c1a", v: "--a-text" },
		{ name: "muted", hex: "#67635d", v: "--a-muted" },
		{ name: "faint", hex: "#85807a", v: "--a-faint" },
		{ name: "red", hex: "#f5391a", v: "--a-red" },
	],
};

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<Shell appearance={appearance} className="gap-3 px-6 py-5">
			<div className="flex h-6 shrink-0 items-center justify-between">
				<span className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-4 text-(--a-red)" />
					<span className="a-title">airy</span>
				</span>
				<span className="a-mono text-(--a-faint)">{appearance} · 4px grid · radius 8 · rows 36</span>
			</div>
			<div className="grid grid-cols-2 gap-x-6 gap-y-3">
				<Spec label="Type roles">
					<div className="flex flex-col gap-1">
						{typeRoles.map((t) => (
							<div key={t.name} className="flex items-baseline justify-between gap-3">
								<span className={cn(t.cls, "truncate")}>{t.sample}</span>
								<span className="a-mono shrink-0 text-(--a-faint)">
									{t.name} {t.spec}
								</span>
							</div>
						))}
					</div>
				</Spec>
				<Spec label="Palette">
					<div className="grid grid-cols-2 gap-x-4 gap-y-2">
						{swatches[appearance].map((sw) => (
							<div key={sw.name} className="flex h-6 items-center gap-2">
								<span
									className="size-6 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_var(--a-selected)]"
									style={{ background: `var(${sw.v})` }}
								/>
								<span className="a-caption flex-1">{sw.name}</span>
								<span className="a-mono text-(--a-faint)">{sw.hex}</span>
							</div>
						))}
					</div>
				</Spec>
				<Spec label="Buttons, 32 high">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<Button kind="primary">New project…</Button>
							<Button>Open…</Button>
							<Button kind="ghost">Cancel</Button>
						</div>
						<div className="flex items-center gap-2">
							<IconButton name="dots" />
							<IconButton name="flows" on />
							<Button kind="danger">Move to Trash</Button>
						</div>
					</div>
				</Spec>
				<Spec label="Input, search">
					<div className="flex flex-col gap-2">
						<Field className="w-full">
							<span className="a-mono flex-1">~/spool</span>
							<span className="a-body text-(--a-muted)">Change…</span>
						</Field>
						<SearchField className="w-full" />
					</div>
				</Spec>
				<Spec label="Segmented, toggle">
					<div className="flex items-center gap-4">
						<Segmented items={["Ask", "Only this Mac"]} active={0} />
						<Toggle on={false} />
						<Toggle on />
					</div>
				</Spec>
				<Spec label="Tabs: window, panel, tool">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-1">
							<WindowTab name="Home" home />
							<WindowTab name="kaffe" active />
							<WindowTab name="tvärsö" />
						</div>
						<div className="flex items-center gap-1">
							<IconButton name="properties" on />
							<IconButton name="agent" />
							<span className="w-4" />
							<span className="flex items-center gap-1 rounded-[12px] bg-(--a-raised) p-1 shadow-(--a-float)">
								{tools.map((t) => (
									<IconButton key={t.name} name={t.name as IconName} on={t.active} />
								))}
							</span>
						</div>
					</div>
				</Spec>
				<Spec label="Pages rail, 36 rows">
					<div className="grid grid-cols-[64px_1fr] items-center">
						{(
							[
								["current", <RailRow key="a" kind="page" name="app" open count={3} current />],
								["rest", <RailRow key="b" kind="frame" name="menu" depth={1} />],
								["hover", <RailRow key="c" kind="frame" name="annotate" depth={1} state="hover" />],
								["selected", <RailRow key="d" kind="frame" name="cart" depth={1} state="selected" />],
								["unseen", <RailRow key="e" kind="frame" name="receipt" depth={1} unseen />],
							] as const
						).map(([state, row]) => (
							<div key={state} className="contents">
								<span className="a-mono text-(--a-faint)">{state}</span>
								{row}
							</div>
						))}
					</div>
				</Spec>
				<Spec label="Context menu">
					<div className="flex w-[216px] flex-col rounded-[12px] bg-(--a-raised) p-1 shadow-(--a-float)">
						{menuItems.map((m, i) => (
							<div key={m.label} className="flex flex-col">
								{m.danger && <span className="h-2" />}
								<div
									className={cn(
										"a-body flex h-8 items-center justify-between rounded-[8px] px-3",
										i === 0 && "bg-(--a-selected)",
										m.danger ? "text-(--a-red-text)" : "text-(--a-text)",
									)}
								>
									{m.label}
									<span className={cn("a-mono", m.danger ? "text-(--a-red-text)" : "text-(--a-faint)")}>
										{m.key}
									</span>
								</div>
							</div>
						))}
					</div>
				</Spec>
				<Spec label="Property row">
					<div>
						<SectionTitle title="Position" source={selection.source} />
						<PropertyRow label="x" value={selection.x} />
					</div>
				</Spec>
				<Spec label="Toast, tooltip">
					<div className="flex items-center gap-4">
						<div className="flex h-10 items-center gap-3 whitespace-nowrap rounded-[12px] bg-(--a-raised) pl-4 pr-1 shadow-(--a-float)">
							<span className="a-body">{toast.text}</span>
							<Button kind="ghost" className="text-(--a-text)">
								{toast.action}
							</Button>
						</div>
						<span className="a-caption inline-flex h-6 items-center gap-2 whitespace-nowrap rounded-[4px] bg-(--a-raised) px-2 shadow-(--a-float)">
							Select
							<span className="a-mono text-(--a-faint)">V</span>
						</span>
					</div>
				</Spec>
				<Spec label="Settings row">
					<div className="flex items-start justify-between gap-6">
						<span className="flex flex-col gap-1">
							<span className="a-body">{settingsRow.title}</span>
							<span className="a-caption max-w-[232px] text-(--a-muted)">{settingsRow.detail}</span>
						</span>
						<Toggle on />
					</div>
				</Spec>
				<Spec label="Chips: count, size, selection">
					<div className="flex items-center gap-2">
						<span className="a-mono inline-flex h-5 items-center rounded-[4px] bg-(--a-chip) px-1.5 text-(--a-muted)">
							3
						</span>
						<SizeChip />
						<SelectionChip label={element.chip} />
					</div>
				</Spec>
			</div>
		</Shell>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-full w-full">
			<div className="h-full w-1/2">
				<Board appearance="dark" />
			</div>
			<div className="h-full w-1/2">
				<Board appearance="light" />
			</div>
		</div>
	);
}
