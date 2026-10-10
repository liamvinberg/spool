// Overlay primitives: what stands over the page. Menu (and its items) and
// Popover float at elevation 2 on the raised surface; Dialog, Sheet and the
// Palette are modal at elevation 3 on the panel surface, over a Scrim.
//
// Positioning is the caller's: these draw the box, its parts and its entrance.
// Interaction states answer to the real pseudo-class and to a forced
// `data-state="hover|active|focus"`; app states are `aria-checked`,
// `disabled` and `aria-expanded`.

import { type ComponentProps, createElement, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { Kbd } from "./display";
import { ScrollArea, StatusLine } from "./structure";

/** a forced interaction state, for specimens */
export type Forced = "hover" | "active" | "focus";

const EASE_COLORS = "transition-colors duration-fast ease-out motion-reduce:transition-none";

const FOCUS_INSET =
	"focus-ring-inset data-[state=focus]:outline-2 data-[state=focus]:-outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid";

/** what floats: the raised fill, the strong edge, elevation 2. A float with its own entrance wears it whole. */
export const FLOATING = "border border-line-strong bg-surface-raised shadow-float";

/** what is modal: the panel fill, the strong edge, elevation 3 */
export const MODAL = "border border-line-strong bg-surface-panel shadow-modal";

/* ------------------------------------------------------------------- Menu -- */

/**
 * A list of verbs that floats: menu wide, radius md, a 4px inset so its rows
 * sit one radius tier down. It drops in from its trigger.
 */
export function Menu({ className, ...rest }: ComponentProps<"div">) {
	return (
		<div
			role="menu"
			className={cn("flex w-menu animate-menu-in flex-col rounded-md p-1", FLOATING, className)}
			{...rest}
		/>
	);
}

export interface MenuItemProps extends Omit<ComponentProps<"button">, "children"> {
	label: ReactNode;
	icon?: ReactNode | undefined;
	/** the key that does the same: every item with a bare key wears it */
	shortcut?: string | undefined;
	/** quiet words at the end that say more about the item: a count, a role, a place */
	meta?: ReactNode | undefined;
	/** a checkable item: true wears the check, false keeps its column */
	checked?: boolean | undefined;
	/** an item that loses work: danger ink */
	destructive?: boolean | undefined;
	/** keep the leading column when a sibling has an icon or a check */
	inset?: boolean | undefined;
	/** an item that goes somewhere outside spool: drawn as a link */
	href?: string | undefined;
	target?: string | undefined;
	rel?: string | undefined;
	"data-state"?: Forced | undefined;
}

/**
 * One verb, row tall, radius sm, primary ink. The wash under the pointer,
 * pressed below it, its key at the end in a Kbd. Destructive is the danger ink
 * and nothing louder. Disabled stays in the list, told rather than hidden.
 */
export function MenuItem({
	label,
	icon,
	shortcut,
	meta,
	checked,
	destructive = false,
	disabled = false,
	inset = false,
	href,
	className,
	...rest
}: MenuItemProps) {
	const checkable = checked !== undefined;
	const leads = icon !== undefined || checkable || inset;
	return createElement(
		href === undefined ? "button" : "a",
		{
			...(href === undefined ? { type: "button", disabled } : { href }),
			role: checkable ? "menuitemcheckbox" : "menuitem",
			"aria-checked": checkable ? checked : undefined,
			"data-destructive": destructive ? "" : undefined,
			...rest,
			className: cn(
				"group/item flex h-row w-full min-w-0 shrink-0 items-center gap-2 rounded-sm pr-2 text-left text-primary type-control",
				leads ? "pl-2" : "pl-3",
				FOCUS_INSET,
				EASE_COLORS,
				"hover:bg-state-hover-raised data-[state=hover]:bg-state-hover-raised",
				"active:bg-state-pressed data-[state=active]:bg-state-pressed",
				"data-[destructive]:text-danger-strong",
				"disabled:pointer-events-none disabled:opacity-40",
				className,
			),
		},
		leads ? (
			<span
				key="lead"
				className="flex size-4 shrink-0 items-center justify-center text-secondary group-data-[destructive]/item:text-danger-strong [&>svg]:max-h-4 [&>svg]:max-w-4"
			>
				{checkable ? checked ? <CheckIcon className="size-3 text-primary" /> : null : icon}
			</span>
		) : null,
		<span key="label" className="min-w-0 flex-1 truncate">
			{label}
		</span>,
		meta === undefined ? null : (
			<span key="meta" className="shrink-0 truncate text-secondary type-detail">
				{meta}
			</span>
		),
		shortcut === undefined ? null : <Kbd key="key">{shortcut}</Kbd>,
	);
}

/** A rule between groups of verbs, in the strong line, inset to the rows' text. */
export function MenuSeparator({ className, ...rest }: ComponentProps<"hr">) {
	return <hr className={cn("mx-2 my-1 h-px shrink-0 border-0 bg-line-strong", className)} {...rest} />;
}

/* ---------------------------------------------------------------- Popover -- */

export interface PopoverProps extends ComponentProps<"div"> {
	/** the inside's padding: md is a panel of fields, none for a list that carries its own */
	pad?: "none" | "sm" | "md" | undefined;
}

/**
 * A small panel that floats by its trigger: a few fields, a sentence and an
 * action. The Menu's box without the menu's rows.
 */
export function Popover({ pad = "md", className, ...rest }: PopoverProps) {
	return (
		<div
			role="dialog"
			className={cn(
				"flex min-w-menu animate-menu-in flex-col rounded-md",
				pad === "md" && "p-3",
				pad === "sm" && "p-1",
				FLOATING,
				className,
			)}
			{...rest}
		/>
	);
}

/* ------------------------------------------------------------------ Scrim -- */

export interface ScrimProps extends HTMLAttributes<HTMLElement> {
	/** what a click on it does, said to a screen reader: the scrim becomes a door out */
	label?: string | undefined;
}

/**
 * What lies behind something modal: the window at 48%, blurred 2px. With a
 * label it is also a door out, a button no key lands on.
 */
export function Scrim({ label, className, ...rest }: ScrimProps) {
	const look = cn("absolute inset-0 z-30 animate-find-in bg-scrim backdrop-blur-[2px]", className);
	return label === undefined ? (
		<div aria-hidden="true" className={look} {...rest} />
	) : (
		<button type="button" tabIndex={-1} aria-label={label} className={cn("cursor-default", look)} {...rest} />
	);
}

/* ----------------------------------------------------------------- Dialog -- */

const DIALOG_WIDTH = { dialog: "w-dialog", sheet: "w-sheet", free: "" } as const;

/** the native element's own: it centres itself and draws the scrim as its backdrop */
const NATIVE = "m-auto max-h-[calc(100dvh-32px)] overflow-auto backdrop:bg-scrim backdrop:backdrop-blur-[2px]";

type DialogLook = {
	/** dialog by default; sheet for one with two panes; free when the caller sizes it */
	width?: keyof typeof DIALOG_WIDTH | undefined;
	/** false when the inside lays out its own margins */
	padded?: boolean | undefined;
};

export type DialogProps = DialogLook &
	(({ native?: false | undefined } & ComponentProps<"div">) | ({ native: true } & ComponentProps<"dialog">));

/**
 * A question that stops the work until it is answered: dialog wide, radius lg,
 * the panel fill at elevation 3, a 24px inset. Header, body and footer stack
 * inside it, each one owning the space above it. `native` draws it on a
 * <dialog> the caller opens with showModal, for the focus it keeps inside.
 */
export function Dialog({ width = "dialog", padded = true, className, ...rest }: DialogProps) {
	const look = cn(
		"flex max-w-[calc(100vw-32px)] animate-find-panel-in flex-col rounded-lg text-primary",
		DIALOG_WIDTH[width],
		padded && "p-6",
		MODAL,
		className,
	);
	if (rest.native === true) {
		const { native: _, ...dialog } = rest;
		return <dialog className={cn(look, NATIVE)} {...dialog} />;
	}
	const { native: _, ...div } = rest;
	return <div role="dialog" aria-modal="true" className={look} {...div} />;
}

export function DialogHeader({
	title,
	titleId,
	description,
	descriptionId,
	className,
	...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
	title: ReactNode;
	titleId?: string | undefined;
	description?: ReactNode;
	descriptionId?: string | undefined;
}) {
	return (
		<header className={cn("flex flex-col gap-2", className)} {...rest}>
			<h2 id={titleId} className="text-primary type-title [overflow-wrap:anywhere]">
				{title}
			</h2>
			{description === undefined ? null : (
				<p id={descriptionId} className="text-secondary type-body">
					{description}
				</p>
			)}
		</header>
	);
}

/** The dialog's content: fields, a list. A `notice` under it says what failed. */
export function DialogBody({
	notice,
	className,
	children,
	...rest
}: HTMLAttributes<HTMLDivElement> & { notice?: ReactNode }) {
	return (
		<div className={cn("flex min-h-0 flex-col gap-3 pt-5", className)} {...rest}>
			{children}
			{notice === undefined || notice === null ? null : (
				<p role="alert" className="text-danger-strong type-body">
					{notice}
				</p>
			)}
		</div>
	);
}

/** The answers, at the end of the line, 8px apart: the way out first, the act last. */
export function DialogFooter({ className, ...rest }: HTMLAttributes<HTMLElement>) {
	return <footer className={cn("flex items-center justify-end gap-2 pt-6", className)} {...rest} />;
}

/* ------------------------------------------------------------------ Sheet -- */

export interface SheetProps extends Omit<ComponentProps<"div">, "title"> {
	title: ReactNode;
	/** at the head's end, in detail mono: `esc closes` */
	hint?: ReactNode | undefined;
}

/**
 * A room over the canvas: sheet wide, radius lg, the panel fill at elevation 3.
 * A bar-tall head with its title and a hint, a body that scrolls, every part
 * inset 24px.
 */
export function Sheet({ title, hint, className, children, ...rest }: SheetProps) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			className={cn(
				"flex w-sheet max-w-full animate-find-panel-in flex-col overflow-hidden rounded-lg text-primary",
				MODAL,
				className,
			)}
			{...rest}
		>
			<header className="flex h-bar shrink-0 items-center justify-between gap-4 border-line-default border-b px-6">
				<h2 className="truncate text-primary type-title">{title}</h2>
				{hint === undefined ? null : <span className="shrink-0 text-secondary type-detail">{hint}</span>}
			</header>
			<ScrollArea className="flex-1 px-6 pt-5 pb-8">{children}</ScrollArea>
		</div>
	);
}

/* ---------------------------------------------------------------- Palette -- */

export interface PaletteProps extends Omit<ComponentProps<"div">, "onChange"> {
	/** the key that summoned it, left as the prompt */
	prompt?: string | undefined;
	/** the field: value, placeholder, onChange and the rest go to the input */
	input?: ComponentProps<"input"> | undefined;
	/** at the field's end in detail mono: `3 of 12` */
	status?: ReactNode | undefined;
	/** the key hints along the foot */
	hints?: readonly ReactNode[] | undefined;
	/** the list's most height before it scrolls and fades */
	listHeight?: string | undefined;
}

/**
 * The find palette's shell: a mono field headed by the key that opened it, a
 * list of rows that scrolls and fades at its foot, a status line of keys. The
 * panel fill at elevation 3, radius lg; the field is bar tall.
 */
export function Palette({
	prompt = "/",
	input,
	status,
	hints,
	listHeight = "calc(var(--spacing-row) * 7.5 + var(--spacing) * 3)",
	className,
	children,
	...rest
}: PaletteProps) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			className={cn(
				// no palette width token yet; 560 is the finder's
				"flex w-[560px] max-w-full animate-find-panel-in flex-col overflow-hidden rounded-lg",
				MODAL,
				className,
			)}
			{...rest}
		>
			<label className="flex h-bar shrink-0 items-center gap-3 border-line-default border-b px-4">
				<span className="shrink-0 text-tertiary type-code-input">{prompt}</span>
				<input
					spellCheck={false}
					autoComplete="off"
					{...input}
					className={cn(
						"min-w-0 flex-1 bg-transparent text-primary caret-accent outline-none placeholder:text-tertiary type-code-input",
						input?.className,
					)}
				/>
				{status === undefined ? null : (
					<span className="flex shrink-0 items-center gap-2 text-secondary type-detail">{status}</span>
				)}
			</label>
			<ScrollArea role="listbox" className="py-1.5" style={{ maxHeight: listHeight }}>
				{children}
			</ScrollArea>
			{hints === undefined ? null : (
				<StatusLine className="justify-start gap-5">
					{hints.map((hint, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: hints are positional
						<span key={index}>{hint}</span>
					))}
				</StatusLine>
			)}
		</div>
	);
}

/** The line a palette shows when nothing answers: machine text, verbatim. */
export function PaletteEmpty({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("flex h-row items-center px-4 text-secondary type-value", className)} {...rest} />;
}
