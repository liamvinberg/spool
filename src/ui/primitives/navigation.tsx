// Navigation primitives: the ways a person moves between places. Tabs are the
// underlined switch inside a panel or a sheet, IconRail the vertical strip of
// glyphs a closed side shrinks to, NavItem a place in a sidebar.
//
// Interaction states answer to the real pseudo-class and to a forced
// `data-state="hover|active|focus"`. App states are attributes: `aria-current`
// for where you are, `aria-selected` for the chosen tab.

import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";
import { Count } from "./display";

/** a forced interaction state, for specimens */
export type Forced = "hover" | "active" | "focus";

const EASE_COLORS = "transition-colors duration-fast ease-out motion-reduce:transition-none";

/** the one ring, also when a sheet forces focus */
const FOCUS =
	"focus-ring data-[state=focus]:outline-2 data-[state=focus]:outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid";

/* ------------------------------------------------------------------- Tabs -- */

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
	/** false where the row the tabs stand in draws the hairline, under its other controls too */
	rule?: boolean | undefined;
}

/**
 * Underlined tabs: words on one line over a hairline, row-roomy tall, the
 * chosen one in primary ink with the thread's mark under it.
 */
export function Tabs({ rule = true, className, ...rest }: TabsProps) {
	return (
		<div
			role="tablist"
			className={cn(
				"flex h-row-roomy shrink-0 items-stretch gap-6",
				rule && "border-line-default border-b",
				className,
			)}
			{...rest}
		/>
	);
}

export interface TabProps extends ComponentProps<"button"> {
	selected?: boolean | undefined;
	"data-state"?: Forced | undefined;
}

export function Tab({ selected = false, className, children, ...rest }: TabProps) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={selected}
			className={cn(
				"group/t relative flex items-center gap-1.5 rounded-xs type-control text-secondary",
				FOCUS,
				EASE_COLORS,
				"hover:text-primary data-[state=hover]:text-primary",
				"active:text-primary data-[state=active]:text-primary",
				"aria-selected:text-primary",
				className,
			)}
			{...rest}
		>
			{children}
			<span
				aria-hidden="true"
				className="absolute inset-x-0 bottom-0 hidden h-0.5 bg-accent group-aria-selected/t:block"
			/>
		</button>
	);
}

/* --------------------------------------------------------------- IconRail -- */

export interface IconRailProps extends HTMLAttributes<HTMLElement> {
	/** which side of the window it stands on: the hairline goes on its inner edge; none where the panel draws it */
	side?: "start" | "end" | "none" | undefined;
}

/**
 * The vertical strip a closed side becomes: bar wide, so its glyphs line up
 * under the window bar's, window-coloured. Glyphs stack from the top.
 */
export function IconRail({ side = "end", className, ...rest }: IconRailProps) {
	return (
		<nav
			className={cn(
				"flex h-full w-bar shrink-0 flex-col items-center gap-1 border-line-default bg-surface-window pt-1.5",
				side === "start" && "border-r",
				side === "end" && "border-l",
				className,
			)}
			{...rest}
		/>
	);
}

export interface IconRailItemProps extends ComponentProps<"button"> {
	icon: ReactNode;
	label: string;
	/** what rides it: a mark at its shoulder */
	children?: ReactNode;
	"data-state"?: Forced | undefined;
}

/**
 * One glyph in the strip, control-lg square. Tertiary at rest, primary under
 * the pointer, and it gives under the finger.
 */
export function IconRailItem({ icon, label, className, children, ...rest }: IconRailItemProps) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn(
				"relative flex size-control-lg shrink-0 items-center justify-center rounded-sm text-tertiary",
				FOCUS,
				"transition-[background-color,color,scale] duration-fast ease-snap motion-reduce:transition-none",
				"hover:text-primary data-[state=hover]:text-primary",
				"active:scale-90 data-[state=active]:scale-90",
				className,
			)}
			{...rest}
		>
			<span className="flex size-4 shrink-0 items-center justify-center [&>svg]:max-h-4 [&>svg]:max-w-4">
				{icon}
			</span>
			{children}
		</button>
	);
}

/* ---------------------------------------------------------------- NavItem -- */

export interface NavItemProps extends Omit<ComponentProps<"button">, "children"> {
	/** a 16px glyph before the label */
	icon?: ReactNode;
	label: ReactNode;
	/** where you are */
	current?: boolean | undefined;
	/** at the end: a count */
	meta?: number | string | undefined;
	"data-state"?: Forced | undefined;
}

/**
 * A place in a sidebar, as Home's sidebar lists them: row-roomy tall, radius
 * sm, an icon and a word. Secondary at rest; the panel step under the pointer
 * and where you are.
 */
export function NavItem({ icon, label, current = false, meta, className, ...rest }: NavItemProps) {
	return (
		<button
			type="button"
			aria-current={current ? "page" : undefined}
			className={cn(
				"flex h-row-roomy w-full min-w-0 items-center gap-3 rounded-sm px-3 text-left type-control text-secondary [&>svg]:size-4 [&>svg]:shrink-0",
				FOCUS,
				EASE_COLORS,
				"hover:bg-state-hover hover:text-primary data-[state=hover]:bg-state-hover data-[state=hover]:text-primary",
				"active:bg-state-pressed data-[state=active]:bg-state-pressed",
				"aria-[current=page]:bg-state-selected aria-[current=page]:text-primary",
				className,
			)}
			{...rest}
		>
			{icon}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{meta === undefined ? null : <Count value={meta} />}
		</button>
	);
}
