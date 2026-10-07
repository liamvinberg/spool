import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	agent,
	type Appearance,
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
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { projects } from "shared/ui/demo/home-data";
import { SpoolMark } from "shared/ui/spool/mark";
import "./contrast.css";

/*
 * contrast: the Geist dashboard school on spool's warm greys.
 * Rules the Parts sheet shows and every screen obeys:
 *  - 4px spacing; list rows and controls 28; window bar and panel headers 40; Home's page
 *    controls 32.
 *  - radius by role: 4 nested (chips, segments, tools, menu items), 6 controls and rows,
 *    8 floating containers and cards. Nested = outer − padding.
 *  - structure is 1px lines; rest states have no fill; hover fills, selected fills deeper.
 *  - red is selection, flows, unseen and destructive. Primary is the text colour, solid.
 *  - sans for what a person reads, mono for what the machine prints (page, frame, path,
 *    value, count, key).
 *  - one shadow token, only on what floats.
 */

/* ── icons: one set, 16 box, 1.5 stroke, round joins ─────────────────────────── */

function Svg({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", className)}
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

const Icon = {
	home: (c?: string) => (
		<Svg className={c}>
			<path d="M2.75 7.25 8 2.75l5.25 4.5v6h-3.5V9.5h-3.5v3.75h-3.5z" />
		</Svg>
	),
	plus: (c?: string) => (
		<Svg className={c}>
			<path d="M8 3.5v9M3.5 8h9" />
		</Svg>
	),
	close: (c?: string) => (
		<Svg className={c}>
			<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
		</Svg>
	),
	right: (c?: string) => (
		<Svg className={c}>
			<path d="m6.5 4 4 4-4 4" />
		</Svg>
	),
	left: (c?: string) => (
		<Svg className={c}>
			<path d="m9.5 4-4 4 4 4" />
		</Svg>
	),
	down: (c?: string) => (
		<Svg className={c}>
			<path d="m4 6.5 4 4 4-4" />
		</Svg>
	),
	folder: (c?: string) => (
		<Svg className={c}>
			<path d="M2.25 4.25h4l1.5 1.5h6v6.5H2.25z" />
		</Svg>
	),
	file: (c?: string) => (
		<Svg className={c}>
			<path d="M3.75 2.25h5l3.5 3.5v8h-8.5z" />
			<path d="M8.75 2.25v3.5h3.5" />
		</Svg>
	),
	flows: (c?: string) => (
		<Svg className={c}>
			<circle cx="4.25" cy="4.5" r="1.75" />
			<circle cx="11.75" cy="11.5" r="1.75" />
			<path d="M5.75 6 10.25 10" />
		</Svg>
	),
	select: (c?: string) => (
		<Svg className={c}>
			<path d="M3.5 2.75 12.5 7l-4 1.25L7 12.5z" fill="currentColor" />
		</Svg>
	),
	edit: (c?: string) => (
		<Svg className={c}>
			<path d="M2.5 5V2.5H5M8 2.5h1.5M12 2.5h1.5V5M2.5 8v1.5M2.5 12v1.5H5" />
			<path d="m8 8 5.5 2.5-2.5.75-.75 2.5z" fill="currentColor" />
		</Svg>
	),
	hand: (c?: string) => (
		<Svg className={c}>
			<path d="M5.25 8.5V4a1 1 0 0 1 2 0v3.5M7.25 7V3a1 1 0 0 1 2 0v4M9.25 7V3.75a1 1 0 0 1 2 0V8.5" />
			<path d="M11.25 6.5a1 1 0 0 1 2 0V9a4.75 4.75 0 0 1-4.75 4.75h-.75c-1.5 0-2.5-.5-3.4-1.4L2.6 10.6a1 1 0 0 1 1.4-1.45l1.25 1.1" />
		</Svg>
	),
	dots: (c?: string) => (
		<Svg className={c}>
			<circle cx="3.5" cy="8" r=".5" fill="currentColor" />
			<circle cx="8" cy="8" r=".5" fill="currentColor" />
			<circle cx="12.5" cy="8" r=".5" fill="currentColor" />
		</Svg>
	),
	properties: (c?: string) => (
		<Svg className={c}>
			<path d="M2.5 5h4M9.5 5h4M2.5 11h7M12.5 11h1" />
			<circle cx="8" cy="5" r="1.5" />
			<circle cx="11" cy="11" r="1.5" />
		</Svg>
	),
	agent: (c?: string) => (
		<Svg className={c}>
			<path d="M2.75 3.25h10.5v7.5H8l-3 2.5v-2.5H2.75z" />
			<path d="M5.5 6.25h5M5.5 8.25h3" />
		</Svg>
	),
	help: (c?: string) => (
		<Svg className={c}>
			<circle cx="8" cy="8" r="5.75" />
			<path d="M6.4 6.4a1.65 1.65 0 1 1 2.3 1.5c-.45.2-.7.55-.7 1v.35" />
			<circle cx="8" cy="11.25" r=".4" fill="currentColor" />
		</Svg>
	),
	cog: (c?: string) => (
		<Svg className={c}>
			<path d="M6.9 2.25h2.2l.35 1.6 1.2.7 1.55-.5 1.1 1.9-1.2 1.1v1.4l1.2 1.1-1.1 1.9-1.55-.5-1.2.7-.35 1.6H6.9l-.35-1.6-1.2-.7-1.55.5-1.1-1.9 1.2-1.1V7.05l-1.2-1.1 1.1-1.9 1.55.5 1.2-.7z" />
			<circle cx="8" cy="8" r="1.75" />
		</Svg>
	),
	search: (c?: string) => (
		<Svg className={c}>
			<circle cx="7.25" cy="7.25" r="4" />
			<path d="m10.25 10.25 3 3" />
		</Svg>
	),
	grid: (c?: string) => (
		<Svg className={c}>
			<rect x="2.5" y="2.5" width="4.25" height="4.25" rx="1" />
			<rect x="9.25" y="2.5" width="4.25" height="4.25" rx="1" />
			<rect x="2.5" y="9.25" width="4.25" height="4.25" rx="1" />
			<rect x="9.25" y="9.25" width="4.25" height="4.25" rx="1" />
		</Svg>
	),
	play: (c?: string) => (
		<svg viewBox="0 0 16 16" className={cn("size-2 shrink-0", c)} aria-hidden="true">
			<path d="M4 2.5 13 8 4 13.5z" fill="currentColor" />
		</svg>
	),
};

/* ── primitives ───────────────────────────────────────────────────────────────── */

function IconButton({
	children,
	active,
	label,
	className,
}: {
	children: ReactNode;
	active?: boolean;
	label: string;
	className?: string;
}) {
	return (
		<span
			role="button"
			aria-label={label}
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] text-(--k-muted)",
				active && "bg-(--k-selected) text-(--k-text)",
				className,
			)}
		>
			{children}
		</span>
	);
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

function Button({
	variant,
	children,
	page,
	icon,
}: {
	variant: ButtonVariant;
	children: ReactNode;
	page?: boolean;
	icon?: ReactNode;
}) {
	return (
		<span
			role="button"
			className={cn(
				"k-body inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border font-medium",
				page ? "h-8 px-3" : "h-7 px-2.5",
				variant === "primary" && "border-(--k-primary) bg-(--k-primary) text-(--k-on-primary)",
				variant === "secondary" && "border-(--k-border-strong) text-(--k-text)",
				variant === "ghost" && "border-transparent text-(--k-muted)",
				variant === "danger" && "border-(--k-thread-solid) bg-(--k-thread-solid) text-(--k-on-thread)",
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="k-micro inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-(--k-border) px-1 text-(--k-muted)">
			{children}
		</span>
	);
}

/** Chips share one shape: 20 tall, radius 4, mono 11. */
function Chip({ tone, children }: { tone: "line" | "thread"; children: ReactNode }) {
	return (
		<span
			className={cn(
				"k-micro inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1.5",
				tone === "line" && "border border-(--k-border-strong) text-(--k-text)",
				tone === "thread" && "bg-(--k-thread-solid) text-(--k-on-thread)",
			)}
		>
			{children}
		</span>
	);
}

function SelectionChip() {
	return (
		<Chip tone="line">
			<span className="h-2.5 w-0.5 rounded-full bg-(--k-thread)" />
			{element.chip}
			{Icon.close("size-3 text-(--k-muted)")}
		</Chip>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border",
				on ? "border-(--k-primary) bg-(--k-primary)" : "border-(--k-border-strong)",
			)}
		>
			<span
				className={cn(
					"absolute size-2.5 rounded-full",
					on ? "left-[13px] bg-(--k-on-primary)" : "left-[2px] bg-(--k-faint)",
				)}
			/>
		</span>
	);
}

function Segmented({ items, active }: { items: string[]; active: string }) {
	return (
		<span className="inline-flex h-7 items-center rounded-[6px] border border-(--k-border) p-0.5">
			{items.map((item) => (
				<span
					key={item}
					className={cn(
						"k-small flex h-[22px] items-center rounded-[4px] px-2",
						item === active ? "bg-(--k-selected) font-medium text-(--k-text)" : "text-(--k-muted)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

function WindowTab({ name, active, icon }: { name: string; active?: boolean; icon?: ReactNode }) {
	return (
		<span
			className={cn(
				"k-body flex h-7 shrink-0 items-center gap-2 rounded-[6px] border px-2.5",
				active ? "border-(--k-border-strong) font-medium text-(--k-text)" : "border-transparent text-(--k-muted)",
			)}
		>
			{icon}
			{name}
			{active && !icon ? Icon.close("-mr-1 size-3.5 text-(--k-muted)") : null}
		</span>
	);
}

function PanelTabs({ items, active }: { items: string[]; active: string }) {
	return (
		<span className="flex h-10 items-stretch gap-4 border-b border-(--k-border)">
			{items.map((item) => (
				<span
					key={item}
					className={cn(
						"k-body -mb-px flex items-center border-b",
						item === active ? "border-(--k-text) font-medium text-(--k-text)" : "border-transparent text-(--k-muted)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

/* ── window ───────────────────────────────────────────────────────────────────── */

function WindowBar({ at }: { at: "home" | "project" }) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-1 border-b border-(--k-border) bg-(--k-bg) px-2">
			<WindowTab name="Home" active={at === "home"} icon={Icon.home()} />
			<span className="mx-1 h-4 w-px bg-(--k-border)" />
			{tabs.map((t) => (
				<WindowTab key={t.name} name={t.name} active={at === "project" && t.active === true} />
			))}
			<IconButton label="New tab">{Icon.plus()}</IconButton>
			<span className="flex-1" />
			{at === "project" ? (
				<>
					<IconButton label="Flows" active>
						{Icon.flows()}
					</IconButton>
					<span className="k-mono flex h-7 w-12 items-center justify-end pr-1 text-(--k-muted)">{zoom}</span>
				</>
			) : null}
		</div>
	);
}

function RailRow({
	kind,
	name,
	count,
	state,
	open,
	guide,
}: {
	kind: "page" | "frame";
	name: string;
	count?: number;
	state?: "rest" | "hover" | "selected" | "current" | "unseen";
	open?: boolean;
	guide?: boolean;
}) {
	const strong = state === "selected" || state === "current";
	return (
		<div
			className={cn(
				"relative mx-2 flex h-7 items-center gap-1.5 rounded-[6px] pr-2",
				kind === "page" ? "pl-1" : "pl-[27px]",
				state === "hover" && "bg-(--k-hover)",
				state === "selected" && "bg-(--k-selected)",
			)}
		>
			{guide ? <span className="absolute inset-y-0 left-[12px] w-px bg-(--k-border)" /> : null}
			{kind === "page" ? (open ? Icon.down("size-4 text-(--k-faint)") : Icon.right("size-4 text-(--k-faint)")) : null}
			{kind === "page"
				? Icon.folder(strong ? "text-(--k-text)" : "text-(--k-muted)")
				: Icon.file(state === "selected" ? "text-(--k-thread)" : "text-(--k-muted)")}
			<span
				className={cn(
					"k-mono flex-1 truncate",
					strong || state === "hover" ? "text-(--k-text)" : "text-(--k-muted)",
					state === "current" && "font-medium",
				)}
			>
				{name}
			</span>
			{state === "unseen" ? <span className="size-1.5 rounded-full bg-(--k-thread)" aria-label="unseen" /> : null}
			{count !== undefined ? <span className="k-micro text-(--k-faint)">{count}</span> : null}
		</div>
	);
}

function PagesRail() {
	return (
		<aside className="flex w-[224px] shrink-0 flex-col border-r border-(--k-border) bg-(--k-bg)">
			<div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-(--k-border) pl-4 pr-1.5">
				<span className="k-head">Pages</span>
				<span className="k-micro text-(--k-faint)">{pages.length}</span>
				<span className="flex-1" />
				<IconButton label="New page">{Icon.plus()}</IconButton>
				<IconButton label="Close">{Icon.close()}</IconButton>
				<IconButton label="Collapse">{Icon.left()}</IconButton>
			</div>
			<div className="flex flex-1 flex-col py-2">
				{pages.map((p) => (
					<div key={p.name}>
						<RailRow
							kind="page"
							name={p.name}
							count={p.count}
							open={p.open === true}
							state={p.current ? "current" : "rest"}
						/>
						{p.open
							? p.frames.map((f) => (
									<RailRow
										key={f.name}
										kind="frame"
										name={f.name}
										guide
										state={f.selected ? "selected" : f.unseen ? "unseen" : "rest"}
									/>
								))
							: null}
					</div>
				))}
			</div>
			<div className="k-micro flex h-8 shrink-0 items-center border-t border-(--k-border) px-4 text-(--k-faint)">
				{railHint}
			</div>
		</aside>
	);
}

/* ── canvas ───────────────────────────────────────────────────────────────────── */

const FRAME_TOP = 120;
const FRAME_X: Record<string, number> = { cart: 26, menu: 322, receipt: 618 };
/** The picked "1 × Cortado" row inside cart, in the frame's own 240×520 box. */
const PICK = { x: 15, y: 49, w: 210, h: 29 };

function Handles() {
	return (
		<>
			{["-left-[3px] -top-[3px]", "-right-[3px] -top-[3px]", "-left-[3px] -bottom-[3px]", "-right-[3px] -bottom-[3px]"].map(
				(pos) => (
					<span key={pos} className={cn("absolute size-[6px] border border-(--k-thread) bg-(--k-handle)", pos)} />
				),
			)}
		</>
	);
}

function Flows({ id }: { id: string }) {
	const marker = `url(#${id})`;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
			<defs>
				<marker
					id={id}
					viewBox="0 0 8 8"
					refX="7"
					refY="4"
					markerWidth="8"
					markerHeight="8"
					markerUnits="userSpaceOnUse"
					orient="auto"
				>
					<path d="M0 0.5 8 4 0 7.5z" fill="var(--k-thread)" />
				</marker>
			</defs>
			<g fill="none" stroke="var(--k-thread)" strokeWidth="1.25" strokeLinecap="round">
				{/* menu → cart (Checkout) */}
				<path d="M322 606 C 296 606, 296 566, 268 566" markerEnd={marker} />
				{/* cart → receipt (Pay), under menu */}
				<path d="M236 641 C 236 724, 738 728, 738 645" markerEnd={marker} />
				{/* receipt → menu, might */}
				<path d="M618 318 C 592 318, 592 354, 564 354" strokeDasharray="4 3" markerEnd={marker} />
			</g>
		</svg>
	);
}

function Canvas({ appearance, mode }: { appearance: Appearance; mode: "select" | "edit" }) {
	return (
		<div className="relative min-w-0 flex-1 overflow-hidden bg-(--k-canvas)">
			<Flows id={`k-arrow-${appearance}-${mode}`} />
			{canvasFrames.map((f) => {
				const x = FRAME_X[f.name] ?? 0;
				const selected = mode === "select" && f.name === selection.name;
				const unseen = "unseen" in f && f.unseen;
				return (
					<div key={f.name} className="absolute" style={{ left: x, top: FRAME_TOP, width: drawnSize.w, height: drawnSize.h }}>
						<div
							className={cn(
								"k-micro absolute -top-6 left-0 flex h-4 w-full items-center gap-1.5",
								selected ? "text-(--k-thread-ink)" : "text-(--k-muted)",
							)}
						>
							<span>{f.name}</span>
							{unseen ? <span className="size-1.5 rounded-full bg-(--k-thread)" /> : null}
							<span className="flex-1" />
							{selected ? (
								<span className="flex items-center gap-1">
									{Icon.play()}
									play
								</span>
							) : null}
						</div>
						<CoffeeScreen screen={f.screen} />
						{selected ? (
							<>
								<span className="pointer-events-none absolute -inset-[3px] rounded-[11px] border border-(--k-thread)" />
								<Handles />
								<span className="absolute left-1/2 top-[calc(100%+12px)] -translate-x-1/2">
									<Chip tone="thread">
										{frameSize.w} × {frameSize.h}
									</Chip>
								</span>
							</>
						) : null}
						{mode === "edit" && f.name === element.frame ? (
							<span
								className="absolute rounded-[7px] border border-(--k-thread)"
								style={{ left: PICK.x - 2, top: PICK.y - 2, width: PICK.w + 4, height: PICK.h + 4 }}
							>
								<span className="absolute -right-px -top-[21px]">
									<Chip tone="thread">{element.kind}</Chip>
								</span>
							</span>
						) : null}
					</div>
				);
			})}
			<div className="k-float absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[8px] border border-(--k-border) bg-(--k-bg) p-1">
				{tools.map((t) => (
					<IconButton key={t.name} label={`${t.name} ${t.key}`} active={mode === "select" ? t.name === "select" : t.name === "edit"} className="rounded-[4px]">
						{t.name === "select" ? Icon.select() : t.name === "edit" ? Icon.edit() : Icon.hand()}
					</IconButton>
				))}
			</div>
		</div>
	);
}

/* ── right side ───────────────────────────────────────────────────────────────── */

function PanelHeader({ children, actions }: { children: ReactNode; actions: ReactNode }) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-1 border-b border-(--k-border) pl-3 pr-1.5">
			<div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
			{actions}
		</div>
	);
}

function Field({ axis, value }: { axis: string; value: number }) {
	return (
		<span className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-(--k-border) px-2">
			<span className="k-mono w-2.5 text-(--k-faint)">{axis}</span>
			<span className="k-mono flex-1 text-(--k-text)">{value}</span>
			<span className="k-micro text-(--k-faint)">px</span>
		</span>
	);
}

function PropertyGroup({ label, a, b }: { label: string; a: [string, number]; b: [string, number] }) {
	return (
		<div className="flex flex-col">
			<div className="flex h-7 items-center justify-between">
				<span className="k-small text-(--k-muted)">{label}</span>
				<span className="k-micro text-(--k-faint)">{selection.source}</span>
			</div>
			<div className="flex gap-2">
				<Field axis={a[0]} value={a[1]} />
				<Field axis={b[0]} value={b[1]} />
			</div>
		</div>
	);
}

function PropertiesPanel() {
	return (
		<>
			<PanelHeader
				actions={
					<>
						<IconButton label="More">{Icon.dots()}</IconButton>
						<IconButton label="Collapse">{Icon.right()}</IconButton>
					</>
				}
			>
				<span className="k-mono truncate font-medium text-(--k-text)">{selection.name}</span>
			</PanelHeader>
			<div className="flex flex-col gap-3 px-3 py-2">
				<PropertyGroup label="Position" a={["x", selection.x]} b={["y", selection.y]} />
				<PropertyGroup label="Size" a={["w", selection.w]} b={["h", selection.h]} />
			</div>
		</>
	);
}

function AgentPanel() {
	const edit = agent.turn.edits[0];
	return (
		<>
			<PanelHeader actions={<IconButton label="New chat">{Icon.plus()}</IconButton>}>
				<span className="k-head truncate">{agent.title}</span>
				{Icon.down("size-3.5 text-(--k-muted)")}
			</PanelHeader>
			<div className="flex h-7 shrink-0 items-center justify-between border-b border-(--k-border) px-3">
				<span className="k-mono flex items-center gap-0.5 text-(--k-text)">
					{agent.model}
					{Icon.right("size-3 text-(--k-faint)")}
				</span>
				<span className="k-small text-(--k-faint)">{agent.scope}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 py-4">
				<div className="k-body self-end rounded-[8px] border border-(--k-border) px-3 py-2 text-(--k-text)">
					{agent.turn.ask}
				</div>
				<div className="flex flex-col gap-2">
					<span className="k-small flex items-center gap-1.5 text-(--k-muted)">
						<SpoolMark className="h-3.5 w-3 text-(--k-thread)" />
						{agent.model}
					</span>
					<p className="k-body text-(--k-text)">{agent.turn.said}</p>
					{edit ? (
						<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(--k-border) px-2">
							{Icon.file("text-(--k-muted)")}
							<span className="k-mono min-w-0 flex-1 truncate text-(--k-text)">{edit.path}</span>
							<span className="k-mono text-(--k-text)">+{edit.added}</span>
							<span className="k-mono text-(--k-faint)">−{edit.removed}</span>
						</div>
					) : null}
				</div>
			</div>
			<div className="flex shrink-0 flex-col gap-1 px-3 pb-2">
				<div className="flex min-h-[104px] flex-col gap-2 rounded-[8px] border border-(--k-border-strong) p-2">
					<span className="flex">
						<SelectionChip />
					</span>
					<span className="k-body px-0.5 text-(--k-faint)">{agent.placeholder}</span>
				</div>
				<div className="flex h-7 items-center justify-between">
					<span className="k-small -ml-0.5 rounded-[6px] px-0.5 text-(--k-muted)">{agent.account}</span>
					<span className="k-mono flex items-center gap-0.5 text-(--k-muted)">
						{agent.mode}
						{Icon.down("size-3")}
					</span>
				</div>
			</div>
		</>
	);
}

function PanelRail({ panel }: { panel: "properties" | "agent" }) {
	return (
		<nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-(--k-border) bg-(--k-bg) py-1.5">
			<IconButton label="Properties" active={panel === "properties"}>
				{Icon.properties()}
			</IconButton>
			<IconButton label="Agent" active={panel === "agent"}>
				{Icon.agent()}
			</IconButton>
			<span className="flex-1" />
			<IconButton label="Help">{Icon.help()}</IconButton>
			<IconButton label="Settings">{Icon.cog()}</IconButton>
		</nav>
	);
}

/* ── screens ──────────────────────────────────────────────────────────────────── */

function Root({ appearance, children, className }: { appearance: Appearance; children: ReactNode; className?: string }) {
	return (
		<div
			className={cn("id-contrast flex h-[900px] w-[1440px] flex-col overflow-hidden bg-(--k-bg) text-(--k-text)", className)}
			data-appearance={appearance}
		>
			{children}
		</div>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	return (
		<Root appearance={appearance}>
			<WindowBar at="project" />
			<div className="flex min-h-0 flex-1">
				<PagesRail />
				<Canvas appearance={appearance} mode={panel === "agent" ? "edit" : "select"} />
				<aside className="flex w-[288px] shrink-0 flex-col border-l border-(--k-border) bg-(--k-bg)">
					{panel === "agent" ? <AgentPanel /> : <PropertiesPanel />}
				</aside>
				<PanelRail panel={panel} />
			</div>
		</Root>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	const [importLabel, openLabel, newLabel] = home.actions;
	return (
		<Root appearance={appearance}>
			<WindowBar at="home" />
			<div className="flex min-h-0 flex-1">
				<aside className="flex w-[224px] shrink-0 flex-col border-r border-(--k-border) px-2 pb-2">
					<div className="flex h-20 items-center gap-2 px-2">
						<SpoolMark className="h-5 w-4 text-(--k-thread)" />
						<span className="k-head text-[15px]">spool</span>
					</div>
					{home.nav.map((n) => (
						<div key={n} className="k-body flex h-7 items-center gap-2 rounded-[6px] bg-(--k-selected) px-2 font-medium">
							{Icon.grid()}
							{n}
						</div>
					))}
					<span className="flex-1" />
					<div className="k-body flex h-7 items-center gap-2 rounded-[6px] px-2 text-(--k-muted)">
						{Icon.cog()}
						{home.foot}
					</div>
				</aside>
				<main className="flex min-w-0 flex-1 flex-col px-11 pt-6">
					<div className="flex h-8 items-center gap-2">
						<h1 className="k-title flex-1">{home.title}</h1>
						<span className="flex h-8 w-60 items-center gap-2 rounded-[6px] border border-(--k-border-strong) pl-2.5 pr-1.5">
							{Icon.search("text-(--k-muted)")}
							<span className="k-body flex-1 text-(--k-faint)">{home.search}</span>
							<Kbd>{home.searchKey}</Kbd>
						</span>
						<Button variant="secondary" page>
							{importLabel}
						</Button>
						<Button variant="secondary" page>
							{openLabel}
						</Button>
						<Button variant="primary" page icon={Icon.plus("-ml-0.5")}>
							{newLabel}
						</Button>
					</div>
					<div className="mt-8 flex h-7 items-center justify-between border-b border-(--k-border) pb-0">
						<span className="k-mono text-(--k-muted)">{home.count}</span>
						<span className="k-small flex items-center gap-1 text-(--k-muted)">
							Sort by
							<span className="flex items-center gap-0.5 font-medium text-(--k-text)">
								{home.sort}
								{Icon.down("size-3.5")}
							</span>
						</span>
					</div>
					<div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-6">
						{projects.map((p) => (
							<div key={p.name} className="flex flex-col">
								<div className="h-[200px] overflow-hidden rounded-[8px] border border-(--k-border)">
									<ProjectArtwork kind={p.art} className="h-full" />
								</div>
								<div className="mt-3 flex h-5 items-center justify-between gap-2">
									<span className="k-body truncate font-medium">{p.name}</span>
									<span className="k-mono shrink-0 text-(--k-muted)">{p.frames} frames</span>
								</div>
								<span className="k-mono text-(--k-faint)">{p.when}</span>
							</div>
						))}
					</div>
				</main>
			</div>
		</Root>
	);
}

/* ── parts ────────────────────────────────────────────────────────────────────── */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<span className="k-micro text-(--k-faint)">{label}</span>
			{children}
		</section>
	);
}

const typeRoles = [
	{ name: "title", cls: "k-title", spec: "sans 24/32 600", sample: "Projects" },
	{ name: "head", cls: "k-head", spec: "sans 13/20 600", sample: "Pages" },
	{ name: "body", cls: "k-body", spec: "sans 13/20 400", sample: "Make the cart rows taller." },
	{ name: "small", cls: "k-small", spec: "sans 12/16 400", sample: "For this new chat" },
	{ name: "mono", cls: "k-mono", spec: "mono 12/16 400", sample: "frames/app/cart" },
	{ name: "micro", cls: "k-micro", spec: "mono 11/16 400", sample: "390 × 844" },
];

const swatches: { name: string; dark: string; light: string; v: string }[] = [
	{ name: "bg", dark: "#0a0a0a", light: "#ffffff", v: "--k-bg" },
	{ name: "canvas", dark: "#131312", light: "#f3f3f1", v: "--k-canvas" },
	{ name: "hover", dark: "#171716", light: "#f5f5f3", v: "--k-hover" },
	{ name: "selected", dark: "#1f1f1d", light: "#ebebe8", v: "--k-selected" },
	{ name: "border", dark: "#242422", light: "#e6e5e2", v: "--k-border" },
	{ name: "border-strong", dark: "#383734", light: "#cfcdc9", v: "--k-border-strong" },
	{ name: "text", dark: "#ededeb", light: "#0a0a0a", v: "--k-text" },
	{ name: "muted", dark: "#a3a29e", light: "#62615d", v: "--k-muted" },
	{ name: "faint", dark: "#75736f", light: "#7d7b77", v: "--k-faint" },
	{ name: "thread", dark: "#f5391a", light: "#f5391a", v: "--k-thread" },
	{ name: "thread-ink", dark: "#ff4a2b", light: "#d42d0e", v: "--k-thread-ink" },
	{ name: "thread-solid", dark: "#f5391a", light: "#e0320f", v: "--k-thread-solid" },
];

function PartsBoard({ appearance }: { appearance: Appearance }) {
	return (
		<div
			className="id-contrast flex h-[900px] w-[720px] flex-col gap-5 bg-(--k-bg) p-6 text-(--k-text)"
			data-appearance={appearance}
		>
			<div className="flex h-10 shrink-0 items-center justify-between border-b border-(--k-border) pb-3">
				<span className="flex items-center gap-2">
					<SpoolMark className="h-5 w-4 text-(--k-thread)" />
					<span className="k-head text-[15px]">spool</span>
					<span className="k-small text-(--k-muted)">{appearance === "dark" ? "Dark" : "Light"}</span>
				</span>
				<span className="k-micro text-(--k-faint)">contrast · 4px grid · rows 28 · radius 4/6/8</span>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-2 gap-x-6">
				<div className="flex flex-col gap-5">
					<Spec label="type">
						<div className="flex flex-col">
							{typeRoles.map((r) => (
								<div key={r.name} className="flex items-baseline justify-between gap-3 border-b border-(--k-border) py-1 last:border-b-0">
									<span className={cn(r.cls, "truncate")}>{r.sample}</span>
									<span className="k-micro shrink-0 text-(--k-faint)">
										{r.name} · {r.spec}
									</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="palette">
						<div className="grid grid-cols-[148px_1fr] gap-x-3 gap-y-1">
							{swatches.map((s) => (
								<div key={s.name} className="flex h-5 items-center gap-1">
									<span className="mr-1 size-2.5 shrink-0 rounded-[4px] border border-(--k-border-strong)" style={{ background: `var(${s.v})` }} />
									<span className="k-micro min-w-0 flex-1 whitespace-nowrap text-(--k-muted)">{s.name}</span>
									<span className="k-micro text-(--k-text)">{appearance === "dark" ? s.dark : s.light}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="buttons · 28, 32 on Home">
						<div className="flex items-center gap-2">
							<Button variant="primary">New</Button>
							<Button variant="secondary">Import…</Button>
							<Button variant="ghost">Cancel</Button>
							<span className="flex size-7 items-center justify-center rounded-[6px] border border-(--k-border-strong) text-(--k-text)">
								{Icon.plus()}
							</span>
							<Button variant="danger">Delete</Button>
						</div>
					</Spec>
					<Spec label="input · search">
						<div className="flex gap-2">
							<span className="flex h-7 w-[128px] items-center rounded-[6px] border border-(--k-border-strong) px-2.5">
								<span className="k-body text-(--k-text)">kaffe</span>
								<span className="ml-px h-4 w-px bg-(--k-text)" />
							</span>
							<span className="flex h-7 flex-1 items-center gap-2 rounded-[6px] border border-(--k-border-strong) pl-2.5 pr-1">
								{Icon.search("text-(--k-muted)")}
								<span className="k-body flex-1 whitespace-nowrap text-(--k-faint)">{home.search}</span>
								<Kbd>{home.searchKey}</Kbd>
							</span>
						</div>
					</Spec>
					<Spec label="segmented · toggle">
						<div className="flex items-center gap-4">
							<Segmented items={["Ask", "Only this Mac"]} active="Ask" />
							<span className="flex items-center gap-2">
								<Toggle on />
								<Toggle on={false} />
							</span>
						</div>
					</Spec>
					<Spec label="tooltip · toast · float shadow">
						<div className="flex items-center gap-3">
							<span className="k-float k-small flex h-7 items-center gap-2 rounded-[6px] border border-(--k-border) bg-(--k-bg) pl-2 pr-1">
								Edit
								<Kbd>E</Kbd>
							</span>
							<span className="k-float flex h-10 items-center gap-3 rounded-[8px] border border-(--k-border) bg-(--k-bg) pl-3 pr-1">
								<span className="k-mono text-(--k-text)">{toast.text}</span>
								<Button variant="ghost">{toast.action}</Button>
							</span>
						</div>
					</Spec>
				</div>
				<div className="flex flex-col gap-5">
					<Spec label="tabs · window, panel">
						<div className="flex items-center gap-1">
							<WindowTab name="Home" icon={Icon.home()} />
							<WindowTab name="kaffe" active />
							<WindowTab name="tvärsö" />
						</div>
						<PanelTabs items={["General", "Appearance"]} active="General" />
					</Spec>
					<Spec label="chips · count, selection, size">
						<div className="flex items-center gap-2">
							<span className="k-micro text-(--k-faint)">3</span>
							<SelectionChip />
							<Chip tone="thread">
								{frameSize.w} × {frameSize.h}
							</Chip>
						</div>
					</Spec>
					<Spec label="rail row · rest, hover, selected, current page, unseen">
						<div className="-mx-2 flex flex-col">
							<RailRow kind="page" name="directing" count={1} state="rest" />
							<RailRow kind="page" name="site" count={2} state="hover" />
							<RailRow kind="page" name="app" count={3} state="current" open />
							<RailRow kind="frame" name="cart" state="selected" guide />
							<RailRow kind="frame" name="receipt" state="unseen" guide />
						</div>
					</Spec>
					<Spec label="property row">
						<PropertyGroup label="Position" a={["x", selection.x]} b={["y", selection.y]} />
					</Spec>
					<Spec label="context menu">
						<div className="k-float w-[200px] rounded-[8px] border border-(--k-border) bg-(--k-bg) p-1">
							{menuItems.map((m, i) => (
								<div key={m.label}>
									{m.danger ? <div className="mx-1 my-1 h-px bg-(--k-border)" /> : null}
									<div
										className={cn(
											"k-body flex h-7 items-center justify-between rounded-[4px] px-2",
											i === 1 && "bg-(--k-hover)",
											m.danger ? "text-(--k-thread-ink)" : "text-(--k-text)",
										)}
									>
										{m.label}
										<span className={cn("k-micro", m.danger ? "text-(--k-thread-ink)" : "text-(--k-faint)")}>{m.key}</span>
									</div>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="settings row">
						<div className="flex items-start gap-4 border-y border-(--k-border) py-3">
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="k-body font-medium">{settingsRow.title}</span>
								<span className="k-small text-(--k-muted)">{settingsRow.detail}</span>
							</div>
							<span className="pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>
				</div>
			</div>
		</div>
	);
}

export function IdentityParts() {
	return (
		<div className="flex h-[900px] w-[1440px]">
			<PartsBoard appearance="dark" />
			<PartsBoard appearance="light" />
		</div>
	);
}
