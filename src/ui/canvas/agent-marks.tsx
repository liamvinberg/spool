import { cn } from "../cn";

/**
 * The agent's small marks (#161, #364, #366), drawn once: the ring with a disc in it while
 * something waits on a person, and the stroke a turn ends on (the ring that turns is the
 * system's SpinRing). Colourless, because state in the rail is motion and the accent is
 * the selection's; the colour and the size are the caller's.
 */

/** a mark's own data attributes, for the surface that wears it */
type Marked = Readonly<Record<`data-${string}`, string | undefined>>;

/** waiting on a person: the ring at rest, breathing, with a disc held in it; a className replaces its size and ink */
export function WaitingMark({ className, ...data }: { className?: string | undefined } & Marked) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			data-agent-waiting-mark=""
			{...data}
			className={cn("shrink-0", className ?? "h-3.5 w-3.5 text-primary")}
		>
			<circle className="animate-agent-breathe" cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.4" />
			<circle cx="6" cy="6" r="2.1" fill="currentColor" />
		</svg>
	);
}

/** how a turn or an ask ended: a check, a square for stopped, a cross for failed */
export function EndMark({
	ending,
	className,
}: {
	ending: "done" | "stopped" | "failed";
	className?: string | undefined;
}) {
	return (
		<svg
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
			data-agent-end-mark={ending}
			className={cn("h-3.5 w-3.5 shrink-0 text-secondary", className)}
		>
			{ending === "stopped" ? (
				<rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
			) : ending === "failed" ? (
				<path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			) : (
				<path d="M3.5 7.4 5.9 9.8 10.5 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			)}
		</svg>
	);
}
