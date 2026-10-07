import type { ReactNode } from "react";
import {
	type Appearance,
	agent,
	canvasFrames,
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
import "./sans.css";

/*
 * sans: the consumer-modern reading of spool. One family, Instrument Sans, for every word
 * in the chrome, tabular figures for every number; Fragment Mono only where a path or code
 * is the subject. Hierarchy comes from weight and the three text steps, never from a
 * second typeface.
 *
 * The rules the Parts sheet shows:
 * - 4px grid. Bars are 40 tall, every list row 30, every control 30 (28 inside a bar).
 * - Text sits on one line 16px in from a panel's edge; rows are inset 8 and pad 8.
 * - Radius: 8 on what holds things, 6 on what you press, 4 on what sits inside a line.
 *   Round only for switches and dots.
 * - Flat: chrome is one surface split by hairlines. Only floating things (toolbar, menu,
 *   toast, tooltip) are raised, and they share one shadow.
 * - Neutral fills say where you are in the chrome (tab, tool, row, panel).
 *   Red says what is selected, on, linked or new in the work.
 */

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- icons: one set, 16px box, 1.4 stroke, round joins ---------- */

const line = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.4,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

type IconName =
	| "home"
	| "plus"
	| "close"
	| "right"
	| "down"
	| "left"
	| "folder"
	| "file"
	| "flows"
	| "select"
	| "edit"
	| "hand"
	| "dots"
	| "properties"
	| "agent"
	| "help"
	| "cog"
	| "search"
	| "play"
	| "grid";

function Icon({ name, className }: { name: IconName; className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true">
			{glyph(name)}
		</svg>
	);
}

function glyph(name: IconName): ReactNode {
	switch (name) {
		case "home":
			return <path d="M2.75 7.25 8 3l5.25 4.25V13a.5.5 0 0 1-.5.5H9.75v-3.5h-3.5v3.5H3.25a.5.5 0 0 1-.5-.5z" {...line} />;
		case "plus":
			return <path d="M8 3.5v9M3.5 8h9" {...line} />;
		case "close":
			return <path d="m4.75 4.75 6.5 6.5m0-6.5-6.5 6.5" {...line} />;
		case "right":
			return <path d="m6.5 4 4 4-4 4" {...line} />;
		case "down":
			return <path d="m4 6.5 4 4 4-4" {...line} />;
		case "left":
			return <path d="m9.5 4-4 4 4 4" {...line} />;
		case "folder":
			return (
				<path
					d="M2.25 4.5a1 1 0 0 1 1-1h2.9l1.4 1.5h5.2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1z"
					{...line}
				/>
			);
		case "file":
			return (
				<>
					<path d="M4.25 2.25h4.6l2.9 2.9v8.1a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V2.75a.5.5 0 0 1 .5-.5z" {...line} />
					<path d="M8.75 2.25v3h3" {...line} />
				</>
			);
		case "flows":
			return (
				<>
					<circle cx="4.5" cy="4.5" r="1.9" {...line} />
					<circle cx="11.5" cy="11.5" r="1.9" {...line} />
					<path d="m5.9 5.9 4.2 4.2" {...line} />
				</>
			);
		case "select":
			return <path d="M4 2.75 12.25 7.6l-3.7 1-1.8 3.65z" {...line} fill="currentColor" />;
		case "edit":
			return (
				<>
					<path
						d="M2.75 5V3.75a1 1 0 0 1 1-1H5m3 0h1.5m2.25 0h.5a1 1 0 0 1 1 1V5M2.75 8v1.5m0 2.25v.5a1 1 0 0 0 1 1H5"
						{...line}
					/>
					<path d="m8 8 5.5 2.1-2.4.8-.85 2.4z" {...line} fill="currentColor" />
				</>
			);
		case "hand":
			return (
				<path
					d="M5.5 8.5V4a1 1 0 0 1 2 0v3.5m0-.25V3a1 1 0 0 1 2 0v4.25m0-.25V4a1 1 0 0 1 2 0v5.25a4.25 4.25 0 0 1-4.25 4.25h-.4a4 4 0 0 1-3.1-1.5L2.3 9.9a1 1 0 0 1 1.5-1.3L5.5 10.3"
					{...line}
				/>
			);
		case "dots":
			return (
				<>
					<circle cx="3.75" cy="8" r="1.1" fill="currentColor" />
					<circle cx="8" cy="8" r="1.1" fill="currentColor" />
					<circle cx="12.25" cy="8" r="1.1" fill="currentColor" />
				</>
			);
		case "properties":
			return (
				<>
					<path d="M2.75 5h5.5m3.5 0h1.5M2.75 11h1.5m3.5 0h5.5" {...line} />
					<circle cx="10" cy="5" r="1.75" {...line} />
					<circle cx="6" cy="11" r="1.75" {...line} />
				</>
			);
		case "agent":
			return (
				<path
					d="M2.75 4a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7.5l-3 2.25V11h-.75a1 1 0 0 1-1-1z"
					{...line}
				/>
			);
		case "help":
			return (
				<>
					<circle cx="8" cy="8" r="5.75" {...line} />
					<path d="M6.4 6.4a1.65 1.65 0 1 1 2.35 1.5c-.45.22-.75.55-.75 1.05v.3" {...line} />
					<circle cx="8" cy="11.1" r=".8" fill="currentColor" />
				</>
			);
		case "cog":
			return (
				<>
					<path
						d="M13.23 6.66 14.4 7v2l-1.17.34-.58 1.41.6 1.07-1.42 1.42-1.07-.6-1.41.58L9 14.4H7l-.34-1.17-1.41-.58-1.07.6-1.42-1.42.6-1.07-.58-1.41L1.6 9V7l1.17-.34.58-1.41-.6-1.07 1.42-1.42 1.07.6 1.41-.58L7 1.6h2l.34 1.17 1.41.58 1.07-.6 1.42 1.42-.6 1.07z"
						{...line}
					/>
					<circle cx="8" cy="8" r="2" {...line} />
				</>
			);
		case "search":
			return (
				<>
					<circle cx="7.25" cy="7.25" r="4.25" {...line} />
					<path d="m10.5 10.5 3 3" {...line} />
				</>
			);
		case "play":
			return <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />;
		case "grid":
			return (
				<>
					<rect x="2.75" y="2.75" width="4.5" height="4.5" rx="1" {...line} />
					<rect x="8.75" y="2.75" width="4.5" height="4.5" rx="1" {...line} />
					<rect x="2.75" y="8.75" width="4.5" height="4.5" rx="1" {...line} />
					<rect x="8.75" y="8.75" width="4.5" height="4.5" rx="1" {...line} />
				</>
			);
	}
}

/* ---------- primitives ---------- */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

const buttonKind: Record<ButtonKind, string> = {
	primary: "bg-(--s-primary) text-(--s-on-primary)",
	secondary: "border border-(--s-line-strong) bg-(--s-field) text-(--s-text)",
	ghost: "text-(--s-text-2)",
	danger: "bg-(--s-thread) text-(--s-on-thread)",
};

function Button({
	kind = "secondary",
	icon,
	children,
	className,
}: {
	kind?: ButtonKind;
	icon?: IconName;
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"s-body inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-[6px] px-3 font-medium whitespace-nowrap",
				icon && "pl-2.5",
				buttonKind[kind],
				className,
			)}
		>
			{icon && <Icon name={icon} />}
			{children}
		</span>
	);
}

/** A square button holding one icon: 28 in a bar, 24 in a header. */
function IconButton({
	name,
	size = 28,
	state,
	className,
}: {
	name: IconName;
	size?: 24 | 28 | 30;
	state?: "rest" | "active" | "on";
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-[6px]",
				size === 24 ? "size-6" : size === 28 ? "size-7" : "size-7.5",
				state === "active"
					? "bg-(--s-selected) text-(--s-text)"
					: state === "on"
						? "text-(--s-thread-text)"
						: "text-(--s-text-3)",
				className,
			)}
		>
			<Icon name={name} />
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="s-micro inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] border border-(--s-line-strong) px-1 text-(--s-text-3)">
			{children}
		</span>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-block h-4 w-7 shrink-0 rounded-full",
				on ? "bg-(--s-thread)" : "bg-(--s-text-3)/70",
			)}
		>
			<span
				className={cn(
					"absolute top-0.5 size-3 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)]",
					on ? "left-3.5" : "left-0.5",
				)}
			/>
		</span>
	);
}

function Segmented({ items, active }: { items: string[]; active: number }) {
	return (
		<span className="inline-flex h-7.5 items-center gap-0.5 rounded-[6px] bg-(--s-hover) p-0.5 ring-1 ring-(--s-line) ring-inset">
			{items.map((item, i) => (
				<span
					key={item}
					className={cn(
						"s-caption flex h-6.5 items-center rounded-[4px] px-2.5 font-medium",
						i === active
							? "bg-(--s-raised) text-(--s-text) shadow-[0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-(--s-line-strong) ring-inset"
							: "text-(--s-text-2)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

function CountChip({ children }: { children: ReactNode }) {
	return (
		<span className="s-micro inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] bg-(--s-selected) px-1.5 text-(--s-text-2)">
			{children}
		</span>
	);
}

/** The selection as the composer carries it: a red tick, the path, a close. */
function SelectionChip({ label }: { label: string }) {
	return (
		<span className="inline-flex h-6 items-center gap-1.5 rounded-[4px] bg-(--s-selected) pr-1 pl-2">
			<span className="h-3 w-0.5 rounded-full bg-(--s-thread)" />
			<span className="s-code whitespace-nowrap text-(--s-text)">{label}</span>
			<Icon name="close" className="size-3.5 text-(--s-text-3)" />
		</span>
	);
}

function SizeChip() {
	return (
		<span className="s-micro inline-flex h-5 items-center rounded-[4px] bg-(--s-thread) px-1.5 whitespace-nowrap text-(--s-on-thread)">
			{frameSize.w} × {frameSize.h}
		</span>
	);
}

function KindTag({ children }: { children: ReactNode }) {
	return (
		<span className="s-micro inline-flex h-4 items-center rounded-[4px] bg-(--s-thread) px-1.5 text-(--s-on-thread)">
			{children}
		</span>
	);
}

function UnseenDot() {
	return <span className="size-1.5 shrink-0 rounded-full bg-(--s-thread)" />;
}

const floating = "border border-(--s-line) bg-(--s-raised) shadow-(--s-float)";

/* ---------- rows ---------- */

type RowState = "rest" | "hover" | "selected";

/** One row of the pages rail. 30 tall, inset 8, padded 8. */
function PageRow({
	depth,
	kind,
	name,
	open,
	current,
	count,
	unseen,
	state = "rest",
}: {
	depth: 0 | 1;
	kind: "page" | "frame";
	name: string;
	open?: boolean;
	current?: boolean;
	count?: number;
	unseen?: boolean;
	state?: RowState;
}) {
	return (
		<div
			className={cn(
				"mx-2 flex h-7.5 items-center gap-2 rounded-[6px] pr-2",
				depth === 0 ? "pl-1" : "pl-9",
				state === "hover" && "bg-(--s-hover)",
				state === "selected" && "bg-(--s-selected)",
			)}
		>
			{kind === "page" && (
				<Icon name={open ? "down" : "right"} className="-mr-1 size-3.5 text-(--s-text-3)" />
			)}
			<Icon
				name={kind === "page" ? "folder" : "file"}
				className={cn(current ? "text-(--s-thread-text)" : "text-(--s-text-3)")}
			/>
			<span
				className={cn(
					"s-body min-w-0 flex-1 truncate",
					state === "selected" || current ? "font-medium text-(--s-text)" : "text-(--s-text-2)",
				)}
			>
				{name}
			</span>
			{unseen && <UnseenDot />}
			{count !== undefined && <span className="s-caption text-(--s-text-3)">{count}</span>}
		</div>
	);
}

/** One geometry row: a letter, the value, its unit. */
function PropertyRow({ label, value }: { label: string; value: number }) {
	return (
		<div className="mx-2 flex h-7.5 items-center rounded-[6px] px-2">
			<span className="s-caption w-6 text-(--s-text-3)">{label}</span>
			<span className="s-body flex-1 text-(--s-text)">{value}</span>
			<span className="s-caption text-(--s-text-3)">px</span>
		</div>
	);
}

function SectionHead({ title, source }: { title: string; source?: string }) {
	return (
		<div className="flex h-7.5 items-center justify-between px-4">
			<span className="s-caption font-medium text-(--s-text-2)">{title}</span>
			{source && <span className="s-code text-(--s-text-3)">{source}</span>}
		</div>
	);
}

/* ---------- the window ---------- */

function WindowTab({ name, active, onHome }: { name: string; active?: boolean; onHome?: boolean }) {
	return (
		<span
			className={cn(
				"s-body flex h-7 items-center gap-2 rounded-[6px] px-2.5",
				!onHome && "w-32",
				active ? "bg-(--s-selected) font-medium text-(--s-text)" : "text-(--s-text-2)",
			)}
		>
			{onHome && <Icon name="home" className={active ? "text-(--s-text)" : "text-(--s-text-3)"} />}
			<span className="min-w-0 flex-1 truncate">{name}</span>
			{active && !onHome && <Icon name="close" className="size-3.5 text-(--s-text-3)" />}
		</span>
	);
}

function TopBar({ onHome }: { onHome?: boolean }) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-(--s-line) bg-(--s-bg) px-1.5">
			<WindowTab name="Home" onHome active={onHome} />
			<span className="mx-1.5 h-4 w-px bg-(--s-line-strong)" />
			{tabs.map((t) => (
				<WindowTab key={t.name} name={t.name} active={!onHome && t.active} />
			))}
			<IconButton name="plus" />
			<div className="flex-1" />
			{!onHome && (
				<>
					<IconButton name="flows" state="on" />
					<span className="s-caption flex h-7 w-12 items-center justify-end pr-2.5 text-(--s-text-2)">{zoom}</span>
				</>
			)}
		</div>
	);
}

function PagesRail() {
	return (
		<aside className="flex w-60 shrink-0 flex-col border-r border-(--s-line) bg-(--s-bg)">
			<div className="flex h-10 shrink-0 items-center gap-1.5 pr-2 pl-4">
				<span className="s-heading">Pages</span>
				<span className="s-caption text-(--s-text-3)">{pages.length}</span>
				<div className="flex-1" />
				<IconButton name="plus" size={24} />
				<IconButton name="close" size={24} />
				<IconButton name="left" size={24} />
			</div>
			<div className="flex flex-col pt-1">
				{pages.map((page) => (
					<div key={page.name} className="flex flex-col">
						<PageRow
							depth={0}
							kind="page"
							name={page.name}
							open={page.open}
							current={page.current}
							count={page.count}
						/>
						{page.open &&
							page.frames.map((f) => (
								<PageRow
									key={f.name}
									depth={1}
									kind="frame"
									name={f.name}
									unseen={f.unseen}
									state={f.selected ? "selected" : "rest"}
								/>
							))}
					</div>
				))}
			</div>
			<div className="flex-1" />
			<div className="flex h-10 shrink-0 items-center border-t border-(--s-line) px-4">
				<span className="s-caption text-(--s-text-3)">{sentence(railHint)}</span>
			</div>
		</aside>
	);
}

/* canvas geometry, in canvas-local pixels */
const FRAME_W = 240;
const FRAME_H = 520;
const FRAME_TOP = 168;
const FRAME_X = { cart: 28, menu: 308, receipt: 588 } as const;
/** the picked element: the first cart row, as CoffeeScreen lays it out at 240×520 */
const PICK = { x: 16, y: 50, w: 208, h: 28 };

function FrameLabel({ name, selected, unseen }: { name: string; selected?: boolean; unseen?: boolean }) {
	return (
		<div
			className="absolute flex h-4 items-center gap-1.5"
			style={{ left: FRAME_X[name as keyof typeof FRAME_X], top: FRAME_TOP - 24, width: FRAME_W }}
		>
			<span
				className={cn(
					"s-caption font-medium",
					selected ? "text-(--s-thread-text)" : "text-(--s-text-2)",
				)}
			>
				{name}
			</span>
			{unseen && <UnseenDot />}
			<div className="flex-1" />
			{selected && (
				<span className="s-caption flex items-center gap-1 font-medium text-(--s-thread-text)">
					<Icon name="play" className="size-3" />
					Play
				</span>
			)}
		</div>
	);
}

function Flows() {
	const head = (x: number, y: number, dir: "left" | "up") =>
		dir === "left" ? `M${x} ${y} l7 -3.5 v7 z` : `M${x} ${y} l-3.5 7 h7 z`;
	const cartRight = FRAME_X.cart + FRAME_W;
	const menuRight = FRAME_X.menu + FRAME_W;
	const bottom = FRAME_TOP + FRAME_H;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
			<g fill="none" stroke="var(--s-thread)" strokeWidth={1.5} strokeLinecap="round">
				{/* menu → cart, Checkout */}
				<path d={`M${FRAME_X.menu} ${bottom - 32} C ${FRAME_X.menu - 22} ${bottom - 32}, ${cartRight + 22} ${bottom - 88}, ${cartRight + 7} ${bottom - 88}`} />
				{/* cart → receipt, Pay */}
				<path d={`M${FRAME_X.cart + 196} ${bottom} C ${FRAME_X.cart + 196} ${bottom + 80}, ${FRAME_X.receipt + 120} ${bottom + 80}, ${FRAME_X.receipt + 120} ${bottom + 7}`} />
				{/* receipt → menu, might */}
				<path
					strokeDasharray="4 4"
					d={`M${FRAME_X.receipt} ${FRAME_TOP + 220} C ${FRAME_X.receipt - 22} ${FRAME_TOP + 220}, ${menuRight + 22} ${FRAME_TOP + 272}, ${menuRight + 7} ${FRAME_TOP + 272}`}
				/>
			</g>
			<g fill="var(--s-thread)">
				<path d={head(cartRight, bottom - 88, "left")} />
				<path d={head(FRAME_X.receipt + 120, bottom, "up")} />
				<path d={head(menuRight, FRAME_TOP + 272, "left")} />
			</g>
		</svg>
	);
}

function Handle({ x, y }: { x: number; y: number }) {
	return (
		<span
			className="absolute size-[7px] rounded-[1px] border-[1.5px] border-(--s-thread) bg-white"
			style={{ left: x - 3.5, top: y - 3.5 }}
		/>
	);
}

function Toolbar({ active }: { active: string }) {
	return (
		<div className={cn("absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-[8px] p-1", floating)}>
			{tools.map((t) => (
				<IconButton
					key={t.name}
					name={t.name as IconName}
					state={t.name === active ? "active" : "rest"}
					className={t.name === active ? undefined : "text-(--s-text-2)"}
				/>
			))}
		</div>
	);
}

function Canvas({ mode }: { mode: "select" | "edit" }) {
	const picking = mode === "edit";
	return (
		<main className="relative min-w-0 flex-1 overflow-hidden bg-(--s-canvas)">
			<Flows />
			{canvasFrames.map((f) => {
				const selected = !picking && "selected" in f && f.selected;
				const unseen = "unseen" in f && f.unseen;
				const x = FRAME_X[f.name];
				return (
					<div key={f.name}>
						<FrameLabel name={f.name} selected={selected} unseen={unseen} />
						<div
							className="absolute [font-variant-numeric:normal]"
							style={{ left: x, top: FRAME_TOP, width: FRAME_W, height: FRAME_H }}
						>
							<CoffeeScreen screen={f.screen} />
						</div>
						{selected && (
							<>
								<span
									className="pointer-events-none absolute rounded-[9px] border-[1.5px] border-(--s-thread)"
									style={{ left: x - 1, top: FRAME_TOP - 1, width: FRAME_W + 2, height: FRAME_H + 2 }}
								/>
								<Handle x={x} y={FRAME_TOP} />
								<Handle x={x + FRAME_W} y={FRAME_TOP} />
								<Handle x={x} y={FRAME_TOP + FRAME_H} />
								<Handle x={x + FRAME_W} y={FRAME_TOP + FRAME_H} />
								<div
									className="absolute flex justify-center"
									style={{ left: x, top: FRAME_TOP + FRAME_H + 10, width: FRAME_W }}
								>
									<SizeChip />
								</div>
							</>
						)}
						{picking && f.name === element.frame && (
							<>
								<span
									className="pointer-events-none absolute rounded-[6px] border-[1.5px] border-(--s-thread)"
									style={{
										left: x + PICK.x - 2,
										top: FRAME_TOP + PICK.y - 2,
										width: PICK.w + 4,
										height: PICK.h + 4,
									}}
								/>
								<span
									className="absolute flex justify-end"
									style={{ left: x + PICK.x - 2, top: FRAME_TOP + PICK.y - 19, width: PICK.w + 4 }}
								>
									<KindTag>{element.kind}</KindTag>
								</span>
							</>
						)}
					</div>
				);
			})}
			<Toolbar active={picking ? "edit" : "select"} />
		</main>
	);
}

function PanelHeader({ children, actions }: { children: ReactNode; actions: ReactNode }) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-1 border-b border-(--s-line) pr-2 pl-4">
			{children}
			<div className="flex-1" />
			{actions}
		</div>
	);
}

function PropertiesPanel() {
	return (
		<aside className="flex w-75 shrink-0 flex-col border-l border-(--s-line) bg-(--s-bg)">
			<PanelHeader
				actions={
					<>
						<IconButton name="dots" size={24} />
						<IconButton name="right" size={24} />
					</>
				}
			>
				<span className="s-heading">{selection.name}</span>
			</PanelHeader>
			<div className="flex flex-col py-1">
				<SectionHead title="Position" source={selection.source} />
				<PropertyRow label="X" value={selection.x} />
				<PropertyRow label="Y" value={selection.y} />
			</div>
			<div className="flex flex-col border-t border-(--s-line) py-1">
				<SectionHead title="Size" source={selection.source} />
				<PropertyRow label="W" value={selection.w} />
				<PropertyRow label="H" value={selection.h} />
			</div>
		</aside>
	);
}

function EditedFile({ path, added, removed }: { path: string; added: number; removed: number }) {
	return (
		<div className="flex h-7.5 items-center gap-2 rounded-[6px] border border-(--s-line) px-2">
			<Icon name="file" className="text-(--s-text-3)" />
			<span className="s-code min-w-0 flex-1 truncate text-(--s-text-2)">{path}</span>
			<span className="s-caption font-medium text-(--s-text)">+{added}</span>
			<span className="s-caption text-(--s-text-3)">−{removed}</span>
		</div>
	);
}

function AgentPanel() {
	return (
		<aside className="flex w-75 shrink-0 flex-col border-l border-(--s-line) bg-(--s-bg)">
			<PanelHeader
				actions={
					<>
						<IconButton name="plus" size={24} />
						<IconButton name="right" size={24} />
					</>
				}
			>
				<span className="s-heading">{agent.title}</span>
				<Icon name="down" className="size-3.5 text-(--s-text-3)" />
			</PanelHeader>
			<div className="flex h-7.5 shrink-0 items-center justify-between border-b border-(--s-line) pr-4 pl-4">
				<span className="s-caption flex items-center gap-0.5 font-medium text-(--s-text-2)">
					{agent.model}
					<Icon name="right" className="size-3 text-(--s-text-3)" />
				</span>
				<span className="s-caption text-(--s-text-3)">{agent.scope}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-4 pb-4">
				<div className="ml-8 self-end rounded-[8px] bg-(--s-selected) px-3 py-2">
					<p className="s-body text-(--s-text)">{agent.turn.ask}</p>
				</div>
				<div className="flex flex-col gap-2">
					<span className="s-caption flex items-center gap-1.5 font-medium text-(--s-text-2)">
						<SpoolMark className="h-3.5 w-3 text-(--s-thread)" />
						spool
					</span>
					<p className="s-body text-(--s-text)">{agent.turn.said}</p>
					{agent.turn.edits.map((e) => (
						<EditedFile key={e.path} {...e} />
					))}
				</div>
			</div>
			<div className="flex shrink-0 flex-col gap-1 px-3 pb-2">
				<div className="flex min-h-28 flex-col gap-2 rounded-[8px] border border-(--s-line-strong) bg-(--s-field) p-2">
					<div className="flex">
						<SelectionChip label={element.chip} />
					</div>
					<span className="s-body px-1 text-(--s-text-3)">{sentence(agent.placeholder)}</span>
				</div>
				<div className="flex h-7.5 items-center justify-between px-1">
					<span className="s-caption font-medium text-(--s-text-2)">{agent.account}</span>
					<span className="s-caption flex items-center gap-0.5 font-medium text-(--s-text-2)">
						{sentence(agent.mode)}
						<Icon name="right" className="size-3 text-(--s-text-3)" />
					</span>
				</div>
			</div>
		</aside>
	);
}

function PanelRail({ panel }: { panel: "properties" | "agent" }) {
	return (
		<nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-(--s-line) bg-(--s-bg) pt-1.5 pb-2">
			<IconButton name="properties" state={panel === "properties" ? "active" : "rest"} />
			<IconButton name="agent" state={panel === "agent" ? "active" : "rest"} />
			<div className="flex-1" />
			<IconButton name="help" />
			<IconButton name="cog" />
		</nav>
	);
}

export function IdentityCanvas({
	appearance,
	panel,
}: {
	appearance: Appearance;
	panel: "properties" | "agent";
}) {
	return (
		<div
			className="id-sans flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--s-bg)"
			data-appearance={appearance}
		>
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<PagesRail />
				<Canvas mode={panel === "agent" ? "edit" : "select"} />
				{panel === "properties" ? <PropertiesPanel /> : <AgentPanel />}
				<PanelRail panel={panel} />
			</div>
		</div>
	);
}

/* ---------- Home ---------- */

function SearchField({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"flex h-7.5 items-center gap-2 rounded-[6px] border border-(--s-line-strong) bg-(--s-field) pr-1.5 pl-2.5",
				className,
			)}
		>
			<Icon name="search" className="size-3.5 text-(--s-text-3)" />
			<span className="s-body flex-1 text-(--s-text-3)">{home.search}</span>
			<Kbd>{home.searchKey}</Kbd>
		</span>
	);
}

function NavRow({ icon, label, selected }: { icon: IconName; label: string; selected?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-7.5 items-center gap-2 rounded-[6px] px-2",
				selected ? "bg-(--s-selected) font-medium text-(--s-text)" : "text-(--s-text-2)",
			)}
		>
			<Icon name={icon} className={selected ? "text-(--s-text)" : "text-(--s-text-3)"} />
			<span className="s-body">{label}</span>
		</div>
	);
}

function Wordmark() {
	return (
		<span className="flex items-center gap-2">
			<SpoolMark className="h-5 w-4 text-(--s-thread)" />
			<span className="text-[18px] leading-6 font-semibold tracking-[-0.02em]">spool</span>
		</span>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-sans flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--s-bg)"
			data-appearance={appearance}
		>
			<TopBar onHome />
			<div className="flex min-h-0 flex-1">
				<nav className="flex w-60 shrink-0 flex-col border-r border-(--s-line) px-2 pt-5 pb-2">
					<div className="mb-4 flex h-7.5 items-center px-2">
						<Wordmark />
					</div>
					{home.nav.map((n) => (
						<NavRow key={n} icon="grid" label={n} selected />
					))}
					<div className="flex-1" />
					<NavRow icon="cog" label={home.foot} />
				</nav>
				<main className="flex min-w-0 flex-1 flex-col px-10 pt-8">
					<div className="flex h-7.5 items-center gap-2">
						<h1 className="s-title flex-1">{home.title}</h1>
						<SearchField className="mr-2 w-60" />
						<Button>{home.actions[0]}</Button>
						<Button>{home.actions[1]}</Button>
						<Button kind="primary" icon="plus">
							{home.actions[2]}
						</Button>
					</div>
					<div className="mt-6 flex h-7.5 items-center justify-between">
						<span className="s-caption text-(--s-text-3)">{home.count}</span>
						<span className="flex items-center gap-1">
							<span className="s-caption text-(--s-text-3)">Sort by</span>
							<span className="s-caption flex h-6 items-center gap-1 rounded-[6px] px-1.5 font-medium text-(--s-text)">
								{home.sort}
								<Icon name="down" className="size-3 text-(--s-text-3)" />
							</span>
						</span>
					</div>
					<div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-8">
						{projects.map((p) => (
							<div key={p.name} className="flex flex-col gap-3">
								<div className="aspect-[1.82] overflow-hidden rounded-[8px] border border-(--s-line) bg-(--s-canvas)">
									{p.art !== "blank" && <ProjectArtwork kind={p.art} className="h-full w-full" />}
								</div>
								<div className="flex flex-col px-0.5">
									<span className="s-body font-medium">{p.name}</span>
									<span className="s-caption text-(--s-text-3)">
										{p.frames} frames · {p.when}
									</span>
								</div>
							</div>
						))}
					</div>
				</main>
			</div>
		</div>
	);
}

/* ---------- Parts ---------- */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<span className="s-micro text-(--s-text-3)">{label}</span>
			{children}
		</section>
	);
}

const roles = [
	{ name: "Title", spec: "22/28 · 600", cls: "s-title", sample: "Projects" },
	{ name: "Heading", spec: "13/20 · 600", cls: "s-heading", sample: "Pages" },
	{ name: "Body", spec: "13/20 · 400", cls: "s-body", sample: "Say what to change" },
	{ name: "Caption", spec: "12/16 · 400", cls: "s-caption", sample: "18 frames · 2 hours ago" },
	{ name: "Micro", spec: "11/14 · 500", cls: "s-micro", sample: "390 × 844" },
	{ name: "Code", spec: "12/16 · mono", cls: "s-code", sample: "frames/app/cart" },
];

const swatches = (appearance: Appearance) =>
	appearance === "dark"
		? [
				["canvas", "#121211"],
				["bg", "#1b1a19"],
				["raised", "#252422"],
				["line", "#2b2a28"],
				["line-strong", "#3b3936"],
				["text", "#f0efed"],
				["text-2", "#aeaba5"],
				["text-3", "#7d7a75"],
				["thread", "#f5391a"],
			]
		: [
				["canvas", "#ebeae6"],
				["bg", "#f7f6f3"],
				["raised", "#ffffff"],
				["line", "#e3e1dc"],
				["line-strong", "#d0cdc7"],
				["text", "#1a1917"],
				["text-2", "#5d5a55"],
				["text-3", "#85817a"],
				["thread", "#f5391a"],
			];

const railStates: { label: string; row: Parameters<typeof PageRow>[0] }[] = [
	{ label: "Rest", row: { depth: 1, kind: "frame", name: "menu" } },
	{ label: "Hover", row: { depth: 1, kind: "frame", name: "menu", state: "hover" } },
	{ label: "Selected", row: { depth: 1, kind: "frame", name: "cart", state: "selected" } },
	{ label: "Current page", row: { depth: 0, kind: "page", name: "app", open: true, current: true, count: 3 } },
	{ label: "Unseen", row: { depth: 1, kind: "frame", name: "receipt", unseen: true } },
];

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-sans flex h-[900px] w-[720px] flex-col gap-4 overflow-hidden bg-(--s-bg) px-6 pt-5 pb-6"
			data-appearance={appearance}
		>
			<div className="flex items-baseline justify-between border-b border-(--s-line) pb-3">
				<span className="s-heading">{appearance === "dark" ? "Dark" : "Light"}</span>
				<span className="s-caption text-(--s-text-3)">
					Rows 30 · bars 40 · radius 8 / 6 / 4 · 4px grid
				</span>
			</div>
			<div className="flex min-h-0 flex-1 gap-6">
				{/* column A */}
				<div className="flex w-[316px] shrink-0 flex-col gap-4">
					<Spec label="Type roles">
						<div className="flex flex-col">
							{roles.map((r) => (
								<div key={r.name} className="flex h-7.5 items-center gap-3 border-b border-(--s-line) last:border-0">
									<span className="s-caption w-14 shrink-0 font-medium text-(--s-text-2)">{r.name}</span>
									<span className="s-micro w-20 shrink-0 text-(--s-text-3)">{r.spec}</span>
									<span className={cn(r.cls, "min-w-0 truncate")}>{r.sample}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="Buttons · 30 tall, radius 6">
						<div className="flex flex-wrap items-center gap-2">
							<Button kind="primary" icon="plus">
								New project…
							</Button>
							<Button>Import…</Button>
							<Button kind="ghost">Connect account</Button>
							<IconButton name="plus" size={30} className="text-(--s-text-2)" />
							<Button kind="danger">Move to Trash</Button>
						</div>
					</Spec>
					<Spec label="Fields">
						<div className="flex items-center gap-2">
							<span className="s-body flex h-7.5 w-[120px] items-center rounded-[6px] border border-(--s-thread) bg-(--s-field) px-2.5">
								cart
								<span className="ml-px h-4 w-px bg-(--s-text)" />
							</span>
							<SearchField className="flex-1" />
						</div>
					</Spec>
					<Spec label="Segmented · toggle">
						<div className="flex items-center gap-4">
							<Segmented items={["Light", "Dark", "System"]} active={appearance === "dark" ? 1 : 0} />
							<Toggle on />
							<Toggle on={false} />
						</div>
					</Spec>
					<Spec label="Tabs · window, panel">
						<div className="flex items-center gap-0.5">
							<WindowTab name="kaffe" active />
							<WindowTab name="tvärsö" />
						</div>
						<div className="flex h-7.5 items-stretch gap-4 border-b border-(--s-line)">
							<span className="s-body flex items-center border-b-2 border-(--s-text) font-medium">General</span>
							<span className="s-body flex items-center border-b-2 border-transparent text-(--s-text-2)">
								Appearance
							</span>
						</div>
					</Spec>
					<Spec label="Chips · count, selection, size, kind">
						<div className="flex flex-wrap items-center gap-2">
							<CountChip>3</CountChip>
							<SelectionChip label={element.chip} />
							<SizeChip />
							<KindTag>{element.kind}</KindTag>
						</div>
					</Spec>
					<Spec label="Spacing · 4px base">
						<div className="flex items-end gap-4">
							{[4, 8, 12, 16, 24, 32, 40].map((n) => (
								<span key={n} className="flex flex-col gap-1">
									<span className="h-2 rounded-[2px] bg-(--s-text-3)/50" style={{ width: n }} />
									<span className="s-micro font-normal text-(--s-text-3)">{n}</span>
								</span>
							))}
						</div>
					</Spec>
				</div>
				{/* column B */}
				<div className="flex min-w-0 flex-1 flex-col gap-4">
					<Spec label="Pages rail row · rest, hover, selected, current page, unseen">
						<div className="-mx-2 flex flex-col">
							{railStates.map((r) => (
								<div key={r.label} className="flex items-center">
									<div className="w-[216px] shrink-0">
										<PageRow {...r.row} />
									</div>
									<span className="s-caption pl-4 text-(--s-text-3)">{r.label}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="Property row">
						<div className="-mx-4 flex w-[232px] flex-col">
							<SectionHead title="Position" source={selection.source} />
							<PropertyRow label="X" value={selection.x} />
						</div>
					</Spec>
					<div className="flex gap-6">
						<Spec label="Context menu">
							<div className={cn("flex w-[200px] flex-col rounded-[8px] p-1", floating)}>
								{menuItems.map((m) => (
									<div key={m.label} className="flex flex-col">
										{m.danger && <span className="mx-1 my-1 h-px bg-(--s-line)" />}
										<div
											className={cn(
												"flex h-7.5 items-center justify-between rounded-[6px] px-2",
												m.label === "Rename" && "bg-(--s-selected)",
											)}
										>
											<span className={cn("s-body", m.danger ? "text-(--s-thread-text)" : "text-(--s-text)")}>
												{m.label}
											</span>
											<span className="s-caption text-(--s-text-3)">{m.key}</span>
										</div>
									</div>
								))}
							</div>
						</Spec>
						<div className="flex flex-col gap-4">
							<Spec label="Tooltip">
								<div className="flex">
									<span className={cn("flex h-7 items-center gap-2 rounded-[8px] pr-1.5 pl-2.5", floating)}>
										<span className="s-caption">Select</span>
										<Kbd>V</Kbd>
									</span>
								</div>
							</Spec>
							<Spec label="Key hint">
								<div className="flex gap-1">
									<Kbd>/</Kbd>
									<Kbd>V</Kbd>
									<Kbd>⌘D</Kbd>
								</div>
							</Spec>
							<Spec label="Icon button · 24, 28">
								<div className="flex items-center gap-1">
									<IconButton name="dots" size={24} />
									<IconButton name="properties" state="active" />
									<IconButton name="flows" state="on" />
								</div>
							</Spec>
						</div>
					</div>
					<Spec label="Toast">
						<div className={cn("flex h-10 w-[280px] items-center gap-3 rounded-[8px] pr-1 pl-3", floating)}>
							<span className="s-body flex-1">{toast.text}</span>
							<Button kind="ghost" className="h-7 px-2 text-(--s-text)">
								{toast.action}
							</Button>
						</div>
					</Spec>
					<Spec label="Settings row">
						<div className="flex items-start gap-4 border-y border-(--s-line) py-3">
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="s-body font-medium">{settingsRow.title}</span>
								<span className="s-caption text-(--s-text-2)">{settingsRow.detail}</span>
							</div>
							<span className="pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>
				</div>
			</div>
			<Spec className="border-t border-(--s-line) pt-3" label="Palette · red marks what is selected, on, linked or new; neutral fills mark where you are">
				<div className="grid grid-cols-9 gap-2">
					{swatches(appearance).map(([name, hex]) => (
						<div key={name} className="flex flex-col gap-1">
							<span className="h-6 rounded-[4px] border border-(--s-line-strong)" style={{ background: hex }} />
							<span className="s-micro truncate">{name}</span>
							<span className="s-micro font-normal text-(--s-text-3)">{hex}</span>
						</div>
					))}
				</div>
			</Spec>
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
