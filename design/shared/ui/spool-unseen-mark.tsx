import { AnimatePresence, motion } from "motion/react";
import type { Mark } from "../lib/unseen-model";
import { cn } from "../lib/utils";

/**
 * The mark, in the smallest thing that can carry it.
 *
 * It is not red. The one accent belongs to the selection, which is the rule
 * `ThreadMark` already settled for the agent's threads, and a canvas where six
 * frames wear the selection colour has no selection colour left. So: white ink,
 * two shapes.
 *
 * A **disc** is never seen. It is the same 5px disc a thread nobody has read
 * wears in the rail — one meaning, one shape, wherever unread appears in this app.
 *
 * A **ring** is seen once, moved since. Quieter than the disc on purpose: you
 * have met this frame, the news is smaller. Read against the disc it also says
 * something true about itself, which is that there is a hole where the version
 * you approved used to be.
 *
 * The box is always 14px whatever is in it, so a name never moves when a mark
 * appears beside it or clears, in the rail, in the palette and on a frame's own
 * label alike.
 */

export function UnseenMark({ mark, className }: { mark: Mark | null; className?: string | undefined }) {
	return (
		<span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)} aria-hidden="true">
			<AnimatePresence initial={false}>
				{mark === null ? null : (
					<motion.span
						key={mark}
						initial={{ opacity: 0, scale: 0.4 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.4 }}
						transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
						className={cn(
							"block rounded-full",
							mark === "new" ? "h-[5px] w-[5px] bg-text/85" : "h-[7px] w-[7px] border-[1.5px] border-text/70",
						)}
					/>
				)}
			</AnimatePresence>
		</span>
	);
}

/** the same two states as a word, for a row with the width to say it outright */
export function UnseenWord({ mark }: { mark: Mark }) {
	return (
		<motion.span
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="shrink-0 font-mono text-2xs text-text/70 leading-3"
		>
			{mark === "new" ? "new" : "edited"}
		</motion.span>
	);
}
