// Action primitives: Button, IconButton, ToggleButton, SplitButton, and the two
// trays they sit in, ButtonGroup and ToolGroup.
//
// Interaction states pair the real pseudo-class with `data-state="hover|active|focus"`
// so a sheet can force one; app states ride `aria-pressed`, `disabled` and
// `data-working`. Every root spreads `...rest`, so a layer above can add
// `data-*`, `aria-*` and `className`.
//
// Heights are the control scale: sm 24, md 28, lg 32. The radius follows the
// height (xs at 24, sm at 28 and 32) and drops one tier inside a tray.

import type { ComponentProps, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { cn } from "../cn";
import { ChevronIcon } from "../icons";
import { SpinRing } from "./display";

/** a forced interaction state, for a sheet; the live thing uses the pseudo-class */
export type Forced = "hover" | "active" | "focus";
export type ControlSize = "sm" | "md" | "lg";

/* -------------------------------------------------------------- shared -- */

/** colour moves on the fast step and the house ease; nothing else animates */
const MOTION =
	"transition-[background-color,border-color,color,transform] duration-fast ease-out motion-reduce:transition-none";

/** the one ring, forced the same way the pointer states are */
const FOCUS =
	"focus-ring data-[state=focus]:outline-2 data-[state=focus]:outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid";

/** disabled is the one dimming, and the pointer says no */
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";

const HEIGHT: Record<ControlSize, string> = {
	sm: "h-control-sm",
	md: "h-control-md",
	lg: "h-control-lg",
};

const SQUARE: Record<ControlSize, string> = {
	sm: "size-control-sm rounded-xs",
	md: "size-control-md rounded-sm",
	lg: "size-control-lg rounded-sm",
};

/** a quiet surface's hover and press: a wash, so it reads on window, panel and raised alike */
const WASH =
	"enabled:hover:bg-state-hover-raised data-[state=hover]:bg-state-hover-raised enabled:active:bg-state-pressed data-[state=active]:bg-state-pressed";

/** ink that comes up to full on hover and press */
const INK_UP =
	"text-secondary enabled:hover:text-primary data-[state=hover]:text-primary enabled:active:text-primary data-[state=active]:text-primary";

/** lit: `aria-pressed="true"`, a control that stays down */
const LIT =
	"aria-pressed:bg-state-selected-strong aria-pressed:text-primary aria-pressed:hover:bg-state-selected-strong";

/** a menu button says its menu is open with `aria-expanded`, and is lit for as long */
const OPEN =
	"aria-expanded:bg-state-selected-strong aria-expanded:text-primary aria-expanded:hover:bg-state-selected-strong";

/** a glyph sits in a 16px cell, whatever size it draws itself at */
function Glyph({ children }: { children: ReactNode }) {
	return (
		<span className="flex size-4 shrink-0 items-center justify-center [&>svg]:max-h-4 [&>svg]:max-w-4">
			{children}
		</span>
	);
}

/* -------------------------------------------------------------- Button -- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_SIZE: Record<ControlSize, string> = {
	sm: "gap-1.5 rounded-xs px-2 type-label",
	md: "gap-1.5 rounded-sm px-3 type-control",
	lg: "gap-2 rounded-sm px-3 type-control",
};

/*
 * primary: ink, the one act per surface that finishes the job. Its hover and
 * press fade the ink toward the page: there is no inverse-hover token, so the
 * mix is made of two tokens.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
	primary: cn(
		"border-transparent bg-surface-inverse text-on-inverse",
		"enabled:hover:bg-[color-mix(in_srgb,var(--color-surface-inverse)_90%,var(--color-surface-window))] data-[state=hover]:bg-[color-mix(in_srgb,var(--color-surface-inverse)_90%,var(--color-surface-window))]",
		"enabled:active:bg-[color-mix(in_srgb,var(--color-surface-inverse)_80%,var(--color-surface-window))] data-[state=active]:bg-[color-mix(in_srgb,var(--color-surface-inverse)_80%,var(--color-surface-window))]",
	),
	secondary: cn("border-line-strong bg-transparent text-primary", WASH),
	ghost: cn("border-transparent bg-transparent", INK_UP, WASH),
	danger: cn(
		"border-transparent bg-danger text-on-accent",
		"enabled:hover:bg-danger-hover data-[state=hover]:bg-danger-hover enabled:active:bg-danger-hover data-[state=active]:bg-danger-hover",
	),
};

export interface ButtonProps extends ComponentProps<"button"> {
	/** primary is ink, secondary a hairline, ghost words alone, danger the red fill */
	variant?: ButtonVariant | undefined;
	/** sm 24 · md 28 · lg 32 */
	size?: ControlSize | undefined;
	/** a 16px glyph before the label */
	icon?: ReactNode;
	/** working: the glyph turns into the ring and the button holds still */
	loading?: boolean | undefined;
	"data-state"?: Forced | undefined;
}

/**
 * A labelled act. Words in sentence case, an ellipsis when it opens something
 * that asks more (`New project…`).
 */
export function Button({
	variant = "secondary",
	size = "md",
	icon,
	loading = false,
	type = "button",
	className,
	children,
	...rest
}: ButtonProps) {
	return (
		<button
			type={type}
			aria-busy={loading || undefined}
			data-working={loading || undefined}
			className={cn(
				"relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap border",
				"data-working:cursor-progress",
				FOCUS,
				MOTION,
				DISABLED,
				HEIGHT[size],
				BUTTON_SIZE[size],
				BUTTON_VARIANT[variant],
				className,
			)}
			{...rest}
		>
			{loading ? (
				<SpinRing className="size-4" />
			) : icon === undefined || icon === null ? null : (
				<Glyph>{icon}</Glyph>
			)}
			{children}
		</button>
	);
}

/* ---------------------------------------------------------- IconButton -- */

export interface IconButtonProps extends ComponentProps<"button"> {
	icon: ReactNode;
	/** what it does, read aloud and shown on hover: there are no words beside it */
	label: string;
	/** sm 24 · md 28 · lg 32, the glyph 16 in each */
	size?: ControlSize | undefined;
	/** lit: what it opens is open, the tool it picks is the tool */
	pressed?: boolean | undefined;
	/** what rides it: a mark at its corner, a tip above it */
	children?: ReactNode;
	"data-state"?: Forced | undefined;
}

/**
 * A glyph alone, ghost: no edge until the pointer brings the wash. Lit fills
 * with the selected step; a press gives under the finger.
 */
export function IconButton({
	icon,
	label,
	size = "md",
	pressed,
	type = "button",
	className,
	children,
	...rest
}: IconButtonProps) {
	return (
		<button
			type={type}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			className={cn(
				"relative inline-flex shrink-0 select-none items-center justify-center border border-transparent bg-transparent",
				"enabled:active:scale-90 data-[state=active]:scale-90",
				FOCUS,
				MOTION,
				DISABLED,
				SQUARE[size],
				INK_UP,
				WASH,
				LIT,
				OPEN,
				className,
			)}
			{...rest}
		>
			<Glyph>{icon}</Glyph>
			{children}
		</button>
	);
}

/* -------------------------------------------------------- ToggleButton -- */

export interface ToggleButtonProps extends Omit<ComponentProps<"button">, "onChange"> {
	pressed: boolean;
	onPressedChange?: ((next: boolean) => void) | undefined;
	size?: ControlSize | undefined;
	"data-state"?: Forced | undefined;
}

/**
 * A button that stays down. Off it is a ghost; on it fills with the selected
 * step at full ink. `aria-pressed` carries it, so it reads as a toggle.
 */
export function ToggleButton({
	pressed,
	onPressedChange,
	size = "md",
	type = "button",
	className,
	onClick,
	children,
	...rest
}: ToggleButtonProps) {
	return (
		<button
			type={type}
			aria-pressed={pressed}
			onClick={(event) => {
				onClick?.(event);
				if (!event.defaultPrevented) onPressedChange?.(!pressed);
			}}
			className={cn(
				"relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap border border-transparent bg-transparent",
				FOCUS,
				MOTION,
				DISABLED,
				HEIGHT[size],
				BUTTON_SIZE[size],
				INK_UP,
				WASH,
				LIT,
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}

/* --------------------------------------------------------- SplitButton -- */

export interface SplitButtonProps extends ButtonProps {
	/** what the chevron reads aloud: the menu of the other ways to do it */
	menuLabel: string;
	/** its menu is showing: the chevron turns over */
	menuOpen?: boolean | undefined;
	onMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}

/**
 * One act and its kin: the act on the left, a chevron on the right that opens
 * a menu of the rest. Both halves are Buttons of one variant and size, joined
 * by a hairline; the menu itself is the caller's.
 */
export function SplitButton({
	menuLabel,
	menuOpen = false,
	onMenu,
	variant = "primary",
	size = "md",
	className,
	...rest
}: SplitButtonProps) {
	return (
		<div className={cn("inline-flex items-stretch", className)}>
			<Button variant={variant} size={size} {...rest} className="rounded-r-none" />
			<span aria-hidden="true" className={cn("w-px", variant === "secondary" ? "bg-line-strong" : "bg-tertiary")} />
			<Button
				variant={variant}
				size={size}
				aria-label={menuLabel}
				title={menuLabel}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onClick={onMenu}
				className={cn("group/split rounded-l-none px-2", variant === "secondary" && "border-l-0")}
			>
				{/* the house chevron points right; the menu opens downward */}
				<span className="flex size-3 rotate-90 transition-transform duration-fast ease-out group-aria-expanded/split:-rotate-90 motion-reduce:transition-none [&>svg]:size-full">
					<ChevronIcon />
				</span>
			</Button>
		</div>
	);
}

/* --------------------------------------------------------- ButtonGroup -- */

/**
 * Related buttons in a row, 8px apart, the primary last so it sits where the
 * eye ends. A dialog's foot aligns them to the end.
 */
export function ButtonGroup({
	align = "start",
	className,
	children,
	...rest
}: HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" | undefined }) {
	return (
		<div className={cn("flex items-center gap-2", align === "end" && "justify-end", className)} {...rest}>
			{children}
		</div>
	);
}

/* ----------------------------------------------------------- ToolGroup -- */

/**
 * The tray over the canvas: icon buttons of which one is lit, lg around md,
 * inset 4px, items 2px apart. It is a toolbar, so it needs an `aria-label`.
 */
export function ToolGroup({ className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
	return (
		<div
			role="toolbar"
			aria-orientation="horizontal"
			className={cn(
				"inline-flex w-max items-center gap-0.5 rounded-lg border border-line-strong bg-surface-window p-1 [&>button]:rounded-md",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}
