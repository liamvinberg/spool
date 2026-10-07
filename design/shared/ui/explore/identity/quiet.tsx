import type { ReactNode } from "react";
import {
	type Appearance,
	agent,
	canvasFrames,
	drawnSize,
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
} from "shared/lib/explore/identity/world";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { projects } from "shared/ui/demo/home-data";
import { HandIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import "./quiet.css";

/*
 * quiet: pro-tool restraint, drawn over spool 0.31.1's real window.
 *
 * Rules the Parts sheet shows and every screen keeps:
 * - 4px grid. Controls, rows and tabs are 28 tall; bars and panel headers 40; chips 20.
 * - Radius by tier: 4 for marks inside a control (keys, chips, handles), 6 for
 *   anything you click or read in, 10 for a surface that holds controls or floats.
 * - Planes: well < base < surface < raised. Navigation sits on base, the work sits in
 *   the well, floating things are raised and wear the one shadow token.
 * - Sans for what you click or read as words (names, buttons, sentences); mono for what
 *   you read off a file or a ruler (paths, numbers, units, keys, status lines).
 * - Selection is a tinted fill. Red marks only the selected thing on the canvas, the
 *   unseen dot, the primary button and the active tab.
 */

/* ---------- icons: 16px box, 1.25 stroke, round joins ---------- */

const s = {
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

type IcProps = { className?: string };

const IcHouse = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M2.75 7.25 8 2.75l5.25 4.5v5.5a.5.5 0 0 1-.5.5H9.75V9.5h-3.5v3.75h-3a.5.5 0 0 1-.5-.5Z" {...s} />
	</Ic>
);
const IcFolder = ({ className, filled }: IcProps & { filled?: boolean }) => (
	<Ic className={className}>
		<path
			d="M2.25 4.25a1 1 0 0 1 1-1h2.9l1.4 1.5h5.2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1Z"
			{...s}
			fill={filled ? "currentColor" : "none"}
			fillOpacity={filled ? 0.18 : undefined}
		/>
	</Ic>
);
const IcFile = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M4.25 2.25h4.5l3 3v8a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5Z" {...s} />
		<path d="M8.75 2.25v3h3" {...s} />
	</Ic>
);
const IcChevron = ({ className, dir = "right" }: IcProps & { dir?: "right" | "down" | "left" }) => (
	<Ic className={className}>
		<path
			d={dir === "down" ? "m5 6.5 3 3 3-3" : dir === "left" ? "m9.5 5-3 3 3 3" : "m6.5 5 3 3-3 3"}
			{...s}
		/>
	</Ic>
);
const IcPlus = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M8 3.5v9M3.5 8h9" {...s} />
	</Ic>
);
const IcClose = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="m4.75 4.75 6.5 6.5M11.25 4.75l-6.5 6.5" {...s} />
	</Ic>
);
const IcDots = ({ className }: IcProps) => (
	<Ic className={className}>
		<circle cx="3.75" cy="8" r="1" fill="currentColor" />
		<circle cx="8" cy="8" r="1" fill="currentColor" />
		<circle cx="12.25" cy="8" r="1" fill="currentColor" />
	</Ic>
);
const IcSearch = ({ className }: IcProps) => (
	<Ic className={className}>
		<circle cx="7.25" cy="7.25" r="4" {...s} />
		<path d="m10.25 10.25 3 3" {...s} />
	</Ic>
);
const IcPlay = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M5 3.6v8.8a.4.4 0 0 0 .6.34l7-4.4a.4.4 0 0 0 0-.68l-7-4.4a.4.4 0 0 0-.6.34Z" fill="currentColor" />
	</Ic>
);
const IcPointer = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M3.5 3 12.75 6.9 8.6 8.6l-1.7 4.15Z" {...s} />
	</Ic>
);
const IcEdit = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M6 2.75H3.75a1 1 0 0 0-1 1V6M2.75 9.25v2.25a1 1 0 0 0 1 1H6M10 2.75h2.25a1 1 0 0 1 1 1V6" {...s} />
		<path d="m8.25 8.25 5 2-2.1.85-.85 2.1Z" {...s} />
	</Ic>
);
const IcHand = ({ className }: IcProps) => <HandIcon className={cn("size-4 shrink-0", className)} />;
const IcFlows = ({ className }: IcProps) => (
	<Ic className={className}>
		<circle cx="4.25" cy="4.75" r="1.75" {...s} />
		<circle cx="11.75" cy="11.25" r="1.75" {...s} />
		<path d="M5.6 6.1 10.4 9.9" {...s} />
	</Ic>
);
const IcSliders = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M5 2.75v10.5M11 2.75v10.5" {...s} />
		<rect x="3.5" y="5" width="3" height="2.5" rx="0.75" {...s} fill="currentColor" />
		<rect x="9.5" y="8.5" width="3" height="2.5" rx="0.75" {...s} fill="currentColor" />
	</Ic>
);
const IcAgent = ({ className }: IcProps) => (
	<Ic className={className}>
		<path d="M3.25 3.25h9.5a.5.5 0 0 1 .5.5v6.5a.5.5 0 0 1-.5.5H7.5l-3 2.25V10.75H3.25a.5.5 0 0 1-.5-.5v-6.5a.5.5 0 0 1 .5-.5Z" {...s} />
		<path d="M5.5 6.25h5M5.5 8.25h3" {...s} />
	</Ic>
);
const IcHelp = ({ className }: IcProps) => (
	<Ic className={className}>
		<circle cx="8" cy="8" r="5.5" {...s} />
		<path d="M6.5 6.4a1.6 1.6 0 1 1 2.2 1.5c-.45.2-.7.55-.7 1v.35" {...s} />
		<circle cx="8" cy="11" r="0.7" fill="currentColor" />
	</Ic>
);
const IcCog = ({ className }: IcProps) => (
	<Ic className={className}>
		<circle cx="8" cy="8" r="2" {...s} />
		<path
			d="M8 2.25v1.5M8 12.25v1.5M2.25 8h1.5M12.25 8h1.5M3.95 3.95l1.05 1.05M11 11l1.05 1.05M3.95 12.05 5 11M11 5l1.05-1.05"
			{...s}
		/>
	</Ic>
);
const IcGrid = ({ className }: IcProps) => (
	<Ic className={className}>
		<rect x="2.75" y="2.75" width="4.25" height="4.25" rx="1" {...s} />
		<rect x="9" y="2.75" width="4.25" height="4.25" rx="1" {...s} />
		<rect x="2.75" y="9" width="4.25" height="4.25" rx="1" {...s} />
		<rect x="9" y="9" width="4.25" height="4.25" rx="1" {...s} />
	</Ic>
);

/* ---------- primitives ---------- */

type Intent = "primary" | "secondary" | "ghost" | "danger";

const intents: Record<Intent, string> = {
	primary: "bg-(--q-thread) text-(--q-on-thread) q-heading",
	secondary: "bg-(--q-surface) text-(--q-text) shadow-[inset_0_0_0_1px_var(--q-line-2)] q-body",
	ghost: "text-(--q-text-2) q-body",
	danger: "bg-(--q-surface) text-(--q-danger) shadow-[inset_0_0_0_1px_var(--q-line-2)] q-body",
};

function Button({
	intent = "secondary",
	icon,
	children,
	hover,
	className,
}: {
	intent?: Intent;
	icon?: ReactNode;
	children: ReactNode;
	hover?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5",
				intents[intent],
				icon && "pl-2",
				hover && intent === "ghost" && "bg-(--q-fill) text-(--q-text)",
				hover && intent === "secondary" && "bg-(--q-raised)",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

function IconButton({ children, on, hover, className }: { children: ReactNode; on?: boolean; hover?: boolean; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] text-(--q-text-2)",
				hover && "bg-(--q-fill) text-(--q-text)",
				on && "bg-(--q-fill-2) text-(--q-text)",
				className,
			)}
		>
			{children}
		</span>
	);
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[4px] px-1 q-mono-sm text-(--q-text-2) shadow-[inset_0_0_0_1px_var(--q-line-2)]">
			{children}
		</kbd>
	);
}

function Count({ children }: { children: ReactNode }) {
	return <span className="min-w-4 shrink-0 text-right q-mono-sm text-(--q-text-3)">{children}</span>;
}

function Dot() {
	return <span className="size-1.5 shrink-0 rounded-full bg-(--q-thread)" />;
}

function SizeChip() {
	return (
		<span className="inline-flex h-5 shrink-0 whitespace-nowrap items-center rounded-[4px] bg-(--q-thread) px-1.5 q-mono-sm text-(--q-on-thread)">
			{frameSize.w} × {frameSize.h}
		</span>
	);
}

function KindTag() {
	return (
		<span className="inline-flex h-5 items-center rounded-[4px] bg-(--q-thread) px-1.5 q-mono-sm text-(--q-on-thread)">
			{element.kind}
		</span>
	);
}

function SelectionChip() {
	return (
		<span className="inline-flex h-5 max-w-full items-center gap-1.5 rounded-[4px] bg-(--q-fill-2) pl-1.5 pr-0.5">
			<span className="h-2.5 w-0.5 shrink-0 rounded-full bg-(--q-thread)" />
			<span className="truncate q-mono-sm text-(--q-text)">{element.chip}</span>
			<IcClose className="size-3.5 text-(--q-text-3)" />
		</span>
	);
}

function Field({
	prefix,
	value,
	unit,
	className,
}: {
	prefix: string;
	value: ReactNode;
	unit?: string;
	className?: string;
}) {
	return (
		<span className={cn("flex h-7 min-w-0 items-center gap-2 rounded-[6px] bg-(--q-fill) px-2", className)}>
			<span className="w-2.5 q-mono text-(--q-text-3)">{prefix}</span>
			<span className="min-w-0 flex-1 truncate q-mono text-(--q-text)">{value}</span>
			{unit ? <span className="q-mono-sm text-(--q-text-3)">{unit}</span> : null}
		</span>
	);
}

function Search({ className, placeholder }: { className?: string; placeholder: string }) {
	return (
		<span
			className={cn(
				"flex h-7 items-center gap-2 rounded-[6px] bg-(--q-surface) pl-2 pr-1 shadow-[inset_0_0_0_1px_var(--q-line-2)]",
				className,
			)}
		>
			<IcSearch className="text-(--q-text-3)" />
			<span className="min-w-0 flex-1 truncate q-body text-(--q-text-3)">{placeholder}</span>
			<Kbd>{home.searchKey}</Kbd>
		</span>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full",
				on ? "bg-(--q-on)" : "bg-(--q-fill-2) shadow-[inset_0_0_0_1px_var(--q-line-2)]",
			)}
		>
			<span
				className={cn(
					"absolute top-0.5 size-3 rounded-full",
					on ? "left-[14px] bg-(--q-knob)" : "left-0.5 bg-(--q-text-3)",
				)}
			/>
		</span>
	);
}

function Segmented({ items, active }: { items: string[]; active: number }) {
	return (
		<span className="inline-flex h-7 items-center gap-0.5 rounded-[6px] bg-(--q-fill) p-0.5">
			{items.map((item, i) => (
				<span
					key={item}
					className={cn(
						"flex h-6 items-center rounded-[4px] px-2 q-body",
						i === active
							? "bg-(--q-raised) text-(--q-text) shadow-[0_0_0_1px_var(--q-line-2)]"
							: "text-(--q-text-2)",
					)}
				>
					{item}
				</span>
			))}
		</span>
	);
}

/* ---------- the pages rail ---------- */

type RowState = "rest" | "hover" | "selected";

/** The one list row: 28 tall, 6 radius, 8 in from its column; state is a fill and nothing else. */
function PageRow({
	name,
	count,
	open,
	current,
	state = "rest",
}: {
	name: string;
	count: number;
	open?: boolean;
	current?: boolean;
	state?: RowState;
}) {
	return (
		<div
			className={cn(
				"flex h-7 items-center rounded-[6px] px-2",
				state === "hover" && "bg-(--q-fill)",
				state === "selected" && "bg-(--q-fill-2)",
			)}
		>
			<IcChevron dir={open ? "down" : "right"} className="text-(--q-text-3)" />
			<IcFolder
				filled={current}
				className={cn("ml-1", current ? "text-(--q-text)" : "text-(--q-text-3)")}
			/>
			<span
				className={cn(
					"ml-2 min-w-0 flex-1 truncate q-body",
					current || state !== "rest" ? "text-(--q-text)" : "text-(--q-text-2)",
				)}
			>
				{name}
			</span>
			<Count>{count}</Count>
		</div>
	);
}

function FrameRow({ name, state = "rest", unseen }: { name: string; state?: RowState; unseen?: boolean }) {
	const lit = state !== "rest" || unseen;
	return (
		<div
			className={cn(
				"flex h-7 items-center rounded-[6px] pl-10 pr-2",
				state === "hover" && "bg-(--q-fill)",
				state === "selected" && "bg-(--q-fill-2)",
			)}
		>
			<IcFile className={lit ? "text-(--q-text-2)" : "text-(--q-text-3)"} />
			<span className={cn("ml-2 min-w-0 flex-1 truncate q-body", lit ? "text-(--q-text)" : "text-(--q-text-2)")}>
				{name}
			</span>
			{unseen ? (
				<span className="flex min-w-4 justify-end">
					<Dot />
				</span>
			) : null}
		</div>
	);
}

function PagesRail() {
	return (
		<aside className="flex shrink-0 flex-col" style={{ width: RAIL }}>
			<div className="flex h-10 shrink-0 items-center pl-4 pr-2">
				<span className="q-heading text-(--q-text)">Pages</span>
				<span className="ml-2 q-mono-sm text-(--q-text-3)">{pages.length}</span>
				<span className="ml-auto flex items-center">
					<IconButton>
						<IcPlus />
					</IconButton>
					<IconButton>
						<IcClose />
					</IconButton>
					<IconButton>
						<IcChevron dir="left" />
					</IconButton>
				</span>
			</div>
			<div className="flex flex-col gap-px px-2">
				{pages.map((page) => (
					<div key={page.name} className="flex flex-col gap-px">
						<PageRow name={page.name} count={page.count} open={page.open} current={page.current} />
						{page.open
							? page.frames.map((frame) => (
									<FrameRow
										key={frame.name}
										name={frame.name}
										state={frame.selected ? "selected" : "rest"}
										unseen={frame.unseen}
									/>
								))
							: null}
					</div>
				))}
			</div>
			<div className="mt-auto flex h-10 shrink-0 items-center px-4">
				<span className="q-mono-sm text-(--q-text-3)">{railHint}</span>
			</div>
		</aside>
	);
}

/* ---------- the window ---------- */

const TOP = 40;
const RAIL = 240;
const PANEL = 300;
const STRIP = 44;
const INSET = 8;

function Window({
	appearance,
	home: onHome,
	children,
	right,
}: {
	appearance: Appearance;
	home?: boolean;
	children: ReactNode;
	right?: ReactNode;
}) {
	return (
		<div
			data-appearance={appearance}
			className="id-quiet relative flex h-full w-full flex-col overflow-hidden bg-(--q-base)"
		>
			<TopBar onHome={onHome} />
			<div className="flex min-h-0 flex-1">{children}</div>
			{right}
		</div>
	);
}

function TabMark() {
	return <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-(--q-thread)" />;
}

function TopBar({ onHome }: { onHome?: boolean }) {
	return (
		<header className="flex shrink-0 items-center pl-2 pr-2" style={{ height: TOP }}>
			<span className="relative flex h-10 items-center">
				<span
					className={cn(
						"flex h-7 items-center gap-2 rounded-[6px] px-2 q-body",
						onHome ? "text-(--q-text)" : "text-(--q-text-2)",
					)}
				>
					<IcHouse className={onHome ? "text-(--q-text)" : "text-(--q-text-3)"} />
					Home
				</span>
				{onHome ? <TabMark /> : null}
			</span>
			<span className="mx-2 h-4 w-px bg-(--q-line-2)" />
			{tabs.map((tab) => {
				const active = !onHome && tab.active;
				return (
					<span key={tab.name} className="relative flex h-10 items-center">
						<span
							className={cn(
								"flex h-7 items-center rounded-[6px] px-2.5 q-body",
								active ? "gap-1 pr-1 text-(--q-text)" : "text-(--q-text-2)",
							)}
						>
							{tab.name}
							{active ? (
								<span className="flex size-5 items-center justify-center rounded-[4px] text-(--q-text-3)">
									<IcClose className="size-3.5" />
								</span>
							) : null}
						</span>
						{active ? <TabMark /> : null}
					</span>
				);
			})}
			<IconButton className="ml-1">
				<IcPlus />
			</IconButton>
			{onHome ? null : (
				<span className="ml-auto flex items-center gap-1">
					<IconButton on>
						<IcFlows />
					</IconButton>
					<span className="flex h-7 w-11 items-center justify-center rounded-[6px] q-mono-sm text-(--q-text-2)">
						{zoom}
					</span>
				</span>
			)}
		</header>
	);
}

/** The work's plane: the canvas, and Home's grid, sit in the well. */
function Well({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<main
			className={cn(
				"relative min-w-0 flex-1 overflow-hidden rounded-[10px] bg-(--q-well) shadow-[inset_0_0_0_1px_var(--q-line)]",
				className,
			)}
			style={{ marginBottom: INSET }}
		>
			{children}
		</main>
	);
}

/* ---------- the canvas ---------- */

const GAP = 48;
const FRAME_LEFT = 16;
const FRAME_TOP = 138;
const W = drawnSize.w;
const H = drawnSize.h;
const xs = canvasFrames.map((_, i) => FRAME_LEFT + i * (W + GAP));
const xOf = (name: string) => xs[canvasFrames.findIndex((f) => f.name === name)]!;

/** The picked element inside cart, in the frame's own drawn pixels: the first cart row. */
const PICK = { x: 17, y: 51, w: 206, h: 28 };

function arrowHead(x: number, y: number, angle: number) {
	const a = 0.5;
	const l = 6;
	const p1 = [x - l * Math.cos(angle - a), y - l * Math.sin(angle - a)];
	const p2 = [x - l * Math.cos(angle + a), y - l * Math.sin(angle + a)];
	return `M${p1[0]!.toFixed(2)} ${p1[1]!.toFixed(2)}L${x} ${y}L${p2[0]!.toFixed(2)} ${p2[1]!.toFixed(2)}`;
}

function Flows() {
	const cart = xOf("cart");
	const menu = xOf("menu");
	const receipt = xOf("receipt");
	const bottom = FRAME_TOP + H;
	const paths: { key: string; d: string; head: string; might?: boolean }[] = [];
	for (const flow of flows) {
		if (flow.from === "menu" && flow.to === "cart") {
			const y = FRAME_TOP + H - 31;
			const x1 = menu - 6;
			const x2 = cart + W + 6;
			paths.push({
				key: "menu-cart",
				d: `M${x1} ${y}H${x2}`,
				head: arrowHead(x2, y, Math.PI),
			});
		} else if (flow.from === "cart" && flow.to === "receipt") {
			const x1 = cart + 196;
			const x2 = receipt + W / 2;
			const y = bottom + 4;
			paths.push({
				key: "cart-receipt",
				d: `M${x1} ${y}C${x1} ${y + 72} ${x2} ${y + 72} ${x2} ${y}`,
				head: arrowHead(x2, y, -Math.PI / 2),
			});
		} else {
			const y = FRAME_TOP + H / 2;
			const x1 = receipt - 6;
			const x2 = menu + W + 6;
			paths.push({
				key: "receipt-menu",
				d: `M${x1} ${y}H${x2}`,
				head: arrowHead(x2, y, Math.PI),
				might: flow.certainty === "might",
			});
		}
	}
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full text-(--q-text-3)" aria-hidden="true">
			{paths.map((p) => (
				<g key={p.key} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
					<path d={p.d} strokeDasharray={p.might ? "3 3" : undefined} />
					<path d={p.head} />
				</g>
			))}
		</svg>
	);
}

function FrameLabel({ name, selected, unseen }: { name: string; selected?: boolean; unseen?: boolean }) {
	return (
		<div className="absolute flex h-5 items-center gap-1.5" style={{ left: 0, top: -28, width: W }}>
			{unseen ? <Dot /> : null}
			<span className={cn("q-small", selected ? "text-(--q-text)" : "text-(--q-text-2)")}>{name}</span>
			{selected ? (
				<span className="ml-auto flex items-center gap-1 text-(--q-text-2)">
					<IcPlay className="size-3" />
					<span className="q-small">play</span>
				</span>
			) : null}
		</div>
	);
}

function SelectionMarks() {
	const corners = [
		[0, 0],
		[W, 0],
		[0, H],
		[W, H],
	] as const;
	return (
		<>
			<div
				className="pointer-events-none absolute rounded-[11px] border border-(--q-thread)"
				style={{ left: -3, top: -3, width: W + 6, height: H + 6 }}
			/>
			{corners.map(([cx, cy]) => (
				<span
					key={`${cx}-${cy}`}
					className="absolute size-[7px] rounded-[2px] border border-(--q-thread) bg-(--q-base)"
					style={{ left: cx - 6.5 + (cx ? 6 : 0), top: cy - 6.5 + (cy ? 6 : 0) }}
				/>
			))}
			<div className="absolute flex justify-center" style={{ left: 0, top: H + 12, width: W }}>
				<SizeChip />
			</div>
		</>
	);
}

function PickMarks() {
	return (
		<>
			<div
				className="pointer-events-none absolute rounded-[6px] border border-(--q-thread)"
				style={{ left: PICK.x - 2, top: PICK.y - 2, width: PICK.w + 4, height: PICK.h + 4 }}
			/>
			<div className="absolute flex justify-end" style={{ left: PICK.x - 2, top: PICK.y - 2 - 20, width: PICK.w + 4 }}>
				<KindTag />
			</div>
		</>
	);
}

function Toolbar({ active }: { active: string }) {
	const icon = { select: <IcPointer />, edit: <IcEdit />, hand: <IcHand /> } as Record<string, ReactNode>;
	return (
		<div className="q-floating absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] bg-(--q-raised) p-1">
			{tools.map((tool) => (
				<IconButton key={tool.name} on={tool.name === active}>
					{icon[tool.name]}
				</IconButton>
			))}
		</div>
	);
}

function Canvas({ mode }: { mode: "select" | "edit" }) {
	return (
		<Well>
			<Flows />
			{canvasFrames.map((frame, i) => {
				const selected = mode === "select" && "selected" in frame && frame.selected;
				const picked = mode === "edit" && frame.name === element.frame;
				return (
					<div key={frame.name} className="absolute" style={{ left: xs[i], top: FRAME_TOP, width: W, height: H }}>
						<FrameLabel
							name={frame.name}
							selected={selected || picked}
							unseen={"unseen" in frame && frame.unseen}
						/>
						<div className="h-full w-full">
							<CoffeeScreen screen={frame.screen} />
						</div>
						{selected ? <SelectionMarks /> : null}
						{picked ? <PickMarks /> : null}
					</div>
				);
			})}
			<Toolbar active={mode} />
		</Well>
	);
}

/* ---------- the right side ---------- */

function PanelHeader({ children, actions }: { children: ReactNode; actions: ReactNode }) {
	return (
		<div className="flex h-10 shrink-0 items-center pl-2 pr-0">
			{children}
			<span className="ml-auto flex items-center">
				{actions}
				<IconButton>
					<IcChevron />
				</IconButton>
			</span>
		</div>
	);
}

function SectionHead({ title, source }: { title: string; source?: string }) {
	return (
		<div className="flex h-7 items-center px-2">
			<span className="q-small text-(--q-text-2)">{title}</span>
			{source ? <span className="ml-auto q-mono-sm text-(--q-text-3)">{source}</span> : null}
		</div>
	);
}

function PropertyRow({ a, b, flush }: { a: [string, number]; b: [string, number]; flush?: boolean }) {
	return (
		<div className={cn("grid grid-cols-2 gap-2", !flush && "px-2")}>
			<Field prefix={a[0]} value={a[1]} unit="px" />
			<Field prefix={b[0]} value={b[1]} unit="px" />
		</div>
	);
}

function PropertiesPanel() {
	return (
		<>
			<PanelHeader
				actions={
					<IconButton>
						<IcDots />
					</IconButton>
				}
			>
				<span className="q-heading text-(--q-text)">{selection.name}</span>
			</PanelHeader>
			<div className="flex flex-col gap-1">
				<SectionHead title="Position" source={selection.source} />
				<PropertyRow a={["x", selection.x]} b={["y", selection.y]} />
			</div>
			<div className="mt-4 flex flex-col gap-1">
				<SectionHead title="Size" source={selection.source} />
				<PropertyRow a={["w", selection.w]} b={["h", selection.h]} />
			</div>
		</>
	);
}

function EditedFile({ path, added, removed }: { path: string; added: number; removed: number }) {
	return (
		<div className="flex h-7 items-center gap-2 rounded-[6px] bg-(--q-fill) px-2">
			<IcFile className="text-(--q-text-3)" />
			<span className="min-w-0 flex-1 truncate q-mono text-(--q-text-2)">{path}</span>
			<span className="q-mono-sm text-(--q-text-2)">+{added}</span>
			<span className="q-mono-sm text-(--q-text-3)">−{removed}</span>
		</div>
	);
}

function Composer() {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-col gap-2 rounded-[10px] bg-(--q-surface) p-2 shadow-[inset_0_0_0_1px_var(--q-line-2)]">
				<div className="flex">
					<SelectionChip />
				</div>
				<span className="h-12 px-1 q-body text-(--q-text-3)">{agent.placeholder}</span>
			</div>
			<div className="flex items-center justify-between px-1">
				<Button intent="ghost" className="px-2">
					{agent.account}
				</Button>
				<span className="flex h-7 items-center gap-0.5 rounded-[6px] pl-2 pr-1 q-body text-(--q-text-2)">
					{agent.mode}
					<IcChevron className="text-(--q-text-3)" />
				</span>
			</div>
		</div>
	);
}

function AgentPanel() {
	const turn = agent.turn;
	return (
		<>
			<PanelHeader
				actions={
					<IconButton>
						<IcPlus />
					</IconButton>
				}
			>
				<span className="flex h-7 items-center gap-0.5 rounded-[6px] pl-0 pr-1">
					<span className="q-heading text-(--q-text)">{agent.title}</span>
					<IcChevron dir="down" className="text-(--q-text-3)" />
				</span>
			</PanelHeader>
			<div className="flex h-7 items-center px-2">
				<span className="flex items-center gap-0.5 q-body text-(--q-text-2)">
					{agent.model}
					<IcChevron className="text-(--q-text-3)" />
				</span>
				<span className="ml-auto q-small text-(--q-text-3)">{agent.scope}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-end gap-4 px-2 pb-4">
				<div className="rounded-[6px] bg-(--q-fill) px-3 py-2 q-body text-(--q-text)">{turn.ask}</div>
				<div className="flex flex-col gap-2">
					<span className="flex items-center gap-1.5">
						<SpoolMark className="h-3.5 w-3 text-(--q-thread)" />
						<span className="q-small text-(--q-text-3)">{agent.model}</span>
					</span>
					<p className="q-body text-(--q-text)">{turn.said}</p>
					{turn.edits.map((edit) => (
						<EditedFile key={edit.path} {...edit} />
					))}
				</div>
			</div>
			<div className="px-2 pb-2">
				<Composer />
			</div>
		</>
	);
}

function Strip({ panel }: { panel: "properties" | "agent" }) {
	return (
		<nav
			className="flex shrink-0 flex-col items-center gap-1 border-l border-(--q-line) pb-2 pt-1.5"
			style={{ width: STRIP }}
		>
			<IconButton on={panel === "properties"}>
				<IcSliders />
			</IconButton>
			<IconButton on={panel === "agent"}>
				<IcAgent />
			</IconButton>
			<span className="mt-auto" />
			<IconButton>
				<IcHelp />
			</IconButton>
			<IconButton>
				<IcCog />
			</IconButton>
		</nav>
	);
}

export function IdentityCanvas({ appearance, panel }: { appearance: Appearance; panel: "properties" | "agent" }) {
	return (
		<Window appearance={appearance}>
			<PagesRail />
			<Canvas mode={panel === "agent" ? "edit" : "select"} />
			<aside className="flex shrink-0 flex-col px-2" style={{ width: PANEL, marginLeft: INSET - 8 }}>
				{panel === "agent" ? <AgentPanel /> : <PropertiesPanel />}
			</aside>
			<Strip panel={panel} />
		</Window>
	);
}

/* ---------- home ---------- */

export function IdentityHome({ appearance }: { appearance: Appearance }) {
	return (
		<Window appearance={appearance} home>
			<aside className="flex shrink-0 flex-col px-2" style={{ width: RAIL }}>
				<div className="flex h-10 items-center gap-2 px-2">
					<SpoolMark className="h-[18px] w-[14px] text-(--q-thread)" />
					<span className="q-heading text-(--q-text)">spool</span>
				</div>
				<div className="mt-1 flex h-7 items-center gap-2 rounded-[6px] bg-(--q-fill-2) px-2">
					<IcGrid className="text-(--q-text-2)" />
					<span className="q-body text-(--q-text)">{home.nav[0]}</span>
				</div>
				<div className="mt-auto mb-2 flex h-7 items-center gap-2 rounded-[6px] px-2">
					<IcCog className="text-(--q-text-3)" />
					<span className="q-body text-(--q-text-2)">{home.foot}</span>
				</div>
			</aside>
			<Well className="mr-2 px-11 pt-8">
				<div className="flex h-7 items-center">
					<h1 className="q-title text-(--q-text)">{home.title}</h1>
					<span className="ml-auto flex items-center gap-2">
						<Search className="w-60" placeholder={home.search} />
						<Button>{home.actions[0]}</Button>
						<Button>{home.actions[1]}</Button>
						<Button intent="primary" icon={<IcPlus />}>
							{home.actions[2]}
						</Button>
					</span>
				</div>
				<div className="mt-5 flex h-7 items-center">
					<span className="q-mono-sm text-(--q-text-3)">{home.count}</span>
					<span className="ml-auto flex h-7 items-center gap-1 rounded-[6px] pl-2 pr-1">
						<span className="q-body text-(--q-text-3)">Sort by</span>
						<span className="q-body text-(--q-text)">{home.sort}</span>
						<IcChevron dir="down" className="text-(--q-text-3)" />
					</span>
				</div>
				<div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-8">
					{projects.map((p) => (
						<div key={p.name} className="flex flex-col">
							<div className="h-[220px] overflow-hidden rounded-[6px] bg-(--q-surface) shadow-[0_0_0_1px_var(--q-line)]">
								<ProjectArtwork kind={p.art} className="h-full w-full" />
							</div>
							<div className="mt-3 flex h-5 items-center">
								<span className="q-heading text-(--q-text)">{p.name}</span>
								<span className="ml-auto q-mono-sm text-(--q-text-3)">{p.frames} frames</span>
							</div>
							<span className="q-mono-sm text-(--q-text-3)">{p.when}</span>
						</div>
					))}
				</div>
			</Well>
		</Window>
	);
}

/* ---------- parts ---------- */

const swatches = [
	["well", "--q-well"],
	["base", "--q-base"],
	["surface", "--q-surface"],
	["raised", "--q-raised"],
	["line", "--q-line"],
	["line-2", "--q-line-2"],
	["text", "--q-text"],
	["text-2", "--q-text-2"],
	["text-3", "--q-text-3"],
	["thread", "--q-thread"],
] as const;

const hex: Record<Appearance, Record<string, string>> = {
	dark: {
		well: "#0c0c0b",
		base: "#151514",
		surface: "#1c1c1a",
		raised: "#242422",
		line: "#232321",
		"line-2": "#31302d",
		text: "#eeede9",
		"text-2": "#a3a09a",
		"text-3": "#75726c",
		thread: "#f5391a",
	},
	light: {
		well: "#e9e8e4",
		base: "#f6f5f2",
		surface: "#fcfcfa",
		raised: "#ffffff",
		line: "#e3e1dc",
		"line-2": "#d3d1cb",
		text: "#1c1b19",
		"text-2": "#5e5b56",
		"text-3": "#85827c",
		thread: "#f5391a",
	},
};

const roles = [
	["title", "q-title", "20/28 · 600", "Projects"],
	["heading", "q-heading", "13/20 · 500", "Pages"],
	["body", "q-body", "13/20 · 400", "Check for updates"],
	["small", "q-small", "12/16 · 400", "For this new chat"],
	["mono", "q-mono", "12/16 · 400", "app/cart/frame.tsx"],
	["mono-sm", "q-mono-sm", "11/16 · 400", "390 × 844 · 54%"],
] as const;

function Spec({ label, note, children, className }: { label: string; note?: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("flex flex-col gap-2", className)}>
			<span className="flex h-4 items-baseline gap-2 whitespace-nowrap">
				<span className="q-small text-(--q-text-2)">{label}</span>
				{note ? <span className="truncate q-mono-sm text-(--q-text-3)">{note}</span> : null}
			</span>
			{children}
		</section>
	);
}

function Board({ appearance }: { appearance: Appearance }) {
	return (
		<div
			data-appearance={appearance}
			className="id-quiet flex h-full w-[720px] shrink-0 flex-col gap-4 overflow-hidden bg-(--q-base) px-6 py-4"
		>
			<div className="flex h-7 items-center gap-2">
				<SpoolMark className="h-[18px] w-[14px] text-(--q-thread)" />
				<span className="q-heading text-(--q-text)">quiet</span>
				<span className="q-mono-sm text-(--q-text-3)">{appearance}</span>
				<span className="ml-auto q-mono-sm text-(--q-text-3)">4px grid · rows 28 · bars 40 · chips 20</span>
			</div>

			<div className="grid grid-cols-[1fr_1fr] gap-x-8">
				<div className="flex min-w-0 flex-col gap-4">
					<Spec label="Buttons" note="h28 · r6">
						<div className="flex items-center gap-2">
							<Button intent="primary" icon={<IcPlus />}>
								{home.actions[2]}
							</Button>
							<Button>{home.actions[0]}</Button>
							<Button intent="ghost">{home.actions[1]}</Button>
							<IconButton>
								<IcPlus />
							</IconButton>
						</div>
						<div className="flex items-center gap-2">
							<Button intent="danger">{menuItems[4]!.label}</Button>
							<IconButton on>
								<IcFlows />
							</IconButton>
							<Button hover>{home.actions[0]}</Button>
							<Button intent="ghost" hover>
								{home.actions[1]}
							</Button>
							<span className="q-mono-sm text-(--q-text-3)">hover</span>
						</div>
					</Spec>

					<Spec label="Fields" note="h28 · r6 · key r4">
						<div className="flex items-center gap-2">
							<Search className="w-[188px]" placeholder={home.search} />
							<Field prefix="x" value={selection.x} unit="px" className="w-[120px]" />
						</div>
					</Spec>

					<Spec label="Segmented, toggle" note="on is text colour, never red">
						<div className="flex items-center gap-3">
							<Segmented items={["Ask", "Only this Mac"]} active={0} />
							<Toggle on />
							<Toggle />
						</div>
					</Spec>

					<Spec label="Tabs" note="window · panel · 2px red mark">
						<div className="flex items-center gap-5">
							<span className="flex items-center">
								<span className="relative flex h-9 items-center">
									<span className="flex h-7 items-center gap-1 rounded-[6px] pl-2.5 pr-1 q-body text-(--q-text)">
										kaffe
										<span className="flex size-5 items-center justify-center text-(--q-text-3)">
											<IcClose className="size-3.5" />
										</span>
									</span>
									<TabMark />
								</span>
								<span className="flex h-7 items-center rounded-[6px] bg-(--q-fill) px-2.5 q-body text-(--q-text)">
									tvärsö
								</span>
							</span>
							<span className="flex items-center gap-4">
								<span className="relative flex h-9 items-center q-body text-(--q-text)">
									General
									<span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-(--q-thread)" />
								</span>
								<span className="flex h-9 items-center q-body text-(--q-text-2)">Appearance</span>
							</span>
						</div>
					</Spec>

					<Spec label="Chips" note="h20 · r4 · mono-sm">
						<div className="flex items-center gap-2">
							<span className="w-14 q-mono-sm text-(--q-text-3)">count</span>
							<Count>3</Count>
							<span className="ml-3 flex min-w-0">
								<SelectionChip />
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="w-14 q-mono-sm text-(--q-text-3)">canvas</span>
							<SizeChip />
							<KindTag />
						</div>
					</Spec>

					<Spec label="Rail rows" note="h28 · r6 · state is a fill">
						<div className="flex flex-col gap-px">
							{(
								[
									["rest", <PageRow key="r" name="directing" count={1} />],
									["hover", <PageRow key="h" name="site" count={2} state="hover" />],
									["current", <PageRow key="c" name="app" count={3} open current />],
									["selected", <FrameRow key="s" name="cart" state="selected" />],
									["unseen", <FrameRow key="u" name="receipt" unseen />],
								] as const
							).map(([state, row]) => (
								<div key={state} className="grid grid-cols-[56px_1fr] items-center">
									<span className="q-mono-sm text-(--q-text-3)">{state}</span>
									{row}
								</div>
							))}
						</div>
					</Spec>

					<Spec label="Property row" note="mono value · unit">
						<PropertyRow a={["x", selection.x]} b={["y", selection.y]} flush />
					</Spec>

					<Spec label="Settings row" note="heading · small · control">
						<div className="flex items-start gap-6 rounded-[10px] bg-(--q-surface) p-3 shadow-[inset_0_0_0_1px_var(--q-line)]">
							<span className="flex flex-col gap-0.5">
								<span className="q-heading text-(--q-text)">{settingsRow.title}</span>
								<span className="q-small text-(--q-text-2)">{settingsRow.detail}</span>
							</span>
							<span className="ml-auto pt-0.5">
								<Toggle on />
							</span>
						</div>
					</Spec>
				</div>

				<div className="flex min-w-0 flex-col gap-4">
					<div className="grid grid-cols-[176px_1fr] gap-6">
						<Spec label="Menu" note="raised · r10">
							<div className="q-floating flex flex-col gap-px rounded-[10px] bg-(--q-raised) p-1">
								{menuItems.map((item, i) => (
									<div key={item.label} className="flex flex-col gap-px">
										{item.danger ? <span className="mx-2 my-1 h-px bg-(--q-line)" /> : null}
										<div className={cn("flex h-7 items-center rounded-[6px] px-2", i === 1 && "bg-(--q-fill-2)")}>
											<span className={cn("q-body", item.danger ? "text-(--q-danger)" : "text-(--q-text)")}>
												{item.label}
											</span>
											<span className="ml-auto q-mono-sm text-(--q-text-3)">{item.key}</span>
										</div>
									</div>
								))}
							</div>
						</Spec>
						<div className="flex flex-col gap-4">
							<Spec label="Tooltip" note="raised · r6">
								<span className="q-floating inline-flex h-7 w-fit items-center gap-2 rounded-[6px] bg-(--q-raised) pl-2 pr-1">
									<span className="q-small text-(--q-text)">Select</span>
									<Kbd>V</Kbd>
								</span>
							</Spec>
							<Spec label="Shadow" note="--q-float">
								<span className="q-small text-(--q-text-2)">One token, on what floats.</span>
							</Spec>
							<Spec label="Radius" note="4 · 6 · 10">
								<span className="flex items-end gap-2">
									<span className="size-5 rounded-[4px] shadow-[inset_0_0_0_1px_var(--q-line-2)]" />
									<span className="size-7 rounded-[6px] shadow-[inset_0_0_0_1px_var(--q-line-2)]" />
									<span className="size-10 rounded-[10px] shadow-[inset_0_0_0_1px_var(--q-line-2)]" />
								</span>
							</Spec>
						</div>
					</div>

					<Spec label="Toast" note="raised · h40 · r10">
						<div className="q-floating flex h-10 w-[296px] items-center gap-3 rounded-[10px] bg-(--q-raised) pl-3 pr-1">
							<span className="q-body text-(--q-text)">{toast.text}</span>
							<Button intent="ghost" className="ml-auto px-2 text-(--q-text)">
								{toast.action}
							</Button>
						</div>
					</Spec>

					<Spec label="Type" note="Geist · Geist Mono">
						<div className="flex flex-col">
							{roles.map(([name, cls, metric, sample]) => (
								<div key={name} className="flex h-8 items-center gap-3 border-b border-(--q-line) last:border-b-0">
									<span className="w-14 q-mono-sm text-(--q-text-3)">{name}</span>
									<span className={cn("min-w-0 flex-1 truncate text-(--q-text)", cls)}>{sample}</span>
									<span className="q-mono-sm text-(--q-text-3)">{metric}</span>
								</div>
							))}
						</div>
						<span className="q-small text-(--q-text-2)">Sans for names and words, mono for paths, numbers and keys.</span>
					</Spec>

					<Spec label="Palette" note="well < base < surface < raised">
						<div className="grid grid-cols-5 gap-2">
							{swatches.map(([name, token]) => (
								<div key={name} className="flex flex-col">
									<span
										className="mb-1 h-5 rounded-[4px] shadow-[inset_0_0_0_1px_var(--q-line-2)]"
										style={{ background: `var(${token})` }}
									/>
									<span className="q-mono-sm text-(--q-text-2)">{name}</span>
									<span className="q-mono-sm text-(--q-text-3)">{hex[appearance][name]}</span>
								</div>
							))}
						</div>
					</Spec>
				</div>
			</div>
		</div>
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
