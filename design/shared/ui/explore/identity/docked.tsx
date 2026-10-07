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
	selection,
	settingsRow,
	tabs,
	toast,
	tools,
	zoom,
} from "shared/lib/explore/identity/world";
import { cn } from "shared/lib/utils";
import { projects } from "shared/ui/demo/home-data";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { EditIcon, HandIcon, SelectIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import "./docked.css";

/*
 * docked: one inspector, docked. The far-right icon rail is gone; the right panel
 * switches itself with a two-segment control in its header, and help and settings
 * move up beside the zoom. Every column starts with the same two bars: the 40px
 * window bar, then a 40px column header, so the hairlines at y=40 and y=80 run the
 * full width. Rows and controls are 28px. Text sits on a 16px gutter: a bare word
 * is inset 16, a boxed thing is inset 8 and pads its own 8.
 */

/* ---------- icons: 16 box, 1.25 stroke, round joins ---------- */

const st = {
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

type IP = { className?: string };
const IcHome = ({ className }: IP) => (
	<Ic className={className}>
		<path d="M2.75 7.25 8 2.75l5.25 4.5v6h-3.5V9.5h-3.5v3.75h-3.5z" {...st} />
	</Ic>
);
const IcPlus = ({ className }: IP) => (
	<Ic className={className}>
		<path d="M8 3.5v9M3.5 8h9" {...st} />
	</Ic>
);
const IcClose = ({ className }: IP) => (
	<Ic className={className}>
		<path d="m4.5 4.5 7 7m0-7-7 7" {...st} />
	</Ic>
);
const IcChevron = ({ className }: IP) => (
	<Ic className={className}>
		<path d="m6.5 4.5 3.5 3.5-3.5 3.5" {...st} />
	</Ic>
);
const IcDown = ({ className }: IP) => (
	<Ic className={className}>
		<path d="m4.5 6.5 3.5 3.5 3.5-3.5" {...st} />
	</Ic>
);
const IcCollapseLeft = ({ className }: IP) => (
	<Ic className={className}>
		<rect x="2.5" y="3" width="11" height="10" rx="2" {...st} />
		<path d="M6.25 3v10" {...st} />
	</Ic>
);
const IcCollapseRight = ({ className }: IP) => (
	<Ic className={className}>
		<rect x="2.5" y="3" width="11" height="10" rx="2" {...st} />
		<path d="M9.75 3v10" {...st} />
	</Ic>
);
const IcDots = ({ className }: IP) => (
	<Ic className={className}>
		<circle cx="4" cy="8" r="1" fill="currentColor" />
		<circle cx="8" cy="8" r="1" fill="currentColor" />
		<circle cx="12" cy="8" r="1" fill="currentColor" />
	</Ic>
);
const IcSearch = ({ className }: IP) => (
	<Ic className={className}>
		<circle cx="7.25" cy="7.25" r="4" {...st} />
		<path d="m10.25 10.25 3 3" {...st} />
	</Ic>
);
const IcFolder = ({ className }: IP) => (
	<Ic className={className}>
		<path d="M2.5 4.25a1 1 0 0 1 1-1h2.75l1.5 1.5h4.75a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" {...st} />
	</Ic>
);
const IcFile = ({ className }: IP) => (
	<Ic className={className}>
		<path d="M4 2.75h5l3 3v7.5H4z" {...st} />
		<path d="M9 2.75v3h3" {...st} />
	</Ic>
);
const IcFlows = ({ className }: IP) => (
	<Ic className={className}>
		<circle cx="4.25" cy="4.5" r="1.75" {...st} />
		<circle cx="11.75" cy="11.5" r="1.75" {...st} />
		<path d="m5.6 5.75 4.8 4.5" {...st} />
	</Ic>
);
const IcHelp = ({ className }: IP) => (
	<Ic className={className}>
		<circle cx="8" cy="8" r="5.5" {...st} />
		<path d="M6.4 6.5a1.6 1.6 0 1 1 2.3 1.45c-.45.22-.7.55-.7 1.05v.3" {...st} />
		<circle cx="8" cy="11.1" r=".7" fill="currentColor" />
	</Ic>
);
const IcCog = ({ className }: IP) => (
	<Ic className={className}>
		<path
			d="M13.23 6.66 14.93 7.01v1.98l-1.7.35-.58 1.41.95 1.45-1.4 1.4-1.45-.95-1.41.58-.35 1.7H7.01l-.35-1.7-1.41-.58-1.45.95-1.4-1.4.95-1.45-.58-1.41-1.7-.35V7.01l1.7-.35.58-1.41-.95-1.45 1.4-1.4 1.45.95 1.41-.58.35-1.7h1.98l.35 1.7 1.41.58 1.45-.95 1.4 1.4-.95 1.45.58 1.41Z"
			{...st}
			transform="translate(8 8) scale(.9) translate(-8 -8)"
		/>
		<circle cx="8" cy="8" r="2" {...st} />
	</Ic>
);
const IcPlay = ({ className }: IP) => (
	<Ic className={className}>
		<path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />
	</Ic>
);
const IcSliders = ({ className }: IP) => (
	<Ic className={className}>
		<path d="M5.5 2.75v2.5M5.5 9.25v4M10.5 2.75v6M10.5 12.25v1" {...st} />
		<circle cx="5.5" cy="7.25" r="1.5" {...st} />
		<circle cx="10.5" cy="10.5" r="1.5" {...st} />
	</Ic>
);
const IcAgent = ({ className }: IP) => (
	<Ic className={className}>
		<circle cx="3.75" cy="5.25" r="1" fill="currentColor" />
		<circle cx="3.75" cy="10.75" r="1" fill="currentColor" />
		<path d="M6.75 5.25h6M6.75 10.75h4" {...st} />
	</Ic>
);

/* ---------- primitives: every one of these is on the parts sheet ---------- */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";
const buttonKind: Record<ButtonKind, string> = {
	primary: "bg-(--d-ink) text-(--d-on-ink)",
	secondary: "border border-(color:--d-line-strong) bg-(--d-field) text-(--d-text)",
	ghost: "!px-2 text-(--d-muted)",
	danger: "border border-(color:--d-line-strong) bg-(--d-field) text-(--d-thread-text)",
};

function Button({ kind = "secondary", icon, children }: { kind?: ButtonKind; icon?: ReactNode; children: ReactNode }) {
	return (
		<span
			className={cn(
				"d-control inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3",
				icon && "pl-2",
				buttonKind[kind],
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({ children, active, hover }: { children: ReactNode; active?: boolean; hover?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-[6px]",
				active ? "bg-(--d-selected) text-(--d-text)" : hover ? "bg-(--d-hover) text-(--d-text)" : "text-(--d-muted)",
			)}
		>
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="d-micro inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-(color:--d-line-strong) px-1 text-(--d-faint)">
			{children}
		</span>
	);
}

function SearchField({ placeholder, hotkey, className }: { placeholder: string; hotkey: string; className?: string }) {
	return (
		<span
			className={cn(
				"flex h-7 items-center gap-2 rounded-[6px] border border-(color:--d-line) bg-(--d-field) pr-1.5 pl-2",
				className,
			)}
		>
			<IcSearch className="text-(--d-faint)" />
			<span className="d-control flex-1 truncate text-(--d-faint)">{placeholder}</span>
			<Kbd>{hotkey}</Kbd>
		</span>
	);
}

function TextField({ value, focused }: { value: string; focused?: boolean }) {
	return (
		<span
			className={cn(
				"d-control flex h-7 items-center rounded-[6px] border bg-(--d-field) px-2 text-(--d-text)",
				focused ? "border-(color:--d-thread)" : "border-(color:--d-line)",
			)}
		>
			{value}
			{focused && <span className="ml-px h-4 w-px bg-(--d-thread)" />}
		</span>
	);
}

function Segmented({ items, active }: { items: { label: string; icon?: ReactNode }[]; active: number }) {
	return (
		<span className="inline-flex h-7 items-center gap-0.5 rounded-[6px] border border-(color:--d-line) p-0.5">
			{items.map((item, i) => (
				<span
					key={item.label}
					className={cn(
						"d-control flex h-[22px] items-center gap-1.5 rounded-[4px] px-2",
						i === active ? "bg-(--d-selected) text-(--d-text)" : "text-(--d-muted)",
					)}
				>
					{item.icon}
					{item.label}
				</span>
			))}
		</span>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-block h-4 w-7 shrink-0 rounded-full",
				on ? "bg-(--d-thread)" : "bg-(--d-line-strong)",
			)}
		>
			<span className={cn("absolute top-0.5 block size-3 rounded-full bg-[#ffffff]", on ? "left-3.5" : "left-0.5")} />
		</span>
	);
}

function WindowTab({ name, active, home: isHome }: { name: string; active?: boolean; home?: boolean }) {
	return (
		<span
			className={cn(
				"d-control flex h-7 shrink-0 items-center gap-2 rounded-[6px] px-2.5",
				active ? "bg-(--d-selected) text-(--d-text)" : "text-(--d-muted)",
			)}
		>
			{isHome && <IcHome />}
			<span>{name}</span>
			{active && !isHome && <IcClose className="-mr-1 size-3.5 text-(--d-muted)" />}
		</span>
	);
}

function CountChip({ n }: { n: number | string }) {
	return (
		<span className="d-micro inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-(--d-selected) px-1 text-(--d-muted)">
			{n}
		</span>
	);
}

function SelectionChip({ label }: { label: string }) {
	return (
		<span className="d-micro inline-flex h-5 items-center gap-1.5 rounded-[4px] bg-(--d-selected) pr-0.5 pl-1.5 text-(--d-text)">
			<span className="h-3 w-0.5 rounded-full bg-(--d-thread)" />
			{label}
			<IcClose className="size-3.5 text-(--d-faint)" />
		</span>
	);
}

function SizeChip() {
	return (
		<span className="d-micro inline-flex h-5 items-center rounded-[4px] bg-(--d-thread) px-1.5 text-(--d-on-thread)">
			{frameSize.w} × {frameSize.h}
		</span>
	);
}

function KindTag({ kind }: { kind: string }) {
	return (
		<span className="d-caption inline-flex h-5 items-center rounded-[4px] bg-(--d-thread) px-1.5 text-(--d-on-thread)">
			{kind}
		</span>
	);
}

function UnseenDot() {
	return (
		<span className="flex size-3.5 shrink-0 items-center justify-center">
			<span className="size-[5px] rounded-full bg-(--d-text)" />
		</span>
	);
}

type RowState = "rest" | "hover" | "selected";
function RailRow({
	kind,
	name,
	count,
	state = "rest",
	current,
	open,
	unseen,
}: {
	kind: "page" | "frame";
	name: string;
	count?: number;
	state?: RowState;
	current?: boolean;
	open?: boolean;
	unseen?: boolean;
}) {
	const lit = state !== "rest" || current;
	return (
		<div className="relative mx-2">
			{current && <span className="absolute top-1.5 -left-2 h-4 w-0.5 rounded-r-full bg-(--d-thread)" />}
			<div
				className={cn(
					"flex h-7 items-center gap-1.5 rounded-[6px] pr-2",
					kind === "page" ? "pl-1" : "pl-10",
					state === "selected" && "bg-(--d-selected)",
					state === "hover" && "bg-(--d-hover)",
					lit ? "text-(--d-text)" : "text-(--d-muted)",
				)}
			>
				{kind === "page" && <IcChevron className={cn("text-(--d-faint)", open && "rotate-90")} />}
				{kind === "page" ? <IcFolder /> : <IcFile />}
				<span className="d-code flex-1 truncate">{name}</span>
				{unseen && <UnseenDot />}
				{count !== undefined && <span className="d-micro text-(--d-faint)">{count}</span>}
			</div>
		</div>
	);
}

function PropField({ label, value, unit }: { label: string; value: number | string; unit: string }) {
	return (
		<span className="flex h-7 items-center gap-2 rounded-[6px] border border-(color:--d-line) bg-(--d-field) px-2">
			<span className="d-micro w-2 text-(--d-faint)">{label}</span>
			<span className="d-code flex-1 text-(--d-text)">{value}</span>
			<span className="d-micro text-(--d-faint)">{unit}</span>
		</span>
	);
}

function PropSection({ title, source, children }: { title: string; source: string; children: ReactNode }) {
	return (
		<section className="border-b border-(color:--d-line) pb-3">
			<div className="flex h-8 items-center justify-between px-4 pt-1">
				<span className="d-caption text-(--d-muted)">{title}</span>
				<span className="d-micro text-(--d-faint)">{source}</span>
			</div>
			<div className="grid grid-cols-2 gap-2 px-2">{children}</div>
		</section>
	);
}

function Menu() {
	return (
		<div className="w-[208px] rounded-[8px] border border-(color:--d-line-strong) bg-(--d-raised) p-1 shadow-(--d-float)">
			{menuItems.map((item, i) => (
				<div key={item.label}>
					{item.danger && <div className="mx-2 my-1 h-px bg-(--d-line)" />}
					<div
						className={cn(
							"d-control flex h-7 items-center justify-between rounded-[6px] px-2",
							i === 0 && "bg-(--d-selected)",
							item.danger ? "text-(--d-thread-text)" : "text-(--d-text)",
						)}
					>
						{item.label}
						<span className="d-micro text-(--d-faint)">{item.key}</span>
					</div>
				</div>
			))}
		</div>
	);
}

function Toast() {
	return (
		<div className="flex h-10 w-fit items-center gap-2 whitespace-nowrap rounded-[8px] border border-(color:--d-line-strong) bg-(--d-raised) pr-1 pl-3 shadow-(--d-float)">
			<span className="d-control text-(--d-text)">
				<span className="d-code">cart</span> moved to Trash
			</span>
			<Button kind="ghost">{toast.action}</Button>
		</div>
	);
}

function Tooltip() {
	return (
		<span className="d-caption inline-flex h-6 items-center gap-2 rounded-[6px] border border-(color:--d-line-strong) bg-(--d-raised) pr-1 pl-2 text-(--d-text) shadow-(--d-float)">
			Select
			<Kbd>V</Kbd>
		</span>
	);
}

/* ---------- window chrome ---------- */

function TopBar({ onHome }: { onHome?: boolean }) {
	return (
		<header className="flex h-10 shrink-0 items-center border-b border-(color:--d-line) bg-(--d-chrome) px-2">
			<WindowTab name="Home" home active={onHome} />
			<span className="mx-2 h-4 w-px bg-(--d-line-strong)" />
			<div className="flex items-center gap-1">
				{tabs.map((t) => (
					<WindowTab key={t.name} name={t.name} active={!onHome && t.active} />
				))}
				<IconButton>
					<IcPlus />
				</IconButton>
			</div>
			{!onHome && (
				<div className="ml-auto flex items-center gap-1">
					<IconButton active>
						<IcFlows />
					</IconButton>
					<span className="d-code w-12 text-center text-(--d-muted)">{zoom}</span>
					<span className="mx-1 h-4 w-px bg-(--d-line-strong)" />
					<IconButton>
						<IcHelp />
					</IconButton>
					<IconButton>
						<IcCog />
					</IconButton>
				</div>
			)}
		</header>
	);
}

function PagesRail() {
	return (
		<aside className="flex w-60 shrink-0 flex-col border-r border-(color:--d-line) bg-(--d-chrome)">
			<div className="flex h-10 shrink-0 items-center gap-2 border-b border-(color:--d-line) pr-2 pl-4">
				<span className="d-title">Pages</span>
				<CountChip n={pages.length} />
				<div className="ml-auto flex items-center">
					<IconButton>
						<IcPlus />
					</IconButton>
					<IconButton>
						<IcClose />
					</IconButton>
					<IconButton>
						<IcCollapseLeft />
					</IconButton>
				</div>
			</div>
			<div className="p-2">
				<SearchField placeholder="Find a frame" hotkey="/" />
			</div>
			<nav className="flex flex-1 flex-col">
				{pages.map((p) => (
					<div key={p.name}>
						<RailRow kind="page" name={p.name} count={p.count} current={p.current} open={p.open} />
						{p.open &&
							p.frames.map((f) => (
								<RailRow
									key={f.name}
									kind="frame"
									name={f.name}
									state={f.selected ? "selected" : "rest"}
									unseen={f.unseen}
								/>
							))}
					</div>
				))}
			</nav>
			<div className="flex h-10 shrink-0 items-center gap-2 border-t border-(color:--d-line) px-4">
				<span className="d-control text-(--d-text)">kaffe</span>
				<span className="ml-auto flex items-center gap-1.5">
					<span className="size-1.5 rounded-full bg-(--d-faint)" />
					<span className="d-caption text-(--d-muted)">On this Mac</span>
				</span>
			</div>
		</aside>
	);
}

/* ---------- canvas ---------- */

const FX = [32, 320, 608] as const;
const FY = 120;
const W = drawnSize.w;
const H = drawnSize.h;

function arrowHead(x: number, y: number, fromX: number, fromY: number) {
	const a = Math.atan2(y - fromY, x - fromX);
	const l = 7;
	const s = 3.5;
	const bx = x - Math.cos(a) * l;
	const by = y - Math.sin(a) * l;
	const px = -Math.sin(a) * s;
	const py = Math.cos(a) * s;
	return `M${x} ${y}L${bx + px} ${by + py}L${bx - px} ${by - py}Z`;
}

function Flows() {
	const cartX = FX[0];
	const menuX = FX[1];
	const receiptX = FX[2];
	const bottom = FY + H;
	const btnY = FY + H - 32;
	return (
		<svg className="pointer-events-none absolute inset-0 size-full text-(--d-thread)" aria-hidden="true">
			{/* menu → cart, from Checkout */}
			<path d={`M${menuX} ${btnY} C${menuX - 26} ${btnY}, ${cartX + W + 24} ${btnY - 56}, ${cartX + W + 2} ${btnY - 56}`} {...st} />
			<path d={arrowHead(cartX + W + 1, btnY - 56, cartX + W + 12, btnY - 56)} fill="currentColor" />
			{/* cart → receipt, from Pay, under menu */}
			<path d={`M${cartX + 180} ${bottom} C${cartX + 180} ${bottom + 92}, ${receiptX + 120} ${bottom + 92}, ${receiptX + 120} ${bottom + 9}`} {...st} />
			<path d={arrowHead(receiptX + 120, bottom + 1, receiptX + 120, bottom + 12)} fill="currentColor" />
			{/* receipt → menu, might */}
			<path
				d={`M${receiptX} ${FY + 150} C${receiptX - 24} ${FY + 150}, ${menuX + W + 24} ${FY + 196}, ${menuX + W + 9} ${FY + 196}`}
				{...st}
				strokeDasharray="3 3"
			/>
			<path d={arrowHead(menuX + W + 1, FY + 196, menuX + W + 12, FY + 196)} fill="currentColor" />
		</svg>
	);
}

function FrameOnCanvas({
	name,
	screen,
	i,
	selected,
	unseen,
	picked,
}: {
	name: string;
	screen: "menu" | "cart" | "receipt";
	i: number;
	selected?: boolean;
	unseen?: boolean;
	picked?: boolean;
}) {
	const x = FX[i] ?? 0;
	return (
		<div className="absolute" style={{ left: x, top: FY, width: W, height: H }}>
			<div className="absolute -top-6 right-0 left-0 flex h-4 items-center gap-1">
				<span className={cn("d-micro", selected ? "text-(--d-thread-text)" : "text-(--d-muted)")}>{name}</span>
				{unseen && <UnseenDot />}
				{selected && (
					<span className="d-micro ml-auto flex items-center gap-0.5 text-(--d-thread-text)">
						<IcPlay className="size-3" />
						play
					</span>
				)}
			</div>
			<div className="size-full">
				<CoffeeScreen screen={screen} />
			</div>
			{selected && (
				<>
					<div className="pointer-events-none absolute -inset-px rounded-[9px] border border-(color:--d-thread)" />
					{[
						[-4, -4],
						[W - 3, -4],
						[-4, H - 3],
						[W - 3, H - 3],
					].map(([hx, hy]) => (
						<span
							key={`${hx}-${hy}`}
							className="absolute size-[7px] border border-(color:--d-thread) bg-(--d-canvas)"
							style={{ left: hx, top: hy }}
						/>
					))}
					<div className="absolute right-0 left-0 flex justify-center" style={{ top: H + 8 }}>
						<SizeChip />
					</div>
				</>
			)}
			{picked && (
				<>
					<div
						className="pointer-events-none absolute rounded-[7px] border border-(color:--d-thread)"
						style={{ left: 16, top: 48, width: 208, height: 30 }}
					/>
					<div className="absolute flex justify-end" style={{ left: 16, top: 28, width: 208 }}>
						<KindTag kind={element.kind} />
					</div>
				</>
			)}
		</div>
	);
}

function Toolbar({ active }: { active: string }) {
	const icon = (name: string) =>
		name === "select" ? (
			<SelectIcon className="size-4" />
		) : name === "edit" ? (
			<EditIcon className="size-4" />
		) : (
			<HandIcon className="size-4" />
		);
	return (
		<div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[8px] border border-(color:--d-line-strong) bg-(--d-raised) p-1 shadow-(--d-float)">
			{tools.map((t) => (
				<IconButton key={t.name} active={t.name === active}>
					{icon(t.name)}
				</IconButton>
			))}
		</div>
	);
}

function Canvas({ mode }: { mode: "select" | "edit" }) {
	const current = pages.find((p) => p.current);
	return (
		<main className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-10 shrink-0 items-center gap-2 border-b border-(color:--d-line) bg-(--d-chrome) px-4">
				<IcFolder className="text-(--d-muted)" />
				<span className="d-code text-(--d-text)">{current?.name}</span>
				<span className="d-micro text-(--d-faint)">{current?.count} frames</span>
			</div>
			<div className="relative flex-1 overflow-hidden bg-(--d-canvas)">
				<Flows />
				{canvasFrames.map((f, i) => (
					<FrameOnCanvas
						key={f.name}
						i={i}
						name={f.name}
						screen={f.screen}
						selected={mode === "select" && "selected" in f && f.selected}
						unseen={"unseen" in f && f.unseen}
						picked={mode === "edit" && f.name === element.frame}
					/>
				))}
				<Toolbar active={mode} />
			</div>
		</main>
	);
}

/* ---------- inspector ---------- */

function InspectorHeader({ panel }: { panel: "properties" | "agent" }) {
	return (
		<div className="flex h-10 shrink-0 items-center justify-between border-b border-(color:--d-line) px-2">
			<Segmented
				items={[
					{ label: "Properties", icon: <IcSliders className="size-3.5" /> },
					{ label: "Agent", icon: <IcAgent className="size-3.5" /> },
				]}
				active={panel === "properties" ? 0 : 1}
			/>
			<IconButton>
				<IcCollapseRight />
			</IconButton>
		</div>
	);
}

function PropertiesPanel() {
	return (
		<>
			<div className="flex h-10 shrink-0 items-center gap-2 border-b border-(color:--d-line) pr-2 pl-4">
				<IcFile className="text-(--d-muted)" />
				<span className="d-code flex-1 text-(--d-text)">{selection.name}</span>
				<IconButton>
					<IcDots />
				</IconButton>
			</div>
			<PropSection title="Position" source={selection.source}>
				<PropField label="x" value={selection.x} unit="px" />
				<PropField label="y" value={selection.y} unit="px" />
			</PropSection>
			<PropSection title="Size" source={selection.source}>
				<PropField label="w" value={selection.w} unit="px" />
				<PropField label="h" value={selection.h} unit="px" />
			</PropSection>
		</>
	);
}

function AgentPanel() {
	const { turn } = agent;
	const edit = turn.edits[0];
	return (
		<>
			<div className="flex h-10 shrink-0 items-center gap-1 pr-2 pl-4">
				<span className="d-title text-(--d-text)">{agent.title}</span>
				<IcDown className="size-3.5 text-(--d-muted)" />
				<span className="ml-auto">
					<IconButton>
						<IcPlus />
					</IconButton>
				</span>
			</div>
			<div className="flex h-7 shrink-0 items-center justify-between border-b border-(color:--d-line) px-4 pb-1">
				<span className="d-code flex items-center gap-0.5 text-(--d-muted)">
					{agent.model}
					<IcChevron className="size-3.5" />
				</span>
				<span className="d-caption text-(--d-faint)">{agent.scope}</span>
			</div>
			<div className="flex flex-1 flex-col gap-4 overflow-hidden px-2 py-4">
				<div className="d-control ml-8 rounded-[8px] border border-(color:--d-line) bg-(--d-field) px-2 py-1.5 text-(--d-text)">
					{turn.ask}
				</div>
				<p className="d-control px-2 text-(--d-text)">{turn.said}</p>
				{edit && (
					<div className="flex h-7 items-center gap-2 rounded-[6px] border border-(color:--d-line) px-2">
						<IcFile className="text-(--d-muted)" />
						<span className="d-code flex-1 truncate text-(--d-muted)">{edit.path}</span>
						<span className="d-micro text-(--d-text)">+{edit.added}</span>
						<span className="d-micro text-(--d-faint)">−{edit.removed}</span>
					</div>
				)}
			</div>
			<div className="shrink-0 px-2 pb-2">
				<div className="flex min-h-[104px] flex-col gap-2 rounded-[8px] border border-(color:--d-line-strong) bg-(--d-field) p-2">
					<span className="flex">
						<SelectionChip label={element.chip} />
					</span>
					<span className="d-control px-1 text-(--d-faint)">{agent.placeholder}</span>
				</div>
				<div className="flex h-8 items-center justify-between pt-1">
					<Button kind="ghost">{agent.account}</Button>
					<span className="d-code flex items-center gap-0.5 pr-2 text-(--d-muted)">
						{agent.mode}
						<IcChevron className="size-3.5" />
					</span>
				</div>
			</div>
		</>
	);
}

function Inspector({ panel }: { panel: "properties" | "agent" }) {
	return (
		<aside className="flex w-80 shrink-0 flex-col border-l border-(color:--d-line) bg-(--d-chrome)">
			<InspectorHeader panel={panel} />
			{panel === "properties" ? <PropertiesPanel /> : <AgentPanel />}
		</aside>
	);
}

/* ---------- screens ---------- */

function Root({ appearance, children, className }: { appearance: Appearance; children: ReactNode; className?: string }) {
	return (
		<div data-appearance={appearance} className={cn("id-docked relative overflow-hidden", className)}>
			{children}
		</div>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	return (
		<Root appearance={appearance} className="flex h-[900px] w-[1440px] flex-col">
			<TopBar />
			<div className="flex min-h-0 flex-1">
				<PagesRail />
				<Canvas mode={panel === "agent" ? "edit" : "select"} />
				<Inspector panel={panel} />
			</div>
		</Root>
	);
}

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<Root appearance={appearance} className="flex h-[900px] w-[1440px] flex-col">
			<TopBar onHome />
			<div className="flex min-h-0 flex-1">
				<aside className="flex w-60 shrink-0 flex-col border-r border-(color:--d-line) bg-(--d-chrome)">
					<div className="flex h-10 shrink-0 items-center gap-2 border-b border-(color:--d-line) px-4">
						<SpoolMark className="h-4 w-3.5 text-(--d-thread)" />
						<span className="d-title">spool</span>
					</div>
					<nav className="flex flex-1 flex-col py-2">
						{home.nav.map((n) => (
							<div key={n} className="mx-2">
								<div className="d-control flex h-7 items-center gap-2 rounded-[6px] bg-(--d-selected) px-2 text-(--d-text)">
									<IcFolder />
									{n}
								</div>
							</div>
						))}
					</nav>
					<div className="flex h-10 shrink-0 items-center border-t border-(color:--d-line) px-2">
						<div className="d-control flex h-7 flex-1 items-center gap-2 rounded-[6px] px-2 text-(--d-muted)">
							<IcCog />
							{home.foot}
						</div>
					</div>
				</aside>
				<main className="min-w-0 flex-1 overflow-hidden bg-(--d-canvas)">
					<div className="flex h-10 items-center gap-2 border-b border-(color:--d-line) bg-(--d-chrome) pr-2 pl-10">
						<h1 className="d-title mr-auto text-(--d-text)">{home.title}</h1>
						<SearchField placeholder={home.search} hotkey={home.searchKey} className="w-60" />
						<Button>{home.actions[0]}</Button>
						<Button>{home.actions[1]}</Button>
						<Button kind="primary" icon={<IcPlus />}>
							{home.actions[2]}
						</Button>
					</div>
					<div className="px-10 pt-6">
						<div className="flex h-7 items-center">
							<span className="d-code text-(--d-muted)">{home.count}</span>
							<span className="ml-auto flex items-center">
								<span className="d-caption text-(--d-faint)">Sort by</span>
								<span className="d-control -mr-2 flex h-7 items-center gap-1 rounded-[6px] px-2 text-(--d-text)">
									{home.sort}
									<IcDown className="size-3.5 text-(--d-muted)" />
								</span>
							</span>
						</div>
						<div className="mt-4 grid grid-cols-3 gap-x-5 gap-y-8">
							{projects.map((p) => (
								<article key={p.name}>
									<div className="aspect-[16/10] overflow-hidden rounded-[8px] border border-(color:--d-line) bg-(--d-field)">
										<ProjectArtwork kind={p.art} className="h-full" />
									</div>
									<div className="mt-3 flex items-baseline justify-between">
										<span className="d-title text-(--d-text)">{p.name}</span>
										<span className="d-micro text-(--d-faint)">{p.when}</span>
									</div>
									<div className="d-micro text-(--d-muted)">
										{p.frames} {p.frames === 1 ? "frame" : "frames"}
									</div>
								</article>
							))}
						</div>
					</div>
				</main>
			</div>
		</Root>
	);
}

/* ---------- parts ---------- */

function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col items-start gap-2", className)}>
			<span className="d-micro text-(--d-faint)">{label}</span>
			{children}
		</section>
	);
}

const roles = [
	{ name: "title", cls: "d-title", spec: "sans 500 14/20", sample: "New chat" },
	{ name: "control", cls: "d-control", spec: "sans 400 13/20", sample: "Connect account" },
	{ name: "caption", cls: "d-caption", spec: "sans 400 12/16", sample: "For this new chat" },
	{ name: "code", cls: "d-code", spec: "mono 400 12/16", sample: "frames/app/cart" },
	{ name: "micro", cls: "d-micro", spec: "mono 400 11/16", sample: "390 × 844" },
];

const swatches = {
	dark: [
		["chrome", "#111110"],
		["canvas", "#181817"],
		["field", "#1d1d1c"],
		["raised", "#242423"],
		["line", "#262624"],
		["line-strong", "#373634"],
		["text", "#f0efed"],
		["muted", "#a19e99"],
		["faint", "#6f6c68"],
		["ink", "#f0efed"],
		["thread", "#f5391a"],
		["thread-text", "#ff5b3d"],
	],
	light: [
		["chrome", "#f4f3f0"],
		["canvas", "#e9e8e4"],
		["field", "#ffffff"],
		["raised", "#ffffff"],
		["line", "#e0ded9"],
		["line-strong", "#cdcbc5"],
		["text", "#1a1917"],
		["muted", "#63605b"],
		["faint", "#85827c"],
		["ink", "#1a1917"],
		["thread", "#f5391a"],
		["thread-text", "#d42e10"],
	],
} as const;

const rowStates: { label: string; row: ReactNode }[] = [
	{ label: "current", row: <RailRow kind="page" name="app" count={3} current open /> },
	{ label: "selected", row: <RailRow kind="frame" name="cart" state="selected" /> },
	{ label: "hover", row: <RailRow kind="frame" name="menu" state="hover" /> },
	{ label: "unseen", row: <RailRow kind="frame" name="receipt" unseen /> },
	{ label: "rest", row: <RailRow kind="page" name="site" count={2} /> },
];

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<Root appearance={appearance} className="flex h-[900px] w-[720px] flex-col px-6 pt-5 pb-6">
			<div className="flex h-7 items-center gap-2">
				<SpoolMark className="h-4 w-3.5 text-(--d-thread)" />
				<span className="d-title">docked</span>
				<span className="d-micro text-(--d-faint)">{appearance}</span>
				<span className="d-micro ml-auto text-(--d-faint)">4px grid · rows 28 · bars 40 · radius 4 / 6 / 8</span>
			</div>
			<div className="mt-5 grid grid-cols-3 gap-x-6">
				<div className="flex flex-col gap-5">
					<Spec label="button · 28 · radius 6">
						<div className="flex flex-wrap gap-2">
							<Button kind="primary" icon={<IcPlus />}>
								New project…
							</Button>
							<Button>Open…</Button>
							<Button kind="ghost">Undo</Button>
							<Button kind="danger">Move to Trash</Button>
							<IconButton>
								<IcCog />
							</IconButton>
							<IconButton hover>
								<IcHelp />
							</IconButton>
							<IconButton active>
								<IcFlows />
							</IconButton>
						</div>
					</Spec>
					<Spec label="input · search">
						<div className="flex w-full flex-col gap-2">
							<TextField value="cart" focused />
							<SearchField placeholder="Find a frame" hotkey="/" />
						</div>
					</Spec>
					<Spec label="segmented · panel tab">
						<Segmented
							items={[
								{ label: "Properties", icon: <IcSliders className="size-3.5" /> },
								{ label: "Agent", icon: <IcAgent className="size-3.5" /> },
							]}
							active={0}
						/>
					</Spec>
					<Spec label="chip · radius 4">
						<div className="flex flex-wrap items-center gap-2">
							<CountChip n={3} />
							<SizeChip />
							<KindTag kind={element.kind} />
							<SelectionChip label={element.chip} />
						</div>
					</Spec>
					<Spec label="bar · 40">
						<div className="flex h-10 w-full items-center gap-2 border-y border-(color:--d-line) pl-4">
							<span className="d-title">Pages</span>
							<CountChip n={pages.length} />
							<span className="ml-auto flex">
								<IconButton>
									<IcPlus />
								</IconButton>
								<IconButton>
									<IcCollapseLeft />
								</IconButton>
							</span>
						</div>
					</Spec>
				</div>
				<div className="flex flex-col gap-5">
					<Spec label="rail row · 28">
						<div className="-ml-2 flex w-[calc(100%+8px)] flex-col">
							{rowStates.map((s) => (
								<div key={s.label} className="flex items-center">
									<div className="relative min-w-0 flex-1">{s.row}</div>
									<span className="d-micro w-12 shrink-0 text-right text-(--d-faint)">{s.label}</span>
								</div>
							))}
						</div>
					</Spec>
					<Spec label="property row">
						<div className="w-full">
							<div className="flex h-7 items-center justify-between">
								<span className="d-caption text-(--d-muted)">Position</span>
								<span className="d-micro text-(--d-faint)">{selection.source}</span>
							</div>
							<div className="grid grid-cols-2 gap-2">
								<PropField label="x" value={selection.x} unit="px" />
								<PropField label="y" value={selection.y} unit="px" />
							</div>
						</div>
					</Spec>
					<Spec label="settings row">
						<div className="flex w-full items-start gap-4 border-y border-(color:--d-line) py-3">
							<div className="flex-1">
								<div className="d-control text-(--d-text)">{settingsRow.title}</div>
								<div className="d-caption text-(--d-muted)">{settingsRow.detail}</div>
							</div>
							<span className="pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>
				</div>
				<div className="flex flex-col gap-5">
					<Spec label="menu · floats · radius 8">
						<Menu />
					</Spec>
					<Spec label="tooltip">
						<Tooltip />
					</Spec>
					<Spec label="toast">
						<Toast />
					</Spec>
					<Spec label="window tab">
						<div className="flex items-center gap-1">
							<WindowTab name="Home" home />
							<WindowTab name="kaffe" active />
						</div>
					</Spec>
					<Spec label="toggle">
						<div className="flex items-center gap-3">
							<Toggle on />
							<Toggle on={false} />
						</div>
					</Spec>
				</div>
			</div>
			<div className="mt-auto grid grid-cols-3 gap-x-6">
				<Spec label="type · sans says, mono names" className="col-span-2">
					<div className="flex w-full flex-col">
						{roles.map((r) => (
							<div key={r.name} className="flex h-7 items-center gap-3 border-b border-(color:--d-line)">
								<span className="d-micro w-14 shrink-0 text-(--d-faint)">{r.name}</span>
								<span className={cn(r.cls, "flex-1 truncate text-(--d-text)")}>{r.sample}</span>
								<span className="d-micro text-(--d-muted)">{r.spec}</span>
							</div>
						))}
					</div>
				</Spec>
				<Spec label="palette">
					<div className="flex w-full flex-col gap-1">
						{swatches[appearance].map(([name, hex]) => (
							<div key={name} className="flex items-center gap-2">
								<span
									className="size-4 shrink-0 rounded-[4px] border border-(color:--d-line-strong)"
									style={{ background: hex }}
								/>
								<span className="flex min-w-0 flex-col">
									<span className="d-micro truncate text-(--d-muted)">{name}</span>
								</span>
								<span className="d-micro ml-auto text-(--d-faint)">{hex}</span>
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
		<div className="flex h-[900px] w-[1440px]">
			<Board appearance="dark" />
			<Board appearance="light" />
		</div>
	);
}
