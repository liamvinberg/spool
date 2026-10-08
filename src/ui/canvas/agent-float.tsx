import { type ReactNode, useState } from "react";
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

/** a name split into its words and its dotted versions: "Opus 5.5" → "Opus ", "5.5" */
const versionParts = (name: string) => name.split(/(\d+(?:\.\d+)+)/).filter((part) => part !== "");
const isVersion = (part: string) => /^\d+(?:\.\d+)+$/.test(part);

/**
 * A model's name with its version kept legible (#364).
 *
 * At control size the font draws the period as a dot with a pixel either side, so
 * "Opus 5.5" reads as "Opus 55". Every dotted version is drawn with its periods at weight
 * 700 and 0.08em either side; the words around it are untouched.
 */
export function Versioned({ name, className }: { name: string; className?: string | undefined }) {
	return (
		<span data-versioned="" className={className}>
			{versionParts(name).map((part, at) =>
				isVersion(part) ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: a name's own parts, in order
					<span key={at}>
						{part.split(".").map((digits, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a version's own digits, in order
							<span key={index}>
								{index > 0 ? (
									<span data-version-period="" style={{ fontWeight: 700, marginInline: "0.08em" }}>
										.
									</span>
								) : null}
								{digits}
							</span>
						))}
					</span>
				) : (
					part
				),
			)}
		</span>
	);
}

/**
 * A command to paste in a terminal: verbatim mono on an inset, and a copy at its end
 * that turns to a check once the clipboard has it.
 */
export function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div
			data-agent-command={command}
			className="flex min-h-7 min-w-0 items-center gap-2 rounded-sm border border-border bg-bg pr-1 pl-2"
		>
			<code className="min-w-0 flex-1 break-all py-1 text-text type-detail">{command}</code>
			<button
				type="button"
				aria-label={copied ? "Copied" : `Copy ${command}`}
				onClick={() => {
					void navigator.clipboard
						?.writeText(command)
						.then(() => setCopied(true))
						.catch(() => {});
				}}
				className="flex h-6 shrink-0 items-center rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-raised hover:text-text type-caption"
			>
				{copied ? <CheckIcon className="h-3 w-3" /> : "Copy"}
			</button>
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
