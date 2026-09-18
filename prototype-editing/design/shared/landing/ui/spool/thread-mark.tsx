import { motion, useReducedMotion } from "motion/react";
import type { Life } from "../../lib/spool/agent-threads";
import { cn } from "../../lib/utils";

const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

export function ThreadMark({ life, className }: { life: Life; className?: string | undefined }) {
	const still = useReducedMotion() === true;
	const turning = life === "streaming" || life === "running";
	return (
		<span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			{turning ? (
				<motion.svg
					viewBox="0 0 14 14"
					className="h-3.5 w-3.5 text-text/60"
					fill="none"
					aria-hidden="true"
					{...(still ? {} : { animate: { rotate: 360 }, transition: SPIN })}
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</motion.svg>
			) : life === "waiting" ? (
				// the same ring working turns, at rest and dimmed so the disc reads as the
				// thing in it rather than as a second object beside it (#161)
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
					<circle cx="7" cy="7" r="2.2" fill="currentColor" />
				</svg>
			) : life === "unread" ? (
				<span className="h-[5px] w-[5px] rounded-full bg-text/85" />
			) : null}
		</span>
	);
}
