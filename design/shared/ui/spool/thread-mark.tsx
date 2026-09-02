import { motion, useReducedMotion } from "motion/react";
import type { Life } from "shared/lib/spool/agent-threads";
import { cn } from "shared/lib/utils";

/**
 * What a thread is doing, in the smallest thing that can say it.
 *
 * The rail already decided that state is motion rather than colour, and that the
 * one accent belongs to the selection, so a thread working somewhere else turns
 * and a thread nobody has read is a solid dot. Neither of them is red.
 *
 * The box is always 14px whatever is inside it, so a strip of threads, a list of
 * them and a page row all align on the same left edge and a mark appearing never
 * moves the name beside it.
 *
 * **Three readings, since #161 added the one that waits.** A thread stopped on a
 * question, or bounced off a login, is not working and is not finished: it is frozen
 * until a person comes back, and it is the only state here that is certainly costing
 * nothing. It draws as `unread`'s disc held inside `working`'s ring — the turn that
 * stopped, with the thing that stopped it sitting in it.
 *
 * Two things forced that drawing and neither is taste. **Motion is spoken for**, so
 * waiting cannot move — but it cannot be *working standing still* either, because
 * `prefers-reduced-motion` already renders working as a still ring and arc, so a
 * frozen spinner would be the working mark with a second meaning for every
 * reduced-motion user. And it cannot borrow the disc alone: **the disc clears when
 * you open the thread** and this does not clear until you answer, so a strip that
 * spent the disc on it would go quiet about a thread that will never finish, which
 * is the one case the strip exists for. What is left has to differ from both in
 * shape, and being louder than both is right rather than a cost — a waiting thread
 * is the only one of the three that is actually stuck.
 *
 * The losing candidates are drawn at ship size on `agent-nav-marks--held`.
 */

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
					animate={still ? undefined : { rotate: 360 }}
					transition={still ? undefined : SPIN}
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
