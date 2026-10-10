// Feedback primitives: what the app says back. Toast for one line that just
// happened, with Progress for work in flight and Drain for an undo window
// closing along its foot, and EmptyState for nothing yet.
//
// Interactive parts (a toast's action) pair the real pseudo-class with
// `data-state="hover|active|focus"` so a sheet can force one; app states ride
// `data-working` and `data-error`. Every root spreads `...rest`.

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "../cn";
import { CloseIcon, PlusIcon } from "../icons";
import { Kbd } from "./display";

type Forced = "hover" | "active" | "focus";

/* ------------------------------------------------------- Progress, Drain -- */

/**
 * Work along a toast's foot. With a `value` (0 to 1) the hairline fills from
 * the left and eases to each new value; without one a third of it sweeps
 * across, because motion is what says the work is still running.
 */
export function Progress({
	value,
	label,
	className,
	...rest
}: ComponentProps<"div"> & { value?: number | undefined; label?: string | undefined }) {
	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}
			data-working={value === undefined ? "" : undefined}
			className={cn("absolute inset-x-0 bottom-0 h-px overflow-hidden", className)}
			{...rest}
		>
			{value === undefined ? (
				<span className="absolute inset-y-0 left-0 w-1/3 animate-toast-sweep bg-accent" />
			) : (
				<span
					className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-slow ease-out"
					style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }}
				/>
			)}
		</div>
	);
}

/**
 * The undo window closing: a full hairline that shrinks to nothing from the
 * right over `duration`, linear, because time passes at one rate. Always the
 * thread, since it is the clock on a destructive act.
 */
export function Drain({
	duration,
	className,
	style,
	...rest
}: ComponentProps<"span"> & {
	/** ms */
	duration: number;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn("absolute inset-x-0 bottom-0 block h-px origin-left animate-toast-drain bg-accent", className)}
			style={{ animationDuration: `${duration}ms`, ...style }}
			{...rest}
		/>
	);
}

/* ------------------------------------------------------------ TextAction -- */

/**
 * The act inside a toast: words in the thread at medium weight, with a raised
 * wash under them on hover. The one place a thread word is a button. With an
 * `href` it is a link that opens outside the app.
 */
export function TextAction({
	href,
	className,
	children,
	type = "button",
	...rest
}: ComponentProps<"button"> & { href?: string | undefined; "data-state"?: Forced | undefined }) {
	const look = cn(
		"inline-flex h-control-sm shrink-0 items-center whitespace-nowrap rounded-xs px-1.5 font-medium text-accent-strong focus-ring type-control",
		"transition-[background-color] duration-fast ease-out",
		"hover:bg-state-hover-raised data-[state=hover]:bg-state-hover-raised",
		"active:bg-state-pressed data-[state=active]:bg-state-pressed",
		"data-[state=focus]:outline-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-offset-2 data-[state=focus]:outline-solid",
		"disabled:cursor-default disabled:opacity-40",
		className,
	);
	if (href !== undefined)
		return (
			<a href={href} target="_blank" rel="noreferrer" className={look} {...(rest as ComponentProps<"a">)}>
				{children}
			</a>
		);
	return (
		<button type={type} className={look} {...rest}>
			{children}
		</button>
	);
}

/* ---------------------------------------------------------------- Toast -- */

export type ToastTone = "default" | "error";

/**
 * One line about something that just happened, said once and gone. A raised
 * pill at radius md that floats, so it wears the float shadow; 40 tall, parts
 * `gap-3` apart, never wider than `w-toast`. In order: message (danger ink
 * when `error`) · detail (mono, secondary) · a hairline · action · keys ·
 * dismiss. A thread line along its foot says time (`drain`, ms) or work
 * (`progress`, a value or `true` for a sweep). The caller places it.
 */
export function Toast({
	message,
	detail,
	action,
	keys,
	tone = "default",
	drain,
	progress,
	onDismiss,
	className,
	...rest
}: Omit<ComponentProps<"div">, "children"> & {
	message: ReactNode;
	detail?: ReactNode;
	/** one or more TextActions */
	action?: ReactNode;
	keys?: string | undefined;
	tone?: ToastTone | undefined;
	drain?: number | undefined;
	progress?: number | true | undefined;
	onDismiss?: (() => void) | undefined;
}) {
	const tail = action !== undefined || keys !== undefined;
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			data-error={tone === "error" ? "" : undefined}
			data-working={progress === undefined ? undefined : ""}
			className={cn(
				"relative inline-flex min-h-10 max-w-toast items-center gap-3 overflow-hidden rounded-md border border-line-strong bg-surface-raised px-4 py-1 shadow-float",
				"animate-toast-in",
				className,
			)}
			{...rest}
		>
			<span className={cn("min-w-0 grow type-control", tone === "error" ? "text-danger-strong" : "text-primary")}>
				{message}
			</span>
			{detail === undefined ? null : <span className="min-w-0 truncate text-secondary type-value">{detail}</span>}
			{detail !== undefined && tail ? (
				<span aria-hidden="true" className="h-4 w-px shrink-0 bg-line-strong" />
			) : null}
			{action}
			{keys === undefined ? null : <Kbd>{keys}</Kbd>}
			{onDismiss === undefined ? null : (
				<button
					type="button"
					aria-label="Dismiss"
					onClick={onDismiss}
					className={cn(
						"-mr-1 flex size-control-xs shrink-0 items-center justify-center rounded-xs text-tertiary focus-ring",
						"transition-colors duration-fast ease-out hover:bg-state-hover-raised hover:text-primary",
					)}
				>
					<CloseIcon />
				</button>
			)}
			{drain === undefined ? null : <Drain duration={drain} />}
			{progress === undefined ? null : <Progress value={progress === true ? undefined : progress} />}
		</div>
	);
}

/* ----------------------------------------------------------- EmptyState -- */

/**
 * Nothing here yet, and what to do about it, filling a window's body: the
 * page title, a control-size sentence under it, actions `gap-3` apart below.
 * Art, when there is some, stands above with its own space under it. Centred
 * by default; `start` aligns it left. The title is a heading, `h2` unless the
 * empty state is the whole page.
 */
export function EmptyState({
	art,
	title,
	description,
	actions,
	heading: Heading = "h2",
	align = "center",
	className,
	...rest
}: Omit<ComponentProps<"div">, "title"> & {
	art?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	heading?: "h1" | "h2" | undefined;
	align?: "center" | "start" | undefined;
}) {
	return (
		<div
			className={cn(
				"flex flex-col",
				align === "center" ? "items-center text-center" : "items-start text-left",
				className,
			)}
			{...rest}
		>
			{art === undefined ? null : <div className="pb-8">{art}</div>}
			<Heading className="text-primary type-page">{title}</Heading>
			{description === undefined ? null : (
				<p className="max-w-[44ch] pt-3 text-secondary type-control">{description}</p>
			)}
			{actions === undefined ? null : <div className="flex flex-wrap items-center gap-3 pt-6">{actions}</div>}
		</div>
	);
}

const FANNED: readonly CSSProperties[] = [
	{ transform: "rotate(-10deg) translateX(-12px)" },
	{ transform: "rotate(10deg) translateX(12px)" },
];

/**
 * The empty frames drawing: three frames fanned, the front one holding a
 * plus. Hairlines on the window, so it reads in both modes.
 */
export function EmptyFrames({ className, ...rest }: ComponentProps<"div">) {
	const frame = "absolute inset-0 rounded-[inherit] border border-line-strong bg-surface-window";
	return (
		<div aria-hidden="true" className={cn("relative h-16 w-21 rounded-md", className)} {...rest}>
			{FANNED.map((style) => (
				<i key={style.transform} className={frame} style={style} />
			))}
			<span className={cn(frame, "grid place-items-center text-tertiary *:size-5")}>
				<PlusIcon />
			</span>
		</div>
	);
}
