import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CAPTURED_NOW, type RateLimitInfo, limitLever, limitReadout, limitSentence } from "../lib/agent-limit";
import { cn } from "../lib/utils";

/**
 * Two homes for one fact, drawn so they can be compared instead of argued about.
 *
 * Neither one takes the thread accent, and that is deliberate rather than
 * timid. There is exactly one colour in this product and it means "this chip and
 * that box out there are the same object". Spending it on a warning would break
 * the only thing it says. A usage window earns attention by *existing* — it is
 * absent below the binary's own threshold and nowhere near the eye until then —
 * so it never has to shout, and a surface that has to shout was always going to
 * become chrome.
 */

/** the footer's own voice, so the line reads as one line */
const QUIET = "font-mono text-2xs leading-3";

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * The readout, beside the model.
 *
 * They are the same class of fact and they belong in the same sentence: which
 * machine is answering, and how much of it is left. Both are about the engine
 * rather than the work, and neither is a control.
 *
 * The whole argument for this being the home rather than a strip is one line from
 * the binary. Its own advice at a weekly limit is `try /model sonnet · ~2×
 * runway`, and at a refusal it is `Switch models to keep working.` — the remedy
 * for running out is a model switch, every time. The CLI has to write that as a
 * sentence because its composer has nothing to point at. Spool's composer has the
 * menu, eight pixels to the left. So the fact lands next to the lever and the
 * advice deletes itself.
 *
 * It arrives rather than appearing, once, and then it does not move again for
 * however many turns the window has left in it.
 */
export function LimitLine({ info, now = CAPTURED_NOW }: { info: RateLimitInfo; now?: number }) {
	const still = useReducedMotion() === true;
	const line = limitReadout(info, now);
	return (
		<AnimatePresence initial={false}>
			{line === null ? null : (
				<motion.span
					key={info.status}
					initial={still ? false : { opacity: 0, y: 3 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0 }}
					transition={{ duration: still ? 0 : 0.32, ease: ARRIVE }}
					className={cn(
						QUIET,
						// truncates rather than shrinking, because the thing it shares the
						// line with is a control and a wrapped model name is worse than a
						// clipped reset
						"min-w-0 truncate",
						// brightness rather than hue: reached steps forward without becoming
						// a second accent, and a warning stays a peer of the model beside it
						info.status === "rejected" ? "text-text/70" : "text-muted/45",
					)}
				>
					{line}
				</motion.span>
			)}
		</AnimatePresence>
	);
}

/**
 * The same fact given the plan's slot, so the loud version can be looked at once.
 *
 * It is the honest maximum: the binary's whole sentence, and its own lever as
 * something clickable rather than something to retype. Everything wrong with it
 * is structural rather than a matter of degree.
 *
 * It sits where the plan sits, and a plan and a limit are both true across a
 * turn, so the two of them stack and the transcript starts the session two rows
 * further down. It is loudest at the moment it has least to add — the strip is
 * biggest at 76%, where nothing has happened yet. And it puts a remedy on screen
 * that the footer already offers as a menu, so the advice and the control are two
 * different things saying one thing.
 *
 * The case for it: nobody misses it, and the ticket's whole worry is a developer
 * who does not know these windows exist watching the agent stop for no reason
 * they can see.
 */
export function LimitStrip({
	info,
	model,
	effort,
	now = CAPTURED_NOW,
	onLever,
}: {
	info: RateLimitInfo;
	model: string;
	effort: string;
	now?: number;
	onLever?: ((text: string) => void) | undefined;
}) {
	const still = useReducedMotion() === true;
	if (info.status === "allowed") return null;
	const lever = limitLever(info, model, effort);
	return (
		<motion.div
			initial={still ? false : { opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: "auto" }}
			transition={{ duration: still ? 0 : 0.32, ease: ARRIVE }}
			className="overflow-hidden border-border border-b"
		>
			{/* the sentence and the lever stack rather than share a line, because at
			    420px they do not fit beside each other and truncating "weekly limit"
			    out of a warning about the weekly limit is not a tighter design. Two
			    rows is what this costs, and the strip should be honest about it */}
			<div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5">
				<span className={cn(QUIET, "text-text/70 leading-4")}>{limitSentence(info, now)}</span>
				{lever === null || onLever === undefined ? null : (
					<button
						type="button"
						onClick={() => onLever(lever.replace(/^try /, ""))}
						className={cn(
							QUIET,
							"rounded-xs border border-border-raised px-1.5 py-1 text-muted transition-colors duration-150 hover:text-text",
						)}
					>
						{lever}
					</button>
				)}
			</div>
		</motion.div>
	);
}
