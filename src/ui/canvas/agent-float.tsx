import { Fragment, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { FADE_OUT_MS, useLeaving } from "./agent-motion";

/**
 * What floats over the rail (#364): one step up from the window the rail is drawn in, on
 * a hairline and a soft shadow. Never the raised grey, and never the accent.
 */
export const FLOAT = "rounded-md border border-border bg-surface shadow-agent-float";

/**
 * A float that comes and goes: it rises off the composer (`up`) or drops from the header
 * (`down`), and leaves the way it came. While it leaves it is inert, so nothing in it can
 * be pressed or read as present.
 */
export function Float({
	open,
	from,
	className,
	children,
}: {
	open: boolean;
	from: "up" | "down";
	className?: string | undefined;
	children: ReactNode;
}) {
	const shown = useLeaving(open);
	if (shown === null) return null;
	const leaving = shown === "leaving";
	return (
		<div
			inert={leaving}
			aria-hidden={leaving || undefined}
			data-float={from}
			data-leaving={leaving ? "" : undefined}
			className={cn(
				FLOAT,
				from === "up"
					? leaving
						? "animate-agent-float-out"
						: "animate-agent-float-in"
					: leaving
						? "animate-agent-drop-out"
						: "animate-agent-drop-in",
				from === "up" ? "origin-bottom" : "origin-top",
				className,
			)}
		>
			{children}
		</div>
	);
}

/** what a rail menu's trigger takes onto itself; the look and the words are the caller's */
export interface RailMenuTrigger {
	readonly ref: RefObject<HTMLButtonElement | null>;
	readonly "aria-haspopup": "menu" | "dialog";
	readonly "aria-expanded": boolean;
	readonly onClick: () => void;
	readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** what a keyboard can reach in an open menu: never a control on its way out */
const REACHABLE = "button:not(:disabled):not([inert] *), input:not([inert] *)";

/**
 * A popover off a control in the rail (#364): the trigger, a backdrop that closes it on a
 * press anywhere else, and the float itself, rising off the composer or dropping from the
 * header.
 *
 * Opening puts the keys in it: a field first, then the checked item, then the first. A menu
 * walks its controls on the arrows, Home and End, and goes on Escape or Tab; a dialog goes
 * on Escape. Closing hands focus back to the trigger, but only from inside or from nowhere,
 * so whatever was pressed meanwhile keeps the focus it took.
 */
export function RailMenu({
	open,
	onOpen,
	from = "up",
	role = "menu",
	label,
	trigger,
	className,
	panel,
	busy,
	children,
}: {
	open: boolean;
	onOpen: (open: boolean) => void;
	from?: "up" | "down";
	role?: "menu" | "dialog";
	/** what the float is called, to a screen reader and on its backdrop */
	label: string;
	trigger: (props: RailMenuTrigger) => ReactNode;
	/** where the float stands, against the nearest positioned box */
	className?: string | undefined;
	/** the panel's own data marks */
	panel?: Readonly<Record<`data-${string}`, string | undefined>> | undefined;
	/** something it started is still out */
	busy?: boolean | undefined;
	children: ReactNode;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const was = useRef(open);
	useEffect(() => {
		const before = was.current;
		was.current = open;
		if (open && !before) {
			const box = body.current;
			const target =
				box?.querySelector<HTMLInputElement>("input") ??
				box?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
				box?.querySelector<HTMLButtonElement>("button");
			target?.focus({ preventScroll: true });
		}
		if (!open && before) {
			const at = document.activeElement;
			if (at === null || at === document.body || body.current?.contains(at))
				ref.current?.focus({ preventScroll: true });
		}
	}, [open]);
	return (
		<>
			{open ? (
				<button
					type="button"
					tabIndex={-1}
					aria-label={`close the ${label.toLowerCase()}`}
					className="fixed inset-0 z-10 cursor-default"
					onClick={() => onOpen(false)}
				/>
			) : null}
			{trigger({
				ref,
				"aria-haspopup": role,
				"aria-expanded": open,
				onClick: () => onOpen(!open),
				onKeyDown: (event) => {
					if (role !== "menu" || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
					event.preventDefault();
					onOpen(true);
				},
			})}
			<Float open={open} from={from} className={className}>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: its role is the caller's, a menu or a dialog */}
				{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a menu and a dialog both take a label */}
				<div
					{...panel}
					ref={body}
					role={role}
					aria-busy={busy || undefined}
					aria-label={label}
					onKeyDown={(event) => {
						if (event.key === "Escape" || (role === "menu" && event.key === "Tab")) {
							event.preventDefault();
							event.stopPropagation();
							onOpen(false);
							return;
						}
						if (role !== "menu" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
						event.preventDefault();
						const controls = [...(body.current?.querySelectorAll<HTMLElement>(REACHABLE) ?? [])];
						const at =
							document.activeElement instanceof HTMLElement ? controls.indexOf(document.activeElement) : -1;
						const next =
							event.key === "Home"
								? 0
								: event.key === "End"
									? controls.length - 1
									: (at + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
						controls[next]?.focus();
					}}
					className="flex flex-col"
				>
					{children}
				</div>
			</Float>
		</>
	);
}

/** A thing in the rail's own flow that fades in and out rather than appearing (#364). */
export function Fade({
	open,
	className,
	children,
	...data
}: {
	open: boolean;
	className?: string | undefined;
	children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
	const shown = useLeaving(open, FADE_OUT_MS);
	if (shown === null) return null;
	const leaving = shown === "leaving";
	return (
		<div
			{...data}
			inert={leaving}
			aria-hidden={leaving || undefined}
			className={cn(leaving ? "animate-agent-fade-out" : "animate-agent-fade-in", className)}
		>
			{children}
		</div>
	);
}

/** Opens and closes by its own height on a grid track, fading as it goes. */
export function Reveal({
	open,
	children,
	className,
}: {
	open: boolean;
	children: ReactNode;
	className?: string | undefined;
}) {
	return (
		<div
			inert={!open}
			aria-hidden={!open || undefined}
			className={cn(
				"grid transition-[grid-template-rows,opacity] duration-[160ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none",
				open ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
			)}
		>
			<div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
		</div>
	);
}

/** where each period of a dotted version sits in a name: "Opus 5.5" → {6} */
function versionPeriods(name: string): ReadonlySet<number> {
	const periods = new Set<number>();
	for (const version of name.matchAll(/\d+(?:\.\d+)+/g))
		for (let at = 0; at < version[0].length; at++) if (version[0][at] === ".") periods.add(version.index + at);
	return periods;
}

/**
 * A model's name with its version kept legible (#364).
 *
 * At control size the font draws the period as a dot with a pixel either side, so
 * "Opus 5.5" reads as "Opus 55". Every dotted version is drawn with its periods at weight
 * 700 and 0.08em either side; the words around it are untouched. `hit` is what a search
 * found in the name, marked where it stands, and the versions stay legible through it.
 */
export function Versioned({
	name,
	hit = "",
	className,
}: {
	name: string;
	hit?: string | undefined;
	className?: string | undefined;
}) {
	const periods = versionPeriods(name);
	const q = hit.trim().toLowerCase();
	const from = q === "" ? -1 : name.toLowerCase().indexOf(q);
	const to = from < 0 ? -1 : from + q.length;
	// runs of plain text, each period alone, and whether the search found each
	const runs: { text: string; period: boolean; marked: boolean }[] = [];
	for (let at = 0; at < name.length; at++) {
		const period = periods.has(at);
		const marked = at >= from && at < to;
		const last = runs.at(-1);
		if (last !== undefined && !period && !last.period && last.marked === marked) last.text += name[at];
		else runs.push({ text: name[at] ?? "", period, marked });
	}
	const drawn = (run: (typeof runs)[number], key: number) =>
		run.period ? (
			<span key={key} data-version-period="" style={{ fontWeight: 700, marginInline: "0.08em" }}>
				.
			</span>
		) : (
			<Fragment key={key}>{run.text}</Fragment>
		);
	// the marked runs are one stretch, so they are one mark
	const first = runs.findIndex((run) => run.marked);
	const last = first + runs.filter((run) => run.marked).length - 1;
	return (
		<span data-versioned="" className={className}>
			{first < 0 ? (
				runs.map(drawn)
			) : (
				<>
					{runs.slice(0, first).map(drawn)}
					<mark className="rounded-[2px] bg-raised text-text">
						{runs.slice(first, last + 1).map((run, at) => drawn(run, first + at))}
					</mark>
					{runs.slice(last + 1).map((run, at) => drawn(run, last + 1 + at))}
				</>
			)}
		</span>
	);
}

/**
 * A command to paste in a terminal: verbatim mono on an inset, and a copy at its end
 * that turns to a check once the clipboard has it. A clipboard that refuses says so, and
 * the line stays there to select by hand.
 */
export function CommandLine({ command, label }: { command: string; label?: string | undefined }) {
	const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
	return (
		<div className="flex flex-col gap-1">
			<div
				data-agent-command={command}
				className="flex min-h-7 min-w-0 items-center gap-2 rounded-sm border border-border bg-bg pr-1 pl-2"
			>
				<code className="min-w-0 flex-1 select-all break-all py-1 text-text type-detail">{command}</code>
				<button
					type="button"
					aria-label={copied === "copied" ? "Copied" : (label ?? `Copy ${command}`)}
					onClick={() => {
						const clipboard = navigator.clipboard;
						if (clipboard === undefined) return setCopied("failed");
						void clipboard.writeText(command).then(
							() => setCopied("copied"),
							() => setCopied("failed"),
						);
					}}
					className="flex h-6 shrink-0 items-center rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-raised hover:text-text type-caption"
				>
					{copied === "copied" ? <CheckIcon className="h-3 w-3" /> : "Copy"}
				</button>
			</div>
			{copied === "failed" ? (
				<span role="alert" className="text-muted type-caption">
					Could not copy. Select the line and copy it.
				</span>
			) : null}
		</div>
	);
}

/** a small chevron pointing down, turned over while what it opens is open */
export function Chevron({ open, className }: { open: boolean; className?: string | undefined }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn(
				"h-2.5 w-2.5 shrink-0 transition-transform duration-[160ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none",
				open && "rotate-180",
				className,
			)}
		>
			<path
				d="m3 4.5 3 3 3-3"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
