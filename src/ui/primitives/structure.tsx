// Structure primitives: the boxes everything else stands in. A region of the
// window (Panel), a panel's head and foot (Bar, StatusLine), the rows lists are
// made of (ListRow, TreeRow, PropertyRow), a titled Section of property rows,
// and a ScrollArea that says there is more by fading its edge.
//
// Interaction states answer to the real pseudo-class and to a forced
// `data-state="hover|active|focus"`; app states are attributes (`aria-selected`,
// `aria-current="page"`, `disabled`/`aria-disabled`, `data-unseen`, `data-error`),
// so a caller can set them through `...rest` and the look follows.

import {
	type ComponentType,
	createElement,
	type HTMLAttributes,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../cn";
import { ChevronIcon } from "../icons";
import { StatusMark } from "./display";

/** colour on the motion scale: every hover in the system */
const EASE_COLORS = "transition-colors duration-fast ease-out motion-reduce:transition-none";

/** the inset ring, also when a sheet forces focus */
const FOCUS_INSET =
	"focus-ring-inset data-[state=focus]:outline-2 data-[state=focus]:-outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid";

/* ------------------------------------------------------------------ Panel -- */

export interface PanelProps extends HTMLAttributes<HTMLElement> {
	/** which side of the window it stands on: the hairline goes on its inner edge */
	side?: "start" | "end" | "none" | undefined;
	width?: "rail" | "panel" | undefined;
}

/**
 * A region of the window: a rail or a dock panel. Window-coloured, set off from
 * the canvas by one hairline on the edge that faces it; a Bar heads it, a
 * StatusLine may foot it, and what is between scrolls.
 */
export function Panel({ side = "start", width, className, ...rest }: PanelProps) {
	return (
		<aside
			className={cn(
				"flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-line-default bg-surface-window",
				side === "start" && "border-r",
				side === "end" && "border-l",
				width === "rail" && "w-rail",
				width === "panel" && "w-panel",
				className,
			)}
			{...rest}
		/>
	);
}

/* -------------------------------------------------------------------- Bar -- */

export interface BarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
	title: ReactNode;
	/** before the title: a team's or a project's mark */
	icon?: ReactNode | undefined;
	/** title face: sans for a panel's name, mono for a name the machine prints */
	face?: "sans" | "mono" | undefined;
	/** at the far end: icon buttons, or a word on what the panel is */
	actions?: ReactNode | undefined;
}

/**
 * A panel's head: bar tall, the title on the left, what can be done on the
 * right, one hairline under it. The window bar and every panel head are this
 * height, so their rules meet across the window.
 */
export function Bar({ title, icon, face = "sans", actions, className, ...rest }: BarProps) {
	return (
		<header
			className={cn(
				"flex h-bar shrink-0 items-center justify-between gap-2 border-line-default border-b pr-2 pl-4",
				className,
			)}
			{...rest}
		>
			<div className="flex min-w-0 items-center gap-2">
				{icon}
				<h2 className={cn("min-w-0 truncate text-primary", face === "sans" ? "type-title" : "type-value")}>
					{title}
				</h2>
			</div>
			{actions === undefined ? null : <div className="flex shrink-0 items-center">{actions}</div>}
		</header>
	);
}

/* ------------------------------------------------------------- StatusLine -- */

/**
 * A panel's foot: one line of machine text that says what the panel is doing
 * or who is looking, row-roomy tall, a hairline over it.
 */
export function StatusLine({ className, ...rest }: HTMLAttributes<HTMLElement>) {
	return (
		<footer
			className={cn(
				"flex h-row-roomy shrink-0 items-center justify-between gap-3 border-line-default border-t px-4 text-secondary type-detail",
				className,
			)}
			{...rest}
		/>
	);
}

/* ---------------------------------------------------------------- Section -- */

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
	title: ReactNode;
	/** at the far end of the head: the file it is written to */
	meta?: ReactNode | undefined;
	children?: ReactNode | undefined;
}

/**
 * A titled group of rows inside a panel: the title in detail mono on a
 * control-sm head, a hairline over it (`position · frame.json`).
 */
export function Section({ title, meta, children, className, ...rest }: SectionProps) {
	return (
		<section className={cn("flex min-w-0 flex-col border-line-default border-t", className)} {...rest}>
			<div className="flex h-control-sm min-w-0 items-center gap-2 px-3">
				<span className="truncate text-secondary type-detail">{title}</span>
				{meta === undefined ? null : (
					<span className="ml-auto min-w-0 truncate text-tertiary type-detail">{meta}</span>
				)}
			</div>
			<div className="flex min-w-0 flex-col">{children}</div>
		</section>
	);
}

/* ---------------------------------------------------------------- ListRow -- */

/** what makes way for a revealed trailing slot: meta and the row's marks fade under the pointer or the keyboard (not a click's focus) */
const GIVE_WAY =
	"group-has-[:focus-visible]/row:opacity-0 group-hover/row:opacity-0 group-data-[state=hover]/row:opacity-0";

export interface ListRowProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
	/** the element: a div by default, a button when the whole row is one action */
	as?: "div" | "button" | "li" | undefined;
	/** before the icon, flush to the row's start: a tree's indent and chevron */
	lead?: ReactNode | undefined;
	icon?: ComponentType<{ className?: string }> | undefined;
	label: ReactNode;
	/** a count, after the label in detail mono */
	meta?: ReactNode | undefined;
	/** icon buttons at the end */
	trailing?: ReactNode | undefined;
	/** trailing shows only under the pointer or focus, and takes meta's place */
	reveal?: boolean | undefined;
	/** the label as a name the machine prints */
	mono?: boolean | undefined;
	selected?: boolean | undefined;
	current?: boolean | undefined;
	/** the icon takes the accent without the mark: the frame chosen on the canvas */
	lit?: boolean | undefined;
	/** nobody has looked: a disc; `moved`, seen once and changed since: a ring */
	unseen?: boolean | "moved" | undefined;
	disabled?: boolean | undefined;
	/** drawn behind the content, positioned against the row: a tree's guides */
	decor?: ReactNode | undefined;
	type?: "button" | "submit" | undefined;
}

/**
 * One row in a list: an icon, a label, meta, a trailing slot, row tall. Rows
 * rest in secondary ink and come up to primary under the pointer, when
 * selected, when current and when they hold something unseen. Current adds the
 * thread's mark on the row's start edge and lights the icon; that is the only
 * red a row has.
 */
export function ListRow({
	as = "div",
	lead,
	icon: Glyph,
	label,
	meta,
	trailing,
	reveal = false,
	mono = false,
	selected,
	current,
	lit,
	unseen,
	disabled,
	decor,
	className,
	...rest
}: ListRowProps) {
	const button = as === "button";
	const giveWay = reveal && trailing !== undefined;
	return createElement(
		as,
		{
			...(button ? { type: "button" } : {}),
			"aria-selected": selected === undefined ? undefined : selected,
			"aria-current": current ? "page" : undefined,
			"aria-disabled": disabled && !button ? true : undefined,
			disabled: button ? disabled : undefined,
			"data-lit": lit ? "" : undefined,
			"data-unseen": unseen ? "" : undefined,
			...rest,
			className: cn(
				"group/row relative flex h-row w-full min-w-0 shrink-0 items-center gap-2 pr-3 text-left text-secondary",
				FOCUS_INSET,
				lead === undefined && "pl-3",
				EASE_COLORS,
				"hover:bg-state-hover data-[state=hover]:bg-state-hover",
				"aria-selected:bg-state-selected aria-[current=page]:bg-state-selected",
				"hover:text-primary data-[state=hover]:text-primary",
				"active:bg-state-pressed data-[state=active]:bg-state-pressed",
				"aria-selected:text-primary aria-[current=page]:text-primary data-[unseen]:text-primary",
				"aria-disabled:pointer-events-none aria-disabled:opacity-40 disabled:pointer-events-none disabled:opacity-40",
				className,
			),
		},
		decor,
		<span
			key="mark"
			aria-hidden="true"
			className="absolute top-1.5 bottom-1.5 left-0 hidden w-0.5 rounded-full bg-mark group-aria-[current=page]/row:block"
		/>,
		lead,
		Glyph === undefined ? null : (
			<Glyph
				key="icon"
				className={cn(
					"size-4 shrink-0 text-secondary",
					"group-aria-[current=page]/row:text-accent-strong group-data-[lit]/row:text-accent-strong",
				)}
			/>
		),
		<span
			key="label"
			className={cn(
				"min-w-0 flex-1 truncate",
				mono ? "type-value" : "type-control",
				giveWay && "group-hover/row:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]",
			)}
		>
			{label}
		</span>,
		unseen ? (
			<StatusMark
				key="unseen"
				status={unseen === "moved" ? "moved" : "unseen"}
				aria-hidden="true"
				className={cn(giveWay && GIVE_WAY)}
			/>
		) : null,
		meta === undefined ? null : (
			<span key="meta" className={cn("shrink-0 text-secondary tabular-nums type-detail", giveWay && GIVE_WAY)}>
				{meta}
			</span>
		),
		trailing === undefined ? null : (
			<span
				key="trailing"
				// over a caller's own action laid across the row, as the chevron is
				className={cn(
					"z-2 flex shrink-0 items-center",
					!reveal && "relative",
					reveal &&
						"pointer-events-none absolute right-1 opacity-0 group-has-[:focus-visible]/row:pointer-events-auto group-has-[:focus-visible]/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-data-[state=hover]/row:opacity-100",
				)}
			>
				{trailing}
			</span>
		),
	);
}

/* ---------------------------------------------------------------- TreeRow -- */

/** One level's step in, and where a row's own column starts: its chevron's width. */
const STEP = "var(--spacing) * 3";
const CHEVRON = "var(--spacing) * 6";

export interface TreeRowProps extends Omit<ListRowProps, "lead"> {
	/** 0 at the root; each level steps in space-3 */
	depth?: number | undefined;
	/** a branch has a chevron; a leaf does not. `deep` is the alt key: every level under it too */
	branch?: { open: boolean; onToggle?: (deep: boolean) => void; label?: string } | undefined;
	/** hang a leaf on its parent's guide: `last` stops the spine short. A branch
	 *  draws none: its chevron stands where the spine would */
	guide?: "mid" | "last" | undefined;
}

/**
 * A row in a tree, as the pages rail draws it: a ListRow with an indent, a
 * chevron column for a branch, and a guide (a spine and an elbow in the strong
 * line) for a row that hangs off its parent. Every level is row tall.
 */
export function TreeRow({ depth = 0, branch, guide, decor, ...rest }: TreeRowProps) {
	const lead = (
		<span className="flex h-full shrink-0 items-center">
			<span aria-hidden="true" style={{ width: `calc(${depth} * ${STEP})` }} />
			{branch === undefined ? (
				<span aria-hidden="true" className="w-control-sm" />
			) : (
				<button
					type="button"
					tabIndex={-1}
					aria-label={`${branch.open ? "Collapse" : "Expand"}${branch.label === undefined ? "" : ` ${branch.label}`}`}
					aria-expanded={branch.open}
					// a press on the chevron is not the start of a drag of its row
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.stopPropagation();
						branch.onToggle?.(event.altKey);
					}}
					// over a caller's own action laid across the row
					className="relative z-2 flex h-full w-control-sm items-center justify-center text-tertiary hover:text-primary"
				>
					<span
						className={cn(
							"size-3 transition-transform duration-base ease-out motion-reduce:transition-none [&>svg]:size-full",
							branch.open && "rotate-90",
						)}
					>
						<ChevronIcon />
					</span>
				</button>
			)}
		</span>
	);
	// the spine stands just inside the parent's icon: its chevron column, plus a hair
	const spineX = `calc(${depth - 1} * ${STEP} + ${CHEVRON} + var(--spacing) * 0.5)`;
	const guides =
		guide === undefined || depth < 1 || branch !== undefined ? null : (
			<span key="guide" aria-hidden="true">
				<span
					className={cn("absolute top-0 w-px bg-line-strong", guide === "last" ? "bottom-1.5" : "bottom-0")}
					style={{ left: spineX }}
				/>
				<span className="absolute top-1/2 h-px w-3 bg-line-strong" style={{ left: spineX }} />
			</span>
		);
	return (
		<ListRow
			role="treeitem"
			aria-level={depth + 1}
			aria-expanded={branch?.open}
			lead={lead}
			decor={
				<>
					{guides}
					{decor}
				</>
			}
			{...rest}
		/>
	);
}

/* ------------------------------------------------------------ PropertyRow -- */

export interface PropertyRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
	label: ReactNode;
	/** the fields: one value, or two side by side */
	children: ReactNode;
	disabled?: boolean | undefined;
}

/**
 * A property: a label in detail mono on the left, its fields filling the rest,
 * row tall with a subtle rule under it. The label column is the same width in
 * every row, so values comb into one column.
 */
export function PropertyRow({ label, children, disabled, className, ...rest }: PropertyRowProps) {
	return (
		<div
			aria-disabled={disabled || undefined}
			className={cn(
				"group/prop grid h-row min-w-0 shrink-0 grid-cols-[calc(var(--spacing)*22)_minmax(0,1fr)] items-center gap-2 border-line-subtle border-b px-3",
				EASE_COLORS,
				"hover:bg-state-hover data-[state=hover]:bg-state-hover",
				"aria-disabled:pointer-events-none aria-disabled:opacity-40",
				className,
			)}
			{...rest}
		>
			<span className="truncate text-secondary type-detail">{label}</span>
			<div className="flex min-w-0 items-center gap-1">{children}</div>
		</div>
	);
}

/**
 * A value as the properties panel prints it: the words in value mono, a unit
 * after them in tertiary. Read-only; a field to type in is the inputs family's.
 */
export function PropertyValue({
	value,
	unit,
	className,
	...rest
}: HTMLAttributes<HTMLSpanElement> & { value: ReactNode; unit?: ReactNode }) {
	return (
		<span className={cn("flex min-w-0 flex-1 items-baseline gap-1 px-1", className)} {...rest}>
			<span className="min-w-0 flex-1 truncate text-primary tabular-nums type-value">{value}</span>
			{unit === undefined ? null : <span className="shrink-0 text-tertiary type-detail">{unit}</span>}
		</span>
	);
}

/* ------------------------------------------------------------- ScrollArea -- */

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
	/** which edges fade when there is more past them */
	fade?: "end" | "both" | "none" | undefined;
}

/**
 * A region that scrolls on its own and says there is more by fading the edge
 * the content runs past, space-6 deep. The fade is a mask, so it fades into
 * whatever surface is under it; a thin scrollbar in the strong line.
 */
export function ScrollArea({ fade = "end", className, style, onScroll, children, ...rest }: ScrollAreaProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [edges, setEdges] = useState({ start: false, end: false });
	const measure = () => {
		const element = ref.current;
		if (element === null) return;
		const start = element.scrollTop > 1;
		const end = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
		setEdges((was) => (was.start === start && was.end === end ? was : { start, end }));
	};
	useEffect(() => {
		measure();
		const element = ref.current;
		if (element === null || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		for (const child of Array.from(element.children)) observer.observe(child);
		return () => observer.disconnect();
	});
	const top = fade === "both" && edges.start;
	const bottom = fade !== "none" && edges.end;
	const deep = "calc(var(--spacing) * 6)";
	const mask =
		top || bottom
			? `linear-gradient(to bottom, ${top ? `transparent, black ${deep}` : "black"}, ${bottom ? `black calc(100% - ${deep}), transparent` : "black"})`
			: undefined;
	return (
		<div
			ref={ref}
			data-more-start={top ? "" : undefined}
			data-more-end={bottom ? "" : undefined}
			onScroll={(event) => {
				measure();
				onScroll?.(event);
			}}
			className={cn(
				"min-h-0 overflow-y-auto overscroll-contain [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]",
				className,
			)}
			style={{ maskImage: mask, WebkitMaskImage: mask, ...style }}
			{...rest}
		>
			{children}
		</div>
	);
}
