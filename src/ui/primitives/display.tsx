// Display primitives: the small things that label, count and mark. None of
// them is a control on its own, so their states are mostly app states:
// selected, unseen, working.
//
// Interaction states pair the real pseudo-class with `data-state="hover"` so a
// sheet can force one. Every root spreads `...rest`, so a layer above can add
// `data-*`, `aria-*` and `className`.

import type { ComponentProps, CSSProperties } from "react";
import { cn } from "../cn";
import { FrameIcon } from "../icons";

/* ------------------------------------------------------------------- Kbd -- */

/**
 * The one key hint. A key is printed by the machine, so it is mono detail in
 * tertiary ink inside a hairline box at radius xs, with no fill, so it reads
 * the same on a window, a panel, a menu and a tooltip.
 */
/** Mono has no ⇧ or ⌫, and its fallback draws them as smudges, so the key symbols take the UI face. */
const SYMBOL = /([⇧⌘⌥⌃⌫⌦↵⏎])/;

export function Kbd({ className, children, ...rest }: ComponentProps<"kbd">) {
	return (
		<kbd
			className={cn(
				"inline-flex h-control-xs min-w-control-xs shrink-0 items-center justify-center whitespace-nowrap rounded-xs border border-line-strong px-1.5 text-tertiary tabular-nums type-detail",
				className,
			)}
			{...rest}
		>
			{typeof children === "string"
				? children.split(SYMBOL).map((part, at) =>
						at % 2 === 1 ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
							<span key={at} className="font-sans">
								{part}
							</span>
						) : (
							part
						),
					)
				: children}
		</kbd>
	);
}

/* ------------------------------------------------------------------ Count -- */

export type CountTone = "secondary" | "pill" | "accent";

const PILL = "h-4 min-w-4 justify-center rounded-full px-1";

const COUNT_TONE: Record<CountTone, string> = {
	/** the quiet count beside what it counts */
	secondary: "text-secondary",
	pill: `${PILL} bg-state-selected-strong text-primary`,
	accent: `${PILL} bg-accent-strong text-on-accent`,
};

/**
 * A number the machine keeps. Mono detail, tabular so it never shifts. `pill`
 * sits on an image; `accent` is the one count that asks to be read.
 */
export function Count({
	value,
	tone = "secondary",
	className,
	...rest
}: ComponentProps<"span"> & { value: number | string; tone?: CountTone | undefined }) {
	return (
		<span
			className={cn("inline-flex shrink-0 items-center tabular-nums type-detail", COUNT_TONE[tone], className)}
			{...rest}
		>
			{value}
		</span>
	);
}

/* -------------------------------------------- Dot, SpinRing, StatusMark -- */

export type DotTone = "primary" | "secondary" | "accent";
export type DotSize = "sm" | "md";

const DOT_TONE: Record<DotTone, string> = {
	primary: "bg-primary",
	secondary: "bg-secondary",
	accent: "bg-accent",
};

/** A disc that says one thing without words. `sm` 6, `md` 8. Arrives with a pop. */
export function Dot({
	tone = "primary",
	size = "sm",
	className,
	...rest
}: ComponentProps<"span"> & { tone?: DotTone | undefined; size?: DotSize | undefined }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"block shrink-0 rounded-full animate-unseen-in motion-reduce:animate-none",
				size === "sm" ? "size-1.5" : "size-2",
				DOT_TONE[tone],
				className,
			)}
			{...rest}
		/>
	);
}

/**
 * The turning ring: a faint full circle and a quarter arc in currentColor,
 * 1.5 stroke as on the icon grid. Its size and ink are the caller's.
 */
export function SpinRing({ className, ...rest }: ComponentProps<"svg">) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("block shrink-0 animate-agent-spin motion-reduce:animate-none", className)}
			{...rest}
		>
			<circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
			<path d="M6 1.75A4.25 4.25 0 0 1 10.25 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

export type Status = "unseen" | "moved" | "working" | "waiting";

/**
 * What a frame or a thread is doing, in a 12px box so a name never moves when
 * a mark appears. State is shape before colour: the one accent belongs to the
 * selection.
 *
 * unseen: a disc, nobody has looked · moved: a hollow ring, seen and changed
 * since · working: the ring turning · waiting: the ring held still with the
 * disc in it, stopped on a question.
 */
export function StatusMark({ status, className, ...rest }: ComponentProps<"span"> & { status: Status }) {
	return (
		<span
			role="img"
			aria-label={status}
			className={cn("flex size-3 shrink-0 items-center justify-center", className)}
			{...rest}
		>
			<StatusGlyph status={status} />
		</span>
	);
}

const POP = "animate-unseen-in motion-reduce:animate-none";

function StatusGlyph({ status }: { status: Status }) {
	switch (status) {
		case "unseen":
			return <Dot tone="primary" />;
		case "moved":
			return (
				<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("size-full text-secondary", POP)}>
					<circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
				</svg>
			);
		case "working":
			return <SpinRing className="size-full text-secondary" />;
		case "waiting":
			return (
				<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={cn("size-full text-primary", POP)}>
					<circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
					<circle cx="6" cy="6" r="2" fill="currentColor" />
				</svg>
			);
	}
}

/* ------------------------------------------------------------- LetterMark -- */

export type MarkSize = "sm" | "md";

const MARK_SIZE: Record<MarkSize, string> = {
	sm: "size-4 type-caption",
	md: "size-5 type-control",
};

/**
 * A project's mark when there is no picture: the name's first letter,
 * lowercase, semibold. `sm` 16 on a tab, `md` 20 in a menu or on a card.
 *
 * `hue` is data, the colour the app picked from the name: it tints the field
 * at 24%, with the letter mixed toward the ink of the mode.
 */
export function LetterMark({
	name,
	size = "sm",
	hue,
	className,
	style,
	...rest
}: ComponentProps<"span"> & { name: string; size?: MarkSize | undefined; hue: string }) {
	const tint = {
		"--mark-hue": hue,
		background: "color-mix(in srgb, var(--mark-hue) 24%, transparent)",
		borderColor: "color-mix(in srgb, var(--mark-hue) 40%, transparent)",
		color: "light-dark(color-mix(in srgb, var(--mark-hue) 78%, black), color-mix(in srgb, var(--mark-hue) 70%, white))",
	} as CSSProperties;
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid shrink-0 place-items-center overflow-hidden rounded-xs border",
				MARK_SIZE[size],
				className,
			)}
			style={{ ...tint, ...style }}
			{...rest}
		>
			<span className="font-semibold leading-none">{[...name][0]?.toLowerCase()}</span>
		</span>
	);
}

/* -------------------------------------------------------------- Thumbnail -- */

/**
 * The frame a preview image sits in: a panel field behind a hairline, the
 * picture cropped from its top. With neither `src` nor children it shows a
 * frame glyph. `count` pins a pill to the top right corner.
 *
 * States: hover strengthens the hairline; `aria-selected` turns it to the
 * thread.
 */
export function Thumbnail({
	src,
	alt = "",
	count,
	className,
	children,
	...rest
}: ComponentProps<"div"> & { src?: string | undefined; alt?: string | undefined; count?: number | undefined }) {
	return (
		<div
			className={cn(
				"relative shrink-0 overflow-hidden rounded-xs border border-line-default bg-surface-panel focus-ring",
				"transition-[border-color] duration-fast ease-out",
				"hover:border-line-strong data-[state=hover]:border-line-strong aria-selected:border-accent",
				className,
			)}
			{...rest}
		>
			{src !== undefined ? (
				<img src={src} alt={alt} draggable={false} className="size-full object-cover object-top" />
			) : children !== undefined ? (
				children
			) : (
				<span className="absolute inset-0 flex items-center justify-center text-tertiary">
					<FrameIcon className="size-3" />
				</span>
			)}
			{count === undefined ? null : (
				// over a picture the pill is opaque: the window under it
				<span className="absolute top-0.5 right-0.5 rounded-full bg-surface-window">
					<Count tone="pill" value={count} />
				</span>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- Divider -- */

export type DividerTone = "default" | "strong";

/**
 * A hairline standing between things in a row, the height of a line of text.
 * `default` divides regions, `strong` sits on a raised surface.
 */
export function Divider({
	tone = "default",
	className,
	...rest
}: ComponentProps<"hr"> & { tone?: DividerTone | undefined }) {
	return (
		<hr
			aria-orientation="vertical"
			className={cn(
				"m-0 h-4 w-px shrink-0 border-0",
				tone === "default" ? "bg-line-default" : "bg-line-strong",
				className,
			)}
			{...rest}
		/>
	);
}
